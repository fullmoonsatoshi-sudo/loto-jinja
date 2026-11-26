// 公式（みずほ銀行）の回別CSVから、新しい回を src/data/*.json に追記する。
// 使い方：node tools/update-data.mjs   （GitHub Actions などネットにつながる場所で実行）
// 読み取りの中身は tools/csv.mjs。実物のCSVを使ったテストは tools/test.mjs。
import fs from 'fs';
import { fileURLToPath } from 'url';
import { CSV_GAMES, parseCsv, csvUrl } from './csv.mjs';

const dec = new TextDecoder('shift_jis');

// 公式サイトは、まだ発表されていない回の CSV に 404 ではなく 403 を返す（2026-11-26 に本番で確認）。
// そこで「まだ無い回」は 403/404 を「未発表」とみなし、アクセスできているかは最新回を取り直して確かめる。
async function fetchDraw(kind, n, fetchImpl, { notYetOk = false } = {}) {
  const url = csvUrl(kind, n);
  const res = await fetchImpl(url, { headers: { 'User-Agent': 'lotojinja-updater' } });
  if (notYetOk && (res.status === 404 || res.status === 403)) return null; // まだ発表されていない回
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  const draw = parseCsv(kind, dec.decode(new Uint8Array(await res.arrayBuffer())));
  if (draw.n !== n) throw new Error(`回がずれています: ${url} → 第${draw.n}回`);
  return draw;
}

// json（{draws:[…]}）を書きかえ、変わった件数を返す。fetchImpl はテストで差し替えられる
export async function updateKind(kind, json, fetchImpl = fetch) {
  let changed = 0;
  const last = json.draws.at(-1);
  // 1) 取り込み済みの最新回を取り直す：公式サイトにアクセスできるかの確認を兼ねる（失敗したらエラー）
  const check = await fetchDraw(kind, last.n, fetchImpl);
  if (JSON.stringify(check.main) !== JSON.stringify(last.main)) throw new Error(`第${last.n}回の内容が公式と違います`);
  if (last.carryover == null) { last.carryover = check.carryover; changed++; }
  // 2) 次の回から順に、未発表（403/404）に当たるまで追加する
  const start = last.n + 1;
  for (let n = start; n < start + 50; n++) { // 一度に追加するのは最大50回まで
    const d = await fetchDraw(kind, n, fetchImpl, { notYetOk: true });
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
