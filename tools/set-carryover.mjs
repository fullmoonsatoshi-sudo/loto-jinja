// 公式CSVの内容を使って、取り込み済みの回にキャリーオーバー額を書き足す。
// 公開データ（予備の取り込み先）にはキャリーオーバーが無いため、Claude の定期タスクが公式CSVを読んで、このスクリプトに渡す。
// 使い方：node tools/set-carryover.mjs <loto6|loto7> <公式CSVの中身を保存したファイル（UTF-8 か Shift_JIS）>
// 公式CSVの本数字・ボーナス・口数・金額が、取り込み済みの回と完全に一致したときだけ書き足す。
import fs from 'fs';
import { parseCsv } from './csv.mjs';

const [, , kind, file] = process.argv;
if (!['loto6', 'loto7'].includes(kind) || !file) { console.error('使い方：node tools/set-carryover.mjs <loto6|loto7> <CSVファイル>'); process.exit(2); }
// 終了コード：0=書き足した／記録済み、2=使い方の誤り、3=まだ取り込まれていない回、4=公式と一致しない・キャリーオーバー行が無い、5=CSVが読めない
let off;
try {
  const bytes = fs.readFileSync(file);
  let text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  if (!text.includes('本数字')) text = new TextDecoder('shift_jis').decode(bytes);
  off = parseCsv(kind, text);
} catch (e) { console.error(`CSVを読めませんでした：${e.message}`); process.exit(5); }
if (!Number.isInteger(off.carryover) || off.carryover < 0) { console.error(`第${off.n}回：CSVのキャリーオーバーが無いか、額が読めません（「数字＋円」の形ではない）。書き足しません。`); process.exit(4); }

const dataFile = new URL(`../src/data/${kind}.json`, import.meta.url);
const json = JSON.parse(fs.readFileSync(dataFile));
const d = json.draws.find(x => x.n === off.n);
if (!d) { console.error(`第${off.n}回はまだ取り込まれていません（予備データの更新待ち）`); process.exit(3); }
const key = x => JSON.stringify([x.n, x.date, x.main, x.bonus, x.winners, x.prizes]);
if (key(d) !== key(off)) { console.error(`第${off.n}回：公式CSVと取り込み済みの内容が一致しません。書き足しません。\n公式 ${key(off)}\n手元 ${key(d)}`); process.exit(4); }
if (d.carryover === off.carryover) { console.log(`第${off.n}回：キャリーオーバーは記録済み（${off.carryover}円）`); process.exit(0); }
// すでに記録されている額と食い違うときは、読み間違いの可能性があるので上書きしない
if (d.carryover != null) { console.error(`第${off.n}回：記録済みの額（${d.carryover}円）と読み取った額（${off.carryover}円）が違います。上書きしません。`); process.exit(4); }
d.carryover = off.carryover;
json.updated = new Date().toISOString();
fs.writeFileSync(dataFile, JSON.stringify(json));
console.log(`第${off.n}回：キャリーオーバー ${off.carryover.toLocaleString('ja-JP')}円 を書き足しました`);
