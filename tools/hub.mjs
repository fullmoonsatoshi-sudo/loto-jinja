// ミニロト・ビンゴ5・ナンバーズ3・ナンバーズ4 の取り込み元：公開データ lotto-data-hub（GitHub: tk030-lotto/lotto-data-hub、MITライセンス）
// 公式（みずほ銀行）はクラウドからのアクセスを拒否するため、この公開データから新しい回を追記する。
// 公開データは日本時間の翌朝5時台に更新される。形式：[{ round, date, numbers, bonus }]（新しい順）
// 取り込む前に、手元の直近20回と完全に一致すること・回が連続していること・日付が増えていること・数字が範囲内であることを確かめる
// （考え方は tools/mirror.mjs と同じ）。どれか違えば何も取り込まずにエラーにする。
// さらに追記する回は、そのくじの抽せん日（曜日・年末年始の休み）どおりの日付で、抽せん時刻を過ぎていること（未来の回は入れない）。
// 一度に追記するのは最大 MAX_NEW 回（残りは次の実行で追記する）。
import { nextDraw } from '../src/lotto.js';

export const HUB_BASE = 'https://tk030-lotto.github.io/lotto-data-hub/data';
export const MAX_NEW = 50;
export const HUB_KINDS = ['miniloto', 'bingo5', 'numbers3', 'numbers4'];
// 公式との照合は、初回に CEO が直近20回ずつ行っただけ。それ以降の回は公開データをそのまま（下の検査を通ったものだけ）取り込む
export const HUB_SOURCE = '公開データ lotto-data-hub（MITライセンス。元データは loto-life.net）を元に取り込み。正式な結果はみずほ銀行の公式発表でご確認ください。当せん金は公式発表の値を書き足した回だけ';

// 1回分の数字が正しい形かを確かめる（ロトは範囲と重複、ビンゴ5はマスごとの範囲、ナンバーズは各桁0〜9）
export function checkDraw(kind, d) {
  const where = `第${d.n}回`;
  const int = x => Number.isInteger(x);
  if (!int(d.n) || d.n < 1) throw new Error(`回の番号がおかしい（${JSON.stringify(d.n)}）`);
  if (typeof d.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.date) || Number.isNaN(Date.parse(d.date))) throw new Error(`${where}の日付がおかしい（${d.date}）`);
  const m = d.main;
  if (!Array.isArray(m) || !m.every(int)) throw new Error(`${where}の数字がおかしい`);
  if (kind === 'miniloto') {
    const all = [...m, ...(d.bonus || [])];
    if (m.length !== 5 || !d.bonus || d.bonus.length !== 1 || !d.bonus.every(int) || new Set(all).size !== 6 || all.some(x => x < 1 || x > 31))
      throw new Error(`${where}の数字が範囲外か重複（${all.join(',')}）`);
    for (let i = 1; i < m.length; i++) if (m[i] <= m[i - 1]) throw new Error(`${where}の本数字が小さい順になっていない`);
  } else if (kind === 'bingo5') {
    if (m.length !== 8 || m.some((x, i) => x < 5 * i + 1 || x > 5 * i + 5)) throw new Error(`${where}の数字がマスの範囲外（${m.join(',')}）`);
  } else {
    const digits = kind === 'numbers3' ? 3 : 4;
    if (m.length !== digits || m.some(x => x < 0 || x > 9)) throw new Error(`${where}の数字が範囲外（${m.join(',')}）`);
  }
  return d;
}

// 公開データの1件 → アプリの形 { n, date, main, bonus? }
export function fromHub(kind, r) {
  const d = { n: r.round, date: r.date, main: r.numbers };
  if (kind === 'miniloto') d.bonus = r.bonus;
  return checkDraw(kind, d);
}

// 古い順の一覧が「回が1ずつ増え、日付も増えている」ことを確かめる
export function checkSequence(list, label = '') {
  for (let i = 1; i < list.length; i++) {
    if (list[i].n !== list[i - 1].n + 1) throw new Error(`${label}回が連続していません（第${list[i - 1].n}回の次が第${list[i].n}回）`);
    if (!(list[i].date > list[i - 1].date)) throw new Error(`${label}日付が増えていません（第${list[i].n}回 ${list[i].date}）`);
  }
}

const key = (kind, d) => JSON.stringify([d.n, d.date, d.main, kind === 'miniloto' ? d.bonus : null]);

// 公開データ（配列）から、手元より新しい回を取り出す。手元の直近20回と完全一致しなければエラー
const jstDate = t => new Date(t.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
// now：今の時刻（テストで差し替える）
export function pickNewDraws(kind, local, remoteJson, now = new Date()) {
  if (!Array.isArray(remoteJson) || !remoteJson.length) throw new Error('公開データの形がおかしい（配列ではない・空）');
  const remote = remoteJson.map(r => fromHub(kind, r)).sort((a, b) => a.n - b.n);
  checkSequence(remote, '公開データの');
  const byNo = new Map(remote.map(d => [d.n, d]));
  for (const d of local.slice(-20)) {
    const r = byNo.get(d.n);
    if (!r || key(kind, r) !== key(kind, d)) throw new Error(`公開データの第${d.n}回が、取り込み済みの内容と一致しません`);
  }
  const lastN = local.at(-1).n;
  const fresh = remote.filter(d => d.n > lastN).slice(0, MAX_NEW);
  checkSequence([local.at(-1), ...fresh], '追加する');
  // 抽せん日どおりか：直前の回の抽せん後から数えた「次の抽せん」と、回・日付が一致し、その抽せん時刻を過ぎていること
  let prev = local.at(-1);
  for (const d of fresh) {
    const nx = nextDraw(kind, prev, new Date(Date.parse(`${prev.date}T10:00:00Z`))); // 直前の回の日の 19:00（日本時間）時点
    if (!nx || nx.n !== d.n || jstDate(nx.time) !== d.date) throw new Error(`第${d.n}回の日付（${d.date}）が抽せん日の予定（${nx ? jstDate(nx.time) : '不明'}）と違います`);
    if (nx.time > now) throw new Error(`第${d.n}回（${d.date}）はまだ抽せん前です`);
    prev = d;
  }
  return fresh;
}

// 通信して新しい回を取り出す（fetchImpl はテストで差し替える）
export async function newDrawsFromHub(kind, local, fetchImpl = fetch, now = new Date()) {
  const res = await fetchImpl(`${HUB_BASE}/${kind}.json`, { headers: { 'User-Agent': 'lotojinja-updater' } });
  if (!res.ok) throw new Error(`公開データを取得できません（${res.status}）`);
  let json;
  try { json = JSON.parse(await res.text()); } catch { throw new Error('公開データが JSON として読めません'); }
  return pickNewDraws(kind, local, json, now);
}

// json（{draws:[…]}）に新しい回を追記し、{ changed } を返す
export async function updateHubKind(kind, json, fetchImpl = fetch, now = new Date()) {
  const fresh = await newDrawsFromHub(kind, json.draws, fetchImpl, now);
  json.draws.push(...fresh);
  return { changed: fresh.length, source: '公開データ lotto-data-hub' };
}
