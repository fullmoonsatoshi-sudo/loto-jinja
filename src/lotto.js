// 計算まわり（照合・統計・神託・かぶりにくさ指数）。画面のコードとは分けて、テストしやすくしている。

// type：loto（数字をえらぶ）／bingo（3×3の盤面）／numbers（0〜9を桁ごとに）
// hub：結果を公開データ lotto-data-hub から取り込むくじ（公開データの更新は抽せんの翌朝〜午前中なので、結果もそのころ反映）
// bigTier：この等級まで（数字が小さいほど上）を「高額の当せん」としてキャラが大喜びする
export const GAMES = {
  loto6: { name: 'ロト6', type: 'loto', max: 43, pick: 6, bonus: 1, tiers: 5, drawDays: [1, 4], bigTier: 3 }, // 月・木
  loto7: { name: 'ロト7', type: 'loto', max: 37, pick: 7, bonus: 2, tiers: 6, drawDays: [5], bigTier: 3 },    // 金
  miniloto: { name: 'ミニロト', type: 'loto', max: 31, pick: 5, bonus: 1, tiers: 4, drawDays: [2], bigTier: 2, hub: true }, // 火
  bingo5: { name: 'ビンゴ5', type: 'bingo', max: 40, pick: 8, tiers: 7, drawDays: [3], bigTier: 2, hub: true },              // 水
  numbers3: { name: 'ナンバーズ3', type: 'numbers', digits: 3, pick: 3, max: 9, drawDays: [1, 2, 3, 4, 5], hub: true },    // 月〜金
  numbers4: { name: 'ナンバーズ4', type: 'numbers', digits: 4, pick: 4, max: 9, drawDays: [1, 2, 3, 4, 5], hub: true },    // 月〜金
};
export const GAME_KEYS = Object.keys(GAMES);

// ---------- ナンバーズの申込タイプと当せんの種類 ----------
export const NUM_TYPES = {
  straight: { name: 'ストレート', desc: '数字と並び順がすべて一致' },
  box: { name: 'ボックス', desc: '数字がそろえば並び順は問わない' },
  set: { name: 'セット', desc: 'ストレートとボックスに半分ずつ' },
  mini: { name: 'ミニ', desc: '下2桁の数字と並び順が一致' },
};
// 当せんの種類（データの winners・prizes のキー）。上ほど「高い」当たり
export const PRIZE_NAMES = { straight: 'ストレート', setStraight: 'セット（ストレート）', box: 'ボックス', setBox: 'セット（ボックス）', mini: 'ミニ' };
export function numberTypes(kind) { return kind === 'numbers3' ? ['straight', 'box', 'set', 'mini'] : ['straight', 'box', 'set']; }
// 当せん金の表に出す順（公式と同じ順）
export function prizeKeys(kind) { return kind === 'numbers3' ? ['straight', 'box', 'setStraight', 'setBox', 'mini'] : ['straight', 'box', 'setStraight', 'setBox']; }
export const isZorome = d => d.length > 0 && d.every(x => x === d[0]);

// ---------- ビンゴ5の盤面 ----------
// 盤面の位置（0〜8、左上から右へ）。中央（4）が FREE。マス k（1〜8）は CELL_POS[k-1] の位置
export const CELL_POS = [0, 1, 2, 3, 5, 6, 7, 8];
export const FREE_POS = 4;
// ライン：横3・縦3・斜め2
export const BINGO_LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const BINGO_TIER = { 8: 1, 6: 2, 5: 3, 4: 4, 3: 5, 2: 6, 1: 7 }; // 7本はありえない
export const cellRange = k => [5 * k - 4, 5 * k]; // マス k の数字の範囲
// マスごとに一致したか（true/false を8個）
export function bingoHits(ticket, drawMain) { return ticket.map((n, i) => n === drawMain[i]); }
// そろったライン（BINGO_LINES の番号の配列）
export function bingoLines(ticket, drawMain) {
  const hit = new Array(9).fill(false); hit[FREE_POS] = true;
  bingoHits(ticket, drawMain).forEach((h, i) => { if (h) hit[CELL_POS[i]] = true; });
  return BINGO_LINES.map((l, i) => l.every(p => hit[p]) ? i : -1).filter(i => i >= 0);
}
const DRAW_HOUR = 18, DRAW_MIN = 45; // 抽せん時刻（日本時間）
const JST = 9 * 3600 * 1000;

// ---------- 当選の照合 ----------
// 戻り値：等級（1〜）／はずれは 0
// ナンバーズは type（申込タイプ）も渡し、当せんの種類（'straight' など）／はずれは 0 を返す
export function judge(kind, ticket, draw, type) {
  const g = GAMES[kind];
  if (g.type === 'numbers') return judgeNumbers(kind, ticket, type, draw.main);
  if (g.type === 'bingo') return BINGO_TIER[bingoLines(ticket, draw.main).length] || 0;
  const main = new Set(draw.main), bonus = new Set(draw.bonus);
  const hit = ticket.filter(n => main.has(n)).length;
  const bHit = ticket.filter(n => bonus.has(n)).length;
  if (kind === 'loto6') {
    if (hit === 6) return 1;
    if (hit === 5 && bHit >= 1) return 2;
    if (hit === 5) return 3;
    if (hit === 4) return 4;
    if (hit === 3) return 5;
    return 0;
  }
  if (kind === 'miniloto') {
    if (hit === 5) return 1;
    if (hit === 4 && bHit >= 1) return 2;
    if (hit === 4) return 3;
    if (hit === 3) return 4;
    return 0;
  }
  if (hit === 7) return 1;
  if (hit === 6 && bHit >= 1) return 2;
  if (hit === 6) return 3;
  if (hit === 5) return 4;
  if (hit === 4) return 5;
  if (hit === 3 && bHit >= 1) return 6;
  return 0;
}

const sameDigits = (a, b) => [...a].sort().join() === [...b].sort().join();
export function judgeNumbers(kind, digits, type, drawDigits) {
  const straight = digits.join() === drawDigits.join();
  if (type === 'straight') return straight ? 'straight' : 0;
  if (type === 'box') return !isZorome(digits) && sameDigits(digits, drawDigits) ? 'box' : 0;
  if (type === 'set') return isZorome(digits) ? 0 : straight ? 'setStraight' : sameDigits(digits, drawDigits) ? 'setBox' : 0;
  if (type === 'mini') return kind === 'numbers3' && digits.slice(-2).join() === drawDigits.slice(-2).join() ? 'mini' : 0;
  return 0;
}
// 当たりの順位（小さいほど上）。はずれは 0
const PRIZE_RANK = { straight: 1, setStraight: 2, box: 3, setBox: 4, mini: 5 };
export function winRank(kind, result) { return !result ? 0 : GAMES[kind].type === 'numbers' ? PRIZE_RANK[result] : result; }
// 高額の当せん：1口の当せん金が分かれば10万円以上。分からないとき（当せん金の書き足し前）は等級で決める
//   ロト6・7は3等まで、ミニロト・ビンゴ5は2等まで（bigTier）、ナンバーズ4はストレート・セット（ストレート）、ナンバーズ3はストレートだけ
export const BIG_AMOUNT = 100000;
export function isBigWin(kind, result, amount) {
  const g = GAMES[kind];
  if (!result) return false;
  if (Number.isFinite(amount) && amount > 0) return amount >= BIG_AMOUNT;
  if (g.type === 'numbers') return kind === 'numbers4' ? PRIZE_RANK[result] <= 2 : result === 'straight';
  return result <= g.bigTier;
}
// 当せんの名前（「3等」「ボックス」）と当せん金（分からなければ null）
export function prizeOf(kind, draw, result) {
  if (!result) return null;
  const g = GAMES[kind];
  if (g.type === 'numbers') return { label: PRIZE_NAMES[result], amount: draw.prizes ? draw.prizes[result] ?? null : null };
  return { label: `${result}等`, amount: draw.prizes ? draw.prizes[result - 1] ?? null : null };
}

export function validTicket(kind, nums, type) {
  const g = GAMES[kind];
  if (!g || !Array.isArray(nums)) return false;
  if (g.type === 'numbers') {
    return nums.length === g.digits && nums.every(n => Number.isInteger(n) && n >= 0 && n <= 9) &&
      numberTypes(kind).includes(type) && !((type === 'box' || type === 'set') && isZorome(nums));
  }
  if (g.type === 'bingo') {
    return nums.length === 8 && nums.every((n, i) => Number.isInteger(n) && n >= cellRange(i + 1)[0] && n <= cellRange(i + 1)[1]);
  }
  return Array.isArray(nums) && nums.length === g.pick && new Set(nums).size === g.pick &&
    nums.every(n => Number.isInteger(n) && n >= 1 && n <= g.max);
}

// ---------- 抽せん日 ----------
// 日本時間の「年・月・日・曜日」を Date から取り出す
// h・min は日本時間の時・分（せりふの時間帯・抽せん前かどうかに使う）。m は 0〜11
export function jstParts(date) {
  const d = new Date(date.getTime() + JST);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), w: d.getUTCDay(), h: d.getUTCHours(), min: d.getUTCMinutes() };
}
function jstDrawTime(y, m, d) {
  return new Date(Date.UTC(y, m, d, DRAW_HOUR, DRAW_MIN) - JST);
}
// 年末年始（12/31〜1/3）は抽せんが無い
export function isHolidayBreak(m, d) { return (m === 11 && d === 31) || (m === 0 && d <= 3); }
// 日本時間の今日が、そのくじの抽せん日か（年末年始は抽せんなし。nextDraw と同じ考え方）
export function isDrawDay(kind, now = new Date()) {
  const p = jstParts(now);
  return GAMES[kind].drawDays.includes(p.w) && !isHolidayBreak(p.m, p.d);
}
// 日本時間の今日が抽せん日で、まだ抽せん時刻（18:45）前か
export function isBeforeDrawToday(kind, now = new Date()) {
  const p = jstParts(now);
  return isDrawDay(kind, now) && p.h * 60 + p.min < DRAW_HOUR * 60 + DRAW_MIN;
}

// 最後に取り込んだ回の日付と今の時刻から、次の抽せんの回と時刻、取り込み待ちの回数を求める
export function nextDraw(kind, lastDraw, now = new Date()) {
  const g = GAMES[kind];
  const [y, m, d] = lastDraw.date.split('-').map(Number);
  let cursor = new Date(Date.UTC(y, m - 1, d) + 24 * 3600 * 1000); // 最終回の翌日（UTCの日付として扱う）
  let pending = 0;
  for (let i = 0; i < 400; i++) {
    const cy = cursor.getUTCFullYear(), cm = cursor.getUTCMonth(), cd = cursor.getUTCDate(), cw = cursor.getUTCDay();
    if (g.drawDays.includes(cw) && !isHolidayBreak(cm, cd)) {
      const t = jstDrawTime(cy, cm, cd);
      if (t > now) return { n: lastDraw.n + pending + 1, time: t, pending };
      pending++;
    }
    cursor = new Date(cursor.getTime() + 24 * 3600 * 1000);
  }
  return null;
}

// ---------- 統計 ----------
export function frequency(kind, draws, window = draws.length) {
  const g = GAMES[kind];
  const counts = new Array(g.max + 1).fill(0);
  for (const dr of draws.slice(-window)) for (const n of dr.main) counts[n]++;
  return counts; // counts[1..max]
}

// 何回出ていないか（最新回で出た数字は 0）
export function absence(kind, draws) {
  const g = GAMES[kind];
  const gap = new Array(g.max + 1).fill(draws.length);
  for (let i = draws.length - 1; i >= 0; i--) {
    const ago = draws.length - 1 - i;
    for (const n of draws[i].main) if (gap[n] === draws.length) gap[n] = ago;
  }
  return gap;
}

// ナンバーズ：桁ごとの出現回数（counts[桁][0..9]）
export function digitFrequency(kind, draws, window = draws.length) {
  const g = GAMES[kind];
  const counts = Array.from({ length: g.digits }, () => new Array(10).fill(0));
  for (const dr of draws.slice(-window)) dr.main.forEach((d, i) => { counts[i][d]++; });
  return counts;
}
// ナンバーズ：桁ごとに、その数字が何回出ていないか
export function digitAbsence(kind, draws) {
  const g = GAMES[kind];
  const gap = Array.from({ length: g.digits }, () => new Array(10).fill(draws.length));
  for (let i = draws.length - 1; i >= 0; i--) {
    const ago = draws.length - 1 - i;
    draws[i].main.forEach((d, p) => { if (gap[p][d] === draws.length) gap[p][d] = ago; });
  }
  return gap;
}

// from：何番目から数えるか（ロトなどは 1〜、ナンバーズの数字は 0〜）
export function ranking(arr, top = 5, desc = true, from = 1) {
  const list = arr.map((v, n) => ({ n, v })).slice(from);
  list.sort((a, b) => desc ? b.v - a.v || a.n - b.n : a.v - b.v || a.n - b.n);
  return list.slice(0, top);
}

function percentile(sorted, p) { return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]; }

export function shapeStats(kind, draws, window = 300) {
  const recent = draws.slice(-window);
  const sums = recent.map(d => d.main.reduce((a, b) => a + b, 0)).sort((a, b) => a - b);
  const odd = {};
  for (const d of recent) { const k = d.main.filter(n => n % 2).length; odd[k] = (odd[k] || 0) + 1; }
  const oddTop = Object.entries(odd).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => +k);
  return { sumLow: percentile(sums, 0.2), sumHigh: percentile(sums, 0.8), oddTop, oddDist: odd };
}

// ---------- 乱数 ----------
export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// 重み付きで重複なしに k 個選ぶ
function weightedPick(weights, k, rnd) {
  const pool = weights.map((w, n) => ({ n, w })).slice(1);
  const out = [];
  while (out.length < k && pool.length) {
    const total = pool.reduce((a, b) => a + b.w, 0);
    let r = rnd() * total, i = 0;
    for (; i < pool.length - 1; i++) { r -= pool[i].w; if (r <= 0) break; }
    out.push(pool[i].n); pool.splice(i, 1);
  }
  return out.sort((a, b) => a - b);
}
function uniformPick(max, k, rnd) {
  return weightedPick(new Array(max + 1).fill(1), k, rnd);
}

// ---------- 神託（番号予想） ----------
// 流派の説明はくじの種類で言いかえる（schoolDesc）
export const SCHOOLS = {
  hot: { name: 'よく出る派', desc: '直近100回でよく出ている数字を多めに選ぶ' },
  cold: { name: 'ご無沙汰派', desc: 'しばらく出ていない数字を多めに選ぶ' },
  balance: { name: 'バランス派', desc: '奇数・偶数の数と合計を、過去に多い形にそろえる' },
  luck: { name: '運気派', desc: '今日の日付とあなたの誕生日から決まる。同じ日は同じ神託' },
};

const SCHOOL_DESC = {
  bingo: { hot: 'マスごとに、直近100回でよく出ている数字を多めに選ぶ', cold: 'マスごとに、しばらく出ていない数字を多めに選ぶ', balance: '奇数・偶数の数と合計を、過去に多い形にそろえる' },
  numbers: { hot: '桁ごとに、直近100回でよく出ている数字を多めに選ぶ', cold: '桁ごとに、しばらく出ていない数字を多めに選ぶ', balance: '各桁の数字の合計と奇数・偶数の数を、過去に多い形にそろえる' },
};
export function schoolDesc(kind, school) { return (SCHOOL_DESC[GAMES[kind].type] || {})[school] || SCHOOLS[school].desc; }

// 重みに比例して1つ選ぶ（weights[i] → i を返す）
function pickOne(weights, rnd) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rnd() * total, i = 0;
  for (; i < weights.length - 1; i++) { r -= weights[i]; if (r <= 0) break; }
  return i;
}

// ビンゴ5：マスごとに1つずつ（values(k) はマス k の5つの数字の重み）
function bingoTicket(weightOf, rnd) {
  return Array.from({ length: 8 }, (_, i) => {
    const [lo] = cellRange(i + 1);
    return lo + pickOne([0, 1, 2, 3, 4].map(j => weightOf(lo + j)), rnd);
  });
}
// ナンバーズ：桁ごとに1つずつ（weightOf(桁, 数字)）
function numbersTicket(digits, weightOf, rnd) {
  return Array.from({ length: digits }, (_, p) => pickOne([...Array(10).keys()].map(d => weightOf(p, d)), rnd));
}
const one = () => 1;

// ナンバーズの神託に添える申込タイプの例（当たりやすさとは関係ない。全部同じ数字はボックス・セットにできない）
export function suggestType(kind, digits) { return isZorome(digits) ? 'straight' : 'set'; }

export function oracle(kind, draws, school, count = 1, opts = {}) {
  const g = GAMES[kind];
  if (g.type !== 'loto') return oracleOther(kind, draws, school, count, opts);
  const rnd = opts.rnd || Math.random;
  const tickets = [];
  const seen = new Set();
  const add = t => { const key = t.join(','); if (seen.has(key)) return false; seen.add(key); tickets.push(t); return true; };

  for (let i = 0, guard = 0; tickets.length < count && guard < 200; i++, guard++) {
    let t;
    if (school === 'hot') {
      const f = frequency(kind, draws, 100);
      t = weightedPick(f.map(v => (v + 1) ** 2), g.pick, rnd);
    } else if (school === 'cold') {
      const a = absence(kind, draws);
      t = weightedPick(a.map(v => (v + 1) ** 1.5), g.pick, rnd);
    } else if (school === 'balance') {
      const s = shapeStats(kind, draws);
      for (let tries = 0; tries < 5000; tries++) {
        t = uniformPick(g.max, g.pick, rnd);
        const sum = t.reduce((a, b) => a + b, 0), odd = t.filter(n => n % 2).length;
        if (sum >= s.sumLow && sum <= s.sumHigh && s.oddTop.includes(odd)) break;
      }
    } else if (school === 'luck') {
      const day = opts.today || todayKey();
      const seed = hashString(`${kind}|${day}|${opts.birthday || ''}|${i}`);
      t = uniformPick(g.max, g.pick, mulberry32(seed));
    } else {
      throw new Error('unknown school');
    }
    add(t);
  }
  return tickets;
}

// ビンゴ5・ナンバーズの神託（並び順に意味があるので並べかえない）
function oracleOther(kind, draws, school, count, opts) {
  const g = GAMES[kind];
  const rnd = opts.rnd || Math.random;
  const isNum = g.type === 'numbers';
  const make = (weightOf, r) => isNum ? numbersTicket(g.digits, weightOf, r) : bingoTicket(n => weightOf(0, n), r);
  let weightOf;
  if (school === 'hot') {
    if (isNum) { const f = digitFrequency(kind, draws, 100); weightOf = (p, d) => (f[p][d] + 1) ** 2; }
    else { const f = frequency(kind, draws, 100); weightOf = (_, n) => (f[n] + 1) ** 2; }
  } else if (school === 'cold') {
    if (isNum) { const a = digitAbsence(kind, draws); weightOf = (p, d) => (a[p][d] + 1) ** 1.5; }
    else { const a = absence(kind, draws); weightOf = (_, n) => (a[n] + 1) ** 1.5; }
  } else if (!['balance', 'luck'].includes(school)) throw new Error('unknown school');
  const shape = school === 'balance' ? shapeStats(kind, draws) : null;

  const tickets = [], seen = new Set();
  for (let i = 0, guard = 0; tickets.length < count && guard < 200; i++, guard++) {
    let t;
    if (school === 'balance') {
      for (let tries = 0; tries < 5000; tries++) {
        t = make(one, rnd);
        const sum = t.reduce((a, b) => a + b, 0), odd = t.filter(n => n % 2).length;
        if (sum >= shape.sumLow && sum <= shape.sumHigh && shape.oddTop.includes(odd)) break;
      }
    } else if (school === 'luck') {
      const day = opts.today || todayKey();
      t = make(one, mulberry32(hashString(`${kind}|${day}|${opts.birthday || ''}|${i}`)));
    } else {
      t = make(weightOf, rnd);
    }
    const key = t.join(',');
    if (!seen.has(key)) { seen.add(key); tickets.push(t); }
  }
  return tickets;
}

export function todayKey(now = new Date()) {
  const p = jstParts(now);
  return `${p.y}-${String(p.m + 1).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

// ---------- 人とかぶりにくさ指数 ----------
// 当せん確率は変わらない。人が選びがちな形を避けるほど点数が高くなる。
const finish = (score, reasons) => {
  score = Math.max(0, Math.min(100, score));
  const label = score >= 80 ? 'かぶりにくい' : score >= 50 ? 'ふつう' : 'かぶりやすい';
  if (!reasons.length) reasons.push('人が選びがちな形をうまく避けています');
  return { score, label, reasons };
};

export function kaburi(kind, nums, lastDraw) {
  const g = GAMES[kind];
  if (g.type === 'numbers') return kaburiNumbers(kind, nums, lastDraw);
  if (g.type === 'bingo') return kaburiBingo(nums, lastDraw);
  const t = [...nums].sort((a, b) => a - b);
  let score = 100;
  const reasons = [];

  // ミニロトは全部の数字が1〜31なので、代わりに「誕生月の範囲（1〜12）」に偏るかを見る
  const bdMax = g.max <= 31 ? 12 : 31;
  const low = t.filter(n => n <= bdMax).length;
  const bdName = g.max <= 31 ? '誕生月の範囲（1〜12）' : '誕生日の範囲（1〜31）';
  if (low === t.length) { score -= 35; reasons.push(`全部が${bdName}`); }
  else if (low >= t.length - 1) { score -= 15; reasons.push(`ほとんどが${bdName}`); }

  const diffs = t.slice(1).map((n, i) => n - t[i]);
  const consec = diffs.filter(d => d === 1).length;
  if (consec) { score -= consec * 6; reasons.push(`連番が${consec}か所`); }

  if (new Set(diffs).size === 1) { score -= 30; reasons.push('等間隔に並んでいる'); }

  const decades = {};
  t.forEach(n => { const k = Math.floor(n / 10); decades[k] = (decades[k] || 0) + 1; });
  if (Math.max(...Object.values(decades)) >= (kind === 'miniloto' ? 4 : g.pick - 2)) { score -= 10; reasons.push('同じ十の位に集中'); }

  const mult = t.filter(n => n % 5 === 0 || n % 7 === 0).length;
  if (mult >= 4) { score -= 10; reasons.push('5や7の倍数が多い'); }

  const lastDigit = {};
  t.forEach(n => { lastDigit[n % 10] = (lastDigit[n % 10] || 0) + 1; });
  if (Math.max(...Object.values(lastDigit)) >= 3) { score -= 8; reasons.push('下一桁がそろっている'); }

  if (lastDraw) {
    const overlap = t.filter(n => lastDraw.main.includes(n)).length;
    if (overlap >= 2) { score -= (overlap - 1) * 5; reasons.push(`前回の当せん数字が${overlap}個`); }
  }
  return finish(score, reasons);
}

// ナンバーズ：ゾロ目・連番・123のような並び・誕生日のような月日・同じ数字が多い・前回と同じ、ほどかぶりやすい
function kaburiNumbers(kind, d, lastDraw) {
  let score = 100;
  const reasons = [];
  const counts = {};
  d.forEach(x => { counts[x] = (counts[x] || 0) + 1; });
  const reps = Object.values(counts).sort((a, b) => b - a);
  const steps = d.slice(1).map((x, i) => x - d[i]);
  if (isZorome(d)) { score -= 60; reasons.push('ゾロ目（全部同じ数字）'); }
  else if (steps.every(s => s === 1) || steps.every(s => s === -1)) { score -= 55; reasons.push(`${d.length === 3 ? '123' : '1234'}のような順番の並び`); }
  else {
    if (reps[0] >= 3) { score -= 25; reasons.push(`同じ数字が${reps[0]}個`); }
    else if (reps[0] === 2 && reps[1] === 2) { score -= 15; reasons.push('同じ数字が2組'); }
    else if (reps[0] === 2) { score -= 5; reasons.push('同じ数字が2個'); }
    const consec = steps.filter(s => Math.abs(s) === 1).length;
    if (consec) { score -= consec * 8; reasons.push(`となり合う数字の並びが${consec}か所`); }
    if (d.join('') === [...d].reverse().join('')) { score -= 10; reasons.push('左右対称の並び'); }
    else if (d.length === 4 && d[0] === d[2] && d[1] === d[3]) { score -= 10; reasons.push('くり返しの並び（1212など）'); }
  }
  if (d.length === 4) {
    const mm = d[0] * 10 + d[1], dd = d[2] * 10 + d[3];
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mm - 1]) { score -= 20; reasons.push('誕生日のような月日の並び（MMDD）'); }
  }
  if (lastDraw) {
    if (d.join() === lastDraw.main.join()) { score -= 30; reasons.push('前回の当せん数字と同じ'); }
    else if ([...d].sort().join() === [...lastDraw.main].sort().join()) { score -= 10; reasons.push('前回の当せん数字の並べかえ'); }
  }
  return finish(score, reasons);
}

// ビンゴ5：前回と同じマスが多い・各マスの一番小さい／大きい数字ばかり・同じ位置の数字ばかり、ほどかぶりやすい
function kaburiBingo(t, lastDraw) {
  let score = 100;
  const reasons = [];
  const offs = t.map((n, i) => n - cellRange(i + 1)[0]); // マスの中で何番目か（0〜4）
  const cnt = [0, 0, 0, 0, 0];
  offs.forEach(o => { cnt[o]++; });
  if (cnt[0] >= 5) { score -= cnt[0] === 8 ? 50 : 30; reasons.push(cnt[0] === 8 ? '全部のマスが一番小さい数字' : `各マスの一番小さい数字が${cnt[0]}マス`); }
  else if (cnt[4] >= 5) { score -= cnt[4] === 8 ? 50 : 30; reasons.push(cnt[4] === 8 ? '全部のマスが一番大きい数字' : `各マスの一番大きい数字が${cnt[4]}マス`); }
  else if (Math.max(...cnt) >= 6) { score -= 20; reasons.push('どのマスも同じ位置の数字ばかり'); }
  else if (cnt[0] + cnt[4] >= 6) { score -= 15; reasons.push('各マスの端の数字（一番小さい・大きい）ばかり'); }
  if (lastDraw) {
    const same = t.filter((n, i) => n === lastDraw.main[i]).length;
    if (same === 8) { score -= 60; reasons.push('前回の当せん数字とまったく同じ'); }
    else if (same >= 3) { score -= (same - 2) * 8; reasons.push(`前回の当せん数字と同じマスが${same}つ`); }
  }
  return finish(score, reasons);
}
