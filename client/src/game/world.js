import * as THREE from 'three';
import { createRng } from './rng.js';
import { LANES, RULES, speedAtDistance } from './rules.js';
import { toon, coinFaceTex } from './characters.js';

// ---------------------------------------------------------------------------
// Texturas generadas con canvas (sin assets externos)
// ---------------------------------------------------------------------------
function canvasTexture(w, h, draw, repeat = false) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const glowTex = canvasTexture(64, 64, (g, w) => {
  const grd = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, w, w);
});

const trackTex = canvasTexture(256, 256, (g, w, h) => {
  g.fillStyle = '#3a3f4f'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1400; i++) { // grano del asfalto
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.08)';
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  g.fillStyle = '#f2f2f2';
  for (const x of [w / 3, (2 * w) / 3]) for (let y = 0; y < h; y += 64) g.fillRect(x - 3, y + 8, 6, 34);
  g.fillStyle = '#f7b500'; g.fillRect(2, 0, 6, h); g.fillRect(w - 8, 0, 6, h);
}, true);
trackTex.repeat.set(1, 40);

const sidewalkTex = canvasTexture(128, 128, (g, w, h) => {
  g.fillStyle = '#9aa0ad'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#7d8391'; g.lineWidth = 3;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke(); g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.stroke(); }
}, true);
sidewalkTex.repeat.set(1, 100);

// Fachada: ventanas (de día reflejan el cielo; el mapa emisivo las enciende de noche)
const facadeTex = canvasTexture(128, 128, (g, w, h) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const grd = g.createLinearGradient(0, y * 32 + 6, 0, y * 32 + 26);
    grd.addColorStop(0, '#9cc4e8'); grd.addColorStop(1, '#4a6d96');
    g.fillStyle = grd; g.fillRect(x * 32 + 6, y * 32 + 6, 20, 20);
  }
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 3, 3); // esquina lisa para los techos
}, true);
const windowsLitTex = canvasTexture(128, 128, (g, w, h) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    if (Math.random() < 0.55) {
      g.fillStyle = Math.random() < 0.8 ? '#ffd58a' : '#8ad8ff';
      g.fillRect(x * 32 + 6, y * 32 + 6, 20, 20);
    }
  }
}, true);

const truckSideTex = canvasTexture(512, 256, (g, w, h) => {
  g.fillStyle = '#8a4b26'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#6d3618'; for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 4, h);
  g.fillStyle = '#ff3b3b'; g.font = '900 64px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('BEAR', w / 2, 80);
  g.fillStyle = '#fff'; g.font = '900 40px sans-serif'; g.fillText('MARKET EXPRESS', w / 2, 140);
  // gráfico bajista
  g.strokeStyle = '#ff3b3b'; g.lineWidth = 8; g.beginPath();
  [[60, 180], [120, 200], [170, 190], [230, 215], [290, 205], [350, 228], [420, 240]].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.stroke();
});
const bearFaceTex = canvasTexture(256, 256, (g, w, h) => {
  g.fillStyle = '#6d3618'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#4a220d'; g.beginPath(); g.arc(60, 70, 34, 0, 7); g.arc(196, 70, 34, 0, 7); g.fill();
  g.fillStyle = '#5a2a10'; g.beginPath(); g.arc(128, 140, 92, 0, 7); g.fill();
  g.fillStyle = '#d9a066'; g.beginPath(); g.ellipse(128, 180, 48, 34, 0, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(92, 118, 18, 0, 7); g.arc(164, 118, 18, 0, 7); g.fill();
  g.fillStyle = '#ff2a2a'; g.beginPath(); g.arc(92, 122, 9, 0, 7); g.arc(164, 122, 9, 0, 7); g.fill();
  g.strokeStyle = '#2a1206'; g.lineWidth = 8; g.beginPath(); g.moveTo(68, 92); g.lineTo(110, 104); g.moveTo(188, 92); g.lineTo(146, 104); g.stroke(); // cejas enojadas
  g.fillStyle = '#2a1206'; g.beginPath(); g.ellipse(128, 166, 18, 12, 0, 0, 7); g.fill();
  g.beginPath(); g.moveTo(98, 205); g.quadraticCurveTo(128, 185, 158, 205); g.stroke();
});
const auditTex = canvasTexture(512, 192, (g, w, h) => {
  g.fillStyle = '#ffd60a'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#111';
  for (let x = -h; x < w + h; x += 64) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 32, h); g.lineTo(x + 32 + h, 0); g.lineTo(x + h, 0); g.fill(); }
  g.fillStyle = '#111'; g.beginPath(); g.roundRect(36, 34, w - 72, h - 68, 14); g.fill();
  g.fillStyle = '#ffd60a'; g.font = '900 70px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('TAX AUDIT', w / 2, h / 2 + 4);
});
const stripesTex = canvasTexture(32, 128, (g, w, h) => {
  for (let y = 0; y < h; y += 32) { g.fillStyle = '#e8e8e8'; g.fillRect(0, y, w, 16); g.fillStyle = '#d62828'; g.fillRect(0, y + 16, w, 16); }
});

// Pantallas y carteles: se generan una vez y se reutilizan
const TICKERS = [['BTC', '+4.2%'], ['ETH', '+2.9%'], ['DOGE', '+69%'], ['TON', '+7.7%'], ['SOL', '-1.3%'], ['PEPE', '+420%'], ['RUSH', '+1000%'], ['FIAT', '-12%']];
const HEADLINES = [
  'MUSKRAT TUITEA UN PERRO: MERCADO +30%', 'THUMP: "ARANCELES A LA LUNA"', 'SATOSHI SIGUE SIN APARECER',
  'BALLENA COMPRA 10.000 BTC', 'BANCO CENTRAL IMPRIME MÁS BILLETES', 'WEN LAMBO?', 'NUEVA MEMECOIN SUBE 9000%', 'HODL O NADA',
];
const screenTextures = TICKERS.map(([sym, ch]) => canvasTexture(256, 160, (g, w, h) => {
  const up = ch.startsWith('+');
  g.fillStyle = '#060a14'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 1;
  for (let y = 40; y < h; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.fillStyle = '#fff'; g.font = 'bold 30px monospace'; g.fillText(sym, 14, 34);
  g.fillStyle = up ? '#3fff8b' : '#ff4d4d'; g.textAlign = 'right'; g.fillText(ch, w - 14, 34);
  g.strokeStyle = up ? '#3fff8b' : '#ff4d4d'; g.lineWidth = 4; g.beginPath();
  let y = up ? 140 : 60;
  for (let x = 10; x < w - 10; x += 16) { y += (Math.random() - (up ? 0.65 : 0.35)) * 22; y = Math.max(50, Math.min(150, y)); x === 10 ? g.moveTo(x, y) : g.lineTo(x, y); }
  g.stroke();
}));
const headlineTextures = HEADLINES.map((text) => canvasTexture(512, 192, (g, w, h) => {
  g.fillStyle = '#0b0f1a'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#d62828'; g.fillRect(0, 0, w, 48);
  g.fillStyle = '#fff'; g.font = '900 28px sans-serif'; g.fillText('● ÚLTIMO MOMENTO', 20, 34);
  g.font = 'bold 36px sans-serif';
  const words = text.split(' '); let line = ''; let y = 96;
  for (const wd of words) {
    if (g.measureText(line + wd).width > w - 40) { g.fillText(line, 20, y); line = ''; y += 44; }
    line += wd + ' ';
  }
  g.fillText(line, 20, y);
}));
const logoTex = canvasTexture(512, 128, (g, w, h) => {
  g.fillStyle = '#ffc531'; g.font = '900 86px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('CRYPTO RUSH', w / 2, h / 2 + 4);
});
const atmTex = canvasTexture(128, 256, (g, w, h) => {
  g.fillStyle = '#f7931a'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#111'; g.fillRect(14, 40, w - 28, 80);
  g.fillStyle = '#3fff8b'; g.font = 'bold 22px monospace'; g.textAlign = 'center'; g.fillText('CRYPTO', w / 2, 72); g.fillText('ATM', w / 2, 100);
  g.fillStyle = '#fff'; g.font = '900 28px sans-serif'; g.fillText('BUY', w / 2, 30);
  g.fillStyle = '#222'; g.fillRect(30, 150, w - 60, 10);
});

// ---------------------------------------------------------------------------
// Geometrías y materiales compartidos
// ---------------------------------------------------------------------------
const G = {
  coin: new THREE.CylinderGeometry(0.42, 0.42, 0.12, 24).rotateX(Math.PI / 2),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
  sphere: new THREE.SphereGeometry(1, 12, 10),
  plane: new THREE.PlaneGeometry(1, 1),
  wheel: new THREE.CylinderGeometry(0.42, 0.42, 0.3, 16).rotateZ(Math.PI / 2),
};
const M = {
  coinEdge: toon(0xe0a000, { emissive: 0x553300 }),
  coinFace: new THREE.MeshToonMaterial({ map: coinFaceTex, emissive: 0x332200 }),
  candleRed: toon(0xe23b3b, { emissive: 0x3a0000 }),
  candleDark: toon(0x2b2f3a),
  wick: toon(0x8a1c1c),
  stripes: toon(0xffffff, { map: stripesTex }),
  audit: toon(0xffffff, { map: auditTex }),
  lightOn: new THREE.MeshBasicMaterial({ color: 0xff8a00 }),
  truckSide: toon(0xffffff, { map: truckSideTex }),
  truckFace: toon(0xffffff, { map: bearFaceTex }),
  truckBrown: toon(0x6d3618),
  tire: toon(0x1a1a1a),
  rim: toon(0xbbbbbb),
  glass: toon(0x2a3a55, { emissive: 0x0a1020 }),
  headlight: new THREE.MeshBasicMaterial({ color: 0xfff2b0 }),
  pole: toon(0x3a3f4f),
  bulb: new THREE.MeshBasicMaterial({ color: 0xfff0c0 }),
  roof: toon(0x4b5263),
  red: new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
  atm: toon(0xffffff, { map: atmTex }),
  logo: new THREE.MeshBasicMaterial({ map: logoTex, transparent: true }),
  sidewalk: toon(0xffffff, { map: sidewalkTex }),
  curb: toon(0xc9ced8),
  grass: toon(0x3d8b4f),
};
const screenMats = screenTextures.map((t) => new THREE.MeshBasicMaterial({ map: t }));
const headlineMats = headlineTextures.map((t) => new THREE.MeshBasicMaterial({ map: t }));
const BUILDING_COLORS = [0xf4a261, 0xe9c46a, 0x8ecae6, 0xb5838d, 0x90be6d, 0xcdb4db, 0xffafcc, 0xa3b18a];
const buildingMats = BUILDING_COLORS.map((c) => new THREE.MeshToonMaterial({
  color: c, map: facadeTex, emissive: 0xffffff, emissiveMap: windowsLitTex, emissiveIntensity: 0,
  gradientMap: M.coinEdge.gradientMap,
}));
const NEON = [0x00f5d4, 0xf72585, 0xf7931a, 0x9b5de5, 0x4cc9f0, 0x2ecc71].map((c) => new THREE.MeshBasicMaterial({ color: c }));
const glowMat = (color, opacity = 0.8) => new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
const lampGlowMat = glowMat(0xffd27a, 0);
const roofLightGlowMat = glowMat(0xff3030, 0);

const part = (geo, mat, [x, y, z] = [0, 0, 0], [sx, sy, sz] = [1, 1, 1]) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  return m;
};

// ---------------------------------------------------------------------------
// Obstáculos
// ---------------------------------------------------------------------------
/** Caja de colisión: alto desde/hasta y largo en z. */
export const OBSTACLE_TYPES = {
  low: { y0: 0, y1: 1.0, len: 0.6 },   // velas rojas: saltar
  high: { y0: 1.25, y1: 3.2, len: 0.3 }, // TAX AUDIT: deslizarse
  wall: { y0: 0, y1: 3.0, len: 7 },     // Bear Express: cambiar de carril
};

function makeObstacle(type) {
  const g = new THREE.Group();
  if (type === 'low') {
    g.add(part(G.box, M.candleDark, [0, 0.07, 0], [2.1, 0.14, 0.7]));
    [[-0.62, 0.55], [0, 0.82], [0.62, 0.66]].forEach(([x, h]) => {
      g.add(part(G.cyl, M.wick, [x, 0.14 + h / 2 + 0.06, 0], [0.04, h + 0.3, 0.04]));
      g.add(part(G.box, M.candleRed, [x, 0.14 + h / 2, 0], [0.38, h - 0.12, 0.38]));
    });
  } else if (type === 'high') {
    for (const x of [-1.1, 1.1]) {
      g.add(part(G.cyl, M.stripes, [x, 1.6, 0], [0.09, 3.2, 0.09]));
      g.add(part(G.sphere, M.lightOn, [x, 3.28, 0], [0.13, 0.13, 0.13]));
      const s = new THREE.Sprite(glowMat(0xff8a00, 0.9)); s.position.set(x, 3.28, 0); s.scale.setScalar(0.9); s.userData.blink = true; g.add(s);
    }
    g.add(part(G.box, M.audit, [0, 1.9, 0], [2.3, 1.1, 0.16]));
  } else {
    // camión: cabina (frente con cara de oso) + caja de carga
    const cab = part(G.box, [M.truckBrown, M.truckBrown, M.truckBrown, M.truckBrown, M.truckFace, M.truckBrown], [0, 1.35, -0.9], [2.1, 2.3, 1.8]);
    g.add(cab);
    g.add(part(G.box, M.glass, [0, 2.15, -0.1], [1.7, 0.5, 0.05]));
    g.add(part(G.box, [M.truckSide, M.truckSide, M.truckBrown, M.truckBrown, M.truckBrown, M.truckBrown], [0, 1.6, -4.4], [2.2, 2.8, 5.2]));
    for (const x of [-0.75, 0.75]) {
      g.add(part(G.sphere, M.headlight, [x, 0.55, 0.02], [0.15, 0.15, 0.05]));
      const s = new THREE.Sprite(glowMat(0xfff2b0, 0.7)); s.position.set(x, 0.55, 0.1); s.scale.setScalar(1.1); g.add(s);
    }
    for (const z of [-1.0, -3.2, -6.2]) for (const x of [-1.05, 1.05]) {
      g.add(part(G.wheel, M.tire, [x, 0.42, z]));
      const rim = part(G.cyl, M.rim, [x * 1.08, 0.42, z], [0.2, 0.05, 0.2]); rim.rotation.z = Math.PI / 2; g.add(rim);
    }
  }
  g.traverse((o) => (o.frustumCulled = false));
  return g;
}

// ---------------------------------------------------------------------------
// Power-ups (también se usan sobre el jugador mientras están activos)
// ---------------------------------------------------------------------------
export function makePowerupModel(kind) {
  const g = new THREE.Group();
  if (kind === 'magnet') { // ballena con un imán en la cabeza
    const blue = toon(0x3a86ff), belly = toon(0xbde0fe);
    g.add(part(G.sphere, blue, [0, 0, 0], [0.42, 0.33, 0.55]));
    g.add(part(G.sphere, belly, [0, -0.1, 0.08], [0.34, 0.22, 0.45]));
    const tail = new THREE.Group(); tail.position.set(0, 0.05, -0.55);
    tail.add(part(new THREE.ConeGeometry(0.12, 0.3, 8), blue, [0, 0, 0]).rotateX(Math.PI / 2));
    for (const s of [-1, 1]) { const f = part(G.sphere, blue, [s * 0.15, 0.08, -0.12], [0.2, 0.05, 0.1]); f.rotation.z = s * 0.4; tail.add(f); }
    g.add(tail);
    for (const s of [-1, 1]) {
      g.add(part(G.sphere, M.bulb, [s * 0.3, 0.06, 0.32], [0.07, 0.07, 0.04]));
      g.add(part(G.sphere, new THREE.MeshBasicMaterial({ color: 0x111111 }), [s * 0.31, 0.06, 0.345], [0.035, 0.035, 0.02]));
    }
    const mag = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.05, 8, 16, Math.PI), toon(0xe63946));
    mag.position.set(0, 0.42, 0.05); g.add(mag);
    for (const s of [-1, 1]) g.add(part(G.cyl, toon(0xdddddd), [s * 0.14, 0.36, 0.05], [0.05, 0.1, 0.05]));
    g.userData.spin = tail;
  } else if (kind === 'rocket') {
    const body = toon(0xf1f1f1), red = toon(0xe63946);
    g.add(part(G.cyl, body, [0, 0, 0], [0.2, 0.7, 0.2]));
    g.add(part(new THREE.ConeGeometry(0.2, 0.35, 16), red, [0, 0.52, 0]));
    const win = part(G.cyl, toon(0x4cc9f0, { emissive: 0x114466 }), [0, 0.12, 0.17], [0.09, 0.03, 0.09]); win.rotation.x = Math.PI / 2; g.add(win);
    for (let i = 0; i < 3; i++) {
      const fin = part(G.box, red, [0, -0.3, 0], [0.04, 0.28, 0.2]);
      const pivot = new THREE.Group(); pivot.rotation.y = (i / 3) * Math.PI * 2; fin.position.z = 0.22; pivot.add(fin); g.add(pivot);
    }
    const flame = part(new THREE.ConeGeometry(0.14, 0.45, 12), new THREE.MeshBasicMaterial({ color: 0xffa630, transparent: true, opacity: 0.9 }), [0, -0.58, 0]);
    flame.rotation.x = Math.PI; g.add(flame);
    g.userData.flame = flame;
  } else { // escudo HODL
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.45); shape.quadraticCurveTo(0.25, 0.42, 0.42, 0.32); shape.lineTo(0.38, -0.05);
    shape.quadraticCurveTo(0.3, -0.35, 0, -0.52); shape.quadraticCurveTo(-0.3, -0.35, -0.38, -0.05);
    shape.lineTo(-0.42, 0.32); shape.quadraticCurveTo(-0.25, 0.42, 0, 0.45);
    const ext = (depth) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
    const rim = new THREE.Mesh(ext(0.06), toon(0xffc531, { emissive: 0x442a00 }));
    rim.scale.set(1.12, 1.12, 1); rim.position.z = -0.06; g.add(rim);
    g.add(new THREE.Mesh(ext(0.1), toon(0x2f6bff, { emissive: 0x0a1a50 })));
    g.add(part(new THREE.CircleGeometry(0.2, 24), new THREE.MeshBasicMaterial({ map: coinFaceTex }), [0, 0.02, 0.14]));
  }
  const color = { magnet: 0x4cc9f0, rocket: 0xff7b00, shield: 0x5b8cff }[kind];
  const glow = new THREE.Sprite(glowMat(color, 0.55)); glow.scale.setScalar(2.2); g.add(glow);
  g.userData.glow = glow;
  return g;
}

function makePickup(kind) {
  const g = new THREE.Group();
  const model = makePowerupModel(kind);
  model.scale.setScalar(1.4);
  g.add(model);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.05, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
  g.add(ring);
  g.userData = { model, ring };
  return g;
}

// ---------------------------------------------------------------------------
// Partículas (destellos de monedas, polvo, escudo roto)
// ---------------------------------------------------------------------------
class Particles {
  constructor(scene) {
    this.items = [];
    this.mats = {
      gold: glowMat(0xffd54a, 1), dust: new THREE.SpriteMaterial({ map: glowTex, color: 0xc9b8a0, transparent: true, opacity: 0.7, depthWrite: false }),
      blue: glowMat(0x5b8cff, 1), white: glowMat(0xffffff, 1), fire: glowMat(0xff8a00, 1),
    };
    this.group = new THREE.Group(); scene.add(this.group);
  }
  emit(pos, kind, n, { spread = 1, up = 2, life = 0.5, size = 0.35 } = {}) {
    for (let i = 0; i < n; i++) {
      if (this.items.length > 160) break;
      const s = new THREE.Sprite(this.mats[kind].clone());
      s.position.copy(pos);
      s.scale.setScalar(size);
      this.group.add(s);
      this.items.push({ s, life, max: life, size,
        v: new THREE.Vector3((Math.random() - 0.5) * spread * 4, Math.random() * up + 0.5, (Math.random() - 0.3) * spread * 3) });
    }
  }
  update(dt) {
    this.items = this.items.filter((p) => {
      p.life -= dt;
      if (p.life <= 0) { this.group.remove(p.s); p.s.material.dispose(); return false; }
      p.v.y -= 6 * dt;
      p.s.position.addScaledVector(p.v, dt);
      const k = p.life / p.max;
      p.s.material.opacity = k;
      p.s.scale.setScalar(p.size * (0.6 + (1 - k) * 0.8));
      return true;
    });
  }
}

// ---------------------------------------------------------------------------
// Ciclo de día y noche
// ---------------------------------------------------------------------------
const C = (h) => new THREE.Color(h);
// fase 0..1: día → atardecer → noche → amanecer → día
const SKY_KEYS = [
  { t: 0.00, top: C(0x2f7bff), bot: C(0xbfe6ff), fog: C(0xcde9ff), hemi: 1.9, sun: 2.0, sunCol: C(0xfff3d6), night: 0 },
  { t: 0.32, top: C(0x2f7bff), bot: C(0xbfe6ff), fog: C(0xcde9ff), hemi: 1.9, sun: 2.0, sunCol: C(0xfff3d6), night: 0 },
  { t: 0.42, top: C(0x3a2a70), bot: C(0xff8a4c), fog: C(0xf2a07a), hemi: 1.3, sun: 1.4, sunCol: C(0xff9a5a), night: 0.45 },
  { t: 0.50, top: C(0x050818), bot: C(0x1c2450), fog: C(0x18204a), hemi: 0.9, sun: 0.7, sunCol: C(0x9fb4ff), night: 1 },
  { t: 0.80, top: C(0x050818), bot: C(0x1c2450), fog: C(0x18204a), hemi: 0.9, sun: 0.7, sunCol: C(0x9fb4ff), night: 1 },
  { t: 0.90, top: C(0x5a6ad0), bot: C(0xffb27a), fog: C(0xffc29a), hemi: 1.4, sun: 1.5, sunCol: C(0xffc08a), night: 0.4 },
  { t: 1.00, top: C(0x2f7bff), bot: C(0xbfe6ff), fog: C(0xcde9ff), hemi: 1.9, sun: 2.0, sunCol: C(0xfff3d6), night: 0 },
];
function skyAt(phase) {
  let i = 0;
  while (i < SKY_KEYS.length - 2 && SKY_KEYS[i + 1].t <= phase) i++;
  const a = SKY_KEYS[i], b = SKY_KEYS[i + 1];
  const k = THREE.MathUtils.smoothstep(phase, a.t, b.t);
  const lerp = (x, y) => x + (y - x) * k;
  return {
    top: a.top.clone().lerp(b.top, k), bot: a.bot.clone().lerp(b.bot, k), fog: a.fog.clone().lerp(b.fog, k),
    hemi: lerp(a.hemi, b.hemi), sun: lerp(a.sun, b.sun), sunCol: a.sunCol.clone().lerp(b.sunCol, k), night: lerp(a.night, b.night),
  };
}

// ---------------------------------------------------------------------------
// Mundo
// ---------------------------------------------------------------------------
export class World {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.obstacles = []; this.coins = []; this.powerups = []; this.decor = [];
    this.particles = new Particles(scene);

    // luces
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 1.8);
    this.sunLight = new THREE.DirectionalLight(0xffffff, 2);
    this.sunLight.position.set(6, 12, 6);
    scene.add(this.hemi, this.sunLight, this.sunLight.target);
    scene.fog = new THREE.Fog(0xcde9ff, 70, 190);

    // cielo con degradado
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color() }, bot: { value: new THREE.Color() } },
      vertexShader: 'varying vec3 vp; void main(){ vp = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying vec3 vp; void main(){ float h = clamp(vp.y*1.6+0.1,0.0,1.0); gl_FragColor = vec4(mix(bot, top, h),1.0);\n#include <colorspace_fragment>\n}',
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(450, 24, 12), this.skyMat);
    this.sky.renderOrder = -1;
    scene.add(this.sky);

    // estrellas
    const starPos = [];
    for (let i = 0; i < 700; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * 0.45;
      starPos.push(Math.cos(th) * Math.sin(ph) * 420, Math.cos(ph) * 420, Math.sin(th) * Math.sin(ph) * 420);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.stars = new THREE.Points(sg, this.starMat);
    scene.add(this.stars);

    // sol y luna
    this.sun = new THREE.Group();
    this.sun.add(new THREE.Mesh(new THREE.CircleGeometry(16, 32), new THREE.MeshBasicMaterial({ color: 0xfff1b0, fog: false })));
    const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd27a, transparent: true, opacity: 0.8, fog: false, depthWrite: false }));
    sunGlow.scale.setScalar(90); this.sun.add(sunGlow);
    this.moon = new THREE.Group();
    this.moon.add(new THREE.Mesh(new THREE.CircleGeometry(13, 32), new THREE.MeshBasicMaterial({ color: 0xf4f1ff, fog: false })));
    for (const [x, y, r] of [[-4, 3, 2.5], [3, -2, 3.2], [5, 5, 1.6]]) {
      const c = new THREE.Mesh(new THREE.CircleGeometry(r, 16), new THREE.MeshBasicMaterial({ color: 0xd6d2e8, fog: false })); c.position.set(x, y, 0.1); this.moon.add(c);
    }
    const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x9fb4ff, transparent: true, opacity: 0.5, fog: false, depthWrite: false }));
    moonGlow.scale.setScalar(70); this.moon.add(moonGlow);
    scene.add(this.sun, this.moon);

    // calle, veredas y pasto
    this.track = new THREE.Mesh(new THREE.PlaneGeometry(7.8, 400), toon(0xffffff, { map: trackTex }));
    this.track.rotation.x = -Math.PI / 2;
    this.ground = new THREE.Group();
    this.ground.add(this.track);
    for (const s of [-1, 1]) {
      const walk = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.2, 400), [M.curb, M.curb, M.sidewalk, M.curb, M.curb, M.curb]);
      walk.position.set(s * 5.2, 0.1, 0); this.ground.add(walk);
      const grass = new THREE.Mesh(new THREE.PlaneGeometry(60, 400), M.grass);
      grass.rotation.x = -Math.PI / 2; grass.position.set(s * 36.5, -0.01, 0); this.ground.add(grass);
    }
    scene.add(this.ground);

    this.phase = 0.05;
    this.setDayPhase(this.phase);
  }

  /** phase 0..1 (0 = mediodía, 0.5 = medianoche). */
  setDayPhase(phase) {
    this.phase = ((phase % 1) + 1) % 1;
    const s = skyAt(this.phase);
    this.skyMat.uniforms.top.value.copy(s.top);
    this.skyMat.uniforms.bot.value.copy(s.bot);
    this.scene.fog.color.copy(s.fog);
    this.hemi.intensity = s.hemi;
    this.hemi.color.copy(s.sunCol).lerp(C(0xffffff), 0.5);
    this.hemi.groundColor.set(s.night > 0.5 ? 0x223055 : 0x6a7080);
    this.sunLight.intensity = s.sun;
    this.sunLight.color.copy(s.sunCol);
    this.night = s.night;
    this.starMat.opacity = Math.max(0, s.night - 0.3) * 1.4;
    for (const m of buildingMats) m.emissiveIntensity = s.night * 1.1;
    lampGlowMat.opacity = s.night * 0.9;
    M.bulb.color.setHex(s.night > 0.3 ? 0xffe6a0 : 0xd8d8d8);
    roofLightGlowMat.opacity = s.night;
  }

  reset(seed) {
    for (const o of [...this.obstacles, ...this.coins, ...this.powerups, ...this.decor]) this._dispose(o);
    this.obstacles = []; this.coins = []; this.powerups = []; this.decor = [];
    this.rng = createRng(seed);
    this.decoRng = createRng(seed ^ 0x9e3779b9);
    this.nextRowD = 60;
    this.prevFree = new Set([0, 1, 2]);
    this.rows = [];
    this.nextCoinD = 20;
    this.coinLane = 1;
    this.coinRunLeft = 0;
    this.nextDecorD = -30;
    this.nextLampD = -30;
    this.update(0);
  }

  _dispose(o) {
    this.root.remove(o.mesh);
    if (o.ownGeo) o.mesh.traverse((m) => { if (m.geometry && m.userData.own) m.geometry.dispose(); });
  }

  _genRow() {
    const r = this.rng;
    const d = this.nextRowD;
    const speed = speedAtDistance(d);
    const difficulty = Math.min(1, d / 3000);
    const types = [null, null, null];

    const maxWalls = difficulty > 0.15 ? 2 : 1;
    let walls = r.chance(0.35 + difficulty * 0.4) ? r.int(1, maxWalls) : 0;
    const order = [0, 1, 2].sort(() => r.next() - 0.5);
    for (const lane of order) if (walls > 0) { types[lane] = 'wall'; walls--; }
    // siempre hay un carril alcanzable desde la fila anterior
    if (![...this.prevFree].some((l) => types[l] !== 'wall')) types[[...this.prevFree][0]] = null;
    for (let l = 0; l < 3; l++) {
      if (!types[l] && r.chance(0.3 + difficulty * 0.35)) types[l] = r.chance(0.5) ? 'low' : 'high';
    }
    if (d < 400 && types.every(Boolean)) types[r.int(0, 2)] = null;

    this.prevFree = new Set([0, 1, 2].filter((l) => types[l] !== 'wall'));
    this.rows.push({ d, types });

    for (let l = 0; l < 3; l++) {
      if (!types[l]) continue;
      const mesh = makeObstacle(types[l]);
      mesh.position.set(LANES[l], 0, -d);
      this.root.add(mesh);
      this.obstacles.push({ mesh, lane: l, type: types[l], d });
    }

    const free = [0, 1, 2].filter((l) => !types[l]);
    if (free.length && r.chance(0.07)) {
      const kind = r.pick(['magnet', 'rocket', 'shield']);
      const mesh = makePickup(kind);
      const lane = r.pick(free);
      const pd = d + Math.max(16, speed * 0.75) / 2;
      mesh.position.set(LANES[lane], 1.2, -pd);
      this.root.add(mesh);
      this.powerups.push({ mesh, lane, d: pd, kind });
    }
    this.nextRowD += Math.max(16, speed * 0.75) + r.range(0, 6);
  }

  _coinHeight(lane, d) {
    for (const row of this.rows) {
      if (row.d > d + 12) break;
      const t = row.types[lane];
      if (!t) continue;
      const delta = d - row.d;
      if (t === 'wall' && delta > -3 && delta < 9) return null;
      if (t === 'low' && Math.abs(delta) < 4.5) return 0.9 + 1.7 * (1 - Math.abs(delta) / 4.5);
      if (t === 'high' && Math.abs(delta) < 1.5) return 0.6;
    }
    return 0.9;
  }

  _genCoin() {
    const r = this.rng;
    if (this.coinRunLeft <= 0) {
      this.nextCoinD += r.range(6, 18);
      this.coinLane = r.int(0, 2);
      this.coinRunLeft = r.int(6, 16);
    }
    const d = this.nextCoinD;
    const y = this._coinHeight(this.coinLane, d);
    if (y !== null) this.addCoin(this.coinLane, d, y);
    this.coinRunLeft--;
    this.nextCoinD += RULES.coinSpacing; // una sola fila a la vez: lo valida el servidor
  }

  addCoin(lane, d, y) {
    const mesh = new THREE.Mesh(G.coin, [M.coinEdge, M.coinFace, M.coinFace]);
    mesh.position.set(LANES[lane], y, -d);
    this.root.add(mesh);
    this.coins.push({ mesh, lane, d, y, taken: false });
  }

  rocketCoins(fromD, toD, lane, y) {
    this.coins = this.coins.filter((c) => {
      if (c.d >= fromD && c.d <= toD + 10) { this.root.remove(c.mesh); return false; }
      return true;
    });
    for (let d = Math.ceil(fromD / RULES.coinSpacing) * RULES.coinSpacing + 6; d < toD; d += RULES.coinSpacing) this.addCoin(lane, d, y);
    this.nextCoinD = Math.max(this.nextCoinD, toD + 10);
  }

  clearAhead(fromD, len) {
    this.obstacles = this.obstacles.filter((o) => {
      if (o.d + 8 > fromD && o.d < fromD + len) { this.root.remove(o.mesh); return false; }
      return true;
    });
  }

  removeObstacle(o) {
    this.root.remove(o.mesh);
    this.obstacles = this.obstacles.filter((x) => x !== o);
  }

  // ---------- decoración ----------
  _building(r, sideX, d) {
    const grp = new THREE.Group();
    const w = r.range(5, 8), h = r.range(8, 26), dep = r.range(7, 11);
    const geo = new THREE.BoxGeometry(w, h, dep);
    // repetir ventanas según el tamaño de cada cara (4 ventanas por textura ≈ 6 unidades)
    const uv = geo.attributes.uv;
    const faceSize = [[dep, h], [dep, h], [0, 0], [0, 0], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * faceSize[f][0] / 6, uv.getY(i) * faceSize[f][1] / 6);
    }
    const b = new THREE.Mesh(geo, r.pick(buildingMats));
    b.userData.own = true;
    const x = sideX * (7.2 + w / 2 + r.range(0, 1.5));
    b.position.set(x, h / 2, 0);
    grp.add(b);
    // cornisa
    grp.add(part(G.box, M.roof, [x, h + 0.2, 0], [w + 0.4, 0.4, dep + 0.4]));
    // detalles en la azotea
    const roll = r.next();
    if (roll < 0.35) { // antena con luz roja
      grp.add(part(G.cyl, M.pole, [x, h + 2.4, 0], [0.08, 4.4, 0.08]));
      grp.add(part(G.sphere, M.red, [x, h + 4.7, 0], [0.18, 0.18, 0.18]));
      const s = new THREE.Sprite(roofLightGlowMat); s.position.set(x, h + 4.7, 0); s.scale.setScalar(2.2); grp.add(s);
    } else if (roll < 0.55) { // tanque de agua
      grp.add(part(G.cyl, toon(0x8d6e63), [x + r.range(-1, 1), h + 1.4, 0], [1.0, 1.8, 1.0]));
    } else if (roll < 0.7) { // cartel del juego en el techo
      const lg = part(G.plane, M.logo, [x, h + 1.6, 0], [7, 1.75, 1]);
      lg.rotation.y = -sideX * 0.5;
      grp.add(lg);
    }
    // franja de neón
    grp.add(part(G.box, r.pick(NEON), [x - sideX * (w / 2 + 0.02), h * r.range(0.35, 0.9), 0], [0.12, 0.12, dep]));
    // pantalla con cotización
    if (r.chance(0.5)) {
      const scr = part(G.plane, r.pick(screenMats), [x - sideX * (w / 2 + 0.06), r.range(3.5, Math.min(h - 2, 9)), 0], [3.6, 2.25, 1]);
      scr.rotation.y = -sideX * Math.PI / 2;
      grp.add(scr);
    }
    grp.position.z = -d;
    return { mesh: grp, d, ownGeo: true };
  }

  _genDecor() {
    const r = this.decoRng;
    const d = this.nextDecorD;
    for (const sideX of [-1, 1]) {
      const item = this._building(r, sideX, d);
      // cartel de noticias sobre la vereda
      if (r.chance(0.1)) {
        const bb = new THREE.Group();
        bb.add(part(G.cyl, M.pole, [0, 2.5, 0], [0.12, 5, 0.12]));
        const panel = part(G.plane, r.pick(headlineMats), [0, 5.4, 0], [6, 2.25, 1]);
        bb.add(panel);
        bb.position.set(sideX * 6.3, 0, 0);
        bb.rotation.y = -sideX * 0.7;
        item.mesh.add(bb);
      }
      if (r.chance(0.12)) { // cajero cripto
        const atm = part(G.box, M.atm, [sideX * 5.9, 1.0, 0], [0.8, 1.8, 0.7]);
        atm.rotation.y = -sideX * Math.PI / 2;
        item.mesh.add(atm);
      }
      this.root.add(item.mesh);
      this.decor.push(item);
    }
    this.nextDecorD += r.range(9, 13);
  }

  _genLamp() {
    const d = this.nextLampD;
    const grp = new THREE.Group();
    for (const s of [-1, 1]) {
      grp.add(part(G.cyl, M.pole, [s * 4.4, 2.3, 0], [0.08, 4.6, 0.08]));
      grp.add(part(G.box, M.pole, [s * 4.05, 4.55, 0], [0.8, 0.08, 0.08]));
      grp.add(part(G.sphere, M.bulb, [s * 3.7, 4.42, 0], [0.18, 0.12, 0.18]));
      const glow = new THREE.Sprite(lampGlowMat); glow.position.set(s * 3.7, 4.3, 0); glow.scale.setScalar(3.2); grp.add(glow);
      // charco de luz en el piso
      const pool = new THREE.Sprite(lampGlowMat); pool.position.set(s * 3.7, 0.05, 0); pool.scale.set(4, 1.2, 1); grp.add(pool);
    }
    grp.position.z = -d;
    this.root.add(grp);
    this.decor.push({ mesh: grp, d });
    this.nextLampD += 18;
  }

  /** Genera contenido hasta 170 unidades adelante y borra lo que quedó atrás. */
  update(playerD, time = 0, dt = 0) {
    const ahead = playerD + 170;
    while (this.nextRowD < ahead + 20) this._genRow();
    while (this.nextCoinD < ahead) this._genCoin();
    while (this.nextDecorD < ahead + 40) this._genDecor();
    while (this.nextLampD < ahead + 30) this._genLamp();

    const behind = playerD - 15;
    const cull = (arr, extra = 0) => arr.filter((o) => {
      if (o.d + extra < behind) { this._dispose(o); return false; }
      return true;
    });
    this.obstacles = cull(this.obstacles, 8);
    this.coins = cull(this.coins);
    this.powerups = cull(this.powerups);
    this.decor = cull(this.decor, 14);
    while (this.rows.length && this.rows[0].d < behind - 20) this.rows.shift();

    for (const c of this.coins) c.mesh.rotation.y = time * 3 + c.d * 0.2;
    for (const p of this.powerups) {
      const { model, ring } = p.mesh.userData;
      model.rotation.y = time * 1.8;
      p.mesh.position.y = 1.2 + Math.sin(time * 3 + p.d) * 0.18;
      ring.rotation.x = Math.PI / 2 + Math.sin(time * 2) * 0.3;
      ring.rotation.z = time;
      ring.scale.setScalar(1 + Math.sin(time * 5) * 0.06);
      if (model.userData.flame) model.userData.flame.scale.y = 0.8 + Math.random() * 0.5;
    }
    const blinkOn = Math.sin(time * 6) > 0;
    M.lightOn.color.setHex(blinkOn ? 0xff8a00 : 0x552200);

    this.particles.update(dt);

    // el suelo se mueve "a saltos" de 10 unidades (lo que mide la textura) para quedar quieto
    const snap = Math.floor(playerD / 10) * 10;
    this.ground.position.z = -snap - 150;

    // cielo, estrellas, sol y luna acompañan al jugador
    this.sky.position.set(0, 0, -playerD);
    this.stars.position.set(0, 0, -playerD);
    const orbit = (obj, a, visible) => {
      obj.visible = visible;
      obj.position.set(Math.cos(a) * -170, Math.sin(a) * 150 + 10, -playerD - 300);
      obj.lookAt(0, 0, -playerD + 100);
    };
    // sol: visible en la primera mitad del ciclo; luna: en la segunda
    const p = this.phase;
    const sunA = (((p + 0.1) % 1) / 0.6) * Math.PI;
    const moonA = ((p - 0.42) / 0.55) * Math.PI;
    orbit(this.sun, sunA, sunA > 0 && sunA < Math.PI);
    orbit(this.moon, moonA, moonA > 0 && moonA < Math.PI);
    this.sunLight.position.set(6, 12, -playerD + 6);
    this.sunLight.target.position.set(0, 0, -playerD);
  }
}
