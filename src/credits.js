// アプリ（Android 版）の神託の回数。Web 版では使わない。
// ・リワード広告を1回最後まで見ると、神託を CREDITS_PER_AD 回（3回）いただける
// ・「神託をいただく」を押すたびに1回使う。残りがあるあいだは広告なしで、すぐ神託
// ・残りが0回のときは確認「広告を見ると神託を3回いただけます」→ 広告
// ・広告を読み込めない・用意できないときは、広告なしで神託を1回出す（回数は増やさない・減らさない）
// ・途中で閉じたら回数は増えない
// 回数は端末に保存（storage：{ get(key), set(key, value) }。アプリを閉じても残る。期限なし）。画面のコードとは分けてテストしやすくしている。
export const CREDITS_PER_AD = 3;
export const CREDITS_KEY = 'oracle.credits';
const MAX = 99; // 保存された値が壊れていたときの上限

export function getCredits(storage) {
  let v = null;
  try { v = storage.get(CREDITS_KEY); } catch { /* 読めなければ0回 */ }
  return Number.isInteger(v) && v >= 0 && v <= MAX ? v : 0;
}
function setCredits(storage, n) {
  try { storage.set(CREDITS_KEY, Math.max(0, Math.min(MAX, n))); } catch { /* 保存できない環境 */ }
}
export function addCredits(storage, n = CREDITS_PER_AD) { setCredits(storage, getCredits(storage) + n); return getCredits(storage); }
// 1回使う。残りが無ければ false
export function useCredit(storage) {
  const c = getCredits(storage);
  if (c <= 0) return false;
  setCredits(storage, c - 1);
  return true;
}

// 「神託をいただく」を押したときの流れ。confirm()：確認ダイアログ（true＝広告を見る）、showAd()：'rewarded'｜'cancelled'｜'unavailable'
// 戻り値：{ go: 神託を出すか, via: 'credit'（残りを使った）｜'ad'（広告を見た）｜'noad'（広告を用意できず）, reason?: 'declined'｜'cancelled' }
export async function requestOracle(storage, { confirm, showAd }) {
  if (useCredit(storage)) return { go: true, via: 'credit' };
  if (!(await confirm())) return { go: false, reason: 'declined' };
  let r = 'unavailable';
  try { r = await showAd(); } catch { r = 'unavailable'; }
  if (r === 'rewarded') { addCredits(storage, CREDITS_PER_AD); useCredit(storage); return { go: true, via: 'ad' }; }
  if (r === 'unavailable') return { go: true, via: 'noad' };
  return { go: false, reason: 'cancelled' };
}
