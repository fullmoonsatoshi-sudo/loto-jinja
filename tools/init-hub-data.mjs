// 初回の作成用：公開データ lotto-data-hub の全回から src/data/{miniloto,bingo5,numbers3,numbers4}.json を作り、
// 公式（みずほ銀行）と照合済みの直近20回の当せん金（tools/fixtures/official/*-recent.txt）を書き込む。
// 使い方：node tools/init-hub-data.mjs <lotto-data-hub の data フォルダ>   （例：/tmp/hub/data）
// ふだんの追記は tools/update-data.mjs（公開データから新しい回だけ足す）。
import fs from 'fs';
import { fileURLToPath } from 'url';
import { HUB_KINDS, HUB_SOURCE, fromHub, checkSequence } from './hub.mjs';

const nums = s => s.split('.').map(Number);
const wp = s => s.split(',').map(x => x.split('/').map(Number)); // 「口数/金額」の並び
const NUM_KEYS = ['straight', 'box', 'setStraight', 'setBox', 'mini'];

// 公式と照合済みの直近の回（fixtures の txt）を読む → { kind: [{n,date,main,bonus?,winners,prizes}] }
export function parseRecent(file, text) {
  const out = {};
  for (const line of text.trim().split(/\r?\n/)) {
    const f = line.trim().split(/\s+/);
    const n = Number(f[0]), date = f[1];
    if (file === 'miniloto') {
      const pairs = wp(f[4]);
      (out.miniloto ||= []).push({ n, date, main: nums(f[2]), bonus: [Number(f[3])], winners: pairs.map(p => p[0]), prizes: pairs.map(p => p[1]) });
    } else if (file === 'bingo5') {
      const pairs = wp(f[3]);
      (out.bingo5 ||= []).push({ n, date, main: nums(f[2]), winners: pairs.map(p => p[0]), prizes: pairs.map(p => p[1]) });
    } else {
      for (let i = 2; i < f.length; i += 2) {
        const [, d, digits] = f[i].match(/^N(\d)=(\d+)$/);
        const pairs = wp(f[i + 1]);
        const winners = {}, prizes = {};
        pairs.forEach((p, j) => { winners[NUM_KEYS[j]] = p[0]; prizes[NUM_KEYS[j]] = p[1]; });
        (out[`numbers${d}`] ||= []).push({ n, date, main: [...digits].map(Number), winners, prizes });
      }
    }
  }
  return out;
}
export function loadRecent() {
  const dir = new URL('./fixtures/official/', import.meta.url);
  return Object.assign({}, ...['miniloto', 'bingo5', 'numbers'].map(f => parseRecent(f, fs.readFileSync(new URL(`${f}-recent.txt`, dir), 'utf8'))));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) { console.error('使い方：node tools/init-hub-data.mjs <lotto-data-hub の data フォルダ>'); process.exit(2); }
  const recent = loadRecent();
  for (const kind of HUB_KINDS) {
    const draws = JSON.parse(fs.readFileSync(`${dir}/${kind}.json`, 'utf8')).map(r => fromHub(kind, r)).sort((a, b) => a.n - b.n);
    if (draws[0].n !== 1) throw new Error(`${kind}：第1回からそろっていません`);
    checkSequence(draws, `${kind}：`);
    const byNo = new Map(draws.map(d => [d.n, d]));
    for (const r of recent[kind]) {
      const d = byNo.get(r.n);
      // 公式の数字・日付と完全に一致する回だけ当せん金を入れる
      if (!d || JSON.stringify([d.date, d.main, d.bonus]) !== JSON.stringify([r.date, r.main, r.bonus])) throw new Error(`${kind} 第${r.n}回：公式と一致しません`);
      d.winners = r.winners; d.prizes = r.prizes;
    }
    const json = { kind, source: HUB_SOURCE, updated: new Date().toISOString(), draws };
    fs.writeFileSync(new URL(`../src/data/${kind}.json`, import.meta.url), JSON.stringify(json));
    console.log(kind, `第1回〜第${draws.at(-1).n}回`, `当せん金あり ${recent[kind].length}回`);
  }
}
