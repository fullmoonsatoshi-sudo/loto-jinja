# Android アプリ（ネイティブ版・Capacitor）のしくみと手順

2026-11-27 作成（engineer）。TWA 版（Web ページを開くだけの Android アプリ）から、**Capacitor のネイティブ版**に作り変えた。

## 1. 全体
| 項目 | 内容 |
|---|---|
| 方式 | Capacitor 8。`src/`（素の HTML/CSS/JS）をそのままアプリの中に入れる（`npm run build:web` が `www/` に写し、`npx cap sync android` が `android/` に入れる） |
| パッケージ名 | `io.github.fullmoonsatoshisudo.lotojinja`（TWA 版と同じ） |
| 名前 | アプリ名「当たれ！ロト神社」、ランチャー（ホーム画面）の名前「ロト神社」、ストア名「当たれ！ロト神社 ～宝くじ当せん番号～」 |
| 版 | versionCode 2（TWA 版で 1 を使った）、versionName 1.0.0。`android/app/build.gradle` |
| SDK | minSdk 24、targetSdk / compileSdk 36。Java 21 でビルド |
| 画面の向き | 縦固定 |
| アイコン・スプラッシュ | `src/assets` のアイコンから `python3 tools/app/make-icons.py` で作る（`android/app/src/main/res/`） |
| ビルド | GitHub Actions「Androidアプリを作る」（`.github/workflows/android.yml`。手動実行） |

Web 版（GitHub Pages）はこれまでどおり `src/` をそのまま公開する。Web 版では広告もアプリ用の部品（`src/native.js`・`src/sync.js`）も読み込まない（`window.Capacitor` があるときだけ使う）。

## 2. 当せん番号の取り込み（アプリの中で完結）
- 過去の全回データはアプリに同梱（`src/data/*.json`）。
- 起動時・ホームを開いたとき・アプリに戻ったとき・抽せん時刻を過ぎたときに、**選んでいるくじと、マイ番号に登録があるくじ**について新しい回を確かめる（`src/sync.js`、呼び出しは `src/app.js` の `syncNow`）。
  1. みずほ銀行の「最近の回の一覧」CSV（`tools/fixtures/official/LIST-FORMATS.md`）で最新の回番号を知る
  2. 手元より新しい回だけ、回別CSVを読む（一度に最大3回分）。手元の最新回が予備から入った・当せん金やキャリーオーバーが足りないときは、その回も公式で確かめる
  3. 読み取りは Web 版の取り込みと同じ `src/csv.js`（`tools/csv.mjs` はこれをそのまま使う。二重に持たない）
- 通信は Capacitor のネイティブ通信（CapacitorHttp）。公式CSVは Shift_JIS のバイト列で受け取り、`TextDecoder('shift_jis')` で文字にする（WebView の fetch は CORS で読めないため）。
- 読み直しの間隔：同じ一覧は、公式の `Cache-Control: max-age` の間は読み直さない（最低60秒。2026-11-27 にエミュレーターから読んだ一覧は `max-age=1800`＝30分だった）。結果待ちの回が無ければ次の抽せん時刻まで読まない。結果待ちの間は10分おき（max-age のほうが長ければそちら）。
- **予備**：公式から読めない・形式が変わった・4回分以上遅れているときは、GitHub Pages の `https://fullmoonsatoshi-sudo.github.io/loto-jinja/data/<くじ>.json` から取る（今の自動取り込み `deploy.yml` は今までどおり動かす）。
- **検査**：回の連続、抽せん日の予定どおりの日付（曜日・年末年始の休み）、抽せん時刻を過ぎていること、数字の範囲・重複、当せん金の形、ナンバーズは3と4の回・日付の一致。予備は、手元（公式）の直近20回と1つでも食い違えば使わない（**公式を優先**）。
- どちらも読めなければ手元のデータで動き、結果待ちの回があるときホームに「最新の結果を取得できませんでした」と控えめに出す。
- 保存：取り込んだ回は端末の localStorage（`lotojinja.sync.draws.<くじ>`）に、**同梱データより新しい回と、同梱データと違う回だけ**を保存（ナンバーズの数千回は同梱データのまま）。アプリを更新して同梱データに入った回は、保存分から自然に消える。

## 3. 広告（AdMob：@capacitor-community/admob）
- **バナー**：画面下のタブ（ホーム・神託…）の真上。タブとの間に 8px のすき間。広告が出ている間は画面の下に「広告の高さ＋8px」の余白をあけ、内容やタブが隠れないようにする（CSS の `--ad-space`）。18歳以上の確認の前・ダイアログ・カットイン・リワード広告の間は隠す。
- **リワード（神託の回数）**：2026-11-28 オーナー決定。リワード広告を1回最後まで見ると **神託を3回** いただける（`src/credits.js`。報酬はプラグインの報酬イベント `onRewardedVideoAdReward` で判定し、回数はアプリ側で固定の3回）。
  - 「神託をいただく」を押すたびに1回使う。残りがあるあいだは確認も広告もなしで、すぐご祈祷カットイン → 神託。
  - 残りの回数は端末に保存（localStorage `lotojinja.oracle.credits`。アプリを閉じても残る・期限なし）。ボタンのすぐ下に「神託 あと○回」を出す。
  - 0回のときに押すと確認「広告を見ると神託を3回いただけます」［広告を見る］［やめる］→ 最後まで見たら3回もらって1回使う（残り2回）→ 神託。
  - 途中で閉じたら回数は増えず、神託も出さない（その旨を表示）。
  - **広告を読み込めない・用意できない（通信なし・在庫なし）ときは、回数を変えずに広告なしで神託を1回出す**（使えなくなる状態を作らない）。
  - Web 版（ブラウザ）は広告も回数の表示もなし（今までどおり何度でも）。
- **プライバシーポリシーを開いて戻ったとき**：画面（ページ）は読み直されるが、広告の部品（ネイティブ）は残っているので、初期化・同意の確認・バナーの作成をやり直さない（済んだことを sessionStorage に覚え、バナーは出し直し（resumeBanner）だけ）。
- **すき間**：バナーとタブの間は 16dp。すき間は背景色の帯で埋め、下の内容が透けないようにする。バナーを一時的に隠す間（ダイアログ・カットイン・リワード広告・確認から広告が終わるまで）も余白は残し、画面がずれないようにする。
- **権限 FOREGROUND_SERVICE**：広告の部品（Google Mobile Ads SDK）が使う WorkManager が入れる。種類（`foregroundServiceType`）の指定も種類ごとの権限（`FOREGROUND_SERVICE_*`）も無いので、**Play Console の「フォアグラウンド サービスの権限」の申告は不要**（申告は Android 14 以降を対象にしたアプリが使う種類ごとに求められる）。外すと、SDK が内部で前面サービスを使ったときに止まるおそれがあるため、外さずに残す。もし Play Console で申告を求められたら、その画面の案内どおりに「使っていない」と答える。
- **同意（UMP）**：起動時に `requestConsentInfo` → 必要なら `showConsentForm`（日本では通常表示されない）。地域によって「プライバシー設定の入口」が必要と返ってきたとき（`privacyOptionsRequirementStatus: REQUIRED`。米国の GitHub Actions のエミュレーターではそうなった）は、設定の画面に「広告のプライバシー設定」ボタンを出す。
- 子ども向けとして扱わない（`tagForChildDirectedTreatment: false`、`tagForUnderAgeOfConsent: false`）。
- Web 版（ブラウザ）では広告を出さない。

### 3-1. 本番の広告IDに切り替える手順（★ オーナーから4つのIDをもらったら）
書きかえるのは **`src/ads-config.js` の1ファイルだけ**。
```js
export const ADS = {
  appId: 'ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY',   // AdMob のアプリID（「~」を含む）
  banner: 'ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ',  // バナー広告ユニットID（「/」を含む）
  rewarded: 'ca-app-pub-XXXXXXXXXXXXXXXX/WWWWWWWWWW', // リワード広告ユニットID
  publisherId: 'pub-XXXXXXXXXXXXXXXX',               // パブリッシャーID
};
```
1. 上の4つを書きかえる（テスト用ID `ca-app-pub-3940256099942544…` のままだとテスト広告になる。`IS_TEST_ADS` は自動で false になる）
2. `android/app/build.gradle` の `versionCode` を1つ上げる
3. コミットして push → GitHub Actions「Androidアプリを作る」を実行 → できた AAB を署名して Play に上げる
- アプリIDは、ビルドのときに `android/app/build.gradle` が `src/ads-config.js` から読んで AndroidManifest（`com.google.android.gms.ads.APPLICATION_ID`）に入れる。AndroidManifest は書きかえない。ビルドのログ「できたファイルをまとめる」に、入ったアプリIDが出る。
- 注意：本番IDにしたあと、開発中に自分の端末で広告をタップし続けない（無効なクリックとして AdMob のアカウントが止められることがある）。確かめるときは AdMob の管理画面で自分の端末を「テストデバイス」に登録する。

### 3-2. app-ads.txt（オーナーのパブリッシャーIDが必要）
- 置き場所：**https://fullmoonsatoshi-sudo.github.io/app-ads.txt**（リポジトリ `fullmoonsatoshi-sudo/fullmoonsatoshi-sudo.github.io` のいちばん上の階層。このリポジトリ（loto-jinja）からは push できないので、手で置く）
- 中身（1行。`pub-XXXXXXXXXXXXXXXX` をパブリッシャーIDに）：
  ```
  google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0
  ```
- 手順：GitHub で `fullmoonsatoshi-sudo.github.io` というリポジトリを作る（無ければ。公開・main ブランチ）→「Add file → Create new file」で `app-ads.txt` を作って上の1行を書いて保存 → 数分後に上のURLで開けることを確かめる。
- Play Console の「ストアの掲載情報 → 連絡先 → ウェブサイト」に `https://fullmoonsatoshi-sudo.github.io` を入れる（AdMob はこのサイトの直下の app-ads.txt を見にいく）。

### 3-3. Play で公開したあと：AdMob のアプリを Play のストア掲載にリンクする（オーナー）
app-ads.txt の確認は、AdMob のアプリが **Play のストア掲載とリンクされてから** 始まる。リンクできるのは Play で公開されたあと（クローズドテストの間は検索に出ないことがある）。
1. Play で製品版（またはオープンテスト）として公開され、Play ストアでアプリのページが開けることを確かめる。
2. AdMob（https://admob.google.com）→「アプリ」→「当たれ！ロト神社」→「アプリの設定」→「アプリストアの詳細」の「追加」（「ストアを追加」）を押す。
3. 「Google Play」を選び、パッケージ名 `io.github.fullmoonsatoshisudo.lotojinja` かアプリ名で検索して、出てきたアプリを選び「追加」。
4. リンクされると、AdMob がストア掲載の「デベロッパーのウェブサイト」（`https://fullmoonsatoshi-sudo.github.io`）を読み、その直下の `app-ads.txt` を探しにいく。
5. 確認の進み方：AdMob の「アプリ → app-ads.txt」の画面で、状態が「確認中」→「確認済み」になる（ふつう1日、長いと数日）。「見つかりません」「一致しません」と出たら、①ストア掲載のウェブサイトの URL、②`https://fullmoonsatoshi-sudo.github.io/app-ads.txt` が開けるか、③中のパブリッシャーIDが AdMob のものと同じか、を確かめて「アップデートを確認」を押す。
6. 確認が済むまでは広告の配信が少ないことがある（app-ads.txt が無い・確認前のアプリは、広告主によっては配信しない）。アプリの動きには影響しない。

## 4. Android らしい動き
- バックアップ：`android:allowBackup="false"`、Android 12 以降の `dataExtractionRules`（`res/xml/data_extraction_rules.xml`）でクラウドへのバックアップと機種変更時の移行の両方からアプリのデータを外す（プライバシーポリシーの「端末の中だけに保存」と合わせる。機種変更するとマイ番号・神託の回数は引き継がれない）。
- 戻るボタン：カットイン中はカットインを閉じる → ダイアログを閉じる（確認は「やめる」と同じ）→ ホーム以外の画面はホームへ → ホームならアプリを閉じる。18歳以上の確認の画面ではアプリを閉じる。プライバシーポリシーの画面ではアプリの画面に戻る。
- ステータスバー・ナビゲーションバー：Capacitor の SystemBars（`capacitor.config.json`）で余白（safe area）を CSS に渡す。バーの色は上部の帯と同じ朱色、アイコンは白。
- スプラッシュ画面：生成り色の背景にアイコン。

## 5. ビルドと確認（GitHub Actions「Androidアプリを作る」）
- 出力（GitHub リリース `android-native-<versionName>-<versionCode>` の添付ファイル）：
  - `loto-jinja-<版>-debug.apk`：デバッグ署名（実機確認用。`android/app/debug.keystore` は Android 標準のデバッグ用の鍵で、毎回同じ鍵にして上書きインストールできるようにしたもの。Play の署名とは無関係）
  - `loto-jinja-<版>-release-unsigned.aab`／`-release-unsigned.apk`：署名なし。**本番の署名鍵は GitHub に置かない**（CEO が手元で署名する。手順は `docs/owner-handoff.md`）
  - `loto-jinja-<版>-SHA256SUMS.txt`
  - `emulator-api34-*`・`emulator-api35-*`・`emulator-api36-*`（画面 `NN-*.png`・`summary.txt`・`logcat.txt`）：Android 14・15・16 のエミュレーターで、起動 → 同意 → ホーム → 神託（テスト広告を最後まで見る → あと2回 → 2回目・3回目は広告なし → 4回目でまた確認）→ マイ番号 → 設定 → プライバシーポリシーを開いて戻る → 戻るボタン を adb で操作した画面とログ（`tools/app/emulator-check.sh`・`emulator-check.mjs`）。
    - 画面下の重なりも数字で確かめる：バナー広告の下端とタブの上端のすき間（16dp）、タブのボタンとジェスチャーバー（ナビゲーションバー）が重ならないこと。Android 15 以降は targetSdk 36 のため画面いっぱい（edge-to-edge）の表示が強制されるので、そこを特に見る。
    - プライバシーポリシーを開いて戻ると画面が読み直されるが、広告の初期化とバナーの作成は1回のまま（出し直しだけ）であることを確かめる。
  - 公式（みずほ銀行）の CSV について：以前は「クラウドからは 403」と考えていたが、それは取り込みスクリプトの User-Agent のとき。アプリのネイティブ通信（WebView の User-Agent）なら、GitHub Actions のエミュレーターからも **200 で読めた**（2026-11-27 に確認。一覧の `Cache-Control` は `max-age=1800`）。そのためエミュレーターでは公式から取り込む動きになる。**予備（GitHub Pages）への切り替え**（公式が 403・形式が変わった・大きく遅れている・両方だめ）は、`node tools/test.mjs` の「予備へ切り替え」などのテスト（通信を差し替えて確かめる）で確認している。
- 手元で作るとき（Android Studio がある場合）：`npm ci` → `npm run sync` → `android/` を Android Studio で開く。

## 6. ファイル
| ファイル | 役目 |
|---|---|
| `src/sync.js` | アプリでの取り込み（公式 → 予備、検査、保存、読み直しの間隔） |
| `src/csv.js` | 公式CSV（回別・一覧）の読み取り（アプリと tools/ で共通） |
| `src/native.js` | ネイティブ通信・戻るボタン・広告 |
| `src/ads-config.js` | 広告のID（★本番に切り替えるときはここだけ） |
| `src/credits.js` | 神託の回数（広告1回で3回・保存・0回のときの確認・広告なしのとき） |
| `capacitor.config.json` | Capacitor の設定 |
| `android/` | Android のプロジェクト（`npx cap add android` で作り、名前・版・広告ID・向き・色・アイコンを設定） |
| `tools/app/build-web.mjs` | `src/` → `www/`（`sw.js` と README を除き、`capacitor.js` を読み込む1行を足す） |
| `tools/app/make-icons.py` | アイコン・スプラッシュ画面の画像を作る |
| `tools/app/emulator-check.*` | エミュレーターでの確認 |

## 7. TWA 版から消したもの
- `tools/android/`（Bubblewrap で TWA を作るしくみ）：ネイティブ版で不要になったので消した。
- `assetlinks.json` の案内：TWA でアドレスバーを消すためのもので、ネイティブ版では不要（アプリは自分の中の画面を開くだけで、サイトとの結びつけは要らない）。リポジトリにも assetlinks は置いていない。
- TWA 版で作った署名済み `loto-jinja-1.0.0-1-signed.aab`（versionCode 1）は使わない。もし Play Console に上げてあっても、ネイティブ版は versionCode 2 なので、**同じ本番の鍵（アップロード鍵）で署名すれば**そのまま上書きの更新として上げられる。
