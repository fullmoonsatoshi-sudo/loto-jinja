# fixtures：公式（みずほ銀行）回別CSVの実物の見本
2026-11-26 に公式サイトから取得した内容。公式と同じく Shift_JIS・改行CRLF で保存してある。
`tools/test.mjs` で、更新スクリプトの読み取り（parseCsv）が正しいかを確かめるのに使う。

## official/
ミニロト・ビンゴ5・ナンバーズの公式CSVの実物（A1011414・A1040498・A1007123）と、CEO が公式と照合した直近20回の当せん番号と当せん金（*-recent.txt）。
公開データ lotto-data-hub のライセンスは HUB_LICENSE.txt。
