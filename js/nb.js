/* nb.js — notebook widgets for the EQ Trainer mockups, drawn with sketch.js.
 * Each widget takes a style object so the three variants can render the
 * same instrument with pencil, ballpoint or marker.
 */
(function () {
  const NB = (window.NB = {});
  const L0 = Math.log10(20), LS = 3;
  NB.fx = (r, f) => r.x + ((Math.log10(f) - L0) / LS) * r.w;
  NB.bell = (f, f0, g = 10, sd = 0.62) => g * Math.exp(-(Math.log2(f / f0) ** 2) / (2 * sd * sd));
  const fmt = (f) => (f >= 1000 ? +(f / 1000).toFixed(1) + 'k' : String(f));

  function text(parent, x, y, s, o = {}) {
    const t = SK.el('text', {
      x, y, 'text-anchor': o.anchor || 'middle', 'font-family': o.font || "'Reenie Beanie'",
      'font-size': o.size || 22, fill: o.color || '#3a3833', transform: o.rot ? `rotate(${o.rot} ${x} ${y})` : null,
      'letter-spacing': o.ls || null,
    }, parent);
    t.textContent = s; return t;
  }
  NB.text = text;

  /* ── the EQ graph ─────────────────────────────────────────────────── */
  NB.graph = (over, r, o = {}) => {
    const s = o.seed || 1, n = SK.noise(s + 7), f0 = o.f0 || 1200;
    const lo = o.lo || 40, hi = o.hi || 12000;
    const y0 = r.y + r.h * 0.66, k = (r.h * 0.42) / 10, Y = (db) => y0 - db * k;
    const axis = o.axis || 'pencil', soft = o.soft || 'soft';
    const lab = SK.layer(over, o.labelTool || axis);
    const lt = { font: o.labelFont, size: o.labelSize, color: o.labelColor };

    /* frequencies the trainer will not use: shaded off */
    SK.hatch(over, r.x, r.y, NB.fx(r, lo) - r.x, r.h, { seed: s + 1, angle: 58, gap: o.hatchGap || 7, tool: soft });
    SK.hatch(over, NB.fx(r, hi), r.y, r.x + r.w - NB.fx(r, hi), r.h, { seed: s + 2, angle: 58, gap: o.hatchGap || 7, tool: soft });
    const rr = SK.rng(s + 99);
    for (const f of [lo, hi]) {
      const x = NB.fx(r, f);
      for (let yy = r.y + 4; yy < r.y + r.h - 6; yy += 13 + rr() * 4) SK.line(over, x + (rr() - 0.5), yy, x + (rr() - 0.5), yy + 6 + rr() * 3, { tool: axis, seed: s * 7 + yy, grow: false, amp: 0.2 });
    }

    /* analyser: the music under the curve, hatched rather than filled */
    if (o.spectrum !== false) {
      const xs = [], tops = [];
      const hr = SK.rng(s + 77);
      for (let x = NB.fx(r, 25); x <= NB.fx(r, 17000); x += (o.specStep || 5.6) * (0.7 + hr() * 0.6)) {
        const f = 10 ** (L0 + ((x - r.x) / r.w) * LS), lf = Math.log2(f);
        let h = 0.5 + 0.22 * SK.fbm(n, lf * 0.9, 3);
        if (f < 60) h *= 0.55 + 0.45 * ((f - 25) / 35);
        if (f > 9000) h *= 1 - 0.55 * ((f - 9000) / 8000);
        if (o.post) h += 0.18 * NB.bell(f, f0, 1);
        xs.push(x); tops.push(r.y + r.h - h * r.h * (o.specScale || 0.4));
      }
      SK.stroke(over, xs.map((x, i) => [x, tops[i]]), { tool: soft, seed: s + 3, amp: 0.15, grow: false, step: 4, op: 0.7 });
      const sr = SK.rng(s + 4);
      xs.forEach((x, i) => {
        if (i % (o.specEvery || 1)) return;
        const t = tops[i] + sr() * 3, b = r.y + r.h - sr() * 4;
        const sl = 2 + sr() * 3;
        if (b - t > 4) SK.stroke(over, [[x + sl, t], [x - sl * 0.4 + (sr() - 0.5) * 2, b]], { tool: soft, seed: s * 1000 + i, amp: 0.3, grow: false, taper: 0.3, op: (o.specOp ?? 0.42) * (0.55 + sr() * 0.7), w: o.specW });
      });
    }

    /* axes, dB rules, frequency ticks */
    SK.line(over, r.x - 8, Y(0), r.x + r.w + 10, Y(0), { tool: axis, seed: s + 5 });
    SK.line(over, r.x + 4, Y(10), r.x + r.w - 4, Y(10), { tool: soft, seed: s + 6 });
    text(lab, r.x - 14, Y(0) + 7, '0 dB', { ...lt, anchor: 'end' });
    text(lab, r.x - 14, Y(10) + 7, '+10', { ...lt, anchor: 'end' });
    [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000].forEach((f, i) => {
      const x = NB.fx(r, f);
      SK.line(over, x, r.y + r.h - 7, x + (i % 2 ? 0.8 : -0.6), r.y + r.h + 7, { tool: axis, seed: s + 20 + i, grow: false });
      text(lab, x, r.y + r.h + (o.labelGap || 32), fmt(f), lt);
    });
    SK.line(over, r.x - 4, r.y + r.h, r.x + r.w + 6, r.y + r.h + 1, { tool: axis, seed: s + 8 });

    /* the user's bell (+10 dB, Q 1) and its handle */
    const pts = [];
    for (let x = r.x; x <= r.x + r.w; x += 3) { const f = 10 ** (L0 + ((x - r.x) / r.w) * LS); pts.push([x, Y(NB.bell(f, f0))]); }
    SK.stroke(over, pts, { tool: o.curve || 'pen', seed: s + 9, amp: 0.55, grow: false, color: o.curveColor, w: o.curveW });
    if (o.retrace) SK.stroke(over, pts.slice(8, -14), { tool: o.curve || 'pen', seed: s + 10, amp: 0.9, grow: false, color: o.curveColor, op: 0.45, w: o.curveW });
    const nx = NB.fx(r, f0), ny = Y(10);
    if (o.nodeFill) SK.loop(over, nx, ny, 9, 9, { tool: o.nodeFill, seed: s + 11, turns: 3.2, w: 6 });
    SK.loop(over, nx, ny, o.nodeR || 21, o.nodeR || 21, { tool: o.curve || 'pen', seed: s + 12, color: o.curveColor, w: o.curveW });
    if (o.nodeLabel !== false) text(SK.layer(over, o.curve || 'pen'), nx - (o.nodeR || 21) - 12, ny - (o.nodeR || 21) + 2, '1', { font: o.nodeFont || "'Nothing You Could Do'", size: o.nodeSize || 22, color: o.nodeColor || o.curveColor || '#b1222d' });
    /* can only move sideways now: say so with the arrows */
    const NR = o.nodeR || 21, aw = o.curveW && o.curveW * 0.8;
    if (o.arrows === 'side') {
      SK.arrow(over, nx - NR - 10, ny + 1, nx - NR - 62, ny + 3, { tool: o.curve || 'pen', seed: s + 13, bend: 0.06, head: 11, color: o.curveColor, w: aw });
      SK.arrow(over, nx + NR + 10, ny + 1, nx + NR + 62, ny - 1, { tool: o.curve || 'pen', seed: s + 14, bend: -0.06, head: 11, color: o.curveColor, w: aw });
    } else {
      const ay = ny + NR + 18;
      SK.arrow(over, nx - 8, ay, nx - 46, ay + 2, { tool: o.curve || 'pen', seed: s + 13, bend: 0.08, head: 9, color: o.curveColor, w: aw });
      SK.arrow(over, nx + 8, ay, nx + 46, ay - 1, { tool: o.curve || 'pen', seed: s + 14, bend: -0.08, head: 9, color: o.curveColor, w: aw });
    }
    return { node: [nx, ny], Y };
  };

  /* ── range ruler with snapping stops ──────────────────────────────── */
  NB.STOPS_LO = [40, 60, 100]; NB.STOPS_HI = [10000, 12000, 15000, 18000];
  NB.ruler = (over, r, o = {}) => {
    const s = o.seed || 1, tool = o.tool || 'pencil';
    const XL = [0, 0.13, 0.26], XH = [0.68, 0.79, 0.895, 1];
    const pos = (u) => r.x + u * r.w, y = r.y + r.h * 0.42;
    SK.line(over, r.x - 6, y, r.x + r.w + 8, y + 1, { tool, seed: s });
    const lab = SK.layer(over, o.labelTool || tool);
    const all = NB.STOPS_LO.map((f, i) => [f, XL[i]]).concat(NB.STOPS_HI.map((f, i) => [f, XH[i]]));
    const sel = o.sel || [60, 12000];
    all.forEach(([f, u], i) => {
      const x = pos(u);
      SK.line(over, x, y - 8, x + 0.6, y + 8, { tool, seed: s + i + 3, grow: false });
      text(lab, x, y + 36, fmt(f), { font: o.font, size: o.size || 24, color: sel.includes(f) ? o.selColor || '#b1222d' : o.color || '#6a665c' });
    });
    const a = pos(XL[NB.STOPS_LO.indexOf(sel[0])]), b = pos(XH[NB.STOPS_HI.indexOf(sel[1])]);
    /* the chosen span, gone over with the accent */
    SK.stroke(over, [[a, y - 1], [b, y - 2]], { tool: o.spanTool || 'pen', seed: s + 30, w: o.spanW || 4.5, color: o.spanColor, amp: 0.7 });
    if (o.spanTool !== 'crayon') SK.stroke(over, [[a + 6, y + 3], [b - 4, y + 2]], { tool: o.spanTool || 'pen', seed: s + 31, w: (o.spanW || 4.5) * 0.6, color: o.spanColor, amp: 1, op: 0.6 });
    for (const [x, sg] of [[a, 1], [b, -1]]) {
      SK.stroke(over, [[x - 7 * sg, y - 15], [x, y - 3], [x + 7 * sg, y - 15], [x - 7 * sg, y - 15]], { tool: o.handleTool || 'pen', seed: s + x, amp: 0.25, grow: false, taper: 0.06, color: o.spanColor, step: 2 });
    }
  };

  /* ── scrubber / volume as drawn lines ─────────────────────────────── */
  NB.track = (over, r, o = {}) => {
    const s = o.seed || 1, y = r.y + r.h / 2, x2 = r.x + r.w * (o.pos ?? 0.3);
    SK.line(over, r.x, y, r.x + r.w, y + 1, { tool: o.tool || 'pencil', seed: s, w: o.w });
    SK.line(over, r.x, y - 0.5, x2, y, { tool: o.done || 'pen', seed: s + 1, w: (o.doneW || 3), color: o.doneColor });
    /* the knob is scribbled in, not stamped */
    SK.loop(over, x2, y, 6, 6, { tool: o.knob || 'ink', seed: s + 2, turns: 3.4, w: o.knobW || 3, color: o.knobColor });
  };

  /* ── transport glyphs ─────────────────────────────────────────────── */
  NB.skip = (over, b, back, o = {}) => {
    const s = o.seed || 1, cx = b.x + b.w / 2, cy = b.y + b.h / 2, R = Math.max(b.w, b.h) * 0.62;
    const a0 = back ? -0.35 : Math.PI + 0.35, a1 = back ? -0.35 - 5.2 : Math.PI + 0.35 + 5.2;
    const pts = SK.arc(cx, cy, R, R * 0.92, a0, a1, 40);
    SK.stroke(over, pts, { tool: o.tool || 'pencil', seed: s, grow: false, amp: 0.4 });
    const e = pts[pts.length - 1], p = pts[pts.length - 4], ang = Math.atan2(e[1] - p[1], e[0] - p[0]);
    SK.stroke(over, [[e[0] - Math.cos(ang - 0.5) * 8, e[1] - Math.sin(ang - 0.5) * 8], e, [e[0] - Math.cos(ang + 0.5) * 8, e[1] - Math.sin(ang + 0.5) * 8]], { tool: o.tool || 'pencil', seed: s + 3, grow: false, amp: 0.2, step: 2 });
  };
  NB.play = (over, b, o = {}) => {
    const s = o.seed || 1, cx = b.x + b.w / 2, cy = b.y + b.h / 2, R = o.R || Math.max(b.w, b.h) * 0.5;
    if (o.fill) SK.loop(over, cx, cy, R * 0.9, R * 0.9, { tool: o.fill, seed: s + 7, turns: 7, w: o.fillW || 9, amp: 1.6 });
    SK.loop(over, cx, cy, R, R * 0.97, { tool: o.ring || 'pen', seed: s, w: o.ringW, color: o.ringColor });
    const t = R * 0.42;
    SK.stroke(over, [[cx - t * 0.6, cy - t], [cx + t * 0.95, cy + 0.5], [cx - t * 0.55, cy + t], [cx - t * 0.62, cy - t - 1]], { tool: o.tri || o.ring || 'pen', seed: s + 2, grow: false, amp: 0.3, step: 2, taper: 0.05, color: o.triColor || o.ringColor, w: o.triW });
  };

  /* rounded rectangle as a point list, starting top-left */
  NB.rr = (x, y, w, h, r, n = 8) => {
    const p = [], c = [[x + w - r, y + r, -Math.PI / 2], [x + w - r, y + h - r, 0], [x + r, y + h - r, Math.PI / 2], [x + r, y + r, Math.PI]];
    p.push([x + r, y]);
    for (const [cx, cy, a0] of c) for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * (Math.PI / 2); p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    p.push([x + r + 1, y]);
    return p;
  };

  /* ── a pencil study of headphones, front view, shaded with hatching ── */
  NB.headphones = (over, x, y, sc = 1, o = {}) => {
    const s = o.seed || 1, t = o.tool || 'pencil', P = (a) => a.map(([u, v]) => [x + u * sc, y + v * sc]);
    const st = (pts, k, extra = {}) => SK.stroke(over, P(pts), { tool: t, seed: s + k, grow: false, amp: 0.45, ...extra });
    /* padded headband: outer + inner line, stitching along the pad */
    st(SK.arc(110, 118, 96, 104, Math.PI * 1.06, Math.PI * 1.94, 56), 1);
    st(SK.arc(110, 118, 84, 92, Math.PI * 1.08, Math.PI * 1.92, 56), 2);
    const sr = SK.rng(s + 3);
    for (let a = Math.PI * 1.2; a < Math.PI * 1.8; a += 0.075) {
      const p = [110 + Math.cos(a) * 90, 118 + Math.sin(a) * 98], q = [110 + Math.cos(a + 0.035) * 90, 118 + Math.sin(a + 0.035) * 98];
      st([p, q], 100 + a * 10, { tool: 'soft', amp: 0.05, op: 0.7 + sr() * 0.3 });
    }
    SK.hatch(over, x + 40 * sc, y + 14 * sc, 140 * sc, 12 * sc, { seed: s + 4, angle: 100, gap: 3, tool: 'soft', ragged: 2, op: 0.35 });
    /* sliders and yokes */
    for (const [sx, k] of [[18, 0], [202, 1]]) {
      st([[sx - 3, 102], [sx - 3, 128]], 10 + k); st([[sx + 3, 102], [sx + 3, 128]], 12 + k);
      st([[sx - 22, 140], [sx - 20, 128], [sx + 20, 128], [sx + 22, 140]], 14 + k);
    }
    /* cups: shell + thick cushion facing inward */
    for (const [cx, k, dir] of [[18, 0, 1], [202, 1, -1]]) {
      st(NB.rr(cx - 24, 138, 48, 88, 20), 20 + k);
      const cu = dir > 0 ? cx + 14 : cx - 30;
      st(NB.rr(cu, 146, 16, 72, 8), 22 + k);
      st([[cu + (dir > 0 ? 3 : 13), 156], [cu + (dir > 0 ? 3 : 13), 208]], 24 + k, { tool: 'soft' });
      /* shading on the outer flank of the shell */
      SK.hatch(over, x + (dir > 0 ? cx - 22 : cx + 4) * sc, y + 144 * sc, 18 * sc, 76 * sc, { seed: s + 30 + k, angle: dir > 0 ? 70 : 110, gap: 3.1, tool: 'soft', ragged: 3 });
      SK.hatch(over, x + cu * sc, y + 150 * sc, 16 * sc, 64 * sc, { seed: s + 32 + k, angle: dir > 0 ? 20 : 160, gap: 4.2, tool: 'soft', ragged: 2, op: 0.35 });
    }
    /* cable, loosely coiled */
    st([[14, 226], [18, 246], [8, 262], [26, 280], [52, 284], [76, 274], [92, 286]], 40, { tool: 'soft' });
    /* contact shadow */
    SK.hatch(over, x - 8 * sc, y + 228 * sc, 236 * sc, 8 * sc, { seed: s + 41, angle: 6, gap: 2.4, tool: 'soft', ragged: 12, op: 0.4 });
  };

  /* ── tally marks, grouped in fives ────────────────────────────────── */
  NB.tally = (over, x, y, n, o = {}) => {
    const s = o.seed || 1, t = o.tool || 'pencil', h = o.h || 30, gap = o.gap || 9;
    let cx = x;
    for (let i = 0; i < n; i++) {
      const k = i % 5;
      if (k < 4) SK.line(over, cx + k * gap, y, cx + k * gap + 1.5, y + h, { tool: t, seed: s + i, grow: false, amp: 0.5 });
      else { SK.line(over, cx - 6, y + h * 0.75, cx + 3 * gap + 6, y + h * 0.18, { tool: t, seed: s + i, grow: false, amp: 0.5 }); cx += 4 * gap + 18; }
    }
  };

  /* ── a speaker, for the collage and marker sheets ─────────────────── */
  NB.speaker = (over, x, y, sc = 1, o = {}) => {
    const s = o.seed || 1, t = o.tool || 'pencil', P = (a) => a.map(([u, v]) => [x + u * sc, y + v * sc]);
    const st = (pts, k, ex = {}) => SK.stroke(over, P(pts), { tool: t, seed: s + k, grow: false, amp: 0.55, ...ex });
    st([[8, 6], [134, 4]], 1); st([[134, 2], [138, 212]], 2); st([[140, 212], [6, 214]], 3); st([[8, 216], [6, 4]], 4);
    st([[134, 6], [150, 14], [154, 220], [138, 212]], 5, { tool: 'soft' });
    st(SK.arc(72, 64, 24, 24, 0, Math.PI * 2.1, 40), 6);
    st(SK.arc(72, 64, 9, 9, 0, Math.PI * 2.1, 24), 7);
    st(SK.arc(72, 146, 48, 48, 0, Math.PI * 2.08, 56), 8);
    st(SK.arc(72, 146, 34, 34, 0, Math.PI * 2.05, 48), 9);
    st(SK.arc(72, 146, 12, 12, 0, Math.PI * 2.1, 28), 10);
    SK.hatchEllipse(over, x + 72 * sc, y + 146 * sc, 34 * sc, 34 * sc, { seed: s + 11, angle: 130, gap: 3.6, from: 0.1, tool: 'soft' });
    SK.hatch(over, x + 138 * sc, y + 14 * sc, 14 * sc, 196 * sc, { seed: s + 12, angle: 80, gap: 3.2, tool: 'soft', ragged: 3 });
  };

  /* ── a speech bubble drawn in marker (outline, optional fill, tail) ── */
  NB.bubble = (c, r, o = {}) => {
    const R = Math.min(o.radius || 46, r.w / 2.2, r.h / 2.2), s = o.seed || 1;
    const P = NB.rr(r.x, r.y, r.w, r.h, R, 12), t = o.tail;
    let pts = P;
    if (t) {
      /* splice the tail into the side it hangs from */
      const at = t.at ?? 0.25, tw = t.w || 46, th = t.h || 52, k = t.kink ?? -0.35;
      if (t.side === 'b') {
        const tx = r.x + R + (r.w - 2 * R - tw) * at, i = P.findIndex((q, j) => j > 1 && Math.abs(q[1] - (r.y + r.h)) < 0.5 && q[0] < r.x + r.w - R + 0.5);
        pts = P.slice(0, i + 1).concat([[tx + tw, r.y + r.h], [tx + tw * (0.5 + k), r.y + r.h + th], [tx, r.y + r.h]], P.slice(i + 1));
      } else if (t.side === 'l') {
        const ty = r.y + R + (r.h - 2 * R - tw) * at, i = P.findIndex((q, j) => j > 1 && Math.abs(q[0] - r.x) < 0.5 && q[1] > r.y + R - 0.5);
        pts = P.slice(0, i + 1).concat([[r.x, ty + tw], [r.x - th, ty + tw * (0.5 + k)], [r.x, ty]], P.slice(i + 1));
      } else if (t.side === 'r') {
        const ty = r.y + R + (r.h - 2 * R - tw) * at, i = P.findIndex((q, j) => j > 1 && Math.abs(q[0] - (r.x + r.w)) < 0.5);
        pts = P.slice(0, i + 1).concat([[r.x + r.w, ty], [r.x + r.w + th, ty + tw * (0.5 + k)], [r.x + r.w, ty + tw]], P.slice(i + 1));
      }
    }
    if (o.fill) {
      /* solid: an opaque underlay so nothing below shows through the grain */
      if (o.solid) SK.el('path', { d: SK.poly(SK.wob(pts, { amp: 1, seed: s + 3, grow: false, bow: 0, step: 4 })), fill: o.fill }, c);
      const f = SK.layer(c, o.tool || 'marker');
      SK.el('path', { d: SK.poly(SK.wob(pts, { amp: 1, seed: s + 3, grow: false, bow: 0, step: 4 })), fill: o.fill, opacity: 0.97 }, f);
    }
    /* outline: one continuous marker pass that overshoots its own start */
    const loop = pts.concat(pts.slice(1, 6).map(([x, y]) => [x + 2, y + 3]));
    SK.stroke(c, loop, { tool: o.tool || 'marker', seed: s, w: o.w || 4.6, bow: 0, amp: 0.9, grow: false, step: 4, color: o.color });
  };

  /* ── spiral wire binding along the top edge ── */
  NB.spiral = (c, x0, x1, y, o = {}) => {
    const g = SK.el('g', {}, c), pitch = o.pitch || 34;
    for (let x = x0; x <= x1; x += pitch) {
      SK.el('rect', { x: x - 5.5, y: y + 12, width: 11, height: 9, rx: 4.5, fill: '#2a2620', opacity: 0.85 }, g);
      SK.el('path', { d: `M${x} ${y + 17} C${x - 3} ${y - 6} ${x + 14} ${y - 18} ${x + 19} ${y + 2}`, stroke: '#000', 'stroke-opacity': 0.35, 'stroke-width': 6, fill: 'none', filter: 'url(#sk-shadow-s)', transform: 'translate(1.5 2.5)' }, g);
      SK.el('path', { d: `M${x} ${y + 17} C${x - 3} ${y - 6} ${x + 14} ${y - 18} ${x + 19} ${y + 2}`, stroke: '#57534c', 'stroke-width': 4.6, fill: 'none', 'stroke-linecap': 'round' }, g);
      SK.el('path', { d: `M${x - 0.5} ${y + 11} C${x - 2} ${y - 5} ${x + 12} ${y - 15} ${x + 17} ${y - 1}`, stroke: '#d6d3cc', 'stroke-width': 1.3, fill: 'none', 'stroke-linecap': 'round', opacity: 0.9 }, g);
    }
  };

  /* ── marker doodles ── */
  NB.doodlePhones = (c, x, y, sc = 1, o = {}) => {
    const s = o.seed || 1, P = (a) => a.map(([u, v]) => [x + u * sc, y + v * sc]);
    const st = (pts, k, ex = {}) => SK.stroke(c, P(pts), { tool: o.tool || 'marker', seed: s + k, grow: false, amp: 0.7, w: (o.w || 4) * sc, ...ex });
    st(SK.arc(60, 64, 50, 54, Math.PI * 1.04, Math.PI * 1.96, 40), 1);
    st(NB.rr(0, 60, 26, 46, 11, 6), 2);
    st(NB.rr(94, 60, 26, 46, 11, 6), 3);
    /* sound coming off it */
    st(SK.arc(60, 84, 74, 64, -0.35, 0.35, 10).map(([u, v]) => [u + 0, v]), 4, { w: 2.6 * sc });
    st(SK.arc(60, 84, 88, 76, -0.3, 0.3, 10), 5, { w: 2.6 * sc });
  };
  NB.star = (c, x, y, r, o = {}) => {
    const s = o.seed || 1;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI + 0.2;
      SK.stroke(c, [[x - Math.cos(a) * r, y - Math.sin(a) * r], [x + Math.cos(a) * r, y + Math.sin(a) * r]], { tool: o.tool || 'marker', seed: s + i, grow: false, w: o.w || 4, amp: 0.3 });
    }
  };
})();
