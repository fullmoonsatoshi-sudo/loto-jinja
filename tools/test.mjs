// 計算ロジックのテスト：node tools/test.mjs
import fs from 'fs';
import assert from 'assert/strict';
import { judge, validTicket, nextDraw, frequency, absence, oracle, kaburi, GAMES, bingoLines, digitFrequency, digitAbsence, prizeOf, isBigWin, winRank, isZorome, suggestType, schoolDesc } from '../src/lotto.js';
import { parseCsv, toIsoDate, parseBingo5Csv, parseNumbersCsv, officialCsvUrl } from './csv.mjs';
import { updateKind } from './update-data.mjs';
import { updateHubKind, checkSequence, checkDraw, MAX_NEW } from './hub.mjs';
import { loadRecent } from './init-hub-data.mjs';
import { createHash } from 'crypto';

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

console.log(`\n${n} 件すべて合格`);
