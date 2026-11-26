// 公式（みずほ銀行）の回別CSVから、新しい回を src/data/*.json に追記する。
// 使い方：node tools/update-data.mjs   （GitHub Actions などネットにつながる場所で実行）
// 読み取りの中身は tools/csv.mjs。実物のCSVを使ったテストは tools/test.mjs。
import fs from 'fs';
import { fileURLToPath } from 'url';
import { CSV_GAMES, parseCsv, csvUrl } from './csv.mjs';

const dec = new TextDecoder('shift_jis');

async function fetchDraw(kind, n, fetchImpl) {
  const url = csvUrl(kind, n);
  const res = await fetchImpl(url, { headers: { 'User-Agent': 'lotojinja-updater' } });
  if (res.status === 404) return null; // まだ発表されていない回
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  const draw = parseCsv(kind, dec.decode(new Uint8Array(await res.arrayBuffer())));
  if (draw.n !== n) throw new Error(`回がずれています: ${url} → 第${draw.n}回`);
  return draw;
}

// json（{draws:[…]}）を書きかえ、変わった件数を返す。fetchImpl はテストで差し替えられる
export async function updateKind(kind, json, fetchImpl = fetch) {
  let changed = 0;
  const last = json.draws.at(-1);
  if (last.carryover == null) { // 最新回のキャリーオーバーが無ければ取り直す
    const d = await fetchDraw(kind, last.n, fetchImpl);
    if (d) { last.carryover = d.carryover; changed++; }
  }
  const start = json.draws.at(-1).n + 1;
  for (let n = start; n < start + 50; n++) { // 一度に追加するのは最大50回まで
    const d = await fetchDraw(kind, n, fetchImpl);
    if (!d) break;
    json.draws.push(d); changed++;
  }
  return changed;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let failed = false;
  for (const kind of Object.keys(CSV_GAMES)) {
    const file = new URL(`../src/data/${kind}.json`, import.meta.url);
    const json = JSON.parse(fs.readFileSync(file));
    let changed = 0;
    try { changed = await updateKind(kind, json); }
    catch (e) { console.error(kind, e.message); failed = true; }
    if (changed) { json.updated = new Date().toISOString(); fs.writeFileSync(file, JSON.stringify(json)); }
    console.log(kind, `更新 ${changed} 件`, '最新 第' + json.draws.at(-1).n + '回');
  }
  if (failed) process.exit(1);
}
