// Sonido 100% generado con Web Audio (sin archivos): efectos + música de fondo simple.
const STORE_KEY = 'cr-muted';
let ctx = null, master = null, sfxBus = null, musicBus = null;
let muted = false;
try { muted = localStorage.getItem(STORE_KEY) === '1'; } catch { /* ignore */ }

/** Hay que llamarlo desde un toque/clic (los navegadores no dejan sonar antes). */
export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9; master.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 0.6; sfxBus.connect(master);
      musicBus = ctx.createGain(); musicBus.gain.value = 0.22; musicBus.connect(master);
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch { /* sin audio */ }
}
// primer toque en cualquier lado desbloquea el audio
['pointerdown', 'touchend', 'keydown'].forEach((ev) => document.addEventListener(ev, unlockAudio, { once: false, passive: true }));

export const isMuted = () => muted;
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem(STORE_KEY, m ? '1' : '0'); } catch { /* ignore */ }
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05);
}

function tone({ f = 440, f2 = null, type = 'square', dur = 0.1, vol = 0.25, at = 0, bus = sfxBus, attack = 0.005 }) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(bus);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

let noiseBuf = null;
function noise({ dur = 0.2, vol = 0.3, from = 2000, to = 300, at = 0, q = 1 }) {
  if (!ctx || muted) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = ctx.currentTime + at;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q;
  f.frequency.setValueAtTime(from, t0); f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f); f.connect(g); g.connect(sfxBus);
  s.start(t0); s.stop(t0 + dur + 0.02);
}

// las monedas seguidas suben de tono (sensación de combo)
let coinStreak = 0, lastCoin = 0;

export const sfx = {
  coin() {
    const now = performance.now();
    coinStreak = now - lastCoin < 400 ? Math.min(coinStreak + 1, 12) : 0;
    lastCoin = now;
    const base = 880 * Math.pow(2, coinStreak / 24);
    tone({ f: base, dur: 0.06, vol: 0.12, type: 'square' });
    tone({ f: base * 1.5, dur: 0.12, vol: 0.12, type: 'square', at: 0.05 });
  },
  jump() { tone({ f: 260, f2: 620, dur: 0.18, vol: 0.18, type: 'triangle' }); },
  slide() { noise({ dur: 0.3, vol: 0.25, from: 1800, to: 400, q: 0.8 }); },
  lane() { tone({ f: 520, f2: 640, dur: 0.05, vol: 0.08, type: 'triangle' }); },
  bump() { tone({ f: 160, f2: 90, dur: 0.15, vol: 0.3, type: 'sawtooth' }); },
  crash() {
    noise({ dur: 0.5, vol: 0.5, from: 1200, to: 80, q: 0.5 });
    tone({ f: 180, f2: 40, dur: 0.6, vol: 0.35, type: 'sawtooth' });
  },
  power() { [523, 659, 784, 1047].forEach((f, i) => tone({ f, dur: 0.12, vol: 0.14, type: 'square', at: i * 0.06 })); },
  shield() { tone({ f: 900, f2: 300, dur: 0.3, vol: 0.2, type: 'triangle' }); noise({ dur: 0.25, vol: 0.2, from: 4000, to: 1500 }); },
  revive() { [392, 523, 659, 784, 1047].forEach((f, i) => tone({ f, dur: 0.15, vol: 0.14, type: 'triangle', at: i * 0.07 })); },
  cash() { [1047, 1319, 1568, 2093].forEach((f, i) => tone({ f, dur: 0.1, vol: 0.12, type: 'square', at: i * 0.05 })); },
  click() { tone({ f: 700, dur: 0.04, vol: 0.08, type: 'triangle' }); },
  box() { [784, 988, 1319].forEach((f, i) => tone({ f, dur: 0.14, vol: 0.15, type: 'triangle', at: i * 0.07 })); },
  shake() { tone({ f: 180, f2: 120, dur: 0.08, vol: 0.18, type: 'square' }); },
  boxOpen() { noise({ dur: 0.35, vol: 0.3, from: 3000, to: 600 }); [1047, 1319, 1568, 2093].forEach((f, i) => tone({ f, dur: 0.18, vol: 0.13, type: 'square', at: 0.12 + i * 0.07 })); },
  tick() { tone({ f: 1500, dur: 0.025, vol: 0.06, type: 'square' }); },
  jackpot() {
    [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((f, i) => tone({ f, dur: 0.22, vol: 0.16, type: 'square', at: i * 0.11 }));
    noise({ dur: 1.2, vol: 0.15, from: 6000, to: 2000, at: 0.9 });
  },
  hint() { tone({ f: 660, dur: 0.08, vol: 0.12, type: 'sine' }); tone({ f: 880, dur: 0.12, vol: 0.12, type: 'sine', at: 0.09 }); },
};

// ---------- Música: bucle de 4 acordes (Am - F - C - G), bajo + arpegio + bombo ----------
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // MIDI
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
let musicTimer = null, step = 0, nextTime = 0, tempo = 124;

export function startMusic() {
  if (!ctx || musicTimer) return;
  step = 0; nextTime = ctx.currentTime + 0.05;
  musicTimer = setInterval(() => {
    if (muted) { nextTime = ctx.currentTime + 0.05; return; }
    const sixteenth = 60 / tempo / 4;
    while (nextTime < ctx.currentTime + 0.2) {
      const chord = CHORDS[Math.floor(step / 16) % 4];
      const s = step % 16;
      const at = nextTime - ctx.currentTime;
      if (s % 4 === 0) tone({ f: 55, f2: 35, dur: 0.18, vol: 0.5, type: 'sine', at, bus: musicBus }); // bombo
      if (s % 8 === 4) noise({ dur: 0.12, vol: 0.18, from: 3000, to: 1500, at }); // caja suave
      if (s % 4 === 2) tone({ f: midi(chord[0] - 12), dur: sixteenth * 1.8, vol: 0.22, type: 'sawtooth', at, bus: musicBus }); // bajo
      if (s % 2 === 0) tone({ f: midi(chord[(s / 2) % 3] + 12), dur: sixteenth * 0.9, vol: 0.06, type: 'square', at, bus: musicBus }); // arpegio
      nextTime += sixteenth;
      step++;
    }
  }, 50);
}
export function stopMusic() { clearInterval(musicTimer); musicTimer = null; }
/** La música acelera un poco con la velocidad del juego. */
export function setMusicSpeed(gameSpeed) { tempo = 118 + Math.min(1, (gameSpeed - 14) / 24) * 22; }
