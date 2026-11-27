# 公式（みずほ銀行）の「最近の回の一覧」CSV（2026-11-27 に実物を確認。Shift_JIS・CRLF）
URL：
- ロト6  https://www.mizuhobank.co.jp/retail/takarakuji/loto/loto6/csv/loto6.csv
- ロト7  https://www.mizuhobank.co.jp/retail/takarakuji/loto/loto7/csv/loto7.csv
- ミニロト https://www.mizuhobank.co.jp/retail/takarakuji/loto/miniloto/csv/miniloto.csv
- ナンバーズ https://www.mizuhobank.co.jp/retail/takarakuji/numbers/csv/numbers.csv
- ビンゴ5 https://www.mizuhobank.co.jp/retail/takarakuji/bingo/bingo5/csv/bingo5.csv
中身：種別コードの行と「第N回…,数字選択式全国自治宝くじ,和暦の日付,会場」の行が、新しい順に交互に並ぶ（回の詳しい中身は無い）。例：
```
A52
第2158回ロト６,数字選択式全国自治宝くじ,令和8年11月26日,東京 宝くじドリーム館
A52
第2157回ロト６,数字選択式全国自治宝くじ,令和8年11月23日,東京 宝くじドリーム館
```
ロト7・ビンゴ5は回番号が4桁ゼロ埋め（第0704回ロト７、第0498回ビンゴ５）。ナンバーズは第7123回ナンバーズ。
回ごとの詳しいCSV：ロト6 …/loto/loto6/csv/A102<4桁>.CSV、ロト7 …/loto/loto7/csv/A103<4桁>.CSV、ミニロト …/loto/miniloto/csv/A101<4桁>.CSV、ナンバーズ …/numbers/csv/A100<4桁>.CSV（3と4が1ファイル）、ビンゴ5 …/bingo/bingo5/csv/A104<4桁>.CSV。
注意：レスポンスの Access-Control-Allow-Origin は https://search.www.mizuhobank.co.jp だけ → アプリの WebView の fetch では読めない（CORS）。Android のネイティブ通信（CapacitorHttp 等）で読む必要がある。クラウド（GitHub Actions 含む）からは 403。Cache-Control: max-age=60。
