// アプリ（Android 版）の中で、新しい回を取り込むしくみ。Web 版（GitHub Pages）では使わない。
// ・公式（みずほ銀行）の「最近の回の一覧」CSVで最新の回番号を知り、手元より新しい回だけ回別CSVを読む（一度に最大 MAX_FETCH 回分）
// ・公式から読めない・形式が変わった・一度に読める数より多く遅れているときは、予備（GitHub Pages の data/<kind>.json）から取る
// ・取り込む回は検査する（回の連続・抽せん日どおりの日付と曜日・抽せん時刻を過ぎていること・数字の範囲・ナンバーズ3と4の回と日付の一致）
// ・公式と予備が食い違えば公式を優先する（予備は、公式から入った回と1つでも違えば使わない）
// ・取り込んだ回は端末に保存する（同梱データより新しい回と、同梱データと違う回だけ）
// 通信・保存・時刻は deps で受け取る（テストで差し替える）。
//   deps.get(url, type)：type 'sjis'（公式CSV）→ { status, text, maxAge }、'json'（予備）→ { status, text }
//   deps.storage：{ get(key), set(key, value) }（値は JSON にできるもの）
//   deps.now()：今の時刻（Date）
import { GAMES, nextDraw, prizeKeys } from './lotto.js';
import { parseCsv, parseBingo5Csv, parseNumbersCsv, parseListCsv, listCsvUrl, officialCsvUrl } from './csv.js';

// 一覧（公式CSV）の単位 → アプリのくじ。ナンバーズは3と4が1つのCSV
export const GROUPS = { loto6: ['loto6'], loto7: ['loto7'], miniloto: ['miniloto'], bingo5: ['bingo5'], numbers: ['numbers3', 'numbers4'] };
export const groupOf = kind => (kind.startsWith('numbers') ? 'numbers' : kind);
export const BACKUP_BASE = 'https://fullmoonsatoshi-sudo.github.io/loto-jinja/data';
export const backupUrl = kind => `${BACKUP_BASE}/${kind}.json`;
export const MAX_FETCH = 3;            // 公式から一度に読む回別CSVの数（これより多く遅れていれば、残りは予備から）
export const MIN_GAP_MS = 60 * 1000;   // 同じ一覧を読み直すまでの最短の間隔（公式の Cache-Control: max-age=60）
export const RECHECK_MS = 10 * 60 * 1000; // 結果待ちの回があるとき、一覧を読み直すまでの間隔
export const MAX_STORED = 1500;        // 端末に保存する回の上限（くじごと。同梱データより新しい回だけなので、ふつうはずっと少ない）
const metaKey = group => `sync.meta.${group}`;
const drawsKey = kind => `sync.draws.${kind}`;
const JST = 9 * 3600e3;
const jstDate = t => new Date(t.getTime() + JST).toISOString().slice(0, 10);
// キーの並び順によらずに比べる
const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
const core = d => [d.n, d.date, d.main, d.bonus || null];
const strip = ({ src, ...d }) => d; // 保存用の印（src）を除いた中身

// ---------- 検査 ----------
const isCount = x => Number.isInteger(x) && x >= 0;
// 1回分の数字（と、あれば当せん金）が正しい形か
export function checkNumbers(kind, d) {
  const g = GAMES[kind], where = `第${d.n}回`;
  if (!Number.isInteger(d.n) || d.n < 1) throw new Error(`回の番号がおかしい（${d.n}）`);
  if (typeof d.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) throw new Error(`${where}の日付がおかしい`);
  const m = d.main;
  if (!Array.isArray(m) || !m.every(Number.isInteger)) throw new Error(`${where}の数字がおかしい`);
  if (g.type === 'loto') {
    const all = [...m, ...(d.bonus || [])];
    if (m.length !== g.pick || !Array.isArray(d.bonus) || d.bonus.length !== g.bonus || !all.every(Number.isInteger) ||
      new Set(all).size !== all.length || all.some(x => x < 1 || x > g.max)) throw new Error(`${where}の数字が範囲外か重複`);
  } else if (g.type === 'bingo') {
    if (m.length !== 8 || m.some((x, i) => x < 5 * i + 1 || x > 5 * i + 5)) throw new Error(`${where}の数字がマスの範囲外`);
  } else if (m.length !== g.digits || m.some(x => x < 0 || x > 9)) throw new Error(`${where}の数字が範囲外`);
  // 当せん金（無い回もある）
  if (d.winners != null || d.prizes != null) {
    if (g.type === 'numbers') {
      for (const k of prizeKeys(kind)) if (!isCount(d.winners?.[k]) || !isCount(d.prizes?.[k])) throw new Error(`${where}の当せん金の形がおかしい`);
    } else if (!Array.isArray(d.winners) || !Array.isArray(d.prizes) || d.winners.length !== g.tiers || d.prizes.length !== g.tiers ||
      !d.winners.every(isCount) || !d.prizes.every(isCount)) throw new Error(`${where}の当せん金の形がおかしい`);
  }
  if (d.carryover != null && !isCount(d.carryover)) throw new Error(`${where}のキャリーオーバーがおかしい`);
  return d;
}
// 直前の回 prev の次に来る回として正しいか：回が1つ増え、日付が抽せん日の予定どおり（曜日・年末年始の休み）で、抽せん時刻を過ぎている
export function checkNext(kind, prev, d, now) {
  checkNumbers(kind, d);
  if (d.n !== prev.n + 1) throw new Error(`回が連続していません（第${prev.n}回の次が第${d.n}回）`);
  const nx = nextDraw(kind, prev, new Date(Date.parse(`${prev.date}T10:00:00Z`))); // 直前の回の日の 19:00（日本時間）時点
  if (!nx || nx.n !== d.n || jstDate(nx.time) !== d.date) throw new Error(`第${d.n}回の日付（${d.date}）が抽せん日の予定（${nx ? jstDate(nx.time) : '不明'}）と違います`);
  if (nx.time > now) throw new Error(`第${d.n}回（${d.date}）はまだ抽せん前です`);
  return d;
}
// ナンバーズ3と4は同じ回・同じ日付で並んでいること
export function checkNumbersPair(n3, n4) {
  if (n3.length !== n4.length || n3.some((d, i) => d.n !== n4[i].n || d.date !== n4[i].date)) throw new Error('ナンバーズ3と4の回・日付が一致しません');
}

// ---------- 保存と読み込み ----------
// 同梱データ（bundled）に、端末に保存した回（stored）を重ねる。
// ・同梱データより新しい回は、続いている分だけ後ろに足す
// ・同梱データにもある回は、中身が同じなら足りない当せん金・キャリーオーバーだけ補う。違えば公式から入った回のときだけ置きかえる
export function mergeDraws(bundled, stored = []) {
  const out = bundled.map(d => ({ ...d }));
  const idx = new Map(out.map((d, i) => [d.n, i]));
  for (const s of [...stored].sort((a, b) => a.n - b.n)) {
    if (!s || !Number.isInteger(s.n)) continue;
    const i = idx.get(s.n);
    if (i != null) {
      const b = out[i];
      if (same(core(b), core(s))) {
        for (const f of ['winners', 'prizes', 'carryover']) if (b[f] == null && s[f] != null) b[f] = s[f];
        if (s.src) b.src = s.src;
      } else if (s.src === 'official') out[i] = { ...s };
    } else if (s.n === out.at(-1).n + 1) { out.push({ ...s }); idx.set(s.n, out.length - 1); }
  }
  return out;
}
// 保存する分：同梱データより新しい回と、同梱データと中身が違う回（当せん金を補った回も含む）
export function storedPart(bundled, merged) {
  const byN = new Map(bundled.map(d => [d.n, d]));
  return merged.filter(d => { const b = byN.get(d.n); return !b || !same(b, strip(d)); }).slice(-MAX_STORED);
}
export function loadStored(kind, bundled, storage) {
  let stored = null;
  try { stored = storage.get(drawsKey(kind)); } catch { /* 読めなければ同梱データだけ */ }
  const list = stored && stored.v === 1 && Array.isArray(stored.draws) ? stored.draws : [];
  // 壊れた回は使わない（形の検査だけ。保存する前に検査済み）
  const ok = list.filter(d => { try { checkNumbers(kind, d); return true; } catch { return false; } });
  return mergeDraws(bundled, ok);
}
export function saveStored(kind, bundled, merged, storage) {
  try { storage.set(drawsKey(kind), { v: 1, draws: storedPart(bundled, merged) }); } catch { /* 保存できなくても動く（次に開いたとき取り直す） */ }
}

// ---------- 取り込む時期 ----------
// 結果待ちの回のうち、いちばん新しい回の抽せん時刻（ms）
function latestPassedDrawTime(kind, lastDraw, pending) {
  let prev = lastDraw, t = 0;
  for (let i = 0; i < pending; i++) {
    const x = nextDraw(kind, prev, new Date(Date.parse(`${prev.date}T10:00:00Z`)));
    t = x.time.getTime(); prev = { n: x.n, date: jstDate(x.time) };
  }
  return t;
}
// 手元の最新回が、まだ公式で確かめていない（予備から入った）か、当せん金・キャリーオーバーが足りない
export function needsConfirm(kind, d) {
  if (!d) return false;
  if (d.src === 'backup') return true;
  if (!d.winners || !d.prizes) return true;
  return (kind === 'loto6' || kind === 'loto7') && d.carryover == null;
}
// 今、一覧を読みにいくべきか（読み直しの間隔を守る）
export function isDue(group, draws, meta, now) {
  const kinds = GROUPS[group], t = now.getTime();
  if (!meta || !meta.checked) return true;
  const gap = Math.max(MIN_GAP_MS, (meta.maxAge || 0) * 1000);
  if (t - meta.checked < gap) return false;
  const kind = kinds[0], last = draws[kind].at(-1);
  const nx = nextDraw(kind, last, now), pending = nx ? nx.pending : 0;
  if (pending && meta.checked < latestPassedDrawTime(kind, last, pending)) return true; // 前に確かめたあとで抽せんがあった
  const waiting = pending > 0 || kinds.some(k => needsConfirm(k, draws[k].at(-1)));
  return waiting && t - meta.checked >= RECHECK_MS;
}

// ---------- 公式 ----------
// 回別CSVを読み、くじごとの1回分にする（ナンバーズは3と4の両方）
async function fetchOfficialDraw(group, n, deps) {
  const url = officialCsvUrl(group === 'numbers' ? 'numbers3' : group, n);
  const r = await deps.get(url, 'sjis');
  if (r.status !== 200) throw new Error(`公式の第${n}回を読めません（${r.status}）`);
  let out;
  if (group === 'numbers') {
    const p = parseNumbersCsv(r.text);
    out = { numbers3: { n: p.n, date: p.date, ...p.numbers3 }, numbers4: { n: p.n, date: p.date, ...p.numbers4 } };
  } else {
    const p = group === 'bingo5' ? parseBingo5Csv(r.text) : parseCsv(group, r.text);
    out = { [group]: p };
  }
  for (const d of Object.values(out)) if (d.n !== n) throw new Error(`回がずれています（第${n}回のはずが第${d.n}回）`);
  return out;
}

// 公式から取り込む。draws（くじ → 配列）を書きかえ、{ added, changed, latest, maxAge, gap } を返す。読めない・形式が違えばエラー
// （エラーの前に検査を通って足した回はそのまま残す）
export async function syncOfficial(group, draws, deps, info = {}) {
  const kinds = GROUPS[group], now = deps.now();
  const r = await deps.get(listCsvUrl(group), 'sjis');
  if (r.status !== 200) throw new Error(`公式の一覧を読めません（${r.status}）`);
  info.maxAge = r.maxAge;
  const list = parseListCsv(group, r.text);
  const listDate = new Map(list.map(x => [x.n, x.date]));
  const latest = list[0].n;
  info.latest = latest;
  let lastN = Math.min(...kinds.map(k => draws[k].at(-1).n));
  if (kinds.some(k => draws[k].at(-1).n !== lastN)) throw new Error('ナンバーズ3と4の手元の最新回がそろっていません');
  // 手元の最新回が公式の一覧にあるなら、日付が合っていること（合わなければ公式の形式か手元がおかしい）
  if (listDate.has(lastN) && listDate.get(lastN) !== draws[kinds[0]].at(-1).date) throw new Error(`第${lastN}回の日付が公式の一覧と違います`);

  const want = [];
  // 手元の最新回を公式で確かめる（予備から入った・当せん金が足りないとき。公式の一覧に載っている間だけ）
  if (listDate.has(lastN) && kinds.some(k => needsConfirm(k, draws[k].at(-1)))) want.push(lastN);
  for (let n = lastN + 1; n <= latest && want.length < MAX_FETCH; n++) want.push(n);
  let added = 0, changed = 0;
  for (const n of want) {
    let got;
    try {
      got = await fetchOfficialDraw(group, n, deps);
      if (listDate.has(n) && listDate.get(n) !== got[kinds[0]].date) throw new Error(`第${n}回の日付が公式の一覧と違います`);
    } catch (e) {
      if (n === lastN) { info.confirmError = e.message; continue; } // 手元の回の確かめに失敗しても、新しい回の取り込みは続ける
      throw e;
    }
    if (n === lastN) {
      for (const k of kinds) {
        const d = checkNumbers(k, got[k]), i = draws[k].length - 1, cur = draws[k][i];
        const next = { ...d, src: 'official' };
        // 公式を優先：中身が違えば置きかえる。同じなら足りないものを補う（どちらも公式の印をつける）
        if (cur.carryover != null && next.carryover == null && same(core(cur), core(next))) next.carryover = cur.carryover;
        if (!same(strip(cur), strip(next)) || cur.src !== 'official') { draws[k][i] = next; changed++; }
      }
    } else {
      for (const k of kinds) checkNext(k, draws[k].at(-1), got[k], now);
      for (const k of kinds) draws[k].push({ ...got[k], src: 'official' });
      added++; lastN = n;
    }
  }
  return { added, changed, latest, gap: latest - lastN };
}

// ---------- 予備（GitHub Pages） ----------
// 予備のデータから、手元より新しい回を足す。予備が手元の（公式から入った）回と食い違えば、予備は使わずにエラー
export async function syncBackup(group, draws, deps) {
  const kinds = GROUPS[group], now = deps.now();
  const remote = {};
  for (const k of kinds) {
    const r = await deps.get(backupUrl(k), 'json');
    if (r.status !== 200) throw new Error(`予備のデータを読めません（${r.status}）`);
    let j; try { j = JSON.parse(r.text); } catch { throw new Error('予備のデータが読めません（JSONではない）'); }
    if (!j || !Array.isArray(j.draws) || !j.draws.length) throw new Error('予備のデータの形がおかしい');
    remote[k] = j.draws;
  }
  const lastN = Math.min(...kinds.map(k => draws[k].at(-1).n));
  let added = 0, changed = 0;
  const fresh = {};
  for (const k of kinds) {
    const byN = new Map(remote[k].map(d => [d.n, d]));
    // 手元の直近20回と食い違わないこと（公式を優先：違えば予備は使わない）
    for (const d of draws[k].slice(-20)) {
      const r = byN.get(d.n);
      if (r && !same(core(r), core(d))) throw new Error(`予備の第${d.n}回が手元（公式）と違います`);
    }
    fresh[k] = remote[k].filter(d => d.n > lastN).sort((a, b) => a.n - b.n);
  }
  if (group === 'numbers') {
    const len = Math.min(fresh.numbers3.length, fresh.numbers4.length);
    fresh.numbers3 = fresh.numbers3.slice(0, len); fresh.numbers4 = fresh.numbers4.slice(0, len);
    checkNumbersPair(fresh.numbers3, fresh.numbers4);
  }
  for (const k of kinds) {
    // 手元の最新回に当せん金が無く、予備にあれば補う（数字が同じときだけ）
    const i = draws[k].length - 1, cur = draws[k][i], r = remote[k].find(d => d.n === cur.n);
    if (r && cur.src !== 'official' && same(core(r), core(cur))) {
      const fill = {};
      for (const f of ['winners', 'prizes', 'carryover']) if (cur[f] == null && r[f] != null) fill[f] = r[f];
      if (Object.keys(fill).length) { const next = { ...cur, ...fill }; checkNumbers(k, next); draws[k][i] = next; changed++; }
    }
  }
  // 新しい回は先に全部検査してから足す（途中で失敗したら、そこより前の回だけ足す）
  const n = fresh[kinds[0]].length;
  for (let i = 0; i < n; i++) {
    try { for (const k of kinds) checkNext(k, draws[k].at(-1), fresh[k][i], now); }
    catch (e) { if (!added) throw e; break; }
    for (const k of kinds) draws[k].push({ ...strip(fresh[k][i]), src: 'backup' });
    added++;
  }
  return { added, changed };
}

// ---------- まとめ ----------
const running = new Map();
// 1つの一覧の単位（group）を取り込む。ctx：{ draws: くじ → 配列（書きかえる）, bundled: くじ → 同梱データ, force }
// 戻り値：{ group, skipped?, source: 'official'|'backup'|null, added, changed, error? }
export function syncGroup(group, ctx, deps) {
  if (running.has(group)) return running.get(group); // 同じものを同時に読まない
  const p = (async () => {
    const kinds = GROUPS[group], now = deps.now();
    if (kinds.some(k => !ctx.draws[k] || !ctx.draws[k].length)) return { group, skipped: 'nodata', added: 0, changed: 0 };
    const meta = deps.storage.get(metaKey(group)) || {};
    if (!ctx.force && !isDue(group, ctx.draws, meta, now)) return { group, skipped: 'recent', added: 0, changed: 0, error: meta.error || null };
    // 書きかえは写しで行い、検査を通ったものだけを戻す
    const work = Object.fromEntries(kinds.map(k => [k, ctx.draws[k].map(d => ({ ...d }))]));
    const res = { group, source: null, added: 0, changed: 0, error: null };
    const info = {};
    let officialErr = null, gap = 0;
    try {
      const o = await syncOfficial(group, work, deps, info);
      res.source = 'official'; res.added += o.added; res.changed += o.changed; gap = o.gap;
    } catch (e) { officialErr = e; }
    if (officialErr || gap > 0) {
      try {
        const b = await syncBackup(group, work, deps);
        if (!res.source || b.added || b.changed) res.source = officialErr ? 'backup' : 'official+backup';
        res.added += b.added; res.changed += b.changed;
      } catch (e) {
        if (officialErr) res.error = `公式：${officialErr.message}／予備：${e.message}`;
      }
    }
    if (officialErr && !res.error) res.note = `公式から読めなかったので予備を使いました（${officialErr.message}）`;
    if (res.added || res.changed) {
      for (const k of kinds) {
        ctx.draws[k].splice(0, ctx.draws[k].length, ...work[k]);
        if (ctx.bundled && ctx.bundled[k]) saveStored(k, ctx.bundled[k], ctx.draws[k], deps.storage);
      }
    }
    deps.storage.set(metaKey(group), { checked: now.getTime(), source: res.source, error: res.error, maxAge: info.maxAge || 0, latest: info.latest || null });
    return res;
  })().finally(() => running.delete(group));
  running.set(group, p);
  return p;
}
// 前回の取り込みが、公式・予備のどちらからも読めずに終わったか
export function lastError(group, storage) {
  const m = storage.get(metaKey(group));
  return m && m.error ? m.error : null;
}
