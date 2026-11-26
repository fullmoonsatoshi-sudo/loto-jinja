# 当たれ！ロト神社

ロト6・ロト7の当せん番号速報、マイ番号の自動当選チェック、見習い巫女「かなえ」たちの神託（お楽しみ予想）が使えるWebアプリです。

- 公開ページ：https://fullmoonsatoshi-sudo.github.io/loto-jinja/
- 神託（予想）はお楽しみ機能で、**当せん確率は上がりません**。18歳以上の方向けです。
- 当せん番号の出典：みずほ銀行の公式発表。必ず公式発表でもご確認ください。
- 取り込み：公式サイトはクラウドからの自動アクセスを受け付けないため、公開データ [jjayck/lotoanaba-data](https://github.com/jjayck/lotoanaba-data) を経由しています（取り込み済みの直近20回と完全一致し、SHA-256 が合うときだけ追加）。

## しくみ
- `src/` … アプリ本体（HTML・CSS・JavaScript。ビルド不要）
- `tools/update-data.mjs` … 新しい回を取り込む（公式 → だめなら予備の公開データ `tools/mirror.mjs`）
- `.github/workflows/deploy.yml` … 抽せん日の夜に自動で取り込み、GitHub Pages に公開する
- `tools/test.mjs` … テスト（`node tools/test.mjs`）
- `docs/` 企画書・仕様書など、`qa/` テスト報告、`review/` 審査票
