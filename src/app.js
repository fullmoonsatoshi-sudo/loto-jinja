import {
  GAMES, GAME_KEYS, SCHOOLS, schoolDesc, NUM_TYPES, PRIZE_NAMES, numberTypes, prizeKeys, isZorome,
  CELL_POS, FREE_POS, BINGO_LINES, cellRange, bingoHits, bingoLines,
  judge, validTicket, nextDraw, frequency, absence, digitFrequency, digitAbsence, ranking, shapeStats, oracle, kaburi,
  winRank, isBigWin, prizeOf, suggestType,
} from './lotto.js';

// ---------- キャラクター ----------
// せりふのルール：当たると期待させない／運で結果が変わると言わない／事実と違うことを言わない
const CHARS = {
  miko: { name: 'かなえ', role: '見習い巫女', lines: {
    home: ['かなえにおまかせください！最新の結果をお知らせしますね', '神社をぴかぴかにお掃除しました！', 'くじは無理のない範囲で楽しみましょうね'],
    pray: ['むむむ…神託がおりてきました！'],
    big: ['すごい！高額の当せんです！おめでとうございます！'], win: ['当せんしています！おめでとうございます！'],
    lose: ['今回ははずれでした。くじは楽しめる範囲で、ですね'] } },
  kannushi: { name: 'あたる', role: '見習い神主', lines: {
    home: ['結果の確認は、ここでまとめてできるよ', '数字選び、手伝おうか？', '買いすぎには気をつけてな'],
    pray: ['祓いたまえ、清めたまえ…'],
    big: ['すごいな！高額の当せんだ！'], win: ['当せんしてる！よかったな！'],
    lose: ['今回ははずれだった。楽しめる範囲でいこう'] } },
  kitsune: { name: 'こん', role: '子ぎつねの神様見習い', lines: {
    home: ['こんこん、過去のデータを見るのが大好きこん', '数字の並び、見てるだけで楽しいこん'],
    pray: ['こんこん…巻物を読み解いてるこん'],
    big: ['こーん！高額の当せんだこん！'], win: ['当せんしてるこん！おめでとうこん！'],
    lose: ['こん…今回ははずれだこん'] } },
  neko: { name: 'ふく', role: '招き猫の巫女', lines: {
    home: ['いらっしゃいにゃ！最新の結果を見ていくにゃ', 'くじは楽しめる範囲で、にゃ'],
    pray: ['にゃむにゃむ…お祈り中にゃ'],
    big: ['高額の当せんにゃ！おめでとうにゃ！'], win: ['当せんしてるにゃ！おめでとうにゃ！'],
    lose: ['にゃ…今回ははずれにゃ'] } },
};
const imgPath = (c, e) => `assets/characters/${c}/${e}.png`;

// ---------- 保存（端末の中だけ） ----------
// 読み出した値は形を確かめ、想定外なら既定値を使う
const store = {
  get(k, d, ok = () => true) {
    try { const v = localStorage.getItem('lotojinja.' + k); if (v == null) return d; const p = JSON.parse(v); return ok(p) ? p : d; }
    catch { return d; }
  },
  set(k, v) { try { localStorage.setItem('lotojinja.' + k, JSON.stringify(v)); } catch { /* 保存できない環境では何もしない */ } },
};
const isGame = v => typeof v === 'string' && Object.hasOwn(GAMES, v);
const isChar = v => Object.hasOwn(CHARS, v);
const isDate = v => typeof v === 'string' && (v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v));
function loadTickets() {
  const list = store.get('tickets', [], Array.isArray);
  return list.filter(t => t && isGame(t.game) && Number.isInteger(t.draw) && validTicket(t.game, t.nums, t.type) && typeof t.id === 'string');
}
// 登録中の番号の初期値：ロトは選んだ数字の配列、ビンゴ5は8マス、ナンバーズは桁の数だけ（未選択は null）
function emptyPick(game) {
  const g = GAMES[game];
  return g.type === 'bingo' ? new Array(8).fill(null) : g.type === 'numbers' ? new Array(g.digits).fill(null) : [];
}

const state = {
  game: store.get('game', 'loto6', isGame),
  tab: 'home',
  char: store.get('char', 'miko', isChar),
  data: {},
  oracle: { school: 'hot', count: 3, result: null, praying: false, run: 0 },
  trend: 100,
  histShown: 50,
  histQuery: '',
  pick: [],
  pickPos: 0,          // ビンゴ5・ナンバーズ：いま選んでいるマス・桁
  pickType: 'straight', // ナンバーズ：申込タイプ
  pickDraw: null,
};
state.pick = emptyPick(state.game);

const $ = s => document.querySelector(s);
const view = $('#view');
const yen = v => v.toLocaleString('ja-JP') + '円';
const prizeText = v => v ? yen(v) : '該当なし';
const pad2 = n => String(n).padStart(2, '0');
const WD = ['日', '月', '火', '水', '木', '金', '土'];
function fmtDate(iso) { const [y, m, d] = iso.split('-').map(Number); const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return `${y}年${m}月${d}日(${WD[w]})`; }
function fmtJst(date) {
  const j = new Date(date.getTime() + 9 * 3600e3);
  return `${j.getUTCMonth() + 1}/${j.getUTCDate()}(${WD[j.getUTCDay()]}) ${pad2(j.getUTCHours())}:${pad2(j.getUTCMinutes())}`;
}
const draws = (game = state.game) => state.data[game].draws;
const gtype = (game = state.game) => GAMES[game].type;
const POS_NAMES = { 3: ['百の位', '十の位', '一の位'], 4: ['千の位', '百の位', '十の位', '一の位'] };
const LINE_NAMES = ['横（上段）', '横（中段）', '横（下段）', '縦（左列）', '縦（中列）', '縦（右列）', '斜め（左上から）', '斜め（右上から）'];
const upcoming = (game = state.game) => nextDraw(game, draws(game).at(-1));

function ballsHtml(main, bonus = [], opts = {}) {
  const hitSet = new Set(opts.hits || []);
  const sm = opts.small ? ' sm' : '';
  const m = main.map(n => `<span class="ball${sm}${hitSet.has(n) ? ' hit' : ''}">${pad2(n)}</span>`).join('');
  const b = bonus.length ? `<span class="bonus-group"><span class="plus">ボーナス</span>${bonus.map(n => `<span class="ball bonus${sm}">${pad2(n)}</span>`).join('')}</span>` : '';
  return `<div class="balls" role="img" aria-label="本数字 ${main.join('、')}${bonus.length ? ' ボーナス ' + bonus.join('、') : ''}">${m}${b}</div>`;
}
// ビンゴ5の盤面（3×3、中央は FREE）。hits：マスごとの一致、lines：そろったライン
function boardHtml(nums, opts = {}) {
  const hits = opts.hits || [], onLine = new Set((opts.lines || []).flatMap(i => BINGO_LINES[i]));
  const cells = new Array(9);
  cells[FREE_POS] = `<span class="cell free${onLine.has(FREE_POS) ? ' line' : ''}">FREE</span>`;
  CELL_POS.forEach((p, i) => { cells[p] = `<span class="cell${hits[i] ? ' hit' : ''}${onLine.has(p) ? ' line' : ''}">${pad2(nums[i])}</span>`; });
  const n = nums.map(pad2);
  const label = `盤面 上段 ${n[0]}、${n[1]}、${n[2]}／中段 ${n[3]}、FREE、${n[4]}／下段 ${n[5]}、${n[6]}、${n[7]}` +
    (opts.hits ? `（一致 ${hits.filter(Boolean).length}マス）` : '');
  return `<div class="board${opts.small ? ' sm' : ''}" role="img" aria-label="${label}">${cells.join('')}</div>`;
}
// ナンバーズの数字（桁ごと。先頭の0も出す）
function digitsHtml(digits, opts = {}) {
  const hits = opts.hits || [];
  return `<div class="digits" role="img" aria-label="数字 ${digits.join(' ')}${opts.hits ? `（一致 ${hits.filter(Boolean).length}桁）` : ''}">${digits.map((d, i) => `<span class="digit${opts.small ? ' sm' : ''}${hits[i] ? ' hit' : ''}">${d}</span>`).join('')}</div>`;
}
// 当せん番号の表示（くじの種類ごと）
function drawNumsHtml(game, d, opts = {}) {
  const t = gtype(game);
  if (t === 'bingo') return boardHtml(d.main, opts);
  if (t === 'numbers') return digitsHtml(d.main, opts);
  return ballsHtml(d.main, d.bonus, opts);
}
// 等級ごとの口数と当せん金。分からない回は案内だけ
function prizeTableHtml(game, d) {
  if (!d.prizes || !d.winners) return '<p class="note">当せん金は公式発表でご確認ください。</p>';
  const isNum = gtype(game) === 'numbers';
  const rows = isNum ? prizeKeys(game).map(k => [PRIZE_NAMES[k], d.winners[k], d.prizes[k]]) : d.prizes.map((p, i) => [`${i + 1}等`, d.winners[i], p]);
  return `<table class="prize"><thead><tr><th>${isNum ? '当せんの種類' : '等級'}</th><th>口数</th><th>1口あたり</th></tr></thead><tbody>${rows.map(([l, w, p]) => `<tr><td>${l}</td><td>${w.toLocaleString('ja-JP')}口</td><td>${prizeText(p)}</td></tr>`).join('')}</tbody></table>`;
}
// 結果一覧の1行に出す一番上の当せん
function topPrizeHtml(game, x) {
  if (!x.prizes || !x.winners) return '<div class="note m0">当せん金は公式発表でご確認ください</div>';
  if (gtype(game) === 'numbers') return `<div class="note m0">ストレート ${x.winners.straight}口 ${prizeText(x.prizes.straight)}</div>`;
  return `<div class="note m0">1等 ${x.winners[0]}口 ${prizeText(x.prizes[0])}</div>`;
}

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200); }
const pickLine = lines => lines[Math.floor(Math.random() * lines.length)];

function charaHtml(expr) {
  const c = CHARS[state.char];
  return `<section class="card shrine">
    <img class="chara ${expr}" src="${imgPath(state.char, expr)}" data-fallback="${imgPath(state.char, 'normal')}" alt="${c.name}（${c.role}）" width="170" height="190">
    <p class="bubble"><span class="who">${c.name}</span><span class="line"></span></p>
  </section>`;
}
function fillChara(line) { const el = view.querySelector('.bubble .line'); if (el) el.textContent = line; wireFallback(); }
function wireFallback(root = document) {
  root.querySelectorAll('img[data-fallback]').forEach(img => {
    img.onerror = () => { if (img.src.endsWith(img.dataset.fallback)) { img.style.visibility = 'hidden'; return; } img.src = img.dataset.fallback; };
  });
}

// ---------- データ ----------
async function loadData(game) {
  if (state.data[game]) return state.data[game];
  const res = await fetch(`data/${game}.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error('data');
  const json = await res.json();
  state.data[game] = json;
  return json;
}

// ---------- 画面：ホーム ----------
function renderHome() {
  const list = draws(), last = list.at(-1), g = GAMES[state.game];
  const nx = upcoming();
  // キャリーオーバーはロト6・ロト7だけ（データに carryover がある回だけ出す）
  const carry = last.carryover == null ? '' :
    `<p class="carry">キャリーオーバー <b>${last.carryover ? yen(last.carryover) : 'なし'}</b></p>`;
  const range = `第${last.n + 1}回${nx.pending > 1 ? `〜第${last.n + nx.pending}回` : ''}`;
  // 公開データから取り込むくじは、結果が抽せんの翌朝〜午前中に反映される。1回分の待ちはふつうのことなので、強い表示にしない
  const pendingHtml = !nx.pending ? '' : g.hub && nx.pending === 1
    ? `<p class="notice" role="status">${range}は抽せん済みです。${g.name}の結果は、抽せんの翌朝〜午前中に反映されます。それまでは公式発表（宝くじ公式サイト）でご確認ください。</p>`
    : `<p class="notice strong" role="status">${range}は抽せん済みですが、まだ結果を取り込めていません。最新の結果は公式発表（宝くじ公式サイト）でご確認ください。${g.hub ? `（${g.name}の結果は、ふだんは抽せんの翌朝〜午前中に反映されます）` : ''}</p>`;
  view.innerHTML = `
    ${pendingHtml}
    ${charaHtml('normal')}
    <section class="card">
      <div class="result-head"><span class="no">${g.name} 第${last.n}回</span><span class="muted">${fmtDate(last.date)}</span></div>
      ${drawNumsHtml(state.game, last)}
      ${carry}
      ${prizeTableHtml(state.game, last)}
      <p class="note">当せん番号は必ず公式発表（宝くじ公式サイト・みずほ銀行）でもご確認ください。</p>
    </section>
    <section class="card countdown${g.hub ? ' has-note' : ''}">
      <div><div class="muted">次回 第${nx.n}回</div><div>${fmtJst(nx.time)}</div></div>
      <div class="big" id="cd"></div>
      ${g.hub ? '<div class="cd-note">結果は抽せんの翌朝〜午前中に反映されます</div>' : ''}
    </section>
    <section class="stack">
      <button class="btn" type="button" data-go="oracle">神託をいただく</button>
      <button class="btn sub" type="button" data-go="mine">マイ番号を確かめる</button>
    </section>`;
  fillChara(pickLine(CHARS[state.char].lines.home));
  startCountdown(nx.time);
}
function startCountdown(target) {
  clearInterval(startCountdown.t);
  const tick = () => {
    const el = $('#cd'); if (!el) return clearInterval(startCountdown.t);
    let s = Math.floor((target - Date.now()) / 1000);
    if (s <= 0) { clearInterval(startCountdown.t); if (state.tab === 'home') render(); return; } // 抽せん時刻を過ぎたら次の回へ
    const dd = Math.floor(s / 86400); s %= 86400;
    const hh = Math.floor(s / 3600); s %= 3600;
    const mm = Math.floor(s / 60);
    el.textContent = dd ? `あと${dd}日${hh}時間` : `あと${hh}時間${pad2(mm)}分`;
  };
  tick(); startCountdown.t = setInterval(tick, 15000);
}

// ---------- 画面：神託 ----------
function renderOracle() {
  // カットインの絵を先に読み込んでおき、最初の振りでちらつかないようにする
  ['oharai1', 'oharai2'].forEach(e => { const im = new Image(); im.src = imgPath(state.char, e); });
  const o = state.oracle, g = GAMES[state.game], list = draws();
  const birthday = store.get('birthday', '', isDate);
  const schools = Object.entries(SCHOOLS).map(([k, s]) =>
    `<button type="button" class="school" data-school="${k}" aria-pressed="${o.school === k}"><b>${s.name}</b><span>${schoolDesc(state.game, k)}</span></button>`).join('');
  const type = gtype();

  // 結果は、作ったときと同じくじの種類のときだけ表示する
  const res = o.result && o.result.game === state.game ? o.result : null;
  const tickets = res ? res.tickets.map((t, i) => {
    const k = kaburi(state.game, t, list.at(-1));
    const cls = k.score >= 80 ? 'good' : k.score >= 50 ? '' : 'bad';
    return `<div class="ticket">
      <div class="row between"><b>${i + 1}口目</b><span class="tag ${cls} nw">${k.label}</span></div>
      <div class="mt8">${ticketNumsHtml(state.game, t, { small: true })}</div>
      ${type === 'numbers' ? `<div class="note">申込タイプの例：${NUM_TYPES[suggestType(state.game, t)].name}（${NUM_TYPES[suggestType(state.game, t)].desc}）</div>` : ''}
      <div class="meter ${cls}" aria-hidden="true"><i style="width:${k.score}%"></i></div>
      <div class="note"><b>かぶりにくさ ${k.score}点</b>（100点満点）<br>${k.reasons.map(r => '・' + r).join('<br>')}</div>
      <div class="mt8"><button type="button" class="btn small sub" data-save="${i}">マイ番号に登録</button></div>
    </div>`;
  }).join('') : '';

  const kaburiNote = type === 'numbers'
    ? '「かぶりにくさ」は、ゾロ目や123のような並び、誕生日のような月日など、人が選びがちな形を避けているほど高くなります。当せん確率は変わりませんが、当たったときに賞金を分け合う人が少なくなりやすくなります。申込タイプは当たりやすさではなく、当たり方と当せん金の違いです。'
    : type === 'bingo'
      ? '「かぶりにくさ」は、前回と同じ数字や、各マスの一番小さい・大きい数字ばかりなど、人が選びがちな形を避けているほど高くなります。当せん確率は変わりませんが、当たったときに賞金を分け合う人が少なくなりやすくなります。'
      : '「かぶりにくさ」は、誕生日の数字や連番など人が選びがちな形を避けているほど高くなります。当せん確率は変わりませんが、当たったときに賞金を分け合う人が少なくなりやすくなります。';

  view.innerHTML = `
    ${charaHtml(o.praying ? 'pray' : 'normal')}
    <section class="card">
      <h2>神託の流派をえらぶ</h2>
      <div class="schools">${schools}</div>
      ${o.school === 'luck' ? `<label class="field mt16">誕生日（任意・この端末の中だけに保存）<input type="date" id="birthday" value="${birthday}"></label>` : ''}
      <div class="row between mt16">
        <span>口数</span>
        <div class="stepper"><button type="button" data-step="-1" aria-label="口数を減らす">−</button><output id="cnt">${o.count}口</output><button type="button" data-step="1" aria-label="口数を増やす">＋</button></div>
      </div>
      <button class="btn mt16" type="button" id="doOracle" ${o.praying ? 'disabled' : ''}>${o.praying ? 'お祈り中…' : '神託をいただく'}</button>
      <p class="disclaimer">神託は過去のデータを使ったお楽しみ機能です。抽せんは毎回まったくの偶然で決まるため、当せん確率は上がりません。<br><a class="tap-link" href="privacy.html">プライバシーポリシー</a></p>
    </section>
    ${tickets ? `<section class="card" id="oracleResult"><h2>${g.name}の神託</h2>${tickets}
      <p class="note">${kaburiNote}</p></section>` : ''}
    <section class="card">
      <div class="row between"><h2 class="m0">出現の傾向</h2>
        <div class="seg" role="group" aria-label="集計範囲"><button type="button" data-trend="100" aria-pressed="${state.trend !== 'all'}">直近100回</button><button type="button" data-trend="all" aria-pressed="${state.trend === 'all'}">全${list.length}回</button></div></div>
      ${trendHtml(list)}
    </section>`;
  fillChara(o.praying ? pickLine(CHARS[state.char].lines.pray) : (res ? '神託が出ました。気に入った番号は登録しておけますよ' : '流派をえらんで「神託をいただく」を押してくださいね'));
}

// 出現の傾向（くじの種類ごと）
function trendHtml(list) {
  const g = GAMES[state.game], type = gtype();
  const win = state.trend === 'all' ? list.length : 100;
  const shape = shapeStats(state.game, list);
  const shapeNote = (what, oddWhat) => `<p class="note">直近300回の${what}の合計は、${shape.sumLow}〜${shape.sumHigh} に収まる回が多め（真ん中の6割）。${oddWhat}は ${shape.oddTop.join('・')} 個の回が多めです。過去の傾向は、次の回の結果とは関係ありません。</p>`;
  const chart = (vals, hiSet, label, xs, cls = () => '') => {
    const maxF = Math.max(1, ...vals.map(x => x.v));
    return `<div class="chart" style="grid-template-columns:repeat(${vals.length},1fr)" role="img" aria-label="${label}">${vals.map(x => `<div class="bar${hiSet.has(x.n) ? ' hi' : ''}${cls(x.n)}" style="height:${Math.round(x.v / maxF * 100)}%" title="${x.n}：${x.v}回"></div>`).join('')}</div>
      <div class="chart-x" style="grid-template-columns:repeat(${vals.length},1fr)" aria-hidden="true">${vals.map(x => `<span>${xs(x.n)}</span>`).join('')}</div>`;
  };

  if (type === 'numbers') {
    const f = digitFrequency(state.game, list, win), a = digitAbsence(state.game, list);
    const blocks = f.map((counts, p) => {
      const hot = ranking(counts, 1, true, 0)[0], cold = ranking(a[p], 1, true, 0)[0];
      return `<div class="digit-trend"><h3>${POS_NAMES[g.digits][p]}</h3>
        ${chart(counts.map((v, n) => ({ n, v })), new Set([hot.n]), `${POS_NAMES[g.digits][p]}の数字ごとの出現回数`, n => n)}
        <p class="note m0">よく出る ${hot.n}（${hot.v}回）・ご無沙汰 ${cold.n}（${cold.v}回出ていない）</p></div>`;
    }).join('');
    return `${blocks}${shapeNote('各桁の数字', '奇数の桁の数')}`;
  }

  const f = frequency(state.game, list, win), a = absence(state.game, list);
  const vals = f.slice(1).map((v, i) => ({ n: i + 1, v }));
  if (type === 'bingo') {
    // マスごとに、よく出る数字とご無沙汰の数字
    const rows = Array.from({ length: 8 }, (_, i) => {
      const [lo, hi] = cellRange(i + 1);
      const sub = arr => arr.map((v, n) => ({ n, v })).filter(x => x.n >= lo && x.n <= hi);
      const hot = sub(f).sort((x, y) => y.v - x.v || x.n - y.n)[0], cold = sub(a).sort((x, y) => y.v - x.v || x.n - y.n)[0];
      return { k: i + 1, lo, hi, hot, cold };
    });
    const hotSet = new Set(rows.map(r => r.hot.n));
    return `${chart(vals, hotSet, '数字ごとの出現回数（マスごとに5つずつ）', n => (n - 1) % 5 === 0 ? n : '', n => Math.ceil(n / 5) % 2 === 0 ? ' alt' : '')}
      <table class="prize trend-table"><thead><tr><th>マス</th><th>よく出る</th><th>ご無沙汰</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>マス${r.k}<span class="muted">（${r.lo}〜${r.hi}）</span></td><td>${r.hot.n}（${r.hot.v}回）</td><td>${r.cold.n}（${r.cold.v}回）</td></tr>`).join('')}
      </tbody></table>
      <p class="note">「ご無沙汰」のかっこ内は、何回出ていないか。中央のマスは FREE です。</p>
      ${shapeNote('8個の数字', '奇数の数')}`;
  }
  const hot = ranking(f, 5), cold = ranking(a, 5);
  const hotSet = new Set(hot.map(x => x.n));
  return `${chart(vals, hotSet, '数字ごとの出現回数', n => n % 5 === 0 || n === 1 ? n : '')}
      <div class="rank mt16">
        <div><h3>よく出る数字</h3><ol>${hot.map(x => `<li>${x.n}（${x.v}回）</li>`).join('')}</ol></div>
        <div><h3>ご無沙汰の数字</h3><ol>${cold.map(x => `<li>${x.n}（${x.v}回出ていない）</li>`).join('')}</ol></div>
      </div>
      ${shapeNote('本数字', '奇数の数')}`;
}

// ---------- ご祈祷のカットイン ----------
// 画面いっぱいにキャラが割り込み、持ち物（神楽鈴・大幣）を左右に振る2枚の絵を交互に出して、一生懸命ご祈祷している様子を見せる。
// 絵がまだ無いキャラは「お祈り」の絵を揺らして代わりにする。画面をタップするとすぐ終わる。
const PRAY_WORDS = { miko: '神楽鈴をシャンシャン…', kannushi: '祓いたまえ、清めたまえ…', kitsune: 'こんこん…お祓いするこん', neko: 'しゃんしゃん…福よ来いにゃ' };
function playCutin(charId) {
  return new Promise(resolve => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const c = CHARS[charId];
    const el = document.createElement('div');
    el.className = 'cutin' + (reduce ? ' still' : '');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', `${c.name}がご祈祷しています`);
    el.tabIndex = -1;
    el.innerHTML = `
      <div class="cutin-band" aria-hidden="true"></div>
      <div class="cutin-stage" aria-hidden="true">
        <img class="cutin-img f1" alt="" src="${imgPath(charId, 'oharai1')}">
        <img class="cutin-img f2" alt="" src="${imgPath(charId, 'oharai2')}">
        <span class="spark s1"></span><span class="spark s2"></span><span class="spark s3"></span><span class="spark s4"></span>
      </div>
      <p class="cutin-text"><b>${c.name}</b><span>${PRAY_WORDS[charId] || 'ご祈祷中…'}</span></p>
      <p class="cutin-skip">タップでとばす</p>`;
    // 振る絵が無ければお祈りの絵を揺らす。それも無ければ絵は出さない（壊れた画像の枠を見せない）
    let stage = 0;
    el.querySelectorAll('.cutin-img').forEach(img => img.addEventListener('error', () => {
      if (stage === 0) {
        stage = 1; el.classList.add('no-swing');
        el.querySelectorAll('.cutin-img').forEach(i => { i.src = imgPath(charId, 'pray'); });
      } else if (stage === 1) {
        stage = 2; el.querySelectorAll('.cutin-img').forEach(i => { i.style.visibility = 'hidden'; });
      }
    }));
    // カットインの間は、後ろの画面をキーボードでも触れないようにする
    const behind = [...document.querySelectorAll('header.top, .game-switch, main, nav.tabs')];
    behind.forEach(b => { b.inert = true; });
    document.body.appendChild(el);
    el.focus({ preventScroll: true });

    // 2枚を交互に切り替えて「振っている」ように見せる（動きを減らす設定では切り替えない）
    let frame = 0;
    const swing = reduce ? null : setInterval(() => { frame ^= 1; el.classList.toggle('alt', frame === 1); }, 170);
    const startedAt = performance.now();
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      clearInterval(swing); clearTimeout(timer);
      document.removeEventListener('keydown', onKey);
      behind.forEach(b => { b.inert = false; });
      el.classList.add('out');
      setTimeout(() => { el.remove(); resolve(); }, reduce ? 0 : 380);
    };
    // 「神託をいただく」の押しすぎ（ダブルタップ）でとばさないよう、出てすぐのタップは無視する
    const skip = () => { if (performance.now() - startedAt > 700) finish(); };
    const onKey = e => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); skip(); } };
    const timer = setTimeout(finish, reduce ? 900 : 2600);
    el.addEventListener('click', skip);
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => el.classList.add('in'));
  });
}

async function doOracle() {
  const o = state.oracle;
  // 待っているあいだにくじの種類が切り替わっても混ざらないよう、始めた時点のくじとデータで作る
  const game = state.game, list = draws(game), run = ++o.run;
  o.praying = true; o.result = null; render();
  await playCutin(state.char);
  if (run !== o.run) return;
  o.praying = false;
  o.result = { game, tickets: oracle(game, list, o.school, o.count, { birthday: store.get('birthday', '', isDate) }) };
  if (state.game !== game) { toast('くじの種類を切り替えたので、神託は取り消しました'); o.result = null; }
  await render();
  if (o.result && state.tab === 'oracle') $('#oracleResult')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- 画面：マイ番号 ----------
function saveTickets(list) { store.set('tickets', list); }
// ロトは小さい順に並べて保存。ビンゴ5（マス順）・ナンバーズ（桁順）は並び順に意味があるのでそのまま。ナンバーズは申込タイプも保存
function addTicket(game, nums, drawNo, type) {
  const g = GAMES[game], isNum = g && g.type === 'numbers';
  const sorted = g && g.type === 'loto' ? [...nums].sort((a, b) => a - b) : [...nums];
  if (!isGame(game) || !validTicket(game, sorted, type) || !Number.isInteger(drawNo)) { toast('この番号は登録できません'); return false; }
  const list = loadTickets();
  if (list.some(t => t.game === game && t.draw === drawNo && t.nums.join() === sorted.join() && (!isNum || t.type === type))) { toast('同じ番号がもう登録されています'); return false; }
  const item = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), game, nums: sorted, draw: drawNo, created: Date.now() };
  if (isNum) item.type = type;
  list.push(item);
  saveTickets(list); return true;
}
// 登録した番号の表示（くじの種類ごと）
function ticketNumsHtml(game, nums, opts = {}) {
  const t = gtype(game);
  if (t === 'bingo') return boardHtml(nums, opts);
  if (t === 'numbers') return digitsHtml(nums, opts);
  return ballsHtml(nums, [], opts);
}
// ナンバーズで光らせる桁：当たりなら当たった桁、はずれならストレート・セットは同じ位置で一致した桁、ミニは下2桁で一致した桁
function numbersHits(t, dr, result) {
  if (result === 'mini') return t.nums.map((_, i) => i >= t.nums.length - 2);
  if (result) return t.nums.map(() => true);
  if (t.type === 'box') return [];
  return t.nums.map((d, i) => d === dr.main[i] && (t.type !== 'mini' || i >= t.nums.length - 2));
}

function renderMine() {
  const list = draws();
  const nx = upcoming();
  if (state.pickDraw == null) state.pickDraw = nx.n;
  const byNo = new Map(list.map(x => [x.n, x]));
  const mine = loadTickets().filter(t => t.game === state.game).sort((a, b) => b.draw - a.draw || b.created - a.created);

  let best = 0, bestRes = 0, bestAmount = null, decided = 0;
  const type = gtype();
  const items = mine.map(t => {
    const dr = byNo.get(t.draw);
    let res = '<span class="res muted">抽せん待ち</span>', balls = ticketNumsHtml(state.game, t.nums, { small: true }), extra = '';
    if (dr) {
      decided++;
      const r = judge(state.game, t.nums, dr, t.type);
      const rank = winRank(state.game, r);
      const p = prizeOf(state.game, dr, r);
      if (rank && (!best || rank < best)) { best = rank; bestRes = r; bestAmount = p.amount; }
      res = r ? `<span class="res win">${p.label}${type === 'numbers' ? '' : ' '}当せん！ ${p.amount ? yen(p.amount) : '（金額は公式発表で確認）'}</span>` : '<span class="res">はずれ</span>';
      if (type === 'bingo') {
        const ls = bingoLines(t.nums, dr.main);
        balls = boardHtml(t.nums, { small: true, hits: bingoHits(t.nums, dr.main), lines: ls });
        extra = `<p class="note">そろったライン ${ls.length}本${ls.length ? '：' + ls.map(i => LINE_NAMES[i]).join('、') : ''}</p>`;
      } else if (type === 'numbers') {
        balls = digitsHtml(t.nums, { small: true, hits: numbersHits(t, dr, r) });
      } else {
        balls = ballsHtml(t.nums, [], { small: true, hits: t.nums.filter(n => dr.main.includes(n)) });
      }
    } else if (t.draw < nx.n) {
      res = '<span class="res muted">結果の取り込み待ち</span>';
    }
    return `<div class="entry">
      <div class="row between"><b>第${t.draw}回${type === 'numbers' ? `・${NUM_TYPES[t.type].name}` : ''}</b>${res}</div>
      <div class="mt8">${balls}</div>${extra}
      <div class="row end mt8"><button type="button" class="btn ghost" data-del="${t.id}">削除</button></div>
    </div>`;
  }).join('');

  const L = CHARS[state.char].lines;
  const expr = best ? 'joy' : decided ? 'sad' : 'normal';
  const line = best ? (isBigWin(state.game, bestRes, bestAmount) ? L.big[0] : L.win[0]) : decided ? L.lose[0] : '買った番号を登録しておくと、結果が入ったときに自動で確かめますね';

  view.innerHTML = `
    ${charaHtml(expr)}
    <section class="card" id="pickCard">${pickCardHtml()}</section>
    <section class="card">
      <h2>登録した番号（${mine.length}件）</h2>
      ${items || '<p class="muted">まだ登録がありません。神託の画面からも登録できます。</p>'}
      <p class="note">登録した番号はこの端末の中だけに保存され、外には送られません。当せんの最終確認は必ず売り場または公式サイトで行ってください。</p>
    </section>`;
  fillChara(line);
  // 開いたまま抽せん時刻を過ぎたら、対象の回の選択肢を作り直す
  clearTimeout(renderMine.t);
  renderMine.t = setTimeout(() => { if (state.tab === 'mine') { state.pickDraw = null; render(); } }, Math.max(1000, nx.time - Date.now() + 1000));
}

// 番号を登録するカード（選ぶたびにこのカードの中だけを書きかえる）
function pickCardHtml() {
  const g = GAMES[state.game], list = draws(), last = list.at(-1), nx = upcoming();
  // 対象の回：次の次・次回・抽せん済みで未反映の回・取り込み済みの直近10回
  const nos = [nx.n + 1, nx.n];
  for (let n = nx.n - 1; n > last.n; n--) nos.push(n);
  list.slice(-10).reverse().forEach(x => nos.push(x.n));
  const drawOpts = nos.map(n => {
    const label = n === nx.n ? '（次回）' : n > nx.n ? '' : n > last.n ? '（抽せん済み・結果待ち）' : '（抽せん済み）';
    return `<option value="${n}" ${n === state.pickDraw ? 'selected' : ''}>第${n}回${label}</option>`;
  }).join('');
  const ready = pickReady();
  const foot = `<label class="field">対象の回<select id="pickDraw">${drawOpts}</select></label>
      <div class="row nowrap mt16">
        <button type="button" class="btn ghost" id="clearPick">クリア</button>
        <button type="button" class="btn" id="savePick" ${ready ? '' : 'disabled'}>登録する</button>
      </div>`;
  const type = gtype();

  if (type === 'bingo') {
    const cells = new Array(9);
    cells[FREE_POS] = '<span class="pcell free">FREE</span>';
    CELL_POS.forEach((p, i) => {
      const [lo, hi] = cellRange(i + 1), v = state.pick[i];
      cells[p] = `<button type="button" class="pcell${v != null ? ' filled' : ''}" data-cell="${i}" aria-pressed="${state.pickPos === i}" aria-label="マス${i + 1}（${lo}〜${hi}）${v != null ? `：${v}` : '：未選択'}"><b>${v != null ? pad2(v) : '—'}</b><span>${lo}〜${hi}</span></button>`;
    });
    const [lo] = cellRange(state.pickPos + 1);
    const nums = [0, 1, 2, 3, 4].map(j => lo + j).map(n => `<button type="button" data-bnum="${n}" aria-pressed="${state.pick[state.pickPos] === n}" aria-label="${n}">${n}</button>`).join('');
    const filled = state.pick.filter(v => v != null).length;
    return `<h2>番号を登録する</h2>
      <p class="note m0" id="pickInfo">盤面のマスをえらんで、そのマスの数字を1つずつ。8マスえらびます。いま ${filled} マス</p>
      <div class="pboard mt16" role="group" aria-label="盤面のマス">${cells.join('')}</div>
      <p class="mt16"><b>マス${state.pickPos + 1}</b>の数字（${lo}〜${lo + 4}）</p>
      <div class="pad pad5" role="group" aria-label="マス${state.pickPos + 1}の数字をえらぶ">${nums}</div>
      ${foot}`;
  }
  if (type === 'numbers') {
    const names = POS_NAMES[g.digits];
    const slots = state.pick.map((v, i) => `<button type="button" class="slot" data-slot="${i}" aria-pressed="${state.pickPos === i}" aria-label="${names[i]}${v != null ? `：${v}` : '：未選択'}"><b>${v ?? '—'}</b><span>${names[i]}</span></button>`).join('');
    const keys = [...Array(10).keys()].map(d => `<button type="button" data-digit="${d}" aria-label="${d}">${d}</button>`).join('');
    const full = state.pick.every(v => v != null), zoro = full && isZorome(state.pick);
    const types = numberTypes(state.game).map(k => {
      const off = zoro && (k === 'box' || k === 'set');
      return `<button type="button" class="school ntype" data-ntype="${k}" aria-pressed="${state.pickType === k}" ${off ? 'disabled' : ''}><b>${NUM_TYPES[k].name}</b><span>${NUM_TYPES[k].desc}</span></button>`;
    }).join('');
    const warn = zoro && (state.pickType === 'box' || state.pickType === 'set')
      ? '<p class="notice mt8" role="status">全部同じ数字（ゾロ目）は、ボックス・セットでは申し込めません。ストレート' + (state.game === 'numbers3' ? 'かミニ' : '') + 'をえらんでください。</p>' : '';
    return `<h2>番号を登録する</h2>
      <p class="note m0" id="pickInfo">${g.name}は ${g.digits} 桁の数字（0〜9、同じ数字も可）と申込タイプをえらびます</p>
      <div class="slots mt16" style="grid-template-columns:repeat(${g.digits},1fr)" role="group" aria-label="桁をえらぶ">${slots}</div>
      <p class="mt16"><b>${names[state.pickPos]}</b>の数字</p>
      <div class="pad pad5" role="group" aria-label="${names[state.pickPos]}の数字をえらぶ">${keys}</div>
      <h3>申込タイプ</h3>
      <div class="schools ntypes">${types}</div>
      ${warn}
      ${foot}`;
  }
  const padBtns = Array.from({ length: g.max }, (_, i) => i + 1).map(n =>
    `<button type="button" data-pick="${n}" aria-pressed="${state.pick.includes(n)}" aria-label="${n}">${n}</button>`).join('');
  return `<h2>番号を登録する</h2>
      <p class="note m0" id="pickInfo">${g.name}は ${g.pick} 個えらびます（1〜${g.max}）。いま ${state.pick.length} 個</p>
      <div class="pad" role="group" aria-label="数字をえらぶ">${padBtns}</div>
      ${foot}`;
}
function pickReady() {
  const g = GAMES[state.game];
  if (g.type === 'loto') return state.pick.length === g.pick;
  if (state.pick.some(v => v == null)) return false;
  return validTicket(state.game, state.pick, g.type === 'numbers' ? state.pickType : undefined);
}
function refreshPick() { const c = $('#pickCard'); if (c) c.innerHTML = pickCardHtml(); }

// ---------- 画面：結果一覧 ----------
function renderHistory() {
  const g = GAMES[state.game];
  view.innerHTML = `
    <section class="card">
      <div class="row between"><h2 class="m0">${g.name} 過去の結果</h2><span class="muted">全${draws().length}回</span></div>
      <label class="field mt16">回の番号でさがす<input type="text" inputmode="numeric" autocomplete="off" id="histQ" value="${state.histQuery}" placeholder="例：2100"></label>
      <div id="histList"></div>
    </section>`;
  renderHistList();
}
// 検索のたびに入力欄は作り直さず、一覧だけを書きかえる
function renderHistList() {
  const box = $('#histList'); if (!box) return;
  const q = state.histQuery;
  let list = [...draws()].reverse();
  if (q) list = list.filter(x => String(x.n).includes(q)).sort((a, b) => (String(b.n) === q) - (String(a.n) === q) || b.n - a.n);
  const shown = list.slice(0, state.histShown);
  box.innerHTML = `<ul class="hist">${shown.map(x => `<li><div class="meta"><b>第${x.n}回</b><span>${fmtDate(x.date)}</span></div>${drawNumsHtml(state.game, x, { small: true })}${topPrizeHtml(state.game, x)}</li>`).join('') || '<li class="muted">見つかりませんでした</li>'}</ul>
    ${list.length > shown.length ? `<button type="button" class="btn sub mt16" id="more">もっと見る（残り${list.length - shown.length}回）</button>` : ''}`;
}
const normalizeDigits = s => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/\D/g, '').slice(0, 5);

// ---------- 設定・同意 ----------
// 取り込み済みの最新回（読み込んだ種類だけ）
function dataStatus() {
  return GAME_KEYS.map(k => `${GAMES[k].name} 第${state.data[k] ? state.data[k].draws.at(-1).n : '-'}回`).join('／');
}
function openSettings() {
  const dlg = $('#settings');
  if (dlg.open) return;
  const opts = Object.entries(CHARS).map(([k, c]) =>
    `<button type="button" class="char-opt" data-char="${k}" aria-pressed="${state.char === k}"><img src="${imgPath(k, 'normal')}" alt="" data-fallback="${imgPath('miko', 'normal')}"><b>${c.name}</b><span>${c.role}</span></button>`).join('');
  dlg.innerHTML = `<div class="dlg">
    <h2 id="settingsTitle">設定</h2>
    <h3>案内してくれるキャラ</h3>
    <div class="chars">${opts}</div>
    <h3 class="mt16">このアプリについて</h3>
    <ul>
      <li>18歳以上の方向けのアプリです。くじの購入はできません。</li>
      <li>神託（予想）はお楽しみ機能です。当せん確率は上がりません。</li>
      <li>くじは無理のない範囲で楽しみましょう。</li>
      <li>当せん番号の出典：ロト6・ロト7はみずほ銀行の公式発表（公開データ jjayck/lotoanaba-data を経由し、公式と照合して取り込み）。ミニロト・ビンゴ5・ナンバーズ3・ナンバーズ4は公開データ lotto-data-hub（MITライセンス。元データは loto-life.net）を元に取り込み、結果は抽せんの翌朝〜午前中に反映されます。正式な結果は公式発表でご確認ください。取り込み済み：<span id="dataStatus">${dataStatus()}</span>まで</li>
      <li>登録した番号や誕生日はこの端末の中だけに保存されます。</li>
      <li><a class="tap-link" href="privacy.html">プライバシーポリシー</a></li>
    </ul>
    <button type="button" class="btn" data-close>閉じる</button>
  </div>`;
  wireFallback(dlg);
  dlg.showModal();
  // まだ読み込んでいない種類は、開いてから読み込んで書きかえる
  Promise.all(GAME_KEYS.map(k => loadData(k).catch(() => null))).then(() => { const el = $('#dataStatus'); if (el) el.textContent = dataStatus(); });
}
function showGate() {
  if (store.get('agreed', false, v => v === true)) return;
  const dlg = $('#gate');
  dlg.innerHTML = `<div class="dlg">
    <h2 id="gateTitle">ようこそ、ロト神社へ</h2>
    <p>はじめに、次のことを確認してください。</p>
    <ul>
      <li>このアプリは <b>18歳以上</b> の方向けです。</li>
      <li>神託（番号予想）は過去のデータを使った <b>お楽しみ機能</b> で、当せん確率は上がりません。</li>
      <li>くじの購入はできません。当せんの確認は必ず公式発表でも行ってください。</li>
    </ul>
    <button type="button" class="btn" id="agree">18歳以上で、内容を理解しました</button>
  </div>`;
  dlg.addEventListener('cancel', e => e.preventDefault());
  dlg.showModal();
}
function confirmDialog(msg) {
  return new Promise(resolve => {
    const dlg = $('#confirm');
    dlg.innerHTML = `<div class="dlg"><p class="m0">${msg}</p><div class="row nowrap mt16"><button type="button" class="btn ghost" data-ans="no">やめる</button><button type="button" class="btn" data-ans="yes">削除する</button></div></div>`;
    dlg.onclick = e => { const b = e.target.closest('[data-ans]'); if (!b) return; dlg.close(); resolve(b.dataset.ans === 'yes'); };
    dlg.oncancel = () => resolve(false);
    dlg.showModal();
  });
}

// ---------- 描画 ----------
async function render() {
  document.querySelectorAll('.game-switch [data-game]').forEach(b => b.setAttribute('aria-selected', b.dataset.game === state.game));
  document.querySelectorAll('.tabs [data-tab]').forEach(b => b.dataset.tab === state.tab ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  try { await loadData(state.game); }
  catch { view.innerHTML = `<section class="card"><h2>データを読み込めませんでした</h2><p class="muted">通信状態を確認して、もう一度開いてください。</p><button class="btn" type="button" id="retry">もう一度読み込む</button></section>`; return; }
  ({ home: renderHome, oracle: renderOracle, mine: renderMine, history: renderHistory })[state.tab]();
}

// ---------- 操作（ボタンの種類ごとに処理を分ける） ----------
const actions = {
  game(t) {
    if (t.dataset.game === state.game) return;
    state.game = t.dataset.game; store.set('game', state.game);
    state.pick = emptyPick(state.game); state.pickPos = 0; state.pickType = 'straight'; state.pickDraw = null; state.histShown = 50; state.histQuery = '';
    render();
  },
  tab(t) { state.tab = t.dataset.tab; window.scrollTo(0, 0); render(); },
  go(t) { state.tab = t.dataset.go; window.scrollTo(0, 0); render(); },
  char(t) {
    state.char = t.dataset.char; store.set('char', state.char);
    document.querySelectorAll('.char-opt').forEach(b => b.setAttribute('aria-pressed', b.dataset.char === state.char));
    toast(`${CHARS[state.char].name}が案内します`); render();
  },
  school(t) { state.oracle.school = t.dataset.school; state.oracle.result = null; render(); },
  step(t) { state.oracle.count = Math.min(5, Math.max(1, state.oracle.count + Number(t.dataset.step))); $('#cnt').textContent = state.oracle.count + '口'; },
  trend(t) { state.trend = t.dataset.trend === 'all' ? 'all' : 100; render(); },
  save(t) {
    const res = state.oracle.result; if (!res) return;
    const nums = res.tickets[Number(t.dataset.save)]; if (!nums) return;
    const nx = upcoming(res.game);
    const type = gtype(res.game) === 'numbers' ? suggestType(res.game, nums) : undefined;
    if (addTicket(res.game, nums, nx.n, type)) { toast(`第${nx.n}回の番号として登録しました`); t.disabled = true; t.textContent = '登録しました'; }
  },
  pick(t) {
    const n = Number(t.dataset.pick), g = GAMES[state.game];
    if (state.pick.includes(n)) state.pick = state.pick.filter(x => x !== n);
    else if (state.pick.length < g.pick) state.pick.push(n);
    else return toast(`${g.pick}個までです`);
    t.setAttribute('aria-pressed', state.pick.includes(n));
    $('#pickInfo').textContent = `${g.name}は ${g.pick} 個えらびます（1〜${g.max}）。いま ${state.pick.length} 個`;
    $('#savePick').disabled = state.pick.length !== g.pick;
  },
  // ビンゴ5：マスをえらぶ／そのマスの数字をえらぶ（えらんだら次の空いているマスへ）
  cell(t) { state.pickPos = Number(t.dataset.cell); refreshPick(); },
  bnum(t) {
    const n = Number(t.dataset.bnum), i = state.pickPos;
    state.pick[i] = state.pick[i] === n ? null : n;
    if (state.pick[i] != null) { const next = [...Array(8).keys()].map(j => (i + 1 + j) % 8).find(j => state.pick[j] == null); if (next != null) state.pickPos = next; }
    refreshPick();
  },
  // ナンバーズ：桁をえらぶ／数字を入れる（入れたら次の桁へ）／申込タイプ
  slot(t) { state.pickPos = Number(t.dataset.slot); refreshPick(); },
  digit(t) {
    state.pick[state.pickPos] = Number(t.dataset.digit);
    if (state.pickPos < state.pick.length - 1) state.pickPos++;
    refreshPick();
  },
  ntype(t) { state.pickType = t.dataset.ntype; refreshPick(); },
  async del(t) {
    if (await confirmDialog('この番号を削除しますか？元には戻せません。')) { saveTickets(loadTickets().filter(x => x.id !== t.dataset.del)); toast('削除しました'); render(); }
  },
};
const byId = {
  retry: () => render(),
  openSettings: () => openSettings(),
  agree: () => { store.set('agreed', true); $('#gate').close(); },
  doOracle: () => doOracle(),
  clearPick: () => { state.pick = emptyPick(state.game); state.pickPos = 0; render(); },
  savePick: () => {
    const isLoto = gtype() === 'loto';
    const nums = isLoto ? [...state.pick].sort((a, b) => a - b) : [...state.pick];
    const drawNo = Number($('#pickDraw').value);
    if (addTicket(state.game, nums, drawNo, gtype() === 'numbers' ? state.pickType : undefined)) { state.pick = emptyPick(state.game); state.pickPos = 0; state.pickDraw = null; toast(`第${drawNo}回の番号として登録しました`); render(); }
  },
  more: () => { state.histShown += 50; renderHistList(); },
};
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t || t.disabled) return;
  if (t.hasAttribute('data-close')) return t.closest('dialog').close();
  if (byId[t.id]) return byId[t.id]();
  const key = Object.keys(actions).find(k => t.dataset[k] != null);
  if (key) actions[key](t);
});
document.addEventListener('change', e => {
  if (e.target.id === 'birthday') store.set('birthday', isDate(e.target.value) ? e.target.value : '');
  if (e.target.id === 'pickDraw') state.pickDraw = Number(e.target.value);
});
document.addEventListener('input', e => {
  if (e.target.id !== 'histQ' || e.isComposing) return;
  const v = normalizeDigits(e.target.value);
  if (v !== e.target.value) e.target.value = v;
  state.histQuery = v; state.histShown = 50; renderHistList();
});
document.addEventListener('compositionend', e => { if (e.target.id === 'histQ') e.target.dispatchEvent(new Event('input', { bubbles: true })); });

// ---------- 起動 ----------
// 最初は選んでいるくじのデータだけを読み込む（ほかの種類は切り替えたときに読み込む）
render();
showGate();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
