// 公式（みずほ銀行）回別CSVの読み取り。実物の形式（tools/fixtures/）に合わせている。
//   1行目：A52 など（種別コード）
//   2行目：第2157回ロト６,数字選択式全国自治宝くじ,令和8年11月23日,東京 宝くじドリーム館
//   本数字,13,20,22,34,38,39,ボーナス数字,33
//   １等,該当なし,該当なし ／ ２等,4口,17288100円 …（「１等」の数字は全角）
//   キャリーオーバー,233461295円
export const CSV_GAMES = {
  loto6: { prefix: 'A102', pick: 6, bonus: 1, tiers: 5, max: 43 },
  loto7: { prefix: 'A103', pick: 7, bonus: 2, tiers: 6, max: 37 },
};

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

export function parseCsv(kind, text) {
  const g = CSV_GAMES[kind];
  const lines = half(text).split(/\r?\n/).map(l => l.split(',').map(c => c.trim())).filter(l => l.join('') !== '');

  const head = lines.find(l => /^第\d+回/.test(l[0]));
  if (!head) throw new Error('回の行が見つかりません');
  const n = Number(head[0].match(/^第(\d+)回/)[1]);
  const date = toIsoDate(head.join(','));
  if (!date) throw new Error('抽せん日が読めません');

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
  return { n, date, main, bonus, winners, prizes, carryover };
}

export function csvUrl(kind, n) {
  return `https://www.mizuhobank.co.jp/retail/takarakuji/loto/${kind}/csv/${CSV_GAMES[kind].prefix}${String(n).padStart(4, '0')}.CSV`;
}
