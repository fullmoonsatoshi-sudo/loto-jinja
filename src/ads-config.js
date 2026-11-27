// 広告（AdMob）の設定。Android アプリの中だけで使う（Web 版では広告を出さない）。
// ★ 本番の広告に切り替えるときは、このファイルの4つの値だけを書きかえる（手順：docs/android-native.md）。
//   appId はビルドのときに AndroidManifest にも入る（android/app/build.gradle がこのファイルから読む）。
// いまの値は Google が公開しているテスト用のID（本物の広告は出ず、収益も発生しない）。
export const ADS = {
  appId: 'ca-app-pub-3940256099942544~3347511713',      // AdMob のアプリID（Android）。「~」を含む
  banner: 'ca-app-pub-3940256099942544/9214589741',     // バナー広告ユニットID（アダプティブ バナー）。「/」を含む
  rewarded: 'ca-app-pub-3940256099942544/5224354917',   // リワード広告ユニットID
  publisherId: 'pub-3940256099942544',                  // パブリッシャーID（app-ads.txt に書く）
};
// テスト用のIDかどうか（テスト用なら、広告の読み込みもテストとして扱う）
export const IS_TEST_ADS = ADS.appId.startsWith('ca-app-pub-3940256099942544~');
