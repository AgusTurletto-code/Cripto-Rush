// La curva de velocidad y el espaciado de monedas viven en shared/speed.js (los usa también el servidor).
import { SPEED, COIN_SPACING, speedAt, speedAtDistance } from '../../../shared/speed.js';

export const RULES = {
  startSpeed: SPEED.start,
  maxSpeed: SPEED.max,
  coinSpacing: COIN_SPACING,
};
export { speedAt, speedAtDistance };

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

