import { GAMES, SCHOOLS, judge, validTicket, nextDraw, frequency, absence, ranking, shapeStats, oracle, kaburi } from './lotto.js';

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
const isGame = v => v === 'loto6' || v === 'loto7';
const isChar = v => Object.hasOwn(CHARS, v);
const isDate = v => typeof v === 'string' && (v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v));
function loadTickets() {
  const list = store.get('tickets', [], Array.isArray);
  return list.filter(t => t && isGame(t.game) && Number.isInteger(t.draw) && validTicket(t.game, t.nums) && typeof t.id === 'string');
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
  pickDraw: null,
};

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
const upcoming = (game = state.game) => nextDraw(game, draws(game).at(-1));

function ballsHtml(main, bonus = [], opts = {}) {
  const hitSet = new Set(opts.hits || []);
  const sm = opts.small ? ' sm' : '';
  const m = main.map(n => `<span class="ball${sm}${hitSet.has(n) ? ' hit' : ''}">${pad2(n)}</span>`).join('');
  const b = bonus.length ? `<span class="bonus-group"><span class="plus">ボーナス</span>${bonus.map(n => `<span class="ball bonus${sm}">${pad2(n)}</span>`).join('')}</span>` : '';
  return `<div class="balls" aria-label="本数字 ${main.join('、')}${bonus.length ? ' ボーナス ' + bonus.join('、') : ''}">${m}${b}</div>`;
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
  const prizeRows = last.prizes.map((p, i) => `<tr><td>${i + 1}等</td><td>${last.winners[i].toLocaleString('ja-JP')}口</td><td>${prizeText(p)}</td></tr>`).join('');
  const carry = last.carryover == null ? '' :
    `<p class="carry">キャリーオーバー <b>${last.carryover ? yen(last.carryover) : 'なし'}</b></p>`;
  view.innerHTML = `
    ${nx.pending ? `<p class="notice strong" role="status">第${last.n + 1}回${nx.pending > 1 ? `〜第${last.n + nx.pending}回` : ''}は抽せん済みですが、まだ結果を取り込めていません。最新の結果は公式発表（宝くじ公式サイト）でご確認ください。</p>` : ''}
    ${charaHtml('normal')}
    <section class="card">
      <div class="result-head"><span class="no">${g.name} 第${last.n}回</span><span class="muted">${fmtDate(last.date)}</span></div>
      ${ballsHtml(last.main, last.bonus)}
      ${carry}
      <table class="prize"><thead><tr><th>等級</th><th>口数</th><th>1口あたり</th></tr></thead><tbody>${prizeRows}</tbody></table>
      <p class="note">当せん番号は必ず公式発表（宝くじ公式サイト・みずほ銀行）でもご確認ください。</p>
    </section>
    <section class="card countdown">
      <div><div class="muted">次回 第${nx.n}回</div><div>${fmtJst(nx.time)}</div></div>
      <div class="big" id="cd"></div>
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
  const o = state.oracle, g = GAMES[state.game], list = draws();
  const birthday = store.get('birthday', '', isDate);
  const schools = Object.entries(SCHOOLS).map(([k, s]) =>
    `<button type="button" class="school" data-school="${k}" aria-pressed="${o.school === k}"><b>${s.name}</b><span>${s.desc}</span></button>`).join('');

  // 結果は、作ったときと同じくじの種類のときだけ表示する
  const res = o.result && o.result.game === state.game ? o.result : null;
  const tickets = res ? res.tickets.map((t, i) => {
    const k = kaburi(state.game, t, list.at(-1));
    const cls = k.score >= 80 ? 'good' : k.score >= 50 ? '' : 'bad';
    return `<div class="ticket">
      <div class="row between"><b>${i + 1}口目</b><span class="tag ${cls}">かぶりにくさ ${k.score}点・${k.label}</span></div>
      <div class="mt8">${ballsHtml(t, [], { small: true })}</div>
      <div class="meter ${cls}" aria-hidden="true"><i style="width:${k.score}%"></i></div>
      <div class="note">${k.reasons.map(r => '・' + r).join('<br>')}</div>
      <div class="mt8"><button type="button" class="btn small sub" data-save="${i}">マイ番号に登録</button></div>
    </div>`;
  }).join('') : '';

  const win = state.trend === 'all' ? list.length : 100;
  const f = frequency(state.game, list, win), a = absence(state.game, list);
  const maxF = Math.max(...f.slice(1));
  const hot = ranking(f, 5), cold = ranking(a, 5);
  const hotSet = new Set(hot.map(x => x.n));
  const bars = f.slice(1).map((v, i) => `<div class="bar${hotSet.has(i + 1) ? ' hi' : ''}" style="height:${Math.round(v / maxF * 100)}%" title="${i + 1}：${v}回"></div>`).join('');
  const xs = f.slice(1).map((_, i) => `<span>${(i + 1) % 5 === 0 || i === 0 ? i + 1 : ''}</span>`).join('');
  const shape = shapeStats(state.game, list);

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
      <p class="disclaimer">神託は過去のデータを使ったお楽しみ機能です。抽せんは毎回まったくの偶然で決まるため、当せん確率は上がりません。</p>
    </section>
    ${tickets ? `<section class="card" id="oracleResult"><h2>${g.name}の神託</h2>${tickets}
      <p class="note">「かぶりにくさ」は、誕生日の数字や連番など人が選びがちな形を避けているほど高くなります。当せん確率は変わりませんが、当たったときに賞金を分け合う人が少なくなりやすくなります。</p></section>` : ''}
    <section class="card">
      <div class="row between"><h2 class="m0">出現の傾向</h2>
        <div class="seg" role="group" aria-label="集計範囲"><button type="button" data-trend="100" aria-pressed="${state.trend !== 'all'}">直近100回</button><button type="button" data-trend="all" aria-pressed="${state.trend === 'all'}">全${list.length}回</button></div></div>
      <div class="chart" style="grid-template-columns:repeat(${g.max},1fr)" role="img" aria-label="数字ごとの出現回数">${bars}</div>
      <div class="chart-x" style="grid-template-columns:repeat(${g.max},1fr)" aria-hidden="true">${xs}</div>
      <div class="rank mt16">
        <div><h3>よく出る数字</h3><ol>${hot.map(x => `<li>${x.n}（${x.v}回）</li>`).join('')}</ol></div>
        <div><h3>ご無沙汰の数字</h3><ol>${cold.map(x => `<li>${x.n}（${x.v}回出ていない）</li>`).join('')}</ol></div>
      </div>
      <p class="note">直近300回の本数字の合計は、${shape.sumLow}〜${shape.sumHigh} に収まる回が多め（真ん中の6割）。奇数の数は ${shape.oddTop.join('・')} 個の回が多めです。過去の傾向は、次の回の結果とは関係ありません。</p>
    </section>`;
  fillChara(o.praying ? pickLine(CHARS[state.char].lines.pray) : (res ? '神託が出ました。気に入った番号は登録しておけますよ' : '流派をえらんで「神託をいただく」を押してくださいね'));
}

async function doOracle() {
  const o = state.oracle;
  // 待っているあいだにくじの種類が切り替わっても混ざらないよう、始めた時点のくじとデータで作る
  const game = state.game, list = draws(game), run = ++o.run;
  o.praying = true; o.result = null; render();
  await new Promise(r => setTimeout(r, matchMedia('(prefers-reduced-motion: reduce)').matches ? 200 : 1400));
  if (run !== o.run) return;
  o.praying = false;
  o.result = { game, tickets: oracle(game, list, o.school, o.count, { birthday: store.get('birthday', '', isDate) }) };
  if (state.game !== game) { toast('くじの種類を切り替えたので、神託は取り消しました'); o.result = null; }
  await render();
  if (o.result && state.tab === 'oracle') $('#oracleResult')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- 画面：マイ番号 ----------
function saveTickets(list) { store.set('tickets', list); }
function addTicket(game, nums, drawNo) {
  const sorted = [...nums].sort((a, b) => a - b);
  if (!isGame(game) || !validTicket(game, sorted) || !Number.isInteger(drawNo)) { toast('この番号は登録できません'); return false; }
  const list = loadTickets();
  if (list.some(t => t.game === game && t.draw === drawNo && t.nums.join() === sorted.join())) { toast('同じ番号がもう登録されています'); return false; }
  list.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), game, nums: sorted, draw: drawNo, created: Date.now() });
  saveTickets(list); return true;
}

function renderMine() {
  const g = GAMES[state.game], list = draws(), last = list.at(-1);
  const nx = upcoming();
  if (state.pickDraw == null) state.pickDraw = nx.n;
  const byNo = new Map(list.map(x => [x.n, x]));
  const mine = loadTickets().filter(t => t.game === state.game).sort((a, b) => b.draw - a.draw || b.created - a.created);

  let best = 0, decided = 0;
  const items = mine.map(t => {
    const dr = byNo.get(t.draw);
    let res = '<span class="res muted">抽せん待ち</span>', balls = ballsHtml(t.nums, [], { small: true });
    if (dr) {
      decided++;
      const tier = judge(state.game, t.nums, dr);
      if (tier && (!best || tier < best)) best = tier;
      res = tier ? `<span class="res win">${tier}等 当せん！ ${dr.prizes[tier - 1] ? yen(dr.prizes[tier - 1]) : '（金額は公式発表で確認）'}</span>` : '<span class="res">はずれ</span>';
      balls = ballsHtml(t.nums, [], { small: true, hits: t.nums.filter(n => dr.main.includes(n)) });
    } else if (t.draw < nx.n) {
      res = '<span class="res muted">結果の取り込み待ち</span>';
    }
    return `<div class="entry">
      <div class="row between"><b>第${t.draw}回</b>${res}</div>
      <div class="mt8">${balls}</div>
      <div class="row end mt8"><button type="button" class="btn ghost" data-del="${t.id}">削除</button></div>
    </div>`;
  }).join('');

  const L = CHARS[state.char].lines;
  const expr = best ? 'joy' : decided ? 'sad' : 'normal';
  const line = best ? (best <= 3 ? L.big[0] : L.win[0]) : decided ? L.lose[0] : '買った番号を登録しておくと、結果が入ったときに自動で確かめますね';

  const padBtns = Array.from({ length: g.max }, (_, i) => i + 1).map(n =>
    `<button type="button" data-pick="${n}" aria-pressed="${state.pick.includes(n)}" aria-label="${n}">${n}</button>`).join('');
  // 対象の回：次の次・次回・抽せん済みで未反映の回・取り込み済みの直近10回
  const nos = [nx.n + 1, nx.n];
  for (let n = nx.n - 1; n > last.n; n--) nos.push(n);
  list.slice(-10).reverse().forEach(x => nos.push(x.n));
  const drawOpts = nos.map(n => {
    const label = n === nx.n ? '（次回）' : n > nx.n ? '' : n > last.n ? '（抽せん済み・結果待ち）' : '（抽せん済み）';
    return `<option value="${n}" ${n === state.pickDraw ? 'selected' : ''}>第${n}回${label}</option>`;
  }).join('');

  view.innerHTML = `
    ${charaHtml(expr)}
    <section class="card">
      <h2>番号を登録する</h2>
      <p class="note m0" id="pickInfo">${g.name}は ${g.pick} 個えらびます（1〜${g.max}）。いま ${state.pick.length} 個</p>
      <div class="pad" role="group" aria-label="数字をえらぶ">${padBtns}</div>
      <label class="field">対象の回<select id="pickDraw">${drawOpts}</select></label>
      <div class="row nowrap mt16">
        <button type="button" class="btn ghost" id="clearPick">クリア</button>
        <button type="button" class="btn" id="savePick" ${state.pick.length === g.pick ? '' : 'disabled'}>登録する</button>
      </div>
    </section>
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
  box.innerHTML = `<ul class="hist">${shown.map(x => `<li><div class="meta"><b>第${x.n}回</b><span>${fmtDate(x.date)}</span></div>${ballsHtml(x.main, x.bonus, { small: true })}<div class="note m0">1等 ${x.winners[0]}口 ${prizeText(x.prizes[0])}</div></li>`).join('') || '<li class="muted">見つかりませんでした</li>'}</ul>
    ${list.length > shown.length ? `<button type="button" class="btn sub mt16" id="more">もっと見る（残り${list.length - shown.length}回）</button>` : ''}`;
}
const normalizeDigits = s => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/\D/g, '').slice(0, 5);

// ---------- 設定・同意 ----------
function openSettings() {
  const dlg = $('#settings'), d6 = state.data.loto6, d7 = state.data.loto7;
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
      <li>当せん番号の出典：みずほ銀行の公式発表。取り込み済み：ロト6 第${d6 ? d6.draws.at(-1).n : '-'}回／ロト7 第${d7 ? d7.draws.at(-1).n : '-'}回まで</li>
      <li>登録した番号や誕生日はこの端末の中だけに保存されます。</li>
    </ul>
    <button type="button" class="btn" data-close>閉じる</button>
  </div>`;
  wireFallback(dlg);
  dlg.showModal();
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
    state.pick = []; state.pickDraw = null; state.histShown = 50; state.histQuery = '';
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
    if (addTicket(res.game, nums, nx.n)) { toast(`第${nx.n}回の番号として登録しました`); t.disabled = true; t.textContent = '登録しました'; }
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
  async del(t) {
    if (await confirmDialog('この番号を削除しますか？元には戻せません。')) { saveTickets(loadTickets().filter(x => x.id !== t.dataset.del)); toast('削除しました'); render(); }
  },
};
const byId = {
  retry: () => render(),
  openSettings: () => openSettings(),
  agree: () => { store.set('agreed', true); $('#gate').close(); },
  doOracle: () => doOracle(),
  clearPick: () => { state.pick = []; render(); },
  savePick: () => {
    const nums = [...state.pick].sort((a, b) => a - b);
    const drawNo = Number($('#pickDraw').value);
    if (addTicket(state.game, nums, drawNo)) { state.pick = []; toast(`第${drawNo}回の番号として登録しました`); render(); }
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
Promise.all([loadData('loto6').catch(() => null), loadData('loto7').catch(() => null)]).finally(render);
showGate();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
