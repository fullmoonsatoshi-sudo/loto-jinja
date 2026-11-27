// オフラインでも開けるようにする。
// どのファイルも「通信を優先」し、つながらないときだけ保存しておいたものを使う。
// こうすると、修正版を公開すれば次に開いたときから必ず新しい画面になる。
const CACHE = 'lotojinja';
const CHARS = ['miko', 'kannushi', 'kitsune', 'neko'], EXPR = ['normal', 'pray', 'joy', 'sad', 'oharai1', 'oharai2'];
// キャラの絵も最初に保存しておき、オフラインでもカットインやキャラが出るようにする
// データは最初はロト6・ロト7だけを保存する。ミニロト・ビンゴ5・ナンバーズのデータ（ナンバーズは各300KB超）は、
// そのくじを開いたときに下の fetch で保存され、それ以降はオフラインでも見られる（最初の読み込みを重くしないため）
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'lotto.js', 'lines.js', 'manifest.webmanifest', 'assets/icon-192.png', 'data/loto6.json', 'data/loto7.json',
  ...CHARS.flatMap(c => EXPR.map(e => `assets/characters/${c}/${e}.png`))];
// キャラのせりふ（4人分で約150KB、gzip で送ると約30KB）も最初に保存し、どのキャラに切り替えてもオフラインでせりふが出るようにする。
// 1つ読めなくても入れ直しが止まらないよう、ほかのファイルとは別に1つずつ保存する（読めなければアプリは予備のせりふを使う）
const LINES = CHARS.map(c => `lines/${c}.json`);
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(SHELL).then(() => Promise.all(LINES.map(u => c.add(u).catch(() => {})))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
