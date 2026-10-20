/* engine.js — the audio side of My Personal EQ Workbook.
 *
 * Carried over from EQ Trainer unchanged in substance: the Orfanidis peaking
 * EQ (as an AudioWorklet, BiquadFilterNode fallback), two chains A (target)
 * and B (yours) with loudness-matched make-up gain, the sample library in
 * IndexedDB, looping file / noise playback and live tab-audio capture.
 *
 * It talks to the page only through a few hooks the app defines:
 *   UI.play(playing)   UI.live(on, suppressed)   UI.source()   UI.side()
 *   notice(text)
 */

/* ═══════════════════════════════════════════════════════════
   DSP — Orfanidis (1997) analog-matched peaking design
   H(z) = (b0 + b1 z^-1 + b2 z^-2) / (1 + a1 z^-1 + a2 z^-2)
   Prescribes the Nyquist gain G1 from the analog prototype, so
   the bell does not "cramp" toward fs/2 the way the RBJ-cookbook
   biquad (Web Audio's BiquadFilterNode) does.
   ═══════════════════════════════════════════════════════════ */
const DSP_SRC = `
function orfa(f, gDb, q, fs){
  if(Math.abs(gDb) < 0.01 || f <= 0) return {b0:1,b1:0,b2:0,a1:0,a2:0};
  var PI = Math.PI;
  var G  = Math.pow(10, gDb/20), G0 = 1;
  var GB = Math.sqrt(G0*G);
  var w0 = 2*PI*f/fs;
  if(w0 > PI*0.995) w0 = PI*0.995;
  var Dw = w0/Math.max(0.05, q);
  var F   = Math.abs(G*G - GB*GB);
  var G00 = Math.abs(G*G - G0*G0);
  var F00 = Math.abs(GB*GB - G0*G0);
  if(F < 1e-12 || G00 < 1e-12) return {b0:1,b1:0,b2:0,a1:0,a2:0};
  var wp = (w0*w0 - PI*PI);
  var num = G0*G0*wp*wp + G*G*F00*PI*PI*Dw*Dw/F;
  var den = wp*wp + F00*PI*PI*Dw*Dw/F;
  var G1  = Math.sqrt(num/den);
  var G01 = Math.abs(G*G  - G0*G1);
  var G11 = Math.abs(G*G  - G1*G1);
  var F01 = Math.abs(GB*GB - G0*G1);
  var F11 = Math.abs(GB*GB - G1*G1);
  if(F11 < 1e-12) F11 = 1e-12;
  var W2 = Math.sqrt(G11/G00) * Math.pow(Math.tan(w0/2), 2);
  var DW = (1 + Math.sqrt(F00/F11)*W2) * Math.tan(Dw/2);
  var C  = F11*DW*DW - 2*W2*(F01 - Math.sqrt(F00*F11));
  var D  = 2*W2*(G01 - Math.sqrt(G00*G11));
  var A  = Math.sqrt(Math.max(0,(C + D)/F));
  var B  = Math.sqrt(Math.max(0,(G*G*C + GB*GB*D)/F));
  var d  = 1 + W2 + A;
  return {
    b0:( G1 + G0*W2 + B)/d,
    b1:-2*((G1 - G0*W2)/d),
    b2:( G1 - B + G0*W2)/d,
    a1:-2*((1 - W2)/d),
    a2:( 1 + W2 - A)/d
  };
}
function bpf(f, q, fs){
  var w0 = 2*Math.PI*f/fs;
  if(w0 > Math.PI*0.995) w0 = Math.PI*0.995;
  var al = Math.sin(w0)/(2*Math.max(0.05,q)), a0 = 1 + al;
  return {b0:al/a0, b1:0, b2:-al/a0, a1:(-2*Math.cos(w0))/a0, a2:(1-al)/a0};
}
`;
eval(DSP_SRC);   // orfa() / bpf() into main-thread scope

function magDb(c, w){
  const cw=Math.cos(w), sw=Math.sin(w), c2=Math.cos(2*w), s2=Math.sin(2*w);
  const nr=c.b0 + c.b1*cw + c.b2*c2, ni=-(c.b1*sw + c.b2*s2);
  const dr=1 + c.a1*cw + c.a2*c2,    di=-(c.a1*sw + c.a2*s2);
  return 10*Math.log10((nr*nr+ni*ni)/(dr*dr+di*di) || 1e-12);
}

/* ── AudioWorklet processor ── */
const WORKLET_SRC = DSP_SRC + `
class EQProc extends AudioWorkletProcessor {
  constructor(){
    super();
    this.N = 4;
    this.p = []; this.t = []; this.co = []; this.pc = []; this.st = [];
    for(let i=0;i<this.N;i++){
      this.p.push({lf:Math.log(1000), g:0, q:1.4});
      this.t.push({lf:Math.log(1000), g:0, q:1.4});
      this.co.push({b0:1,b1:0,b2:0,a1:0,a2:0});
      this.pc.push({b0:1,b1:0,b2:0,a1:0,a2:0});
      this.st.push([{x1:0,x2:0,y1:0,y2:0},{x1:0,x2:0,y1:0,y2:0}]);
    }
    this.mk = 1; this.mkT = 1; this.solo = -1;
    this.port.onmessage = e => {
      const d = e.data;
      if(d.bands) for(let i=0;i<this.N;i++){
        const b = d.bands[i] || {f:1000,g:0,q:1.4};
        this.t[i].lf = Math.log(Math.max(10, b.f));
        this.t[i].g = b.g; this.t[i].q = b.q;
      }
      if(d.makeup !== undefined) this.mkT = d.makeup;
      if(d.solo   !== undefined) this.solo = d.solo;
    };
  }
  process(inputs, outputs){
    const inp = inputs[0], out = outputs[0];
    const n = out[0].length, nCh = out.length;
    if(!inp || !inp.length || !inp[0]){
      for(let c=0;c<nCh;c++) out[c].fill(0);
      return true;
    }
    for(let c=0;c<nCh;c++) out[c].set(inp[Math.min(c, inp.length-1)]);

    const a = Math.exp(-n/(sampleRate*0.020));     // 20 ms parameter glide
    for(let i=0;i<this.N;i++){
      const p=this.p[i], t=this.t[i];
      p.lf = t.lf + (p.lf-t.lf)*a;
      p.g  = t.g  + (p.g -t.g )*a;
      p.q  = t.q  + (p.q -t.q )*a;
      this.pc[i] = this.co[i];
      if(this.solo >= 0){
        this.co[i] = (i < 2)
          ? bpf(Math.exp(this.p[this.solo].lf), 3.2, sampleRate)
          : {b0:1,b1:0,b2:0,a1:0,a2:0};
      } else {
        this.co[i] = orfa(Math.exp(p.lf), p.g, p.q, sampleRate);
      }
    }
    for(let i=0;i<this.N;i++){
      const q=this.pc[i], c=this.co[i];
      if(q.b0===1&&q.b1===0&&q.b2===0&&q.a1===0&&q.a2===0&&
         c.b0===1&&c.b1===0&&c.b2===0&&c.a1===0&&c.a2===0) continue;
      const db0=c.b0-q.b0, db1=c.b1-q.b1, db2=c.b2-q.b2, da1=c.a1-q.a1, da2=c.a2-q.a2;
      for(let ch=0; ch<nCh; ch++){
        const s = this.st[i][ch], buf = out[ch];
        let x1=s.x1, x2=s.x2, y1=s.y1, y2=s.y2;
        for(let k=0;k<n;k++){
          const t=(k+1)/n;
          const b0=q.b0+db0*t, b1=q.b1+db1*t, b2=q.b2+db2*t,
                a1=q.a1+da1*t, a2=q.a2+da2*t;
          const x = buf[k] + 1e-20;
          const y = b0*x + b1*x1 + b2*x2 - a1*y1 - a2*y2;
          x2=x1; x1=x; y2=y1; y1=y;
          buf[k]=y;
        }
        s.x1=x1; s.x2=x2; s.y1=y1; s.y2=y2;
      }
    }
    const gTgt = this.solo>=0 ? 4 : this.mkT;
    const ka = Math.exp(-1/(sampleRate*0.015));
    for(let k=0;k<n;k++){
      this.mk = gTgt + (this.mk-gTgt)*ka;
      for(let c=0;c<nCh;c++) out[c][k] *= this.mk;
    }
    return true;
  }
}
registerProcessor('eqproc', EQProc);
`;

/* ═══════════════════ AUDIO GRAPH ═══════════════════ */
const AC = new (window.AudioContext||window.webkitAudioContext)({latencyHint:'interactive'});
const FS = AC.sampleRate;
const limiter = AC.createDynamicsCompressor();
limiter.threshold.value = -3; limiter.knee.value = 6; limiter.ratio.value = 14;
limiter.attack.value = 0.003; limiter.release.value = 0.12;
const master = AC.createGain(); master.gain.value = 0.36;
limiter.connect(master); master.connect(AC.destination);
const setVolume = v => { master.gain.value = Math.pow(v/100, 2); };

let WL = false;

function makeChain(){
  const out = AC.createGain(); out.connect(limiter);
  if(WL){
    const node = new AudioWorkletNode(AC, 'eqproc', {
      numberOfInputs:1, numberOfOutputs:1, outputChannelCount:[2],
      channelCount:2, channelCountMode:'explicit', channelInterpretation:'speakers'
    });
    node.connect(out);
    return {wl:true, node, out, input:node, tap:node, bands:[], solo:-1};
  }
  const filters=[];
  for(let i=0;i<4;i++){
    const f=AC.createBiquadFilter();
    f.type='peaking'; f.frequency.value=1000; f.Q.value=1.4; f.gain.value=0;
    filters.push(f);
  }
  for(let i=0;i<3;i++) filters[i].connect(filters[i+1]);
  const makeup=AC.createGain();
  filters[3].connect(makeup); makeup.connect(out);
  return {wl:false, filters, makeup, out, input:filters[0], tap:makeup, bands:[], solo:-1};
}

const NF=200, fBins=new Float32Array(NF);
for(let i=0;i<NF;i++) fBins[i]=20*Math.pow(1000,i/(NF-1));

function bandsResponseDb(bands, freqs, out){
  const res = out || new Float32Array(freqs.length);
  res.fill(0);
  for(const b of bands){
    if(!b || Math.abs(b.g) < 0.01) continue;
    const c = orfa(b.f, b.g, b.q, FS);
    for(let i=0;i<freqs.length;i++) res[i] += magDb(c, 2*Math.PI*freqs[i]/FS);
  }
  return res;
}
/* both chains are normalised to the same RMS gain over the band, so A/B
   switching compares colour, never level */
function makeupFor(bands){
  let s=0;
  const db = bandsResponseDb(bands, fBins);
  for(let i=0;i<NF;i++){ const m=Math.pow(10, db[i]/20); s += m*m; }
  return 1/Math.sqrt(s/NF || 1);
}
function setBands(ch, bands){
  ch.bands = bands.slice(0,4);
  if(ch.wl){
    ch.node.port.postMessage({
      bands: ch.bands.map(b=>({f:b.f, g:b.g, q:b.q})),
      makeup: makeupFor(ch.bands), solo: -1
    });
  } else {
    const t = AC.currentTime, T = 0.02;
    for(let i=0;i<4;i++){
      const b = ch.bands[i], f = ch.filters[i];
      f.type='peaking';
      if(b){
        f.frequency.setTargetAtTime(Math.max(20,Math.min(20000,b.f)), t, T);
        f.Q.setTargetAtTime(Math.max(.1,b.q), t, T);
        f.gain.setTargetAtTime(b.g, t, T);
      } else f.gain.setTargetAtTime(0, t, T);
    }
    ch.makeup.gain.setTargetAtTime(makeupFor(ch.bands), t, T);
  }
}

let A, B, analyser=null, anaData=null, preTap=null;

/* ── source ── */
let buffer=null, srcNode=null, playing=false;
const bufCache = new Map();

function makeNoise(pink){
  const len = FS*5, buf = AC.createBuffer(1, len, FS), d = buf.getChannelData(0);
  let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
  for(let i=0;i<len;i++){
    const w = Math.random()*2-1;
    if(!pink){ d[i]=w*0.4; continue; }
    b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759;
    b2=0.96900*b2+w*0.1538520; b3=0.86650*b3+w*0.3104856;
    b4=0.55000*b4+w*0.5329522; b5=-0.7616*b5-w*0.0168980;
    d[i]=(b0+b1+b2+b3+b4+b5+b6+w*0.5362)*0.09;
    b6=w*0.115926;
  }
  return buf;
}
/* loop point cross-faded so a file loops without a click */
function makeSeamless(buf){
  const xf = Math.min(Math.floor(FS*0.04), Math.floor(buf.length/8));
  if(xf < 64) return buf;
  const len = buf.length - xf;
  const out = AC.createBuffer(buf.numberOfChannels, len, buf.sampleRate);
  for(let c=0;c<buf.numberOfChannels;c++){
    const src = buf.getChannelData(c), dst = out.getChannelData(c);
    dst.set(src.subarray(0, len));
    for(let i=0;i<xf;i++){
      const t=i/xf, w=Math.sin(t*Math.PI/2), v=Math.cos(t*Math.PI/2);
      dst[i] = src[i]*w + src[len+i]*v;
    }
  }
  return out;
}

/* ── transport: position tracking, seek, skip ── */
let playStart = 0, playOffset = 0, LOOPING = true;
const wrapPos = t => { const d = buffer ? buffer.duration : 0;
  return d ? ((t % d) + d) % d : 0; };
function curPos(){
  if(!buffer) return 0;
  return playing ? wrapPos(playOffset + (AC.currentTime - playStart)) : wrapPos(playOffset);
}
function stopAudio(keepPos){
  if(srcNode){
    if(!keepPos && playing) playOffset = curPos();
    try{srcNode.stop();}catch(e){}
    srcNode.disconnect(); srcNode=null;
  }
  playing=false; UI.play(false);
}
function startAudio(from){
  if(live || !buffer) return;   // live capture runs continuously; nothing to start
  if(AC.state==='suspended') AC.resume();
  const off = (from!==undefined) ? from : curPos();
  stopAudio(true);
  playOffset = wrapPos(off);
  srcNode = AC.createBufferSource();
  srcNode.buffer = buffer; srcNode.loop = LOOPING;
  /* not looping: at the end it stops and goes back to the start */
  const me = srcNode;
  srcNode.onended = () => { if (srcNode === me && !me.loop) { srcNode.disconnect(); srcNode = null; playing = false; playOffset = 0; UI.play(false); } };
  srcNode.connect(A.input); srcNode.connect(B.input);
  if(preTap) srcNode.connect(preTap);
  srcNode.start(0, playOffset);
  playStart = AC.currentTime;
  playing=true; UI.play(true);
}
const togglePlay = ()=> playing ? stopAudio() : startAudio();
const ensurePlaying = ()=>{ if(!playing) startAudio(); };
function doSeek(t){
  const p = wrapPos(t);
  if(playing) startAudio(p); else playOffset = p;
}
const skip = s => doSeek(curPos() + s);
const mmss = t => Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0');

let side='A';
function setSide(s){
  side = s;
  const t = AC.currentTime;
  A.out.gain.setTargetAtTime(s==='A'?1:0, t, 0.012);
  B.out.gain.setTargetAtTime(s==='B'?1:0, t, 0.012);
  UI.side();
}
/* silence both chains without losing which one was chosen (a live capture
   keeps streaming even when "paused") */
function muteChains(){
  const t=AC.currentTime;
  A.out.gain.setTargetAtTime(0,t,0.02); B.out.gain.setTargetAtTime(0,t,0.02);
}

/* ── sample library ── */
let db=null; const mem=[];
function openDB(){
  return new Promise(res=>{
    try{
      const q=indexedDB.open('eqtrainer',1);
      q.onupgradeneeded=e=>e.target.result.createObjectStore('samples',{keyPath:'name'});
      q.onsuccess=e=>res(e.target.result);
      q.onerror=()=>res(null); q.onblocked=()=>res(null);
    }catch(err){ res(null); }
  });
}
function dbAll(){
  return new Promise(res=>{
    if(!db) return res(mem);
    try{ const r=db.transaction('samples').objectStore('samples').getAll();
      r.onsuccess=()=>res(r.result); r.onerror=()=>res(mem);
    }catch(err){ res(mem); }
  });
}
function dbPut(rec){
  return new Promise(res=>{
    const i=mem.findIndex(x=>x.name===rec.name); i<0?mem.push(rec):mem[i]=rec;
    if(!db) return res();
    try{ const t=db.transaction('samples','readwrite');
      t.objectStore('samples').put(rec); t.oncomplete=res; t.onerror=res;
    }catch(err){ res(); }
  });
}
function dbDel(name){
  return new Promise(res=>{
    const i=mem.findIndex(x=>x.name===name); if(i>=0) mem.splice(i,1);
    if(!db) return res();
    try{ const t=db.transaction('samples','readwrite');
      t.objectStore('samples').delete(name); t.oncomplete=res; t.onerror=res;
    }catch(err){ res(); }
  });
}

/* ── live tab audio ──
   A YouTube tab is a different origin, so its sound cannot be reached from
   here directly. getDisplayMedia is the one route the browser allows: the
   USER picks the tab and ticks "share tab audio", and that stream is handed
   to us. It is a live stream, so there is nothing to loop or seek. */
let live=null, srcId=null, srcNames=[];   // nothing chosen until the user picks
function stopLive(){
  if(!live) return;
  try{ live.node.disconnect(); }catch(e){}
  live.stream.getTracks().forEach(t=>{ try{t.stop();}catch(e){} });
  live=null;
}
async function startTabAudio(){
  let stream;
  /* tab audio comes only through Chromium's screen-share (Chrome, Edge, Whale…):
     Firefox and Safari share the picture but never the sound, and phones
     cannot share a tab at all */
  const chromium = !!(navigator.userAgentData && navigator.userAgentData.brands.some(b=>/Chromium/.test(b.brand)));
  if(!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) || !chromium){
    notice('다른 탭 소리는 컴퓨터의 크롬·엣지·웨일에서만 쓸 수 있어요. 파이어폭스·사파리·휴대폰에서는 안 돼요.');
    return false;
  }
  /* Without suppressLocalAudioPlayback the captured tab keeps playing to the
     speakers AND we play an EQ'd copy — you would hear both summed together,
     which dilutes the boost and makes the exercise meaningless. */
  const sc = navigator.mediaDevices.getSupportedConstraints
    ? navigator.mediaDevices.getSupportedConstraints() : {};
  const audioReq = {echoCancellation:false, noiseSuppression:false, autoGainControl:false};
  if(sc.suppressLocalAudioPlayback) audioReq.suppressLocalAudioPlayback = true;
  try{
    stream = await navigator.mediaDevices.getDisplayMedia({ video:true, audio:audioReq });
  }catch(err){
    if(err && err.name!=='NotAllowedError') notice('다른 탭의 소리를 가져오지 못했어요. ' + err.message);
    return false;
  }
  const at = stream.getAudioTracks();
  stream.getVideoTracks().forEach(t=>t.stop());     // sound only
  if(!at.length){
    stream.getTracks().forEach(t=>t.stop());
    notice('소리가 함께 공유되지 않았어요. 공유 창에서 "탭"을 고르고 아래의 오디오 공유를 켜 주세요.');
    return false;
  }
  /* the constraint can be ignored silently — ask the track what it actually did */
  let suppressed = !!(at[0].getSettings && at[0].getSettings().suppressLocalAudioPlayback);
  if(!suppressed && at[0].applyConstraints){
    try{
      await at[0].applyConstraints({suppressLocalAudioPlayback:true});
      suppressed = !!(at[0].getSettings().suppressLocalAudioPlayback);
    }catch(e){}
  }
  stopLive(); stopAudio();
  if(AC.state==='suspended') AC.resume();
  const node = AC.createMediaStreamSource(stream);
  node.connect(A.input); node.connect(B.input);
  if(preTap) node.connect(preTap);
  live={stream, node, suppressed};
  at[0].addEventListener('ended', ()=>clearSource());   // the user pressed "공유 중지"
  UI.live(true, suppressed);
  return true;
}

/* ── sources ── */
/* sample music: 75-second excerpts, Kevin MacLeod (incompetech.com), CC BY 4.0 */
const MUSIC = [['funky-chunk','Funky Chunk','펑크'],['rocket-power','Rocket Power','록'],['slow-burn','Slow Burn','블루스'],
  ['night-in-venice','Night in Venice','재즈'],['bossa-antigua','Bossa Antigua','보사노바'],['blue-ska','Blue Ska','스카'],
  ['brain-dance','Brain Dance','일렉트로닉'],['porch-swing-days-faster','Porch Swing Days','어쿠스틱'],
  ['aggressor','Aggressor','오케스트라'],['vibing-over-venus','Vibing Over Venus','라운지']];
/* another tab's sound comes only through desktop Chromium */
const canTab = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) &&
  !(navigator.userAgentData ? navigator.userAgentData.mobile : /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
const BUILTIN = MUSIC.map(([k,n])=>['#m:'+k, n]).concat([['#pink','Pink Noise'],['#white','White Noise']], canTab ? [['#tab','다른 탭 소리']] : []);
const genreOf = id => { const m = MUSIC.find(x=>'#m:'+x[0]===id); return m ? m[2] : ''; };
async function listSources(){
  const recs = await dbAll();
  srcNames = recs.map(r=>r.name);
  return BUILTIN.map(([id,name])=>({id,name,user:false}))
    .concat(srcNames.map(n=>({id:n, name:n, user:true})));
}
const sourceName = id => (BUILTIN.find(b=>b[0]===id)||[0,id])[1];
/* back to nothing chosen */
function clearSource(){
  stopLive(); stopAudio(true);
  srcId = null; buffer = null; playOffset = 0;
  UI.live(false); UI.source();
}
async function loadSource(id){
  if(id==='#tab'){
    const ok = await startTabAudio();
    if(ok){ srcId=id; UI.source(); }
    return;
  }
  const was = playing;
  stopLive(); UI.live(false);
  let buf = bufCache.get(id);
  if(!buf){
    if(id==='#pink') buf = makeNoise(true);
    else if(id==='#white') buf = makeNoise(false);
    else if(id.startsWith('#m:')){
      UI.loading && UI.loading(true);
      try{ buf = makeSeamless(await AC.decodeAudioData(await (await fetch('music/'+id.slice(3)+'.mp3')).arrayBuffer())); }
      catch(e){ notice('음악을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'); return; }
      finally{ UI.loading && UI.loading(false); }
    }
    else {
      const rec = (await dbAll()).find(r=>r.name===id);
      if(!rec) return clearSource();
      try{ buf = makeSeamless(await AC.decodeAudioData(rec.data.slice(0))); }
      catch(e){ notice('이 파일은 열 수 없어요: '+id); return; }
    }
    bufCache.set(id, buf);
  }
  srcId = id; buffer = buf; playOffset = 0;
  if(was) startAudio(0); else stopAudio(true);
  UI.source();
}
async function addFiles(files){
  let first=null;
  for(const f of files){
    if(!f.type.startsWith('audio') && !/\.(wav|mp3|flac|ogg|m4a|aiff?)$/i.test(f.name)) continue;
    await dbPut({name:f.name, data: await f.arrayBuffer()});
    first = first || f.name;
  }
  if(first){ bufCache.delete(first); await listSources(); await loadSource(first); }
  else notice('오디오 파일만 넣을 수 있어요 (wav, mp3, flac, ogg, m4a, aiff).');
}
async function deleteSource(id){
  if(id.startsWith('#')) return;
  await dbDel(id); bufCache.delete(id); await listSources();
  if(srcId===id) clearSource(); else UI.source();
}

/* ── boot ── */
async function initAudio(){
  try{
    const url=URL.createObjectURL(new Blob([WORKLET_SRC],{type:'application/javascript'}));
    await AC.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    WL=true;
  }catch(err){ WL=false; console.warn('AudioWorklet unavailable — Biquad fallback.', err); }
  console.info('EQ engine:', WL ? 'AudioWorklet / Orfanidis' : 'BiquadFilterNode fallback');
  A=makeChain(); B=makeChain(); B.out.gain.value=0;
  /* the analyser listens to YOUR chain, before the A/B switch: it moves
     with your node, and the answer (chain A) is never drawn */
  analyser=AC.createAnalyser();
  analyser.fftSize=8192; analyser.smoothingTimeConstant=0.82;
  analyser.minDecibels=-100; analyser.maxDecibels=-10;
  anaData=new Float32Array(analyser.frequencyBinCount);
  B.tap.connect(analyser);
  db=await openDB();
  await listSources();
}
