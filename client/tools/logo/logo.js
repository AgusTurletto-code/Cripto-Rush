// Genera el logo del juego (1024×1024) usando los mismos modelos 3D del juego.
// Uso: npm run logo  → abre la página y descarga/guarda el canvas.
import * as THREE from 'three';
import { buildCharacter, coinFaceTex, toon } from '../../src/game/characters.js';

const S = 1024;
const out = document.getElementById('out');
const g = out.getContext('2d');
const charId = new URLSearchParams(location.search).get('char') || 'hank';

// ---------- 1. Fondo: atardecer, estrellas, luna, ciudad y gráfico alcista ----------
function background() {
  const sky = g.createLinearGradient(0, 0, 0, S);
  sky.addColorStop(0, '#1a0b3d');
  sky.addColorStop(0.45, '#6a1b9a');
  sky.addColorStop(0.75, '#ff4f6d');
  sky.addColorStop(1, '#ffb13b');
  g.fillStyle = sky; g.fillRect(0, 0, S, S);

  // estrellas
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * S, y = Math.random() * S * 0.45, r = Math.random() * 2.2 + 0.6;
    g.fillStyle = `rgba(255,255,255,${0.4 + Math.random() * 0.6})`;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  // luna con halo
  const halo = g.createRadialGradient(S / 2, 360, 120, S / 2, 360, 420);
  halo.addColorStop(0, 'rgba(255,220,150,.55)'); halo.addColorStop(1, 'rgba(255,220,150,0)');
  g.fillStyle = halo; g.fillRect(0, 0, S, S);
  g.fillStyle = '#ffe9b0'; g.beginPath(); g.arc(S / 2, 360, 215, 0, 7); g.fill();
  g.fillStyle = 'rgba(214,180,120,.45)';
  for (const [x, y, r] of [[-70, -40, 38], [60, 50, 52], [90, -90, 24], [-40, 110, 30]]) { g.beginPath(); g.arc(S / 2 + x, 360 + y, r, 0, 7); g.fill(); }

  // ciudad (dos capas de edificios con ventanas encendidas)
  const city = (base, color, minH, maxH, lit) => {
    let x = -20;
    while (x < S) {
      const w = 50 + Math.random() * 70, h = minH + Math.random() * (maxH - minH);
      g.fillStyle = color; g.fillRect(x, base - h, w, h + 400);
      if (lit) {
        for (let wy = base - h + 16; wy < base - 10; wy += 24) for (let wx = x + 10; wx < x + w - 12; wx += 18) {
          if (Math.random() < 0.45) { g.fillStyle = Math.random() < 0.8 ? 'rgba(255,214,120,.9)' : 'rgba(140,220,255,.9)'; g.fillRect(wx, wy, 8, 11); }
        }
      }
      x += w + 4;
    }
  };
  city(800, '#3b1560', 120, 300, false);
  city(880, '#220a3a', 80, 230, true);

  // gráfico alcista verde que cruza el fondo
  const pts = [[60, 840], [190, 760], [290, 800], [420, 640], [530, 690], [660, 500], [760, 540], [900, 330]];
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 34; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y + 8) : g.moveTo(x, y + 8))); g.stroke();
  g.strokeStyle = '#2ee66b'; g.lineWidth = 26; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
  // punta de flecha
  g.fillStyle = '#2ee66b'; g.beginPath(); g.moveTo(960, 250); g.lineTo(850, 300); g.lineTo(930, 390); g.closePath(); g.fill();
}

// ---------- 2. Personaje y monedas en 3D (fondo transparente) ----------
function render3d() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(S, S, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff0e0, 0x553366, 2.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 4, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xff7a59, 2.5); rim.position.set(-4, 2, -3); scene.add(rim);

  const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  cam.position.set(0, 0.95, 8.4); cam.lookAt(0, 1.2, 0);

  const ch = buildCharacter(charId);
  // pose de carrera congelada en un buen momento
  for (let i = 0; i < 40; i++) ch.userData.animate(1 / 60, { mode: 'run', speed: 18, laneDir: 0 });
  ch.rotation.y = 0.38;
  ch.position.set(0, 0.15, 0);
  scene.add(ch);

  // monedas volando alrededor
  const coinGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.08, 32).rotateX(Math.PI / 2);
  const coinMats = [toon(0xe0a000, { emissive: 0x553300 }), new THREE.MeshToonMaterial({ map: coinFaceTex, emissive: 0x332200 }), new THREE.MeshToonMaterial({ map: coinFaceTex, emissive: 0x332200 })];
  for (const [x, y, z, ry, s] of [[-1.3, 2.0, 0.3, 0.5, 1], [1.12, 2.1, 0.2, -0.6, 1.0], [-1.15, 0.95, 0.8, 0.9, 0.8], [1.25, 1.05, 0.6, -0.3, 0.85]]) {
    const c = new THREE.Mesh(coinGeo, coinMats);
    c.position.set(x, y, z); c.rotation.set(0.25, ry, 0.15); c.scale.setScalar(s);
    scene.add(c);
  }
  renderer.render(scene, cam);
  return renderer.domElement;
}

// ---------- 3. Título ----------
function title() {
  const draw = (text, y, size) => {
    g.font = `900 ${size}px "Arial Black", "Segoe UI Black", Impact, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round';
    // sombra/volumen
    g.fillStyle = '#5a2a00'; g.fillText(text, S / 2, y + 14);
    g.strokeStyle = '#1a0b3d'; g.lineWidth = 30; g.strokeText(text, S / 2, y);
    const grd = g.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    grd.addColorStop(0, '#fff6c2'); grd.addColorStop(0.45, '#ffc531'); grd.addColorStop(1, '#f07c00');
    g.fillStyle = grd; g.fillText(text, S / 2, y);
    // brillo
    g.save(); g.globalAlpha = 0.35; g.fillStyle = '#fff';
    g.beginPath(); g.rect(0, y - size / 2, S, size * 0.28); g.clip(); g.fillText(text, S / 2, y); g.restore();
  };
  draw('CRYPTO', 720, 150);
  draw('RUSH', 860, 178);
}

background();
// sombra suave detrás del personaje para que se despegue del fondo
const glow = g.createRadialGradient(S / 2, 430, 40, S / 2, 430, 330);
glow.addColorStop(0, 'rgba(255,255,255,.35)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
g.fillStyle = glow; g.fillRect(0, 0, S, S);
g.drawImage(render3d(), 0, -95);
title();
window.__logoDone = true;
