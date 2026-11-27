// 公式（みずほ銀行）CSVの読み取り。実物の形式（tools/fixtures/）に合わせている。
// ブラウザ（アプリの中）でも Node（tools/ の取り込みスクリプト）でも動くよう、ほかのモジュールに頼らない形にしている。
// tools/csv.mjs はこのファイルをそのまま使う（読み取りを二重に持たない）。
// 回別CSV：
//   1行目：A52 など（種別コード）
//   2行目：第2157回ロト６,数字選択式全国自治宝くじ,令和8年11月23日,東京 宝くじドリーム館
//   本数字,13,20,22,34,38,39,ボーナス数字,33
//   １等,該当なし,該当なし ／ ２等,4口,17288100円 …（「１等」の数字は全角）
//   キャリーオーバー,233461295円
// CSV_GAMES は、公式CSV（と予備の jjayck/lotoanaba-data）から自動で取り込むくじ（ロト6・ロト7）
export const CSV_GAMES = {
  loto6: { prefix: 'A102', pick: 6, bonus: 1, tiers: 5, max: 43 },
  loto7: { prefix: 'A103', pick: 7, bonus: 2, tiers: 6, max: 37 },
};
// ミニロトの公式CSVもロトと同じ形（キャリーオーバーの行は無い）
const LOTO_CSV = { ...CSV_GAMES, miniloto: { prefix: 'A101', pick: 5, bonus: 1, tiers: 4, max: 31 } };
// 公式CSVのURL（ミニロト・ビンゴ5・ナンバーズも）。ナンバーズは3と4が1ファイル
const OFFICIAL_PATH = {
  loto6: 'loto/loto6/csv/A102', loto7: 'loto/loto7/csv/A103', miniloto: 'loto/miniloto/csv/A101',
  bingo5: 'bingo/bingo5/csv/A104', numbers: 'numbers/csv/A100',
};
export function officialCsvUrl(kind, n) {
  const k = kind.startsWith('numbers') ? 'numbers' : kind;
  return `https://www.mizuhobank.co.jp/retail/takarakuji/${OFFICIAL_PATH[k]}${String(n).padStart(4, '0')}.CSV`;
}

// 全角数字を半角に
const half = s => String(s).replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
const num = s => Number(half(s).replace(/[^\d]/g, '')) || 0;

// 和暦（令和）・西暦のどちらでも YYYY-MM-DD にする
export function toIsoDate(text) {
  const t = half(text);
  let m = t.match(/令和(\d+|元)年(\d{1,2})月(\d{1,2})日/);
  if (m) {
    const y = 2018 + (m[1] === '元' ? 1 : Number(m[1]));
    return `${y}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  m = t.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/) || t.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return null;
}

const toLines = text => half(text).split(/\r?\n/).map(l => l.split(',').map(c => c.trim())).filter(l => l.join('') !== '');
// 「第1414回ミニロト,…,令和8年11月24日,…」の行から回と日付。name が違う種類のCSVならエラー
function readHead(lines, name) {
  const head = lines.find(l => /^第\d+回/.test(l[0]));
  if (!head) throw new Error('回の行が見つかりません');
  if (name && !head[0].includes(name)) throw new Error(`${name}のCSVではありません`);
  const n = Number(head[0].match(/^第(\d+)回/)[1]);
  const date = toIsoDate(head.join(','));
  if (!date) throw new Error('抽せん日が読めません');
  return { n, date };
}

export function parseCsv(kind, text) {
  const g = LOTO_CSV[kind];
  if (!g) throw new Error(`くじの種類が違います：${kind}`);
  const lines = toLines(text);
  const { n, date } = readHead(lines, kind === 'miniloto' ? 'ミニロト' : null);

  const mainLine = lines.find(l => l[0] === '本数字');
  if (!mainLine) throw new Error('本数字の行が見つかりません');
  const bi = mainLine.findIndex(c => c.includes('ボーナス'));
  const main = mainLine.slice(1, bi).map(num);
  const bonus = mainLine.slice(bi + 1).map(num).filter(Boolean);

  // 等級の行は「当せん金」の行（口数・金額）と「条件の説明」の行の2回出てくる。最初の行だけ使う
  const winners = [], prizes = [];
  for (let t = 1; t <= g.tiers; t++) {
    const row = lines.find(l => l[0] === `${t}等`);
    if (!row) throw new Error(`${t}等の行が見つかりません`);
    winners.push(num(row[1])); prizes.push(num(row[2]));
  }
  // キャリーオーバーは「数字＋円」の形だけを受け付ける（空・切れている・文字などは読めなかったとして null）
  const coLine = lines.find(l => l[0] === 'キャリーオーバー');
  const coMatch = coLine && coLine.length === 2 && coLine[1].match(/^(\d+)円$/);
  const carryover = coMatch ? Number(coMatch[1]) : null;

  const all = [...main, ...bonus];
  if (main.length !== g.pick || bonus.length !== g.bonus || new Set(all).size !== all.length || all.some(x => x < 1 || x > g.max))
    throw new Error(`数字の検査に失敗（第${n}回）`);
  if (kind === 'miniloto') return { n, date, main, bonus, winners, prizes }; // ミニロトにキャリーオーバーは無い
  return { n, date, main, bonus, winners, prizes, carryover };
}

// 口数・金額は行の最後の2つ（「68口,84700円」。該当なしは 0）
function countAndPrize(row) {
  if (!row || row.length < 3) throw new Error('口数・金額の行が読めません');
  const w = row.at(-2), p = row.at(-1);
  const ok = s => /^(\d+)(口|円)$/.test(s) || s === '該当なし';
  if (!ok(w) || !ok(p)) throw new Error(`口数・金額が読めません：${row.join(',')}`);
  return [num(w), num(p)];
}

// ビンゴ5：「ビンゴ5抽せん数字,03,09,…」（マス順に8個）と 1等〜7等
export function parseBingo5Csv(text) {
  const lines = toLines(text);
  const { n, date } = readHead(lines, 'ビンゴ5');
  const row = lines.find(l => /抽せん数字$/.test(l[0]));
  if (!row) throw new Error('抽せん数字の行が見つかりません');
  const main = row.slice(1).filter(c => c !== '').map(num);
  if (main.length !== 8 || main.some((x, i) => !(x >= 5 * i + 1 && x <= 5 * i + 5))) throw new Error(`数字の検査に失敗（第${n}回）`);
  const winners = [], prizes = [];
  for (let t = 1; t <= 7; t++) {
    const [w, p] = countAndPrize(lines.find(l => l[0] === `${t}等`));
    winners.push(w); prizes.push(p);
  }
  return { n, date, main, winners, prizes };
}

// ナンバーズ：1ファイルに3と4。それぞれ { main:[各桁], winners:{straight,…}, prizes:{…} }
const NUM_ROWS = { straight: 'ストレート', box: 'ボックス', setStraight: 'セット（ストレート）', setBox: 'セット（ボックス）', mini: 'ミニ' };
export function parseNumbersCsv(text) {
  const lines = toLines(text);
  const { n, date } = readHead(lines, 'ナンバーズ');
  const out = { n, date };
  for (const digits of [3, 4]) {
    const start = lines.findIndex(l => l[0] === `ナンバーズ${digits}抽せん数字`);
    if (start < 0) throw new Error(`ナンバーズ${digits}の抽せん数字が見つかりません`);
    const raw = lines[start][1] || '';
    if (!new RegExp(`^\\d{${digits}}$`).test(raw)) throw new Error(`ナンバーズ${digits}の数字が読めません：${raw}`);
    const end = lines.findIndex((l, i) => i > start && l[0] === '販売実績額');
    const section = lines.slice(start + 1, end < 0 ? undefined : end);
    const winners = {}, prizes = {};
    for (const [key, label] of Object.entries(NUM_ROWS)) {
      if (key === 'mini' && digits === 4) continue;
      const row = section.find(l => l[0] === label);
      if (!row) throw new Error(`ナンバーズ${digits}の${label}の行が見つかりません`);
      [winners[key], prizes[key]] = countAndPrize(row);
    }
    out[`numbers${digits}`] = { main: [...raw].map(Number), winners, prizes };
  }
  return out;
}

export function csvUrl(kind, n) {
  return `https://www.mizuhobank.co.jp/retail/takarakuji/loto/${kind}/csv/${CSV_GAMES[kind].prefix}${String(n).padStart(4, '0')}.CSV`;
}

// ---------- 「最近の回の一覧」CSV（tools/fixtures/official/LIST-FORMATS.md） ----------
// 種別コードの行と「第2158回ロト６,数字選択式全国自治宝くじ,令和8年11月26日,東京 宝くじドリーム館」の行が、新しい順に交互に並ぶ。
// 一覧の種類（ナンバーズは3と4が1つ）→ 回の行にある名前
export const LIST_NAMES = { loto6: 'ロト6', loto7: 'ロト7', miniloto: 'ミニロト', numbers: 'ナンバーズ', bingo5: 'ビンゴ5' };
const LIST_PATH = { loto6: 'loto/loto6/csv/loto6.csv', loto7: 'loto/loto7/csv/loto7.csv', miniloto: 'loto/miniloto/csv/miniloto.csv', numbers: 'numbers/csv/numbers.csv', bingo5: 'bingo/bingo5/csv/bingo5.csv' };
export const listCsvUrl = group => `https://www.mizuhobank.co.jp/retail/takarakuji/${LIST_PATH[group]}`;
// 戻り値：[{ n, date }]（新しい順）。group（loto6 など）と違う種類の一覧、回の行が1つも無い、日付が読めない、回が新しい順でない、はエラー
export function parseListCsv(group, text) {
  const name = LIST_NAMES[group];
  if (!name) throw new Error(`くじの種類が違います：${group}`);
  const out = [];
  for (const l of toLines(text)) {
    const m = l[0].match(/^第(\d+)回(.+)$/);
    if (!m) continue;
    // 「ミニロト」は「ロト」を含むので、名前は完全一致で比べる
    if (m[2] !== name) throw new Error(`${name}の一覧ではありません（${m[2]}）`);
    const date = toIsoDate(l.join(','));
    if (!date) throw new Error(`第${m[1]}回の抽せん日が読めません`);
    out.push({ n: Number(m[1]), date });
  }
  if (!out.length) throw new Error('一覧に回の行がありません');
  for (let i = 1; i < out.length; i++) if (!(out[i].n < out[i - 1].n)) throw new Error('一覧の回が新しい順になっていません');
  return out;
}
