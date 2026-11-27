# 当たれ！ロト神社 — 起動方法

## パソコンで動かす
このフォルダ（src）で、次のどちらかを実行してブラウザで開きます。
```
python3 -m http.server 8080
# または
npx serve .
```
→ http://localhost:8080 を開く（スマホ表示はブラウザの開発者ツールで幅 375px にすると確認できます）

※ ファイルをダブルクリックして開く（file://）と、データを読み込めないので必ず上の方法で開いてください。

## テスト
1つ上のフォルダで `node tools/test.mjs`（計算ロジックのテスト）

## 当せん番号の更新
`node tools/update-data.mjs`（ロト6・ロト7は公式の回別CSV〔だめなら予備の公開データ〕、ミニロト・ビンゴ5・ナンバーズは公開データ lotto-data-hub から新しい回を追記。ネットにつながる場所で実行。`loto` か `hub` を付けると片方だけ）
GitHub（fullmoonsatoshi-sudo/loto-jinja）では `.github/workflows/deploy.yml` が、ロト6・ロト7の抽せん日の夜（19:07〜23:37 に30分おき）と、月〜金の抽せんの翌朝6時〜10時の7分（1時間おき）と毎日12:07・15:07・18:07（ミニロト・ビンゴ5・ナンバーズだけ）に自動で取り込み、公開ページも更新します。
当せん金の書き足し：`node tools/set-official.mjs <種類> <公式CSV>`（詳しくは docs/spec.md の 6-2）

## Android アプリ（Google Play）
1. 公開ページ（Web 版）：https://fullmoonsatoshi-sudo.github.io/loto-jinja/（GitHub Pages）
2. Android アプリは、この src/ をそのまま中に入れたネイティブアプリ（Capacitor）。アプリの中では公式CSVを直接読み、広告（AdMob）を出す。作り方・広告IDの切り替えは docs/android-native.md
3. Google Play Console（オーナー本人のデベロッパー登録が必要）で審査に出す（docs/owner-handoff.md）
