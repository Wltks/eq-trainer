/* share.js — Stats as a card you can post.
 *
 * The card is 1080 × 1080 (square: Instagram, X, Threads all take it whole).
 * Its marks — paper, tape, rules, hatched bars, rings — are drawn with
 * sketch.js into an SVG that is rasterised once; the lettering is set on top
 * with canvas text in the page's own fonts (an SVG image cannot load them),
 * filled with the same pencil-tooth grain the graph uses.
 *
 * Sharing works the way it does on any site: what goes out is a LINK. The
 * record travels in the link itself (?r=…), and whoever opens it sees this
 * same card drawn for them, with a way in to try it. KakaoTalk goes through
 * Kakao's own share (once a JavaScript key is set below), X and Facebook
 * through their share pages, everything else through the system share sheet
 * or a copied link.
 */
(() => {
  const S = 1080, INK = '#34322d', RED = '#c41a32', SOFT = '#7b766d', LABEL = '#938c80';
  const HAND = "'Reenie Beanie','Nanum Pen Script',sans-serif", PEN = "'Nothing You Could Do','Nanum Pen Script',sans-serif";
  const TYPE = "'Special Elite','Nanum Gothic Coding',monospace", KO = "'ROH HOE-CHAN','Nanum Pen Script',sans-serif";
  /* KakaoTalk share: a JavaScript key from developers.kakao.com (내 애플리케이션 →
     앱 키), with https://wltks.github.io and http://localhost:8765 registered
     as Web platform domains. Empty: the KakaoTalk button uses the system sheet. */
  const KAKAO_KEY = 'cd7f34c548da0a2379ba085e43b9bc2a';
  const PUBLIC = 'https://wltks.github.io/eq-trainer/';
  let card = null;   /* {blob, url, file} for the sheet that is open */
  let snap = null;   /* the record on that card */

  /* ── a record, small enough to ride in a link ── */
  const today = () => { const d = new Date(); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`; };
  const fromStats = () => ({ t: ST.total, o: ST.ok, b: ST.best, d: today(), r: bandRows().map((b) => [b.n, b.ok]) });
  const rowsOf = (S) => OCT.map((f, i) => { const [n, ok] = S.r[i] || [0, 0]; return { f, n, ok, p: n ? Math.round((ok / n) * 100) : 0 }; });
  const enc = (S) => btoa(unescape(encodeURIComponent(JSON.stringify(S)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const dec = (t) => JSON.parse(decodeURIComponent(escape(atob(t.replace(/-/g, '+').replace(/_/g, '/')))));
  const base = () => (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? PUBLIC : location.origin + location.pathname);
  const linkOf = (S) => base() + '?r=' + enc(S);

  /* ── the words that go with it ── */
  function summary(S) {
    const acc = S.t ? Math.round((S.o / S.t) * 100) : 0;
    const weak = rowsOf(S).filter((b) => b.n >= 1).sort((a, b) => a.p - b.p)[0] || null;
    return { acc, weak };
  }
  function shareText(S) {
    const { acc } = summary(S);
    return `EQ 귀 훈련 기록 — ${S.t}문제 · 정답률 ${acc}% · 최고 연속 ${S.b}`;
  }

  /* ── pencil tooth as a fill (same recipe as the graph) ── */
  function grain(ctx, color, seed, holes, bite, faint) {
    const T = 256, c = document.createElement('canvas'); c.width = c.height = T;
    const g = c.getContext('2d'), im = g.createImageData(T, T), r = SK.rng(seed);
    const rgb = [1, 3, 5].map((k) => parseInt(color.slice(k, k + 2), 16));
    const L = 64, lat = new Float32Array(L * L); for (let i = 0; i < L * L; i++) lat[i] = r();
    const at = (x, y) => lat[((y % L + L) % L) * L + ((x % L + L) % L)];
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const u = x / 4, v = y / 4, i0 = Math.floor(u), j0 = Math.floor(v), sm = (t) => t * t * (3 - 2 * t), a = sm(u - i0), b = sm(v - j0);
      const n = (at(i0, j0) * (1 - a) + at(i0 + 1, j0) * a) * (1 - b) + (at(i0, j0 + 1) * (1 - a) + at(i0 + 1, j0 + 1) * a) * b;
      const v2 = n * 0.62 + r() * 0.38, hole = v2 > 1 - holes ? bite : v2 > 1 - holes * 2.2 ? faint : 0, o = (y * T + x) * 4;
      im.data[o] = rgb[0]; im.data[o + 1] = rgb[1]; im.data[o + 2] = rgb[2]; im.data[o + 3] = Math.round((1 - hole) * 255);
    }
    g.putImageData(im, 0, 0);
    return ctx.createPattern(c, 'repeat');
  }
  /* handwriting does not sit on a ruler: each letter leans and lifts a little */
  function handText(ctx, str, x, y, o) {
    ctx.save();
    ctx.font = o.font; ctx.fillStyle = o.fill; ctx.textBaseline = 'alphabetic';
    const r = SK.rng(o.seed || 1), amt = o.jitter ?? 1, ws = [...str].map((ch) => ctx.measureText(ch).width);
    const total = ws.reduce((a, b) => a + b, 0) + (o.track || 0) * (ws.length - 1);
    let cx = o.align === 'center' ? x - total / 2 : o.align === 'right' ? x - total : x;
    ctx.translate(0, 0);
    if (o.rot) { ctx.translate(x, y); ctx.rotate((o.rot * Math.PI) / 180); ctx.translate(-x, -y); }
    [...str].forEach((ch, i) => {
      ctx.save();
      ctx.translate(cx + ws[i] / 2, y + (r() - 0.5) * 5 * amt);
      ctx.rotate(((r() - 0.5) * 6 * amt * Math.PI) / 180);
      ctx.fillText(ch, -ws[i] / 2, 0);
      ctx.restore();
      cx += ws[i] + (o.track || 0);
    });
    ctx.restore();
    return total;
  }

  /* ── the card ── */
  async function makeCard(Sn) {
    await document.fonts.ready;
    const { acc, weak } = summary(Sn), rows = rowsOf(Sn);
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const ctx = cv.getContext('2d');
    /* the ring goes round the accuracy as it will actually be lettered */
    const accTxt = Sn.t ? acc + '%' : '—';
    ctx.font = `122px ${HAND}`; const accW = ctx.measureText(accTxt).width;

    /* marks: an svg of its own, filters and all, rasterised once */
    const svg = SK.el('svg', { width: S, height: S, viewBox: `0 0 ${S} ${S}` }, null);
    SK.defs(svg);
    const pd = SK.el('defs', {}, svg);
    pd.innerHTML = `<filter id="tooth" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.62" numOctaves="2" seed="21"/><feColorMatrix values="0 0 0 0 .32  0 0 0 0 .3  0 0 0 0 .28  0 0 0 .14 -.045"/></filter>
      <filter id="cockle" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.0025 0.004" numOctaves="3" seed="8"/><feColorMatrix values="0 0 0 0 .42  0 0 0 0 .4  0 0 0 0 .38  0 0 0 .11 -.035"/></filter>`;
    SK.el('rect', { width: S, height: S, fill: '#f4f2ee' }, svg);
    SK.el('rect', { width: S, height: S, filter: 'url(#cockle)' }, svg);
    SK.el('rect', { width: S, height: S, filter: 'url(#tooth)' }, svg);
    SK.tape(svg, 300, 148, 300, 58, -4, { seed: 33, color: '#ebe6da', op: 0.92 });
    const RULE = { tool: 'pencil', bow: 0.002, grow: false, amp: 1.1 };
    SK.line(svg, 66, 420, 1014, 421, { ...RULE, seed: 11 });
    SK.line(svg, 68, 640, 1012, 639, { ...RULE, seed: 12 });
    for (const [x, k] of [[400, 0], [730, 1]]) SK.line(svg, x, 448, x + 1, 612, { tool: 'pencil', seed: 13 + k, grow: false });
    SK.loop(svg, 436 + accW / 2, 562, accW / 2 + 44, 50, { tool: 'pen', seed: 51 });

    /* accuracy per octave band, the same hatched bars as the page */
    const c = { x: 120, y: 712, w: 880, h: 186 }, n = rows.length, slot = c.w / n, bw = slot * 0.44, b0 = c.y + c.h;
    const Yp = (p) => b0 - (p / 100) * c.h;
    SK.line(svg, c.x - 30, b0, c.x + c.w + 10, b0 + 1, { tool: 'pencil', seed: 101, bow: 0.002, grow: false });
    SK.line(svg, c.x - 10, Yp(80), c.x + c.w, Yp(80) - 1, { tool: 'pen', seed: 102, bow: 0.002, grow: false, w: 1.4, op: 0.75 });
    rows.forEach((r, i) => {
      const cx = c.x + slot * (i + 0.5), x = cx - bw / 2;
      if (r.n < 1) {
        const hb = Yp(18), seg = [[[x, b0], [x, hb]], [[x, hb], [x + bw, hb]], [[x + bw, hb], [x + bw, b0]]];
        for (const [a, b2] of seg) for (let t = 0; t < 1; t += 0.14)
          SK.line(svg, a[0] + (b2[0] - a[0]) * t, a[1] + (b2[1] - a[1]) * t, a[0] + (b2[0] - a[0]) * (t + 0.07), a[1] + (b2[1] - a[1]) * (t + 0.07), { tool: 'soft', seed: i * 50 + t * 100, grow: false, amp: 0.1 });
        return;
      }
      if (r.p <= 0) return;
      const top = Yp(r.p), tool = r.p < 50 ? 'pen' : r.p >= 80 ? 'pencil' : 'soft';
      SK.stroke(svg, [[x, b0], [x - 1, top], [x + bw, top + 1], [x + bw + 1, b0]], { tool, seed: 200 + i, grow: false, amp: 0.5, bow: 0.002 });
      SK.hatch(svg, x + 2, top + 3, bw - 4, b0 - top - 4, { seed: 300 + i, angle: 62, gap: r.p >= 80 ? 4.2 : r.p < 50 ? 5.5 : 6.5, tool, ragged: 2 });
    });
    if (weak) SK.underline(svg, 330, 560, 1032, { tool: 'pen', seed: 77 });
    NB.star(svg, 990, 96, 14, { tool: 'pencil', w: 2.2, seed: 9 });

    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
    const img = new Image(); img.src = url;
    await img.decode(); URL.revokeObjectURL(url);

    ctx.drawImage(img, 0, 0);
    const PG = grain(ctx, INK, 8, 0.2, 0.8, 0.28), PR = grain(ctx, RED, 19, 0.08, 0.6, 0.12);

    /* lettering */
    handText(ctx, 'MY PERSONAL', 300, 158, { font: `22px ${TYPE}`, fill: INK, align: 'center', track: 7, rot: -4, jitter: 0.2, seed: 2 });
    handText(ctx, 'EQ Workbook', 540, 330, { font: `176px ${HAND}`, fill: PG, align: 'center', seed: 3, jitter: 1.2 });
    handText(ctx, 'Stats', 70, 396, { font: `52px ${PEN}`, fill: PR, rot: -3, seed: 4, jitter: 0.6 });
    const date = Sn.d || today();
    handText(ctx, date, 1012, 392, { font: `20px ${TYPE}`, fill: LABEL, align: 'right', track: 3, jitter: 0, seed: 5 });
    const col = [[110, 'ANSWERED', String(Sn.t), PG], [440, 'ACCURACY', accTxt, PR], [770, 'BEST STREAK', String(Sn.b), PG]];
    for (const [x, lab, val, fill] of col) {
      handText(ctx, lab, x, 486, { font: `19px ${TYPE}`, fill: LABEL, track: 5, jitter: 0, seed: x });
      handText(ctx, val, x - 4, 598, { font: `122px ${HAND}`, fill, seed: x + 1, jitter: 0.8 });
    }
    rows.forEach((r, i) => {
      const cx = c.x + slot * (i + 0.5);
      handText(ctx, r.f >= 1000 ? r.f / 1000 + 'k' : String(r.f), cx, b0 + 40, { font: `32px ${HAND}`, fill: INK, align: 'center', seed: 40 + i, jitter: 0.5 });
      if (r.n >= 1) handText(ctx, r.p + '%', cx, Yp(r.p) - 14, { font: `34px ${HAND}`, fill: r.p < 50 ? RED : INK, align: 'center', seed: 60 + i, jitter: 0.5 });
    });
    handText(ctx, '목표 80%', c.x + c.w + 4, Yp(80) - 12, { font: `${Math.round(34 * KS)}px ${KO}`, fill: RED, align: 'right', rot: -2, seed: 70, jitter: 0.3 });
    if (weak) {
      handText(ctx, '요즘 약한 대역', 70, 1022, { font: `${Math.round(40 * KS)}px ${KO}`, fill: PG, seed: 80, jitter: 0.4 });
      handText(ctx, (weak.f >= 1000 ? weak.f / 1000 + ' kHz' : weak.f + ' Hz'), 340, 1022, { font: `46px ${PEN}`, fill: PR, seed: 81, jitter: 0.5 });
    }
    handText(ctx, 'MY PERSONAL EQ WORKBOOK', 1012, 1030, { font: `16px ${TYPE}`, fill: LABEL, align: 'right', track: 4, jitter: 0, seed: 90 });

    const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
    const file = new File([blob], `eq-workbook-stats-${date.replace(/\./g, '')}.png`, { type: 'image/png' });
    return { blob, file, url: URL.createObjectURL(blob) };
  }

  /* ── the sheet ── */
  const $ = (id) => document.getElementById(id);
  const canNative = (f) => !!(navigator.canShare && navigator.share && navigator.canShare({ files: [f] }));
  async function copyImage() {
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': card.blob })]); return true; }
    catch (e) { return false; }
  }
  function drawSheet() {
    const panel = $('ssPanel');
    panel.querySelectorAll(':scope > svg').forEach((s) => s.remove());
    const w = panel.offsetWidth, h = panel.offsetHeight, s = SK.el('svg', { width: w, height: h }, null);
    panel.prepend(s);
    SK.torn(s, 0, 0, w, h, { seed: 121, rot: -0.6, fill: '#fbfaf6', sides: 'tlr', amp: 3.6, shadowOp: 0.34, sy: 6, sx: 3 });
    SK.tape(s, w / 2, 6, 150, 34, -2, { seed: 122, color: '#e6e1d6', op: 0.66 });
    const pr = panel.getBoundingClientRect();
    panel.querySelectorAll('.ss-b').forEach((b, i) => {
      if (b.hidden) return;
      const r = b.getBoundingClientRect();
      SK.underline(s, r.left - pr.left, r.right - pr.left, r.bottom - pr.top + 2, { tool: b.classList.contains('main') ? 'pen' : 'soft', seed: 130 + i });
    });
  }
  async function show(Sn, viewing) {
    const sheet = $('shareSheet');
    snap = Sn;
    $('ssPanel').classList.toggle('viewing', !!viewing);
    sheet.hidden = false; $('ssImg').removeAttribute('src'); $('ssPanel').classList.add('busy');
    try { card = await makeCard(Sn); }
    catch (e) { sheet.hidden = true; notice('공유 이미지를 만들지 못했어요.'); console.warn(e); return; }
    $('ssImg').src = card.url; $('ssPanel').classList.remove('busy');
    requestAnimationFrame(drawSheet);
  }
  function open() {
    if (!ST.total) { notice('아직 공유할 기록이 없어요. 몇 문제 풀고 다시 눌러 주세요.'); return; }
    show(fromStats(), false);
  }
  function close() {
    $('shareSheet').hidden = true;
    if (card) { URL.revokeObjectURL(card.url); card = null; }
    /* a shared record is shown once; the address goes back to the plain page */
    if (location.search.includes('r=')) history.replaceState(null, '', location.pathname);
  }
  window.SHARE = { open, close, isOpen: () => !$('shareSheet').hidden };

  $('shareSheet').addEventListener('click', (e) => { if (e.target.id === 'shareSheet') close(); });
  $('ssClose').onclick = close;
  $('ssTry').onclick = close;

  const popup = (u) => window.open(u, 'share', 'width=620,height=640,noopener');
  async function copyText(t) { try { await navigator.clipboard.writeText(t); return true; } catch (e) { return false; } }

  /* X and Facebook: their own share pages, filled in */
  $('ssX').onclick = () => { if (snap) popup('https://x.com/intent/post?text=' + encodeURIComponent(shareText(snap)) + '&url=' + encodeURIComponent(linkOf(snap))); };
  $('ssFb').onclick = () => { if (snap) popup('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(linkOf(snap))); };

  /* the system share sheet: the link, and the card image where the device takes files */
  async function systemShare() {
    const url = linkOf(snap), text = shareText(snap);
    if (!navigator.share) {
      notice((await copyText(url)) ? '이 브라우저엔 공유 창이 없어서 링크를 복사했어요.' : '이 브라우저엔 공유 창이 없어요. 이미지 저장을 써 주세요.');
      return;
    }
    const withFile = { title: 'My Personal EQ Workbook', text: text + '\n' + url, files: [card.file] };
    const data = navigator.canShare && navigator.canShare(withFile) ? withFile : { title: 'My Personal EQ Workbook', text, url };
    try { await navigator.share(data); }
    catch (e) { if (e.name !== 'AbortError') notice('공유하지 못했어요: ' + e.message); }
  }
  $('ssNative').onclick = () => { if (snap) systemShare(); };
  $('ssLink').onclick = async () => { if (snap) notice((await copyText(linkOf(snap))) ? '링크를 복사했어요. 인스타그램·디스코드 등 어디든 붙여넣으세요.' : '링크를 복사하지 못했어요.'); };
  $('ssSave').onclick = () => {
    if (!card) return;
    const a = document.createElement('a'); a.href = card.url; a.download = card.file.name; a.click();
  };

  /* KakaoTalk: Kakao's own share — the card is uploaded to Kakao and sent as a
     feed message with a button back to the record */
  let kakao = null;
  function kakaoReady() {
    if (!KAKAO_KEY) return Promise.resolve(false);
    if (kakao) return kakao;
    kakao = new Promise((res) => {
      const sc = document.createElement('script');
      sc.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js';
      sc.crossOrigin = 'anonymous';
      sc.onload = () => { try { if (!window.Kakao.isInitialized()) window.Kakao.init(KAKAO_KEY); res(true); } catch (e) { res(false); } };
      sc.onerror = () => res(false);
      document.head.appendChild(sc);
    });
    return kakao;
  }
  $('ssKakao').onclick = async () => {
    if (!snap) return;
    if (!(await kakaoReady())) return systemShare();
    try {
      const up = await window.Kakao.Share.uploadImage({ file: [card.file] });
      const url = linkOf(snap), link = { mobileWebUrl: url, webUrl: url };
      window.Kakao.Share.sendDefault({
        objectType: 'feed',
        content: { title: 'My Personal EQ Workbook', description: shareText(snap), imageUrl: up.infos.original.url, link },
        buttons: [{ title: '기록 보기', link }, { title: '나도 해보기', link: { mobileWebUrl: base(), webUrl: base() } }],
      });
    } catch (e) { console.warn(e); systemShare(); }
  };

  /* someone opened a shared link: show them that record */
  const q = new URLSearchParams(location.search).get('r');
  if (q) {
    let S = null; try { S = dec(q); } catch (e) {}
    if (S && Array.isArray(S.r)) {
      const go = () => show(S, true);
      if (document.readyState === 'complete') setTimeout(go, 300); else addEventListener('load', () => setTimeout(go, 300));
    }
  }
})();
