// 計算ロジックのテスト：node tools/test.mjs
import fs from 'fs';
import assert from 'assert/strict';
import { judge, validTicket, nextDraw, frequency, absence, oracle, kaburi, GAMES, bingoLines, digitFrequency, digitAbsence, prizeOf, isBigWin, winRank, isZorome, suggestType, schoolDesc } from '../src/lotto.js';
import { parseCsv, toIsoDate, parseBingo5Csv, parseNumbersCsv, officialCsvUrl } from './csv.mjs';
import { updateKind } from './update-data.mjs';
import { updateHubKind, checkSequence, checkDraw, MAX_NEW } from './hub.mjs';
import { loadRecent } from './init-hub-data.mjs';
import { createHash } from 'crypto';
import os from 'os';
import { chooseLine, homeSituation, timeBand, lineDay, lineIndex, nextLineChange, checkLines, LINE_KEYS, CHAR_IDS } from '../src/lines.js';

const load = k => JSON.parse(fs.readFileSync(new URL(`../src/data/${k}.json`, import.meta.url))).draws;
const L6 = load('loto6'), L7 = load('loto7');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };

// --- 照合：ロト6 ---
const d6 = { main: [1, 2, 3, 4, 5, 6], bonus: [7] };
t('loto6 1等', () => assert.equal(judge('loto6', [1, 2, 3, 4, 5, 6], d6), 1));
t('loto6 2等', () => assert.equal(judge('loto6', [1, 2, 3, 4, 5, 7], d6), 2));
t('loto6 3等', () => assert.equal(judge('loto6', [1, 2, 3, 4, 5, 8], d6), 3));
t('loto6 4等', () => assert.equal(judge('loto6', [1, 2, 3, 4, 8, 9], d6), 4));
t('loto6 5等', () => assert.equal(judge('loto6', [1, 2, 3, 8, 9, 10], d6), 5));
t('loto6 3個+ボーナスは5等', () => assert.equal(judge('loto6', [1, 2, 3, 7, 9, 10], d6), 5));
t('loto6 はずれ', () => assert.equal(judge('loto6', [1, 2, 7, 8, 9, 10], d6), 0));

// --- 照合：ロト7 ---
const d7 = { main: [1, 2, 3, 4, 5, 6, 7], bonus: [8, 9] };
t('loto7 1等', () => assert.equal(judge('loto7', [1, 2, 3, 4, 5, 6, 7], d7), 1));
t('loto7 2等（ボーナス2個目）', () => assert.equal(judge('loto7', [1, 2, 3, 4, 5, 6, 9], d7), 2));
t('loto7 3等', () => assert.equal(judge('loto7', [1, 2, 3, 4, 5, 6, 10], d7), 3));
t('loto7 4等', () => assert.equal(judge('loto7', [1, 2, 3, 4, 5, 10, 11], d7), 4));
t('loto7 5等', () => assert.equal(judge('loto7', [1, 2, 3, 4, 10, 11, 12], d7), 5));
t('loto7 6等', () => assert.equal(judge('loto7', [1, 2, 3, 8, 10, 11, 12], d7), 6));
t('loto7 3個だけははずれ', () => assert.equal(judge('loto7', [1, 2, 3, 10, 11, 12, 13], d7), 0));

// --- 実データで照合（当せん番号そのものは必ず1等） ---
t('実データ ロト6 最新回は1等', () => assert.equal(judge('loto6', L6.at(-1).main, L6.at(-1)), 1));
t('実データ ロト7 最新回は1等', () => assert.equal(judge('loto7', L7.at(-1).main, L7.at(-1)), 1));

// --- 入力チェック ---
t('validTicket', () => {
  assert.ok(validTicket('loto6', [1, 2, 3, 4, 5, 43]));
  assert.ok(!validTicket('loto6', [1, 2, 3, 4, 5, 44]));
  assert.ok(!validTicket('loto6', [1, 1, 3, 4, 5, 6]));
  assert.ok(!validTicket('loto7', [1, 2, 3, 4, 5, 6]));
});

// --- 次回抽せん ---
t('ロト6 次回（第2157回 11/23(月) の後、11/26(木) 12:00 JST）', () => {
  const r = nextDraw('loto6', { n: 2157, date: '2026-11-23' }, new Date('2026-11-26T03:00:00Z'));
  assert.equal(r.n, 2158); assert.equal(r.pending, 0);
  assert.equal(r.time.toISOString(), '2026-11-26T09:45:00.000Z');
});
t('ロト6 抽せん時刻を過ぎて未反映なら取り込み待ち', () => {
  const r = nextDraw('loto6', { n: 2157, date: '2026-11-23' }, new Date('2026-11-26T12:00:00Z'));
  assert.equal(r.n, 2159); assert.equal(r.pending, 1);
  assert.equal(r.time.toISOString(), '2026-11-30T09:45:00.000Z');
});
t('ロト7 次回は金曜', () => {
  const r = nextDraw('loto7', { n: 704, date: '2026-11-20' }, new Date('2026-11-26T03:00:00Z'));
  assert.equal(r.n, 705); assert.equal(r.time.toISOString(), '2026-11-27T09:45:00.000Z');
});
t('年末年始は抽せんなし', () => {
  // 2026/12/31(木) と 2027/1/1(金) を飛ばす
  const r = nextDraw('loto6', { n: 1, date: '2026-12-28' }, new Date('2026-12-29T00:00:00Z'));
  assert.equal(r.time.toISOString(), '2027-01-04T09:45:00.000Z');
});

// --- 統計 ---
t('出現回数の合計 = 回数×本数字の数', () => {
  const f = frequency('loto6', L6);
  assert.equal(f.reduce((a, b) => a + b, 0), L6.length * 6);
});
t('最新回の数字の空白は0', () => {
  const a = absence('loto7', L7);
  for (const x of L7.at(-1).main) assert.equal(a[x], 0);
});

// --- 神託 ---
for (const kind of ['loto6', 'loto7']) for (const s of ['hot', 'cold', 'balance', 'luck']) {
  t(`神託 ${kind} ${s} は正しい番号を5口`, () => {
    const draws = kind === 'loto6' ? L6 : L7;
    const r = oracle(kind, draws, s, 5, { birthday: '1990-05-05' });
    assert.equal(r.length, 5);
    r.forEach(x => assert.ok(validTicket(kind, x), x.join(',')));
    assert.equal(new Set(r.map(x => x.join())).size, 5);
  });
}
t('運気派は同じ日・同じ誕生日なら同じ', () => {
  const a = oracle('loto6', L6, 'luck', 3, { today: '2026-11-26', birthday: '1990-05-05' });
  const b = oracle('loto6', L6, 'luck', 3, { today: '2026-11-26', birthday: '1990-05-05' });
  const c = oracle('loto6', L6, 'luck', 3, { today: '2026-11-27', birthday: '1990-05-05' });
  assert.deepEqual(a, b); assert.notDeepEqual(a, c);
});

// --- かぶりにくさ指数 ---
t('1,2,3,4,5,6 はかぶりやすい', () => assert.equal(kaburi('loto6', [1, 2, 3, 4, 5, 6]).label, 'かぶりやすい'));
t('誕生日でない散らばった数字はかぶりにくい', () => {
  const r = kaburi('loto6', [4, 13, 22, 34, 38, 41]);
  assert.ok(r.score >= 80, JSON.stringify(r));
});
t('点数は0〜100', () => {
  for (let i = 0; i < 300; i++) {
    const [x] = oracle('loto7', L7, 'balance', 1);
    const r = kaburi('loto7', x, L7.at(-1));
    assert.ok(r.score >= 0 && r.score <= 100);
  }
});

// --- 公式CSV（実物 tools/fixtures/）の読み取り ---
const fxBytes = f => fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url));
const fx = f => new TextDecoder('shift_jis').decode(fxBytes(f)); // 公式と同じ Shift_JIS
t('和暦の日付', () => { assert.equal(toIsoDate('令和8年11月23日'), '2026-11-23'); assert.equal(toIsoDate('令和元年5月1日'), '2019-05-01'); });
t('公式CSV ロト6 第2157回（1等 該当なし・全角の等級）', () => {
  const d = parseCsv('loto6', fx('A1022157.CSV'));
  assert.deepEqual(d, { n: 2157, date: '2026-11-23', main: [13, 20, 22, 34, 38, 39], bonus: [33],
    winners: [0, 4, 138, 7931, 132811], prizes: [0, 17288100, 541100, 9900, 1000], carryover: 233461295 });
});
t('公式CSV ロト6 第2158回', () => {
  const d = parseCsv('loto6', fx('A1022158.CSV'));
  assert.deepEqual([d.n, d.date, d.main, d.bonus, d.winners[0], d.prizes[0], d.carryover], [2158, '2026-11-26', [5, 13, 15, 23, 27, 42], [16], 1, 471702200, 0]);
});
t('公式CSV ロト7 第704回（ボーナス2個・6等まで）', () => {
  const d = parseCsv('loto7', fx('A1030704.CSV'));
  assert.deepEqual(d, { n: 704, date: '2026-11-20', main: [3, 4, 14, 16, 28, 36, 37], bonus: [21, 30],
    winners: [2, 3, 129, 6007, 99458, 165667], prizes: [853715300, 21615900, 579000, 7500, 1500, 1100], carryover: 0 });
});
t('取り込み済みデータは公式CSVと一致（第2157回・第2158回・第704回）', () => {
  for (const [list, kind, f] of [[L6, 'loto6', 'A1022157.CSV'], [L6, 'loto6', 'A1022158.CSV'], [L7, 'loto7', 'A1030704.CSV']]) {
    const d = parseCsv(kind, fx(f)); assert.deepEqual(list.find(x => x.n === d.n), d);
  }
});
t('壊れたCSVははじく', () => {
  assert.throws(() => parseCsv('loto6', fx('A1022157.CSV').replace('13,20', '13,13')));
  assert.throws(() => parseCsv('loto7', fx('A1022157.CSV')));
});

// --- 更新スクリプト（通信の代わりに実物のCSVを返す） ---
await (async () => {
  const fakeFetch = async url => {
    const name = url.split('/').pop();
    if (!['A1022157.CSV', 'A1022158.CSV'].includes(name)) return { status: 403, ok: false }; // 公式は未発表の回に 403 を返す
    const b = fxBytes(name); // 公式と同じ Shift_JIS のバイト列をそのまま返す
    return { status: 200, ok: true, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
  };
  const json = { draws: L6.filter(d => d.n <= 2157).map(d => ({ ...d })) };
  delete json.draws.at(-1).carryover;
  const changed = await updateKind('loto6', json, fakeFetch).catch(e => e);
  t('更新スクリプト：最新回のキャリーオーバーを補い、次の回を追加して、未発表（403）で止まる', () => {
    assert.ok(!(changed instanceof Error), String(changed));
    assert.equal(changed.changed, 2);
    assert.equal(json.draws.at(-2).carryover, 233461295);
    assert.equal(json.draws.at(-1).n, 2158);
  });
})();

await (async () => {
  // 予備データ（公開データ）を、取り込み済みデータから作って返す偽の通信
  const csvOf = (list, extra = []) => [...list, ...extra].map(d => [d.n, d.date.replace(/-0?/g, '/'), ...d.main, ...d.bonus, ...d.winners, ...d.prizes].join(',')).join('\n') + '\n';
  const mirrorFetch = (csv, shaOverride) => async url => {
    if (url.includes('mizuhobank')) return { status: 403, ok: false }; // 公式はクラウドからだと全部 403
    if (url.endsWith('meta.json')) return { ok: true, status: 200, text: async () => JSON.stringify({ loto6: { sha256: shaOverride || createHash('sha256').update(csv).digest('hex') } }) };
    return { ok: true, status: 200, text: async () => csv };
  };
  const base = L6.filter(d => d.n <= 2157).map(d => ({ ...d }));
  const next = L6.find(d => d.n === 2158);
  const { carryover, ...nextNoCarry } = next;

  let json = { draws: base.map(d => ({ ...d })) };
  let r = await updateKind('loto6', json, mirrorFetch(csvOf(base, [nextNoCarry]))).catch(e => e);
  t('予備データ：公式に拒否されたら公開データから次の回を追加する', () => {
    assert.ok(!(r instanceof Error), String(r)); assert.equal(r.changed, 1); assert.equal(json.draws.at(-1).n, 2158);
    assert.deepEqual(json.draws.at(-1).main, next.main); assert.match(r.source, /予備/);
  });

  json = { draws: base.map(d => ({ ...d })) };
  const tampered = csvOf(base, [nextNoCarry]).replace(/^2150,(.*?),(\d+),/m, (m0, dt, a) => `2150,${dt},${a === '1' ? 2 : 1},`);
  r = await updateKind('loto6', json, mirrorFetch(tampered)).catch(e => e);
  t('予備データ：取り込み済みの回と食い違っていたら取り込まずにエラー', () => { assert.ok(r instanceof Error); assert.equal(json.draws.at(-1).n, 2157); });

  json = { draws: base.map(d => ({ ...d })) };
  r = await updateKind('loto6', json, mirrorFetch(csvOf(base, [nextNoCarry]), 'deadbeef')).catch(e => e);
  t('予備データ：SHA-256 が合わなければ取り込まずにエラー', () => { assert.ok(r instanceof Error); assert.equal(json.draws.at(-1).n, 2157); });

  json = { draws: base.map(d => ({ ...d })) };
  r = await updateKind('loto6', json, mirrorFetch(csvOf(base))).catch(e => e);
  t('予備データ：新しい回が無ければ何もしない', () => { assert.ok(!(r instanceof Error), String(r)); assert.equal(r.changed, 0); });
})();

// --- キャリーオーバー書き足しスクリプト（データのコピーで試す） ---
{
  const { execFileSync } = await import('child_process');
  const os = await import('os'); const path = await import('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carry-'));
  fs.mkdirSync(path.join(dir, 'tools'), { recursive: true }); fs.mkdirSync(path.join(dir, 'src/data'), { recursive: true });
  for (const f of ['set-carryover.mjs', 'csv.mjs']) fs.copyFileSync(new URL(`./${f}`, import.meta.url), path.join(dir, 'tools', f));
  fs.copyFileSync(new URL('../src/csv.js', import.meta.url), path.join(dir, 'src/csv.js')); // tools/csv.mjs の中身
  const l6 = JSON.parse(fs.readFileSync(new URL('../src/data/loto6.json', import.meta.url)));
  delete l6.draws.find(d => d.n === 2158).carryover;
  fs.writeFileSync(path.join(dir, 'src/data/loto6.json'), JSON.stringify(l6));
  const run = (csvText) => { const f = path.join(dir, 'x.csv'); fs.writeFileSync(f, csvText);
    try { execFileSync('node', [path.join(dir, 'tools/set-carryover.mjs'), 'loto6', f], { stdio: 'pipe' }); return 0; } catch (e) { return e.status; } };
  const read = () => JSON.parse(fs.readFileSync(path.join(dir, 'src/data/loto6.json'))).draws.find(d => d.n === 2158).carryover;
  const ok = fx('A1022158.CSV');
  t('書き足し：キャリーオーバー行が無いCSVは書かずに4', () => { assert.equal(run(ok.replace(/キャリーオーバー.*\r?\n/, '')), 4); assert.equal(read(), undefined); });
  t('書き足し：数字が違えば書かずに4', () => { assert.equal(run(ok.replace('05,13', '05,14')), 4); assert.equal(read(), undefined); });
  t('書き足し：壊れたCSVは書かずに5', () => { assert.equal(run('こわれた'), 5); assert.equal(read(), undefined); });
  t('書き足し：一致すれば書いて0、2回目も0で変えない', () => { assert.equal(run(ok), 0); assert.equal(read(), 0); assert.equal(run(ok), 0); assert.equal(read(), 0); });
  t('書き足し：まだ無い回は3', () => { assert.equal(run(ok.replace('第2158回', '第2999回')), 3); });
  t('書き足し：額が空・切れている・文字なら書かずに4（記録済みの額も変えない）', () => {
    for (const bad of ['キャリーオーバー,', 'キャリーオーバー,2334', 'キャリーオーバー,該当なし', 'キャリーオーバー,12x34円']) {
      assert.equal(run(ok.replace(/キャリーオーバー,0円/, bad)), 4, bad); assert.equal(read(), 0, bad);
    }
  });
  t('書き足し：記録済みの額と違う額は上書きせずに4', () => { assert.equal(run(ok.replace('キャリーオーバー,0円', 'キャリーオーバー,2334円')), 4); assert.equal(read(), 0); });
  fs.rmSync(dir, { recursive: true, force: true });
}

await (async () => {
  // 公式CSVのキャリーオーバーが読めないときは、最新回に何も書かず「更新0件」になる
  const json = { draws: L6.filter(d => d.n <= 2158).map(d => ({ ...d })) }; delete json.draws.at(-1).carryover;
  // 公式と同じ Shift_JIS に戻して渡す
  const sj = new Uint8Array(fxBytes('A1022158.CSV')); const txt = new TextDecoder('shift_jis').decode(sj).replace('キャリーオーバー,0円', 'キャリーオーバー,');
  const { execFileSync } = await import('child_process');
  const sjBytes = execFileSync('python3', ['-c', 'import sys;sys.stdout.buffer.write(sys.stdin.read().encode("cp932"))'], { input: txt });
  const f2 = async url => url.endsWith('A1022158.CSV') ? { ok: true, status: 200, arrayBuffer: async () => sjBytes.buffer.slice(sjBytes.byteOffset, sjBytes.byteOffset + sjBytes.byteLength) } : { ok: false, status: 403 };
  const r1 = await updateKind('loto6', json, f2); const r2 = await updateKind('loto6', json, f2);
  t('更新スクリプト：キャリーオーバーが読めなければ書かず、毎回「更新あり」にならない', () => { assert.equal(r1.changed, 0); assert.equal(r2.changed, 0); assert.equal(json.draws.at(-1).carryover, undefined); });
})();

// =====================================================================
// ミニロト・ビンゴ5・ナンバーズ3・ナンバーズ4
// =====================================================================
const NEW = ['miniloto', 'bingo5', 'numbers3', 'numbers4'];
const D = Object.fromEntries(NEW.map(k => [k, load(k)]));

// --- 照合：ミニロト（各等級の境目） ---
const dm = { main: [1, 2, 3, 4, 5], bonus: [6] };
t('miniloto 1等（5個）', () => assert.equal(judge('miniloto', [1, 2, 3, 4, 5], dm), 1));
t('miniloto 2等（4個＋ボーナス）', () => assert.equal(judge('miniloto', [1, 2, 3, 4, 6], dm), 2));
t('miniloto 3等（4個）', () => assert.equal(judge('miniloto', [1, 2, 3, 4, 7], dm), 3));
t('miniloto 4等（3個）・3個＋ボーナスも4等', () => { assert.equal(judge('miniloto', [1, 2, 3, 7, 8], dm), 4); assert.equal(judge('miniloto', [1, 2, 3, 6, 8], dm), 4); });
t('miniloto 2個＋ボーナスははずれ', () => assert.equal(judge('miniloto', [1, 2, 6, 7, 8], dm), 0));
t('miniloto validTicket', () => {
  assert.ok(validTicket('miniloto', [1, 2, 3, 4, 31])); assert.ok(!validTicket('miniloto', [1, 2, 3, 4, 32]));
  assert.ok(!validTicket('miniloto', [1, 2, 3, 4])); assert.ok(!validTicket('miniloto', [1, 1, 3, 4, 5]));
});

// --- 照合：ビンゴ5（ライン数と等級） ---
const db = { main: [1, 6, 11, 16, 21, 26, 31, 36] };
const bt = hitCells => db.main.map((x, i) => hitCells.includes(i + 1) ? x : x + 1); // 指定したマス（1〜8）だけ一致する申込
t('bingo5 全マス一致は8ライン＝1等', () => { assert.equal(bingoLines(db.main, db.main).length, 8); assert.equal(judge('bingo5', db.main, db), 1); });
t('bingo5 上段だけ＝1ライン＝7等', () => { assert.equal(bingoLines(bt([1, 2, 3]), db.main).length, 1); assert.equal(judge('bingo5', bt([1, 2, 3]), db), 7); });
t('bingo5 FREE を通る十字（マス2・4・5・7）＝2ライン＝6等', () => assert.equal(judge('bingo5', bt([2, 4, 5, 7]), db), 6));
t('bingo5 斜め1本（マス1・8）＝7等、斜め2本（1・3・6・8）＝6等', () => { assert.equal(judge('bingo5', bt([1, 8]), db), 7); assert.equal(judge('bingo5', bt([1, 3, 6, 8]), db), 6); });
t('bingo5 上段＋左列＋斜め（1・2・3・4・6）＝3ライン＝5等', () => assert.equal(judge('bingo5', bt([1, 2, 3, 4, 6]), db), 5));
t('bingo5 上段＋中段（1〜5）＝2ライン、＋マス7で縦＝3ライン＝5等、＋マス8なら斜めと右列で4ライン＝4等', () => { assert.equal(judge('bingo5', bt([1, 2, 3, 4, 5]), db), 6); assert.equal(judge('bingo5', bt([1, 2, 3, 4, 5, 7]), db), 5); assert.equal(judge('bingo5', bt([1, 2, 3, 4, 5, 8]), db), 4); });
t('bingo5 1マス欠け：辺のマスなら6ライン＝2等、角のマスなら5ライン＝3等', () => { for (let k = 1; k <= 8; k++) { const r = judge('bingo5', bt([1, 2, 3, 4, 5, 6, 7, 8].filter(x => x !== k)), db); assert.ok(r === 2 || r === 3, `マス${k}欠け→${r}`); } assert.equal(judge('bingo5', bt([1, 2, 3, 4, 5, 6, 8]), db), 2); assert.equal(judge('bingo5', bt([1, 2, 3, 4, 5, 6, 7]), db), 3); });
t('bingo5 一致なし・ラインなしははずれ', () => { assert.equal(judge('bingo5', bt([]), db), 0); assert.equal(judge('bingo5', bt([1, 5, 6]), db), 0); });
t('bingo5 256通りすべて：7ラインは無く、ライン数と等級の対応が公式どおり', () => {
  const seen = new Set(), map = { 8: 1, 6: 2, 5: 3, 4: 4, 3: 5, 2: 6, 1: 7, 0: 0 };
  for (let m = 0; m < 256; m++) {
    const cells = [1, 2, 3, 4, 5, 6, 7, 8].filter(k => m & (1 << (k - 1)));
    const lines = bingoLines(bt(cells), db.main).length;
    seen.add(lines); assert.equal(judge('bingo5', bt(cells), db), map[lines]);
  }
  assert.ok(!seen.has(7)); assert.deepEqual([...seen].sort(), [0, 1, 2, 3, 4, 5, 6, 8]);
});
t('bingo5 validTicket（各マスの範囲 5k-4〜5k）', () => {
  assert.ok(validTicket('bingo5', [5, 10, 15, 20, 25, 30, 35, 40])); assert.ok(validTicket('bingo5', db.main));
  assert.ok(!validTicket('bingo5', [6, 10, 15, 20, 25, 30, 35, 40])); assert.ok(!validTicket('bingo5', [1, 6, 11, 16, 21, 26, 31]));
});

// --- 照合：ナンバーズ ---
const n3 = { main: [1, 2, 3] }, n3d = { main: [1, 1, 0] }, n4 = { main: [9, 8, 2, 2] };
t('numbers3 ストレート：並びまで一致だけ', () => { assert.equal(judge('numbers3', [1, 2, 3], n3, 'straight'), 'straight'); assert.equal(judge('numbers3', [3, 2, 1], n3, 'straight'), 0); });
t('numbers3 ボックス：順不同で一致（並びが同じでもボックス）', () => {
  assert.equal(judge('numbers3', [3, 1, 2], n3, 'box'), 'box'); assert.equal(judge('numbers3', [1, 2, 3], n3, 'box'), 'box');
  assert.equal(judge('numbers3', [1, 2, 4], n3, 'box'), 0);
});
t('numbers3 ボックス：同じ数字2個の当せん数字（110）', () => {
  assert.equal(judge('numbers3', [0, 1, 1], n3d, 'box'), 'box'); assert.equal(judge('numbers3', [0, 0, 1], n3d, 'box'), 0);
});
t('numbers3 セット：並びまで一致はセット（ストレート）、順不同はセット（ボックス）', () => {
  assert.equal(judge('numbers3', [1, 2, 3], n3, 'set'), 'setStraight'); assert.equal(judge('numbers3', [2, 3, 1], n3, 'set'), 'setBox');
  assert.equal(judge('numbers3', [2, 3, 4], n3, 'set'), 0);
});
t('numbers3 ミニ：下2桁の数字と並びが一致', () => {
  assert.equal(judge('numbers3', [9, 2, 3], n3, 'mini'), 'mini'); assert.equal(judge('numbers3', [1, 3, 2], n3, 'mini'), 0);
  assert.equal(judge('numbers3', [1, 2, 3], n3, 'mini'), 'mini');
});
t('numbers4：ストレート・ボックス・セット', () => {
  assert.equal(judge('numbers4', [9, 8, 2, 2], n4, 'straight'), 'straight'); assert.equal(judge('numbers4', [2, 9, 2, 8], n4, 'box'), 'box');
  assert.equal(judge('numbers4', [2, 2, 8, 9], n4, 'set'), 'setBox'); assert.equal(judge('numbers4', [9, 8, 2, 2], n4, 'set'), 'setStraight');
  assert.equal(judge('numbers4', [9, 8, 2, 3], n4, 'box'), 0);
});
t('ナンバーズ ゾロ目：ボックス・セットは申し込めない（登録不可・照合もはずれ扱い）、ストレートは可', () => {
  assert.ok(!validTicket('numbers3', [7, 7, 7], 'box')); assert.ok(!validTicket('numbers3', [7, 7, 7], 'set')); assert.ok(validTicket('numbers3', [7, 7, 7], 'straight'));
  assert.ok(!validTicket('numbers4', [0, 0, 0, 0], 'set')); assert.ok(validTicket('numbers3', [7, 7, 7], 'mini'));
  assert.equal(judge('numbers3', [7, 7, 7], { main: [7, 7, 7] }, 'box'), 0); assert.equal(judge('numbers3', [7, 7, 7], { main: [7, 7, 7] }, 'straight'), 'straight');
  assert.ok(validTicket('numbers3', [7, 7, 1], 'box'));
});
t('ナンバーズ validTicket（先頭0・範囲・タイプ・ミニは3だけ）', () => {
  assert.ok(validTicket('numbers3', [0, 0, 1], 'straight')); assert.ok(!validTicket('numbers3', [0, 10, 1], 'straight'));
  assert.ok(!validTicket('numbers3', [0, 1], 'straight')); assert.ok(!validTicket('numbers3', [1, 2, 3])); assert.ok(!validTicket('numbers4', [1, 2, 3, 4], 'mini'));
  assert.ok(!validTicket('numbers3', [1, 2, 3], 'jumbo'));
});
// 当せん金は「公式の値を入れた回」で確かめる（公開データから追記した新しい回には当せん金が無いので、最新回は使わない）
t('当せん金の参照：等級・タイプごと、データに無い回は null', () => {
  const x = D.numbers3.find(d => d.n === 7123);
  assert.deepEqual(prizeOf('numbers3', x, 'box'), { label: 'ボックス', amount: 14100 });
  assert.deepEqual(prizeOf('miniloto', D.miniloto.find(d => d.n === 1414), 2), { label: '2等', amount: 98900 });
  assert.deepEqual(prizeOf('numbers3', { main: [1, 2, 3] }, 'mini'), { label: 'ミニ', amount: null });
  assert.deepEqual(prizeOf('bingo5', { main: [] }, 7), { label: '7等', amount: null });
  assert.equal(prizeOf('loto6', L6.at(-1), 0), null);
});
t('高額の当せん：当せん金が分かれば10万円以上、分からなければ等級で（ロト6/7は3等まで・N4はストレートとセット（ストレート）・N3はストレート）', () => {
  assert.ok(isBigWin('loto6', 3, 322900)); assert.ok(!isBigWin('loto6', 4, 6700)); assert.ok(isBigWin('loto6', 3)); assert.ok(!isBigWin('loto6', 4));
  assert.ok(!isBigWin('numbers3', 'setStraight', 49400)); assert.ok(isBigWin('numbers3', 'straight', 115800)); assert.ok(!isBigWin('numbers3', 'straight', 84700));
  assert.ok(isBigWin('numbers4', 'setStraight', 546000)); assert.ok(!isBigWin('numbers4', 'box', 84000));
  assert.ok(!isBigWin('numbers3', 'setStraight')); assert.ok(isBigWin('numbers4', 'setStraight')); assert.ok(!isBigWin('bingo5', 3)); assert.ok(isBigWin('bingo5', 2));
  assert.ok(!isBigWin('miniloto', 0, 0));
  assert.ok(winRank('numbers3', 'straight') < winRank('numbers3', 'mini'));
});

// --- 実データ：当せん番号そのものは最上位 ---
t('実データ 新しい4種類の最新回は1等／ストレート', () => {
  assert.equal(judge('miniloto', D.miniloto.at(-1).main, D.miniloto.at(-1)), 1);
  assert.equal(judge('bingo5', D.bingo5.at(-1).main, D.bingo5.at(-1)), 1);
  assert.equal(judge('numbers3', D.numbers3.at(-1).main, D.numbers3.at(-1), 'straight'), 'straight');
  assert.equal(judge('numbers4', D.numbers4.at(-1).main, D.numbers4.at(-1), 'set'), isZorome(D.numbers4.at(-1).main) ? 0 : 'setStraight');
});

// --- 次回抽せん（曜日と年末年始） ---
const jstDay = r => new Date(r.time.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
t('ミニロト 次回は火曜 18:45', () => { const r = nextDraw('miniloto', { n: 1414, date: '2026-11-24' }, new Date('2026-11-27T03:00:00Z')); assert.equal(r.n, 1415); assert.equal(r.time.toISOString(), '2026-12-01T09:45:00.000Z'); });
t('ビンゴ5 次回は水曜 18:45', () => { const r = nextDraw('bingo5', { n: 498, date: '2026-11-25' }, new Date('2026-11-27T03:00:00Z')); assert.equal(r.n, 499); assert.equal(r.time.toISOString(), '2026-12-02T09:45:00.000Z'); });
t('ナンバーズ 金曜の次は月曜（土日は抽せんなし）', () => { const r = nextDraw('numbers3', { n: 7124, date: '2026-11-27' }, new Date('2026-11-27T12:00:00Z')); assert.equal(r.n, 7125); assert.equal(jstDay(r), '2026-11-30'); });
t('ナンバーズ 抽せん後・翌朝の取り込み前は取り込み待ち1回', () => { const r = nextDraw('numbers4', { n: 7123, date: '2026-11-26' }, new Date('2026-11-27T12:00:00Z')); assert.equal(r.pending, 1); assert.equal(r.n, 7125); assert.equal(jstDay(r), '2026-11-30'); });
t('年末年始（12/31〜1/3）：ナンバーズは12/30(水)の次が1/4(月)、ビンゴ5は1/6、ミニロトは12/29の次が1/5', () => {
  assert.equal(jstDay(nextDraw('numbers3', { n: 1, date: '2026-12-30' }, new Date('2026-12-30T12:00:00Z'))), '2027-01-04');
  assert.equal(jstDay(nextDraw('bingo5', { n: 1, date: '2026-12-30' }, new Date('2026-12-30T12:00:00Z'))), '2027-01-06');
  assert.equal(jstDay(nextDraw('miniloto', { n: 1, date: '2026-12-29' }, new Date('2026-12-29T12:00:00Z'))), '2027-01-05');
});
t('実データ：2015年以降、新しい4種類の次回の日付と回の予測がすべて実際と一致', () => {
  for (const k of NEW) {
    const d = D[k];
    for (let i = 0; i < d.length - 1; i++) {
      if (d[i].date < '2015-01-01') continue;
      const r = nextDraw(k, d[i], new Date(Date.parse(d[i].date + 'T10:00:00Z')));
      assert.equal(`${r.n} ${jstDay(r)}`, `${d[i + 1].n} ${d[i + 1].date}`, `${k} 第${d[i].n}回の次`);
    }
  }
});

// --- 統計 ---
t('ナンバーズ 桁ごとの出現回数の合計＝回数', () => { const f = digitFrequency('numbers4', D.numbers4); f.forEach(c => assert.equal(c.reduce((a, b) => a + b, 0), D.numbers4.length)); });
t('ナンバーズ 最新回の各桁の空白は0', () => { const a = digitAbsence('numbers3', D.numbers3); D.numbers3.at(-1).main.forEach((d, p) => assert.equal(a[p][d], 0)); });
t('ビンゴ5 出現回数の合計＝回数×8', () => assert.equal(frequency('bingo5', D.bingo5).reduce((a, b) => a + b, 0), D.bingo5.length * 8));

// --- 神託（新しい4種類 × 4流派） ---
for (const kind of NEW) for (const s of ['hot', 'cold', 'balance', 'luck']) {
  t(`神託 ${kind} ${s} は正しい番号を5口`, () => {
    const r = oracle(kind, D[kind], s, 5, { birthday: '1990-05-05' });
    assert.equal(r.length, 5);
    r.forEach(x => assert.ok(validTicket(kind, x, kind.startsWith('numbers') ? suggestType(kind, x) : undefined), x.join(',')));
    assert.equal(new Set(r.map(x => x.join())).size, 5);
  });
}
t('神託 ナンバーズは並べかえない（桁の順のまま）・ビンゴ5はマス順', () => {
  const r = oracle('numbers4', D.numbers4, 'hot', 5); assert.ok(r.every(x => x.length === 4));
  const b = oracle('bingo5', D.bingo5, 'cold', 5); assert.ok(b.every(x => x.every((n, i) => Math.ceil(n / 5) === i + 1)));
});
t('運気派 ビンゴ5・ナンバーズも同じ日・同じ誕生日なら同じ', () => {
  for (const k of ['bingo5', 'numbers3']) {
    const a = oracle(k, D[k], 'luck', 3, { today: '2026-11-26', birthday: '1990-05-05' });
    const b = oracle(k, D[k], 'luck', 3, { today: '2026-11-26', birthday: '1990-05-05' });
    const c = oracle(k, D[k], 'luck', 3, { today: '2026-11-27', birthday: '1990-05-05' });
    assert.deepEqual(a, b); assert.notDeepEqual(a, c);
  }
});
t('申込タイプの例：ゾロ目はストレート、それ以外はセット', () => { assert.equal(suggestType('numbers3', [5, 5, 5]), 'straight'); assert.equal(suggestType('numbers3', [5, 5, 1]), 'set'); });
t('流派の説明はくじに合わせる（ロトは従来どおり）', () => { assert.equal(schoolDesc('loto6', 'hot'), '直近100回でよく出ている数字を多めに選ぶ'); assert.match(schoolDesc('numbers3', 'hot'), /桁ごと/); assert.match(schoolDesc('bingo5', 'cold'), /マスごと/); });

// --- かぶりにくさ指数（新しい4種類） ---
t('ミニロト 1,2,3,4,5 はかぶりやすい・散らばった数字はかぶりにくい', () => {
  assert.equal(kaburi('miniloto', [1, 2, 3, 4, 5]).label, 'かぶりやすい');
  assert.ok(kaburi('miniloto', [4, 13, 19, 26, 30]).score >= 80, JSON.stringify(kaburi('miniloto', [4, 13, 19, 26, 30])));
});
t('ナンバーズ ゾロ目・123・1234・前回と同じはかぶりやすい', () => {
  assert.equal(kaburi('numbers3', [7, 7, 7]).label, 'かぶりやすい'); assert.equal(kaburi('numbers3', [1, 2, 3]).label, 'かぶりやすい');
  assert.equal(kaburi('numbers4', [1, 2, 3, 4]).label, 'かぶりやすい'); assert.equal(kaburi('numbers4', [4, 3, 2, 1]).label, 'かぶりやすい');
  const last = { main: [8, 3, 0, 6] };
  assert.ok(kaburi('numbers4', [8, 3, 0, 6], last).score < kaburi('numbers4', [8, 3, 0, 6]).score);
});
t('ナンバーズ 誕生日のような MMDD（1225）・同じ数字が多いと減点、散らばった数字はかぶりにくい', () => {
  assert.ok(kaburi('numbers4', [1, 2, 2, 5]).reasons.some(r => r.includes('月日')));
  assert.ok(kaburi('numbers4', [9, 3, 8, 6]).score >= 80, JSON.stringify(kaburi('numbers4', [9, 3, 8, 6])));
  assert.ok(kaburi('numbers4', [5, 5, 5, 8]).score < kaburi('numbers4', [5, 2, 7, 8]).score);
  assert.ok(kaburi('numbers3', [9, 4, 7]).score >= 80);
});
t('ビンゴ5 各マスの一番小さい数字ばかり・前回と同じはかぶりやすい', () => {
  assert.ok(kaburi('bingo5', [1, 6, 11, 16, 21, 26, 31, 36]).score < 80);
  assert.equal(kaburi('bingo5', D.bingo5.at(-1).main, D.bingo5.at(-1)).label, 'かぶりやすい');
  assert.ok(kaburi('bingo5', [3, 9, 12, 20, 22, 28, 34, 37]).score >= 80);
});
t('かぶりにくさ 新しい4種類も点数は0〜100', () => {
  for (const k of NEW) for (let i = 0; i < 200; i++) {
    const [x] = oracle(k, D[k], i % 2 ? 'balance' : 'cold', 1);
    const r = kaburi(k, x, D[k].at(-1)); assert.ok(r.score >= 0 && r.score <= 100 && r.reasons.length);
  }
});

// --- 公式CSV（ミニロト・ビンゴ5・ナンバーズの実物） ---
const ofx = f => fx(`official/${f}`);
t('公式CSV ミニロト 第1414回', () => assert.deepEqual(parseCsv('miniloto', ofx('A1011414.CSV')),
  { n: 1414, date: '2026-11-24', main: [2, 10, 11, 24, 31], bonus: [3], winners: [25, 108, 2464, 56269], prizes: [5951600, 98900, 7500, 800] }));
t('公式CSV ビンゴ5 第498回（回は0埋め4桁）', () => assert.deepEqual(parseBingo5Csv(ofx('A1040498.CSV')),
  { n: 498, date: '2026-11-25', main: [3, 9, 13, 17, 21, 29, 35, 40], winners: [4, 49, 269, 602, 4400, 21116, 169604], prizes: [4665800, 301100, 24700, 17800, 2200, 600, 200] }));
t('公式CSV ナンバーズ 第7123回（3と4が1ファイル）', () => assert.deepEqual(parseNumbersCsv(ofx('A1007123.CSV')), {
  n: 7123, date: '2026-11-26',
  numbers3: { main: [4, 1, 2], winners: { straight: 68, box: 381, setStraight: 212, setBox: 916, mini: 360 }, prizes: { straight: 84700, box: 14100, setStraight: 49400, setBox: 7000, mini: 8400 } },
  numbers4: { main: [9, 8, 2, 2], winners: { straight: 9, box: 203, setStraight: 52, setBox: 745 }, prizes: { straight: 1008000, box: 84000, setStraight: 546000, setBox: 42000 } },
}));
t('公式CSV 種類違い・壊れたCSVははじく', () => {
  assert.throws(() => parseCsv('miniloto', fx('A1022157.CSV'))); assert.throws(() => parseBingo5Csv(ofx('A1011414.CSV')));
  assert.throws(() => parseNumbersCsv(ofx('A1040498.CSV'))); assert.throws(() => parseBingo5Csv(ofx('A1040498.CSV').replace(',03,09,', ',03,03,')));
  assert.throws(() => parseNumbersCsv(ofx('A1007123.CSV').replace('抽せん数字,412', '抽せん数字,41')));
  assert.throws(() => parseCsv('miniloto', ofx('A1011414.CSV').replace('02,10', '02,02')));
});
t('公式CSV ナンバーズ：該当なしの等級は 0', () => {
  const r = parseNumbersCsv(ofx('A1007123.CSV').replace('ボックス,381口,14100円', 'ボックス,該当なし,該当なし'));
  assert.equal(r.numbers3.winners.box, 0); assert.equal(r.numbers3.prizes.box, 0);
});
t('取り込み済みデータは公式CSVと一致（ミニロト1414・ビンゴ5 498・ナンバーズ7123）', () => {
  assert.deepEqual(D.miniloto.find(x => x.n === 1414), parseCsv('miniloto', ofx('A1011414.CSV')));
  assert.deepEqual(D.bingo5.find(x => x.n === 498), parseBingo5Csv(ofx('A1040498.CSV')));
  const nc = parseNumbersCsv(ofx('A1007123.CSV'));
  for (const k of ['numbers3', 'numbers4']) assert.deepEqual(D[k].find(x => x.n === 7123), { n: 7123, date: '2026-11-26', ...nc[k] });
});
t('公式CSVのURL', () => {
  assert.equal(officialCsvUrl('miniloto', 1414), 'https://www.mizuhobank.co.jp/retail/takarakuji/loto/miniloto/csv/A1011414.CSV');
  assert.equal(officialCsvUrl('numbers4', 7123), 'https://www.mizuhobank.co.jp/retail/takarakuji/numbers/csv/A1007123.CSV');
  assert.equal(officialCsvUrl('bingo5', 498), 'https://www.mizuhobank.co.jp/retail/takarakuji/bingo/bingo5/csv/A1040498.CSV');
});

// --- データファイル：形・連続性と、公式の直近20回の当せん金 ---
const recent = loadRecent();
for (const k of NEW) {
  t(`データ ${k}：第1回から連続・日付が増える・数字が範囲内・形がそろう`, () => {
    const json = JSON.parse(fs.readFileSync(new URL(`../src/data/${k}.json`, import.meta.url)));
    assert.equal(json.kind, k); assert.match(json.source, /lotto-data-hub/); assert.match(json.source, /公式発表でご確認ください/);
    assert.equal(json.draws[0].n, 1); checkSequence(json.draws);
    json.draws.forEach(d => { checkDraw(k, d); assert.equal('prizes' in d, 'winners' in d, `第${d.n}回`); });
  });
  t(`データ ${k}：公式の直近20回の当せん金・口数が正しく入っている`, () => {
    assert.equal(recent[k].length, 20);
    for (const r of recent[k]) assert.deepEqual(D[k].find(x => x.n === r.n), r, `第${r.n}回`);
  });
}
t('データ：fixtures の直近20回は、公式CSVの実物とも一致（ナンバーズは3・4とも）', () => {
  assert.deepEqual(recent.miniloto.find(x => x.n === 1414), parseCsv('miniloto', ofx('A1011414.CSV')));
  assert.deepEqual(recent.bingo5.find(x => x.n === 498), parseBingo5Csv(ofx('A1040498.CSV')));
  const nc = parseNumbersCsv(ofx('A1007123.CSV'));
  assert.deepEqual(recent.numbers4.find(x => x.n === 7123), { n: 7123, date: '2026-11-26', ...nc.numbers4 });
});

// --- 公開データ（lotto-data-hub）からの追記 ---
await (async () => {
  const toHub = (kind, list) => [...list].reverse().map(d => ({ round: d.n, date: d.date, numbers: d.main, bonus: kind === 'miniloto' ? d.bonus : [] }));
  const FAR = new Date('2100-01-01T00:00:00Z'); // 追記する回の抽せん時刻を過ぎていることにする
  const hubFetch = body => async url => { assert.match(url, /lotto-data-hub\/data\/\w+\.json$/); return { ok: true, status: 200, text: async () => JSON.stringify(body) }; };
  for (const kind of NEW) {
    const all = D[kind], base = all.slice(0, -1).map(d => ({ ...d })), last = all.at(-1);
    let json = { draws: base.map(d => ({ ...d })) };
    let r = await updateHubKind(kind, json, hubFetch(toHub(kind, all)), FAR).catch(e => e);
    t(`公開データ ${kind}：新しい回を1つ追記（当せん金は付けない）`, () => {
      assert.ok(!(r instanceof Error), String(r)); assert.equal(r.changed, 1);
      const got = json.draws.at(-1); assert.equal(got.n, last.n); assert.deepEqual(got.main, last.main); assert.ok(!('prizes' in got));
    });
  }
  const kind = 'numbers3', all = D[kind], base = all.slice(0, -1);
  const tryWith = async body => { const json = { draws: base.map(d => ({ ...d })) }; const r = await updateHubKind(kind, json, hubFetch(body), FAR).catch(e => e); return { r, json }; };
  const hub = toHub(kind, all);
  const cases = {
    '直近20回のどれかが手元と違う': hub.map(x => x.round === base.at(-5).n ? { ...x, numbers: x.numbers.map(v => (v + 1) % 10) } : x),
    '回が飛んでいる': hub.map(x => x.round === all.at(-1).n ? { ...x, round: x.round + 1 } : x),
    '日付が増えていない': hub.map(x => x.round === all.at(-1).n ? { ...x, date: base.at(-1).date } : x),
    '数字が範囲外': hub.map(x => x.round === all.at(-1).n ? { ...x, numbers: [1, 10, 2] } : x),
    '桁の数が違う': hub.map(x => x.round === all.at(-1).n ? { ...x, numbers: [1, 2] } : x),
    '手元の回が公開データに無い': hub.filter(x => x.round !== base.at(-3).n),
    '配列でない': { data: hub },
  };
  for (const [name, body] of Object.entries(cases)) {
    const { r, json } = await tryWith(body);
    t(`公開データ：${name}なら取り込まずにエラー`, () => { assert.ok(r instanceof Error); assert.equal(json.draws.length, base.length); });
  }
  {
    const json = { draws: all.map(d => ({ ...d })) };
    const r = await updateHubKind(kind, json, hubFetch(hub), FAR).catch(e => e);
    t('公開データ：新しい回が無ければ何もしない', () => { assert.ok(!(r instanceof Error), String(r)); assert.equal(r.changed, 0); });
    const r2 = await updateHubKind(kind, { draws: all.map(d => ({ ...d })) }, async () => ({ ok: false, status: 404 })).catch(e => e);
    t('公開データ：取得できなければエラー', () => assert.ok(r2 instanceof Error));
  }
  {
    const b = toHub('bingo5', D.bingo5).map(x => x.round === D.bingo5.at(-1).n ? { ...x, numbers: [6, ...x.numbers.slice(1)] } : x);
    const json = { draws: D.bingo5.slice(0, -1).map(d => ({ ...d })) };
    const r = await updateHubKind('bingo5', json, hubFetch(b), FAR).catch(e => e);
    t('公開データ ビンゴ5：マスの範囲外の数字ならエラー', () => { assert.ok(r instanceof Error); assert.equal(json.draws.length, D.bingo5.length - 1); });
    const m = toHub('miniloto', D.miniloto).map(x => x.round === D.miniloto.at(-1).n ? { ...x, bonus: [x.numbers[0]] } : x);
    const json2 = { draws: D.miniloto.slice(0, -1).map(d => ({ ...d })) };
    const r3 = await updateHubKind('miniloto', json2, hubFetch(m), FAR).catch(e => e);
    t('公開データ ミニロト：ボーナスが本数字と重複ならエラー', () => { assert.ok(r3 instanceof Error); assert.equal(json2.draws.length, D.miniloto.length - 1); });
  }
  // 抽せん日どおりか・未来の回でないか・一度に追記する回数
  {
    const last = all.at(-1), next = nextDraw(kind, last, new Date(Date.parse(`${last.date}T10:00:00Z`)));
    const nextDate = new Date(next.time.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
    const add = (date, extra = {}) => [{ round: last.n + 1, date, numbers: [1, 2, 3], bonus: [], ...extra }, ...hub];
    const base2 = () => ({ draws: all.map(d => ({ ...d })) });
    let j = base2(), r = await updateHubKind(kind, j, hubFetch(add(nextDate)), FAR).catch(e => e);
    t('公開データ：抽せん日どおりの次の回は追記できる', () => { assert.ok(!(r instanceof Error), String(r)); assert.equal(j.draws.at(-1).date, nextDate); });
    const wrongDay = new Date(next.time.getTime() + 9 * 3600e3 + 86400e3 * (new Date(next.time).getUTCDay() === 5 ? 1 : 0) + 86400e3).toISOString().slice(0, 10);
    j = base2(); r = await updateHubKind(kind, j, hubFetch(add(wrongDay)), FAR).catch(e => e);
    t('公開データ：抽せん日でない日付の回はエラー（取り込まない）', () => { assert.ok(r instanceof Error, wrongDay); assert.match(r.message, /抽せん日/); assert.equal(j.draws.length, all.length); });
    j = base2(); r = await updateHubKind(kind, j, hubFetch(add(nextDate)), new Date(next.time.getTime() - 60e3)).catch(e => e);
    t('公開データ：まだ抽せん前（今日より先・抽せん時刻前）の回はエラー', () => { assert.ok(r instanceof Error); assert.match(r.message, /抽せん前/); assert.equal(j.draws.length, all.length); });
    const short = all.slice(0, -60).map(d => ({ ...d }));
    j = { draws: short }; r = await updateHubKind(kind, j, hubFetch(hub), FAR).catch(e => e);
    t(`公開データ：一度に追記するのは最大${MAX_NEW}回（残りは次回）`, () => {
      assert.ok(!(r instanceof Error), String(r)); assert.equal(r.changed, MAX_NEW); assert.equal(j.draws.at(-1).n, all.at(-11).n);
      r = null;
    });
    const r2 = await updateHubKind(kind, j, hubFetch(hub), FAR).catch(e => e);
    t('公開データ：2回目の実行で残りを追記', () => { assert.ok(!(r2 instanceof Error), String(r2)); assert.equal(j.draws.at(-1).n, all.at(-1).n); });
  }
})();

// --- 通し：4種類すべてに「当せん金なしの新しい回」を追記した状態でも、テストが全部通る ---
// （明朝の自動取り込みの直後にテストが落ちて、ロト6・7の公開まで止まることがないように）
if (!process.env.LOTOJINJA_NESTED) {
  const { execFileSync } = await import('child_process');
  const os = await import('os'); const path = await import('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'append-'));
  const root = new URL('../', import.meta.url).pathname;
  for (const f of ['src', 'tools', 'package.json']) fs.cpSync(path.join(root, f), path.join(dir, f), { recursive: true });
  const hubMod = await import(path.join(dir, 'tools/hub.mjs'));
  let added = 0;
  for (const kind of NEW) {
    const file = path.join(dir, 'src/data', `${kind}.json`);
    const json = JSON.parse(fs.readFileSync(file));
    // 予定どおりの日付で3回分（数字は範囲内の適当な値）を作り、公開データの形にして取り込みの手順を通す
    const extra = []; let prev = json.draws.at(-1);
    for (let i = 0; i < 3; i++) {
      const nx = nextDraw(kind, prev, new Date(Date.parse(`${prev.date}T10:00:00Z`)));
      const date = new Date(nx.time.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
      const main = kind === 'miniloto' ? [3, 8, 14, 22, 30] : kind === 'bingo5' ? [2, 7, 12, 17, 22, 27, 32, 37] : kind === 'numbers3' ? [0, i, 7] : [0, 0, i, 9];
      prev = { n: nx.n, date, main, ...(kind === 'miniloto' ? { bonus: [5] } : {}) }; extra.push(prev);
    }
    const body = [...json.draws, ...extra].reverse().map(d => ({ round: d.n, date: d.date, numbers: d.main, bonus: d.bonus || [] }));
    const r = await hubMod.updateHubKind(kind, json, async () => ({ ok: true, status: 200, text: async () => JSON.stringify(body) }), new Date('2100-01-01T00:00:00Z'));
    added += r.changed;
    fs.writeFileSync(file, JSON.stringify(json));
  }
  let out = '', code = 0;
  try { out = execFileSync('node', [path.join(dir, 'tools/test.mjs')], { env: { ...process.env, LOTOJINJA_NESTED: '1' }, stdio: 'pipe' }).toString(); }
  catch (e) { code = e.status; out = String(e.stdout) + String(e.stderr); }
  fs.rmSync(dir, { recursive: true, force: true });
  t('通し：4種類に当せん金なしの新しい回を3回ずつ追記しても、全テストが通る', () => { assert.equal(added, 12); assert.equal(code, 0, out.slice(-1500)); assert.match(out, /すべて合格/); });
}

// --- 当せん金の書き足しスクリプト set-official.mjs（データのコピーで試す） ---
{
  const { execFileSync } = await import('child_process');
  const os = await import('os'); const path = await import('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'official-'));
  fs.mkdirSync(path.join(dir, 'tools'), { recursive: true }); fs.mkdirSync(path.join(dir, 'src/data'), { recursive: true });
  for (const f of ['set-official.mjs', 'csv.mjs']) fs.copyFileSync(new URL(`./${f}`, import.meta.url), path.join(dir, 'tools', f));
  fs.copyFileSync(new URL('../src/csv.js', import.meta.url), path.join(dir, 'src/csv.js')); // tools/csv.mjs の中身
  const dataPath = k => path.join(dir, 'src/data', `${k}.json`);
  // 対象の回から当せん金（とキャリーオーバー）を消したコピーを用意する
  const reset = () => {
    for (const [k, no] of [['miniloto', 1414], ['bingo5', 498], ['numbers3', 7123], ['numbers4', 7123], ['loto6', 2158]]) {
      const j = JSON.parse(fs.readFileSync(new URL(`../src/data/${k}.json`, import.meta.url)));
      const d = j.draws.find(x => x.n === no);
      if (k === 'loto6') delete d.carryover; else { delete d.winners; delete d.prizes; }
      fs.writeFileSync(dataPath(k), JSON.stringify(j));
    }
  };
  const run = (kind, text, raw) => { const f = path.join(dir, 'x.csv'); fs.writeFileSync(f, raw || text);
    try { execFileSync('node', [path.join(dir, 'tools/set-official.mjs'), kind, f], { stdio: 'pipe' }); return 0; } catch (e) { return e.status; } };
  const get = (k, no) => JSON.parse(fs.readFileSync(dataPath(k))).draws.find(x => x.n === no);
  const mini = ofx('A1011414.CSV'), bingo = ofx('A1040498.CSV'), nums = ofx('A1007123.CSV');
  reset();
  t('書き足し(公式)：使い方の誤りは2', () => { assert.equal(run('jumbo', mini), 2); });
  t('書き足し(公式)：ミニロト 数字が違えば書かずに4', () => { assert.equal(run('miniloto', mini.replace('02,10,11', '02,10,12')), 4); assert.equal(get('miniloto', 1414).prizes, undefined); });
  t('書き足し(公式)：ミニロト 日付が違えば書かずに4', () => { assert.equal(run('miniloto', mini.replace('令和8年11月24日', '令和8年11月25日')), 4); assert.equal(get('miniloto', 1414).prizes, undefined); });
  t('書き足し(公式)：壊れたCSVは5・まだ無い回は3', () => { assert.equal(run('miniloto', 'こわれた'), 5); assert.equal(run('miniloto', mini.replace('第1414回', '第1999回')), 3); });
  t('書き足し(公式)：ミニロト 一致すれば書いて0（Shift_JIS のまま渡す）、2回目も0', () => {
    assert.equal(run('miniloto', null, fxBytes('official/A1011414.CSV')), 0);
    assert.deepEqual(get('miniloto', 1414).prizes, [5951600, 98900, 7500, 800]); assert.deepEqual(get('miniloto', 1414).winners, [25, 108, 2464, 56269]);
    assert.ok(!('carryover' in get('miniloto', 1414)));
    assert.equal(run('miniloto', mini), 0);
  });
  t('書き足し(公式)：記録済みの値と違えば上書きせずに4', () => { assert.equal(run('miniloto', mini.replace('25口,5951600円', '26口,5951600円')), 4); assert.deepEqual(get('miniloto', 1414).winners, [25, 108, 2464, 56269]); });
  t('書き足し(公式)：ビンゴ5 一致すれば書いて0', () => { assert.equal(run('bingo5', bingo), 0); assert.deepEqual(get('bingo5', 498).prizes, [4665800, 301100, 24700, 17800, 2200, 600, 200]); });
  t('書き足し(公式)：ナンバーズ 4の数字が違えば3も4も書かずに4', () => {
    assert.equal(run('numbers', nums.replace('抽せん数字,9822', '抽せん数字,9823')), 4);
    assert.equal(get('numbers3', 7123).prizes, undefined); assert.equal(get('numbers4', 7123).prizes, undefined);
  });
  t('書き足し(公式)：ナンバーズ 1ファイルで3と4の両方を書いて0', () => {
    assert.equal(run('numbers', nums), 0);
    assert.deepEqual(get('numbers3', 7123).prizes, { straight: 84700, box: 14100, setStraight: 49400, setBox: 7000, mini: 8400 });
    assert.deepEqual(get('numbers4', 7123).winners, { straight: 9, box: 203, setStraight: 52, setBox: 745 });
    assert.equal(run('numbers4', nums), 0);
  });
  t('書き足し(公式)：ロト6 はキャリーオーバーも書き足す（口数・金額が一致しているとき）', () => {
    assert.equal(run('loto6', fx('A1022158.CSV')), 0); assert.equal(get('loto6', 2158).carryover, 0);
    assert.equal(run('loto6', fx('A1022158.CSV').replace('キャリーオーバー,0円', 'キャリーオーバー,5円')), 4); assert.equal(get('loto6', 2158).carryover, 0);
    assert.equal(run('loto6', fx('A1022158.CSV').replace(/^２等,.*$/m, '２等,1口,1円')), 4);
  });
  fs.rmSync(dir, { recursive: true, force: true });
}

// --- 端末に保存したデータの互換（ロト6・ロト7の登録はそのまま読める） ---
t('保存データ：既存のロト6・ロト7の登録番号はそのまま有効', () => {
  assert.ok(validTicket('loto6', [1, 2, 3, 4, 5, 43], undefined)); assert.ok(validTicket('loto7', [1, 2, 3, 4, 5, 6, 37], undefined));
  assert.equal(GAMES.loto6.max, 43); assert.deepEqual(GAMES.loto7.drawDays, [5]);
});

// --- キャラのせりふ（src/lines.js、仕様 docs/lines-spec.md）。時刻はすべて日本時間で書く ---
const J = s => new Date(s + '+09:00');
const seq = (p, len = 31) => Array.from({ length: len }, (_, i) => `${p}${i + 1}`);
const FB = { home: ['予備ホーム1', '予備ホーム2', '予備ホーム3'], pray: ['予備お祈り'], cutin: ['予備カットイン'], big: ['予備大当たり'], win: ['予備当せん'], lose: ['予備はずれ'] };
const fullLines = () => Object.fromEntries(LINE_KEYS.map(k => [k, ['drawday', 'carryover'].includes(k)
  ? Array.from({ length: 31 }, (_, i) => `今夜は{game}${i + 1}`) : k === 'cutin' ? seq('シャン') : seq(`${k}の${''}`)]));

t('せりふ：日本時間の日付（UTCでは前日でも日本時間の日付）', () => {
  assert.equal(lineDay(new Date('2026-11-30T15:00:00Z')), 1); // 日本時間 12/1 0:00
  assert.equal(lineDay(new Date('2026-11-30T14:59:00Z')), 30);
  assert.equal(lineDay(J('2026-12-31T23:59')), 31);
});
t('せりふ：日付の (日-1) 番目を選ぶ', () => {
  const L = { morning: seq('朝') };
  assert.equal(chooseLine('morning', J('2026-11-01T08:00'), L), '朝1');
  assert.equal(chooseLine('morning', J('2026-11-27T08:00'), L), '朝27');
  assert.equal(chooseLine('morning', J('2026-12-31T08:00'), L), '朝31');
  assert.equal(chooseLine('morning', new Date('2026-11-30T15:30:00Z'), L), '朝1'); // UTCでは11/30、日本時間は12/1
});
t('せりふ：{game} をくじ名に置き換える（何回出てきても）', () => {
  const L = { drawday: Array(31).fill('今夜は{game}の抽せん日。{game}を楽しもう'), carryover: Array(31).fill('{game}はキャリーオーバー') };
  assert.equal(chooseLine('drawday', J('2026-11-27T10:00'), L, { game: 'numbers3' }), '今夜はナンバーズ3の抽せん日。ナンバーズ3を楽しもう');
  assert.equal(chooseLine('carryover', J('2026-11-27T10:00'), L, { game: 'loto7' }), 'ロト7はキャリーオーバー');
  assert.equal(chooseLine('drawday', J('2026-11-27T10:00'), L, { game: 'bingo5' }), '今夜はビンゴ5の抽せん日。ビンゴ5を楽しもう');
});
t('せりふ：ファイルが読めない（null）ときは予備を使う', () => {
  assert.equal(chooseLine('morning', J('2026-11-01T08:00'), null, { fallback: FB }), '予備ホーム1');
  assert.equal(chooseLine('drawday', J('2026-11-02T08:00'), null, { fallback: FB, game: 'loto6' }), '予備ホーム2');
  assert.equal(chooseLine('loto6', J('2026-11-04T08:00'), null, { fallback: FB }), '予備ホーム1'); // 3個を日付でくり返す
  assert.equal(chooseLine('pray', J('2026-11-27T08:00'), undefined, { fallback: FB }), '予備お祈り');
  assert.equal(chooseLine('cutin', J('2026-11-27T08:00'), 'こわれた', { fallback: FB }), '予備カットイン');
  for (const k of ['big', 'win', 'lose']) assert.equal(chooseLine(k, J('2026-11-27T08:00'), [], { fallback: FB }), FB[k][0]);
});
t('せりふ：31個未満・空・文字列でない・キーが無いときも予備を使う', () => {
  const L = { morning: seq('朝', 30), noon: Array(31).fill(''), night: Array(31).fill(5), win: seq('当', 31) };
  assert.equal(chooseLine('morning', J('2026-12-30T08:00'), L, { fallback: FB }), '朝30'); // ある分はそのまま
  assert.equal(chooseLine('morning', J('2026-12-31T08:00'), L, { fallback: FB }), '予備ホーム1'); // 31番目が無い
  assert.equal(chooseLine('noon', J('2026-11-27T12:00'), L, { fallback: FB }), '予備ホーム3');
  assert.equal(chooseLine('night', J('2026-11-27T20:00'), L, { fallback: FB }), '予備ホーム3');
  assert.equal(chooseLine('lose', J('2026-11-27T20:00'), L, { fallback: FB }), '予備はずれ');
  assert.equal(chooseLine('win', J('2026-11-27T20:00'), L, { fallback: FB }), '当27');
  assert.equal(chooseLine('morning', J('2026-11-27T08:00'), null), ''); // 予備も無くても落ちない
  assert.equal(chooseLine('cutin', J('2026-11-27T08:00'), null), 'ご祈祷中…');
});
t('ホームの状況：年末年始（12/31〜1/3、日本時間）が一番先', () => {
  const carry = { carryover: 500000000 };
  assert.equal(homeSituation('loto6', J('2026-12-31T10:00'), carry), 'newyear'); // 木曜（ふだんはロト6の抽せん日）でも
  assert.equal(homeSituation('numbers3', J('2027-01-01T10:00')), 'newyear');
  assert.equal(homeSituation('loto7', J('2027-01-03T23:59'), carry), 'newyear');
  assert.equal(homeSituation('loto6', new Date('2026-12-30T15:00:00Z')), 'newyear'); // UTCでは12/30、日本時間は12/31 0:00
  assert.equal(homeSituation('loto6', J('2027-01-04T12:00')), 'drawday'); // 1/4(月) は抽せんあり
  assert.equal(homeSituation('bingo5', J('2026-12-30T12:00')), 'drawday'); // 12/30(水) は抽せんあり
});
t('ホームの状況：drawday は抽せん日の 12:00〜18:44 だけ（朝はふつうの順番）', () => {
  assert.equal(homeSituation('loto6', J('2026-11-26T11:59')), 'noon'); // 11/26(木)・偶数日
  assert.equal(homeSituation('loto6', J('2026-11-26T12:00')), 'drawday');
  assert.equal(homeSituation('loto6', J('2026-11-26T08:00')), 'morning');
  assert.equal(homeSituation('loto6', J('2026-11-26T00:00')), 'night');
  assert.equal(homeSituation('loto7', J('2026-11-27T09:00')), 'loto7'); // 金・奇数日
  assert.equal(homeSituation('numbers3', J('2026-11-27T11:59')), 'numbers3');
  assert.equal(homeSituation('numbers4', J('2026-11-30T10:00')), 'morning'); // 月・偶数日
  assert.equal(homeSituation('loto6', new Date('2026-11-26T03:00:00Z')), 'drawday'); // UTC 3:00 ＝ 日本時間 12:00
  assert.equal(homeSituation('loto6', new Date('2026-11-26T02:59:00Z')), 'noon');
});
t('ホームの状況：抽せん日の当日 18:44 は drawday、18:46 は過ぎている', () => {
  assert.equal(homeSituation('loto6', J('2026-11-26T18:44')), 'drawday'); // 11/26(木)
  assert.equal(homeSituation('loto6', J('2026-11-26T18:46')), 'night'); // 偶数日なので時間帯
  assert.equal(homeSituation('loto6', J('2026-11-26T18:45')), 'night'); // 抽せん時刻ちょうどはもう前ではない
  assert.equal(homeSituation('loto7', J('2026-11-27T18:44')), 'drawday'); // 金
  assert.equal(homeSituation('loto7', J('2026-11-27T18:46')), 'loto7'); // 奇数日なのでくじ別
  assert.equal(homeSituation('loto6', J('2026-11-27T10:00')), 'loto6'); // ロト6は金曜は抽せんなし
  assert.equal(homeSituation('miniloto', J('2026-11-24T15:00')), 'drawday'); // 火
  assert.equal(homeSituation('bingo5', J('2026-11-25T15:00')), 'drawday'); // 水
  assert.equal(homeSituation('loto6', new Date('2026-11-26T09:44:00Z')), 'drawday'); // UTC 9:44 ＝ 日本時間 18:44
  assert.equal(homeSituation('loto6', new Date('2026-11-25T16:00:00Z')), 'night'); // UTCでは水曜、日本時間は木曜 1:00（12時前）
  assert.equal(homeSituation('loto6', new Date('2026-11-26T05:00:00Z')), 'drawday'); // 日本時間 木曜 14:00
});
t('ホームの状況：ナンバーズは月〜金が抽せん日', () => {
  for (const d of ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27']) {
    assert.equal(homeSituation('numbers3', J(`${d}T12:00`)), 'drawday'); assert.equal(homeSituation('numbers4', J(`${d}T18:44`)), 'drawday');
  }
  assert.equal(homeSituation('numbers4', J('2026-11-28T12:00')), 'noon'); // 土・偶数日
  assert.equal(homeSituation('numbers3', J('2026-11-29T12:00')), 'numbers3'); // 日・奇数日
});
t('ホームの状況：キャリーオーバーは抽せん日の次、ロト6・ロト7で 0 より大きいときだけ', () => {
  const c = { carryover: 123456789 };
  assert.equal(homeSituation('loto6', J('2026-11-26T18:44'), c), 'drawday');
  assert.equal(homeSituation('loto6', J('2026-11-26T18:46'), c), 'carryover');
  assert.equal(homeSituation('loto7', J('2026-11-28T08:00'), c), 'carryover');
  assert.equal(homeSituation('loto7', J('2026-11-28T08:00'), { carryover: 0 }), 'morning');
  assert.equal(homeSituation('loto7', J('2026-11-28T08:00'), {}), 'morning');
  assert.equal(homeSituation('loto7', J('2026-11-28T08:00'), null), 'morning');
  assert.equal(homeSituation('miniloto', J('2026-11-28T08:00'), c), 'morning'); // キャリーオーバーはロト6・ロト7だけ
  assert.equal(homeSituation('bingo5', J('2026-11-29T08:00'), c), 'bingo5');
});
t('ホームの状況：奇数日はくじ別、偶数日は時間帯（日本時間の日付）', () => {
  for (const g of ['loto6', 'loto7', 'miniloto', 'bingo5', 'numbers3', 'numbers4']) {
    assert.equal(homeSituation(g, J('2026-11-29T12:00')), g); // 日曜・29日
    assert.equal(homeSituation(g, J('2026-11-28T12:00')), 'noon'); // 土曜・28日
  }
  assert.equal(homeSituation('loto6', J('2026-11-28T23:59')), 'night');
  assert.equal(homeSituation('loto6', J('2026-11-29T00:00')), 'loto6');
  assert.equal(homeSituation('loto6', new Date('2026-11-27T20:00:00Z')), 'morning'); // UTCでは27日（奇数）、日本時間は28日 5:00
});
t('ホームの状況：時間帯の境目（朝 5:00〜10:59／昼 11:00〜16:59／夜 17:00〜4:59）', () => {
  const at = hm => homeSituation('loto6', J(`2026-11-28T${hm}`));
  assert.equal(at('04:59'), 'night'); assert.equal(at('05:00'), 'morning');
  assert.equal(at('10:59'), 'morning'); assert.equal(at('11:00'), 'noon');
  assert.equal(at('16:59'), 'noon'); assert.equal(at('17:00'), 'night');
  assert.equal(at('00:00'), 'night');
  assert.equal(timeBand(new Date('2026-11-27T20:00:00Z')), 'morning'); // UTC 20:00 ＝ 日本時間 5:00
  assert.equal(timeBand(new Date('2026-11-28T01:59:00Z')), 'morning'); // 日本時間 10:59
  assert.equal(timeBand(new Date('2026-11-28T08:00:00Z')), 'night'); // 日本時間 17:00
});
t('せりふファイルの確かめ方：正しい形は合格、まちがいは見つける', () => {
  assert.deepEqual(checkLines(fullLines()), []);
  const bad = fullLines();
  bad.morning = bad.morning.slice(0, 30); bad.noon[3] = ''; bad.night[0] = 'あ'.repeat(41); bad.cutin[0] = 'あ'.repeat(17);
  bad.drawday[5] = '今夜は抽せん日'; bad.loto6[2] = '{game}の日'; bad.win[1] = '{name}さん'; delete bad.lose; bad.extra = [];
  const e = checkLines(bad).join('\n');
  for (const w of ['morning：30個', 'noon[3]：空', 'night[0]：41文字', 'cutin[0]：17文字', 'drawday[5]：{game} がない', 'loto6[2]：{game} は使わない', 'win[1]：{game} 以外', 'lose：配列がない', '仕様にないキー：extra'])
    assert.ok(e.includes(w), w);
  assert.equal(checkLines('x').length, 1); assert.equal(checkLines(null).length, 1);
  const ok40 = fullLines(); ok40.night[0] = 'あ'.repeat(40); ok40.cutin[0] = 'あ'.repeat(16); ok40.drawday[0] = '{game}' + 'あ'.repeat(34);
  assert.deepEqual(checkLines(ok40), []);
});
t('せりふ：仮のせりふファイル（一時フォルダ）を読んで選べる', () => {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/lotojinja-lines-`);
  try {
    const f = `${dir}/miko.json`;
    fs.writeFileSync(f, JSON.stringify(fullLines()));
    const L = JSON.parse(fs.readFileSync(f, 'utf8'));
    assert.deepEqual(checkLines(L), []);
    const now = J('2026-11-26T18:00');
    assert.equal(chooseLine(homeSituation('numbers4', now), now, L, { game: 'numbers4', fallback: FB }), '今夜はナンバーズ426');
    assert.equal(chooseLine('cutin', now, L, { fallback: FB }), 'シャン26');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
t('オフライン：sw.js がせりふの仕組みと4人分のせりふを保存する', () => {
  const sw = fs.readFileSync(new URL('../src/sw.js', import.meta.url), 'utf8');
  assert.ok(sw.includes("'lines.js'")); assert.ok(sw.includes('lines/${c}.json'));
  assert.deepEqual(CHAR_IDS, ['miko', 'kannushi', 'kitsune', 'neko']);
});
t('newyear：12/31〜1/3 の0時台はその日のあいさつ（12/31 は31番目、1/1〜1/3 は1〜3番目）', () => {
  assert.equal(lineIndex('newyear', J('2026-12-31T00:00')), 30);
  assert.equal(lineIndex('newyear', J('2026-12-31T00:59')), 30);
  assert.equal(lineIndex('newyear', J('2027-01-01T00:00')), 0);
  assert.equal(lineIndex('newyear', J('2027-01-02T00:30')), 1);
  assert.equal(lineIndex('newyear', J('2027-01-03T00:00')), 2);
  assert.equal(lineIndex('newyear', new Date('2026-12-31T15:00:00Z')), 0); // UTCでは12/31、日本時間は1/1 0:00
  const L = { newyear: seq('年') };
  assert.equal(chooseLine('newyear', J('2027-01-01T00:10'), L), '年1');
  assert.equal(chooseLine('newyear', J('2026-12-31T00:10'), L), '年31');
});
t('newyear：1時台〜23時台は4〜30番目を時で順に出し、4日間で27個すべてが出る', () => {
  const seen = new Set();
  for (const d of ['2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']) for (let h = 1; h < 24; h++) {
    const i = lineIndex('newyear', J(`${d}T${String(h).padStart(2, '0')}:00`));
    assert.ok(i >= 3 && i <= 29, `${d} ${h}時 → ${i}`); seen.add(i);
  }
  assert.equal(seen.size, 27);
  assert.equal(lineIndex('newyear', J('2026-12-31T01:00')), 3); // 12/31 の1時は4番目から
  assert.equal(lineIndex('newyear', J('2026-12-31T02:00')), 4);
  assert.equal(lineIndex('newyear', J('2027-01-01T01:00')), 26); // 1/1 は12/31 の続き（23個先）から
  assert.equal(lineIndex('newyear', J('2027-01-01T04:00')), 29); assert.equal(lineIndex('newyear', J('2027-01-01T05:00')), 3); // 30番目の次は4番目に戻る
  assert.equal(lineIndex('newyear', J('2026-12-31T01:59')), lineIndex('newyear', J('2026-12-31T01:00'))); // 同じ時の間は同じ
  assert.equal(lineIndex('newyear', J('2027-01-04T05:00')), 3); // 年末年始以外は日付どおり
  assert.equal(lineIndex('morning', J('2026-12-31T05:00')), 30); // ほかの状況は年末年始でも日付どおり
  // 足りないときは予備
  assert.equal(chooseLine('newyear', J('2026-12-31T05:00'), { newyear: seq('年', 5) }, { fallback: FB }), FB.home[30 % 3]);
});
t('ホームの状況：抽せん後、新しい回を取り込むまではキャリーオーバーを出さない', () => {
  const c = { n: 2158, date: '2026-11-26', carryover: 300000000 }; // 11/26(木)の回まで取り込み済み
  assert.equal(homeSituation('loto6', J('2026-11-28T08:00'), c), 'carryover');
  assert.equal(homeSituation('loto6', J('2026-11-30T18:44'), c), 'drawday'); // 次の回 11/30(月)
  assert.equal(homeSituation('loto6', J('2026-11-30T18:46'), c), 'night'); // 抽せん済み・取り込み待ち（偶数日）
  assert.equal(homeSituation('loto6', J('2026-12-01T08:00'), c), 'loto6'); // まだ取り込み待ち（奇数日）
  const after = { n: 2159, date: '2026-11-30', carryover: 100 };
  assert.equal(homeSituation('loto6', J('2026-11-30T18:46'), after), 'carryover'); // 取り込めたら出す
  const l7 = { n: 705, date: '2026-11-27', carryover: 1 };
  assert.equal(homeSituation('loto7', J('2026-12-04T18:44'), l7), 'drawday');
  assert.equal(homeSituation('loto7', J('2026-12-04T18:45'), l7), 'night'); // 取り込み待ち・偶数日
  assert.equal(homeSituation('loto7', J('2026-12-04T10:00'), l7), 'carryover');
});
t('ホームのせりふの次の境目（5:00・11:00・12:00・17:00・18:45・0:00、日本時間）', () => {
  const nx = s => nextLineChange(J(s)).getTime();
  assert.equal(nx('2026-11-28T04:59'), J('2026-11-28T05:00').getTime());
  assert.equal(nx('2026-11-28T05:00'), J('2026-11-28T11:00').getTime());
  assert.equal(nx('2026-11-28T11:30'), J('2026-11-28T12:00').getTime());
  assert.equal(nx('2026-11-28T12:00'), J('2026-11-28T17:00').getTime());
  assert.equal(nx('2026-11-28T17:00'), J('2026-11-28T18:45').getTime());
  assert.equal(nx('2026-11-28T18:45'), J('2026-11-29T00:00').getTime());
  assert.equal(nx('2026-11-28T23:59'), J('2026-11-29T00:00').getTime());
  assert.equal(nextLineChange(new Date('2026-11-28T14:59:30Z')).getTime(), J('2026-11-29T00:00').getTime());
  assert.equal(nx('2026-12-31T06:10'), J('2026-12-31T07:00').getTime()); // 年末年始は毎時
  assert.equal(nx('2027-01-03T23:30'), J('2027-01-04T00:00').getTime());
  assert.equal(nx('2026-12-30T23:00'), J('2026-12-31T00:00').getTime());
  // 境目の前後で状況が変わることも確かめる
  assert.equal(homeSituation('loto6', J('2026-11-26T11:59')), 'noon');
  assert.equal(homeSituation('loto6', nextLineChange(J('2026-11-26T11:59'))), 'drawday');
});
t('予備のせりふ（app.js の CHARS）：福が来る・神託が届く・当たる、と受け取れる言い方をしない', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const chars = app.slice(app.indexOf('const CHARS = {'), app.indexOf('const imgPath'));
  for (const w of ['福よ来い', '福が来', '神託がおりて', '当たる', '当たりそう', 'ツイて']) assert.ok(!chars.includes(w), w);
  assert.ok(!app.includes('PRAY_WORDS'));
});
// せりふ係のファイル（src/lines/）が4つそろったら、仕様どおりかを確かめる（そろうまでは飛ばす）
{
  const linePath = c => new URL(`../src/lines/${c}.json`, import.meta.url);
  const have = CHAR_IDS.filter(c => fs.existsSync(linePath(c)));
  if (have.length < CHAR_IDS.length) console.log(`skip せりふファイルの中身（src/lines/ にそろっていない：${have.length}/4）`);
  else for (const c of CHAR_IDS) t(`せりふファイル ${c}.json：17キー×31個・空なし・40文字以内（cutin 16）・{game} は drawday/carryover だけ`, () => {
    const errs = checkLines(JSON.parse(fs.readFileSync(linePath(c), 'utf8')));
    assert.deepEqual(errs.slice(0, 20), [], `${c}.json に ${errs.length} 件の問題`);
  });
}


// =====================================================================
// アプリ（Android 版）の中での取り込み：公式CSVを直接読む（src/sync.js・src/csv.js の一覧）
// 通信・保存・時刻は差し替えてテストする
// =====================================================================
{
  const csvMod = await import('../src/csv.js');
  const S = await import('../src/sync.js');
  const { parseListCsv, listCsvUrl } = csvMod;
  const LISTS = ['loto6', 'loto7', 'miniloto', 'numbers', 'bingo5'];
  const listText = g => ofx(`list-${g}.csv`);
  t('一覧CSV：5種類の実物を読める（新しい順・回と日付）', () => {
    assert.deepEqual(parseListCsv('loto6', listText('loto6')), [{ n: 2158, date: '2026-11-26' }, { n: 2157, date: '2026-11-23' }, { n: 2156, date: '2026-11-19' }]);
    assert.deepEqual(parseListCsv('loto7', listText('loto7'))[0], { n: 704, date: '2026-11-20' });
    assert.deepEqual(parseListCsv('miniloto', listText('miniloto'))[0], { n: 1414, date: '2026-11-24' });
    assert.deepEqual(parseListCsv('numbers', listText('numbers'))[0], { n: 7123, date: '2026-11-26' });
    assert.deepEqual(parseListCsv('bingo5', listText('bingo5'))[0], { n: 498, date: '2026-11-25' });
  });
  t('一覧CSV：違う種類・回の行なし・並びが逆・日付なしははじく', () => {
    assert.throws(() => parseListCsv('miniloto', listText('loto6')));
    assert.throws(() => parseListCsv('loto6', listText('miniloto'))); // 「ミニロト」は「ロト6」ではない
    assert.throws(() => parseListCsv('loto6', 'A52\r\n'));
    assert.throws(() => parseListCsv('loto6', '<html>メンテナンス中</html>'));
    assert.throws(() => parseListCsv('loto6', listText('loto6').split(/\r\n/).reverse().join('\r\n')));
    assert.throws(() => parseListCsv('loto6', '第2158回ロト６,数字選択式全国自治宝くじ,,東京'));
  });
  t('一覧CSV・回別CSVのURL（LIST-FORMATS.md どおり）', () => {
    assert.equal(listCsvUrl('loto7'), 'https://www.mizuhobank.co.jp/retail/takarakuji/loto/loto7/csv/loto7.csv');
    assert.equal(listCsvUrl('numbers'), 'https://www.mizuhobank.co.jp/retail/takarakuji/numbers/csv/numbers.csv');
    assert.equal(listCsvUrl('bingo5'), 'https://www.mizuhobank.co.jp/retail/takarakuji/bingo/bingo5/csv/bingo5.csv');
    assert.equal(officialCsvUrl('bingo5', 498), 'https://www.mizuhobank.co.jp/retail/takarakuji/bingo/bingo5/csv/A1040498.CSV');
  });

  // 偽の通信：公式は fixtures の実物（Shift_JIS を読んだ文字）、予備は手元のデータから作る
  const OFFICIAL_FILES = { 'A1022157.CSV': () => fx('A1022157.CSV'), 'A1022158.CSV': () => fx('A1022158.CSV'), 'A1030704.CSV': () => fx('A1030704.CSV'),
    'A1011414.CSV': () => ofx('A1011414.CSV'), 'A1040498.CSV': () => ofx('A1040498.CSV'), 'A1007123.CSV': () => ofx('A1007123.CSV') };
  const all = Object.fromEntries(['loto6', 'loto7', 'miniloto', 'bingo5', 'numbers3', 'numbers4'].map(k => [k, load(k)]));
  const memStore = () => { const m = new Map(); return { m, get: k => (m.has(k) ? JSON.parse(m.get(k)) : null), set: (k, v) => m.set(k, JSON.stringify(v)) }; };
  // opts.official：false=全部403（クラウドからと同じ）／'broken'=一覧が読めない形 ／ opts.lists：一覧の差し替え ／ opts.backup：くじ → draws（false=読めない）
  const makeDeps = (opts = {}) => {
    const calls = [];
    const get = async (url, type) => {
      calls.push(url);
      const name = url.split('/').pop();
      if (url.includes('mizuhobank')) {
        if (opts.official === false) return { status: 403, text: '' };
        if (name.endsWith('.csv')) {
          const g = name.replace('.csv', '');
          if (opts.official === 'broken') return { status: 200, text: '<html>ただいまメンテナンス中です</html>', maxAge: 60 };
          return { status: 200, text: opts.lists?.[g] ?? listText(g), maxAge: 60 };
        }
        const f = OFFICIAL_FILES[name];
        return f ? { status: 200, text: f() } : { status: 403, text: '' };
      }
      const kind = name.replace('.json', '');
      const b = opts.backup?.[kind];
      if (b === false || !b) return { status: 404, text: '' };
      return { status: 200, text: JSON.stringify({ kind, draws: b }) };
    };
    return { calls, get, storage: opts.storage || memStore(), now: () => opts.now || J('2026-11-27T12:00') };
  };
  // 手元の最新回までの写し。ロト6・ロト7の古い回にはキャリーオーバーが無いので、最新回には入れておく（公式で確かめ済みの形）
  const upto = (k, n) => { const l = all[k].filter(d => d.n <= n).map(d => ({ ...d })); if (/^loto[67]$/.test(k) && l.at(-1).carryover == null) l.at(-1).carryover = 0; return l; };
  const run = async (group, draws, opts) => { const deps = makeDeps(opts); const r = await S.syncGroup(group, { draws, bundled: opts?.bundled, force: opts?.force }, deps).catch(e => e); return { r, deps }; };
  const noSrc = d => { const { src, ...x } = d; return x; };

  let x = await run('loto6', { loto6: upto('loto6', 2156) });
  t('公式から：ロト6 手元が第2156回なら、一覧で最新回を知り第2157・2158回だけ読む（当せん金・キャリーオーバーつき）', () => {
    assert.ok(!(x.r instanceof Error), String(x.r));
    assert.equal(x.r.source, 'official'); assert.equal(x.r.added, 2);
    assert.deepEqual(x.deps.calls.map(u => u.split('/').pop()), ['loto6.csv', 'A1022157.CSV', 'A1022158.CSV']);
  });
  {
    const draws = { loto6: upto('loto6', 2156) };
    await S.syncGroup('loto6', { draws }, makeDeps());
    t('公式から：取り込んだ回は取り込み済みデータと同じ中身（公式の印 src つき）', () => {
      assert.deepEqual(draws.loto6.slice(-2).map(noSrc), all.loto6.filter(d => d.n >= 2157));
      assert.ok(draws.loto6.slice(-2).every(d => d.src === 'official'));
    });
  }
  {
    const draws = { numbers3: upto('numbers3', 7122), numbers4: upto('numbers4', 7122) };
    const r = await S.syncGroup('numbers', { draws }, makeDeps());
    t('公式から：ナンバーズは1つのCSVから3と4の両方を取り込む（同じ回・同じ日付）', () => {
      assert.equal(r.added, 1);
      assert.deepEqual(noSrc(draws.numbers3.at(-1)), all.numbers3.find(d => d.n === 7123));
      assert.deepEqual(noSrc(draws.numbers4.at(-1)), all.numbers4.find(d => d.n === 7123));
    });
  }
  for (const [g, n] of [['miniloto', 1414], ['bingo5', 498]]) {
    const draws = { [g]: upto(g, n - 1) };
    const r = await S.syncGroup(g, { draws }, makeDeps());
    t(`公式から：${g} 第${n}回を取り込む`, () => { assert.equal(r.added, 1); assert.deepEqual(noSrc(draws[g].at(-1)), all[g].find(d => d.n === n)); });
  }
  {
    // 手元の最新回（キャリーオーバーなし）の確かめに失敗しても、新しい回は公式から取り込む
    const draws = { loto6: all.loto6.filter(d => d.n <= 2156).map(d => ({ ...d })) };
    const deps = makeDeps();
    const r = await S.syncGroup('loto6', { draws }, deps);
    t('公式から：手元の最新回の確かめ（回別CSV）が読めなくても、新しい回は公式から取り込む', () => {
      assert.equal(r.source, 'official'); assert.equal(r.added, 2); assert.ok(deps.calls.some(u => u.endsWith('A1022156.CSV')));
    });
  }
  x = await run('loto6', { loto6: upto('loto6', 2158) });
  t('新しい回が無ければ、読むのは一覧の1ファイルだけ', () => { assert.equal(x.r.added, 0); assert.equal(x.deps.calls.length, 1); assert.equal(x.r.error, null); });

  // 公式が読めないとき・形式が変わったとき → 予備（GitHub Pages）
  for (const [label, official] of [['公式が403（読めない）', false], ['公式の一覧の形式が変わった', 'broken']]) {
    const draws = { loto6: upto('loto6', 2156) };
    const deps = makeDeps({ official, backup: { loto6: all.loto6 } });
    const r = await S.syncGroup('loto6', { draws }, deps);
    t(`予備へ切り替え：${label}なら GitHub Pages のデータから取り込む`, () => {
      assert.equal(r.source, 'backup'); assert.equal(r.added, 2); assert.equal(r.error, null); assert.match(r.note, /予備/);
      assert.ok(deps.calls.includes(S.backupUrl('loto6')));
      assert.deepEqual(draws.loto6.slice(-2).map(noSrc), all.loto6.filter(d => d.n >= 2157));
      assert.ok(draws.loto6.slice(-2).every(d => d.src === 'backup'));
    });
  }
  {
    const draws = { numbers3: upto('numbers3', 7120), numbers4: upto('numbers4', 7120) };
    const r = await S.syncGroup('numbers', { draws }, makeDeps({ official: false, backup: { numbers3: all.numbers3, numbers4: all.numbers4.filter(d => d.n <= 7122) } }));
    t('予備：ナンバーズは3と4がそろっている回までだけ取り込む', () => { assert.equal(r.added, 2); assert.equal(draws.numbers3.at(-1).n, 7122); assert.equal(draws.numbers4.at(-1).n, 7122); });
  }
  {
    const draws = { loto6: upto('loto6', 2156) };
    const storage = memStore();
    const r = await S.syncGroup('loto6', { draws }, makeDeps({ official: false, backup: false, storage }));
    t('公式も予備も読めなければ、手元のデータのままで「取得できませんでした」の印', () => {
      assert.equal(r.added, 0); assert.ok(r.error); assert.equal(draws.loto6.at(-1).n, 2156);
      assert.ok(S.lastError('loto6', storage));
    });
  }
  {
    const tampered = all.loto6.map(d => d.n === 2150 ? { ...d, main: [1, 2, 3, 4, 5, 6] } : d);
    const draws = { loto6: upto('loto6', 2156) };
    const r = await S.syncGroup('loto6', { draws }, makeDeps({ official: false, backup: { loto6: tampered } }));
    t('予備が手元（公式）と食い違えば、予備は使わない（公式を優先）', () => { assert.equal(r.added, 0); assert.ok(r.error); assert.equal(draws.loto6.at(-1).n, 2156); });
  }
  {
    // 予備から入った最新回（キャリーオーバーなし）を、公式が読めるようになったら公式で確かめて置きかえる
    const draws = { loto6: upto('loto6', 2158) };
    const { carryover, ...noCarry } = draws.loto6.at(-1);
    draws.loto6[draws.loto6.length - 1] = { ...noCarry, src: 'backup' };
    const deps = makeDeps();
    const r = await S.syncGroup('loto6', { draws }, deps);
    t('公式で確かめる：予備から入った最新回は公式の回別CSVで置きかえる（キャリーオーバーも入る）', () => {
      assert.equal(r.changed, 1); assert.equal(draws.loto6.at(-1).src, 'official'); assert.equal(draws.loto6.at(-1).carryover, 0);
      assert.ok(deps.calls.some(u => u.endsWith('A1022158.CSV')));
    });
    const differs = upto('loto6', 2158); differs[differs.length - 1] = { ...differs.at(-1), main: [1, 2, 3, 4, 5, 6], src: 'backup' };
    const r2 = await S.syncGroup('loto6', { draws: { loto6: differs } }, makeDeps());
    t('公式で確かめる：予備の内容が公式と違えば、公式の内容にする', () => { assert.equal(r2.changed, 1); assert.deepEqual(differs.at(-1).main, [5, 13, 15, 23, 27, 42]); });
  }
  {
    // 一度に読む回は最大 MAX_FETCH。多く遅れていれば、残りは予備から
    const lists = { loto6: listText('loto6').replace('第2158回', '第2160回') };
    const draws = { loto6: upto('loto6', 2150) };
    const deps = makeDeps({ lists, backup: { loto6: all.loto6 } });
    await S.syncGroup('loto6', { draws }, deps);
    const csvReads = deps.calls.filter(u => /A102\d+\.CSV$/.test(u)).length;
    t(`一度に読む回別CSVは最大${S.MAX_FETCH}回分。それより遅れていれば残りは予備から`, () => {
      assert.ok(csvReads <= S.MAX_FETCH, String(csvReads));
      assert.ok(deps.calls.includes(S.backupUrl('loto6')));
      assert.equal(draws.loto6.at(-1).n, 2158); // 予備にある最新回まで
    });
  }

  // 検査
  const p6 = all.loto6.find(d => d.n === 2157), d6 = all.loto6.find(d => d.n === 2158);
  t('検査：回の連続・抽せん日どおりの日付（曜日）・抽せん前・数字の範囲', () => {
    const now = J('2026-11-27T12:00');
    assert.doesNotThrow(() => S.checkNext('loto6', p6, d6, now));
    assert.throws(() => S.checkNext('loto6', p6, { ...d6, n: 2159 }, now), /連続/);
    assert.throws(() => S.checkNext('loto6', p6, { ...d6, date: '2026-11-25' }, now), /予定/); // 水曜はロト6の抽せん日ではない
    assert.throws(() => S.checkNext('loto6', p6, d6, J('2026-11-26T18:00')), /抽せん前/);
    assert.throws(() => S.checkNext('loto6', p6, { ...d6, main: [5, 13, 15, 23, 27, 44] }, now), /範囲/);
    assert.throws(() => S.checkNext('loto6', p6, { ...d6, bonus: [5] }, now), /重複/);
    assert.throws(() => S.checkNext('bingo5', all.bingo5.at(-2), { ...all.bingo5.at(-1), main: [6, 9, 13, 17, 21, 29, 35, 40] }, now), /マス/);
    assert.throws(() => S.checkNext('numbers3', all.numbers3.at(-2), { ...all.numbers3.at(-1), main: [4, 1, 12] }, now), /範囲/);
    assert.throws(() => S.checkNext('loto6', p6, { ...d6, prizes: [1, 2] }, now), /当せん金/);
    assert.throws(() => S.checkNumbersPair([{ n: 7123, date: '2026-11-26' }], [{ n: 7123, date: '2026-11-25' }]), /一致/);
  });
  t('検査：年末年始（12/31〜1/3）は抽せんが無いので、その日付の回ははじく', () => {
    const prev = { ...p6, n: 3000, date: '2026-12-28' };
    assert.throws(() => S.checkNext('loto6', prev, { ...d6, n: 3001, date: '2026-12-31' }, J('2027-01-10T12:00')), /予定/);
    assert.doesNotThrow(() => S.checkNext('loto6', prev, { ...d6, n: 3001, date: '2027-01-04' }, J('2027-01-10T12:00')));
  });

  // 読み直しの間隔
  {
    const draws = { loto6: upto('loto6', 2158) };
    const storage = memStore();
    await S.syncGroup('loto6', { draws }, makeDeps({ storage, now: J('2026-11-27T12:00') }));
    const again = async (now, extra = {}) => { const deps = makeDeps({ storage, now, ...extra }); const r = await S.syncGroup('loto6', { draws }, deps); return { r, n: deps.calls.length }; };
    const a = await again(J('2026-11-27T12:00:30'));
    const b = await again(J('2026-11-27T15:00'));
    const c = await again(J('2026-11-30T18:50')); // 次の抽せん（11/30 月 18:45）を過ぎた
    const d = await again(J('2026-11-30T18:55')); // 結果待ちだが前回から10分たっていない
    const e = await again(J('2026-11-30T19:01')); // 10分たった
    t('読み直しの間隔：1分以内は読まない・結果待ちでなければ次の抽せんまで読まない', () => {
      assert.equal(a.r.skipped, 'recent'); assert.equal(a.n, 0);
      assert.equal(b.r.skipped, 'recent'); assert.equal(b.n, 0);
    });
    t('読み直しの間隔：抽せん時刻を過ぎたら読む。結果待ちの間は10分おき', () => {
      assert.equal(c.n, 1); assert.equal(d.r.skipped, 'recent'); assert.equal(d.n, 0); assert.equal(e.n, 1);
    });
    const deps = makeDeps({ storage, now: J('2026-11-30T19:30') });
    const [p1, p2] = [S.syncGroup('loto6', { draws, force: true }, deps), S.syncGroup('loto6', { draws, force: true }, deps)];
    t('同じ一覧を同時に読まない（読み込み中なら同じ結果を待つ）', () => assert.equal(p1, p2));
    await p1;
    t('一覧の Cache-Control（max-age）が60秒より長ければ、それより短い間隔では読まない', () => {
      const d58 = { loto6: upto('loto6', 2158) }, checked = J('2026-11-30T19:00').getTime(); // 第2159回の結果待ち
      assert.equal(S.isDue('loto6', d58, { checked, maxAge: 900 }, J('2026-11-30T19:12')), false);
      assert.equal(S.isDue('loto6', d58, { checked, maxAge: 60 }, J('2026-11-30T19:12')), true);
    });
  }

  // 保存と読み込み
  {
    const bundled = upto('loto6', 2156);
    const storage = memStore();
    const draws = { loto6: S.loadStored('loto6', bundled, storage) };
    await S.syncGroup('loto6', { draws, bundled: { loto6: bundled } }, makeDeps({ storage }));
    const saved = storage.get('sync.draws.loto6');
    t('保存：同梱データより新しい回だけを保存する（容量を使わない）', () => { assert.deepEqual(saved.draws.map(d => d.n), [2157, 2158]); });
    t('読み込み：同梱データ＋保存した回で、取り込み後と同じになる', () => { assert.deepEqual(S.loadStored('loto6', bundled, storage), draws.loto6); });
    const newer = upto('loto6', 2158);
    t('読み込み：アプリを更新して同梱データに入った回は二重にならず、保存分から消える', () => {
      const merged = S.loadStored('loto6', newer, storage);
      assert.equal(merged.length, newer.length); assert.deepEqual(merged.map(noSrc), newer);
      assert.deepEqual(S.storedPart(newer, merged), []);
    });
    t('読み込み：壊れた保存データは使わない', () => {
      storage.set('sync.draws.loto6', { v: 1, draws: [{ n: 2157, date: '2026-11-23', main: [1, 1, 1], bonus: [] }] });
      assert.equal(S.loadStored('loto6', bundled, storage).length, bundled.length);
      storage.set('sync.draws.loto6', 'こわれた'); assert.equal(S.loadStored('loto6', bundled, storage).length, bundled.length);
      const bad = { get() { throw new Error('x'); }, set() {} }; assert.equal(S.loadStored('loto6', bundled, bad).length, bundled.length);
    });
    t('読み込み：同梱データと違う回は、公式から入った回なら置きかえ、予備から入った回なら使わない', () => {
      const b = upto('loto6', 2158), off = { ...b.at(-1), main: [1, 2, 3, 4, 5, 6], src: 'official' };
      assert.deepEqual(S.mergeDraws(b, [off]).at(-1).main, [1, 2, 3, 4, 5, 6]);
      assert.deepEqual(S.mergeDraws(b, [{ ...off, src: 'backup' }]).at(-1).main, b.at(-1).main);
      const { carryover, ...nc } = b.at(-1);
      assert.equal(S.mergeDraws([...b.slice(0, -1), nc], [{ ...b.at(-1), src: 'official' }]).at(-1).carryover, 0); // 足りない分は補う
    });
    t('保存：ナンバーズ約7000回でも、保存するのは差分だけ', () => {
      const n3 = all.numbers3, merged = [...n3.map(d => ({ ...d })), { ...n3.at(-1), n: n3.at(-1).n + 1, date: '2026-11-27', src: 'official' }];
      assert.equal(S.storedPart(n3, merged).length, 1);
    });
  }
}


// --- Android アプリ（ネイティブ版）の設定 ---
{
  const read = f => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  const { ADS, IS_TEST_ADS } = await import('../src/ads-config.js');
  t('広告の設定（src/ads-config.js）：4つのIDの形', () => {
    assert.match(ADS.appId, /^ca-app-pub-\d{16}~\d{10}$/); assert.match(ADS.banner, /^ca-app-pub-\d{16}\/\d{10}$/);
    assert.match(ADS.rewarded, /^ca-app-pub-\d{16}\/\d{10}$/); assert.match(ADS.publisherId, /^pub-\d{16}$/);
    assert.equal(ADS.appId.split('~')[0], ADS.banner.split('/')[0]); assert.equal(ADS.appId.split('~')[0], ADS.rewarded.split('/')[0]);
    assert.equal(ADS.publisherId, ADS.appId.slice('ca-app-'.length).split('~')[0]);
    assert.equal(typeof IS_TEST_ADS, 'boolean');
  });
  if (fs.existsSync(new URL('../android/app/build.gradle', import.meta.url))) {
    const gradle = read('android/app/build.gradle'), manifest = read('android/app/src/main/AndroidManifest.xml'), vars = read('android/variables.gradle');
    t('Android：広告のアプリIDは src/ads-config.js から読み、AndroidManifest に入る', () => {
      const re = /appId:\s*'(ca-app-pub-\d+~\d+)'/; // android/app/build.gradle と同じ読み方
      assert.equal(read('src/ads-config.js').match(re)[1], ADS.appId);
      assert.ok(gradle.includes("file('../../src/ads-config.js')") && gradle.includes('manifestPlaceholders = [admobAppId: admobAppId]'));
      assert.ok(manifest.includes('com.google.android.gms.ads.APPLICATION_ID') && manifest.includes('${admobAppId}'));
    });
    t('Android：versionCode 2 以上・versionName・minSdk 24・targetSdk/compileSdk 36・縦固定・パッケージ名', () => {
      assert.ok(Number(gradle.match(/versionCode\s+(\d+)/)[1]) >= 2); assert.match(gradle, /versionName\s+"\d+\.\d+\.\d+"/);
      assert.match(vars, /minSdkVersion = 24/); assert.match(vars, /compileSdkVersion = 36/); assert.match(vars, /targetSdkVersion = 36/);
      assert.ok(manifest.includes('android:screenOrientation="portrait"'));
      assert.ok(gradle.includes('applicationId "io.github.fullmoonsatoshisudo.lotojinja"'));
      assert.match(read('android/app/src/main/res/values/strings.xml'), /title_activity_main">ロト神社</);
    });
  }
  t('Web 版：アプリ用の部品（capacitor.js・native.js・sync.js）を読み込まない', () => {
    assert.ok(!read('src/index.html').includes('capacitor.js'));
    const app = read('src/app.js');
    assert.ok(!/^import .*(native|sync)\.js/m.test(app), '静的 import していない');
    assert.match(app, /IS_APP \? import\('\.\/native\.js'\) : null/); assert.match(app, /IS_APP \? import\('\.\/sync\.js'\) : null/);
  });
}

console.log(`\n${n} 件すべて合格`);
