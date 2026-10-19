/* app.js — My Personal EQ Workbook: the page.
 *
 * Processing: one to three bands of +10 dB, Q 1 are hidden in the sound;
 * you drag your own nodes (sideways only — gain and Q are fixed) to where you
 * hear them, then CHECK. The answer note lands below the 0 dB line so both
 * curves stay in view; a click anywhere goes on, "계속 듣기" stays.
 *
 * Everything that would be a border or a widget is drawn with sketch.js:
 * static marks once per layout (drawPage), stateful marks whenever state
 * changes (drawMarks), the graph every frame (graph.js).
 */
'use strict';
const $ = (id) => document.getElementById(id);
const page = $('page');
const KOS = "'ROH HOE-CHAN','Nanum Pen Script',sans-serif", KS = 0.78;
SK.TOOL.pen.color = '#c41a32';
const boxOf = (el) => SK.box_of(typeof el === 'string' ? $(el) : el, page);
const rectOf = (el) => SK.rect_of(typeof el === 'string' ? $(el) : el, page);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const load = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const fmtHz = (f) => (f >= 1000 ? (f / 1000).toFixed(2) + ' kHz' : Math.round(f) + ' Hz');
const fmtK = (f) => (f >= 1000 ? +(f / 1000).toFixed(1) + 'k' : String(Math.round(f)));

/* ═══════════ preferences ═══════════ */
const PREF = Object.assign({ lv: 1, lo: 1, hi: 1, vol: 60, ana: true, hinted: false }, load('eqw.prefs') || {});
const savePrefs = () => store('eqw.prefs', PREF);

/* ═══════════ range ═══════════
   Low stops start at 40 Hz — below that is high-pass territory, not
   bell-hunting. The ruler snaps hard onto these stops. */
const FR_LO = [40, 60, 100], FR_HI = [10000, 12000, 15000, 18000];
PREF.lo = clamp(PREF.lo, 0, 2); PREF.hi = clamp(PREF.hi, 0, 3);
let F_LO, F_HI;
function rangeVals() { F_LO = FR_LO[PREF.lo]; F_HI = FR_HI[PREF.hi]; GRAPH.range = [F_LO, F_HI]; }

/* ═══════════ a round ═══════════ */
const GAIN = 10, Q = 1;
const M = { target: [], user: [], active: 0, revealed: false };
let FOCUS = null;          // practise around one octave band (from Stats)
let view = 'proc', resultOpen = false, lastResult = null;
const rnd = (a, b) => a + Math.random() * (b - a);
const rndLog = (a, b) => 10 ** rnd(Math.log10(a), Math.log10(b));

function newRound(play) {
  closeResult();
  const n = PREF.lv, t = [];
  const span = FOCUS ? [Math.max(F_LO, FOCUS / 2), Math.min(F_HI, FOCUS * 2)] : [F_LO, F_HI];
  let guard = 0, sep = 1.3;
  while (t.length < n && guard++ < 1200) {
    if (guard === 600) sep = 0.9;                 // a narrow range: relax the spacing
    const s = guard < 300 ? span : [F_LO, F_HI];  // a focus window too small for every band
    const f = rndLog(s[0], s[1]);
    if (t.some((b) => Math.abs(Math.log2(f / b.f)) < sep)) continue;
    t.push({ f, g: GAIN, q: Q });
  }
  t.sort((a, b) => a.f - b.f);
  M.target = t;
  /* your nodes start spread evenly across the range (or the focus window) */
  const [s0, s1] = FOCUS && t.length === 1 ? span : [F_LO, F_HI];
  M.user = t.map((_, i) => ({ f: s0 * (s1 / s0) ** ((i + 1) / (t.length + 1)), g: GAIN, q: Q }));
  M.active = 0; M.revealed = false;
  setBands(A, M.target); setBands(B, M.user);
  setSide('A');
  if (play) ensurePlaying();
  setCheck(); updateReadout();
  GRAPH.dirty = true;
}

/* scoring is about frequency only — gain and Q are given. Full marks fade
   out over 1.5 octaves; the 1.4 exponent keeps small misses cheap. */
function check() {
  if (M.revealed) return newRound(true);
  const t = [...M.target].sort((a, b) => a.f - b.f), u = [...M.user].sort((a, b) => a.f - b.f);
  const rows = t.map((tb, i) => {
    const eo = Math.abs(Math.log2(u[i].f / tb.f));
    recordBand(tb.f, eo < 0.5);
    return { t: tb.f, u: u[i].f, eo, sc: Math.round(100 * Math.max(0, 1 - (eo / 1.5) ** 1.4)) };
  });
  const score = Math.round(rows.reduce((s, r) => s + r.sc, 0) / rows.length);
  const ok = rows.every((r) => r.eo < 0.5);
  tourDone('check');
  ST.total++; if (ok) { ST.ok++; ST.streak++; ST.best = Math.max(ST.best, ST.streak); } else ST.streak = 0;
  const d = today(); d.n++; if (ok) d.ok++;
  ST.log.push({ lv: PREF.lv, s: score, d: rows.map((r) => Math.round(r.t) + '→' + Math.round(r.u)).join(', '), t: Date.now() });
  if (ST.log.length > 200) ST.log = ST.log.slice(-200);
  saveStats();
  M.revealed = true;
  setCheck(); markTally('P'); GRAPH.dirty = true;
  showResult(score, rows, ok);
}
function setCheck() {
  $('checkTxt').textContent = M.revealed ? 'NEXT' : 'CHECK';
  $('checkSub').textContent = M.revealed ? '다음 문제 · enter' : '확인 · enter';
}
function updateReadout() {
  const b = M.user[M.active]; if (!b) return;
  $('rdBand').textContent = 'band ' + (M.active + 1);
  $('rdFreq').innerHTML = b.f >= 1000 ? (b.f / 1000).toFixed(2) + '<small>kHz</small>' : Math.round(b.f) + '<small>Hz</small>';
}
function moveActive(oct) {
  const b = M.user[M.active]; if (!b) return;
  b.f = clamp(b.f * 2 ** oct, F_LO, F_HI);
  setBands(B, M.user); updateReadout(); GRAPH.dirty = true; dismissHint();
}
function dismissHint() { if (!PREF.hinted) { PREF.hinted = true; savePrefs(); GRAPH.hint = false; GRAPH.dirty = true; } }

/* ═══════════ first-visit notes ═══════════
   Red pen notes in the margins, like the one on the graph, one per step:
   pick a sound → play → compare A/B → move the node (the graph's own note) →
   CHECK. Each note goes away once that step has been done; the footer can
   bring them all back. */
PREF.tour = PREF.tour || {};
const TOUR = [
  ['src', '먼저 들을 소리를 골라요', 'left'],
  ['play', '재생해서 들어 봐요 · space', 'up'],
  ['mon', 'A는 문제, B는 내 EQ · x로 번갈아 들어요', 'up'],
  ['check', '들리는 곳에 놓았으면 쾅! · enter', 'up'],
];
const touring = () => !PREF.tourOff && (TOUR.some(([k]) => !PREF.tour[k]) || !PREF.hinted);
function tourDone(k) {
  if (PREF.tour[k]) return;
  PREF.tour[k] = true; savePrefs();
  if (!touring()) redraw(); else markTour();   /* the last note going also gives its room back */
}
function tourReset(on) {
  PREF.tourOff = !on; if (on) { PREF.tour = {}; PREF.hinted = false; }
  savePrefs(); GRAPH.hint = on && !PREF.hinted; GRAPH.dirty = true; redraw();
}
function markTour() {
  page.querySelectorAll('svg.tour').forEach((s) => s.remove());
  $('tourBtn').textContent = touring() ? '설명 끄기' : '처음 설명 다시 보기';
  if (view !== 'proc' || PREF.tourOff) return;
  const s = surf(page, 5, 'tour'); s.style.willChange = 'transform';
  const ink = SK.layer(s, 'pen');
  const phone = page.offsetWidth <= 700;
  const note = (txt, x, y, anchor, seed) => NB.text(ink, x, y, phone ? txt.replace(/ · [a-z]+$/, '').replace(' · x로', ',') : txt, { font: KOS, size: (phone ? 28 : 34) * KS, color: '#c41a32', anchor, rot: -3 + (seed % 3) });
  for (const [k, txt, d0] of TOUR) {
    if (PREF.tour[k]) continue;
    const dir = phone ? 'up' : d0;
    const id = { src: 'srcName', play: 'play', mon: 'mon', check: 'check' }[k], b = rectOf(id), seed = 300 + k.length * 7;
    if (!b.w) continue;
    if (dir === 'left') {   /* to the right of it, pointing back */
      const x = b.x + b.w + 130, y = b.y + b.h * 0.7;
      note(txt, x, y, 'start', seed);
      SK.arrow(s, x - 14, y - 12, b.x + b.w + 46, b.y + b.h * 0.45, { tool: 'pen', seed, bend: 0.2, head: 10 });
    } else {                /* under it, pointing up */
      const cx = b.x + b.w / 2, y = b.y + b.h + 74;
      const x = k === 'check' ? b.x + b.w : k === 'play' ? b.x + b.w + (phone ? 20 : 60) : b.x + 10;
      note(txt, x, y, k === 'check' ? 'end' : 'start', seed);
      SK.arrow(s, k === 'check' ? cx + 20 : x + 14, y - 34, cx + (k === 'play' ? 12 : 0), b.y + b.h + 10, { tool: 'pen', seed, bend: k === 'check' ? 0.2 : -0.2, head: 10 });
    }
  }
}
$('tourBtn').onclick = () => tourReset(!touring());

/* ═══════════ the answer note ═══════════ */
const VERDICT = (s) => (s >= 92 ? '정확해요!' : s >= 78 ? '거의 정확해요' : s >= 50 ? '근처예요' : '다시 들어볼까요?');
function showResult(score, rows, ok) {
  lastResult = { score, rows, ok };
  $('rLbl').textContent = 'result · ' + rows.length + (rows.length > 1 ? ' bands' : ' band');
  $('rScore').innerHTML = score + '<small> / 100</small>';
  $('rVerdict').textContent = VERDICT(score);
  const v = $('rVals');
  v.classList.toggle('multi', rows.length > 1);
  v.innerHTML = rows.length === 1
    ? `<span><b>정답</b>${fmtHz(rows[0].t)}</span><span><b>내 답</b>${fmtHz(rows[0].u)}</span><span><b>오차</b>${rows[0].eo.toFixed(2)} oct</span>`
    : rows.map((r, i) => `<span><b>${i + 1}</b>${fmtHz(r.t)} → ${fmtHz(r.u)} · ${r.eo.toFixed(2)} oct</span>`).join('');
  $('result').hidden = false; $('catcher').hidden = false; resultOpen = true;
  placeResult();
  /* show the whole note, but never scroll the peaks of the curves away */
  const gb = $('gcol').getBoundingClientRect(), rb = $('result').getBoundingClientRect();
  const need = rb.bottom - innerHeight + 40, keep = gb.top + GRAPH.yOf(10) * zk() - 90;
  const dy = need > 0 ? Math.min(need, keep) : keep < 0 ? keep : 0;
  if (Math.abs(dy) > 8) scrollBy({ top: dy, behavior: 'smooth' });
}
function placeResult() {
  if (!resultOpen) return;
  const el = $('result'), g = boxOf('gcol'), X0 = mx(), X1 = page.offsetWidth - mx();
  el.style.left = (X0 + (X1 - X0 - el.offsetWidth) / 2) + 'px';
  el.style.top = (g.y + (page.offsetWidth <= 700 ? GRAPH.plotRect().y + GRAPH.plotRect().h + 70 : GRAPH.yOf(0) + 56)) + 'px';
  /* its own paper */
  el.querySelectorAll(':scope > svg').forEach((s) => s.remove());
  const s = SK.el('svg', { width: el.offsetWidth, height: el.offsetHeight }, null); el.prepend(s);
  const w = el.offsetWidth, h = el.offsetHeight, rot = -0.8;
  SK.torn(s, 0, 0, w, h, { seed: 81, rot, fill: '#fbfaf6', sides: 'tlr', amp: 3.8, shadowOp: 0.36, sy: 6, sx: 3 });
  const rl = SK.el('g', { stroke: '#9fb4c8', 'stroke-width': 0.8, opacity: 0.55, filter: 'url(#sk-print)', transform: `rotate(${rot} ${w / 2} ${h / 2})` }, s);
  for (let y = 40; y < h - 16; y += 30) SK.el('path', { d: `M16 ${y}H${w - 14}` }, rl);
  SK.tape(s, 64, 8, 124, 32, -14, { seed: 82, color: '#e6e1d6', op: 0.66 });
  SK.tape(s, w - 64, 8, 116, 32, 12, { seed: 86, color: '#e6e1d6', op: 0.66 });
  const local = (id) => rel(id, el);
  const st = local('stay'), tk = local('tick');
  SK.arrow(s, st.x - 14, st.y + 20, st.x - 50, st.y + 6, { tool: 'pencil', seed: 83, bend: -0.6, head: 9 });
  SK.underline(s, st.x, st.x + st.w, st.y + st.h - 2, { tool: 'pencil', seed: 84 });
  if (lastResult && lastResult.ok && tk.w) SK.stroke(s, [[tk.x + 10, tk.y + 52], [tk.x + 34, tk.y + 86], [tk.x + 100, tk.y + 6]], { tool: 'pen', seed: 85, w: 3.2, grow: false });
}
function closeResult() {
  if (!resultOpen) return;
  resultOpen = false; $('result').hidden = true; $('catcher').hidden = true;
}
const stay = () => { closeResult(); };
const next = () => { closeResult(); newRound(true); };
/* click, not pointerdown: the release must not land on whatever is under the catcher */
$('catcher').addEventListener('click', (e) => { e.preventDefault(); next(); });
$('result').addEventListener('click', (e) => { if (e.target.closest('#stay')) stay(); else next(); });

/* ═══════════ stats ═══════════ */
const OCT = [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
let ST = load('eqt.stats') || {};
ST.band = ST.band || {}; ST.log = ST.log || []; ST.days = ST.days || {};
if (ST.total === undefined) { ST.total = ST.log.length; ST.ok = ST.log.filter((r) => r.s >= 78).length; }
ST.best = ST.best || 0; ST.streak = ST.streak || 0;
const saveStats = () => store('eqt.stats', ST);
const dayKey = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
function today() { const k = dayKey(); return ST.days[k] || (ST.days[k] = { n: 0, ok: 0 }); }
function nearestOct(f) { let b = OCT[0]; for (const o of OCT) if (Math.abs(Math.log2(f / o)) < Math.abs(Math.log2(f / b))) b = o; return b; }
function recordBand(f, ok) { const k = String(nearestOct(f)), e = ST.band[k] || (ST.band[k] = { n: 0, ok: 0 }); e.n++; if (ok) e.ok++; }
const todayText = () => { const d = today(); return d.n ? `${d.n}문제 · ${d.ok}개 맞힘` : '아직 0문제'; };

/* ═══════════ engine hooks ═══════════ */
const UI = {
  play() { if (view === 'proc') markPlay(); if (playing || live) tourDone('play'); },
  live(on, suppressed) {
    $('vProc').classList.toggle('live', !!on);
    $('liveWarn').hidden = !on || !!suppressed;
    if (view === 'proc') { buildTracks(); markSource(); markPlay(); }
  },
  source() {
    $('srcName').textContent = srcId ? sourceName(srcId) : '선택하세요';
    $('srcName').classList.toggle('unset', !srcId);
    /* noise has no timeline: only a play button; seeking is for files */
    const file = !!srcId && !srcId.startsWith('#');
    if ($('vProc').classList.contains('file') !== file) { $('vProc').classList.toggle('file', file); if (view === 'proc') { buildTracks(); markSkips(); markTour(); } }
    paintTransport(true); if (view === 'proc') markSource();
    if (srcId) tourDone('src');
  },
  side() { if (view === 'proc') markMonitor(); },
};
let toastT = null;
function notice(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 7000);
}
$('toast').addEventListener('click', () => ($('toast').hidden = true));

/* ═══════════ drawing helpers ═══════════ */
const mx = () => parseFloat(getComputedStyle(page).paddingLeft);
/* screen px per page px (1 unless the browser itself is zooming the page) */
const zk = () => page.getBoundingClientRect().width / (page.offsetWidth || 1) || 1;
function surf(root, z, cls) {
  return SK.el('svg', { class: cls, width: root.scrollWidth, height: root.scrollHeight, style: `position:absolute;left:0;top:0;z-index:${z};pointer-events:none;overflow:visible` }, root);
}
const RULE = { tool: 'pencil', bow: 0.0016, grow: false, amp: 1.1 };

/* the page: paper, masthead, ruled bands — once per layout */
function drawPage() {
  page.querySelectorAll('svg.pg').forEach((s) => s.remove());
  /* the paper itself is the page background (two tiles); these two layers
     hold the marks below and above the content, each rasterised once */
  const under = surf(page, 1, 'pg'), over = surf(page, 3, 'pg');
  const W = page.scrollWidth, X0 = mx(), X1 = W - X0;

  /* the open tab is circled */
  const nv = rectOf(view === 'proc' ? 'navP' : 'navS');
  SK.loop(over, nv.x + nv.w / 2, nv.y + nv.h / 2 + 2, nv.w / 2 + 18, nv.h / 2 + 12, { tool: 'pen', seed: view === 'proc' ? 3 : 4 });

  /* "my personal", typed on a strip of masking tape */
  const my = boxOf('tMy');
  SK.tape(under, my.x + my.w / 2, my.y + my.h / 2, my.w + 34, my.h + 10, -4, { seed: 33, color: '#ebe6da', op: 0.92 });
  const sk = rectOf('subKey');
  SK.underline(over, sk.x, sk.x + sk.w, sk.y + sk.h + 2, { tool: 'pen', seed: SK.hash('sub'), double: true });

  /* a polaroid of a pencil study, taped beside the title */
  const pb = boxOf('polaroid');
  if (pb.w) {
    const pcx = pb.x + pb.w / 2, pcy = pb.y + pb.h / 2;
    SK.torn(under, pb.x, pb.y, pb.w, pb.h, { sides: '', seed: 5, rot: 4, fill: '#fbfaf7', coreFill: '#fbfaf7', shadowOp: 0.3, sy: 5, sx: 2 });
    const pg = SK.el('g', { transform: `rotate(4 ${pcx} ${pcy})` }, over);
    SK.el('rect', { x: pb.x + 18, y: pb.y + 18, width: pb.w - 36, height: pb.w - 36, fill: '#f1efea' }, pg);
    NB.headphones(pg, pb.x + 30, pb.y + 26, 0.8, { seed: 61 });
    SK.tape(over, pcx - 6, pb.y + 2, 118, 34, 2, { seed: 6, color: '#e6e1d6', op: 0.62 });
  }

  /* the ruled band */
  const sid = view === 'proc' ? 'stripP' : 'stripS', sb = boxOf(sid);
  SK.line(over, X0 - 6, sb.y, X1 + 8, sb.y + 1, { ...RULE, seed: 11 });
  SK.line(over, X0 - 4, sb.y + sb.h, X1 + 6, sb.y + sb.h - 1, { ...RULE, seed: 12 });
  if (page.offsetWidth > 1100) {
    const cells = $(sid).querySelectorAll('.cell');
    [cells[1], cells[2]].forEach((cl, k) => { const cb = SK.box_of(cl, page); SK.line(over, cb.x, sb.y + 26, cb.x + 1, sb.y + sb.h - 26, { tool: 'pencil', seed: 13 + k, grow: false }); });
  }

  if (view === 'proc') {
    const sh = rectOf('setH');
    SK.stroke(over, [[sh.x - 4, sh.y + sh.h + 2], [sh.x + sh.w * 0.5, sh.y + sh.h + 6], [sh.x + sh.w + 6, sh.y + sh.h]], { tool: 'pen', seed: 9, w: 2 });
    ['col1', 'col2', 'col3'].forEach((id, k) => {
      const cb = boxOf(id);
      SK.line(over, cb.x, cb.y + cb.h + 8, cb.x + cb.w * 0.92, cb.y + cb.h + 9, { ...RULE, tool: 'soft', seed: 90 + k });
    });
  } else drawStats(under, over);

  const fb = boxOf('foot');
  SK.line(over, X0 - 6, fb.y, X1 + 6, fb.y + 1, { ...RULE, seed: 95 });
}

/* ═══════════ stateful marks ═══════════
   Each widget carries its own little svg, so a change (play, A/B, level…)
   repaints that widget — not a page-sized layer of filtered strokes. */
function overlay(host, key) {
  host.querySelectorAll(':scope > svg.ov-' + key).forEach((s) => s.remove());
  return SK.el('svg', { class: 'ov ov-' + key, width: host.offsetWidth, height: host.offsetHeight,
    style: 'position:absolute;left:0;top:0;overflow:visible;pointer-events:none;z-index:3' }, host);
}
/* where an element sits inside a host, in the page's own px */
function rel(el, host) {
  el = typeof el === 'string' ? $(el) : el;
  const a = el.getBoundingClientRect(), b = host.getBoundingClientRect(), k = zk();
  return { x: (a.left - b.left) / k, y: (a.top - b.top) / k, w: a.width / k, h: a.height / k };
}
function ringIn(s, host, id, tool, seed, pad = 14) {
  const b = rel(id, host);
  if (b.w) SK.loop(s, b.x + b.w / 2, b.y + b.h / 2 + 2, b.w / 2 + pad, b.h / 2 + pad * 0.62, { tool, seed });
}
/* source: a filled-in form line with a little caret */
function markSource() {
  const host = $('srcRow'), s = overlay(host, 'src'), sn = rel('srcName', host), ca = rel('caret', host);
  for (let x = sn.x; x < sn.x + sn.w + 30; x += 7) SK.line(s, x, sn.y + sn.h + 6, x + 3.5, sn.y + sn.h + 6.4, { tool: 'soft', seed: x, grow: false, amp: 0.1 });
  SK.stroke(s, [[ca.x + 2, ca.y + 4], [ca.x + 9, ca.y + 13], [ca.x + 16, ca.y + 3]], { tool: 'pencil', seed: 21, grow: false, step: 2, amp: 0.2 });
}
function markSkips() {
  for (const [id, back, seed] of [['b30', true, 31], ['b10', true, 32], ['f10', false, 33], ['f30', false, 34]]) {
    const el = $(id); NB.skip(overlay(el, 'sk'), { x: 0, y: 0, w: el.offsetWidth, h: el.offsetHeight }, back, { seed });
  }
}
function markPlay() {
  const el = $('play'), s = overlay(el, 'pl'), cx = el.offsetWidth / 2, cy = el.offsetHeight / 2;
  SK.loop(s, cx, cy, 33, 32, { tool: 'pen', seed: 35 });
  if (playing) {   /* pause: two short bars */
    SK.stroke(s, [[cx - 6, cy - 11], [cx - 6.5, cy + 11]], { tool: 'pen', seed: 36, grow: false, amp: 0.3, w: 3 });
    SK.stroke(s, [[cx + 6, cy - 11], [cx + 5.5, cy + 11]], { tool: 'pen', seed: 37, grow: false, amp: 0.3, w: 3 });
  } else {
    const t = 33 * 0.42;
    SK.stroke(s, [[cx - t * 0.6, cy - t], [cx + t * 0.95, cy + 0.5], [cx - t * 0.55, cy + t], [cx - t * 0.62, cy - t - 1]], { tool: 'pen', seed: 38, grow: false, amp: 0.3, step: 2, taper: 0.05 });
  }
}
/* analyser switch: a tiny drawn waveform in a box, ticked when on */
function markAna() {
  const host = $('anaT'), s = overlay(host, 'an'), an = rel('ana', host);
  SK.box(s, an.x, an.y, an.w, an.h, { tool: 'pencil', seed: 38, ov: 0.6 });
  const wv = []; for (let i = 0; i <= 18; i++) wv.push([an.x + 6 + i * 1.8, an.y + an.h / 2 + Math.sin(i * 1.3) * (i % 3 ? 4 : 8) * Math.sin((i / 18) * Math.PI)]);
  SK.stroke(s, wv, { tool: PREF.ana ? 'pencil' : 'soft', seed: 39, grow: false, amp: 0.15, step: 1.5 });
  if (PREF.ana) SK.stroke(s, [[an.x + an.w + 6, an.y + 8], [an.x + an.w + 12, an.y + 18], [an.x + an.w + 26, an.y - 6]], { tool: 'pen', seed: 40, grow: false, step: 2, amp: 0.3 });
  else SK.stroke(s, [[an.x - 4, an.y + an.h + 3], [an.x + an.w + 4, an.y - 3]], { tool: 'pencil', seed: 41, grow: false, amp: 0.3 });
}
/* which one you are hearing */
function markMonitor() {
  $('mA').className = 'opt click ' + (side === 'A' ? 'pen' : 'graphite off');
  $('mB').className = 'opt click ' + (side === 'B' ? 'pen' : 'graphite off');
  const host = $('mon'); ringIn(overlay(host, 'mo'), host, side === 'A' ? 'mA' : 'mB', 'pen', side === 'A' ? 51 : 52);
}
/* which level is set */
function markLevel() {
  [1, 2, 3].forEach((n) => ($('lv' + n).className = 'optn click ' + (n === PREF.lv ? 'pen' : 'graphite off')));
  const host = $('lvOpts'); ringIn(overlay(host, 'lv'), host, 'lv' + PREF.lv, 'pen', 60 + PREF.lv, 15);
}
/* tally marks for today, five to a gate — at most three gates, the text says the rest */
function markTally(w) {
  const el = $('tally' + w), n = Math.min(today().n, 15);
  $('today' + w).textContent = todayText();
  el.style.width = Math.ceil(n / 5) * 54 + 'px'; el.style.display = n ? '' : 'none';
  const s = overlay(el, 't'); if (n) NB.tally(s, 0, 0, n, { seed: 23 });
}
function markFocus() {
  const host = $('focusNote'), s = overlay(host, 'f');
  if (FOCUS && host.offsetWidth) SK.underline(s, 0, host.offsetWidth, host.offsetHeight, { tool: 'pen', seed: 66 });
}
function markReset() {
  const host = $('reset'), s = overlay(host, 'r');
  if (host.offsetWidth) SK.underline(s, 0, host.offsetWidth, host.offsetHeight + 2, { tool: host.dataset.armed ? 'pen' : 'pencil', seed: 96 });
}
/* share: a red underline and a little arrow going out */
function markShare() {
  const host = $('shareBtn'), s = overlay(host, 'sh'), w = host.offsetWidth, h = host.offsetHeight;
  if (!w) return;
  SK.underline(s, 0, w, h + 2, { tool: 'pen', seed: 97 });
  SK.arrow(s, w + 8, h * 0.75, w + 30, h * 0.05, { tool: 'pen', seed: 98, bend: -0.15, head: 8 });
}
function drawMarks() {
  page.querySelectorAll('svg.ov').forEach((s) => s.remove());
  if (view === 'proc') { markSource(); markSkips(); markPlay(); markAna(); markMonitor(); markLevel(); markTally('P'); markFocus(); }
  else { markTally('S'); markShare(); markReset(); }
}

/* ═══════════ hand-drawn sliders (scrub, volume) ═══════════
   The line is drawn once; the travelled part is a red line under a clip
   rect, and the knob a scribble that slides — so they can move every frame
   without being re-drawn. */
const tracks = {};
function track(id, seed, o) {
  const el = $(id); el.innerHTML = '';
  const w = el.offsetWidth, h = el.offsetHeight; if (!w) return null;
  const s = SK.el('svg', { width: w, height: h, style: 'overflow:visible;display:block' }, el);
  const y = h / 2;
  SK.line(s, 0, y, w, y + 1, { tool: 'pencil', seed });
  const cid = 'clip-' + id;
  const cp = SK.el('clipPath', { id: cid }, SK.el('defs', {}, s));
  const rect = SK.el('rect', { x: -6, y: -10, width: 0, height: h + 20 }, cp);
  const g = SK.el('g', { 'clip-path': `url(#${cid})` }, s);
  SK.line(g, 0, y - 0.5, w, y, { tool: o.done, w: o.doneW, seed: seed + 1 });
  const kg = SK.el('g', {}, s);
  SK.loop(kg, 0, y, 6, 6, { tool: o.knob, turns: 3.4, w: o.knobW, seed: seed + 2 });
  return { w, set(p) { p = clamp(p, 0, 1); rect.setAttribute('width', p * w + 6); kg.setAttribute('transform', `translate(${(p * w).toFixed(1)} 0)`); } };
}
function buildTracks() {
  if (view !== 'proc') return;
  tracks.scrub = track('scrub', 36, { done: 'pen', doneW: 2.6, knob: 'pen', knobW: 2.4 });
  tracks.vol = track('vol', 37, { done: 'pencil', doneW: 2.2, knob: 'pencil', knobW: 2.2 });
  if (tracks.vol) tracks.vol.set(PREF.vol / 100);
  paintTransport(true);
}
/* a slider whose width changes is re-drawn to its new length */
const ro = new ResizeObserver((es) => {
  if (view !== 'proc') return;
  for (const e of es) {
    const id = e.target.id, w = Math.round(e.contentRect.width);
    if (id === 'ruler') { if (w && w !== e.target._w) { e.target._w = w; drawRuler(); } }
    else if (tracks[id] && w && Math.abs(w - tracks[id].w) > 1) buildTracks();
  }
});
['scrub', 'vol', 'ruler'].forEach((id) => ro.observe($(id)));
let seeking = false, seekPos = 0, shownT = '', shownD = '', shownP = -1;
function paintTransport(force) {
  const d = buffer ? buffer.duration : 0, p = seeking ? seekPos : curPos(), pct = d ? p / d : 0;
  if (tracks.scrub && (force || Math.abs(pct - shownP) > 0.002)) { tracks.scrub.set(pct); shownP = pct; }
  const a = mmss(p), b = mmss(d);
  if (force || a !== shownT) { $('tcur').textContent = a; shownT = a; }
  if (force || b !== shownD) { $('tdur').textContent = b; shownD = b; }
}
function dragOn(el, fn, done) {
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    const go = (ev) => { const r = el.getBoundingClientRect(); fn(clamp((ev.clientX - r.left) / r.width, 0, 1)); };
    go(e);
    const mv = (ev) => go(ev);
    const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); done && done(); };
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  });
}
dragOn($('scrub'), (p) => { if (!buffer) return; seeking = true; seekPos = p * buffer.duration; paintTransport(); },
  () => { if (seeking) { seeking = false; doSeek(seekPos); paintTransport(); } });
dragOn($('vol'), (p) => {
  PREF.vol = Math.round(p * 100); setVolume(PREF.vol);
  $('volVal').textContent = PREF.vol; tracks.vol && tracks.vol.set(p);
}, savePrefs);

/* ═══════════ the range ruler ═══════════ */
const XL = [0, 0.13, 0.26], XH = [0.68, 0.79, 0.895, 1];
function drawRuler() {
  const el = $('ruler'); el.innerHTML = '';
  const w = el.offsetWidth, h = el.offsetHeight; if (!w) return;
  const s = SK.el('svg', { width: w, height: h, style: 'overflow:visible;display:block' }, el);
  NB.ruler(s, { x: 0, y: 0, w, h }, { seed: 41, sel: [F_LO, F_HI], font: "'Reenie Beanie'", size: 26, selColor: '#c41a32' });
}
let rulerMoved = false;
dragOn($('ruler'), (p) => {
  /* the nearest stop wins, and decides which end moves */
  const all = XL.map((x, i) => ['lo', i, x]).concat(XH.map((x, i) => ['hi', i, x]));
  let best = all[0]; for (const a of all) if (Math.abs(a[2] - p) < Math.abs(best[2] - p)) best = a;
  if (PREF[best[0]] !== best[1]) { PREF[best[0]] = best[1]; rulerMoved = true; rangeVals(); drawRuler(); GRAPH.drawArt(); GRAPH.dirty = true; }
}, () => { if (rulerMoved) { rulerMoved = false; savePrefs(); newRound(playing); } });

/* ═══════════ source menu ═══════════ */
async function openMenu() {
  const menu = $('srcMenu');
  if (!menu.hidden) return closeMenu();
  const list = await listSources();
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  menu.innerHTML = list.map((s, i) => (i === 3 ? '<div class="sep"></div>' : '') +
    `<div class="mi click" data-id="${encodeURIComponent(s.id)}"><span class="n graphite${s.id === srcId ? ' on' : ''}">${esc(s.name)}</span>` +
    (s.id === '#tab' ? '<span class="hint">유튜브 등</span>' : '') +
    (s.user ? '<span class="del click" data-del="1">지우기</span>' : '') + '</div>').join('') +
    '<div class="sep"></div><div class="mi click" data-add="1"><span class="n graphite">+ 파일 추가…</span></div>';
  menu.hidden = false;
  $('vProc').classList.add('menu-open');   /* above the ruled lines while it is open */
  const w = menu.offsetWidth, h = menu.offsetHeight;
  const s = SK.el('svg', { width: w, height: h }, null); menu.prepend(s);
  SK.torn(s, 0, 0, w, h, { seed: 91, rot: 0.6, fill: '#fbfaf6', sides: 'b', amp: 3, shadowOp: 0.34, sy: 5 });
  SK.tape(s, w / 2, 4, 110, 30, -3, { seed: 92, color: '#e6e1d6', op: 0.6 });
  /* what is chosen is circled in red, the way it is everywhere else */
  const on = menu.querySelector('.n.on');
  if (on) { const b = rel(on, menu); SK.loop(s, b.x + b.w / 2, b.y + b.h / 2 + 2, b.w / 2 + 16, b.h / 2 + 10, { tool: 'pen', seed: 93 }); }
}
function closeMenu() { $('srcMenu').hidden = true; $('vProc').classList.remove('menu-open'); }
$('srcMenu').addEventListener('click', async (e) => {
  e.stopPropagation();
  const mi = e.target.closest('.mi'); if (!mi) return;
  if (mi.dataset.add) { closeMenu(); return $('fileIn').click(); }
  const id = decodeURIComponent(mi.dataset.id);
  if (e.target.closest('[data-del]')) { await deleteSource(id); closeMenu(); return; }
  closeMenu(); await loadSource(id);
});
$('srcName').addEventListener('click', (e) => { e.stopPropagation(); openMenu(); });
$('caret').addEventListener('click', (e) => { e.stopPropagation(); openMenu(); });
addEventListener('click', (e) => { if (!e.target.closest('#srcMenu')) closeMenu(); });
$('fileIn').onchange = (e) => { addFiles([...e.target.files]); e.target.value = ''; };

/* ═══════════ the rest of the controls ═══════════ */
document.querySelectorAll('[data-skip]').forEach((b) => (b.onclick = () => { skip(+b.dataset.skip); paintTransport(); }));
/* nothing to play yet: say so, and open the list */
function needSource() {
  if (buffer || live) return false;
  notice('먼저 들을 소리를 선택하세요.');
  /* the list lives up in the band: bring it into view */
  const r = $('srcRow').getBoundingClientRect();
  if (r.top < 80 || r.bottom > innerHeight - 340) scrollBy({ top: r.top - 160, behavior: 'smooth' });
  setTimeout(openMenu, 30);   /* after this click has finished closing menus */
  return true;
}
$('play').onclick = () => { if (!needSource()) togglePlay(); };
$('anaT').onclick = () => { PREF.ana = !PREF.ana; GRAPH.anaOn = PREF.ana; savePrefs(); markAna(); GRAPH.dirty = true; };
$('mA').onclick = () => { setSide('A'); ensurePlaying(); tourDone('mon'); };
$('mB').onclick = () => { setSide('B'); ensurePlaying(); tourDone('mon'); };
$('check').onclick = () => check();
document.querySelectorAll('[data-lv]').forEach((b) => (b.onclick = () => {
  const n = +b.dataset.lv; if (n === PREF.lv) return;
  PREF.lv = n; savePrefs(); newRound(playing); markLevel();
}));
$('stay').onclick = (e) => { e.stopPropagation(); stay(); };

/* ═══════════ views ═══════════ */
function setView(v, scroll) {
  if (v === view) return;
  closeResult(); closeMenu();
  view = v;
  $('vProc').hidden = v !== 'proc'; $('vStats').hidden = v !== 'stats';
  $('navP').classList.toggle('off', v !== 'proc'); $('navS').classList.toggle('off', v !== 'stats');
  $('goView').textContent = v === 'proc' ? 'Stats 보기 →' : 'Processing으로 →';
  $('folio').textContent = v === 'proc' ? '— 14 —' : '— 15 —';
  resetArm(false);
  if (v === 'stats') { stopAudio(); muteChains(); renderStatsDom(); }
  else setSide(side);
  redraw();
  if (scroll) scrollTo({ top: Math.max(0, boxOf(v === 'proc' ? 'stripP' : 'stripS').y * zk() - 50), behavior: 'smooth' });
}
$('navP').onclick = () => setView('proc');
$('navS').onclick = () => setView('stats');
$('goView').onclick = () => setView(view === 'proc' ? 'stats' : 'proc', true);
function resetArm(on) {
  const r = $('reset');
  r.innerHTML = on ? '정말 지울까요?<b class="click" id="rsYes">지우기</b><i class="click" id="rsNo">아니요</i>' : '기록 초기화';
  r.dataset.armed = on ? '1' : '';
  if (view === 'stats') markReset();
}
$('shareBtn').onclick = () => SHARE.open();
$('reset').addEventListener('click', (e) => {
  e.stopPropagation();
  if (e.target.id === 'rsYes') {
    ST = { band: {}, log: [], days: {}, total: 0, ok: 0, best: 0, streak: 0 }; saveStats();
    resetArm(false); renderStatsDom(); redraw(); return;
  }
  if (e.target.id === 'rsNo') return resetArm(false);
  if (!$('reset').dataset.armed) resetArm(true);
});

/* ═══════════ Stats ═══════════ */
const GOOD = 80, WEAK = 50;
function bandRows() { return OCT.map((f) => { const e = ST.band[String(f)] || { n: 0, ok: 0 }; return { f, n: e.n, ok: e.ok, p: e.n ? Math.round((e.ok / e.n) * 100) : 0 }; }); }
function renderStatsDom() {
  $('sAns').textContent = ST.total;
  $('sAcc').innerHTML = ST.total ? Math.round((ST.ok / ST.total) * 100) + '<small>%</small>' : '—';
  $('sBest').textContent = ST.best;
  const weak = bandRows().filter((b) => b.n >= 1).sort((a, b) => a.p - b.p).slice(0, 3);
  $('wcols').innerHTML = weak.length
    ? weak.map((b, i) => `<div class="col"><div class="wnum graphite" id="wn${i + 1}">${i + 1}</div>
        <div class="wf pen" id="wf${i + 1}">${b.f >= 1000 ? b.f / 1000 + '<small>kHz</small>' : b.f + '<small>Hz</small>'}</div>
        <div class="wr"><b class="graphite">${b.p}%</b><span>${b.n}문제 중 ${b.ok}개</span></div>
        <span class="wgo graphite click" id="wg${i + 1}" data-focus="${b.f}">이 근처만 연습하기 →</span></div>`).join('')
    : '<div class="empty" style="grid-column:1/-1">아직 푼 문제가 없어요. 몇 문제 풀어 볼까요?</div>';
  const recent = ST.log.slice(-8).reverse();
  $('lrows').innerHTML = recent.length
    ? recent.map((r, i) => `<tr><td class="n">${ST.log.length - i}</td><td class="lv">0${r.lv}</td><td class="sc ${r.s < WEAK ? 'pen' : 'graphite'}"><span id="sc${i}">${r.s}</span></td><td class="dt">${(r.d || '').replace(/→/g, ' → ')} Hz</td></tr>`).join('')
    : '<tr><td colspan="4" class="dt" style="padding-top:20px">아직 기록이 없어요.</td></tr>';
}
$('wcols').addEventListener('click', (e) => {
  const g = e.target.closest('[data-focus]'); if (!g) return;
  FOCUS = +g.dataset.focus;
  $('focusNote').hidden = false;
  $('focusNote').innerHTML = `${fmtK(FOCUS)} Hz 근처만 연습 중<span class="x click" id="focusX">해제</span>`;
  setView('proc'); newRound(false);
  scrollTo({ top: Math.max(0, boxOf('ex').y * zk() - 30), behavior: 'smooth' });
});
$('focusNote').addEventListener('click', (e) => {
  if (e.target.id !== 'focusX') return;
  FOCUS = null; $('focusNote').hidden = true; newRound(playing);
});

function drawStats(under, over) {
  const lab = SK.layer(over, 'pencil'), labP = SK.layer(over, 'pen');
  /* ── accuracy per octave band, hatched pencil bars ── */
  const c = boxOf('chart'), rows = bandRows(), n = rows.length, slot = c.w / n, bw = slot * 0.44, b0 = c.y + c.h;
  const Yp = (p) => b0 - (p / 100) * c.h;
  /* a narrow chart (a phone) gets smaller figures and no per-band counts */
  const sm = slot < 60, fs = (n) => Math.round(n * (sm ? 0.6 : 1));
  SK.line(over, c.x - 30, b0, c.x + c.w + 10, b0 + 1, { tool: 'pencil', seed: 101, bow: 0.002, grow: false });
  for (const p of [50, 100]) {
    for (let x = c.x - 10; x < c.x + c.w; x += 16) SK.line(over, x, Yp(p), x + 7, Yp(p) + 0.3, { tool: 'soft', seed: p * 7 + x, grow: false, amp: 0.1 });
    NB.text(lab, c.x - (sm ? 8 : 26), Yp(p) + 8, p + '%', { font: "'Reenie Beanie'", size: fs(24), color: '#7b766d', anchor: 'end' });
  }
  SK.line(over, c.x - 10, Yp(GOOD), c.x + c.w, Yp(GOOD) - 1, { tool: 'pen', seed: 102, bow: 0.002, grow: false, w: 1.4, op: 0.75 });
  NB.text(labP, c.x + c.w + 6, Yp(GOOD) - 16, '목표 80%', { font: KOS, size: fs(32) * KS, color: '#c41a32', anchor: 'end', rot: -2 });
  rows.forEach((r, i) => {
    const cx = c.x + slot * (i + 0.5), x = cx - bw / 2, top = Yp(r.p);
    NB.text(lab, cx, b0 + (sm ? 30 : 46), r.f >= 1000 ? r.f / 1000 + 'k' : String(r.f), { font: "'Reenie Beanie'", size: fs(34), color: '#34322d' });
    if (!sm) NB.text(lab, cx, b0 + 80, r.n + '문제', { font: KOS, size: 26 * KS, color: '#938c80' });
    if (r.n < 1) {   /* nothing answered here yet: an empty dashed box */
      const hb = Yp(18), seg = [[[x, b0], [x, hb]], [[x, hb], [x + bw, hb]], [[x + bw, hb], [x + bw, b0]]];
      for (const [a, b2] of seg) for (let t = 0; t < 1; t += 0.14)
        SK.line(over, a[0] + (b2[0] - a[0]) * t, a[1] + (b2[1] - a[1]) * t, a[0] + (b2[0] - a[0]) * (t + 0.07), a[1] + (b2[1] - a[1]) * (t + 0.07), { tool: 'soft', seed: i * 50 + t * 100, grow: false, amp: 0.1 });
      NB.text(lab, cx, hb - (sm ? 8 : 16), sm ? '—' : '기록 없음', { font: KOS, size: fs(26) * KS, color: '#938c80' });
      return;
    }
    const weak = r.p < WEAK, good = r.p >= GOOD, tool = weak ? 'pen' : good ? 'pencil' : 'soft';
    if (r.p > 0) {
      SK.stroke(over, [[x, b0], [x - 1, top], [x + bw, top + 1], [x + bw + 1, b0]], { tool, seed: 200 + i, grow: false, amp: 0.5, bow: 0.002 });
      SK.hatch(over, x + 2, top + 3, bw - 4, b0 - top - 4, { seed: 300 + i, angle: 62, gap: good ? 4.2 : weak ? 5.5 : 6.5, tool, ragged: 2 });
    }
    NB.text(weak ? labP : lab, cx, top - (sm ? 10 : 18), r.p + (sm ? '' : '%'), { font: "'Reenie Beanie'", size: fs(42), color: weak ? '#c41a32' : '#34322d' });
  });
  [['lg1', 'pencil', 4.2], ['lg2', 'soft', 6.5], ['lg3', 'pen', 5.5]].forEach(([id, tool, gap], k) => {
    const l = rectOf(id);
    SK.stroke(over, [[l.x, l.y + l.h], [l.x, l.y], [l.x + l.w, l.y], [l.x + l.w, l.y + l.h], [l.x, l.y + l.h]], { tool, seed: 400 + k, grow: false, amp: 0.3, step: 2 });
    SK.hatch(over, l.x + 1, l.y + 1, l.w - 2, l.h - 2, { seed: 410 + k, angle: 62, gap, tool, ragged: 1 });
  });

  /* ── weak bands ── */
  for (const k of [1, 2, 3]) {
    if (!$('wf' + k)) continue;
    const w = rectOf('wf' + k); SK.underline(over, w.x, w.x + w.w, w.y + w.h + 2, { tool: 'pen', seed: 500 + k, double: k === 1 });
    const g2 = rectOf('wg' + k); SK.underline(over, g2.x, g2.x + g2.w - 22, g2.y + g2.h + 4, { tool: 'soft', seed: 510 + k });
  }
  if ($('wn1')) { const wb = rectOf('wn1'); SK.loop(over, wb.x + wb.w / 2 + 2, wb.y + wb.h / 2 + 4, wb.w / 2 + 30, wb.h / 2 + 18, { tool: 'pen', seed: 520 }); }

  /* ── score trend on a torn sheet of lined paper ── */
  const t = boxOf('trend'), S = ST.log.slice(-20).map((r) => r.s);
  const sh = { x: t.x - 96, y: t.y - 96, w: t.w + 166, h: t.h + 196 }, rot = 0.8, ctr = `${sh.x + sh.w / 2} ${sh.y + sh.h / 2}`;
  SK.torn(under, sh.x, sh.y, sh.w, sh.h, { seed: 600, rot, fill: '#fbfaf6', sides: 'tlb', amp: 3.6, shadowOp: 0.3 });
  const rl = SK.el('g', { stroke: '#9fb4c8', 'stroke-width': 0.8, opacity: 0.5, filter: 'url(#sk-print)', transform: `rotate(${rot} ${ctr})` }, under);
  for (let y = sh.y + 48; y < sh.y + sh.h - 14; y += 30) SK.el('path', { d: `M${sh.x + 12} ${y}H${sh.x + sh.w - 12}` }, rl);
  SK.el('path', { d: `M${sh.x + 58} ${sh.y + 6}V${sh.y + sh.h - 6}`, stroke: '#d98b8b', 'stroke-width': 1, opacity: 0.55, transform: `rotate(${rot} ${ctr})` }, under);
  SK.tape(over, sh.x + sh.w / 2, sh.y + 4, 150, 34, -3, { seed: 601, color: '#e6e1d6', op: 0.64 });
  const Ys = (s) => t.y + t.h - (s / 100) * t.h, Xs = (i) => t.x + (S.length > 1 ? (i / (S.length - 1)) * t.w : t.w / 2);
  SK.line(over, t.x - 14, t.y + t.h, t.x + t.w + 14, t.y + t.h + 1, { tool: 'pencil', seed: 610, grow: false, bow: 0.002 });
  for (const s of [0, 50, 100]) NB.text(lab, t.x - 24, Ys(s) + 8, String(s), { font: "'Reenie Beanie'", size: 24, color: '#7b766d', anchor: 'end' });
  for (let x = t.x; x < t.x + t.w; x += 16) SK.line(over, x, Ys(WEAK), x + 7, Ys(WEAK) + 0.3, { tool: 'pen', seed: 620 + x, grow: false, amp: 0.1, op: 0.5, w: 1.1 });
  NB.text(labP, t.x + t.w + 26, Ys(WEAK) + 8, '50', { font: "'Reenie Beanie'", size: 24, color: '#c41a32', anchor: 'start' });
  if (S.length) {
    for (let i = 1; i < S.length; i++) SK.line(over, Xs(i - 1), Ys(S[i - 1]), Xs(i), Ys(S[i]), { tool: 'pencil', seed: 630 + i, grow: false, bow: 0.004, amp: 0.4 });
    S.forEach((s, i) => {
      const low = s < WEAK;
      SK.loop(over, Xs(i), Ys(s), low ? 7 : 4.5, low ? 7 : 4.5, { tool: low ? 'pen' : 'pencil', seed: 640 + i, turns: low ? 3 : 2.6, w: low ? 2.2 : 1.8 });
      if (low) NB.text(labP, Xs(i), Ys(s) + 36, String(s), { font: "'Reenie Beanie'", size: 30, color: '#c41a32' });
    });
    const avg = Math.round(S.reduce((a, b) => a + b, 0) / S.length);
    NB.text(lab, t.x + 4, t.y - 40, '평균 ' + avg + '점', { font: KOS, size: 38 * KS, color: '#34322d', anchor: 'start', rot: -2 });
    NB.text(lab, t.x + t.w, t.y + t.h + 44, '최근 →', { font: KOS, size: 28 * KS, color: '#938c80', anchor: 'end' });
  } else NB.text(lab, t.x + t.w / 2, t.y + t.h / 2, '아직 기록이 없어요', { font: KOS, size: 36 * KS, color: '#938c80' });

  /* ledger: ruled rows, low scores circled */
  const hb = SK.rect_of(page.querySelector('#ledger thead tr'), page);
  SK.line(over, hb.x, hb.y + hb.h, hb.x + hb.w, hb.y + hb.h, { tool: 'pencil', seed: 690, bow: 0.002, grow: false });
  page.querySelectorAll('#ledger tbody tr').forEach((tr, i) => {
    const rb = SK.rect_of(tr, page);
    SK.line(over, rb.x, rb.y + rb.h, rb.x + rb.w, rb.y + rb.h + 0.5, { tool: 'soft', seed: 700 + i, bow: 0.002, grow: false });
  });
  ST.log.slice(-8).reverse().forEach((r, i) => {
    if (r.s >= WEAK || !$('sc' + i)) return;
    const e = rectOf('sc' + i); SK.loop(over, e.x + e.w / 2, e.y + e.h / 2 + 2, e.w / 2 + 14, e.h / 2 + 8, { tool: 'pen', seed: 720 + i });
  });
  for (const [id, k] of [['weakH', 1], ['logH', 2]]) { const h = rectOf(id); SK.stroke(over, [[h.x - 4, h.y + h.h + 2], [h.x + h.w * 0.5, h.y + h.h + 6], [h.x + h.w + 6, h.y + h.h]], { tool: 'pen', seed: 800 + k, w: 2 }); }
}

/* ═══════════ layout ═══════════ */
function layoutGraph() {
  const g = $('graph');
  GRAPH.layout({ x: g.offsetLeft, y: g.offsetTop, w: g.offsetWidth, h: g.offsetHeight });
}
/* the polaroid is taped just past the end of the title — or left out when
   the page is too narrow for both */
function placePolaroid() {
  const p = $('polaroid'), t = $('tMain'), mast = $('mast');
  p.style.display = '';
  const room = mast.offsetWidth + mx() * 0.6, left = $('title').offsetLeft + t.offsetLeft + t.offsetWidth + 44;
  if (page.offsetWidth <= 1100 || left + p.offsetWidth > room) { p.style.display = 'none'; return; }
  p.style.right = 'auto'; p.style.left = left + 'px';
}
function redraw() {
  /* notes need room between the control rows: set before anything is measured */
  $('vProc').classList.toggle('touring', touring());
  placePolaroid();
  if (view === 'proc') { layoutGraph(); buildTracks(); drawRuler(); }
  drawPage(); drawMarks(); markTour();
  placeResult();
}

/* ═══════════ keyboard ═══════════ */
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (window.SHARE && SHARE.isOpen()) { if (e.key === 'Escape') SHARE.close(); return; }
  if (e.key === 'Escape') { closeMenu(); if (resultOpen) stay(); return; }
  if (resultOpen) {
    if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); next(); }
    return;
  }
  if (view !== 'proc') return;
  if (e.code === 'Space') { e.preventDefault(); if (!needSource()) togglePlay(); }
  else if (e.key === 'x' || e.key === 'X') { setSide(side === 'A' ? 'B' : 'A'); ensurePlaying(); tourDone('mon'); }
  else if (e.key === 'Enter') { e.preventDefault(); check(); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    moveActive((e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 / 48 : 1 / 12));
  }
  else if (['1', '2', '3'].includes(e.key) && M.user[+e.key - 1]) { M.active = +e.key - 1; updateReadout(); GRAPH.dirty = true; }
});

/* ═══════════ files dropped anywhere ═══════════ */
let dragDepth = 0;
const dropArt = () => {
  const d = $('drop'); d.querySelectorAll('svg').forEach((s) => s.remove());
  const s = SK.el('svg', {}, null); d.prepend(s);
  const w = innerWidth, h = innerHeight, m = 40;
  SK.box(s, m, m, w - m * 2, h - m * 2, { tool: 'pencil', seed: 97 });
};
addEventListener('dragenter', (e) => { if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return; e.preventDefault(); if (dragDepth++ === 0) { $('drop').hidden = false; dropArt(); } });
addEventListener('dragover', (e) => { if (!$('drop').hidden) e.preventDefault(); });
addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('drop').hidden = true; } });
addEventListener('drop', (e) => {
  e.preventDefault(); dragDepth = 0; $('drop').hidden = true;
  if (e.dataTransfer.files.length) { setView('proc'); addFiles([...e.dataTransfer.files]); }
});

/* ═══════════ frame loop ═══════════ */
let tick = 0;
function frame(now) {
  if (view === 'proc') GRAPH.render(now);
  if ((tick++ % 6) === 0 && view === 'proc' && !live) paintTransport();
  requestAnimationFrame(frame);
}

/* ═══════════ boot ═══════════ */
PENCIL.apply('red', '.click,.click *,.g-live.hot');
(async function boot() {
  rangeVals();
  setVolume(PREF.vol); $('volVal').textContent = PREF.vol;
  GRAPH.init($('gcol'));
  /* people who have already played do not need the first-visit notes */
  if (PREF.tourOff === undefined && ST.total > 0) { PREF.tourOff = true; savePrefs(); }
  GRAPH.model = M; GRAPH.anaOn = PREF.ana; GRAPH.hint = !PREF.hinted && !PREF.tourOff;
  GRAPH.koFont = "'ROH HOE-CHAN'"; GRAPH.koScale = KS;
  GRAPH.ana = () => (analyser ? { node: analyser, data: anaData } : null);
  GRAPH.onGrab = (i) => { M.active = i; updateReadout(); dismissHint(); };
  GRAPH.onMove = () => { setBands(B, M.user); updateReadout(); };
  await initAudio();
  UI.source();
  newRound(false);
  if (!WL && location.protocol === 'file:')
    notice('파일을 직접 열어서 고음질 EQ 엔진이 꺼져 있어요. EQ Trainer.bat으로 열어 주세요.');
  SK.boot(["400 40px 'Reenie Beanie'", "400 40px 'Nothing You Could Do'", "400 30px 'ROH HOE-CHAN'", "400 30px 'Nanum Pen Script'", "400 15px 'Nanum Myeongjo'", "400 14px 'Nanum Gothic Coding'", "400 14px 'Special Elite'"],
    () => {
      /* one permanent set of filter definitions every surface can point at */
      SK.defs(SK.el('svg', { width: 0, height: 0, style: 'position:absolute' }, document.body));
      SK.jitter($('tMain'), 3, 1.2); SK.jitter($('h2P'), 4, 0.7); SK.jitter($('h2S'), 5, 0.7);
      SK.jitter($('askP'), 7, 0.8); SK.jitter($('askS'), 8, 0.8);
    }, redraw);
  requestAnimationFrame(frame);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http'))
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW:', e));
})();
