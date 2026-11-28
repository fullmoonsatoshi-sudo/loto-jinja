# オーナーにお願いすること（ロト神社を Google Play に出すまで）— ネイティブ版

2026-11-27 更新：Android アプリを **Capacitor のネイティブ版**（アプリの中に画面とデータを持ち、みずほ銀行の公式サイトから当せん番号を直接読む。広告あり）に作り変えました。以前の TWA 版（versionCode 1）の手順は使いません。しくみの詳細は `docs/android-native.md`。

## できあがっているもの
| もの | 場所 |
|---|---|
| 署名前の Android アプリ（AAB・APK）と、実機確認用のデバッグ APK | GitHub のリリース `android-native-1.0.0-2` の添付ファイル（`loto-jinja-1.0.0-2-release-unsigned.aab` など） |
| 署名済みの Android アプリ（Play に上げるファイル） | 外付けHDD `projects/loto-app/release/loto-jinja-1.0.0-2-signed.aab`（CEO が署名して置く。実機用は `…-2-signed.apk`） |
| 署名の鍵とパスワード（**絶対に無くさない・人に渡さない**。TWA 版と同じ鍵を使う） | 外付けHDD `secrets/` |
| ストア用の画像（アイコン・フィーチャーグラフィック・スクショ6枚） | `store/`、アイコンは `src/assets/icon-512.png` |
| 説明文・データセーフティ・レーティングの回答案 | `docs/store-listing.md`（広告あり・広告IDありに更新済み） |
| プライバシーポリシー | https://fullmoonsatoshi-sudo.github.io/loto-jinja/privacy.html（広告・公式サイトへの通信を追記済み） |
| エミュレーターで動かしたときの画面 | リリースの添付ファイル `emulator-NN-*.png`・`emulator-summary.txt` |

## オーナーにしか用意できないもの（★ 広告のID 4つ）
AdMob（https://admob.google.com）にオーナーの Google アカウントで登録し、次の4つを CEO に渡してください。今はテスト用のIDで動いています（本物の広告は出ず、収益もありません）。
1. **AdMob のアプリID**（Android。`ca-app-pub-…~…` の形。AdMob で「アプリを追加」→ Android・「Google Play に公開済みですか」→「いいえ」で作れます）
2. **バナー広告ユニットID**（`ca-app-pub-…/…`。広告ユニットの種類は「バナー」）
3. **リワード広告ユニットID**（`ca-app-pub-…/…`。種類は「リワード」。報酬は「神託・3」にしておくと分かりやすい（アプリは広告1回で神託3回を自分で数えるので、ここの数は動きに影響しない））
4. **パブリッシャーID**（`pub-…`。AdMob の「設定 → アカウント情報」）

受け取ったら、CEO（Claude）が `src/ads-config.js` の1か所を書きかえ、作り直して署名します（手順は `docs/android-native.md` の 3-1）。AdMob の支払い情報（銀行口座・税務情報）の登録もオーナーの作業です。

## オーナーの作業（順番どおり）
1. **Play Console のデベロッパー登録**（済みなら飛ばす）
   - https://play.google.com/console で登録。登録料 25ドル、本人確認（身分証）があります。種類は「個人」で大丈夫です。
2. **アプリを作成**：アプリ名「当たれ！ロト神社 ～宝くじ当せん番号～」、無料、アプリ（ゲームではない）。
3. **掲載情報の入力**：`store-listing.md` の文章と、`store/` の画像をそのまま使えます。
   - 連絡先の「ウェブサイト」に `https://fullmoonsatoshi-sudo.github.io` を入れる（app-ads.txt のため）。
4. **「アプリのコンテンツ」の質問**（審査で見られる項目。回答案は `store-listing.md`）
   - プライバシーポリシー（URL）
   - **広告：「はい、広告を含みます」**
   - **広告ID：「はい、使用します」**（用途：広告。AdMob が使う）
   - アプリのアクセス権：すべての機能に制限なし
   - コンテンツのレーティング（IARC の質問票）
   - ターゲット ユーザー：18歳以上（子ども向けではない）
   - データセーフティ（AdMob が集める情報の申告）
   - ニュースアプリ・金融機能・健康・政府アプリ：いずれも「いいえ」
   - フォアグラウンド サービスの権限：申告は不要（広告の部品が入れる一般の権限だけで、種類ごとの権限は使っていない。求められたら「使っていない」と答える。詳細は `docs/android-native.md`）
5. **app-ads.txt を置く**（パブリッシャーIDが決まってから。手順は `docs/android-native.md` の 3-2。このリポジトリからは置けないので、GitHub で `fullmoonsatoshi-sudo.github.io` リポジトリに1ファイル作ります）
6. **クローズドテスト**（個人アカウントの必須ルール）
   - 「テスト → クローズドテスト」に署名済みの `.aab` を上げ、**12人以上**のテスターに参加してもらい、**14日間続けて**参加状態を保つ必要があります。
   - 終わったら「製品版へのアクセスを申請」。審査は通常7日以内です。
7. **製品版として公開**。
8. **公開後：AdMob のアプリを Play のストア掲載にリンクする**（app-ads.txt の確認はこのリンクのあとに始まります）
   - AdMob →「アプリ」→「当たれ！ロト神社」→「アプリの設定」→「アプリストアの詳細」で「追加」→「Google Play」でパッケージ名 `io.github.fullmoonsatoshisudo.lotojinja` を検索して選ぶ。
   - そのあと AdMob が Play のストア掲載の「ウェブサイト」（`https://fullmoonsatoshi-sudo.github.io`）の直下の `app-ads.txt` を読みにいきます。AdMob の「アプリ → app-ads.txt」で「確認済み」になれば完了（ふつう1日、長いと数日）。エラーのときの確かめ方は `docs/android-native.md` の 3-3。

## 実機で先に確かめるとき（ワイヤレスデバッグでインストール）
パソコン（Mac）に Android の `adb` が必要です（Android Studio に入っています。または `brew install android-platform-tools`）。作業用のファイルは外付けHDDに置いてください。
1. スマホ：「設定 → 電話について → ビルド番号」を7回タップ → 開発者向けオプションが出る
2. スマホ：「設定 → システム → 開発者向けオプション → ワイヤレス デバッグ」をオン（パソコンと同じ Wi-Fi）
3. スマホ：「ワイヤレス デバッグ」→「ペア設定コードによるデバイスのペア設定」→ 出た IPアドレス:ポート と 6桁のコード をメモ
4. パソコン：`adb pair <IPアドレス:ポート>` → 6桁のコードを入力
5. パソコン：スマホの「ワイヤレス デバッグ」画面の上に出ている「IPアドレスとポート」で `adb connect <IPアドレス:ポート>`
6. パソコン：`adb install -r loto-jinja-1.0.0-2-debug.apk`（GitHub リリースから外付けHDDに落としたもの）
   - Play からいったん入れた版（本番の鍵の署名）があると、デバッグ版は署名が違うので入りません。先に `adb uninstall io.github.fullmoonsatoshisudo.lotojinja` で消してください（マイ番号なども消えます）。
7. 確かめること：ホームの最新回が公式発表と同じ、抽せん日の夜（公式の発表後）に開くと新しい回が入る、神託で広告（テスト広告）→ ご祈祷 → 神託 → そのあと2回は広告なしで神託（「あと○回」が減る）→ 4回目にまた広告の確認、画面下の広告がタブと重ならない、戻るボタン。

## 署名（CEO が手元で行う。参考）
GitHub には署名なしのファイルしか置きません。鍵は外付けHDDの `secrets/` にあり、TWA 版と同じアップロード鍵を使います（同じパッケージ名なので）。
```
# AAB（Play に上げる）
jarsigner -keystore secrets/upload.jks -signedjar loto-jinja-1.0.0-2-signed.aab loto-jinja-1.0.0-2-release-unsigned.aab upload
# APK（実機に本番と同じ署名で入れたいとき）
zipalign -p 4 loto-jinja-1.0.0-2-release-unsigned.apk aligned.apk
apksigner sign --ks secrets/upload.jks --ks-key-alias upload --out loto-jinja-1.0.0-2-signed.apk aligned.apk
```

## 自動で動いているもの（オーナーの作業なし）
- **アプリ**：起動したとき・ホームを開いたとき・抽せん時刻を過ぎたときに、みずほ銀行の公式サイトから新しい回を直接読みます（公式の発表後に開けば見られる）。公式から読めないときは、この下の自動取り込みで更新される公開サイトのデータを使います。
- **公開サイト（Web 版。今までどおり）**：ロト6・ロト7は抽せん日の夜に、ミニロト・ビンゴ5・ナンバーズ3・ナンバーズ4は抽せんの翌朝〜午前中に、当せん番号を自動で取り込みます（GitHub Actions）。キャリーオーバー・当せん金の書き足し（Claude の定期タスク）も今までどおり。

## アプリを作り直すとき
- `android/app/build.gradle` の `versionCode` を1つ上げて（`versionName` も必要なら）、GitHub の Actions「Androidアプリを作る」を実行 → リリース `android-native-<版>` に署名前のファイルとエミュレーターの画面が置かれる → CEO が署名して HDD に置きます。
- 同梱の過去データは作り直したときの最新になります。作り直さなくても、新しい回はアプリが公式から読み込みます。
