import * as THREE from 'three';
import { World, OBSTACLE_TYPES, makePowerupModel } from './world.js';
import { buildCharacter } from './characters.js';
import { LANES, PHYS, RULES, POWERUPS } from './rules.js';

const DAY_CYCLE_SECONDS = 140; // un día completo (día → noche → día) en segundos de juego

/**
 * Motor del juego. Callbacks:
 *  onHud({coins, distance, powerups}) · onDeath() · onCoin() · onInput(evento)
 */
export class Game {
  constructor(container, callbacks = {}) {
    this.cb = callbacks;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1000);
    this.world = new World(this.scene);

    // efectos de power-ups que se ven sobre el jugador
    this.fx = {
      rocket: makePowerupModel('rocket'),
      whale: makePowerupModel('magnet'),
      bubble: new THREE.Group(),
    };
    this.fx.rocket.scale.setScalar(0.75);
    this.fx.rocket.userData.glow.visible = false;
    this.fx.whale.scale.setScalar(0.55);
    const bubbleFill = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 2),
      new THREE.MeshBasicMaterial({ color: 0x5b8cff, transparent: true, opacity: 0.16, depthWrite: false }));
    const bubbleWire = new THREE.Mesh(new THREE.IcosahedronGeometry(1.17, 1),
      new THREE.MeshBasicMaterial({ color: 0x9fc0ff, wireframe: true, transparent: true, opacity: 0.45 }));
    this.fx.bubble.add(bubbleFill, bubbleWire);
    this.fx.bubble.position.y = 1.0;

    this.player = null;
    this.setCharacter('hank');

    this.state = 'idle'; // idle | running | paused | dead
    this.clock = new THREE.Clock();
    this.time = 0;
    this.shake = 0;
    this.dayPhase = 0.05;
    this._resize();
    window.addEventListener('resize', () => this._resize());
    this._bindInput();
    this.world.reset(1);
    this._resetPlayer();
    this.renderer.setAnimationLoop(() => this._frame());
  }

  setCharacter(id) {
    if (this.player) this.scene.remove(this.player);
    this.player = buildCharacter(id);
    this.player.add(this.fx.rocket, this.fx.whale, this.fx.bubble);
    this.scene.add(this.player);
    this.characterId = id;
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.7 ? 70 : 60; // en pantallas angostas se ven bien los 3 carriles
    this.camera.updateProjectionMatrix();
  }

  _resetPlayer() {
    this.lane = 1;
    this.x = LANES[1];
    this.y = 0;
    this.vy = 0;
    this.d = 0;
    this.runTime = 0;
    this.speed = RULES.startSpeed;
    this.slideLeft = 0;
    this.coins = 0;
    this.invincible = 0;
    this.power = { magnet: 0, rocket: 0, shield: 0 };
  }

  // ---------- API pública ----------
  start(seed) {
    this.world.reset(seed);
    this._resetPlayer();
    this.dayPhase = 0.02; // cada partida arranca de día
    this.state = 'running';
    this.clock.getDelta();
  }
  pause() { if (this.state === 'running') this.state = 'paused'; }
  resume() { if (this.state === 'paused') { this.state = 'running'; this.clock.getDelta(); } }
  revive() {
    this.world.clearAhead(this.d - 2, 60);
    this.y = 0; this.vy = 0; this.slideLeft = 0;
    this.invincible = 2.5;
    this.state = 'running';
    this.world.particles.emit(new THREE.Vector3(this.x, 1, -this.d), 'gold', 24, { spread: 1.5, up: 4, life: 0.8, size: 0.5 });
    this.clock.getDelta();
  }
  toMenu() {
    this.state = 'idle';
    this.world.reset(1);
    this._resetPlayer();
  }
  get result() { return { coins: this.coins, distance: Math.floor(this.d) }; }

  // ---------- Controles ----------
  _bindInput() {
    const act = (a) => {
      if (this.state !== 'running') return;
      if (a === 'left') this.lane = Math.max(0, this.lane - 1);
      if (a === 'right') this.lane = Math.min(2, this.lane + 1);
      if (a === 'up' && this.y <= 0.001 && !this.power.rocket) {
        this.vy = PHYS.jumpVelocity; this.slideLeft = 0;
        this.world.particles.emit(new THREE.Vector3(this.x, 0.1, -this.d), 'dust', 6, { spread: 0.6, up: 1, life: 0.4 });
      }
      if (a === 'down' && !this.power.rocket) {
        if (this.y > 0.001) this.vy = -PHYS.jumpVelocity * 1.6; // caída rápida
        this.slideLeft = PHYS.slideTime;
      }
      this.cb.onInput?.(a);
    };
    window.addEventListener('keydown', (e) => {
      const map = { ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ArrowUp: 'up', w: 'up', ' ': 'up', ArrowDown: 'down', s: 'down' };
      if (map[e.key]) { act(map[e.key]); e.preventDefault(); }
    });
    let sx = 0, sy = 0, tracking = false;
    const el = this.renderer.domElement;
    el.addEventListener('touchstart', (e) => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; tracking = true; }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (!tracking) return;
      const t = e.touches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return;
      tracking = false;
      if (Math.abs(dx) > Math.abs(dy)) act(dx > 0 ? 'right' : 'left');
      else act(dy > 0 ? 'down' : 'up');
    }, { passive: true });
    el.addEventListener('touchend', () => { tracking = false; });
    let md = null;
    el.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') md = { x: e.clientX, y: e.clientY }; });
    el.addEventListener('pointerup', (e) => {
      if (!md || e.pointerType !== 'mouse') return;
      const dx = e.clientX - md.x, dy = e.clientY - md.y; md = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return;
      if (Math.abs(dx) > Math.abs(dy)) act(dx > 0 ? 'right' : 'left'); else act(dy > 0 ? 'down' : 'up');
    });
  }

  // ---------- Bucle ----------
  _frame() {
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    this.time += dt;
    if (this.state === 'running') this._step(dt);

    // ciclo de día y noche (en el menú corre más lento)
    if (this.state === 'running') this.dayPhase += dt / DAY_CYCLE_SECONDS;
    else if (this.state === 'idle') this.dayPhase += dt / (DAY_CYCLE_SECONDS * 3);
    this.world.setDayPhase(this.dayPhase);

    const p = this.player;
    p.position.set(this.x, this.y, -this.d);
    const sliding = this.slideLeft > 0 && this.y < 0.05;
    let mode = 'run';
    if (this.state === 'idle') mode = 'idle';
    else if (this.state === 'dead') mode = 'dead';
    else if (this.power.rocket > 0) mode = 'fly';
    else if (this.y > 0.05) mode = 'jump';
    else if (sliding) mode = 'slide';
    const dx = LANES[this.lane] - this.x;
    p.userData.animate(dt, {
      mode, speed: this.speed, vy: this.vy,
      laneDir: this.state === 'running' && Math.abs(dx) > 0.05 ? Math.sign(dx) : 0,
    });
    // el modelo mira a +Z: en el menú mira a la cámara, al correr gira hacia -Z
    p.rotation.y = this.state === 'idle' ? 0.35 + Math.sin(this.time * 0.6) * 0.25 : Math.PI;

    // efectos de power-ups activos
    const fx = this.fx;
    fx.rocket.visible = this.power.rocket > 0;
    fx.rocket.position.set(0, 1.15, -0.38);
    fx.rocket.userData.flame.scale.set(1.2, 1.2 + Math.random() * 0.8, 1.2);
    fx.whale.visible = this.power.magnet > 0 && this.state !== 'idle';
    fx.whale.position.set(Math.cos(this.time * 3) * 1.1, 2.4 + Math.sin(this.time * 6) * 0.1, Math.sin(this.time * 3) * 1.1);
    fx.whale.rotation.y = -this.time * 3;
    fx.bubble.visible = this.power.shield > 0 || (this.invincible > 0 && Math.floor(this.time * 10) % 2 === 0);
    fx.bubble.rotation.y = this.time;
    fx.bubble.scale.setScalar(1 + Math.sin(this.time * 4) * 0.03);

    // cámara
    const idle = this.state === 'idle';
    const camTarget = idle
      ? new THREE.Vector3(1.2, 2.0, -this.d + 4.6)
      : new THREE.Vector3(this.x * 0.6, 4.2 + this.y * 0.55, -this.d + 7.6);
    this.camera.position.lerp(camTarget, idle ? 0.05 : 1 - Math.exp(-dt * 10));
    if (this.shake > 0) {
      this.shake -= dt;
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.8;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.8;
    }
    const look = idle
      ? new THREE.Vector3(0, 1.25, -this.d)
      : new THREE.Vector3(this.x * 0.4, 1.5 + this.y * 0.5, -this.d - 8);
    this.camera.lookAt(look);

    if (this.state !== 'running') this.world.update(this.d, this.time, dt);
    this.renderer.render(this.scene, this.camera);
  }

  _step(dt) {
    this.runTime += dt;
    this.speed = Math.min(RULES.maxSpeed, RULES.startSpeed + RULES.acceleration * this.runTime);
    this.d += this.speed * dt;

    const tx = LANES[this.lane];
    this.x += Math.sign(tx - this.x) * Math.min(Math.abs(tx - this.x), PHYS.laneSwitchSpeed * dt);

    const wasAir = this.y > 0.05;
    if (this.power.rocket > 0) {
      this.y += (7 - this.y) * Math.min(1, dt * 4);
      this.vy = 0;
      if (Math.random() < 0.6) this.world.particles.emit(new THREE.Vector3(this.x, this.y + 0.6, -this.d + 0.5), 'fire', 1, { spread: 0.2, up: -1, life: 0.35, size: 0.5 });
    } else {
      this.vy -= PHYS.gravity * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0; this.vy = 0;
        if (wasAir) this.world.particles.emit(new THREE.Vector3(this.x, 0.1, -this.d), 'dust', 8, { spread: 0.8, up: 1, life: 0.45 });
      }
    }
    if (this.slideLeft > 0) {
      this.slideLeft -= dt;
      if (this.y < 0.05 && Math.random() < 0.5) this.world.particles.emit(new THREE.Vector3(this.x, 0.15, -this.d + 0.3), 'dust', 1, { spread: 0.4, up: 0.8, life: 0.4, size: 0.45 });
    }
    if (this.invincible > 0) this.invincible -= dt;

    for (const k of Object.keys(this.power)) {
      if (this.power[k] > 0) {
        this.power[k] -= dt;
        if (this.power[k] <= 0) {
          this.power[k] = 0;
          if (k === 'rocket') this.invincible = Math.max(this.invincible, 1.2);
        }
      }
    }

    this.world.update(this.d, this.time, dt);
    this._collide();
    this.cb.onHud?.({
      coins: this.coins,
      distance: Math.floor(this.d),
      powerups: Object.entries(this.power).filter(([, v]) => v > 0).map(([k, v]) => ({ k, left: v, ...POWERUPS[k] })),
    });
  }

  _collide() {
    const sliding = this.slideLeft > 0 && this.y < 0.3;
    const h = sliding ? PHYS.slideHeight : PHYS.playerHeight;
    const py0 = this.y, py1 = this.y + h;
    const half = PHYS.playerWidth / 2;
    const pos = new THREE.Vector3(this.x, this.y + 1, -this.d);

    if (this.power.rocket <= 0 && this.invincible <= 0) {
      for (const o of this.world.obstacles) {
        const t = OBSTACLE_TYPES[o.type];
        if (this.d + 0.3 < o.d || this.d - 0.3 > o.d + t.len) continue;
        if (Math.abs(this.x - LANES[o.lane]) > half + 0.95) continue;
        if (py1 <= t.y0 || py0 >= t.y1) continue;
        // golpe lateral contra el camión: rebota al carril anterior
        if (o.type === 'wall' && this.d - 0.3 > o.d + 0.6) {
          this.lane = this.x < LANES[o.lane] ? Math.max(0, o.lane - 1) : Math.min(2, o.lane + 1);
          this.shake = 0.25;
          this.cb.onInput?.('bump');
          continue;
        }
        if (this.power.shield > 0) {
          this.power.shield = 0;
          this.invincible = 1;
          this.world.removeObstacle(o);
          this.world.particles.emit(pos, 'blue', 30, { spread: 2, up: 4, life: 0.7, size: 0.5 });
          this.shake = 0.3;
          this.cb.onInput?.('shieldBreak');
          return;
        }
        this.state = 'dead';
        this.shake = 0.45;
        this.world.particles.emit(pos, 'white', 20, { spread: 1.5, up: 3, life: 0.6 });
        this.cb.onDeath?.();
        return;
      }
    }

    const magnet = this.power.magnet > 0;
    for (const c of this.world.coins) {
      if (c.taken) continue;
      const dz = c.d - this.d;
      if (magnet && dz > -1 && dz < 10) {
        const m = c.mesh.position;
        m.x += (this.x - m.x) * 0.25;
        m.y += (this.y + 1 - m.y) * 0.25;
        c.d += (this.d - c.d) * 0.25;
        m.z = -c.d;
      }
      if (Math.abs(c.d - this.d) < 0.9 &&
          Math.abs(c.mesh.position.x - this.x) < 0.9 &&
          Math.abs(c.mesh.position.y - (this.y + h / 2)) < 1.2) {
        c.taken = true;
        this.world.root.remove(c.mesh);
        this.world.particles.emit(c.mesh.position, 'gold', 4, { spread: 0.5, up: 2, life: 0.35, size: 0.3 });
        this.coins++;
        this.cb.onCoin?.();
      }
    }
    this.world.coins = this.world.coins.filter((c) => !c.taken);

    for (const p of this.world.powerups) {
      if (Math.abs(p.d - this.d) < 1 && Math.abs(LANES[p.lane] - this.x) < 1 && py0 < 2) {
        p.taken = true;
        this.world.root.remove(p.mesh);
        this.world.particles.emit(p.mesh.position, p.kind === 'rocket' ? 'fire' : 'blue', 20, { spread: 1.2, up: 3, life: 0.6, size: 0.45 });
        this.power[p.kind] = POWERUPS[p.kind].duration;
        if (p.kind === 'rocket') {
          const flight = this.speed * POWERUPS.rocket.duration;
          this.world.rocketCoins(this.d, this.d + flight, this.lane, 7.6);
          this.world.clearAhead(this.d, flight + 20);
        }
        this.cb.onInput?.('power:' + p.kind);
      }
    }
    this.world.powerups = this.world.powerups.filter((p) => !p.taken);
  }
}
