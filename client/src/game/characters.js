import * as THREE from 'three';

// Personajes paródicos low-poly hechos con primitivas (sin modelos externos).
export const CHARACTERS = {
  hank: {
    name: 'Hodl Hank',
    desc: 'Compró en el pico de 2021. Nunca vendió.',
    skin: 0xf1c27d, shirt: 0x2ea043, pants: 0x30363d, shoes: 0xffffff,
    extras: ['cap'], capColor: 0xf7931a,
  },
  muskrat: {
    name: 'Elon Muskrat',
    desc: 'Tuitea a las 3 AM. Mueve mercados.',
    skin: 0xe8c39e, shirt: 0x111111, pants: 0x1f1f1f, shoes: 0x333333,
    extras: ['ratEars', 'darkHair', 'whiskers'],
  },
  thump: {
    name: 'Donald Thump',
    desc: 'Aranceles a la Luna. Los mejores aranceles.',
    skin: 0xf4a460, shirt: 0x1c2a5a, pants: 0x1c2a5a, shoes: 0x111111,
    extras: ['swoopHair', 'redTie'],
  },
  satoshi: {
    name: 'Satoshi Nakamochi',
    desc: 'Nadie sabe quién es. Ni él.',
    skin: 0x000000, shirt: 0x24292f, pants: 0x24292f, shoes: 0x111111,
    extras: ['hood', 'glowEyes'],
  },
};

const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

export function buildCharacter(id) {
  const c = CHARACTERS[id] || CHARACTERS.hank;
  const root = new THREE.Group();
  const body = new THREE.Group(); // se agacha al deslizarse
  root.add(body);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.36), mat(c.shirt));
  torso.position.y = 1.05;
  body.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), mat(c.skin));
  head.position.y = 1.64;
  body.add(head);

  const limb = (w, h, color) => {
    const g = new THREE.BoxGeometry(w, h, w);
    g.translate(0, -h / 2, 0); // pivote arriba para rotar
    return new THREE.Mesh(g, mat(color));
  };
  const armL = limb(0.16, 0.62, c.shirt); armL.position.set(-0.41, 1.38, 0);
  const armR = limb(0.16, 0.62, c.shirt); armR.position.set(0.41, 1.38, 0);
  const legL = limb(0.2, 0.72, c.pants); legL.position.set(-0.16, 0.72, 0);
  const legR = limb(0.2, 0.72, c.pants); legR.position.set(0.16, 0.72, 0);
  for (const [leg] of [[legL], [legR]]) {
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.34), mat(c.shoes));
    shoe.position.set(0, -0.72, -0.06);
    leg.add(shoe);
  }
  body.add(armL, armR, legL, legR);

  const ex = new Set(c.extras);
  if (ex.has('cap')) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.29, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(c.capColor));
    cap.position.y = 1.68;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.3), mat(c.capColor));
    visor.position.set(0, 1.7, -0.3);
    body.add(cap, visor);
  }
  if (ex.has('darkHair')) {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.285, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), mat(0x2b1d0e));
    hair.position.y = 1.67;
    body.add(hair);
  }
  if (ex.has('ratEars')) {
    for (const x of [-0.22, 0.22]) {
      const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 12), mat(0x9a7b6a));
      ear.rotation.x = Math.PI / 2;
      ear.position.set(x, 1.9, 0);
      body.add(ear);
    }
  }
  if (ex.has('whiskers')) {
    for (const x of [-1, 1]) for (const y of [0, 0.05]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.01, 0.01), mat(0x222222));
      w.position.set(x * 0.2, 1.58 + y, -0.24);
      body.add(w);
    }
  }
  if (ex.has('swoopHair')) {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.31, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.2), mat(0xffb347));
    hair.scale.set(1.08, 0.8, 1.2);
    hair.position.set(0, 1.71, -0.03);
    const swoop = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.18), mat(0xffb347));
    swoop.position.set(0.04, 1.82, -0.22);
    swoop.rotation.z = -0.15;
    body.add(hair, swoop);
  }
  if (ex.has('redTie')) {
    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.62, 0.02), mat(0xd62828));
    tie.position.set(0, 1.0, -0.19);
    const shirtV = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 0.01), mat(0xffffff));
    shirtV.position.set(0, 1.27, -0.185);
    body.add(shirtV, tie);
  }
  if (ex.has('hood')) {
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), mat(c.shirt, { side: THREE.DoubleSide }));
    hood.position.set(0, 1.66, 0.04);
    hood.scale.set(1, 1.1, 1);
    body.add(hood);
    head.position.z = -0.05;
  }
  if (ex.has('glowEyes')) {
    for (const x of [-0.09, 0.09]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), new THREE.MeshBasicMaterial({ color: 0xf7931a }));
      eye.position.set(x, 1.67, -0.31);
      body.add(eye);
    }
  }

  // Escudo (visible cuando está activo)
  const shield = new THREE.Mesh(
    new THREE.SphereGeometry(1.1, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0x58a6ff, transparent: true, opacity: 0.22, depthWrite: false })
  );
  shield.position.y = 1;
  shield.visible = false;
  root.add(shield);

  // El personaje mira hacia -Z (dirección de carrera)
  let t = 0;
  root.userData = {
    shield,
    animate(dt, state) {
      t += dt * (state.speed ? 8 + state.speed * 0.25 : 3);
      if (state.idle) {
        const s = Math.sin(t) * 0.12;
        armL.rotation.x = s; armR.rotation.x = -s; legL.rotation.x = 0; legR.rotation.x = 0;
        body.position.y = Math.sin(t * 2) * 0.02;
        body.rotation.x = 0; body.scale.y = 1;
        return;
      }
      if (state.sliding) {
        body.rotation.x = 1.15; body.position.y = -0.45; body.position.z = 0.4;
        armL.rotation.x = armR.rotation.x = -2.6;
        legL.rotation.x = legR.rotation.x = 0;
        return;
      }
      body.rotation.x = 0.08; body.position.z = 0;
      if (state.airborne) {
        body.position.y = 0;
        armL.rotation.x = -2.4; armR.rotation.x = -2.4;
        legL.rotation.x = -0.8; legR.rotation.x = 0.4;
        return;
      }
      const s = Math.sin(t);
      armL.rotation.x = s * 1.1; armR.rotation.x = -s * 1.1;
      legL.rotation.x = -s * 1.0; legR.rotation.x = s * 1.0;
      body.position.y = Math.abs(Math.cos(t)) * 0.08;
    },
  };
  return root;
}
