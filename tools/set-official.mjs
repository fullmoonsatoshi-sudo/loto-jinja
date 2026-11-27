// 公式CSVの内容を使って、取り込み済みの回に当せん金（口数 winners・1口の金額 prizes）を書き足す。ロト6・ロト7ならキャリーオーバーも。
// ミニロト・ビンゴ5・ナンバーズは公開データ（lotto-data-hub）に当せん金が無いため、Claude の定期タスクが公式CSVを読んで、このスクリプトに渡す。
// 使い方：node tools/set-official.mjs <loto6|loto7|miniloto|bingo5|numbers> <公式CSVの中身を保存したファイル（UTF-8 か Shift_JIS）>
//   ナンバーズの公式CSVは1ファイルに3と4の両方があるので、kind は numbers（numbers3・numbers4 でも同じ）で、両方に書く。
// 公式CSVの回・日付・数字（ロトはボーナスも）が取り込み済みの回と完全に一致したときだけ書き足す。
// すでに入っている値と食い違うときは、読み間違いの可能性があるので上書きしない。
// 終了コード（set-carryover.mjs と同じ）：0=書き足した／記録済み、2=使い方の誤り、3=まだ取り込まれていない回、
//   4=公式と一致しない・記録済みの値と違う・書き足せるものが読めない、5=CSVが読めない
import fs from 'fs';
import { parseCsv, parseBingo5Csv, parseNumbersCsv } from './csv.mjs';

const KINDS = ['loto6', 'loto7', 'miniloto', 'bingo5', 'numbers', 'numbers3', 'numbers4'];
const [, , kindArg, file] = process.argv;
if (!KINDS.includes(kindArg) || !file) { console.error('使い方：node tools/set-official.mjs <loto6|loto7|miniloto|bingo5|numbers> <CSVファイル>'); process.exit(2); }
const kind = kindArg.startsWith('numbers') ? 'numbers' : kindArg;

// 公式CSVを読み、書き足す対象を [{ kind, off }] にする
let targets;
try {
  const bytes = fs.readFileSync(file);
  let text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  if (!/抽せん数字|本数字/.test(text)) text = new TextDecoder('shift_jis').decode(bytes);
  if (kind === 'numbers') {
    const r = parseNumbersCsv(text);
    targets = ['numbers3', 'numbers4'].map(k => ({ kind: k, off: { n: r.n, date: r.date, ...r[k] } }));
  } else if (kind === 'bingo5') targets = [{ kind, off: parseBingo5Csv(text) }];
  else targets = [{ kind, off: parseCsv(kind, text) }];
} catch (e) { console.error(`CSVを読めませんでした：${e.message}`); process.exit(5); }

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ident = x => [x.n, x.date, x.main, x.bonus ?? null];

// まず全部を確かめ、問題がなければまとめて書く（ナンバーズ3だけ書いて4は書かない、ということが起きないように）
const plans = [];
for (const { kind: k, off } of targets) {
  const dataFile = new URL(`../src/data/${k}.json`, import.meta.url);
  const json = JSON.parse(fs.readFileSync(dataFile));
  const d = json.draws.find(x => x.n === off.n);
  if (!d) { console.error(`${k} 第${off.n}回はまだ取り込まれていません（公開データの更新待ち）`); process.exit(3); }
  if (!same(ident(d), ident(off))) { console.error(`${k} 第${off.n}回：公式CSVと取り込み済みの回・日付・数字が一致しません。書き足しません。\n公式 ${JSON.stringify(ident(off))}\n手元 ${JSON.stringify(ident(d))}`); process.exit(4); }
  const change = {};
  for (const f of ['winners', 'prizes']) {
    if (d[f] == null) change[f] = off[f];
    else if (!same(d[f], off[f])) { console.error(`${k} 第${off.n}回：記録済みの${f === 'winners' ? '口数' : '当せん金'}と公式CSVが違います。上書きしません。\n公式 ${JSON.stringify(off[f])}\n手元 ${JSON.stringify(d[f])}`); process.exit(4); }
  }
  if (k === 'loto6' || k === 'loto7') {
    if (Number.isInteger(off.carryover) && off.carryover >= 0) {
      if (d.carryover == null) change.carryover = off.carryover;
      else if (d.carryover !== off.carryover) { console.error(`${k} 第${off.n}回：記録済みのキャリーオーバー（${d.carryover}円）と読み取った額（${off.carryover}円）が違います。上書きしません。`); process.exit(4); }
    } else if (d.carryover == null) {
      console.error(`${k} 第${off.n}回：CSVのキャリーオーバーが無いか、額が読めません（「数字＋円」の形ではない）。キャリーオーバーは書き足しません。`);
      if (!Object.keys(change).length) process.exit(4);
    }
  }
  plans.push({ k, n: off.n, dataFile, json, d, change });
}
for (const { k, n, dataFile, json, d, change } of plans) {
  if (!Object.keys(change).length) { console.log(`${k} 第${n}回：当せん金は記録済み`); continue; }
  Object.assign(d, change);
  json.updated = new Date().toISOString();
  fs.writeFileSync(dataFile, JSON.stringify(json));
  console.log(`${k} 第${n}回：${Object.keys(change).map(f => ({ winners: '口数', prizes: '当せん金', carryover: 'キャリーオーバー' })[f]).join('・')}を書き足しました`);
}
