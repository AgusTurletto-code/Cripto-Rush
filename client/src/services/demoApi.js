// API simulada para la versión demo (VITE_DEMO=1): todo se guarda en el navegador.
// No sirve para producción: el jugador podría editar su saldo.
import { CHARACTERS } from '../game/characters.js';

const KEY = 'cryptorush-demo-v3';
const CFG = {
  coinsPerUsd: 150000, minWithdrawCoins: 150000, rateMode: 'learning', dailyCoinCap: 0, devMode: true,
  currencies: ['USDT_TON', 'TON'],
  characters: CHARACTERS,
  dailyRewards: [100, 150, 200, 300, 400, 600, 1000],
  referrals: { commission: 0.1, qualifyCoins: 1000, referrerBonus: 2000, welcomeBonus: 500 },
};
const dayStr = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
function withDaily(u) {
  const today = dayStr(), yesterday = dayStr(Date.now() - 864e5);
  const claimedToday = u.dailyLast === today;
  const streak = claimedToday || u.dailyLast === yesterday ? (u.dailyStreak || 0) : 0;
  const n = CFG.dailyRewards.length;
  u.daily = { claimedToday, streak, day: claimedToday ? ((streak - 1) % n) + 1 : (streak % n) + 1, rewards: CFG.dailyRewards };
  return u;
}

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch { /* sin storage */ }
  return s || {
    // saldo inicial para poder probar la tienda y el retiro
    user: { id: 'demo', name: 'Demo', balance: 150000, totalEarned: 0, bestDistance: 0, wallet: null, character: 'hank', owned: ['hank'], earnedToday: 0 },
    withdrawals: [],
  };
}
const state = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ } };
const fail = (code) => { throw new Error(code); };
const wait = (v) => new Promise((r) => setTimeout(() => r(structuredClone(v)), 120));
let run = null;

export const demoApi = {
  login: () => wait(withDaily(state.user)),
  config: () => wait(CFG),
  me: () => wait(withDaily(state.user)),
  claimDaily() {
    const u = withDaily(state.user);
    if (u.daily.claimedToday) fail('already_claimed');
    const streak = u.daily.streak + 1;
    const reward = CFG.dailyRewards[(streak - 1) % CFG.dailyRewards.length];
    u.balance += reward; u.dailyStreak = streak; u.dailyLast = dayStr();
    save();
    return wait({ reward, streak, user: withDaily(u) });
  },
  referrals: () => wait({
    link: 'https://t.me/TuBot/play?startapp=ref_demo', total: 2, qualified: 1, earnings: 2140,
    friends: [{ name: 'Lucía', status: 'qualified', since: Date.now() - 3 * 864e5 }, { name: 'Tomás', status: 'pending', since: Date.now() - 864e5 }],
  }),
  startRun() {
    run = { runId: 'demo-' + Date.now(), seed: (Math.random() * 2 ** 31) | 0, doubled: false, revived: false,
      multiplier: CHARACTERS[state.user.character]?.multiplier ?? 1 };
    return wait(run);
  },
  claimAd(_id, type) {
    if (type === 'double') { if (run.doubled) fail('already_doubled'); run.doubled = true; }
    else { if (run.revived) fail('already_revived'); run.revived = true; }
    return wait({ ok: true });
  },
  endRun(_id, coins, distance) {
    const u = state.user;
    const credited = Math.floor(coins * run.multiplier) * (run.doubled ? 2 : 1);
    u.balance += credited; u.totalEarned += credited; u.earnedToday += credited;
    u.bestDistance = Math.max(u.bestDistance, distance);
    save();
    return wait({ credited, capped: false, doubled: run.doubled, multiplier: run.multiplier, user: withDaily(u) });
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
  reportAdError: () => Promise.resolve(),
};
