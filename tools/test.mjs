// 計算ロジックのテスト：node tools/test.mjs
import fs from 'fs';
import assert from 'assert/strict';
import { judge, validTicket, nextDraw, frequency, absence, oracle, kaburi, GAMES } from '../src/lotto.js';
import { parseCsv, toIsoDate } from './csv.mjs';
import { updateKind } from './update-data.mjs';
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

console.log(`\n${n} 件すべて合格`);
