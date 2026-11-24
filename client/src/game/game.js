import * as THREE from 'three';
import { World, OBSTACLE_TYPES } from './world.js';
import { buildCharacter } from './characters.js';
import { LANES, PHYS, RULES, POWERUPS } from './rules.js';

/**
 * Motor del juego. Callbacks:
 *  onHud({coins, distance, powerups}) · onDeath() · onCoin()
 */
export class Game {
  constructor(container, callbacks = {}) {
    this.cb = callbacks;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0e1f);
    this.scene.fog = new THREE.Fog(0x0a0e1f, 60, 170);

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 500);
    this.scene.add(new THREE.HemisphereLight(0x9fb4ff, 0x1a1030, 1.6));
    const sun = new THREE.DirectionalLight(0xffe0b0, 1.6);
    sun.position.set(5, 10, 4);
    this.scene.add(sun);

    this.world = new World(this.scene);
    this.player = null;
    this.setCharacter('hank');

    this.state = 'idle'; // idle | running | paused | dead
    this.clock = new THREE.Clock();
    this.time = 0;
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
    this.player.rotation.y = Math.PI; // mirar hacia -Z
    this.scene.add(this.player);
    this.characterId = id;
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // en pantallas angostas abrimos el campo de visión para ver los 3 carriles
    this.camera.fov = w / h < 0.7 ? 72 : 62;
    this.camera.updateProjectionMatrix();
  }

  _resetPlayer() {
    this.lane = 1;
    this.x = LANES[1];
    this.y = 0;
    this.vy = 0;
    this.d = 0;            // distancia recorrida
    this.runTime = 0;      // tiempo de juego (sin pausas)
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
      if (a === 'up' && this.y <= 0.001 && !this.power.rocket) { this.vy = PHYS.jumpVelocity; this.slideLeft = 0; }
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
    // también con mouse (para probar en PC)
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
    const dt = Math.min(this.clock.getDelta(), 1 / 20); // evita saltos grandes si el tab se congela
    this.time += dt;
    if (this.state === 'running') this._step(dt);

    const p = this.player;
    p.position.set(this.x, this.y, -this.d);
    p.userData.shield.visible = this.power.shield > 0 || (this.invincible > 0 && Math.floor(this.time * 10) % 2 === 0);
    p.userData.animate(dt, {
      idle: this.state === 'idle',
      speed: this.state === 'running' ? this.speed : 0,
      sliding: this.slideLeft > 0 && this.y < 0.01,
      airborne: this.y > 0.05,
    });
    if (this.state === 'idle') p.rotation.y = Math.PI + Math.sin(this.time * 0.6) * 0.5;
    else p.rotation.y = Math.PI;

    // cámara
    const camTarget = this.state === 'idle'
      ? new THREE.Vector3(1.6, 2.2, -this.d + 4.2)
      : new THREE.Vector3(this.x * 0.6, 4.3 + this.y * 0.6, -this.d + 7.5);
    this.camera.position.lerp(camTarget, this.state === 'idle' ? 0.05 : 1 - Math.exp(-dt * 10));
    const look = this.state === 'idle'
      ? new THREE.Vector3(0, 1.3, -this.d)
      : new THREE.Vector3(this.x * 0.4, 1.4 + this.y * 0.5, -this.d - 8);
    this.camera.lookAt(look);

    if (this.state !== 'running') this.world.update(this.d, this.time);
    this.renderer.render(this.scene, this.camera);
  }

  _step(dt) {
    this.runTime += dt;
    this.speed = Math.min(RULES.maxSpeed, RULES.startSpeed + RULES.acceleration * this.runTime);
    this.d += this.speed * dt;

    // carril (suavizado)
    const tx = LANES[this.lane];
    this.x += Math.sign(tx - this.x) * Math.min(Math.abs(tx - this.x), PHYS.laneSwitchSpeed * dt);

    // vertical
    if (this.power.rocket > 0) {
      this.y += (7 - this.y) * Math.min(1, dt * 4);
      this.vy = 0;
    } else {
      this.vy -= PHYS.gravity * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) { this.y = 0; this.vy = 0; }
    }
    if (this.slideLeft > 0) this.slideLeft -= dt;
    if (this.invincible > 0) this.invincible -= dt;

    // power-ups
    for (const k of Object.keys(this.power)) {
      if (this.power[k] > 0) {
        this.power[k] -= dt;
        if (this.power[k] <= 0) {
          this.power[k] = 0;
          if (k === 'rocket') this.invincible = Math.max(this.invincible, 1.2);
        }
      }
    }

    this.world.update(this.d, this.time);
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

    // obstáculos
    if (this.power.rocket <= 0 && this.invincible <= 0) {
      for (const o of this.world.obstacles) {
        const t = OBSTACLE_TYPES[o.type];
        // el obstáculo ocupa d ∈ [o.d, o.d + len]; el jugador ±0.3
        if (this.d + 0.3 < o.d || this.d - 0.3 > o.d + t.len) continue;
        if (Math.abs(this.x - LANES[o.lane]) > half + 0.95) continue;
        if (py1 <= t.y0 || py0 >= t.y1) continue;
        // golpe lateral contra el camión: rebota al carril anterior en vez de morir
        if (o.type === 'wall' && this.d - 0.3 > o.d + 0.6) {
          this.lane = this.x < LANES[o.lane] ? Math.max(0, o.lane - 1) : Math.min(2, o.lane + 1);
          this.cb.onInput?.('bump');
          continue;
        }
        if (this.power.shield > 0) {
          this.power.shield = 0;
          this.invincible = 1;
          this.world.root.remove(o.mesh);
          this.world.obstacles = this.world.obstacles.filter((x) => x !== o);
          this.cb.onInput?.('shieldBreak');
          return;
        }
        this.state = 'dead';
        this.cb.onDeath?.();
        return;
      }
    }

    // monedas
    const magnet = this.power.magnet > 0;
    for (const c of this.world.coins) {
      if (c.taken) continue;
      const dz = c.d - this.d;
      if (magnet && dz > -1 && dz < 10) {
        // el imán atrae la moneda hacia el jugador
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
        this.coins++;
        this.cb.onCoin?.();
      }
    }
    this.world.coins = this.world.coins.filter((c) => !c.taken);

    // power-ups
    for (const p of this.world.powerups) {
      if (Math.abs(p.d - this.d) < 1 && Math.abs(LANES[p.lane] - this.x) < 1 && py0 < 2) {
        p.taken = true;
        this.world.root.remove(p.mesh);
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
