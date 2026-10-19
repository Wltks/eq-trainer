/* sketch.js — hand-made marks for the EQ Trainer notebook mockups.
 *
 * Everything that would normally be a CSS border or a straight SVG line is
 * produced here as a physical mark instead: graphite, ballpoint, marker and
 * crayon strokes with pressure and tooth; torn paper with a fibrous white
 * core, loose fibres and a contact shadow; masking tape; highlighter.
 *
 * All randomness is seeded, so a redraw (resize) reproduces the same marks.
 */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const SK = (window.SK = {});

  /* ── randomness ─────────────────────────────────────────────────────── */
  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  SK.hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  SK.rng = (seed) => mulberry(typeof seed === 'number' ? seed * 2654435761 : SK.hash(seed));
  function vnoise(r) {
    const g = new Float32Array(512); for (let i = 0; i < 512; i++) g[i] = r() * 2 - 1;
    return (x) => { const i = Math.floor(x), f = x - i, t = f * f * (3 - 2 * f); return g[i & 511] + (g[(i + 1) & 511] - g[i & 511]) * t; };
  }
  SK.noise = (seed) => vnoise(SK.rng(seed));
  SK.fbm = (n, x, o = 3) => { let s = 0, a = 1, f = 1, m = 0; for (let k = 0; k < o; k++) { s += a * n(x * f + k * 17.31); m += a; a *= 0.5; f *= 2.03; } return s / m; };

  /* ── dom ────────────────────────────────────────────────────────────── */
  const el = (SK.el = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  });
  const R2 = (v) => Math.round(v * 100) / 100;

  /* ── geometry ───────────────────────────────────────────────────────── */
  SK.resample = (pts, step) => {
    const out = [pts[0].slice()]; let carry = 0;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; const d = Math.hypot(x1 - x0, y1 - y0); if (!d) continue;
      let t = step - carry;
      while (t <= d) { out.push([x0 + ((x1 - x0) * t) / d, y0 + ((y1 - y0) * t) / d]); t += step; }
      carry = d - (t - step);
    }
    const last = pts[pts.length - 1], pl = out[out.length - 1];
    if (Math.hypot(last[0] - pl[0], last[1] - pl[1]) > step * 0.25) out.push(last.slice());
    return out;
  };
  function normals(p) {
    return p.map((q, i) => {
      const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l];
    });
  }
  function lengths(p) { const L = [0]; for (let i = 1; i < p.length; i++) L.push(L[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])); return L; }

  /* displace a polyline sideways with layered noise + a gentle bow */
  SK.wob = (pts, o = {}) => {
    const r = SK.rng(o.seed || 1), n = vnoise(r), n2 = vnoise(r);
    const p = SK.resample(pts, o.step || 3), N = normals(p), L = lengths(p), tot = L[L.length - 1] || 1;
    /* a long freehand line wanders further than a short one */
    const amp = (o.amp ?? 1) * (o.grow === false ? 1 : 0.55 + Math.min(tot, 700) / 230), sc = o.scale || 110;
    const bow = (o.bow ?? 0.011) * tot * (r() < 0.5 ? -1 : 1);
    return p.map((q, i) => {
      const u = L[i] / tot;
      const d = amp * SK.fbm(n, L[i] / sc, 3) + amp * 0.22 * n2(L[i] / 5) + bow * Math.sin(Math.PI * u);
      return [q[0] + N[i][0] * d, q[1] + N[i][1] * d];
    });
  };
  function body(p) {
    let d = '';
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
      d += ` C${R2(p1[0] + (p2[0] - p0[0]) / 6)} ${R2(p1[1] + (p2[1] - p0[1]) / 6)} ${R2(p2[0] - (p3[0] - p1[0]) / 6)} ${R2(p2[1] - (p3[1] - p1[1]) / 6)} ${R2(p2[0])} ${R2(p2[1])}`;
    }
    return d;
  }
  SK.curve = (p) => `M${R2(p[0][0])} ${R2(p[0][1])}` + body(p);
  SK.poly = (p) => 'M' + p.map((q) => R2(q[0]) + ' ' + R2(q[1])).join('L') + 'Z';

  /* a filled outline around a centre-line: lets a stroke swell and taper */
  SK.ribbon = (p, wf) => {
    const n = p.length; if (n < 2) return '';
    const N = normals(p), A = [], B = [];
    for (let i = 0; i < n; i++) {
      const w = wf(i / (n - 1), i) / 2;
      A.push([p[i][0] + N[i][0] * w, p[i][1] + N[i][1] * w]);
      B.push([p[i][0] - N[i][0] * w, p[i][1] - N[i][1] * w]);
    }
    const unit = (a, b) => { const dx = a[0] - b[0], dy = a[1] - b[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
    const te = unit(p[n - 1], p[n - 2]), ts = unit(p[0], p[1]);
    const we = wf(1) / 2, ws = wf(0) / 2;
    const ce = [p[n - 1][0] + te[0] * we * 1.25, p[n - 1][1] + te[1] * we * 1.25];
    const cs = [p[0][0] + ts[0] * ws * 1.25, p[0][1] + ts[1] * ws * 1.25];
    const Br = B.slice().reverse();
    return `M${R2(A[0][0])} ${R2(A[0][1])}` + body(A) +
      ` Q${R2(ce[0])} ${R2(ce[1])} ${R2(Br[0][0])} ${R2(Br[0][1])}` + body(Br) +
      ` Q${R2(cs[0])} ${R2(cs[1])} ${R2(A[0][0])} ${R2(A[0][1])}Z`;
  };

  /* ── defs: one set of filters per svg ───────────────────────────────── */
  SK.defs = (svg) => {
    const d = el('defs', {}, svg);
    d.innerHTML = `
<!-- graphite: slightly ragged edge, then the paper tooth bites holes in it -->
<filter id="sk-pencil" x="-2%" y="-2%" width="104%" height="104%">
  <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" result="n"/>
  <feDisplacementMap in="SourceGraphic" in2="n" scale="1.5" xChannelSelector="R" yChannelSelector="G" result="d"/>
  <feTurbulence type="fractalNoise" baseFrequency="1.25" numOctaves="2" seed="11" result="t"/>
  <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.6 0 0 0 2.05" result="m"/>
  <feComposite in="d" in2="m" operator="in"/>
</filter>
<!-- ballpoint / fineliner: clean but never perfectly smooth -->
<filter id="sk-ink" x="-2%" y="-2%" width="104%" height="104%">
  <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="2" seed="21" result="n"/>
  <feDisplacementMap in="SourceGraphic" in2="n" scale="0.9" xChannelSelector="R" yChannelSelector="G" result="d"/>
  <feTurbulence type="fractalNoise" baseFrequency="2.2" numOctaves="1" seed="5" result="t"/>
  <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1.2 0 0 0 1.45" result="m"/>
  <feComposite in="d" in2="m" operator="in"/>
</filter>
<!-- felt marker: soft bleed into the fibres -->
<filter id="sk-marker" x="-2%" y="-2%" width="104%" height="104%">
  <feTurbulence type="fractalNoise" baseFrequency="0.45" numOctaves="3" seed="8" result="n"/>
  <feDisplacementMap in="SourceGraphic" in2="n" scale="1.8" xChannelSelector="R" yChannelSelector="G" result="d"/>
  <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="1" seed="31" result="t"/>
  <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.9 0 0 0 1.35" result="m"/>
  <feComposite in="d" in2="m" operator="in"/>
</filter>
<!-- wax crayon: heavy tooth, broken coverage -->
<filter id="sk-crayon" x="-3%" y="-3%" width="106%" height="106%">
  <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="14" result="n"/>
  <feDisplacementMap in="SourceGraphic" in2="n" scale="3" xChannelSelector="R" yChannelSelector="G" result="d"/>
  <feTurbulence type="fractalNoise" baseFrequency="0.95 1.6" numOctaves="3" seed="3" result="t"/>
  <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -3.4 0 0 0 2.25" result="m"/>
  <feComposite in="d" in2="m" operator="in"/>
</filter>
<!-- highlighter: wet edges, slightly streaky body -->
<filter id="sk-hl" x="-2%" y="-10%" width="104%" height="120%">
  <feTurbulence type="fractalNoise" baseFrequency="0.04 0.9" numOctaves="2" seed="6" result="n"/>
  <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" xChannelSelector="R" yChannelSelector="G" result="d"/>
  <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.7 0 0 0 1.25" result="m"/>
  <feComposite in="d" in2="m" operator="in"/>
</filter>
<!-- paper body: soft mottling (sizing unevenness) plus a whisper of tooth -->
<filter id="sk-grain" x="0" y="0" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="3" seed="2" result="m"/>
  <feColorMatrix in="m" type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.4  0 0 0 0 0.3  0 0 0 0.16 -0.03" result="ma"/>
  <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="12" result="t"/>
  <feColorMatrix in="t" type="matrix" values="0 0 0 0 0.3  0 0 0 0 0.27  0 0 0 0 0.2  0 0 0 0.13 -0.035" result="ta"/>
  <feMerge result="mm"><feMergeNode in="ma"/><feMergeNode in="ta"/></feMerge>
  <feComposite in="mm" in2="SourceGraphic" operator="in" result="g"/>
  <feBlend in="g" in2="SourceGraphic" mode="multiply"/>
</filter>
<!-- kraft: blotchy pulp, short fibres in every direction, dark inclusions -->
<filter id="sk-kraft" x="0" y="0" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves="4" seed="9" result="b"/>
  <feColorMatrix in="b" type="matrix" values="0 0 0 0 0.3  0 0 0 0 0.2  0 0 0 0 0.1  0 0 0 0.42 -0.1" result="ba"/>
  <feTurbulence type="turbulence" baseFrequency="0.35" numOctaves="2" seed="5" result="f"/>
  <feColorMatrix in="f" type="matrix" values="0 0 0 0 0.25  0 0 0 0 0.16  0 0 0 0 0.07  0 0 0 0.9 -0.42" result="fa"/>
  <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="1" seed="23" result="s"/>
  <feColorMatrix in="s" type="matrix" values="0 0 0 0 0.15  0 0 0 0 0.09  0 0 0 0 0.04  0 0 0 3 -2.05" result="sa"/>
  <feMerge result="m"><feMergeNode in="ba"/><feMergeNode in="fa"/><feMergeNode in="sa"/></feMerge>
  <feComposite in="m" in2="SourceGraphic" operator="in" result="g"/>
  <feBlend in="g" in2="SourceGraphic" mode="multiply"/>
</filter>
<!-- black/coloured stock: lighter fibres catching the light -->
<filter id="sk-dark" x="0" y="0" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" seed="27" result="m"/>
  <feColorMatrix in="m" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.05 -0.012" result="ma"/>
  <feTurbulence type="turbulence" baseFrequency="0.5" numOctaves="2" seed="15" result="f"/>
  <feColorMatrix in="f" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 0.95  0 0 0 0.5 -0.27" result="fa"/>
  <feMerge result="mm"><feMergeNode in="ma"/><feMergeNode in="fa"/></feMerge>
  <feComposite in="mm" in2="SourceGraphic" operator="in" result="g"/>
  <feBlend in="g" in2="SourceGraphic" mode="screen"/>
</filter>
<!-- printed rulings: ink never sits perfectly on fibre -->
<filter id="sk-print" x="0" y="0" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="2" seed="19" result="n"/>
  <feDisplacementMap in="SourceGraphic" in2="n" scale="0.9" xChannelSelector="R" yChannelSelector="G" result="d"/>
  <feTurbulence type="fractalNoise" baseFrequency="1.8" numOctaves="1" seed="7" result="t"/>
  <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1.4 0 0 0 1.4" result="m"/>
  <feComposite in="d" in2="m" operator="in"/>
</filter>
<!-- the torn core is fuzzy, not a crisp band -->
<filter id="sk-fiber" x="-3%" y="-3%" width="106%" height="106%">
  <feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="3" seed="13" result="n"/>
  <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" xChannelSelector="R" yChannelSelector="G"/>
</filter>
<filter id="sk-feather" x="-4%" y="-4%" width="108%" height="108%">
  <feMorphology operator="dilate" radius="0.9" result="dl"/>
  <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="29" result="n"/>
  <feDisplacementMap in="dl" in2="n" scale="3.4" xChannelSelector="R" yChannelSelector="G" result="d"/>
  <feGaussianBlur in="d" stdDeviation="0.55"/>
</filter>
<!-- rubber stamp: ink skips where the rubber did not seat -->
<filter id="sk-stamp" x="-3%" y="-3%" width="106%" height="106%">
  <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="33" result="n"/>
  <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" xChannelSelector="R" yChannelSelector="G" result="d"/>
  <feTurbulence type="fractalNoise" baseFrequency="0.06 0.09" numOctaves="3" seed="44" result="big"/>
  <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="45" result="fine"/>
  <feComposite in="big" in2="fine" operator="arithmetic" k1="0" k2="0.65" k3="0.5" k4="0" result="mix"/>
  <feColorMatrix in="mix" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -3.2 0 0 0 2.5" result="m"/>
  <feComposite in="d" in2="m" operator="in"/>
</filter>
<filter id="sk-shadow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="3.2"/></filter>
<filter id="sk-shadow-s" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.2"/></filter>
<filter id="sk-tape" x="0" y="0" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency="0.7 0.12" numOctaves="3" seed="17" result="t"/>
  <feColorMatrix in="t" type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.3  0 0 0 0 0.2  0 0 0 0.22 -0.04" result="a"/>
  <feComposite in="a" in2="SourceGraphic" operator="in" result="g"/>
  <feBlend in="g" in2="SourceGraphic" mode="multiply"/>
</filter>
<pattern id="sk-graph" width="16" height="16" patternUnits="userSpaceOnUse">
  <path d="M16 0H0V16" fill="none" stroke="#9fb3c4" stroke-width=".55" opacity=".7"/>
</pattern>
<pattern id="sk-graph-major" width="80" height="80" patternUnits="userSpaceOnUse">
  <path d="M80 0H0V80" fill="none" stroke="#86a0b6" stroke-width=".9" opacity=".75"/>
</pattern>
<pattern id="sk-lined" width="28" height="28" patternUnits="userSpaceOnUse">
  <path d="M0 27.5H28" stroke="#a9bfd3" stroke-width=".7" opacity=".85"/>
</pattern>`;
    return d;
  };

  /* ── layers: strokes of one tool share one filtered group, so the paper
     tooth is continuous across marks the way it is on a real page ── */
  const TOOL = {
    pencil: { color: '#3a3833', w: 1.45, op: 0.86, filter: 'sk-pencil', taper: 0.14, passes: 2, amp: 0.85 },
    soft:   { color: '#55524b', w: 1.1, op: 0.55, filter: 'sk-pencil', taper: 0.2, passes: 1, amp: 0.7 },
    pen:    { color: '#b1222d', w: 1.75, op: 0.95, filter: 'sk-ink', taper: 0.16, passes: 1, amp: 0.6, blob: true },
    ink:    { color: '#1f1d1a', w: 1.6, op: 0.95, filter: 'sk-ink', taper: 0.16, passes: 1, amp: 0.6, blob: true },
    blue:   { color: '#21409a', w: 1.65, op: 0.95, filter: 'sk-ink', taper: 0.16, passes: 1, amp: 0.6, blob: true },
    marker: { color: '#191816', w: 5.2, op: 0.95, filter: 'sk-marker', taper: 0.04, passes: 1, amp: 1.1 },
    fine:   { color: '#191816', w: 2.4, op: 0.95, filter: 'sk-marker', taper: 0.08, passes: 1, amp: 0.8 },
    crayon: { color: '#b8392f', w: 9, op: 0.9, filter: 'sk-crayon', taper: 0.06, passes: 1, amp: 1.4 },
    white:  { color: '#fbf8f0', w: 4.5, op: 0.97, filter: 'sk-marker', taper: 0.05, passes: 1, amp: 1 },
  };
  SK.TOOL = TOOL;
  SK.layer = (c, tool, blend) => {
    c._L = c._L || {};
    const t = TOOL[tool] || TOOL.pencil, key = tool + (blend || '');
    if (!c._L[key]) {
      /* no blend mode by default: dark marks on pale paper read the same, and a
         blended layer has to be re-composited every time anything near it moves */
      c._L[key] = el('g', { filter: `url(#${t.filter})`, style: blend ? `mix-blend-mode:${blend}` : undefined }, c);
    }
    return c._L[key];
  };

  /* ── a single physical stroke ───────────────────────────────────────── */
  SK.stroke = (c, pts, o = {}) => {
    /* undefined options must not knock out the tool's defaults */
    const tn = o.tool || 'pencil', t = { ...TOOL[tn] };
    for (const k in o) if (o[k] !== undefined) t[k] = o[k];
    const g = o.raw ? c : SK.layer(c, tn, o.blend);
    const r = SK.rng((t.seed || 1) * 97 + 13);
    for (let k = 0; k < t.passes; k++) {
      let P = SK.wob(pts, { amp: t.amp * (1 + k * 0.8), seed: (t.seed || 1) * 31 + k * 7, step: t.step || 3, bow: t.bow, scale: t.scale, grow: t.grow });
      /* the re-trace of a pencil line starts late and lifts early */
      if (k && P.length > 8) { const a = Math.floor(P.length * (0.04 + r() * 0.12)), b = Math.ceil(P.length * (0.82 + r() * 0.16)); P = P.slice(a, b); }
      const nP = vnoise(r), W = t.w * (k ? 0.62 : 1), tp = t.taper;
      const press = t.press || ((u) => 1);
      const d = SK.ribbon(P, (u) => {
        let w = W * (0.68 + 0.6 * (SK.fbm(nP, u * 5, 2) * 0.5 + 0.5)) * press(u);
        if (u < tp) w *= 0.3 + 0.7 * Math.sin((u / tp) * Math.PI / 2);
        if (u > 1 - tp) w *= 0.3 + 0.7 * Math.sin(((1 - u) / tp) * Math.PI / 2);
        return Math.max(0.15, w);
      });
      el('path', { d, fill: t.color, opacity: k ? 0.42 * t.op : t.op }, g);
    }
    if (t.blob) { const p0 = pts[0]; el('circle', { cx: p0[0], cy: p0[1], r: t.w * 0.7, fill: t.color, opacity: 0.85 }, g); }
    return g;
  };

  /* ── primitives built from strokes ──────────────────────────────────── */
  SK.line = (c, x1, y1, x2, y2, o = {}) => SK.stroke(c, [[x1, y1], [x2, y2]], o);

  /* boxes are drawn the way people draw them: four strokes that overshoot */
  SK.box = (c, x, y, w, h, o = {}) => {
    const s = o.seed || 1, r = SK.rng(s * 7), ov = () => (o.ov ?? 1) * (2 + r() * 6), j = () => (r() - 0.5) * 2.4;
    SK.stroke(c, [[x - ov(), y + j()], [x + w + ov(), y + j()]], { ...o, seed: s + 1 });
    SK.stroke(c, [[x + w + j(), y - ov()], [x + w + j(), y + h + ov()]], { ...o, seed: s + 2 });
    SK.stroke(c, [[x + w + ov(), y + h + j()], [x - ov(), y + h + j()]], { ...o, seed: s + 3 });
    SK.stroke(c, [[x + j(), y + h + ov()], [x + j(), y - ov()]], { ...o, seed: s + 4 });
  };

  /* a ring drawn around something: more than one turn, slightly spiralling */
  SK.loop = (c, cx, cy, rx, ry, o = {}) => {
    const s = o.seed || 1, r = SK.rng(s * 13), n = vnoise(r);
    const turns = o.turns || 1.16, a0 = o.a0 ?? r() * Math.PI * 2, dir = o.ccw ? -1 : 1;
    /* hands never draw a true ellipse: it leans, bulges on one side and the
       closing pass lands outside the first one */
    const tilt = ((o.tilt ?? (r() - 0.5) * 16) * Math.PI) / 180, ct = Math.cos(tilt), st = Math.sin(tilt);
    const bulge = 0.08 + r() * 0.1, bAng = r() * Math.PI * 2;
    const steps = Math.max(56, Math.round((rx + ry) * turns * 0.8)), pts = [];
    for (let i = 0; i <= steps; i++) {
      const u = i / steps, a = a0 + dir * u * turns * Math.PI * 2;
      const k = 1 + 0.12 * SK.fbm(n, u * 3.2, 2) + bulge * Math.cos(a - bAng) + (u > 0.78 ? (u - 0.78) * 0.55 : 0);
      const ex = Math.cos(a) * rx * k, ey = Math.sin(a) * ry * k;
      pts.push([cx + ex * ct - ey * st, cy + ex * st + ey * ct]);
    }
    return SK.stroke(c, pts, { bow: 0, amp: 0.45, grow: false, ...o, taper: o.taper ?? 0.12 });
  };

  SK.underline = (c, x1, x2, y, o = {}) => {
    const s = o.seed || 1, r = SK.rng(s * 5);
    SK.stroke(c, [[x1 - 3, y + (r() - 0.5) * 2], [(x1 + x2) / 2, y + (r() - 0.3) * 3], [x2 + 4, y - 1 - r() * 3]], { ...o, seed: s });
    if (o.double) SK.stroke(c, [[x1 + 8, y + 6 + r() * 2], [x2 - 6, y + 4 + (r() - 0.5) * 2]], { ...o, seed: s + 9 });
  };

  SK.arrow = (c, x1, y1, x2, y2, o = {}) => {
    const s = o.seed || 1, r = SK.rng(s * 3), bend = o.bend ?? 0.2;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1;
    const cx = mx - dy * bend, cy = my + dx * bend, pts = [];
    for (let i = 0; i <= 28; i++) { const t = i / 28; pts.push([(1 - t) ** 2 * x1 + 2 * (1 - t) * t * cx + t * t * x2, (1 - t) ** 2 * y1 + 2 * (1 - t) * t * cy + t * t * y2]); }
    SK.stroke(c, pts, { ...o, seed: s });
    const ang = Math.atan2(y2 - cy, x2 - cx), L = o.head || 13, sp = 0.42 + r() * 0.16;
    SK.stroke(c, [[x2 - Math.cos(ang - sp) * L, y2 - Math.sin(ang - sp) * L], [x2 + Math.cos(ang) * 1.5, y2 + Math.sin(ang) * 1.5],
      [x2 - Math.cos(ang + sp) * L * 0.85, y2 - Math.sin(ang + sp) * L * 0.85]], { ...o, seed: s + 5, amp: 0.25, taper: 0.22, step: 2 });
  };

  /* parallel hatching inside a rectangle — each line ends a little short or
     a little over, never exactly on the edge */
  SK.hatch = (c, x, y, w, h, o = {}) => {
    const s = o.seed || 1, r = SK.rng(s * 17), ang = ((o.angle ?? 45) * Math.PI) / 180, gap = o.gap || 6;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const ds = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([px, py]) => -sa * px + ca * py);
    const dmin = Math.min(...ds), dmax = Math.max(...ds); let i = 0;
    for (let d = dmin + gap * r(); d < dmax; d += gap * (0.75 + r() * 0.5)) {
      const bx = -sa * d, by = ca * d; let t0 = -1e9, t1 = 1e9;
      const clip = (p, q0, q1) => { if (Math.abs(p) < 1e-9) return q0 <= 0 && q1 >= 0; const a = q0 / p, b = q1 / p; t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b)); return true; };
      if (!clip(ca, x - bx, x + w - bx) || !clip(sa, y - by, y + h - by) || t1 - t0 < 2) continue;
      t0 += (r() - 0.3) * (o.ragged ?? 4); t1 -= (r() - 0.3) * (o.ragged ?? 4);
      SK.stroke(c, [[bx + ca * t0, by + sa * t0], [bx + ca * t1, by + sa * t1]], { tool: o.tool || 'soft', w: o.w, seed: s * 100 + i++, amp: 0.4, taper: 0.25, step: 4, color: o.color, op: o.op });
    }
  };

  /* hatching clipped to an ellipse (shading on round forms) */
  SK.hatchEllipse = (c, cx, cy, rx, ry, o = {}) => {
    const s = o.seed || 1, r = SK.rng(s * 19), ang = ((o.angle ?? 45) * Math.PI) / 180, gap = o.gap || 5;
    const vx = Math.cos(ang), vy = Math.sin(ang), R = Math.max(rx, ry); let i = 0;
    const from = o.from ?? -1, to = o.to ?? 1;   /* restrict to a slice of the form */
    for (let d = -R + gap * r(); d < R; d += gap * (0.75 + r() * 0.5)) {
      if (d / R < from || d / R > to) continue;
      const bx = cx - vy * d, by = cy + vx * d;
      const A = (vx / rx) ** 2 + (vy / ry) ** 2, B = 2 * (((bx - cx) * vx) / rx ** 2 + ((by - cy) * vy) / ry ** 2), C = ((bx - cx) / rx) ** 2 + ((by - cy) / ry) ** 2 - 1;
      const D = B * B - 4 * A * C; if (D <= 0) continue;
      let t0 = (-B - Math.sqrt(D)) / (2 * A), t1 = (-B + Math.sqrt(D)) / (2 * A);
      t0 += r() * 2.5; t1 -= r() * 2.5; if (t1 - t0 < 2) continue;
      SK.stroke(c, [[bx + vx * t0, by + vy * t0], [bx + vx * t1, by + vy * t1]], { tool: o.tool || 'soft', seed: s * 100 + i++, amp: 0.3, taper: 0.25, step: 3, w: o.w, op: o.op, grow: false });
    }
  };
  SK.arc = (cx, cy, rx, ry, a0, a1, n = 40) => { const p = []; for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; p.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return p; };

  /* highlighter swipe: flat chisel ends, darker where two passes overlap */
  SK.hl = (c, x1, x2, y, h, o = {}) => {
    /* own group each time: a swipe must land above whatever paper was
       pasted before it, not inside a layer created earlier */
    const s = o.seed || 1, r = SK.rng(s * 23), g = el('g', { filter: 'url(#sk-hl)', style: 'mix-blend-mode:multiply' }, c);
    const passes = o.passes || 1;
    for (let k = 0; k < passes; k++) {
      const yo = y + (k ? (r() - 0.5) * h * 0.35 : 0), sl = 3 + r() * 4;
      const top = SK.wob([[x1 + sl, yo - h / 2], [x2 + (r() - 0.5) * 6, yo - h / 2 + (r() - 0.5) * 2]], { amp: 0.6, seed: s + k, bow: 0.002 });
      const bot = SK.wob([[x2 - sl + (r() - 0.5) * 4, yo + h / 2], [x1, yo + h / 2 + (r() - 0.5) * 2]], { amp: 0.6, seed: s + k + 50, bow: 0.002 });
      el('path', { d: SK.poly(top.concat(bot)), fill: o.color || '#4f7dff', opacity: o.op ?? 0.36 }, g);
    }
  };

  /* ── torn paper ─────────────────────────────────────────────────────── */
  /* sides: which edges were torn (t r b l); the rest are knife-cut.
     Returns the inner (visible face) outline so content can be clipped to it. */
  SK.torn = (c, x, y, w, h, o = {}) => {
    const s = o.seed || 1, r = SK.rng(s * 41), n1 = vnoise(r), n2 = vnoise(r), n3 = vnoise(r), n4 = vnoise(r);
    const sides = o.sides ?? 'trbl', amp = o.amp ?? 3.4, rot = ((o.rot || 0) * Math.PI) / 180;
    const cx = x + w / 2, cy = y + h / 2, cr = Math.cos(rot), sr = Math.sin(rot);
    const T = (p) => [cx + (p[0] - cx) * cr - (p[1] - cy) * sr, cy + (p[0] - cx) * sr + (p[1] - cy) * cr];
    const outer = [], inner = [], fib = [];
    let S = 0;
    const side = (ax, ay, bx, by, nx, ny, torn) => {
      const L = Math.hypot(bx - ax, by - ay), step = torn ? 1.8 : 7, cnt = Math.max(2, Math.round(L / step));
      for (let i = 0; i < cnt; i++) {
        const u = i / cnt, s2 = S + u * L, px = ax + (bx - ax) * u, py = ay + (by - ay) * u;
        let off, core = 0;
        if (torn) {
          /* three scales: long lazy undulation, ragged teeth, the odd bite */
          off = amp * (0.9 + 0.75 * SK.fbm(n1, s2 / 46, 3)) + amp * 0.32 * n2(s2 / 2.6) + (n4(s2 / 9) > 0.62 ? amp * 0.9 * (n4(s2 / 9) - 0.62) * 4 : 0);
          core = Math.max(0.3, (o.core ?? 1.9) * (1 + 1.1 * SK.fbm(n3, s2 / 17, 3)));
          if (r() < 0.7) fib.push([px + nx * off, py + ny * off, -nx, -ny, r(), r()]);
        } else {
          off = 0.5 + 0.35 * n2(s2 / 11);
        }
        outer.push(T([px + nx * off, py + ny * off]));
        inner.push(T([px + nx * (off + core), py + ny * (off + core)]));
      }
      S += L;
    };
    side(x, y, x + w, y, 0, 1, sides.includes('t'));
    side(x + w, y, x + w, y + h, -1, 0, sides.includes('r'));
    side(x + w, y + h, x, y + h, 0, -1, sides.includes('b'));
    side(x, y + h, x, y, 1, 0, sides.includes('l'));

    const G = el('g', { class: 'sk-paper' }, c);
    if (o.shadow !== false) {
      el('path', { d: SK.poly(outer), fill: '#2b2116', opacity: o.shadowOp ?? 0.3, filter: 'url(#sk-shadow)', transform: `translate(${o.sx ?? 1.6} ${o.sy ?? 3.4})` }, G);
      el('path', { d: SK.poly(outer), fill: '#2b2116', opacity: (o.shadowOp ?? 0.3) * 0.9, filter: 'url(#sk-shadow-s)', transform: 'translate(.4 .9)' }, G);
    }
    const core = o.coreFill || '#fdfaf2';
    /* torn core: a soft feathered halo under a fuzzy body */
    el('path', { d: SK.poly(outer), fill: core, opacity: 0.55, filter: 'url(#sk-feather)' }, G);
    el('path', { d: SK.poly(outer), fill: core, filter: 'url(#sk-fiber)' }, G);
    /* loose fibres: mostly tiny and matted, the odd longer strand */
    const fg = el('g', { stroke: core, fill: 'none', 'stroke-linecap': 'round' }, G);
    for (const [fx, fy, nx, ny, q, q2] of fib) {
      const long = q2 > 0.965, len = long ? 3 + q * 5 : 0.5 + q * 1.9;
      const ang = Math.atan2(ny, nx) + (q2 - 0.5) * (long ? 1.6 : 2.4);
      const bend = (q - 0.5) * (long ? 3 : 1);
      const ex = fx + Math.cos(ang) * len, ey = fy + Math.sin(ang) * len;
      const p0 = T([fx, fy]), p2 = T([ex, ey]), p1 = T([(fx + ex) / 2 - Math.sin(ang) * bend, (fy + ey) / 2 + Math.cos(ang) * bend]);
      el('path', { d: `M${R2(p0[0])} ${R2(p0[1])}Q${R2(p1[0])} ${R2(p1[1])} ${R2(p2[0])} ${R2(p2[1])}`, 'stroke-width': long ? 0.35 : 0.5 + q * 0.5, opacity: long ? 0.7 : 0.55 }, fg);
    }
    el('path', { d: SK.poly(inner), fill: o.fill || '#f7f3ea', filter: `url(#${o.texture || 'sk-grain'})` }, G);
    if (o.pattern) for (const pid of [].concat(o.pattern)) el('path', { d: SK.poly(inner), fill: `url(#${pid})`, opacity: o.patOp ?? 1, filter: 'url(#sk-print)' }, G);
    /* the face edge is not knife-sharp either: a faint darker rim where the
       surface layer lifted */
    el('path', { d: SK.poly(inner), fill: 'none', stroke: '#000', 'stroke-opacity': o.rimOp ?? 0.07, 'stroke-width': 0.8, filter: 'url(#sk-fiber)' }, G);
    G.inner = inner;
    return G;
  };

  /* ── masking tape ───────────────────────────────────────────────────── */
  SK.tape = (c, cx, cy, L, W, deg, o = {}) => {
    const s = o.seed || 1, r = SK.rng(s * 59), n = vnoise(r), a = (deg * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    const P = (u, v) => [cx + u * ca - v * sa, cy + u * sa + v * ca];
    const pts = [];
    const tear = (u0, sgn) => { /* torn end: small irregular teeth */
      const k = Math.round(W / 2.6);
      for (let i = 0; i <= k; i++) { const v = -W / 2 + (W * i) / k; pts.push(P(u0 + sgn * (r() * 2.6 + (i % 2) * 1.2), sgn > 0 ? v : -v)); }
    };
    for (let u = -L / 2; u <= L / 2; u += 6) pts.push(P(u, -W / 2 + 0.5 * n(u / 13)));
    tear(L / 2, 1);
    for (let u = L / 2; u >= -L / 2; u -= 6) pts.push(P(u, W / 2 + 0.5 * n(u / 13 + 40)));
    tear(-L / 2, -1);
    const G = el('g', { class: 'sk-tape' }, c);
    el('path', { d: SK.poly(pts), fill: '#3b2e1c', opacity: 0.12, filter: 'url(#sk-shadow-s)', transform: 'translate(.6 1.2)' }, G);
    el('path', { d: SK.poly(pts), fill: o.color || '#e9dfc4', opacity: o.op ?? 0.66, filter: 'url(#sk-tape)' }, G);
    /* creases where it was pressed down unevenly */
    for (let i = 0; i < 3; i++) {
      const u = -L / 2 + L * (0.15 + 0.7 * r()), v1 = -W / 2 + 1, v2 = W / 2 - 1, sk = (r() - 0.5) * 8;
      const A = P(u, v1), B = P(u + sk, v2);
      el('path', { d: `M${R2(A[0])} ${R2(A[1])}L${R2(B[0])} ${R2(B[1])}`, stroke: r() < 0.5 ? '#fffaf0' : '#a8997a', 'stroke-width': 1.4, opacity: 0.12, filter: 'url(#sk-shadow-s)' }, G);
    }
    return G;
  };

  /* ── handwriting irregularity for big type ──────────────────────────── */
  SK.jitter = (node, seed, amt = 1) => {
    const r = SK.rng(seed), txt = node.textContent; node.textContent = '';
    for (const ch of txt) {
      const sp = document.createElement('span'); sp.textContent = ch;
      if (ch.trim()) {
        sp.style.display = 'inline-block';
        sp.style.transform = `translateY(${((r() - 0.5) * 5 * amt).toFixed(2)}px) rotate(${((r() - 0.5) * 6 * amt).toFixed(2)}deg) scale(${(1 + (r() - 0.5) * 0.09 * amt).toFixed(3)})`;
      }
      node.appendChild(sp);
    }
  };

  /* element box relative to a positioned root, ignoring CSS transforms */
  SK.box_of = (node, root) => {
    let x = 0, y = 0, e = node;
    while (e && e !== root) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent; }
    return { x, y, w: node.offsetWidth, h: node.offsetHeight };
  };
  /* where it actually paints (after ancestor transforms), in root space */
  /* the root may be scaled (the page is drawn at a zoom): screen px are
     divided back into the root's own px */
  SK.rect_of = (node, root) => {
    const a = node.getBoundingClientRect(), b = root.getBoundingClientRect(), s = b.width / (root.offsetWidth || b.width) || 1;
    return { x: (a.left - b.left) / s + root.scrollLeft, y: (a.top - b.top) / s + root.scrollTop, w: a.width / s, h: a.height / s };
  };

  /* declarative marks on html:
       data-loop="pen"   ring around it        data-ul="pencil"  underline
       data-ul2="pen"    double underline      data-box="pencil" box around
       data-hl="#hex"    highlighter behind (goes to the `under` surface) */
  SK.decorate = (root, under, over) => {
    let i = 0;
    for (const n of root.querySelectorAll('[data-loop],[data-ul],[data-ul2],[data-box],[data-hl]')) {
      if (!n.offsetParent) continue;            /* hidden: nothing to mark */
      const b = SK.rect_of(n, root), seed = SK.hash(n.dataset.seed || n.textContent + i++);
      if (n.dataset.loop) {
        const pad = +(n.dataset.pad || 10);
        SK.loop(over, b.x + b.w / 2, b.y + b.h / 2 + 1, b.w / 2 + pad, b.h / 2 + pad * 0.62, { tool: n.dataset.loop, seed });
      }
      if (n.dataset.ul) SK.underline(over, b.x, b.x + b.w, b.y + b.h - (+(n.dataset.ulup || 4)), { tool: n.dataset.ul, seed });
      if (n.dataset.ul2) SK.underline(over, b.x, b.x + b.w, b.y + b.h - (+(n.dataset.ulup || 4)), { tool: n.dataset.ul2, seed, double: true });
      if (n.dataset.box) { const p = +(n.dataset.pad || 8); SK.box(over, b.x - p, b.y - p * 0.7, b.w + p * 2, b.h + p * 1.4, { tool: n.dataset.box, seed }); }
      if (n.dataset.hl) SK.hl(under, b.x - 4, b.x + b.w + 6, b.y + b.h * 0.6, b.h * 0.62, { color: n.dataset.hl, seed, passes: 2 });
    }
  };


  /* fonts must be in before anything is measured; and if one lands late,
     measure again rather than leave marks floating off their words */
  SK.boot = async (faces, first, redraw) => {
    if (document.readyState !== 'complete') await new Promise((r) => addEventListener('load', r, { once: true }));
    try { await Promise.all(faces.map((f) => document.fonts.load(f))); } catch (e) {}
    await document.fonts.ready;
    first(); redraw();
    let t; const again = () => { clearTimeout(t); t = setTimeout(redraw, 90); };
    document.fonts.addEventListener('loadingdone', again);
    addEventListener('resize', again);
    /* some hosts settle the viewport without firing resize: watch briefly */
    let vw = innerWidth, vh = innerHeight, n = 0;
    const watch = setInterval(() => {
      if (innerWidth !== vw || innerHeight !== vh) { vw = innerWidth; vh = innerHeight; again(); }
      if (++n > 30) clearInterval(watch);
    }, 100);
  };

  /* overlay svg sized to the root */
  SK.surface = (root, cls, z) => {
    const svg = el('svg', { class: cls, width: root.scrollWidth, height: root.scrollHeight, style: `position:absolute;left:0;top:0;z-index:${z};pointer-events:none;overflow:visible` });
    root.appendChild(svg); SK.defs(svg); return svg;
  };
})();
