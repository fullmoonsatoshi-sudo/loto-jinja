#!/usr/bin/env bash
# エミュレーターでデバッグ APK を確かめる（GitHub Actions の android.yml から呼ぶ）。
# 使い方：bash tools/app/emulator-check.sh <デバッグAPK> <出力フォルダ>
# 操作と確認の中身は emulator-check.mjs（adb でタップし、WebView の中は Chrome の開発者ツールの仕組みで読む）。
set -uo pipefail
APK=$(ls $1 | head -1)
OUT=$2
PKG=io.github.fullmoonsatoshisudo.lotojinja
mkdir -p "$OUT"
adb wait-for-device
adb shell settings put global window_animation_scale 0 || true
adb shell settings put global hide_error_dialogs 1 || true  # 「応答していません」のダイアログで画面がふさがれないように
# 起動直後は Google Play 開発者サービスの準備・更新が続くので、落ち着くまで待つ
for i in $(seq 1 30); do [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1" ] && break; sleep 2; done
sleep 60
timeout 300 adb install -r "$APK"
adb logcat -c
adb shell am start -n "$PKG/.MainActivity"
timeout 1500 node tools/app/emulator-check.mjs "$OUT" "$PKG"
code=$?
timeout 120 adb logcat -d -v time > "$OUT/emulator-logcat.txt" || echo "logcat を読めませんでした（エミュレーターが応答しない）" >> "$OUT/emulator-summary.txt"
# クラッシュ・JS のエラーがログに無いこと
if grep -E "FATAL EXCEPTION|E/AndroidRuntime" "$OUT/emulator-logcat.txt" | grep -v "^--" > "$OUT/crash.txt"; then
  if [ -s "$OUT/crash.txt" ]; then echo "クラッシュがありました"; cat "$OUT/crash.txt"; code=1; fi
fi
# Capacitor 本体の既知のエラー（読み込み直後に余白の値を入れようとして失敗する。画面に影響なし）は除く
if grep -E "E/Capacitor/Console" "$OUT/emulator-logcat.txt" | grep -v "Error injecting safe area CSS" > "$OUT/jserr.txt" && [ -s "$OUT/jserr.txt" ]; then
  echo "JS のエラーがありました"; cat "$OUT/jserr.txt"; code=1
fi
{ echo; echo "logcat：クラッシュ $(wc -l < "$OUT/crash.txt" 2>/dev/null || echo 0) 行、JS エラー（Capacitor/Console の E）$(wc -l < "$OUT/jserr.txt" 2>/dev/null || echo 0) 行"; echo "終了コード：$code"; } >> "$OUT/emulator-summary.txt"
rm -f "$OUT/crash.txt" "$OUT/jserr.txt"
cat "$OUT/emulator-summary.txt"
exit $code
