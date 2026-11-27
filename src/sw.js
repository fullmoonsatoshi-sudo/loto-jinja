// オフラインでも開けるようにする。
// どのファイルも「通信を優先」し、つながらないときだけ保存しておいたものを使う。
// こうすると、修正版を公開すれば次に開いたときから必ず新しい画面になる。
const CACHE = 'lotojinja';
const CHARS = ['miko', 'kannushi', 'kitsune', 'neko'], EXPR = ['normal', 'pray', 'joy', 'sad', 'oharai1', 'oharai2'];
// キャラの絵も最初に保存しておき、オフラインでもカットインやキャラが出るようにする
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'lotto.js', 'manifest.webmanifest', 'assets/icon-192.png', 'data/loto6.json', 'data/loto7.json',
  'data/miniloto.json', 'data/bingo5.json', 'data/numbers3.json', 'data/numbers4.json',
  ...CHARS.flatMap(c => EXPR.map(e => `assets/characters/${c}/${e}.png`))];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
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
