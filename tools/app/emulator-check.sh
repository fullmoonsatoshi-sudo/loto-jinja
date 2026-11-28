#!/usr/bin/env bash
# エミュレーターでデバッグ APK を確かめる（GitHub Actions の android.yml から呼ぶ）。
# 使い方：bash tools/app/emulator-check.sh <デバッグAPK> <出力フォルダ> [名前の印（例 api35）]
# 出力：<出力フォルダ>/emulator-<印>-NN-*.png・emulator-<印>-summary.txt・emulator-<印>-logcat.txt
# 操作と確認の中身は emulator-check.mjs（adb でタップし、WebView の中は Chrome の開発者ツールの仕組みで読む）。
set -uo pipefail
APK=$(ls $1 | head -1)
OUT=$2
TAG=${3:-api}
export EMU_TAG="$TAG"
SUM="$OUT/emulator-$TAG-summary.txt"
LOG="$OUT/emulator-$TAG-logcat.txt"
PKG=io.github.fullmoonsatoshisudo.lotojinja
rm -rf -- "${OUT:?}"  # 前の回の結果を消す（2回目のやり直しのとき）
mkdir -p "$OUT"
adb wait-for-device
adb shell settings put global window_animation_scale 0 || true
adb shell settings put global hide_error_dialogs 1 || true  # 「応答していません」のダイアログで画面がふさがれないように
echo "Android $(adb shell getprop ro.build.version.release | tr -d '\r')（API $(adb shell getprop ro.build.version.sdk | tr -d '\r')）・WebView $(adb shell dumpsys package com.google.android.webview | grep -m1 versionName | tr -d ' \r')" > "$OUT/env.txt"
# 起動直後は Google Play 開発者サービスの準備・更新が続くので、落ち着くまで待つ
for i in $(seq 1 30); do [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1" ] && break; sleep 2; done
sleep 60
timeout 300 adb install -r "$APK"
adb logcat -c
# ログは最初から別に書き出しておく（あとでエミュレーターが応答しなくなっても残るように）
adb logcat -v time > "$OUT/live.txt" 2>/dev/null &
LOGPID=$!
adb shell am start -n "$PKG/.MainActivity"
timeout 1500 node tools/app/emulator-check.mjs "$OUT" "$PKG"
code=$?
kill $LOGPID 2>/dev/null || true
timeout 120 adb logcat -d -v time > "$LOG" || echo "logcat を読めませんでした（エミュレーターが応答しない）" >> "$SUM"
# 読めなかったときは、書き出しておいたログを使う
if [ ! -s "$LOG" ]; then mv "$OUT/live.txt" "$LOG"; else rm -f "$OUT/live.txt"; fi
# クラッシュ・JS のエラーがログに無いこと
if grep -E "FATAL EXCEPTION|E/AndroidRuntime" "$LOG" | grep -v "^--" > "$OUT/crash.txt"; then
  if [ -s "$OUT/crash.txt" ]; then echo "クラッシュがありました"; cat "$OUT/crash.txt"; code=1; fi
fi
# Capacitor 本体の既知のエラー（読み込み直後に余白の値を入れようとして失敗する。画面に影響なし）は除く
if grep -E "E/Capacitor/Console" "$LOG" | grep -v "Error injecting safe area CSS" > "$OUT/jserr.txt" && [ -s "$OUT/jserr.txt" ]; then
  echo "JS のエラーがありました"; cat "$OUT/jserr.txt"; code=1
fi
{ echo; echo "logcat：クラッシュ $(wc -l < "$OUT/crash.txt" 2>/dev/null || echo 0) 行、JS エラー（Capacitor/Console の E）$(wc -l < "$OUT/jserr.txt" 2>/dev/null || echo 0) 行"; echo "終了コード：$code"; } >> "$SUM"
rm -f "$OUT/crash.txt" "$OUT/jserr.txt"
cat "$SUM"
exit $code
