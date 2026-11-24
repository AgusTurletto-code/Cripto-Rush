import { TonConnectUI, toUserFriendlyAddress } from '@tonconnect/ui';

let ui = null;
let listener = null;

/**
 * Monta el botón de TON Connect en el elemento `buttonRootId`.
 * `onAddress(address|null)` se llama al conectar/desconectar la wallet.
 */
export function initWallet(buttonRootId, onAddress) {
  listener = onAddress;
  if (!ui) {
    ui = new TonConnectUI({
      // El manifest debe estar publicado en tu dominio (ver client/public/tonconnect-manifest.json)
      manifestUrl: new URL('tonconnect-manifest.json', window.location.href).toString(),
      buttonRootId,
    });
    ui.uiOptions = {
      language: 'es',
      // URL de tu Mini App (t.me/TuBot/app) para volver desde la wallet
      twaReturnUrl: import.meta.env.VITE_TWA_RETURN_URL || undefined,
    };
    ui.onStatusChange((w) => listener?.(w?.account?.address || null));
  } else {
    // la pantalla se redibujó: volver a montar el botón en el nuevo elemento
    ui.uiOptions = { buttonRootId };
  }
  return ui;
}

export function friendly(address) {
  if (!address) return '';
  try { return toUserFriendlyAddress(address); } catch { return address; }
}

export const short = (a) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '');
