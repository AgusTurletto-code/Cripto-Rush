import * as THREE from 'three';
import { createRng } from './rng.js';
import { LANES, RULES, speedAtDistance } from './rules.js';

// ---------- Texturas generadas con canvas (sin assets externos) ----------
function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const coinTex = canvasTexture(128, 128, (g, w) => {
  const grd = g.createRadialGradient(w / 2, w / 2, 10, w / 2, w / 2, w / 2);
  grd.addColorStop(0, '#ffe680'); grd.addColorStop(1, '#e0a200');
  g.fillStyle = grd; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 2, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#b37b00'; g.lineWidth = 8; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 12, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#8a5a00'; g.font = 'bold 72px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('M', w / 2, w / 2 + 4);
});

const trackTex = canvasTexture(256, 256, (g, w, h) => {
  g.fillStyle = '#1b1f2a'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#232838';
  for (let i = 0; i < 3; i++) g.fillRect(i * (w / 3) + 6, 0, w / 3 - 12, h);
  g.fillStyle = '#f7931a';
  for (const x of [w / 3, (2 * w) / 3]) for (let y = 0; y < h; y += 64) g.fillRect(x - 2, y, 4, 36);
});
trackTex.wrapS = trackTex.wrapT = THREE.RepeatWrapping;
trackTex.repeat.set(1, 40);

const truckTex = canvasTexture(256, 256, (g, w, h) => {
  g.fillStyle = '#7a3e1d'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#5a2a10'; g.fillRect(0, h - 40, w, 40);
  // cara de oso
  g.fillStyle = '#3d1f0b';
  g.beginPath(); g.arc(70, 70, 26, 0, 7); g.arc(186, 70, 26, 0, 7); g.fill();
  g.beginPath(); g.arc(128, 125, 80, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(98, 110, 12, 0, 7); g.arc(158, 110, 12, 0, 7); g.fill();
  g.fillStyle = '#d62828'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center';
  g.fillText('▼ -42%', 128, 175);
  g.fillStyle = '#fff'; g.font = 'bold 22px sans-serif'; g.fillText('BEAR EXPRESS', 128, h - 14);
});

const auditTex = canvasTexture(512, 128, (g, w, h) => {
  g.fillStyle = '#ffd60a'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#111';
  for (let x = -h; x < w; x += 60) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 30, h); g.lineTo(x + 30 + h, 0); g.lineTo(x + h, 0); g.fill(); }
  g.fillStyle = '#111'; g.fillRect(40, 28, w - 80, h - 56);
  g.fillStyle = '#ffd60a'; g.font = 'bold 50px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('TAX AUDIT', w / 2, h / 2 + 2);
});

const TICKERS = ['BTC ▲ 4.2%', 'ETH ▲ 2.9%', 'DOGE ▲ 69%', 'TON ▲ 7.7%', 'SOL ▼ 1.3%', 'PEPE ▲ 420%', 'MOON ▲ 1000%', 'FIAT ▼ 12%'];
const HEADLINES = [
  'MUSKRAT TUITEA UN PERRO: MERCADO +30%',
  'THUMP: "ARANCELES A LA LUNA"',
  'SATOSHI SIGUE SIN APARECER',
  'BALLENA COMPRA 10.000 BTC',
  'BANCO CENTRAL IMPRIME MÁS BILLETES',
  'HODL O NADA',
  'WEN LAMBO?',
  'NUEVA MEMECOIN SUBE 9000%',
];
const NEON = ['#00f5d4', '#f72585', '#f7931a', '#7b2cbf', '#4cc9f0', '#2ea043'];

function tickerTexture(rng) {
  return canvasTexture(256, 96, (g, w, h) => {
    g.fillStyle = '#05070d'; g.fillRect(0, 0, w, h);
    const t = rng.pick(TICKERS);
    g.fillStyle = t.includes('▼') ? '#ff4d4d' : '#3fff8b';
    g.font = 'bold 40px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t, w / 2, h / 2);
  });
}
function billboardTexture(text) {
  return canvasTexture(512, 192, (g, w, h) => {
    g.fillStyle = '#0b0f1a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#f7931a'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#f7931a'; g.font = 'bold 26px sans-serif'; g.fillText('🔴 ÚLTIMO MOMENTO', 24, 44);
    g.fillStyle = '#fff'; g.font = 'bold 34px sans-serif';
    const words = text.split(' '); let line = ''; let y = 100;
    for (const wd of words) {
      if (g.measureText(line + wd).width > w - 48) { g.fillText(line, 24, y); line = ''; y += 42; }
      line += wd + ' ';
    }
    g.fillText(line, 24, y);
  });
}

// ---------- Geometrías y materiales compartidos ----------
const G = {
  coin: new THREE.CylinderGeometry(0.42, 0.42, 0.1, 20).rotateX(Math.PI / 2),
  candle: new THREE.BoxGeometry(2.0, 1.0, 0.5),
  wick: new THREE.BoxGeometry(0.12, 0.5, 0.12),
  pole: new THREE.CylinderGeometry(0.08, 0.08, 3.0, 6),
  banner: new THREE.BoxGeometry(2.2, 1.2, 0.15),
  truck: new THREE.BoxGeometry(2.1, 3.0, 7),
  power: new THREE.OctahedronGeometry(0.55),
  building: new THREE.BoxGeometry(1, 1, 1),
  panel: new THREE.PlaneGeometry(3.2, 1.2),
  billboard: new THREE.PlaneGeometry(8, 3),
};
const M = {
  coin: new THREE.MeshLambertMaterial({ map: coinTex, emissive: 0x553300 }),
  coinEdge: new THREE.MeshLambertMaterial({ color: 0xd99a00, emissive: 0x442200 }),
  candle: new THREE.MeshLambertMaterial({ color: 0xd62828, emissive: 0x400000 }),
  pole: new THREE.MeshLambertMaterial({ color: 0x888888 }),
  banner: new THREE.MeshLambertMaterial({ map: auditTex }),
  truck: new THREE.MeshLambertMaterial({ map: truckTex }),
  truckSide: new THREE.MeshLambertMaterial({ color: 0x7a3e1d }),
  magnet: new THREE.MeshLambertMaterial({ color: 0x4cc9f0, emissive: 0x1a5a70 }),
  rocket: new THREE.MeshLambertMaterial({ color: 0xff6b35, emissive: 0x702000 }),
  shield: new THREE.MeshLambertMaterial({ color: 0x58a6ff, emissive: 0x203a70 }),
};

/** Tipos de obstáculo: caja de colisión relativa (y desde/hasta, largo en z). */
export const OBSTACLE_TYPES = {
  low:  { y0: 0, y1: 1.0, len: 0.5 },   // vela roja: saltar
  high: { y0: 1.2, y1: 3.2, len: 0.3 }, // banner TAX AUDIT: deslizarse
  wall: { y0: 0, y1: 3.0, len: 7 },     // Bear Express: cambiar de carril
};

function makeObstacle(type) {
  const g = new THREE.Group();
  if (type === 'low') {
    const c = new THREE.Mesh(G.candle, M.candle); c.position.y = 0.5; g.add(c);
    for (const x of [-0.6, 0, 0.6]) { const w = new THREE.Mesh(G.wick, M.candle); w.position.set(x, 1.2, 0); g.add(w); }
  } else if (type === 'high') {
    for (const x of [-1.05, 1.05]) { const p = new THREE.Mesh(G.pole, M.pole); p.position.set(x, 1.5, 0); g.add(p); }
    const b = new THREE.Mesh(G.banner, M.banner); b.position.y = 2.2; g.add(b);
  } else {
    // la cara con textura (+z, índice 4 en BoxGeometry) mira al jugador
    const t = new THREE.Mesh(G.truck, [M.truckSide, M.truckSide, M.truckSide, M.truckSide, M.truck, M.truckSide]);
    t.position.set(0, 1.5, -3.5); // el frente queda en z local 0
    g.add(t);
  }
  return g;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.obstacles = []; // {mesh, lane, type, d}
    this.coins = [];     // {mesh, lane, d, y, taken}
    this.powerups = [];  // {mesh, lane, d, kind}
    this.decor = [];

    // Pista (se mueve con el jugador y desplaza la textura)
    this.track = new THREE.Mesh(new THREE.PlaneGeometry(7.8, 400), new THREE.MeshLambertMaterial({ map: trackTex }));
    this.track.rotation.x = -Math.PI / 2;
    scene.add(this.track);
    const side = new THREE.Mesh(new THREE.PlaneGeometry(60, 400), new THREE.MeshLambertMaterial({ color: 0x0e1220 }));
    side.rotation.x = -Math.PI / 2; side.position.y = -0.02;
    this.side = side;
    scene.add(side);

    // Luna gigante al fondo: el objetivo
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(30, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff3c4, fog: false }));
    scene.add(this.moon);
  }

  reset(seed) {
    for (const o of [...this.obstacles, ...this.coins, ...this.powerups, ...this.decor]) this.root.remove(o.mesh);
    this.obstacles = []; this.coins = []; this.powerups = []; this.decor = [];
    this.rng = createRng(seed);
    this.decoRng = createRng(seed ^ 0x9e3779b9);
    this.nextRowD = 60;
    this.prevFree = new Set([0, 1, 2]);
    this.rows = [];
    this.nextCoinD = 20;
    this.coinLane = 1;
    this.coinRunLeft = 0;
    this.nextDecorD = -20;
    this.update(0);
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
    for (const lane of order) {
      if (walls > 0) { types[lane] = 'wall'; walls--; }
    }
    // al menos un carril alcanzable desde la fila anterior
    if (![...this.prevFree].some((l) => types[l] !== 'wall')) {
      const l = [...this.prevFree][0];
      types[l] = null;
    }
    for (let l = 0; l < 3; l++) {
      if (!types[l] && r.chance(0.3 + difficulty * 0.35)) types[l] = r.chance(0.5) ? 'low' : 'high';
    }
    // nunca bloquear los tres carriles con saltos/deslizamientos al principio
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

    // power-up ocasional en un carril libre
    const free = [0, 1, 2].filter((l) => !types[l]);
    if (free.length && r.chance(0.07)) {
      const kind = r.pick(['magnet', 'rocket', 'shield']);
      const mesh = new THREE.Mesh(G.power, M[kind]);
      const lane = r.pick(free);
      const pd = d + Math.max(16, speed * 0.75) / 2;
      mesh.position.set(LANES[lane], 1.1, -pd);
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
      // pausa entre filas de monedas y cambio de carril
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
    const mesh = new THREE.Mesh(G.coin, [M.coinEdge, M.coin, M.coin]);
    mesh.position.set(LANES[lane], y, -d);
    this.root.add(mesh);
    this.coins.push({ mesh, lane, d, y, taken: false });
  }

  /** Para el cohete: borra monedas del suelo y crea una fila en el aire. */
  rocketCoins(fromD, toD, lane, y) {
    this.coins = this.coins.filter((c) => {
      if (c.d >= fromD && c.d <= toD + 10) { this.root.remove(c.mesh); return false; }
      return true;
    });
    for (let d = Math.ceil(fromD / RULES.coinSpacing) * RULES.coinSpacing + 6; d < toD; d += RULES.coinSpacing) {
      this.addCoin(lane, d, y);
    }
    this.nextCoinD = Math.max(this.nextCoinD, toD + 10);
  }

  /** Al revivir: quita obstáculos cercanos para no morir de nuevo al instante. */
  clearAhead(fromD, len) {
    this.obstacles = this.obstacles.filter((o) => {
      if (o.d + 8 > fromD && o.d < fromD + len) { this.root.remove(o.mesh); return false; }
      return true;
    });
  }

  _genDecor() {
    const r = this.decoRng;
    const d = this.nextDecorD;
    for (const sideX of [-1, 1]) {
      const h = r.range(6, 22);
      const w = r.range(4, 7);
      const b = new THREE.Mesh(G.building, new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(0.62 + r.range(-0.05, 0.08), 0.35, r.range(0.08, 0.16)) }));
      b.scale.set(w, h, r.range(6, 10));
      b.position.set(sideX * (6.5 + w / 2 + r.range(0, 2)), h / 2, -d);
      const grp = new THREE.Group(); grp.add(b);

      // franja de neón
      const neon = new THREE.Mesh(G.building, new THREE.MeshBasicMaterial({ color: r.pick(NEON) }));
      neon.scale.set(w + 0.05, 0.15, 0.15);
      neon.position.set(b.position.x, h * r.range(0.4, 0.95), -d + b.scale.z / 2);
      grp.add(neon);

      if (r.chance(0.55)) {
        const panel = new THREE.Mesh(G.panel, new THREE.MeshBasicMaterial({ map: tickerTexture(r) }));
        panel.position.set(b.position.x - sideX * (w / 2 + 0.05), r.range(2.5, Math.min(h - 1, 8)), -d);
        panel.rotation.y = -sideX * Math.PI / 2;
        grp.add(panel);
      }
      if (r.chance(0.12)) {
        const bb = new THREE.Mesh(G.billboard, new THREE.MeshBasicMaterial({ map: billboardTexture(r.pick(HEADLINES)) }));
        bb.position.set(sideX * 6.2, 5.5, -d);
        bb.rotation.y = -sideX * 0.6;
        grp.add(bb);
      }
      this.root.add(grp);
      this.decor.push({ mesh: grp, d });
    }
    this.nextDecorD += r.range(9, 14);
  }

  /** Genera contenido hasta 170 unidades adelante y borra lo que quedó atrás. */
  update(playerD, time = 0) {
    const ahead = playerD + 170;
    while (this.nextRowD < ahead + 20) this._genRow();
    while (this.nextCoinD < ahead) this._genCoin();
    while (this.nextDecorD < ahead + 40) this._genDecor();

    const behind = playerD - 15;
    const cull = (arr, extra = 0) => arr.filter((o) => {
      if (o.d + extra < behind) {
        this.root.remove(o.mesh);
        // la decoración usa materiales/texturas propios: liberarlos de la GPU
        if (arr === this.decor) o.mesh.traverse((m) => { if (m.material) { m.material.map?.dispose(); m.material.dispose(); } });
        return false;
      }
      return true;
    });
    this.obstacles = cull(this.obstacles, 8);
    this.coins = cull(this.coins);
    this.powerups = cull(this.powerups);
    this.decor = cull(this.decor, 10);
    while (this.rows.length && this.rows[0].d < behind - 20) this.rows.shift();

    for (const c of this.coins) c.mesh.rotation.y = time * 3 + c.d * 0.2;
    for (const p of this.powerups) { p.mesh.rotation.y = time * 2; p.mesh.position.y = 1.1 + Math.sin(time * 4 + p.d) * 0.2; }

    // la textura se repite cada 10 unidades: mover la pista "a saltos" la deja quieta en el mundo
    const snap = Math.floor(playerD / 10) * 10;
    this.track.position.z = -snap - 150;
    this.side.position.z = -snap - 150;
    this.moon.position.set(25, 45, -playerD - 300);
  }
}
