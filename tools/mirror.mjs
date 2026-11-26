// 予備の取り込み先：公開データ（GitHub: jjayck/lotoanaba-data）
// 公式サイトはクラウド（GitHub Actions）からのアクセスを拒否する（2026-11-26 に確認）ため、
// そのときはここから取り込む。このデータは公式の回別CSVと照合して一致を確認済み。
// 形式：UTF-8・見出しなし。meta.json に件数・最新回・SHA-256 がある。
//   ロト6：回,日付,本数字6,ボーナス1,口数5,金額5   ロト7：回,日付,本数字7,ボーナス2,口数6,金額6
import { createHash } from 'crypto';
import { CSV_GAMES } from './csv.mjs';

export const MIRROR_BASE = 'https://raw.githubusercontent.com/jjayck/lotoanaba-data/main';

export function parseMirrorCsv(kind, text) {
  const g = CSV_GAMES[kind];
  return text.trim().split(/\r?\n/).map(line => {
    const f = line.split(',');
    const [y, m, d] = f[1].split('/').map(Number);
    const nums = f.slice(2).map(Number);
    const draw = {
      n: Number(f[0]), date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      main: nums.slice(0, g.pick), bonus: nums.slice(g.pick, g.pick + g.bonus),
      winners: nums.slice(g.pick + g.bonus, g.pick + g.bonus + g.tiers),
      prizes: nums.slice(g.pick + g.bonus + g.tiers, g.pick + g.bonus + 2 * g.tiers),
    };
    const all = [...draw.main, ...draw.bonus];
    if (!draw.n || draw.prizes.length !== g.tiers || new Set(all).size !== all.length || all.some(x => !(x >= 1 && x <= g.max)))
      throw new Error(`予備データの形式がおかしい（${line}）`);
    return draw;
  });
}

const key = d => JSON.stringify([d.n, d.date, d.main, d.bonus, d.winners, d.prizes]);

// 予備データから新しい回を取り出す。手元の直近20回と完全に一致することを確かめてから使う
export async function newDrawsFromMirror(kind, local, fetchImpl = fetch) {
  const [metaRes, csvRes] = await Promise.all([fetchImpl(`${MIRROR_BASE}/meta.json`), fetchImpl(`${MIRROR_BASE}/${kind}.csv`)]);
  if (!metaRes.ok || !csvRes.ok) throw new Error(`予備データを取得できません（${metaRes.status}/${csvRes.status}）`);
  const meta = JSON.parse(await metaRes.text());
  const text = await csvRes.text();
  const sha = createHash('sha256').update(text).digest('hex');
  if (meta[kind] && meta[kind].sha256 && meta[kind].sha256 !== sha) throw new Error('予備データの SHA-256 が meta.json と一致しません');
  const remote = parseMirrorCsv(kind, text);
  const byNo = new Map(remote.map(d => [d.n, d]));
  for (const d of local.slice(-20)) {
    const r = byNo.get(d.n);
    if (!r || key(r) !== key(d)) throw new Error(`予備データの第${d.n}回が、取り込み済みの内容と一致しません`);
  }
  const lastN = local.at(-1).n;
  const fresh = remote.filter(d => d.n > lastN).sort((a, b) => a.n - b.n);
  fresh.forEach((d, i) => { if (d.n !== lastN + 1 + i) throw new Error(`予備データの回が飛んでいます（第${d.n}回）`); });
  return fresh;
}
