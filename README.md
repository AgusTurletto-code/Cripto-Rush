# 🚀 Crypto Rush

Endless runner 3D con temática cripto/política para **Telegram Mini Apps**.
Los jugadores juntan monedas, las duplican o reviven con **anuncios con recompensa de Monetag**
y las canjean por **USDT o TON** en su wallet.

```
crypto-rush/
├── shared/characters.json  # catálogo de personajes (precio y multiplicador)
├── client/                 # Juego (Vite + Three.js + TON Connect)
│   ├── src/game/           # motor: world.js (pista), game.js (física), characters.js
│   ├── src/services/       # api, anuncios Monetag, Telegram, wallet
│   ├── src/ui/style.css
│   └── public/tonconnect-manifest.json
└── server/                 # API (Node 22 + Express + SQLite integrado)
    └── src/
        ├── index.js        # rutas
        ├── auth.js         # validación de Telegram initData
        ├── game.js         # anti-trampas y personajes
        ├── config.js       # economía y reglas (todo configurable por .env)
        └── admin.html      # panel de retiros en /admin
```

## Cómo se juega

| Acción | Celular | PC |
|---|---|---|
| Cambiar de carril | deslizar ⬅️ ➡️ | ← → / A D |
| Saltar (velas rojas, RUG PULL) | deslizar ⬆️ | ↑ / W / espacio |
| Deslizarse (TAX AUDIT, dron de la SEC) | deslizar ⬇️ | ↓ / S |
| Oso bajista / muro CRASH | hay que esquivarlos de carril | |

Power-ups: 🐋 Ballena imán · 🚀 To the Moon (vuelo) · 🛡️ Escudo HODL.

### Personajes y multiplicadores

Cada personaje multiplica las monedas de la partida. El catálogo vive en **`shared/characters.json`**
y lo usan tanto el juego como el servidor (el servidor es el que aplica el multiplicador al cobrar).

| Personaje | Precio | Multiplicador |
|---|---|---|
| Hodl Hank | gratis | x1 |
| Elon Muskrat | 15 000 | x1,2 |
| Donald Thump | 15 000 | x1,2 |
| Pepe Trader | 25 000 | x1,3 |
| Bruno Bull | 40 000 | x1,5 |
| Captain Shiba | 60 000 | x1,75 |
| Satoshi Nakamochi | 100 000 | x2 |

**Agregar un personaje nuevo:**
1. Sumá una entrada en `shared/characters.json` (`name`, `desc`, `price`, `multiplier`).
2. Agregá su modelo en `BUILDERS` dentro de `client/src/game/characters.js` (mismo id). Si no tiene modelo, usa el de Hodl Hank.
3. Compilá el cliente y reiniciá el servidor. La tienda, las miniaturas y el cálculo de monedas se actualizan solos.

> Pepe Trader es una rana con diseño propio. La rana "Pepe" original tiene derechos de autor:
> no copies su cara ni uses imágenes del meme.

## Probarlo en tu computadora

Necesitas **Node.js 22.13 o superior**.

```bash
cd client && npm install && npm run build
```

```bash
cd server && npm install && npm run dev
```

Abre http://localhost:3000. Con `npm run dev`, el servidor arranca con `DEV_MODE=1`: puedes jugar sin Telegram y los anuncios son simulados.
Si vas a modificar el juego, corre también `cd client && npm run dev` (http://localhost:5173, con recarga automática).

## Publicar en Railway

El repo incluye un `Dockerfile`: Railway lo detecta solo.

1. En [railway.com](https://railway.com) → **New Project** → **Deploy from GitHub repo** → elegí este repositorio.
2. En el servicio → **Variables**, cargá:

   | Variable | Valor |
   |---|---|
   | `BOT_TOKEN` | el token de @BotFather |
   | `SESSION_SECRET` | una cadena larga al azar |
   | `ADMIN_KEY` | tu clave para el panel `/admin` |
   | `DB_PATH` | `/data/cryptorush.db` |
   | `VITE_MONETAG_ZONE` | número de zona de Monetag (cuando lo tengas) |
   | `VITE_TWA_RETURN_URL` | `https://t.me/TuBot/app` (cuando crees la Mini App) |
   | `BOT_USERNAME` | usuario del bot sin @ (para los links de invitación) |
   | `MINI_APP_NAME` | short name de la Mini App (por defecto `play`) |
   | `LEGAL_OWNER` | tu nombre o el de tu empresa (aparece en los términos) |
   | `LEGAL_COUNTRY` | país cuya ley rige los términos |
   | `LEGAL_CONTACT` | contacto para soporte y privacidad (usuario de Telegram o email) |

3. Click derecho en el servicio → **Attach Volume** → montalo en `/data` (ahí se guarda la base de datos; sin esto se pierde en cada deploy).
4. **Settings → Networking → Generate Domain**: te da una URL `https://algo.up.railway.app`.
5. Cada vez que subas cambios a GitHub, Railway vuelve a publicar solo.

## Publicarlo en Telegram (paso a paso)

1. **Crea el bot:** en Telegram habla con [@BotFather](https://t.me/BotFather), usa `/newbot` y guarda el token.
2. **Sube el servidor a internet con HTTPS.** Sirven Railway, Render, Fly.io o un VPS. Ten en cuenta que:
   - Debe tener disco persistente para la base de datos (`DB_PATH`).
   - Comandos: `cd client && npm ci && npm run build`, después `cd server && npm ci && npm start`.
3. **Configura `server/.env`** (copia `.env.example`):
   - `BOT_TOKEN`: el token de BotFather.
   - `SESSION_SECRET`: genera uno con `openssl rand -hex 32`.
   - `ADMIN_KEY`: tu clave para el panel `/admin`.
   - `DEV_MODE=0`. **Nunca lo pongas en 1 en producción**: cualquiera podría entrar sin Telegram.
4. **Crea la Mini App:** en BotFather usa `/newapp`, elige tu bot y pon la URL de tu servidor. Te da un enlace del tipo `https://t.me/TuBot/app`.
5. **TON Connect:** edita `client/public/tonconnect-manifest.json` con tu dominio real y sube un `icon.png` (180×180) a `client/public/`.
6. **Monetag** ([guía oficial](https://docs.monetag.com/docs/ad-integration/getting-sdk-tag/)):
   - En Monetag → pestaña **Telegram Mini Apps** → cargá el nombre y el link de la app (`https://t.me/TuBot/play`) → **Add and Continue**.
   - Tocá **< > Get SDK** y después **Get instructions**: te muestra una etiqueta como
     `<script src="https://XXXX/sdk.js" data-zone="1234567" data-sdk="show_1234567"></script>`.
   - **No la pegues a mano.** En Railway cargá `VITE_MONETAG_ZONE=1234567` y `VITE_MONETAG_SDK_URL=https://XXXX/sdk.js`
     (los valores exactos de tu etiqueta). Railway recompila y la etiqueta queda en el HTML del juego.
   - **Postback (obligatorio para pagar recompensas de forma segura):** en los ajustes de la zona principal de Monetag,
     campo **Postback URL**, pegá:
     ```
     https://TU-DOMINIO/api/ads/postback?secret=TU_SECRETO&ymid={ymid}&event_type={event_type}&reward_event_type={reward_event_type}&telegram_id={telegram_id}&estimated_price={estimated_price}
     ```
     y en Railway cargá `AD_POSTBACK_SECRET=TU_SECRETO` (el mismo valor, largo y al azar). Con eso el servidor
     solo da el revivir / x2 si Monetag confirma que el anuncio se vio completo y pagó (`valued`).
   - El panel `/admin` muestra los ingresos estimados que informa Monetag al lado de lo que pagás en retiros.

## Recompensa diaria, referidos y cuentas múltiples

- **Diario:** días 1 a 7 dan `100, 150, 200, 300, 400, 600, 1000` monedas (`DAILY_REWARDS`). Si un día no entra, la racha vuelve a 1.
- **Referidos:** link `https://t.me/BOT_USERNAME/MINI_APP_NAME?startapp=ref_<id>`. Cuando el amigo gana `REF_QUALIFY_COINS`
  (1000) jugando, quien invitó recibe `REF_BONUS` (2000) y el amigo `REF_WELCOME` (500). Después, quien invitó gana
  `REF_COMMISSION` (10 %) de lo que gane el amigo en partidas, para siempre (lo pone la casa, no se le descuenta al amigo).
- **Cuentas múltiples:** el servidor guarda un id por dispositivo, una huella del teléfono y la IP de cada cuenta.
  - Una wallet TON solo puede estar en una cuenta (se compara la dirección real, sin importar si es `EQ…` o `UQ…`).
  - Un referido desde el mismo teléfono o con la misma wallet que quien lo invitó queda **bloqueado** (no paga nada).
  - El panel `/admin` muestra en cada retiro las cuentas vinculadas (mismo teléfono / wallet / IP) y permite suspenderlas.
  - La IP es una señal débil (familias, wifi público y datos móviles comparten IP): revisala, no rechaces solo por eso.

## Términos y privacidad

- Se ven en el juego (link en el menú, la ruleta y los retiros) y en `https://TU-DOMINIO/terms` (`?lang=es` o `?lang=en`).
- El texto (`server/src/legal.js`) usa los valores reales: tasa, retiro mínimo, diario, referidos y probabilidades de la ruleta.
- Los jugadores los aceptan al entrar (18+). Sin aceptarlos no pueden girar la ruleta ni retirar.
- Si cambiás el texto, actualizá `TERMS_VERSION` en `legal.js`: todos tendrán que volver a aceptarlos.
- ⚠️ Es una base razonable, no asesoramiento legal: hacelos revisar por un abogado de tu país antes de lanzar fuerte.

## Avisos del bot

El bot le escribe por Telegram a quien lo autorizó (permiso oficial de Telegram que el juego pide después de cobrar la primera partida, o con el botón 🔔 del menú). Usa el mismo `BOT_TOKEN`; el botón de cada mensaje abre `t.me/BOT_USERNAME/MINI_APP_NAME`.

| Aviso | Cuándo | Límite |
|---|---|---|
| 🎁 Recompensa diaria / 🔥 racha por cortarse | no entra hace 20 h (y jugó en los últimos 14 días) | 1 recordatorio cada 20 h |
| 🎡 Giros de la ruleta listos | se recargan después de gastar los 10 | idem |
| ✅ Retiro pagado / ❌ rechazado | al marcarlo en `/admin` (incluye el hash o el motivo) | siempre |
| 🎉 Amigo activado | cuando un invitado califica | siempre |
| 😱 Superaron tu récord | un amigo (quien te invitó o tus invitados) te pasa | 1 cada 6 h |

- Los recordatorios se revisan cada 10 minutos (`server/src/notify.js`).
- Si alguien bloquea el bot, no se le vuelve a escribir. Cada jugador puede apagarlos con 🔔.
- En `/admin` hay un cuadro para **mandar un anuncio a todos** (usalo poco).

## Cajas Cripto

- Aparecen en la pista cada 400–900 m (`shared/boxes.js`); hay que estar en su carril para agarrarlas.
- La posición de cada caja sale de la semilla de la partida: el servidor recalcula las cajas del recorrido y **solo acepta las que existían** antes de la distancia alcanzada (máx. 10 por partida).
- Se abren al terminar la partida (o después, desde el menú). El premio lo sortea el servidor: 100 (40 %), 250 (30 %), 500 (18 %), 1.000 (9 %) o 2.500 (3 %) monedas; promedio ~370.

## Ruleta

- Hasta `spinsPer24h` (10) giros cada 24 h (ventana móvil), y **cada giro requiere ver un anuncio**.
- Los premios y sus probabilidades están en **`shared/wheel.json`** (`weight` sobre el total; hoy suma 1.000.000).
- Premio mayor: **`jackpotUsd` (100 USD) con probabilidad 1 en 1.000.000**. Costo esperado: ~$0,0001 por giro.
- El sorteo lo hace el servidor con un generador criptográfico; el juego solo anima hasta el resultado.
- Monedas y premio mayor se entregan **solo cuando Monetag confirma el anuncio** (postback). Si tarda, el giro sale igual y el premio llega al confirmarse.
- El premio mayor crea un **retiro pendiente de 100 USD** marcado como 🏆 en el panel `/admin`: revisá todo (cuentas vinculadas, partidas, anuncios) antes de pagar.
- Si cambiás las probabilidades, el juego las muestra solas en la pantalla de la ruleta.

## Economía y pagos

### Tasa automática (monedas por dólar)
El servidor recalcula cada hora cuántas monedas valen 1 USD (`server/src/economy.js`):

```
monedas por USD = monedas repartidas en 7 días / (ingresos de anuncios en 7 días × REVENUE_SHARE)
```

- **Ingresos:** lo que informa Monetag en cada postback (`estimated_price`).
- **Monedas repartidas:** partidas + diario + referidos − lo gastado en personajes.
- Así siempre vuelve a los jugadores el `REVENUE_SHARE` (40 %) de lo que ganás, aunque cambie el CPM.
- Mientras haya menos de `RATE_MIN_REVENUE` (1 USD) de ingresos, usa la tasa inicial `COINS_PER_USD` (modo *aprendiendo*).
- La tasa cambia como mucho `RATE_MAX_DAILY_CHANGE` (±20 %) por día: nada de saltos.
- El retiro mínimo es en dólares (`MIN_WITHDRAW_USD`, 1 USD) y cada retiro usa la tasa del momento.
- `RATE_MODE=fixed` vuelve a una tasa fija (`COINS_PER_USD`).
- El panel `/admin` muestra la tasa, el modo y los datos con que se calculó.

### Velocidad
La curva está en `shared/speed.js` (la usan el juego y el antitrampas del servidor):
sube rápido al principio y cada vez más despacio hasta acercarse al tope (14 → ~25 al minuto → ~31 a los 2 min → ~38 a los 5 min, tope 40).
Al revivir, la velocidad baja un poco para poder retomar.

### Cómo se pagan los retiros

1. El jugador conecta su wallet TON y pide el retiro. Las monedas se descuentan y el retiro queda **pendiente**.
2. Tú entras a `https://TU-DOMINIO/admin` con tu `ADMIN_KEY`.
3. Revisas las señales de alerta: cuánto ganó en total y si tiene partidas rechazadas por trampa.
4. Envías el USDT o TON desde tu wallet y lo marcas como **pagado** (opcionalmente con el hash de la transacción).
   Si lo **rechazas**, las monedas vuelven al jugador.

Los pagos son manuales a propósito. Automatizarlos sin experiencia en anti-fraude es la forma más rápida de que te vacíen la wallet.

## Seguridad anti-trampas (lo que ya hace)

- El usuario se identifica con la **firma de Telegram** (`initData`), así que no se puede falsificar el ID.
- El saldo vive **solo en el servidor**. El cliente nunca puede modificarlo directamente.
- Cada partida tiene un ID y una semilla que da el servidor. Al terminar se verifica que:
  - la distancia sea físicamente posible para el tiempo real transcurrido;
  - las monedas no superen las que existen en esa distancia.
- Solo se puede revivir y duplicar una vez por partida, cada una con su anuncio. Hay límites diarios.
- Las partidas rechazadas quedan registradas y se ven en el panel admin.

**Pendiente para más adelante:** reproducir la partida completa en el servidor (mandando los movimientos del jugador),
detectar cuentas múltiples por dispositivo e IP, y un sistema de referidos.

## ⚠️ Antes de lanzar

- **Términos de Monetag:** confirma que permiten que los usuarios ganen dinero real con monedas que se obtienen en parte por ver anuncios. Si es "tráfico incentivado" prohibido, pueden retenerte los pagos.
- **Personajes paródicos:** los nombres y diseños están alterados a propósito. No uses fotos, caras reales ni los nombres verdaderos.
- **Legal e impuestos:** pagar dinero a usuarios puede tener obligaciones fiscales o de KYC según tu país y el del jugador. Consulta con un contador o abogado.
- **Reglas compartidas:** si cambias la física en `client/src/game/rules.js`, cambia también `RULES` en `server/src/config.js`. Si no coinciden, el servidor rechaza partidas legítimas o acepta trampas.
