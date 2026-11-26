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
`node tools/update-data.mjs`（公式の回別CSVから新しい回を追記。ネットにつながる場所で実行）
GitHub（fullmoonsatoshi-sudo/loto-jinja）では `.github/workflows/deploy.yml` が、抽せん日の夜（19:00〜23:30 に30分おき＋翌朝7時）に自動で取り込み、公開ページも更新します。

## Google Play に出すまで
1. 公開ページ：https://fullmoonsatoshi-sudo.github.io/loto-jinja/（GitHub Pages）
2. Bubblewrap（Google の公式ツール）で Android アプリ（TWA）に包む
3. Google Play Console（オーナー本人のデベロッパー登録が必要）で審査に出す
