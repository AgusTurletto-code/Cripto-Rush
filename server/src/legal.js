// Términos y condiciones + política de privacidad.
// El texto usa los valores reales de la configuración (tasa, mínimos, premios, probabilidades),
// así nunca queda desactualizado. Los datos del responsable salen de variables de entorno.
import { config } from './config.js';
import { rate, minWithdrawCoins, economyState } from './economy.js';
import { publicWheel } from './wheel.js';

// Cambiá esta fecha cuando modifiques el texto: los jugadores tendrán que volver a aceptarlos.
export const TERMS_VERSION = '2026-11-24';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function data(lang) {
  const loc = lang === 'es' ? 'es' : 'en-US';
  const n = (v) => Number(v).toLocaleString(loc);
  const w = publicWheel();
  const odds = w.segments.filter((s) => !s.jackpot).reduce((m, s) => m.set(s.coins, (m.get(s.coins) || 0) + s.odds), new Map());
  const jackpot = w.segments.find((s) => s.jackpot);
  const r = config.referrals;
  return {
    owner: esc(process.env.LEGAL_OWNER || (lang === 'es' ? '[NOMBRE DEL RESPONSABLE]' : '[OPERATOR NAME]')),
    country: esc(process.env.LEGAL_COUNTRY || (lang === 'es' ? '[PAÍS]' : '[COUNTRY]')),
    contact: esc(process.env.LEGAL_CONTACT || (lang === 'es' ? '[CONTACTO: usuario de Telegram o email]' : '[CONTACT: Telegram username or email]')),
    minAge: Number(process.env.LEGAL_MIN_AGE || 18),
    rate: n(rate()), minCoins: n(minWithdrawCoins()), minUsd: config.economy.minWithdrawUsd,
    share: Math.round(config.economy.revenueShare * 100), maxChange: Math.round(config.economy.maxDailyChange * 100),
    rateMode: economyState().mode,
    daily: config.economy.dailyRewards.map(n).join(', '),
    ref: { q: n(r.qualifyCoins), bonus: n(r.referrerBonus), welcome: n(r.welcomeBonus), pct: Math.round(r.commission * 100) },
    spins: w.spinsPer24h, jackpotUsd: w.jackpotUsd, jackpotOdds: jackpot ? n(Math.round(1 / jackpot.odds)) : '-',
    oddsRows: [...odds.entries()].sort((a, b) => a[0] - b[0])
      .map(([c, p]) => `<tr><td>${n(c)}</td><td>${(p * 100).toLocaleString(loc, { maximumFractionDigits: 3 })}%</td></tr>`).join(''),
    perDay: config.economy.maxWithdrawalsPerDay,
  };
}

const ES = (d) => `
<h1>Términos y condiciones</h1>
<p class="meta">Versión ${TERMS_VERSION}</p>

<h2>1. Quiénes somos</h2>
<p>Crypto Rush es un juego para Telegram operado por ${d.owner}, con domicilio en ${d.country}. Contacto: ${d.contact}.</p>

<h2>2. Aceptación y edad mínima</h2>
<p>Al usar Crypto Rush aceptás estos términos y la política de privacidad. Tenés que tener al menos <b>${d.minAge} años</b>, o la mayoría de edad de tu país si es mayor. Se permite <b>una sola cuenta por persona</b>.</p>

<h2>3. Las monedas</h2>
<p>Las monedas son puntos virtuales del juego. <b>No son una criptomoneda, ni dinero, ni una inversión</b>, y no generan intereses. Solo se pueden usar dentro del juego o canjear según la sección 5. Las monedas no se pueden transferir a otras cuentas.</p>

<h2>4. Cómo se ganan monedas</h2>
<ul>
<li><b>Partidas:</b> las monedas que juntás, multiplicadas por el multiplicador del personaje que usás.</li>
<li><b>Anuncios:</b> podés revivir una vez por partida o duplicar las monedas de una partida mirando un anuncio completo. La recompensa se entrega cuando el proveedor de anuncios confirma que se vio.</li>
<li><b>Recompensa diaria:</b> ${d.daily} monedas (días 1 a 7). Si un día no entrás, la racha vuelve al día 1.</li>
<li><b>Referidos:</b> cuando un amigo invitado junta ${d.ref.q} monedas jugando, quien invitó recibe ${d.ref.bonus} y el amigo ${d.ref.welcome}. Después, quien invitó recibe un ${d.ref.pct}% adicional de lo que gane el amigo en partidas. Las invitaciones a uno mismo (misma persona, dispositivo o wallet) no cuentan.</li>
<li><b>Ruleta:</b> ver sección 7.</li>
</ul>

<h2>5. Tasa de canje</h2>
<p>La cantidad de monedas que equivale a 1 USD <b>se ajusta automáticamente</b> según lo que el juego gana con anuncios: se devuelve a los jugadores aproximadamente el ${d.share}% de esos ingresos. La tasa puede cambiar como máximo un ${d.maxChange}% por día. <b>Tasa actual: ${d.rate} monedas = 1 USD.</b> Se usa la tasa vigente al momento de pedir el retiro. Como la tasa cambia, el valor en dólares de tu saldo también puede cambiar.</p>

<h2>6. Retiros</h2>
<ul>
<li>Retiro mínimo: ${d.minUsd} USD (hoy ${d.minCoins} monedas). Máximo ${d.perDay} retiro(s) por día.</li>
<li>Se pagan en USDT o TON en la red TON, a la wallet que conectes. Una wallet solo puede estar asociada a una cuenta.</li>
<li>Todos los retiros se <b>revisan manualmente</b> para prevenir fraudes. Normalmente se pagan en 24–72 h, pero la revisión puede demorar más.</li>
<li>Verificá tu wallet: los envíos a una dirección equivocada no se pueden revertir.</li>
<li>Podemos rechazar un retiro si detectamos fraude o incumplimiento de estos términos. Si el rechazo no se debe a fraude, las monedas vuelven a tu saldo.</li>
</ul>

<h2>7. Ruleta y premio mayor</h2>
<p>Podés girar la ruleta hasta <b>${d.spins} veces cada 24 horas</b>. Cada giro requiere ver un anuncio completo. <b>No es necesario pagar ni comprar nada para participar.</b> El resultado lo decide nuestro servidor con un generador aleatorio. Probabilidades de cada giro:</p>
<table><tr><th>Premio (monedas)</th><th>Probabilidad</th></tr>${d.oddsRows}
<tr><td><b>${d.jackpotUsd} USD en USDT (red TON)</b></td><td><b>1 en ${d.jackpotOdds}</b></td></tr></table>
<p>El premio mayor solo se entrega si el anuncio fue confirmado por el proveedor y la cuenta pasa una revisión anti-fraude. Se paga en USDT en la red TON a la wallet del ganador, dentro de los 7 días posteriores a la verificación. Las probabilidades pueden cambiar; las vigentes se muestran siempre en la pantalla de la ruleta. <b>La participación en el premio mayor no es válida donde la ley lo prohíba</b>: si en tu país los sorteos con premios en dinero están prohibidos o requieren autorización, no participes del premio mayor.</p>

<h2>8. Anuncios</h2>
<p>Los anuncios los muestra un proveedor externo. Está prohibido generar vistas o clics falsos, automatizados o con fines de fraude.</p>

<h2>9. Conductas prohibidas</h2>
<p>Está prohibido: usar bots, scripts o emuladores para jugar o ver anuncios; tener más de una cuenta; invitarse a sí mismo; modificar el juego o sus datos; aprovechar errores en lugar de reportarlos. Si detectamos estas conductas podemos <b>suspender la cuenta y anular sus monedas, premios y retiros pendientes</b>.</p>

<h2>10. Personajes</h2>
<p>Los personajes son parodias y caricaturas con fines humorísticos. No tienen relación ni afiliación con personas reales.</p>

<h2>11. Cambios y disponibilidad</h2>
<p>El juego se ofrece "tal cual". Podemos cambiar las recompensas, la tasa, los premios o estas reglas, y vamos a publicar la versión nueva en el juego. Si decidimos cerrar el juego o el programa de canje, avisaremos con al menos 30 días para que puedas retirar los saldos que superen el mínimo.</p>

<h2>12. Responsabilidad e impuestos</h2>
<p>No somos responsables por pérdidas derivadas de errores en la wallet indicada, fallas de la red blockchain o interrupciones del servicio. Cada jugador es responsable de los impuestos que correspondan en su país por lo que recibe.</p>

<h2>13. Ley aplicable</h2>
<p>Estos términos se rigen por las leyes de ${d.country}.</p>

<h1 id="privacy">Política de privacidad</h1>
<h2>Qué datos usamos</h2>
<ul>
<li><b>De Telegram:</b> tu ID, nombre, usuario e idioma.</li>
<li><b>Del juego:</b> partidas, monedas, compras de personajes, recompensas, invitaciones, giros y retiros.</li>
<li><b>Wallet:</b> la dirección TON que conectes.</li>
<li><b>Prevención de fraude:</b> un identificador guardado en tu dispositivo, una huella técnica del dispositivo (modelo de pantalla, idioma, zona horaria, tipo de GPU) y tu dirección IP.</li>
<li><b>Anuncios:</b> el proveedor de anuncios recibe tu ID de Telegram y datos técnicos según su propia política de privacidad.</li>
</ul>
<h2>Para qué</h2>
<p>Para que el juego funcione, pagar retiros y premios, detectar fraudes y cuentas múltiples, y medir el rendimiento del juego. <b>No vendemos tus datos.</b></p>
<h2>Con quién se comparten</h2>
<p>Con los proveedores necesarios para funcionar: Telegram, el proveedor de anuncios, el servicio de hosting y la red TON (las transacciones en blockchain son públicas).</p>
<h2>Cuánto tiempo y tus derechos</h2>
<p>Guardamos los datos mientras tu cuenta exista y el tiempo necesario para prevenir fraudes y cumplir obligaciones legales. Podés pedir acceso o borrado de tus datos escribiendo a ${d.contact}. Borrar la cuenta implica perder las monedas.</p>
`;

const EN = (d) => `
<h1>Terms and conditions</h1>
<p class="meta">Version ${TERMS_VERSION}</p>

<h2>1. Who we are</h2>
<p>Crypto Rush is a Telegram game operated by ${d.owner}, based in ${d.country}. Contact: ${d.contact}.</p>

<h2>2. Acceptance and minimum age</h2>
<p>By using Crypto Rush you accept these terms and the privacy policy. You must be at least <b>${d.minAge} years old</b>, or the age of majority in your country if higher. <b>One account per person</b>.</p>

<h2>3. Coins</h2>
<p>Coins are virtual in-game points. <b>They are not a cryptocurrency, money or an investment</b>, and they earn no interest. They can only be used in the game or redeemed as described in section 5. Coins cannot be transferred between accounts.</p>

<h2>4. How to earn coins</h2>
<ul>
<li><b>Runs:</b> the coins you collect, multiplied by your character's multiplier.</li>
<li><b>Ads:</b> you can revive once per run or double a run's coins by watching a full ad. The reward is granted when the ad provider confirms the view.</li>
<li><b>Daily reward:</b> ${d.daily} coins (days 1 to 7). Missing a day resets the streak to day 1.</li>
<li><b>Referrals:</b> when an invited friend earns ${d.ref.q} coins playing, the inviter gets ${d.ref.bonus} and the friend ${d.ref.welcome}. After that, the inviter gets an extra ${d.ref.pct}% of what the friend earns in runs. Self-invitations (same person, device or wallet) do not count.</li>
<li><b>Wheel:</b> see section 7.</li>
</ul>

<h2>5. Exchange rate</h2>
<p>The number of coins worth 1 USD <b>adjusts automatically</b> to what the game earns from ads: roughly ${d.share}% of that revenue goes back to players. The rate can change by at most ${d.maxChange}% per day. <b>Current rate: ${d.rate} coins = 1 USD.</b> The rate at the time you request a withdrawal applies. Because the rate changes, the dollar value of your balance can change too.</p>

<h2>6. Withdrawals</h2>
<ul>
<li>Minimum withdrawal: ${d.minUsd} USD (currently ${d.minCoins} coins). Up to ${d.perDay} withdrawal(s) per day.</li>
<li>Paid in USDT or TON on the TON network to the wallet you connect. A wallet can only be linked to one account.</li>
<li>All withdrawals are <b>reviewed manually</b> to prevent fraud. They are usually paid within 24–72 h, but reviews can take longer.</li>
<li>Check your wallet: transfers to a wrong address cannot be reversed.</li>
<li>We may reject a withdrawal if we detect fraud or a breach of these terms. If the rejection is not due to fraud, the coins return to your balance.</li>
</ul>

<h2>7. Wheel and jackpot</h2>
<p>You can spin the wheel up to <b>${d.spins} times every 24 hours</b>. Each spin requires watching a full ad. <b>No payment or purchase is needed to take part.</b> Our server decides the result with a random generator. Odds per spin:</p>
<table><tr><th>Prize (coins)</th><th>Odds</th></tr>${d.oddsRows}
<tr><td><b>${d.jackpotUsd} USD in USDT (TON network)</b></td><td><b>1 in ${d.jackpotOdds}</b></td></tr></table>
<p>The jackpot is only awarded if the ad was confirmed by the provider and the account passes an anti-fraud review. It is paid in USDT on the TON network to the winner's wallet within 7 days after verification. Odds may change; the current ones are always shown on the wheel screen. <b>The jackpot is void where prohibited by law</b>: if cash-prize draws are banned or require a license in your country, do not take part in the jackpot.</p>

<h2>8. Ads</h2>
<p>Ads are shown by a third-party provider. Generating fake, automated or fraudulent views or clicks is forbidden.</p>

<h2>9. Prohibited behavior</h2>
<p>It is forbidden to: use bots, scripts or emulators to play or watch ads; have more than one account; invite yourself; modify the game or its data; exploit bugs instead of reporting them. If we detect this we may <b>suspend the account and void its coins, prizes and pending withdrawals</b>.</p>

<h2>10. Characters</h2>
<p>Characters are parodies and caricatures for humor. They have no relation to or affiliation with real people.</p>

<h2>11. Changes and availability</h2>
<p>The game is provided "as is". We may change rewards, the rate, prizes or these rules, and will publish the new version in the game. If we close the game or the redemption program, we will give at least 30 days' notice so you can withdraw balances above the minimum.</p>

<h2>12. Liability and taxes</h2>
<p>We are not liable for losses caused by a wrong wallet address, blockchain network failures or service interruptions. Each player is responsible for any taxes due in their country on what they receive.</p>

<h2>13. Governing law</h2>
<p>These terms are governed by the laws of ${d.country}.</p>

<h1 id="privacy">Privacy policy</h1>
<h2>What data we use</h2>
<ul>
<li><b>From Telegram:</b> your ID, name, username and language.</li>
<li><b>Game data:</b> runs, coins, character purchases, rewards, invites, spins and withdrawals.</li>
<li><b>Wallet:</b> the TON address you connect.</li>
<li><b>Fraud prevention:</b> an identifier stored on your device, a technical device fingerprint (screen, language, time zone, GPU type) and your IP address.</li>
<li><b>Ads:</b> the ad provider receives your Telegram ID and technical data under its own privacy policy.</li>
</ul>
<h2>Why</h2>
<p>To run the game, pay withdrawals and prizes, detect fraud and multiple accounts, and measure the game's performance. <b>We do not sell your data.</b></p>
<h2>Who we share it with</h2>
<p>With the providers needed to operate: Telegram, the ad provider, the hosting service and the TON network (blockchain transactions are public).</p>
<h2>Retention and your rights</h2>
<p>We keep data while your account exists and as long as needed to prevent fraud and meet legal obligations. You can request access to or deletion of your data by writing to ${d.contact}. Deleting the account means losing your coins.</p>
`;

/** Fragmento HTML (para mostrar dentro del juego). */
export function legalHtml(lang) {
  const l = lang === 'es' ? 'es' : 'en';
  return (l === 'es' ? ES : EN)(data(l));
}

/** Página completa (para abrir desde un navegador). */
export function legalPage(lang) {
  const l = lang === 'es' ? 'es' : 'en';
  return `<!doctype html><html lang="${l}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Crypto Rush · ${l === 'es' ? 'Términos y privacidad' : 'Terms and privacy'}</title>
<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:0 auto;padding:16px 16px 48px;line-height:1.55;background:#0a0e1f;color:#e8ecf8}
h1{color:#ffc531;margin-top:36px}h2{margin-top:26px;font-size:18px}.meta{color:#9aa4c7}a{color:#4cc9f0}
table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #2a3150;padding:6px;text-align:left}</style></head>
<body>${legalHtml(l)}</body></html>`;
}
