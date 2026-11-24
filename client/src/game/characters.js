import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Personajes paródicos estilo caricatura (cabeza grande, sombreado "toon" y
// contorno negro). Se construyen con primitivas: no hay modelos externos.
// El modelo mira hacia +Z; el juego lo gira para que corra hacia -Z.
// ---------------------------------------------------------------------------

export const CHARACTERS = {
  hank: { name: 'Hodl Hank', desc: 'Compró en el pico de 2021. Manos de diamante.' },
  muskrat: { name: 'Elon Muskrat', desc: 'Tuitea a las 3 AM. Mueve mercados.' },
  thump: { name: 'Donald Thump', desc: 'Aranceles a la Luna. Los mejores aranceles.' },
  satoshi: { name: 'Satoshi Nakamochi', desc: 'Nadie sabe quién es. Ni él.' },
};

// Sombreado de 3 tonos (look de dibujo animado)
const gradientMap = (() => {
  const t = new THREE.DataTexture(new Uint8Array([70, 160, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
export const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap, ...extra });
const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x0c0a14, side: THREE.BackSide });

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Malla con contorno (casco invertido un poco más grande). */
function mesh(geo, mat, outline = 0.045) {
  const m = new THREE.Mesh(geo, mat);
  if (outline) {
    geo.computeBoundingSphere();
    const r = geo.boundingSphere.radius || 1;
    const o = new THREE.Mesh(geo, OUTLINE);
    const s = 1 + outline / r;
    o.scale.set(s, s, s);
    o.position.copy(geo.boundingSphere.center).multiplyScalar(1 - s); // escala desde el centro
    m.add(o);
  }
  return m;
}

const sphere = (r, w = 20, h = 16) => new THREE.SphereGeometry(r, w, h);
const capsule = (r, len) => new THREE.CapsuleGeometry(r, len, 6, 14);
/** Segmento de extremidad con pivote arriba. */
const limbGeo = (r, len) => capsule(r, len).translate(0, -len / 2, 0);

function badge(text, bg, fg, w = 128, h = 64, font = 'bold 36px sans-serif') {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.beginPath(); g.roundRect(2, 2, w - 4, h - 4, 12); g.fill();
    g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

// ---------- Cara ----------
function addEyes(head, { y = 0.04, x = 0.13, z = 0.3, size = 0.085, look = 'normal', brow = 0x2b1a10, browTilt = 0.15, pale = null } = {}) {
  const white = toon(0xffffff);
  const black = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const s of [-1, 1]) {
    if (pale) { // zona clara alrededor de los ojos (sí, es Thump)
      const p = new THREE.Mesh(sphere(size * 1.6, 12, 10), toon(pale));
      p.scale.set(1.2, 0.8, 0.4); p.position.set(s * x, y, z - 0.02); head.add(p);
    }
    const eye = new THREE.Mesh(sphere(size, 14, 12), white);
    eye.scale.set(1, look === 'squint' ? 0.55 : 1.15, 0.6);
    eye.position.set(s * x, y, z);
    const pupil = new THREE.Mesh(sphere(size * 0.55, 10, 8), black);
    pupil.position.set(s * x * 0.97, y - 0.005, z + size * 0.5);
    pupil.scale.set(1, look === 'squint' ? 0.6 : 1.1, 0.5);
    const hl = new THREE.Mesh(sphere(size * 0.18, 6, 6), shine);
    hl.position.set(s * x * 0.97 + 0.02, y + 0.03, z + size * 0.75);
    const b = new THREE.Mesh(new THREE.BoxGeometry(size * 2.1, 0.035, 0.04), toon(brow));
    b.position.set(s * x, y + size * 1.7, z + 0.02);
    b.rotation.z = s * browTilt;
    head.add(eye, pupil, hl, b);
  }
}

function addMouth(head, { y = -0.14, z = 0.31, kind = 'smile', color = 0x5a1a1a } = {}) {
  const m = toon(color);
  if (kind === 'smile' || kind === 'smirk') {
    const g = new THREE.TorusGeometry(0.08, 0.018, 6, 16, Math.PI);
    const mm = new THREE.Mesh(g, m);
    mm.rotation.z = Math.PI + (kind === 'smirk' ? 0.35 : 0);
    mm.position.set(kind === 'smirk' ? 0.03 : 0, y + 0.04, z);
    head.add(mm);
  } else if (kind === 'o') {
    const mm = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.02, 8, 16), m);
    mm.position.set(0, y, z); head.add(mm);
  } else if (kind === 'teeth') {
    const mm = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.016, 6, 16, Math.PI), m);
    mm.rotation.z = Math.PI + 0.25; mm.position.set(0.02, y + 0.04, z); head.add(mm);
    for (const s of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.02), toon(0xffffff));
      t.position.set(0.02 + s * 0.02, y - 0.03, z + 0.01); head.add(t);
    }
  }
}

// ---------- Esqueleto común ----------
function buildRig(p) {
  const root = new THREE.Group();
  const body = new THREE.Group(); // rota entero (deslizarse, giros, aplastamiento)
  root.add(body);
  const hips = new THREE.Group(); hips.position.y = 0.72; body.add(hips);

  // piernas: muslo → rodilla → canilla → pie
  const legs = [];
  for (const s of [-1, 1]) {
    const thigh = new THREE.Group(); thigh.position.set(s * 0.14, 0, 0); hips.add(thigh);
    thigh.add(mesh(limbGeo(0.1, 0.24), toon(p.pants)));
    const knee = new THREE.Group(); knee.position.y = -0.34; thigh.add(knee);
    knee.add(mesh(limbGeo(0.085, 0.22), toon(p.pants)));
    const foot = mesh(new THREE.BoxGeometry(0.17, 0.1, 0.3).translate(0, 0, 0.06), toon(p.shoes));
    foot.position.y = -0.32; knee.add(foot);
    if (p.sole) { const so = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.31).translate(0, 0, 0.06), toon(p.sole)); so.position.y = -0.36; knee.add(so); }
    legs.push({ thigh, knee });
  }

  // torso
  const torso = new THREE.Group(); hips.add(torso);
  const chest = mesh(capsule(0.26, 0.22), toon(p.shirt));
  chest.scale.set(1.05, 1, 0.8);
  chest.position.y = 0.3;
  torso.add(chest);
  const belly = mesh(sphere(0.25), toon(p.pants));
  belly.scale.set(1.05, 0.5, 0.82); belly.position.y = 0.06; torso.add(belly);

  // brazos: hombro → codo → mano
  const arms = [];
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Group(); shoulder.position.set(s * 0.33, 0.5, 0); torso.add(shoulder);
    shoulder.add(mesh(limbGeo(0.075, 0.18), toon(p.sleeve ?? p.shirt)));
    const elbow = new THREE.Group(); elbow.position.y = -0.25; shoulder.add(elbow);
    elbow.add(mesh(limbGeo(0.065, 0.16), toon(p.forearm ?? p.sleeve ?? p.shirt)));
    const hand = p.diamondHands
      ? new THREE.Mesh(new THREE.OctahedronGeometry(0.1), toon(0x7df9ff, { emissive: 0x1a8fa0 }))
      : mesh(sphere(0.085, 12, 10), toon(p.skin));
    hand.position.y = -0.26; elbow.add(hand);
    arms.push({ shoulder, elbow, hand });
  }

  // cabeza grande (estilo chibi)
  const neck = new THREE.Group(); neck.position.y = 0.66; torso.add(neck);
  const head = new THREE.Group(); head.position.y = 0.3; neck.add(head);
  const skull = mesh(sphere(0.34, 24, 20), toon(p.skin), 0.04);
  skull.scale.set(1, 0.98, 0.95);
  head.add(skull);
  if (p.ears !== false) {
    for (const s of [-1, 1]) {
      const ear = mesh(sphere(0.07, 10, 8), toon(p.skin), 0.025);
      ear.scale.set(0.6, 1, 0.8); ear.position.set(s * 0.33, -0.02, 0); head.add(ear);
    }
  }

  return { root, body, hips, torso, legs, arms, neck, head, chest };
}

// ---------- Personajes ----------
const BUILDERS = {
  hank() {
    const r = buildRig({ skin: 0xf3c69b, shirt: 0x2fbf71, sleeve: 0x2fbf71, pants: 0x3b5998, shoes: 0xffffff, sole: 0xf7931a, diamondHands: true });
    const { head, chest, torso } = r;
    addEyes(head, { look: 'normal' });
    addMouth(head, { kind: 'smile' });
    // gorra naranja con el logo
    const cap = mesh(new THREE.SphereGeometry(0.355, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), toon(0xf7931a), 0.03);
    cap.position.y = 0.05; head.add(cap);
    const visor = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.035, 20, 1, false, -Math.PI / 2, Math.PI).scale(1, 1, 1.4), toon(0xd9770f), 0.02);
    visor.position.set(0, 0.07, 0.26); head.add(visor);
    const logo = new THREE.Mesh(new THREE.CircleGeometry(0.08, 20), new THREE.MeshBasicMaterial({ map: coinFaceTex }));
    logo.position.set(0, 0.22, 0.29); logo.rotation.x = -0.6; head.add(logo);
    // capucha del buzo (atrás) y letrero HODL
    const hood = mesh(sphere(0.22), toon(0x28a862));
    hood.scale.set(1.3, 0.6, 0.8); hood.position.set(0, 0.56, -0.17); torso.add(hood);
    const txt = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.17), new THREE.MeshBasicMaterial({ map: badge('HODL', '#ffffff', '#1e8a4f'), transparent: true }));
    txt.position.set(0, 0.32, 0.215); torso.add(txt);
    chest.material.color.set(0x2fbf71);
    return r;
  },

  muskrat() {
    const r = buildRig({ skin: 0xe9c9a8, shirt: 0x15151a, pants: 0x2a2d3a, shoes: 0x222222, sole: 0xdddddd });
    const { head, torso } = r;
    addEyes(head, { look: 'squint', browTilt: -0.1, brow: 0x3a2a1a });
    addMouth(head, { kind: 'teeth' });
    // orejas de rata
    for (const s of [-1, 1]) {
      const ear = mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.04, 20).rotateX(Math.PI / 2), toon(0xa58c7a), 0.025);
      ear.position.set(s * 0.25, 0.3, -0.02); ear.rotation.z = s * -0.3; head.add(ear);
      const inner = new THREE.Mesh(new THREE.CircleGeometry(0.09, 16), toon(0xff9fb0));
      inner.position.set(s * 0.25, 0.3, 0.005); inner.rotation.z = s * -0.3; head.add(inner);
    }
    // hocico, nariz rosa y bigotes
    const snout = mesh(sphere(0.12), toon(0xe9c9a8), 0.02);
    snout.scale.set(1.1, 0.75, 1); snout.position.set(0, -0.08, 0.27); head.add(snout);
    const nose = new THREE.Mesh(sphere(0.045, 10, 8), toon(0xff6b8a));
    nose.position.set(0, -0.05, 0.39); head.add(nose);
    for (const s of [-1, 1]) for (const a of [-0.15, 0.1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.008, 0.008), new THREE.MeshBasicMaterial({ color: 0x222222 }));
      w.position.set(s * 0.2, -0.07, 0.33); w.rotation.z = s * a; head.add(w);
    }
    // pelo oscuro con raya al costado
    const hair = mesh(new THREE.SphereGeometry(0.36, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.6), toon(0x2b1d12), 0.025);
    hair.position.set(0, 0.03, -0.02); hair.rotation.z = 0.1; head.add(hair);
    const fringe = mesh(capsule(0.06, 0.3).rotateZ(Math.PI / 2), toon(0x2b1d12), 0.02);
    fringe.position.set(0.05, 0.25, 0.22); fringe.rotation.z = 0.25; head.add(fringe);
    // remera negra con cohete
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ map: rocketTex, transparent: true }));
    logo.position.set(0, 0.32, 0.215); torso.add(logo);
    // colita de rata
    const tail = mesh(new THREE.TorusGeometry(0.25, 0.025, 6, 20, Math.PI * 0.9), toon(0xff9fb0), 0.015);
    tail.position.set(0, 0.0, -0.3); tail.rotation.y = Math.PI / 2; r.hips.add(tail);
    return r;
  },

  thump() {
    const r = buildRig({ skin: 0xf2a35e, shirt: 0x1d2b5e, sleeve: 0x1d2b5e, pants: 0x1d2b5e, shoes: 0x111111 });
    const { head, torso, chest } = r;
    chest.scale.set(1.18, 1, 0.92); // más robusto
    addEyes(head, { size: 0.07, x: 0.12, y: 0.02, look: 'squint', brow: 0xf5d37a, browTilt: -0.2, pale: 0xf8deb0 });
    addMouth(head, { kind: 'o', y: -0.15, color: 0x8a3a2a });
    // el famoso jopo dorado
    const gold = toon(0xffcc4d);
    const top = mesh(sphere(0.37, 24, 16), gold, 0.03);
    top.scale.set(1.05, 0.55, 1.05); top.position.set(0, 0.2, -0.03); head.add(top);
    const swoop = mesh(capsule(0.1, 0.42).rotateZ(Math.PI / 2), gold, 0.025);
    swoop.position.set(0.02, 0.27, 0.22); swoop.rotation.set(0.3, 0, -0.18); head.add(swoop);
    const swoop2 = mesh(capsule(0.08, 0.3).rotateZ(Math.PI / 2), toon(0xffd970), 0.02);
    swoop2.position.set(0.1, 0.33, 0.12); swoop2.rotation.z = -0.3; head.add(swoop2);
    for (const s of [-1, 1]) {
      const side = mesh(sphere(0.12), gold, 0.02);
      side.scale.set(0.6, 1, 1); side.position.set(s * 0.31, 0.08, -0.06); head.add(side);
    }
    // camisa blanca + corbata roja larguísima
    const shirtV = new THREE.Mesh(new THREE.CircleGeometry(0.12, 3), toon(0xffffff));
    shirtV.position.set(0, 0.48, 0.21); shirtV.rotation.z = -Math.PI / 2; torso.add(shirtV);
    const tieKnot = mesh(new THREE.BoxGeometry(0.08, 0.07, 0.04), toon(0xd62828), 0.015);
    tieKnot.position.set(0, 0.5, 0.24); torso.add(tieKnot);
    const tie = mesh(new THREE.BoxGeometry(0.1, 0.55, 0.03).translate(0, -0.27, 0), toon(0xd62828), 0.015);
    tie.position.set(0, 0.47, 0.24); tie.rotation.x = -0.12; torso.add(tie);
    // pin de bandera
    const pin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.01), new THREE.MeshBasicMaterial({ color: 0xd62828 }));
    pin.position.set(-0.15, 0.42, 0.22); torso.add(pin);
    return r;
  },

  satoshi() {
    const r = buildRig({ skin: 0x111118, shirt: 0x2b2f3a, sleeve: 0x2b2f3a, pants: 0x22252e, shoes: 0x111111, ears: false });
    const { head, torso } = r;
    // capucha
    // capucha abierta adelante (+Z corresponde a phi = π/2)
    const hood = mesh(new THREE.SphereGeometry(0.42, 24, 18, Math.PI / 2 + 0.75, Math.PI * 2 - 1.5, 0, Math.PI * 0.8), toon(0x2b2f3a, { side: THREE.DoubleSide }), 0);
    hood.rotation.x = -0.25; hood.position.set(0, 0.03, -0.04); head.add(hood);
    const tip = mesh(new THREE.ConeGeometry(0.12, 0.25, 12), toon(0x2b2f3a), 0.02);
    tip.position.set(0, 0.12, -0.4); tip.rotation.x = -2.2; head.add(tip);
    // ojos brillantes
    const rim = mesh(new THREE.TorusGeometry(0.3, 0.06, 8, 24), toon(0x22252e), 0.02);
    rim.position.set(0, 0.0, 0.24); rim.scale.set(1, 1.15, 1); head.add(rim);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(sphere(0.055, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffa630 }));
      eye.scale.set(1.3, 0.7, 0.5); eye.position.set(s * 0.11, 0.02, 0.335); head.add(eye);
      const eg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xff9a20, transparent: true, opacity: 0.35, depthWrite: false })); eg.scale.setScalar(0.14); eg.position.copy(eye.position); head.add(eg);
    }
    // capa
    const cape = mesh(new THREE.ConeGeometry(0.42, 0.9, 16, 1, true), toon(0x1f222b, { side: THREE.DoubleSide }), 0);
    cape.position.set(0, 0.25, -0.05); torso.add(cape);
    // emblema brillante en el pecho
    const emb = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), new THREE.MeshBasicMaterial({ map: coinFaceTex }));
    emb.position.set(0, 0.32, 0.215); torso.add(emb);
    return r;
  },
};

// Texturas compartidas
export const coinFaceTex = canvasTex(128, 128, (g, w) => {
  const grd = g.createRadialGradient(w * 0.4, w * 0.35, 8, w / 2, w / 2, w / 2);
  grd.addColorStop(0, '#fff2a8'); grd.addColorStop(0.6, '#ffc531'); grd.addColorStop(1, '#d48a00');
  g.fillStyle = grd; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 2, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#b06f00'; g.lineWidth = 7; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 13, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#9a5c00'; g.font = '900 70px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('C', w / 2 + 2, w / 2 + 4);
  g.fillRect(w / 2 - 5, 24, 6, 18); g.fillRect(w / 2 - 5, w - 42, 6, 18);
});
const rocketTex = canvasTex(128, 128, (g) => {
  g.font = '90px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('🚀', 64, 70);
});

// ---------------------------------------------------------------------------
// Animación: cada frame se calcula una pose objetivo y se interpola hacia ella.
// ---------------------------------------------------------------------------
const damp = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));

export function buildCharacter(id) {
  const r = (BUILDERS[id] || BUILDERS.hank)();
  const { root, body, hips, torso, legs, arms, neck } = r;
  root.traverse((o) => { o.frustumCulled = false; });

  let phase = 0;
  let squash = 0;     // aplastamiento al aterrizar
  let tilt = 0;       // inclinación lateral
  let wasAir = false;
  const pose = {};    // valores actuales

  const set = (key, obj, prop, target, k, dt) => {
    pose[key] = damp(pose[key] ?? obj[prop], target, k, dt);
    obj[prop] = pose[key];
  };

  root.userData = {
    /** s: { mode: idle|run|jump|slide|fly|dead|cheer, speed, vy, laneDir } */
    animate(dt, s) {
      const k = 16;
      let T = { hipY: 0.72, bodyX: 0, torsoX: 0.12, neckX: -0.05, tL: 0, tR: 0, kL: 0.1, kR: 0.1, aL: 0, aR: 0, eL: -0.4, eR: -0.4, sideL: 0.15, sideR: -0.15, bodyY: 0 };

      if (s.mode === 'idle' || s.mode === 'cheer') {
        phase += dt * 2.2;
        const b = Math.sin(phase);
        T = { ...T, hipY: 0.72 + b * 0.012, torsoX: 0.02 + b * 0.02, neckX: -b * 0.04, kL: 0.05, kR: 0.05,
          aL: 0.1 + b * 0.06, aR: 0.1 - b * 0.06, eL: -0.25, eR: -0.25 };
        if (s.mode === 'cheer') { T.aL = -2.8 + b * 0.2; T.aR = -2.8 - b * 0.2; T.eL = T.eR = -0.3; T.hipY = 0.72 + Math.abs(b) * 0.08; }
      } else if (s.mode === 'run') {
        phase += dt * (7 + s.speed * 0.32);
        const sn = Math.sin(phase), cs = Math.cos(phase);
        T = { ...T,
          hipY: 0.7 + Math.abs(cs) * 0.07,
          torsoX: 0.22, neckX: -0.12,
          tL: -sn * 0.95, tR: sn * 0.95,
          kL: 0.25 + Math.max(0, Math.sin(phase + 0.9)) * 1.35,
          kR: 0.25 + Math.max(0, Math.sin(phase + Math.PI + 0.9)) * 1.35,
          aL: sn * 0.95, aR: -sn * 0.95, eL: -1.35, eR: -1.35,
          bodyY: sn * 0.06,
        };
      } else if (s.mode === 'jump') {
        const rising = s.vy > 0;
        T = { ...T, hipY: 0.72, torsoX: rising ? 0.05 : 0.25, neckX: -0.1,
          tL: rising ? -1.25 : -0.6, tR: rising ? -0.2 : 0.3, kL: rising ? 1.6 : 0.6, kR: rising ? 0.9 : 0.5,
          aL: -2.5, aR: -2.1, eL: -0.3, eR: -0.5, sideL: 0.5, sideR: -0.5 };
      } else if (s.mode === 'fly') {
        phase += dt * 10;
        T = { ...T, torsoX: 0.5, neckX: -0.4, tL: 0.3, tR: 0.5, kL: 0.6, kR: 0.4,
          aL: -3.0, aR: 0.4, eL: 0, eR: -0.6, sideL: 0.2, sideR: -0.5, bodyY: Math.sin(phase) * 0.08 };
      } else if (s.mode === 'slide') {
        T = { ...T, hipY: 0.42, bodyX: -1.05, torsoX: 0.25, neckX: 0.55,
          tL: -1.15, tR: -0.7, kL: 0.15, kR: 0.9, aL: 0.6, aR: -1.6, eL: -0.2, eR: -0.8, sideL: 0.6, sideR: -0.3 };
      } else if (s.mode === 'dead') {
        T = { ...T, hipY: 0.5, bodyX: -1.4, torsoX: 0, neckX: 0.3, tL: -0.5, tR: -0.9, kL: 0.4, kR: 0.2,
          aL: -2.6, aR: -2.2, eL: 0, eR: 0, sideL: 1.0, sideR: -1.0 };
      }

      // aterrizaje → aplastamiento
      const inAir = s.mode === 'jump';
      if (wasAir && !inAir && s.mode !== 'dead') squash = 1;
      wasAir = inAir;
      squash = Math.max(0, squash - dt * 5);
      const sq = Math.sin(squash * Math.PI) * 0.18;
      body.scale.set(1 + sq * 0.6, 1 - sq, 1 + sq * 0.6);

      // inclinación al cambiar de carril
      tilt = damp(tilt, (s.laneDir || 0) * 0.42, 14, dt);
      body.rotation.z = -tilt;

      const kk = s.mode === 'run' ? 30 : k;
      set('hipY', hips.position, 'y', T.hipY, kk, dt);
      set('bodyX', body.rotation, 'x', T.bodyX, 12, dt);
      set('bodyY', body.rotation, 'y', T.bodyY - tilt * 0.4, kk, dt);
      set('torsoX', torso.rotation, 'x', T.torsoX, kk, dt);
      set('neckX', neck.rotation, 'x', T.neckX, kk, dt);
      set('tL', legs[0].thigh.rotation, 'x', T.tL, kk, dt);
      set('tR', legs[1].thigh.rotation, 'x', T.tR, kk, dt);
      set('kL', legs[0].knee.rotation, 'x', T.kL, kk, dt);
      set('kR', legs[1].knee.rotation, 'x', T.kR, kk, dt);
      set('aL', arms[0].shoulder.rotation, 'x', T.aL, kk, dt);
      set('aR', arms[1].shoulder.rotation, 'x', T.aR, kk, dt);
      set('eL', arms[0].elbow.rotation, 'x', T.eL, kk, dt);
      set('eR', arms[1].elbow.rotation, 'x', T.eR, kk, dt);
      set('sL', arms[0].shoulder.rotation, 'z', -T.sideL, kk, dt);
      set('sR', arms[1].shoulder.rotation, 'z', -T.sideR, kk, dt);
    },
  };
  return root;
}

// ---------------------------------------------------------------------------
// Retratos para el menú (se renderizan una sola vez a imagen)
// ---------------------------------------------------------------------------
let portraitCache = null;
export function renderPortraits() {
  if (portraitCache) return portraitCache;
  const size = 256;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(size, size);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.2));
  const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(2, 3, 4); scene.add(dl);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  cam.position.set(0.9, 1.75, 3.1); cam.lookAt(0, 1.25, 0);
  portraitCache = {};
  for (const id of Object.keys(CHARACTERS)) {
    const ch = buildCharacter(id);
    ch.rotation.y = 0.35;
    ch.userData.animate(1, { mode: 'idle' });
    scene.add(ch);
    renderer.render(scene, cam);
    portraitCache[id] = renderer.domElement.toDataURL('image/png');
    scene.remove(ch);
  }
  renderer.dispose();
  renderer.forceContextLoss?.();
  return portraitCache;
}
