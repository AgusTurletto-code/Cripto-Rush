// Cajas Cripto: dónde aparecen en la pista y qué premios dan.
// Lo usan el juego (para dibujarlas) y el servidor (para comprobar que la caja existía).
// La posición sale de la semilla de la partida, así que los dos calculan exactamente lo mismo.

export const BOXES = {
  firstAt: 250,      // la primera aparece después de este punto (metros)
  minGap: 400,       // separación entre cajas (metros), al azar entre minGap y maxGap
  maxGap: 900,
  maxPerRun: 10,     // tope de seguridad por partida
  // premios al abrirla (weight = probabilidad relativa)
  rewards: [
    { coins: 100, weight: 40 },
    { coins: 250, weight: 30 },
    { coins: 500, weight: 18 },
    { coins: 1000, weight: 9 },
    { coins: 2500, weight: 3 },
  ],
};

// mulberry32: generador simple y determinista
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cajas de una partida hasta la distancia `upTo`: [{ i, d, lane }]. */
export function boxesForSeed(seed, upTo) {
  const r = rng((Number(seed) ^ 0xb0c5c0de) >>> 0);
  const out = [];
  let d = BOXES.firstAt + r() * 300;
  for (let i = 0; d <= upTo && i < 500; i++) {
    out.push({ i, d: Math.round(d * 10) / 10, lane: Math.floor(r() * 3) });
    d += BOXES.minGap + r() * (BOXES.maxGap - BOXES.minGap);
  }
  return out;
}
