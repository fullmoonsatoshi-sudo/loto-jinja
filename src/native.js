// Android アプリ（Capacitor）の中でだけ使う部品。Web 版では読み込まない（app.js がアプリの中のときだけ import する）。
// ・ネイティブ通信（CapacitorHttp）：公式（みずほ銀行）のCSVは WebView の fetch では読めない（CORS）ので、こちらで読む
// ・Android の戻るボタン・アプリに戻ったとき
// ・広告（AdMob：@capacitor-community/admob）：同意（UMP）・バナー・リワード
// プラグインは window.Capacitor（アプリが入れる capacitor.js）から使う。イベント名などはプラグインの定義どおりの文字。
import { ADS, IS_TEST_ADS } from './ads-config.js';

const Cap = window.Capacitor;
const reg = name => Cap.registerPlugin(name);
const Http = (window.capacitorExports && window.capacitorExports.CapacitorHttp) || reg('CapacitorHttp');
const App = reg('App');
const AdMob = reg('AdMob');

// ---------- 通信 ----------
const fromBase64 = b64 => { const s = atob(String(b64).replace(/\s+/g, '')); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
const header = (h, name) => { const k = Object.keys(h || {}).find(x => x.toLowerCase() === name); return k ? String(h[k]) : ''; };
// sync.js の deps.get：type 'sjis'（公式CSV。Shift_JIS のバイト列を受け取って文字にする）／'json'（予備）
export async function nativeGet(url, type) {
  const r = await Http.request({ method: 'GET', url, responseType: type === 'sjis' ? 'arraybuffer' : 'text', connectTimeout: 15000, readTimeout: 15000 });
  const status = Number(r.status) || 0;
  if (status !== 200) return { status, text: '' };
  let text;
  if (type === 'sjis') {
    if (typeof r.data !== 'string') throw new Error('公式CSVの形式が想定と違います');
    text = new TextDecoder('shift_jis').decode(fromBase64(r.data));
  } else text = typeof r.data === 'string' ? r.data : JSON.stringify(r.data); // JSON はプラグインが読み取り済みのことがある
  const m = header(r.headers, 'cache-control').match(/max-age=(\d+)/);
  return { status, text, maxAge: m ? Number(m[1]) : 0 };
}

// ---------- 戻るボタン・アプリに戻ったとき ----------
export function onBackButton(handler) { App.addListener('backButton', handler); }
export function onResume(handler) { App.addListener('resume', handler); }
export function exitApp() { App.exitApp(); }

// ---------- 広告 ----------
const GAP = 16; // バナーと下のタブの間のすき間（押し間違いを防ぐ。すき間は style.css で背景色に塗る）
// プライバシーポリシーを開いて戻ると画面（ページ）が読み直されるが、広告の部品（ネイティブ）はそのまま残っている。
// 初期化・同意の確認・バナーの作成を二重にしないよう、済んだことをこのページの外（sessionStorage：アプリを終了すると消える）に覚えておく
const SS = 'lotojinja.ads.';
const ss = {
  get(k) { try { return JSON.parse(sessionStorage.getItem(SS + k)); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(SS + k, JSON.stringify(v)); } catch { /* 保存できない */ } },
};
const count = k => ss.set(k, (ss.get(k) || 0) + 1); // 確認用の回数（エミュレーターでの確認で二重になっていないかを見る）
const ads = {
  init: null, ready: false, want: false, shown: false,
  created: ss.get('created') === true,             // このアプリの起動中にバナーを作ったか（読み直し後は resumeBanner で出す）
  height: Number(ss.get('height')) || 0,           // 最後に分かったバナーの高さ（dp）
  privacyRequired: ss.get('privacyRequired') === true,
};
const bannerMargin = () => (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tab-h')) || 64) + GAP;
// 広告が出ている間は、画面の下に「広告の高さ＋すき間」だけ余白をあける（style.css の --ad-space）。
// 一時的に隠す間（カットイン・ダイアログ・リワード広告）も余白は残し、画面がずれないようにする
function applySpace() {
  const h = ads.created ? ads.height : 0;
  document.documentElement.style.setProperty('--ad-space', h ? `${h + GAP}px` : '0px');
}
let bannerQueue = Promise.resolve();
function syncBanner() {
  bannerQueue = bannerQueue.then(async () => {
    if (!ads.ready) return;
    if (ads.want && !ads.shown) {
      if (ads.created) { await AdMob.resumeBanner(); count('resumeBanner'); }
      else {
        await AdMob.showBanner({ adId: ADS.banner, adSize: 'ADAPTIVE_BANNER', position: 'BOTTOM_CENTER', margin: bannerMargin(), isTesting: IS_TEST_ADS });
        ads.created = true; ss.set('created', true); count('showBanner');
      }
      ads.shown = true;
    } else if (!ads.want && ads.shown) {
      await AdMob.hideBanner();
      ads.shown = false;
    }
    applySpace();
  }).catch(e => console.warn('バナー広告：', e && e.message));
  return bannerQueue;
}
// バナーを出したい（true）・隠したい（false）。広告の準備ができていなければ、できたときに合わせる。隠し終わるのを待てる
export function setBannerWanted(want) { ads.want = !!want; return syncBanner(); }

// 起動時に1回：同意（UMP。日本では通常表示されない）→ 広告の初期化。子ども向けとしては扱わない（18歳以上向けのアプリ）
export function initAds() {
  if (ads.init) return ads.init;
  ads.init = (async () => {
    if (!ss.get('initialized')) {
      let canRequest = true;
      try {
        let info = await AdMob.requestConsentInfo();
        if (info.isConsentFormAvailable && info.status === 'REQUIRED') info = await AdMob.showConsentForm();
        canRequest = info.canRequestAds !== false;
        // 地域によっては、同意をあとから変えられる入口（プライバシー設定）をアプリに置く必要がある（設定の画面に出す）
        ads.privacyRequired = info.privacyOptionsRequirementStatus === 'REQUIRED';
        ss.set('privacyRequired', ads.privacyRequired);
      } catch (e) { console.warn('広告の同意情報を取得できませんでした：', e && e.message); }
      if (!canRequest) return false;
      await AdMob.initialize({ initializeForTesting: false, tagForChildDirectedTreatment: false, tagForUnderAgeOfConsent: false });
      ss.set('initialized', true); count('initialize');
    }
    // イベントの受け取りはページごとに登録し直す（ページを読み直すと Capacitor が前の登録を消すため）
    AdMob.addListener('bannerAdSizeChanged', s => {
      const h = Math.max(0, Number(s && s.height) || 0);
      // 隠したときに届く「高さ0」は無視する（余白が消えて画面がずれないように）
      if (h > 0) { ads.height = h; ss.set('height', h); } else if (ads.want && ads.shown) ads.height = 0;
      applySpace();
    });
    AdMob.addListener('bannerAdFailedToLoad', () => { ads.height = 0; ss.set('height', 0); applySpace(); });
    ads.ready = true;
    applySpace();
    syncBanner();
    return true;
  })().catch(e => { console.warn('広告を準備できませんでした：', e && e.message); return false; });
  return ads.init;
}
// 確認用：このアプリの起動中に、初期化・バナーの作成・出し直しを何回したか
export const adCounts = () => ({ initialize: ss.get('initialize') || 0, showBanner: ss.get('showBanner') || 0, resumeBanner: ss.get('resumeBanner') || 0 });

// 広告のプライバシー設定（同意の変更）の入口が必要か・その画面を出す
export const privacyOptionsRequired = () => ads.privacyRequired;
export async function showPrivacyOptions() {
  try { await AdMob.showPrivacyOptionsForm(); } catch (e) { console.warn('広告のプライバシー設定を開けませんでした：', e && e.message); }
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
// リワード広告を出す。戻り値：'rewarded'（最後まで見て報酬あり）／'cancelled'（途中で閉じた）／'unavailable'（通信なし・在庫なしなどで出せない）
// 報酬は、プラグインの報酬イベント（onRewardedVideoAdReward）で判定し、広告が閉じられたあとで返す
export async function showRewarded() {
  if (!(await withTimeout(initAds(), 8000).catch(() => false))) return 'unavailable';
  try { await withTimeout(AdMob.prepareRewardVideoAd({ adId: ADS.rewarded, isTesting: IS_TEST_ADS }), 12000); }
  catch (e) { console.warn('リワード広告を読み込めませんでした：', e && e.message); return 'unavailable'; }
  return new Promise(resolve => {
    let rewarded = false, done = false, shown = false;
    const handles = [];
    const finish = v => { if (done) return; done = true; handles.forEach(h => h.then(x => x.remove()).catch(() => {})); resolve(v); };
    handles.push(AdMob.addListener('onRewardedVideoAdReward', () => { rewarded = true; }));
    handles.push(AdMob.addListener('onRewardedVideoAdShowed', () => { shown = true; }));
    handles.push(AdMob.addListener('onRewardedVideoAdDismissed', () => finish(rewarded ? 'rewarded' : 'cancelled')));
    handles.push(AdMob.addListener('onRewardedVideoAdFailedToShow', () => finish(rewarded ? 'rewarded' : 'unavailable')));
    Promise.all(handles).then(() => AdMob.showRewardVideoAd()).then(() => { rewarded = true; }) // 報酬を得たとき（まだ広告は出ている）
      .catch(e => {
        if (e && e.code === 'REWARDED_AD_CANCELLED') return; // 閉じられた（Dismissed のイベントで終える）
        if (!shown) finish(rewarded ? 'rewarded' : 'unavailable');
      });
  });
}
