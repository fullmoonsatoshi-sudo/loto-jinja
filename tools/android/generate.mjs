// Google Play 用の Android アプリ（TWA）のプロジェクトを android/ に作る。GitHub Actions（android.yml）で実行する。
// TWA は、公開中のアプリの画面（GitHub Pages）を、アドレスバーなしの全画面で開く小さな Android アプリ。
import { TwaManifest, TwaGenerator, ConsoleLog } from '@bubblewrap/core';
import fs from 'fs';

const cfg = JSON.parse(fs.readFileSync(new URL('./app.json', import.meta.url)));
const manifest = await TwaManifest.fromWebManifest(cfg.webManifestUrl);
Object.assign(manifest, {
  packageId: cfg.packageId,
  name: cfg.name,
  launcherName: cfg.launcherName,
  appVersionCode: cfg.versionCode,
  appVersionName: cfg.versionName,
  fallbackType: 'customtabs',
  enableNotifications: false,
  orientation: 'portrait',
  signingKey: { path: './upload.jks', alias: 'upload' }, // 署名はこの作業の外で行う（鍵は GitHub に置かない）
});
const err = manifest.validate();
if (err) throw new Error(err);
fs.mkdirSync('android', { recursive: true });
fs.writeFileSync('android/twa-manifest.json', JSON.stringify(manifest.toJson(), null, 2));
await new TwaGenerator().createTwaProject('android', manifest, new ConsoleLog('twa'));
// Google Play の決まり（2026年8月31日〜：新規アプリは API 36 以上が対象）と、使う部品の最低条件（API 24）に合わせる
const gradle = 'android/app/build.gradle';
let g = fs.readFileSync(gradle, 'utf8');
g = g.replace(/minSdkVersion\s+\d+/, 'minSdkVersion 24')
     .replace(/targetSdkVersion\s+\d+/, 'targetSdkVersion 36')
     .replace(/compileSdkVersion\s+\d+/, 'compileSdkVersion 36')
     .replace(/compileSdk\s+\d+/, 'compileSdk 36');
fs.writeFileSync(gradle, g);
console.log(g.split('\n').filter(l => /Sdk|com\.android\.tools\.build/.test(l)).join('\n'));
console.log('作成しました：', cfg.packageId, cfg.versionName, `(${cfg.versionCode})`, manifest.host + manifest.startUrl);
