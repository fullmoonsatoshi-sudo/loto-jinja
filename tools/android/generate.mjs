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
console.log('作成しました：', cfg.packageId, cfg.versionName, `(${cfg.versionCode})`, manifest.host + manifest.startUrl);
