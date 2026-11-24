/**
 * Anuncios con recompensa de Monetag para Telegram Mini Apps.
 * Panel: https://monetag.com → crear zona "Rewarded Interstitial" para Telegram Mini App.
 * El SDK expone una función global show_<ZONE_ID>() que devuelve una Promise:
 *   - se resuelve cuando el usuario terminó de ver el anuncio → dar recompensa
 *   - se rechaza si falló o no había anuncio
 * Si no hay VITE_MONETAG_ZONE configurado se muestra un anuncio simulado (para desarrollo).
 */
const ZONE = import.meta.env.VITE_MONETAG_ZONE;
const fnName = ZONE ? `show_${ZONE}` : null;
let loading = null;

function loadSdk() {
  if (!ZONE) return Promise.resolve();
  if (window[fnName]) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://libtl.com/sdk.js';
    s.dataset.zone = ZONE;
    s.dataset.sdk = fnName;
    s.onload = () => resolve();
    s.onerror = () => { loading = null; reject(new Error('ad_sdk_failed')); };
    document.head.appendChild(s);
  });
  return loading;
}

export function preloadAds() {
  loadSdk().catch(() => {});
}

/** Muestra un anuncio. ymid identifica la recompensa (se usa en el postback de Monetag). */
export async function showRewardedAd(ymid) {
  if (!ZONE) return fakeAd();
  await loadSdk();
  const show = window[fnName];
  if (typeof show !== 'function') throw new Error('ad_sdk_failed');
  await show({ ymid });
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
      if (n <= 0) { clearInterval(t); el.remove(); resolve(); }
    }, 1000);
  });
}
