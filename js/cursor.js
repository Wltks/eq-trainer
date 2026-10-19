/* Hand-drawn pencil cursors.
   Each cursor is a small self-contained SVG (64-unit grid shown at 32 px, so it
   stays sharp on high-DPI screens). The pencil is drawn lying along +x with the
   point at the origin, then turned so the point lands at the lower left — the
   hotspot sits exactly on the graphite tip. */
(() => {
  const P = (window.PENCIL = {});
  const INK = '#34322d', RED = '#c41a32', PAPER = '#fbfaf7', WOOD = '#e9d6b6';
  const HOT = [3, 29];   /* tip, in 32-px cursor space */

  /* shared defs: pencil grain on the lines, a soft lift off the page */
  const defs = `<defs>
    <filter id="g" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="1" seed="4" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="1.1"/></filter>
    <filter id="w" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="1" seed="9" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6"/></filter>
    <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="1.2" dy="1.8" stdDeviation="1" flood-color="#2a2620" flood-opacity=".28"/></filter></defs>`;
  const line = (d, c = INK, w = 1.8) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const shape = (d, fill, c = INK, w = 1.8) => `<path d="${d}" fill="${fill}" stroke="${c}" stroke-width="${w}" stroke-linejoin="round"/>`;

  /* a doodled ring around the tip: the "you can click this" state */
  const ring = (c) => `<g filter="url(#g)">${line('M10.6 55.4C9.4 51.6 3.6 51.8 2.4 55.6 1.2 59.6 5.4 62.8 8.8 61.4 11.4 60.2 11.6 57.2 10 55', c, 1.8)}</g>`;

  const KIND = {
    /* 1 · graphite sketch: plain paper body, facets, shading, ferrule and eraser */
    graphite: (hover) => `
      <g transform="translate(6 58) rotate(-45)">
        ${shape('M14 -6.1L33 -5.8 52.2 -6.1 52.3 6 33 6.3 14 5.9Z', PAPER)}
        ${shape('M0.4 0L14 -6.1 12.3 -3.4 14 -1.6 12.3 0.1 14 1.7 12.3 3.5 14 5.9Z', WOOD)}
        ${shape('M0 0L4.6 -2 4.6 2.1Z', INK, INK, 1.4)}
        ${shape('M52.2 -6.5H57.2V6.5H52.2Z', '#c8c3b9')}
        ${line('M53.9 -6.2V6.2M55.6 -6.2V6.2', INK, 1.1)}
        ${shape('M57.2 -6.1C60.6 -6 62.4 -3.6 62.4 0 62.4 3.6 60.6 6 57.2 6.1Z', '#e2b9b0')}
        <g filter="url(#g)">
          ${line('M15.8 -2.1L51 -2.3M15.8 2.3L51 2.1', INK, 1)}
          ${line('M19 5.2L21.6 2.6M23.4 5.3L26 2.7M27.8 5.4L30.4 2.8M32.2 5.4L34.8 2.8M36.6 5.4L39.2 2.8M41 5.3L43.6 2.7M45.4 5.3L48 2.7', INK, 0.9)}
        </g>
      </g>${hover ? ring(RED) : ''}`,

    /* 2 · red colour pencil: the page's accent, bare painted end, no ferrule */
    red: (hover) => `
      <g transform="translate(6 58) rotate(-45)">
        ${shape('M14 -6.1L36 -5.8 59.4 -6.1 59.6 6 36 6.3 14 5.9Z', RED)}
        ${shape('M0.4 0L14 -6.1 12.3 -3.4 14 -1.6 12.3 0.1 14 1.7 12.3 3.5 14 5.9Z', WOOD)}
        ${shape('M0 0L4.6 -2 4.6 2.1Z', RED, INK, 1.4)}
        ${shape('M59.4 -6.1C61.2 -5 61.8 -2.6 61.8 0 61.8 2.6 61.2 5 59.6 6Z', '#e9d6b6')}
        <circle cx="60.4" cy="0" r="1.5" fill="${RED}"/>
        <g filter="url(#g)">
          ${line('M15.8 -2.1L58 -2.3', '#8e1023', 1.1)}
          ${line('M15.8 2.3L58 2.1', '#f0a3ad', 1.1)}
        </g>
      </g>${hover ? ring(INK) : ''}`,

    /* 3 · stub: a short, chewed-down pencil in loose overshooting lines */
    stub: (hover) => `
      <g transform="translate(6 58) rotate(-45)">
        ${shape('M12 -7.2L35 -7 35.2 7.1 12 6.9Z', PAPER, 'none')}
        ${shape('M0.5 0L12 -7.2 12 6.9Z', WOOD, 'none')}
        <g filter="url(#g)">
          ${line('M9.6 -7.3L37.4 -7M10 7L37.2 7.2', INK, 2.2)}
          ${line('M12.2 -9V8.9M35.2 -8.8V9', INK, 2)}
          ${line('M0 0.4L13.6 -8.1M0.4 -0.4L13.4 7.9', INK, 2)}
          ${line('M35.2 -7C39.8 -6.4 40.6 6.2 35.2 7', INK, 2)}
          ${line('M17 4.6L21 -4.8M21.6 4.8L25.6 -4.6M26.2 4.8L30.2 -4.6', INK, 1.2)}
        </g>
        ${shape('M0 0L4.4 -2.6 4.4 2.6Z', INK, INK, 1.2)}
      </g>${hover ? ring(RED) : ''}`,
  };
  P.KINDS = Object.keys(KIND);
  P.NAMES = { graphite: '흑연 연필', red: '빨간 색연필', stub: '몽당연필' };

  P.svg = (kind, hover = false, px = 32) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 64 64">${defs}<g filter="url(#s)"><g filter="url(#w)">${KIND[kind](hover)}</g></g></svg>`;
  P.uri = (kind, hover, px) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(P.svg(kind, hover, px));
  P.hot = HOT;

  /* make it the cursor everywhere on the page; links and controls get the ringed state */
  P.apply = (kind, clickable = 'a,button,[data-click]') => {
    const css = (h) => `url("${P.uri(kind, h, 32)}") ${HOT[0]} ${HOT[1]}, ${h ? 'pointer' : 'auto'}`;
    const st = document.getElementById('pencil-cursor') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'pencil-cursor' }));
    st.textContent = `html,body,*{cursor:${css(false)} !important}
      ${clickable.split(',').map((s) => s + ',' + s + ' *').join(',')}{cursor:${css(true)} !important}`;
  };
})();
