// 計算まわり（照合・統計・神託・かぶりにくさ指数）。画面のコードとは分けて、テストしやすくしている。

export const GAMES = {
  loto6: { name: 'ロト6', max: 43, pick: 6, bonus: 1, tiers: 5, drawDays: [1, 4] }, // 月・木
  loto7: { name: 'ロト7', max: 37, pick: 7, bonus: 2, tiers: 6, drawDays: [5] },    // 金
};
const DRAW_HOUR = 18, DRAW_MIN = 45; // 抽せん時刻（日本時間）
const JST = 9 * 3600 * 1000;

// ---------- 当選の照合 ----------
// 戻り値：等級（1〜）／はずれは 0
export function judge(kind, ticket, draw) {
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
  if (hit === 7) return 1;
  if (hit === 6 && bHit >= 1) return 2;
  if (hit === 6) return 3;
  if (hit === 5) return 4;
  if (hit === 4) return 5;
  if (hit === 3 && bHit >= 1) return 6;
  return 0;
}

export function validTicket(kind, nums) {
  const g = GAMES[kind];
  return Array.isArray(nums) && nums.length === g.pick && new Set(nums).size === g.pick &&
    nums.every(n => Number.isInteger(n) && n >= 1 && n <= g.max);
}

// ---------- 抽せん日 ----------
// 日本時間の「年・月・日・曜日」を Date から取り出す
function jstParts(date) {
  const d = new Date(date.getTime() + JST);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), w: d.getUTCDay() };
}
function jstDrawTime(y, m, d) {
  return new Date(Date.UTC(y, m, d, DRAW_HOUR, DRAW_MIN) - JST);
}
// 年末年始（12/31〜1/3）は抽せんが無い
function isHolidayBreak(m, d) { return (m === 11 && d === 31) || (m === 0 && d <= 3); }

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

export function ranking(arr, top = 5, desc = true) {
  const list = arr.map((v, n) => ({ n, v })).slice(1);
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
export const SCHOOLS = {
  hot: { name: 'よく出る派', desc: '直近100回でよく出ている数字を多めに選ぶ' },
  cold: { name: 'ご無沙汰派', desc: 'しばらく出ていない数字を多めに選ぶ' },
  balance: { name: 'バランス派', desc: '奇数・偶数の数と合計を、過去に多い形にそろえる' },
  luck: { name: '運気派', desc: '今日の日付とあなたの誕生日から決まる。同じ日は同じ神託' },
};

export function oracle(kind, draws, school, count = 1, opts = {}) {
  const g = GAMES[kind];
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

export function todayKey(now = new Date()) {
  const p = jstParts(now);
  return `${p.y}-${String(p.m + 1).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

// ---------- 人とかぶりにくさ指数 ----------
// 当せん確率は変わらない。人が選びがちな形を避けるほど点数が高くなる。
export function kaburi(kind, nums, lastDraw) {
  const g = GAMES[kind];
  const t = [...nums].sort((a, b) => a - b);
  let score = 100;
  const reasons = [];

  const low = t.filter(n => n <= 31).length;
  if (low === t.length) { score -= 35; reasons.push('全部が誕生日の範囲（1〜31）'); }
  else if (low >= t.length - 1) { score -= 15; reasons.push('ほとんどが誕生日の範囲（1〜31）'); }

  const diffs = t.slice(1).map((n, i) => n - t[i]);
  const consec = diffs.filter(d => d === 1).length;
  if (consec) { score -= consec * 6; reasons.push(`連番が${consec}か所`); }

  if (new Set(diffs).size === 1) { score -= 30; reasons.push('等間隔に並んでいる'); }

  const decades = {};
  t.forEach(n => { const k = Math.floor(n / 10); decades[k] = (decades[k] || 0) + 1; });
  if (Math.max(...Object.values(decades)) >= g.pick - 2) { score -= 10; reasons.push('同じ十の位に集中'); }

  const mult = t.filter(n => n % 5 === 0 || n % 7 === 0).length;
  if (mult >= 4) { score -= 10; reasons.push('5や7の倍数が多い'); }

  const lastDigit = {};
  t.forEach(n => { lastDigit[n % 10] = (lastDigit[n % 10] || 0) + 1; });
  if (Math.max(...Object.values(lastDigit)) >= 3) { score -= 8; reasons.push('下一桁がそろっている'); }

  if (lastDraw) {
    const overlap = t.filter(n => lastDraw.main.includes(n)).length;
    if (overlap >= 2) { score -= (overlap - 1) * 5; reasons.push(`前回の当せん数字が${overlap}個`); }
  }

  score = Math.max(0, Math.min(100, score));
  const label = score >= 80 ? 'かぶりにくい' : score >= 50 ? 'ふつう' : 'かぶりやすい';
  if (!reasons.length) reasons.push('人が選びがちな形をうまく避けています');
  return { score, label, reasons };
}
