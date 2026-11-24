// API simulada para la versión demo (VITE_DEMO=1): todo se guarda en el navegador.
// No sirve para producción: el jugador podría editar su saldo.
const KEY = 'cryptorush-demo';
const CFG = {
  coinsPerUsd: 20000, minWithdrawCoins: 40000, dailyCoinCap: 6000, devMode: true,
  currencies: ['USDT_TON', 'TON'],
  characters: { hank: { price: 0 }, muskrat: { price: 15000 }, thump: { price: 15000 }, satoshi: { price: 30000 } },
};

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch { /* sin storage */ }
  return s || {
    // saldo inicial para poder probar la tienda y el retiro
    user: { id: 'demo', name: 'Demo', balance: 45000, totalEarned: 0, bestDistance: 0, wallet: null, character: 'hank', owned: ['hank'], earnedToday: 0 },
    withdrawals: [],
  };
}
const state = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ } };
const fail = (code) => { throw new Error(code); };
const wait = (v) => new Promise((r) => setTimeout(() => r(structuredClone(v)), 120));
let run = null;

export const demoApi = {
  login: () => wait(state.user),
  config: () => wait(CFG),
  me: () => wait(state.user),
  startRun() { run = { runId: 'demo-' + Date.now(), seed: (Math.random() * 2 ** 31) | 0, doubled: false, revived: false }; return wait(run); },
  claimAd(_id, type) {
    if (type === 'double') { if (run.doubled) fail('already_doubled'); run.doubled = true; }
    else { if (run.revived) fail('already_revived'); run.revived = true; }
    return wait({ ok: true });
  },
  endRun(_id, coins, distance) {
    const u = state.user;
    const gross = run.doubled ? coins * 2 : coins;
    const credited = Math.max(0, Math.min(gross, CFG.dailyCoinCap - u.earnedToday));
    u.balance += credited; u.totalEarned += credited; u.earnedToday += credited;
    u.bestDistance = Math.max(u.bestDistance, distance);
    save();
    return wait({ credited, capped: credited < gross, doubled: run.doubled, user: u });
  },
  buyCharacter(id) {
    const u = state.user;
    if (!u.owned.includes(id)) {
      if (u.balance < CFG.characters[id].price) fail('not_enough_coins');
      u.balance -= CFG.characters[id].price; u.owned.push(id);
    }
    u.character = id; save();
    return wait(u);
  },
  setWallet(address) { state.user.wallet = address; save(); return wait(state.user); },
  withdraw(coins, currency) {
    const u = state.user;
    if (coins < CFG.minWithdrawCoins) fail('below_minimum');
    if (!u.wallet) fail('no_wallet');
    if (u.balance < coins) fail('not_enough_coins');
    u.balance -= coins;
    const usdCents = Math.floor((coins / CFG.coinsPerUsd) * 100);
    state.withdrawals.unshift({ id: Date.now(), coins, usd_cents: usdCents, currency, status: 'pending', created_at: Date.now() });
    save();
    return wait({ ok: true, usdCents, user: u });
  },
  withdrawals: () => wait(state.withdrawals),
};
