// Ruleta: configuración compartida (shared/wheel.json) y sorteo seguro en el servidor.
import crypto from 'node:crypto';
import fs from 'node:fs';

export const WHEEL = JSON.parse(fs.readFileSync(new URL('../../shared/wheel.json', import.meta.url), 'utf8'));
const TOTAL = WHEEL.segments.reduce((s, x) => s + x.weight, 0);

/** Elige un casillero según los pesos, con un generador criptográfico (no predecible). */
export function pickSegment() {
  let r = crypto.randomInt(0, TOTAL);
  for (let i = 0; i < WHEEL.segments.length; i++) {
    r -= WHEEL.segments[i].weight;
    if (r < 0) return i;
  }
  return 0;
}

/** Lo que ve el juego: casilleros y probabilidades (para mostrarlas con transparencia). */
export function publicWheel() {
  return {
    spinsPer24h: WHEEL.spinsPer24h,
    jackpotUsd: WHEEL.jackpotUsd,
    segments: WHEEL.segments.map((s) => ({
      coins: s.coins || 0, jackpot: !!s.jackpot, color: s.color, odds: s.weight / TOTAL,
    })),
  };
}
