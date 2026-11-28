// エミュレーターで起動したアプリを adb で操作して、画面を撮り、動きを確かめる（emulator-check.sh から呼ぶ）。
// ・タップは adb（input tap）で行う。押す場所は、WebView の中の部品の位置（Chrome の開発者ツールの仕組みで読む）から計算する
// ・同意 → ホーム（バナー広告・取り込み）→ 神託（リワードのテスト広告を最後まで見る）→ マイ番号（登録）→ 戻るボタン
// ・JS のエラー（例外・console.error）が無いこと
// 結果は <出力フォルダ>/emulator-<印>-summary.txt と emulator-<印>-NN-*.png（印は API の番号。環境変数 EMU_TAG）
import { execFileSync } from 'child_process';
import fs from 'fs';

const [OUT, PKG] = process.argv.slice(2);
const TAG = process.env.EMU_TAG || 'api';
const adb = (...a) => execFileSync('adb', a, { encoding: 'utf8', maxBuffer: 64 << 20, timeout: 60000 }); // 止まったままにならないよう60秒で打ち切る
const sleep = ms => new Promise(r => setTimeout(r, ms));
const lines = [];
let failed = 0;
const note = s => { console.log(s); lines.push(s); };
const check = (name, ok, extra = '') => { note(`${ok ? 'OK' : 'NG'}  ${name}${extra ? `（${extra}）` : ''}`); if (!ok) failed++; };
let shotNo = 0;
// 画面を撮る。エミュレーターが重いときは撮れないことがあるので、3回まで試し、撮れなくても操作は続ける
const shot = name => {
  const f = `${OUT}/emulator-${TAG}-${String(++shotNo).padStart(2, '0')}-${name}.png`;
  for (let i = 0; i < 3; i++) {
    try { fs.writeFileSync(f, execFileSync('adb', ['exec-out', 'screencap', '-p'], { maxBuffer: 64 << 20, timeout: 60000 })); note(`画面：${f.split('/').pop()}`); return; }
    catch { execFileSync('sleep', ['5']); }
  }
  note(`画面を撮れませんでした：${f.split('/').pop()}`);
};
const resumed = () => { try { return (adb('shell', 'dumpsys', 'activity', 'activities').match(/(?:mResumedActivity|topResumedActivity)[^\n]*/) || [''])[0]; } catch { return ''; } };

// ---------- WebView（Chrome の開発者ツールの仕組み） ----------
let ws, msgId = 0;
const pending = new Map(), jsErrors = [], consoleLog = [];
async function connect() {
  try { ws?.close(); } catch { /* 閉じている */ }
  for (let i = 0; i < 90; i++) {
    const sock = (adb('shell', 'cat', '/proc/net/unix').match(/@(webview_devtools_remote_\d+)/) || [])[1];
    if (sock) {
      adb('forward', 'tcp:9222', `localabstract:${sock}`);
      try {
        const list = await (await fetch('http://127.0.0.1:9222/json')).json();
        const page = list.find(p => p.type === 'page' && /localhost/.test(p.url));
        if (page) {
          ws = new WebSocket(page.webSocketDebuggerUrl);
          await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
          // 接続が切れたら（アプリが終了した等）、待っている呼び出しをすべて失敗にする
          ws.onclose = () => { for (const [, f] of pending) f({ closed: true }); pending.clear(); };
          ws.onmessage = ev => {
            const m = JSON.parse(ev.data);
            if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
            if (m.method === 'Runtime.exceptionThrown') jsErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
            if (m.method === 'Runtime.consoleAPICalled') {
              const text = m.params.args.map(a => a.value ?? a.description ?? '').join(' ');
              consoleLog.push(`[${m.params.type}] ${text}`);
              if (m.params.type === 'error') jsErrors.push(text);
            }
          };
          await cdp('Runtime.enable');
          return page.url;
        }
      } catch { /* まだ用意できていない */ }
    }
    await sleep(1000);
  }
  throw new Error('WebView に接続できませんでした');
}
const cdp = (method, params = {}) => new Promise((res, rej) => {
  if (!ws || ws.readyState !== 1) return rej(new Error('WebView との接続が切れました'));
  const id = ++msgId;
  const timer = setTimeout(() => { pending.delete(id); rej(new Error(`応答がありません：${method}`)); }, 20000);
  pending.set(id, m => { clearTimeout(timer); m.closed ? rej(new Error('WebView との接続が切れました')) : res(m); });
  ws.send(JSON.stringify({ id, method, params }));
});
async function js(expr) {
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'JS の評価に失敗');
  return r.result?.result?.value;
}
async function waitFor(expr, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if (await js(expr)) return true; }
    catch (e) { if (/接続が切れました/.test(e.message)) throw e; /* 描画の途中 */ }
    await sleep(500);
  }
  return false;
}

// WebView の画面上の位置。1) uiautomator で読む 2) 画面の大きさとステータスバーの高さ（dumpsys）から計算 3) どちらもだめなら JS でクリックする
let wv = null;
// uiautomator の画面情報から WebView の位置を大きい順に（アプリの画面と、バナー広告の中身の WebView）
function webviewsIn(xml) {
  return [...xml.matchAll(/class="android\.webkit\.WebView"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g)]
    .map(m => ({ x1: +m[1], y1: +m[2], x2: +m[3], y2: +m[4] }))
    .sort((a, b) => (b.x2 - b.x1) * (b.y2 - b.y1) - (a.x2 - a.x1) * (a.y2 - a.y1));
}
// 画面下の重なりを確かめる：バナー広告の下端とタブの上端のすき間（16dp）、タブとジェスチャーバー（ナビゲーションバー）が重ならないこと
async function checkBottom(label) {
  let xml = '';
  for (let i = 0; i < 3 && !xml; i++) { try { adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml'); xml = adb('shell', 'cat', '/sdcard/ui.xml'); } catch { await sleep(1500); } }
  const r = await js("(() => { const t = document.querySelector('nav.tabs').getBoundingClientRect(); const cs = getComputedStyle(document.documentElement); return { top: t.top, bottom: t.bottom, w: innerWidth, tabH: parseFloat(cs.getPropertyValue('--tab-h')), sab: parseFloat(getComputedStyle(document.querySelector('nav.tabs')).paddingBottom) || 0 }; })()");
  const k = (wv.x2 - wv.x1) / r.w;
  const tabsTop = wv.y1 + r.top * k, tabsBottom = wv.y1 + r.bottom * k, tabsContentBottom = tabsTop + r.tabH * k;
  const views = xml ? webviewsIn(xml) : [];
  const ad = views.slice(1).find(v => v.y2 <= tabsTop + 2 && v.y2 - v.y1 < 200 * k && v.x2 - v.x1 > 200 * k);
  if (ad) {
    const gap = (tabsTop - ad.y2) / k;
    check(`${label}：バナー広告の下端とタブの上端のすき間が約16dp（重ならない）`, gap >= 14 && gap <= 20, `すき間 ${gap.toFixed(1)}dp・広告 [${ad.y1}-${ad.y2}]px・タブ上端 ${Math.round(tabsTop)}px`);
  } else note(`${label}：バナー広告の位置を画面情報から読めませんでした（画面で確認）`);
  let nav = null;
  try { const m = adb('shell', 'dumpsys', 'window').match(/navigationBars[^\n]*?[Ff]rame=\[0,(\d+)\]\[\d+,(\d+)\]/); if (m) nav = { y1: +m[1], y2: +m[2] }; } catch { /* 読めない */ }
  if (nav) check(`${label}：タブのボタンがジェスチャーバー（ナビゲーションバー）と重ならない`, tabsContentBottom <= nav.y1 + 2, `タブの下端 ${Math.round(tabsContentBottom)}px・バー [${nav.y1}-${nav.y2}]px・WebView [${wv.y1}-${wv.y2}]px・タブの下の余白 ${r.sab}px`);
  else note(`${label}：ナビゲーションバーの位置を読めませんでした（画面で確認）`);
}
async function webviewBounds() {
  for (let i = 0; i < 3; i++) {
    try {
      adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml');
      const xml = adb('shell', 'cat', '/sdcard/ui.xml');
      const all = webviewsIn(xml);
      if (all.length) return { ...all[0], how: 'uiautomator' }; // いちばん大きい WebView がアプリの画面
    } catch (e) { note(`uiautomator で読めません：${String(e.message).split('\n')[0]}`); }
    await sleep(1000);
  }
  try {
    const [W, H] = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/).slice(1).map(Number);
    const v = await js('({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio })');
    const wpx = Math.round(v.w * v.dpr), hpx = Math.round(v.h * v.dpr);
    let top = 0;
    if (hpx < H - 4) { // WebView がステータスバーの下から始まる（古い WebView では Capacitor が上下に余白をとる）
      const dump = adb('shell', 'dumpsys', 'window');
      const sm = dump.match(/statusBars[^\n]*?[Ff]rame=\[0,0\]\[\d+,(\d+)\]/);
      top = sm ? Number(sm[1]) : 0;
    }
    return { x1: Math.round((W - wpx) / 2), y1: top, x2: Math.round((W + wpx) / 2), y2: top + hpx, how: 'dumpsys' };
  } catch (e) { note(`dumpsys でも読めません：${e.message}`); }
  return null;
}
async function tap(sel) {
  const r = await js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: innerWidth }; })()`);
  if (!r) throw new Error(`見つかりません：${sel}`);
  await sleep(300);
  const r2 = await js(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: innerWidth }; })()`);
  if (wv) {
    const k = (wv.x2 - wv.x1) / r2.w;
    adb('shell', 'input', 'tap', String(Math.round(wv.x1 + r2.x * k)), String(Math.round(wv.y1 + r2.y * k)));
  } else await js(`document.querySelector(${JSON.stringify(sel)}).click()`);
  await sleep(700);
}
const back = async () => { adb('shell', 'input', 'keyevent', '4'); await sleep(1200); };

// ---------- 操作 ----------
async function main() {
  shotNo = 0;
  for (const f of fs.readdirSync(OUT)) if (/^emulator-.*-\d+-.*\.png$/.test(f)) fs.unlinkSync(`${OUT}/${f}`);
  const url = await connect();
  note(`WebView：${url}`);
  check('起動：18歳以上の確認が出る', await waitFor("!!document.querySelector('#gate[open]')", 60000));
  await sleep(1500);
  shot('gate');
  wv = await webviewBounds();
  note(wv ? `WebView の位置：[${wv.x1},${wv.y1}]-[${wv.x2},${wv.y2}]（${wv.how}。adb のタップで操作）` : 'WebView の位置が読めないため、JS のクリックで操作');
  check('同意の前はバナー広告を出さない', (await js("getComputedStyle(document.documentElement).getPropertyValue('--ad-space').trim()")) in { '': 1, '0px': 1 });

  await tap('#agree');
  check('同意 → ホーム', await waitFor("!!document.querySelector('.result-head') && !document.querySelector('#gate[open]')"));
  // 取り込み：公式（クラウドからは 403）→ 予備（GitHub Pages）
  const metaOk = await waitFor("!!localStorage.getItem('lotojinja.sync.meta.loto6')", 45000);
  const meta = JSON.parse((await js("localStorage.getItem('lotojinja.sync.meta.loto6')")) || '{}');
  check('取り込み：公式を確かめ、読めなければ予備（GitHub Pages）に切り替わる', metaOk && meta.error == null && /backup|official/.test(meta.source || ''), `source=${meta.source}、error=${meta.error}`);
  note(`取り込みのログ：${consoleLog.filter(l => /取り込み/.test(l)).join(' ／ ') || '（なし）'}`);
  note(`ホームの回：${await js("document.querySelector('.result-head').textContent.replace(/\\s+/g, ' ')")}`);
  const banner = await waitFor("getComputedStyle(document.documentElement).getPropertyValue('--ad-space').trim() !== '0px' && getComputedStyle(document.documentElement).getPropertyValue('--ad-space').trim() !== ''", 45000);
  check('バナー広告（テスト）が出て、その分の余白がある', banner, `--ad-space=${await js("getComputedStyle(document.documentElement).getPropertyValue('--ad-space').trim()")}`);
  await sleep(2000);
  shot('home-banner');
  await checkBottom('ホーム');

  // 神託（リワード広告）
  await tap('[data-tab=oracle]');
  check('神託の画面', await waitFor("!!document.querySelector('#doOracle')"));
  shot('oracle');
  await tap('#doOracle');
  check('神託：残り0回で押すと「広告を見ると神託を3回いただけます」の確認', await waitFor("document.querySelector('#confirm[open]')?.textContent.includes('広告を見ると神託を3回いただけます')", 5000));
  shot('oracle-confirm');
  await tap('#confirm [data-ans=yes]');
  // 広告の画面（AdActivity）が出るのを待つ
  let adShown = false;
  for (let i = 0; i < 40 && !adShown; i++) { await sleep(1000); adShown = /AdActivity/.test(resumed()); if (!adShown && await js('!!document.querySelector(".cutin, #oracleResult")').catch(() => false)) break; }
  note(`リワード広告：${adShown ? '表示された' : '表示されなかった（読み込めない・在庫なし → 広告なしで神託を出す動き）'}`);
  if (adShown) {
    await sleep(5000);
    shot('reward-ad');
    // テスト広告を最後まで見る（30秒ほど）→ 戻るキーで閉じる
    const start = Date.now();
    while (/AdActivity/.test(resumed()) && Date.now() - start < 120000) {
      await sleep(5000);
      if (Date.now() - start > 35000) adb('shell', 'input', 'keyevent', '4');
    }
    check('リワード広告を閉じてアプリに戻る', !/AdActivity/.test(resumed()));
    await sleep(5000); // 動画広告のあと、エミュレーター（ソフトウェア描画）が落ち着くのを待つ
  }
  const cut = await waitFor("!!document.querySelector('.cutin.in')", 8000);
  if (cut) { await sleep(500); shot('cutin'); }
  check('神託：ご祈祷カットイン → 神託が出る', await waitFor("document.querySelectorAll('#oracleResult .ticket').length > 0", 90000));
  note(`リワード広告の結果：${consoleLog.filter(l => /リワード広告/.test(l)).join(' ／ ') || (adShown ? '報酬あり（最後まで見た）' : '')}`);
  await sleep(1500);
  shot('oracle-result');
  const credits = () => js("document.querySelector('#oracleCredits')?.textContent.replace(/\\s+/g, '') || ''");
  if (adShown) {
    check('広告を最後まで見たら神託が3回分（1回使って「あと2回」）', /あと2回/.test(await credits()), await credits());
    // 2回目・3回目：確認も広告もなく、すぐ神託
    for (const left of [1, 0]) {
      await js("window.scrollTo(0, 0)");
      await tap('#doOracle');
      const noConfirm = !(await js("!!document.querySelector('#confirm[open]')"));
      const ok = await waitFor(`!document.querySelector('.cutin') && /あと${left}回/.test(document.querySelector('#oracleCredits')?.textContent.replace(/\\s+/g, '') || '')`, 30000);
      check(`残りがあれば確認・広告なしですぐ神託（あと${left}回）`, noConfirm && ok && !/AdActivity/.test(resumed()), await credits());
    }
    await js("document.querySelector('#doOracle').scrollIntoView({ block: 'center' })");
    await sleep(800);
    shot('oracle-credits-0');
    // 4回目：また確認（やめる）
    await tap('#doOracle');
    check('4回目（残り0回）はまた「広告を見ると神託を3回いただけます」の確認', await waitFor("document.querySelector('#confirm[open]')?.textContent.includes('3回いただけます')", 5000));
    shot('oracle-confirm-again');
    await tap('#confirm [data-ans=no]');
    check('「やめる」なら広告も神託も出ない', await waitFor("!document.querySelector('#confirm[open]')", 5000) && !/AdActivity/.test(resumed()));
  } else note('広告が出なかったので、回数（3回）の確認は飛ばします（広告なしでは回数は増えない仕様）');

  // マイ番号
  await tap('[data-tab=mine]');
  check('マイ番号の画面', await waitFor("!!document.querySelector('#pickCard')"));
  for (const n of [3, 11, 19, 27, 35, 43]) await tap(`[data-pick="${n}"]`);
  await tap('#savePick');
  check('マイ番号：登録できる', await waitFor("document.querySelector('main').textContent.includes('登録した番号（1件）')", 5000));
  await js('window.scrollTo(0, 0)');
  await sleep(800);
  shot('mine');

  // 戻るボタン：マイ番号 → ホーム
  await back();
  check('戻るボタン：マイ番号 → ホームに戻る', await waitFor("!!document.querySelector('.result-head')", 5000));
  // 設定を開いて、戻るボタンで閉じる
  await tap('#openSettings');
  check('設定が開く', await waitFor("!!document.querySelector('#settings[open]')", 5000));
  shot('settings');
  await back();
  check('戻るボタン：設定を閉じる', await waitFor("!document.querySelector('#settings[open]')", 5000));
  // プライバシーポリシーを開いて戻る：ページが読み直されても、広告の初期化・バナーの作成が二重にならないこと
  const counts = () => js("({ initialize: +sessionStorage.getItem('lotojinja.ads.initialize') || 0, showBanner: +sessionStorage.getItem('lotojinja.ads.showBanner') || 0, resumeBanner: +sessionStorage.getItem('lotojinja.ads.resumeBanner') || 0 })");
  const before = await counts();
  await tap('#openSettings');
  await waitFor("!!document.querySelector('#settings[open] a[href=\"privacy.html\"]')", 5000);
  await tap('#settings a[href="privacy.html"]');
  check('プライバシーポリシーが開く', await waitFor("location.pathname.endsWith('privacy.html') && document.body.textContent.includes('Google AdMob')", 15000));
  await sleep(1500);
  shot('privacy');
  await back();
  check('戻るボタン：プライバシーポリシー → アプリの画面', await waitFor("!!document.querySelector('.result-head')", 15000));
  await waitFor("getComputedStyle(document.documentElement).getPropertyValue('--ad-space').trim() !== '0px' && +sessionStorage.getItem('lotojinja.ads.resumeBanner') > 0", 20000);
  const after = await counts();
  check('戻ったあと、広告の初期化とバナーの作成は1回のまま（出し直しだけ）', after.initialize === 1 && after.showBanner === 1 && before.initialize === 1 && before.showBanner === 1 && after.resumeBanner > before.resumeBanner,
    `前 ${JSON.stringify(before)} → 後 ${JSON.stringify(after)}`);
  await sleep(1500);
  shot('back-home');
  await checkBottom('プライバシーポリシーから戻ったホーム');
  await back();
  await sleep(2000);
  check('戻るボタン：ホームならアプリを閉じる', !new RegExp(PKG).test(resumed()), resumed().trim());
}

// エミュレーターでは Google Play 開発者サービスが起動直後に入れ替わり、それに頼るアプリが一緒に終了させられることがある。
// 接続が切れたときは、アプリを入れ直した状態から1回だけやり直す
for (let attempt = 1; attempt <= 2; attempt++) {
  try { await main(); break; }
  catch (e) {
    try { shot('error'); } catch { /* 撮れない */ }
    const lost = /接続が切れました|応答がありません|接続できませんでした/.test(e.message);
    if (attempt === 1 && lost) {
      note(`--- 1回目は途中で WebView との接続が切れました（${e.message}。アプリの状態：${resumed().trim() || '終了'}）。最初からやり直します ---`);
      failed = 0; jsErrors.length = 0;
      // 1回目の終わり方が分かるよう、ここまでのログを残す（クラッシュならアプリの問題、Google Play 開発者サービスの入れ替わりならエミュレーターの問題）
      try {
        const log = adb('logcat', '-d', '-v', 'time');
        fs.writeFileSync(`${OUT}/emulator-${TAG}-logcat-attempt1.txt`, log);
        const why = log.split('\n').filter(l => new RegExp(`FATAL EXCEPTION|Killing \\d+:${PKG.replace(/\./g, '\\.')}|Process ${PKG.replace(/\./g, '\\.')}.*has died|ANR in`).test(l));
        note(`1回目のアプリの終わり方：${why.slice(0, 5).join(' ／ ') || '（ログに記録なし）'}`);
        adb('logcat', '-c');
      } catch (e2) { note(`ログを残せませんでした：${e2.message}`); }
      adb('shell', 'am', 'force-stop', PKG); adb('shell', 'pm', 'clear', PKG);
      await sleep(3000);
      adb('shell', 'am', 'start', '-n', `${PKG}/.MainActivity`);
      continue;
    }
    check('操作の途中で止まりました', false, e.message);
    break;
  }
}
// Capacitor 本体（SystemBars）が、ページの読み込み直後でまだ <html> が無いときに余白の値を入れようとして出す既知のエラーは除く
// （次の描画で入れ直されるので画面には影響しない。アプリのコードのエラーではない）
const KNOWN = /Error injecting safe area CSS/;
const errs = jsErrors.filter(e => e && !KNOWN.test(e));
if (jsErrors.some(e => e && KNOWN.test(e))) note('参考：Capacitor 本体の既知のエラー「Error injecting safe area CSS」は除外（読み込み直後だけ。画面に影響なし）');
check('JS のエラー（例外・console.error）が無い', errs.length === 0, errs.slice(0, 5).join(' ／ '));
note('--- console（warn/info/log の一部） ---');
consoleLog.slice(0, 60).forEach(l => lines.push(l));
let envLine = '';
try { envLine = fs.readFileSync(`${OUT}/env.txt`, 'utf8').trim(); fs.unlinkSync(`${OUT}/env.txt`); } catch { /* 無い */ }
fs.writeFileSync(`${OUT}/emulator-${TAG}-summary.txt`, `エミュレーターでの確認（${new Date().toISOString()}）${envLine ? `\n端末：${envLine}` : ''}\n${lines.join('\n')}\n`);
try { ws?.close(); } catch { /* 閉じている */ }
process.exit(failed ? 1 : 0);
