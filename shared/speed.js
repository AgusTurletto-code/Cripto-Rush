// Curva de velocidad del juego. La usan el juego (para mover al jugador) y el servidor
// (para detectar partidas imposibles), así que siempre coinciden.
//
// La velocidad sube rápido al principio y cada vez más despacio, acercándose al tope sin
// llegar de golpe (curva exponencial):   v(t) = max − (max − start) · e^(−t / ramp)
//
//   0 s → 14   ·   30 s → ~20   ·   60 s → ~25   ·   2 min → ~31   ·   3 min → ~35   ·   5 min → ~38   (tope 40)

export const SPEED = {
  start: 14,  // unidades por segundo al empezar
  max: 40,    // tope: nunca se supera
  ramp: 110,  // segundos: cuanto más grande, más lento se acerca al tope
};

export const COIN_SPACING = 3; // distancia mínima entre monedas de una misma fila

/** Velocidad a los `t` segundos de partida. */
export function speedAt(t) {
  const { start, max, ramp } = SPEED;
  return max - (max - start) * Math.exp(-Math.max(0, t) / ramp);
}

/** Distancia recorrida en `t` segundos (integral de speedAt). */
export function distanceAt(t) {
  const { start, max, ramp } = SPEED;
  t = Math.max(0, t);
  return max * t - (max - start) * ramp * (1 - Math.exp(-t / ramp));
}

/** Segundos que se tarda en recorrer `d` (inversa de distanceAt, por búsqueda binaria). */
export function timeAtDistance(d) {
  let lo = 0, hi = 3600;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (distanceAt(mid) < d) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Velocidad esperada al llegar a la distancia `d` (sirve para espaciar obstáculos). */
export function speedAtDistance(d) {
  return speedAt(timeAtDistance(d));
}
