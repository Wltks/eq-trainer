/* graph.js — the EQ graph, drawn by hand, live.
 *
 * Two layers in one positioned host:
 *   · an SVG made once per layout with sketch.js — the torn sheet of graph
 *     paper, tape, axes, the hatched-off frequencies outside the range;
 *   · a canvas redrawn every frame — the analyser (pencil hatching that rises
 *     and falls with the music), the red ballpoint curve, the nodes.
 *
 * The canvas marks are built the way sketch.js builds its SVG strokes: a
 * centre-line displaced by seeded noise, then filled as a ribbon that swells
 * and tapers — filled with a pattern that already has the paper tooth bitten
 * out of it, so the grain costs nothing per frame. Noise is anchored to
 * the paper (x position), not to the line, so when a node moves the line is
 * re-drawn in place rather than sliding a fixed squiggle along. While a node
 * is being dragged the marks "boil" between three takes, like hand-drawn
 * animation.
 */
(() => {
  const G = (window.GRAPH = {});
  const L0 = Math.log10(20), LS = 3;          // 20 Hz … 20 kHz
  const RED = '#c41a32', GRAPHITE = '#3a3833', SOFT = '#55524b';
  const BOIL_MS = 110, BOIL_TAKES = 3;

  let host, svg, cv, cx, dpr = 1, P_SOFT, P_GRAPH, P_RED;
  let R = { x: 0, y: 0, w: 1, h: 1 };          // plot rect (host px)
  let C = { x: 0, y: 0, w: 1, h: 1 };          // canvas rect (host px)
  let y0 = 0, kdb = 1;
  const fx = (f) => R.x + ((Math.log10(f) - L0) / LS) * R.w;
  const xf = (x) => 10 ** (L0 + ((x - R.x) / R.w) * LS);
  const Y = (db) => y0 - db * kdb;
  G.fx = fx; G.xf = xf;
  /* the page is drawn at a zoom: screen px per page px */
  const zoom = () => (host ? host.getBoundingClientRect().width / (host.offsetWidth || 1) : 1) || 1;

  /* state the app owns; read every frame */
  G.model = null;          // {user, target, active, revealed}
  G.range = [60, 12000];
  G.anaOn = true;
  G.ana = null;            // () => {node, data} | null
  G.hint = false;          // the "좌우로만 움직여요" note
  G.koFont = "'Nanum Pen Script'";
  G.koScale = 1;
  G.onMove = null; G.onGrab = null; G.onDrop = null;
  G.dirty = true;

  /* ── seeded noise (same family as sketch.js) ── */
  const NZ = new Map();
  const noise = (seed) => { let n = NZ.get(seed); if (!n) NZ.set(seed, (n = SK.noise(seed))); return n; };
  const fbm = SK.fbm;

  /* ── grain: a tile of colour with the paper tooth bitten out of it.
     Marks are filled with it directly, so there is no extra pass per frame. ── */
  function grain(color, seed, holes, bite, faint) {
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), im = g.createImageData(S, S), r = SK.rng(seed);
    const rgb = [1, 3, 5].map((k) => parseInt(color.slice(k, k + 2), 16));
    /* clustered rather than per-pixel: tooth is a few pixels across */
    const L = 64, lat = new Float32Array(L * L); for (let i = 0; i < L * L; i++) lat[i] = r();
    const at = (x, y) => lat[((y % L + L) % L) * L + ((x % L + L) % L)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / 4, v = y / 4, i0 = Math.floor(u), j0 = Math.floor(v), fu = u - i0, fv = v - j0;
      const sm = (t) => t * t * (3 - 2 * t), a = sm(fu), b = sm(fv);
      const n = (at(i0, j0) * (1 - a) + at(i0 + 1, j0) * a) * (1 - b) + (at(i0, j0 + 1) * (1 - a) + at(i0 + 1, j0 + 1) * a) * b;
      const v2 = n * 0.62 + r() * 0.38;
      const hole = v2 > 1 - holes ? bite : v2 > 1 - holes * 2.2 ? faint : 0, o = (y * S + x) * 4;
      im.data[o] = rgb[0]; im.data[o + 1] = rgb[1]; im.data[o + 2] = rgb[2];
      im.data[o + 3] = Math.round((1 - hole) * 255);
    }
    g.putImageData(im, 0, 0);
    return cx.createPattern(c, 'repeat');
  }

  /* ── a stroke as a filled ribbon: width breathes, ends taper ── */
  function ribbon(ctx, P, wfun) {
    const n = P.length; if (n < 2) return;
    const A = new Array(n), Bq = new Array(n);
    for (let i = 0; i < n; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const w = wfun(i / (n - 1)) / 2;
      A[i] = [P[i][0] - dy * w, P[i][1] + dx * w]; Bq[i] = [P[i][0] + dy * w, P[i][1] - dx * w];
    }
    ctx.beginPath();
    ctx.moveTo(A[0][0], A[0][1]);
    for (let i = 1; i < n; i++) ctx.lineTo(A[i][0], A[i][1]);
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(Bq[i][0], Bq[i][1]);
    ctx.closePath(); ctx.fill();
  }
  const pressure = (np, W, taper) => (u) => {
    let w = W * (0.7 + 0.55 * (fbm(np, u * 5, 2) * 0.5 + 0.5));
    if (u < taper) w *= 0.3 + 0.7 * Math.sin((u / taper) * Math.PI / 2);
    if (u > 1 - taper) w *= 0.3 + 0.7 * Math.sin(((1 - u) / taper) * Math.PI / 2);
    return Math.max(0.2, w);
  };

  /* loops and arrows are cached in local coordinates per take */
  const cache = new Map();
  function loopPts(rx, ry, seed) {
    const r = SK.rng(seed * 13), n = noise(seed * 13 + 1);
    const turns = 1.18, a0 = r() * Math.PI * 2, tilt = ((r() - 0.5) * 16 * Math.PI) / 180;
    const ct = Math.cos(tilt), st = Math.sin(tilt), bulge = 0.08 + r() * 0.1, bAng = r() * Math.PI * 2;
    const steps = 64, pts = [];
    for (let i = 0; i <= steps; i++) {
      const u = i / steps, a = a0 + u * turns * Math.PI * 2;
      const k = 1 + 0.1 * fbm(n, u * 3.2, 2) + bulge * Math.cos(a - bAng) + (u > 0.8 ? (u - 0.8) * 0.5 : 0);
      const ex = Math.cos(a) * rx * k, ey = Math.sin(a) * ry * k;
      pts.push([ex * ct - ey * st, ex * st + ey * ct]);
    }
    return pts;
  }
  function arrowPts(x1, y1, x2, y2, bend, head, seed) {
    const r = SK.rng(seed * 3), mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1;
    const qx = mx - dy * bend, qy = my + dx * bend, body = [];
    for (let i = 0; i <= 24; i++) { const t = i / 24; body.push([(1 - t) ** 2 * x1 + 2 * (1 - t) * t * qx + t * t * x2, (1 - t) ** 2 * y1 + 2 * (1 - t) * t * qy + t * t * y2]); }
    const ang = Math.atan2(y2 - qy, x2 - qx), sp = 0.42 + r() * 0.16;
    const tip = [[x2 - Math.cos(ang - sp) * head, y2 - Math.sin(ang - sp) * head], [x2, y2], [x2 - Math.cos(ang + sp) * head * 0.85, y2 - Math.sin(ang + sp) * head * 0.85]];
    return [body, tip];
  }
  /* displace a polyline sideways (used for the cached shapes) */
  function wobble(P, amp, seed) {
    const n = noise(seed), out = [];
    let L = 0;
    for (let i = 0; i < P.length; i++) {
      if (i) L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
      const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1;
      const d = amp * fbm(n, L / 40, 2);
      out.push([P[i][0] - (dy / l) * d, P[i][1] + (dx / l) * d]);
    }
    return out;
  }
  function shape(key, make) { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); }
  /* draw a cached local-space stroke list at (x, y) */
  function stamp(ctx, strokes, x, y, fill, alpha) {
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = fill; ctx.globalAlpha = alpha;
    for (const [P, W, seed] of strokes) ribbon(ctx, P, pressure(noise(seed), W, 0.14));
    ctx.restore();
  }

  /* ════════ layout ════════ */
  G.init = (el) => {
    host = el;
    /* both on layers of their own: the canvas changes every frame, and the
       filtered sheet under it must not be re-rasterised each time it does */
    svg = SK.el('svg', { class: 'g-art', style: 'position:absolute;left:0;top:0;overflow:visible;pointer-events:none;z-index:0;will-change:transform' }, host);
    cv = document.createElement('canvas'); cv.className = 'g-live';
    cv.style.cssText = 'position:absolute;z-index:1;touch-action:none;will-change:transform';
    host.appendChild(cv);
    cx = cv.getContext('2d');
    P_SOFT = grain(SOFT, 7, 0.2, 0.85, 0.3);
    P_GRAPH = grain(GRAPHITE, 8, 0.2, 0.8, 0.28);
    P_RED = grain(RED, 19, 0.08, 0.6, 0.12);
    /* nothing to draw while the graph is scrolled out of view */
    new IntersectionObserver((es) => { G.visible = es[0].isIntersecting; G.dirty = true; }).observe(host);
    bindPointer();
  };

  /* r: the plot box inside the host (host px) */
  G.layout = (r) => {
    R = r;
    y0 = R.y + R.h * 0.66; kdb = (R.h * 0.42) / 10;
    C = { x: R.x - 96, y: R.y - 86, w: R.w + 170, h: R.h + 150 };
    /* the page is drawn at a zoom: back the canvas with screen pixels, not
       page pixels — sharper and cheaper both */
    dpr = Math.min(2, window.devicePixelRatio || 1) * zoom();
    cv.width = Math.round(C.w * dpr); cv.height = Math.round(C.h * dpr);
    Object.assign(cv.style, { left: C.x + 'px', top: C.y + 'px', width: C.w + 'px', height: C.h + 'px' });
    cx.setTransform(dpr, 0, 0, dpr, -C.x * dpr, -C.y * dpr);
    svg.setAttribute('width', host.offsetWidth); svg.setAttribute('height', host.offsetHeight);
    buildColumns();
    G.drawArt();
    G.dirty = true;
  };

  /* ════════ the static sheet ════════ */
  G.drawArt = () => {
    while (svg.firstChild) svg.firstChild.remove();
    svg._L = null;
    const [lo, hi] = G.range;
    /* the sheet keeps its margins where there is room, and tucks in where there is not */
    const narrow = R.w < 520, hw = host.offsetWidth;
    const pL = Math.min(76, R.x + 14), pR = Math.min(50, hw - R.x - R.w + 14);
    SK.torn(svg, R.x - pL, R.y - 66, R.w + pL + pR, R.h + (narrow ? 112 : 140), { seed: 51, rot: narrow ? -0.3 : -0.5, fill: '#fafaf7', pattern: ['sk-graph', 'sk-graph-major'], patOp: 0.7, sides: 'trb', amp: 3.6, shadowOp: 0.3 });
    SK.tape(svg, R.x - pL + 30, R.y - 56, narrow ? 90 : 124, 30, -32, { seed: 52, color: '#e6e1d6', op: 0.62 });
    SK.tape(svg, R.x + R.w + pR - 20, R.y - 52, narrow ? 84 : 116, 30, 28, { seed: 53, color: '#e6e1d6', op: 0.62 });
    /* frequencies outside the range are shaded off */
    const xl = fx(lo), xh = fx(hi);
    SK.hatch(svg, R.x, R.y, xl - R.x, R.h, { seed: 56, angle: 58, gap: 7, tool: 'soft' });
    SK.hatch(svg, xh, R.y, R.x + R.w - xh, R.h, { seed: 57, angle: 58, gap: 7, tool: 'soft' });
    const rr = SK.rng(99);
    for (const x of [xl, xh]) for (let yy = R.y + 4; yy < R.y + R.h - 6; yy += 13 + rr() * 4)
      SK.line(svg, x + (rr() - 0.5), yy, x + (rr() - 0.5), yy + 6 + rr() * 3, { tool: 'pencil', seed: 7 * x + yy, grow: false, amp: 0.2 });
    /* axes and rules */
    SK.line(svg, R.x - 8, Y(0), R.x + R.w + 10, Y(0), { tool: 'pencil', seed: 61, bow: 0.002, grow: false, amp: 1.1 });
    SK.line(svg, R.x + 4, Y(10), R.x + R.w - 4, Y(10), { tool: 'soft', seed: 62, bow: 0.002, grow: false, amp: 1 });
    SK.line(svg, R.x - 4, R.y + R.h, R.x + R.w + 6, R.y + R.h + 1, { tool: 'pencil', seed: 63, bow: 0.002, grow: false, amp: 1.1 });
    const lab = SK.layer(svg, 'pencil'), lt = { font: "'Reenie Beanie'", size: narrow ? 21 : 26, color: '#34322d' };
    NB.text(lab, R.x - 16, Y(0) + 8, '0 dB', { ...lt, anchor: 'end' });
    NB.text(lab, R.x - 16, Y(10) + 8, '+10', { ...lt, anchor: 'end' });
    [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000].forEach((f, i) => {
      const x = fx(f);
      SK.line(svg, x, R.y + R.h - 7, x + (i % 2 ? 0.8 : -0.6), R.y + R.h + 7, { tool: 'pencil', seed: 70 + i, grow: false });
      /* on a narrow plot every other label, so they do not run together */
      if (!narrow || i % 2 === 0) NB.text(lab, x, R.y + R.h + (narrow ? 30 : 36), f >= 1000 ? f / 1000 + 'k' : String(f), lt);
    });
  };

  /* ════════ analyser columns: fixed on the paper, tops move ════════ */
  let cols = null;
  function buildColumns() {
    const r = SK.rng(77), xs = [];
    for (let x = fx(25); x <= fx(17500); x += 5.6 * (0.7 + r() * 0.6)) xs.push(x);
    cols = xs.map((x) => ({
      x, f0: xf(x - 2.8), f1: xf(x + 2.8), fc: xf(x),
      sl: 2 + r() * 3, j1: r() * 3, j2: (r() - 0.5) * 2, jb: r() * 4,
      a: 0.55 + r() * 0.7, lev: 0,
    }));
  }
  let quiet = true, ref = null;
  function readAnalyser() {
    const src = G.anaOn && G.ana && G.ana();
    let any = false;
    if (src) {
      src.node.getFloatFrequencyData(src.data);
      const bins = src.data.length, nyq = (src.node.context.sampleRate) / 2;
      let sum = 0, cnt = 0;
      for (const c of cols) {
        const b0 = Math.max(0, Math.min(bins - 1, Math.floor((c.f0 / nyq) * bins)));
        const b1 = Math.max(b0 + 1, Math.min(bins, Math.ceil((c.f1 / nyq) * bins)));
        let s = 0, k = 0;
        for (let b = b0; b < b1; b++) { const v = src.data[b]; if (isFinite(v)) { s += v; k++; } }
        /* +3 dB/oct: pink noise reads flat, music leans gently down */
        c.db = (k ? s / k : -140) + 3 * Math.log2(Math.max(20, c.fc) / 1000);
        if (c.db > -118) { sum += c.db; cnt++; }
      }
      /* the drawing follows the overall level slowly, so a quiet file and a
         loud one sit at the same height and your +10 dB always shows */
      const live = cnt > cols.length * 0.3;
      if (live) {
        const m = sum / cnt;
        ref = ref === null ? m : ref + (m - ref) * (Math.abs(m - ref) > 6 ? 0.25 : 0.03);   // catch up fast, then drift
      }
      for (const c of cols) {
        let t = !live || c.db < -118 ? 0 : Math.max(0, 0.4 + (c.db - ref) / 40);
        if (t > 0.78) t = 0.78 + 0.22 * Math.tanh((t - 0.78) / 0.22);   // a soft ceiling, never a flat top
        c.lev += (t - c.lev) * (t > c.lev ? 0.5 : 0.16);
        if (c.lev > 0.004) any = true;
      }
    } else {
      for (const c of cols) { c.lev *= 0.86; if (c.lev > 0.004) any = true; }
    }
    quiet = !any;
  }
  function drawAnalyser(ctx) {
    if (quiet) return;
    const base = R.y + R.h, Hs = R.h * 0.4;
    /* neighbouring columns are averaged so the tops read as one contour */
    const n = cols.length, top = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = (cols[Math.max(0, i - 1)].lev + cols[i].lev * 2 + cols[Math.min(n - 1, i + 1)].lev) / 4;
      top[i] = base - v * Hs;
    }
    /* hatching, in four pressure groups so each group is one path */
    ctx.lineCap = 'round'; ctx.strokeStyle = P_SOFT; ctx.lineWidth = 1.05;
    for (let g = 0; g < 4; g++) {
      ctx.beginPath();
      for (let i = g; i < n; i += 4) {
        const c = cols[i], t = top[i] + c.j1;
        if (base - t < 5) continue;
        ctx.moveTo(c.x + c.sl, t);
        ctx.lineTo(c.x - c.sl * 0.4 + c.j2, base - c.jb);
      }
      ctx.globalAlpha = 0.34 * (0.6 + g * 0.18);
      ctx.stroke();
    }
    /* the contour, a soft pencil line along the tops */
    const P = [], wn = noise(5);
    for (let i = 0; i < n; i++) P.push([cols[i].x, top[i] + wn(cols[i].x / 23) * 0.7]);
    ctx.globalAlpha = 0.62; ctx.fillStyle = P_SOFT;
    ribbon(ctx, P, pressure(noise(6), 1.25, 0.04));
    ctx.globalAlpha = 1;
  }

  /* ════════ curves ════════ */
  const NCURVE = 360;
  const cf = new Float32Array(NCURVE), resp = new Float32Array(NCURVE), respT = new Float32Array(NCURVE);
  let respKey = '', respTKey = '';
  function freqs() { for (let i = 0; i < NCURVE; i++) cf[i] = xf(R.x - 6 + ((R.w + 12) * i) / (NCURVE - 1)); }
  const keyOf = (bands) => bands.map((b) => b.f.toFixed(2) + ',' + b.g + ',' + b.q).join('|') + '@' + R.w;
  function response(bands, out, k) {
    if (k === 'u' ? respKey === keyOf(bands) : respTKey === keyOf(bands)) return out;
    freqs(); bandsResponseDb(bands, cf, out);
    if (k === 'u') respKey = keyOf(bands); else respTKey = keyOf(bands);
    return out;
  }
  /* the ballpoint line: noise anchored to the paper, one take per boil frame */
  function penCurve(ctx, db, take, color, W, alpha, retrace) {
    const n1 = noise(31 + take * 7), n2 = noise(32 + take * 7), P = [];
    for (let i = 0; i < NCURVE; i++) {
      const x = R.x - 6 + ((R.w + 12) * i) / (NCURVE - 1);
      const y = Y(db[i]) + 1.1 * fbm(n1, x / 90, 3) + 0.28 * n2(x / 6);
      P.push([x, y]);
    }
    ctx.fillStyle = color; ctx.globalAlpha = alpha;
    ribbon(ctx, P, pressure(noise(33 + take), W, 0.05));
    if (retrace) {   /* the second, lighter pass that starts late and lifts early */
      const n3 = noise(41 + take * 5), Q = [];
      for (let i = Math.floor(NCURVE * 0.05); i < Math.floor(NCURVE * 0.9); i++) {
        const x = P[i][0];
        Q.push([x, Y(db[i]) + 1.9 * fbm(n3, x / 70, 3)]);
      }
      ctx.globalAlpha = alpha * 0.42;
      ribbon(ctx, Q, pressure(noise(43 + take), W * 0.62, 0.08));
    }
    ctx.globalAlpha = 1;
  }
  /* the answer: graphite, dashed the way a hand dashes — uneven gaps */
  function dashedCurve(ctx, db) {
    const n1 = noise(51), r = SK.rng(52);
    ctx.fillStyle = P_GRAPH; ctx.globalAlpha = 0.85;
    let i = 0;
    while (i < NCURVE - 2) {
      const len = 5 + Math.floor(r() * 3), seg = [];
      for (let k = 0; k <= len && i + k < NCURVE; k++) {
        const x = R.x - 6 + ((R.w + 12) * (i + k)) / (NCURVE - 1);
        seg.push([x, Y(db[i + k]) + 0.9 * fbm(n1, x / 60, 2)]);
      }
      if (seg.length > 1) ribbon(ctx, seg, pressure(noise(60 + i), 1.6, 0.25));
      i += len + 3 + Math.floor(r() * 2);
    }
    ctx.globalAlpha = 1;
  }

  /* ════════ nodes ════════ */
  const NR = 21;
  function nodeShape(i, take, big) {
    return shape(`n${i}.${take}.${big}`, () => {
      const P = wobble(loopPts(NR * (big ? 1.06 : 1), NR * (big ? 1.06 : 1), 12 + i * 5 + take * 101), 0.5, 3 + take);
      return [[P, big ? 2.1 : 1.75, 70 + i + take]];
    });
  }
  function arrowShape(take) {
    return shape(`a.${take}`, () => {
      const L = arrowPts(-NR - 10, 1, -NR - 60, 3, 0.06, 11, 13 + take * 9), Rr = arrowPts(NR + 10, 1, NR + 60, -1, -0.06, 11, 14 + take * 9);
      return [[wobble(L[0], 0.4, 80 + take), 1.5, 81], [L[1], 1.4, 82], [wobble(Rr[0], 0.4, 83 + take), 1.5, 84], [Rr[1], 1.4, 85]];
    });
  }
  function targetMark() {
    return shape('t', () => [[wobble(loopPts(9, 9, 77), 0.3, 78), 1.3, 79]]);
  }
  function hintShape(flip) {
    return shape('h' + flip, () => {
      const s = flip ? -1 : 1, a = arrowPts(146 * s, -58, 32 * s, -16, 0.25 * s, 12, 56);
      return [[wobble(a[0], 0.5, 57), 1.6, 58], [a[1], 1.5, 59]];
    });
  }

  /* ════════ frame ════════ */
  let lastTake = -1, lastQuiet = true;
  G.visible = true;
  G.render = (now) => {
    const M = G.model; if (!M || !cols || !G.visible) return;
    const dragging = drag >= 0;
    const take = dragging ? Math.floor(now / BOIL_MS) % BOIL_TAKES : 0;
    readAnalyser();
    /* idle paper is not redrawn; one last frame clears a fading analyser */
    const needs = G.dirty || !quiet || quiet !== lastQuiet || take !== lastTake;
    if (!needs) return;
    lastTake = take; lastQuiet = quiet; G.dirty = false;

    cx.save(); cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, cv.width, cv.height); cx.restore();
    /* graphite: the analyser, and the answer once it is shown */
    cx.save(); cx.beginPath(); cx.rect(R.x - 4, R.y - 30, R.w + 8, R.h + 31); cx.clip();
    drawAnalyser(cx);
    if (M.revealed && M.target.length) dashedCurve(cx, response(M.target, respT, 't'));
    cx.restore();
    if (M.revealed) {
      cx.font = "26px 'Reenie Beanie'"; cx.textAlign = 'center';
      for (const b of M.target) {
        const x = fx(b.f), y = Y(10);
        stamp(cx, targetMark(), x, y, P_GRAPH, 0.9);
        cx.globalAlpha = 0.9; cx.fillStyle = GRAPHITE;
        cx.fillText(b.f >= 1000 ? (b.f / 1000).toFixed(2) + 'k' : Math.round(b.f) + '', x, y - 34);
        cx.globalAlpha = 1;
      }
    }
    /* red ballpoint: your curve and nodes */
    cx.save(); cx.beginPath(); cx.rect(R.x - 8, R.y - 40, R.w + 16, R.h + 41); cx.clip();
    penCurve(cx, response(M.user, resp, 'u'), take, P_RED, 2, 0.95, true);
    cx.restore();
    M.user.forEach((b, i) => {
      const x = fx(b.f), y = Y(10), act = i === M.active, hot = i === hover || i === drag;
      stamp(cx, nodeShape(i, act && dragging ? take : 0, hot), x, y, P_RED, 0.95);
      cx.font = "22px 'Nothing You Could Do'"; cx.fillStyle = RED; cx.textAlign = 'center';
      cx.fillText(String(i + 1), x - NR - 10, y - NR + 4);
      if (act && !M.revealed) stamp(cx, arrowShape(dragging ? take : 0), x, y + NR + 16, P_RED, 0.9);
    });
    if (G.hint && M.user.length && !M.revealed && R.w < 520) {   /* narrow: the note sits above the node */
      const b = M.user[M.active] || M.user[0], x = fx(b.f), y = Y(10);
      cx.save(); cx.font = `${Math.round(30 * G.koScale)}px ${G.koFont}, 'Nanum Pen Script', sans-serif`;
      cx.textAlign = 'center'; cx.fillStyle = RED; cx.globalAlpha = 0.95;
      cx.fillText('좌우로만 움직여요', Math.max(R.x + 80, Math.min(R.x + R.w - 80, x)), y - NR - 22); cx.restore();
    } else if (G.hint && M.user.length && !M.revealed) {
      const b = M.user[M.active] || M.user[0], x = fx(b.f), y = Y(10), flip = x > R.x + R.w * 0.6;
      stamp(cx, hintShape(flip), x, y, P_RED, 0.9);
      cx.save(); cx.translate(x + (flip ? -150 : 150), y - 52); cx.rotate((-4 * Math.PI) / 180);
      cx.font = `${Math.round(40 * G.koScale)}px ${G.koFont}, 'Nanum Pen Script', sans-serif`;
      cx.textAlign = flip ? 'right' : 'left'; cx.fillStyle = RED; cx.globalAlpha = 0.95;
      cx.fillText('좌우로만 움직여요', 0, 0); cx.restore();
    }
  };

  /* ════════ pointer ════════ */
  let drag = -1, hover = -1, grabDx = 0, start = null;
  const local = (e) => { const r = host.getBoundingClientRect(), k = zoom(); return [(e.clientX - r.left) / k, (e.clientY - r.top) / k]; };
  function nearest(x, y, reach) {
    const M = G.model; let best = -1, bd = reach;
    M.user.forEach((b, i) => { const d = Math.abs(fx(b.f) - x) + Math.max(0, Math.abs(Y(10) - y) - 30) * 0.5; if (d < bd) { bd = d; best = i; } });
    return best;
  }
  const inPlot = (x, y) => x >= R.x - 10 && x <= R.x + R.w + 10 && y >= R.y - 40 && y <= R.y + R.h + 20;
  const clampF = (f) => Math.max(G.range[0], Math.min(G.range[1], f));
  function setHover(h) { if (h !== hover) { hover = h; G.dirty = true; } }
  function bindPointer() {
    cv.addEventListener('pointerdown', (e) => {
      const M = G.model; if (!M || !M.user.length) return;
      const [x, y] = local(e);
      let i = nearest(x, y, 34);
      if (i < 0) {
        if (!inPlot(x, y)) return;
        /* a click on the paper sends the nearest node there */
        i = nearest(x, y, 1e9); grabDx = 0;
        M.user[i].f = clampF(xf(x));
        G.onMove && G.onMove(i);
      } else grabDx = x - fx(M.user[i].f);
      drag = i; M.active = i; start = { x, f: M.user[i].f };
      cv.setPointerCapture(e.pointerId);
      cv.classList.add('hot');
      G.onGrab && G.onGrab(i);
      G.dirty = true;
      e.preventDefault();
    });
    cv.addEventListener('pointermove', (e) => {
      const M = G.model; if (!M) return;
      const [x, y] = local(e);
      if (drag < 0) {
        const h = nearest(x, y, 34);
        setHover(h); cv.classList.toggle('hot', h >= 0 || inPlot(x, y));
        return;
      }
      const f = e.shiftKey
        ? start.f * 10 ** (((x - start.x) * 0.2 / R.w) * LS)        // fine
        : xf(x - grabDx);
      M.user[drag].f = clampF(f);
      G.onMove && G.onMove(drag);
      G.dirty = true;
    });
    const end = () => {
      if (drag < 0) return;
      const i = drag; drag = -1; G.dirty = true;
      G.onDrop && G.onDrop(i);
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', () => { if (drag < 0) { setHover(-1); cv.classList.remove('hot'); } });
  }
  G.dragging = () => drag >= 0;
  G.plotRect = () => R;
  G.yOf = Y;
})();
