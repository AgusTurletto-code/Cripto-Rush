// ⚠️ Deben coincidir con RULES en server/src/config.js (el servidor valida las partidas con esto).
export const RULES = {
  startSpeed: 14,
  acceleration: 0.22,
  maxSpeed: 38,
  coinSpacing: 3,
};

export const LANES = [-2.4, 0, 2.4];

export const PHYS = {
  gravity: 34,
  jumpVelocity: 12,
  slideTime: 0.65,
  laneSwitchSpeed: 16,
  playerWidth: 0.7,
  playerHeight: 1.7,
  slideHeight: 0.75,
};

export const POWERUPS = {
  magnet: { label: 'Ballena imán', icon: '🐋', duration: 8 },
  rocket: { label: 'To the Moon', icon: '🚀', duration: 4 },
  shield: { label: 'Escudo HODL', icon: '🛡️', duration: 12 },
};

/** Velocidad esperada a una distancia dada (sirve para espaciar obstáculos). */
export function speedAtDistance(d) {
  const { startSpeed: v0, acceleration: a, maxSpeed } = RULES;
  return Math.min(maxSpeed, Math.sqrt(v0 * v0 + 2 * a * d));
}
