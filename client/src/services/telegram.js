// Integración con Telegram Mini Apps (https://core.telegram.org/bots/webapps)
export const tg = window.Telegram?.WebApp;

export function initTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  // clave para juegos con gestos: que deslizar hacia abajo no cierre la app
  tg.disableVerticalSwipes?.();
  tg.setHeaderColor?.('#0a0e1f');
  tg.setBackgroundColor?.('#0a0e1f');
}

export const initData = () => tg?.initData || '';

/** ¿Se puede pedir permiso para que el bot nos escriba? (Telegram 6.9+) */
export const canAskWriteAccess = () => !!tg?.requestWriteAccess && (tg.isVersionAtLeast?.('6.9') ?? true);

/** Pide a Telegram que el bot pueda escribirle al jugador. Resuelve true si lo autorizó. */
export function requestWriteAccess() {
  return new Promise((resolve) => {
    if (!canAskWriteAccess()) return resolve(false);
    try { tg.requestWriteAccess((granted) => resolve(!!granted)); } catch { resolve(false); }
  });
}

export function haptic(kind = 'light') {
  try {
    if (kind === 'error' || kind === 'success') tg?.HapticFeedback?.notificationOccurred(kind);
    else tg?.HapticFeedback?.impactOccurred(kind);
  } catch { /* fuera de Telegram */ }
}
