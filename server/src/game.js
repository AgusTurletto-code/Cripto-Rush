import { RULES } from './config.js';

/** Distancia máxima físicamente posible en `t` segundos. */
export function maxDistance(t) {
  const { startSpeed: v0, acceleration: a, maxSpeed: vMax } = RULES;
  const tMax = (vMax - v0) / a;
  if (t <= tMax) return v0 * t + 0.5 * a * t * t;
  return v0 * tMax + 0.5 * a * tMax * tMax + vMax * (t - tMax);
}

/** Máximo de monedas recolectables en una distancia (solo hay una fila de monedas a la vez). */
export function maxCoins(distance) {
  return Math.floor(distance / RULES.coinSpacing) + 10;
}

/**
 * Revisa que una partida sea plausible. Devuelve null si está bien o el motivo del rechazo.
 * Nota: es una validación de "plausibilidad". Para algo más fuerte habría que reproducir
 * la partida en el servidor a partir de la semilla y los inputs del jugador.
 */
export function checkRun({ coins, distance, serverSeconds }) {
  if (!Number.isInteger(coins) || coins < 0) return 'coins_invalid';
  if (!Number.isFinite(distance) || distance < 0) return 'distance_invalid';
  if (serverSeconds > RULES.maxRunSeconds) return 'too_long';
  // margen de 3 s por latencia de red
  if (distance > maxDistance(serverSeconds + 3) * 1.02) return 'distance_impossible';
  if (coins > maxCoins(distance)) return 'coins_impossible';
  return null;
}

// Personajes paródicos. El precio se paga con monedas (también sirve para que no todo se retire).
export const CHARACTERS = {
  hank:    { name: 'Hodl Hank',         price: 0 },
  muskrat: { name: 'Elon Muskrat',      price: 15000 },
  thump:   { name: 'Donald Thump',      price: 15000 },
  satoshi: { name: 'Satoshi Nakamochi', price: 30000 },
};
