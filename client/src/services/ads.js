/**
 * Anuncios con recompensa de Monetag (Rewarded Interstitial) para Telegram Mini Apps.
 * Documentación: https://docs.monetag.com/docs/ad-integration/rewarded-interstitial/
 *
 * - La etiqueta del SDK se escribe en el HTML al compilar (ver vite.config.js), con
 *   VITE_MONETAG_ZONE (número de zona principal) y VITE_MONETAG_SDK_URL (el src que da el panel).
 * - show_<ZONA>() devuelve una Promise que se resuelve al CERRAR el anuncio, también si el usuario
 *   lo cerró antes de tiempo. Solo hay recompensa si result.reward_event_type === 'valued'.
 * - ymid: identificador único por anuncio (solo letras, números, - _ .). Llega en el postback.
 * Sin VITE_MONETAG_ZONE se muestra un anuncio simulado (para desarrollo y la demo).
 */
const ZONE = import.meta.env.VITE_MONETAG_ZONE;
const SDK_URL = import.meta.env.VITE_MONETAG_SDK_URL || 'https://libtl.com/sdk.js';
const fnName = ZONE ? `show_${ZONE}` : null;
let loading = null;
const preloads = new Map(); // ymid → Promise de precarga

function loadSdk() {
  if (!ZONE) return Promise.resolve();
  if (window[fnName]) return Promise.resolve();
  if (loading) return loading;
  // si la etiqueta ya viene en el HTML, esperar a que cargue; si no, agregarla
  if (!document.querySelector(`script[data-sdk="${fnName}"]`)) {
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.dataset.zone = ZONE;
    s.dataset.sdk = fnName;
    document.head.appendChild(s);
  }
  loading = new Promise((resolve, reject) => {
    let waited = 0;
    const t = setInterval(() => {
      waited += 100;
      if (window[fnName]) { clearInterval(t); resolve(); }
      else if (waited >= 10000) { clearInterval(t); loading = null; reject(adError('ad_sdk_failed', 'el SDK de Monetag no cargó')); }
    }, 100);
  });
  return loading;
}

export function preloadAds() {
  loadSdk().catch(() => {});
}

/** Precarga un anuncio para que aparezca al instante (mismo ymid que al mostrarlo). */
export function preloadAd(ymid, requestVar) {
  if (!ZONE) return Promise.resolve();
  if (!preloads.has(ymid)) {
    const p = loadSdk().then(() => window[fnName]({ type: 'preload', ymid, requestVar }));
    p.catch(() => preloads.delete(ymid));
    preloads.set(ymid, p);
  }
  return preloads.get(ymid);
}

/**
 * Muestra un anuncio con recompensa. Se resuelve solo si Monetag confirmó que se vio completo.
 * Errores: 'ad_sdk_failed' (no cargó / sin anuncios) · 'ad_not_completed' (lo cerró antes).
 */
export async function showRewardedAd(ymid, requestVar) {
  if (!ZONE) return fakeAd();
  await preloadAd(ymid, requestVar).catch(() => {}); // si la precarga falla, se intenta igual
  await loadSdk();
  let result;
  try {
    result = await window[fnName]({ ymid, requestVar });
  } catch (e) {
    throw adError('ad_sdk_failed', e?.message || e);
  } finally {
    preloads.delete(ymid);
  }
  if (result?.reward_event_type !== 'valued') {
    throw adError('ad_not_completed', result ? `reward_event_type=${result.reward_event_type}` : 'sin datos del anuncio');
  }
  return result;
}

/** Error con el detalle técnico que devolvió Monetag (sirve para el diagnóstico). */
function adError(code, detail) {
  const e = new Error(code);
  e.detail = String(detail ?? '').slice(0, 160);
  return e;
}

function fakeAd() {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'fake-ad';
    el.innerHTML = '<div><small>ANUNCIO DE PRUEBA</small><h2>📺 Aquí va el anuncio de Monetag</h2><p>Configura VITE_MONETAG_ZONE</p><b>3</b></div>';
    document.body.appendChild(el);
    let n = 3;
    const t = setInterval(() => {
      n--;
      el.querySelector('b').textContent = n;
      if (n <= 0) { clearInterval(t); el.remove(); resolve({ reward_event_type: 'valued' }); }
    }, 1000);
  });
}
