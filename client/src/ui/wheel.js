// Dibujo y animación de la ruleta (canvas). El premio lo decide el servidor: acá solo se anima hasta él.

/** Dibuja la ruleta en un canvas. segments: [{ coins, jackpot, color }] en sentido horario desde arriba. */
export function drawWheel(canvas, segments, labels) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const size = canvas.clientWidth || 300;
  canvas.width = size * dpr; canvas.height = size * dpr;
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);
  const c = size / 2, r = c - 6, n = segments.length, arc = (Math.PI * 2) / n;

  // borde dorado con luces
  g.fillStyle = '#b07a00'; g.beginPath(); g.arc(c, c, r + 4, 0, Math.PI * 2); g.fill();
  segments.forEach((s, i) => {
    const a0 = -Math.PI / 2 + i * arc; // empieza arriba
    g.beginPath(); g.moveTo(c, c); g.arc(c, c, r, a0, a0 + arc); g.closePath();
    const grd = g.createRadialGradient(c, c, r * 0.2, c, c, r);
    grd.addColorStop(0, shade(s.color, 0.25)); grd.addColorStop(1, s.color);
    g.fillStyle = s.jackpot ? '#111' : grd; g.fill();
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2; g.stroke();

    // texto del casillero, radial
    g.save();
    g.translate(c, c); g.rotate(a0 + arc / 2);
    g.textAlign = 'right'; g.textBaseline = 'middle';
    if (s.jackpot) {
      g.fillStyle = '#ffd60a'; g.font = `900 ${Math.round(size * 0.05)}px sans-serif`;
      g.fillText('💎 ' + labels.jackpot, r - 10, 0);
    } else {
      g.fillStyle = '#fff'; g.font = `900 ${Math.round(size * 0.065)}px sans-serif`;
      g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 4;
      g.fillText(labels.fmt(s.coins), r - 12, 0);
    }
    g.restore();
  });
  // luces del borde
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    g.fillStyle = i % 2 ? '#fff6c2' : '#ffc531';
    g.beginPath(); g.arc(c + Math.cos(a) * (r + 1), c + Math.sin(a) * (r + 1), 3.2, 0, Math.PI * 2); g.fill();
  }
  // centro
  g.fillStyle = '#ffc531'; g.beginPath(); g.arc(c, c, r * 0.13, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#8a5a00'; g.font = `900 ${Math.round(size * 0.07)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('C', c, c + 1);
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.min(255, Math.round(v + (255 - v) * k));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/**
 * Gira el elemento hasta dejar el casillero `index` bajo la flecha de arriba.
 * onTick se llama cada vez que pasa un casillero (para el sonido). Devuelve una Promise.
 */
export function spinTo(el, index, n, { from = 0, turns = 6, duration = 5200, onTick } = {}) {
  const seg = 360 / n;
  const jitter = (Math.random() - 0.5) * seg * 0.6; // no siempre en el centro exacto del casillero
  const base = from - (from % 360);
  const target = base + turns * 360 + (360 - (index * seg + seg / 2)) + jitter;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const total = reduce ? 1200 : duration;
  const start = performance.now();
  let lastSeg = Math.floor(from / seg);
  return new Promise((resolve) => {
    const frame = (now) => {
      const t = Math.min(1, (now - start) / total);
      const e = 1 - Math.pow(1 - t, 4); // frena de a poco
      const angle = from + (target - from) * e;
      el.style.transform = `rotate(${angle}deg)`;
      const s = Math.floor(angle / seg);
      if (s !== lastSeg) { lastSeg = s; onTick?.(); }
      if (t < 1) requestAnimationFrame(frame); else resolve(target);
    };
    requestAnimationFrame(frame);
  });
}
