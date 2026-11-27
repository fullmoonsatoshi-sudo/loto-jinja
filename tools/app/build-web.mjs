// Android アプリ（Capacitor）に入れる画面のファイルを www/ に用意する（npm run build:web。www/ は git に入れない）。
// src/ をそのまま写し、アプリでは使わないもの（Web 版のオフライン用 sw.js・説明の README.md）は除く。
// アプリの中では Capacitor の部品（capacitor.js）を読み込むよう、index.html と privacy.html に1行足す。
// Web 版（GitHub Pages）は src/ をそのまま公開するので、この処理の影響を受けない。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = path.join(root, 'src'), www = path.join(root, 'www');
const SKIP = new Set(['sw.js', 'README.md']);
fs.rmSync(www, { recursive: true, force: true });
fs.cpSync(src, www, { recursive: true, filter: f => !SKIP.has(path.relative(src, f)) });
fs.copyFileSync(path.join(root, 'node_modules/@capacitor/core/dist/capacitor.js'), path.join(www, 'capacitor.js'));
for (const page of ['index.html', 'privacy.html']) {
  const f = path.join(www, page);
  const html = fs.readFileSync(f, 'utf8');
  const tag = '<script src="capacitor.js"></script>';
  if (!html.includes('</head>')) throw new Error(`${page} に </head> がありません`);
  fs.writeFileSync(f, html.replace('</head>', `${tag}\n</head>`));
}
console.log('www/ を作りました');
