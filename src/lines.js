// キャラのせりふ（src/lines/<キャラID>.json）の選び方。画面のコードとは分けて、テストしやすくしている。
// 仕様：docs/lines-spec.md
// ・同じ状況なら、日本時間の今日の日付（1〜31日）で (日-1) 番目を出す
// ・{game} はくじ名（ロト6 など）に置き換える
// ・ファイルが読めない／足りないときは、app.js の CHARS のせりふ（予備）を使い、落ちない
import { GAMES, jstParts, isHolidayBreak, isBeforeDrawToday } from './lotto.js';

export const CHAR_IDS = ['miko', 'kannushi', 'kitsune', 'neko'];
export const LINE_KEYS = ['morning', 'noon', 'night', 'drawday', 'carryover', 'newyear',
  'loto6', 'loto7', 'miniloto', 'bingo5', 'numbers3', 'numbers4', 'pray', 'cutin', 'big', 'win', 'lose'];
export const LINES_PER_KEY = 31;
export const MAX_LEN = 40, CUTIN_MAX_LEN = 16;
export const GAME_KEYS_IN_LINES = ['drawday', 'carryover']; // {game} を必ず入れる状況（ほかは入れない）
export const linesUrl = charId => `lines/${charId}.json`;

// 予備のせりふ（CHARS の lines）のどれを使うか。ホームの状況はすべて home
const FALLBACK_KEY = { pray: 'pray', cutin: 'cutin', big: 'big', win: 'win', lose: 'lose' };
const fallbackKey = key => FALLBACK_KEY[key] || 'home';
const DEFAULT_LINE = { cutin: 'ご祈祷中…' };

const okLine = s => typeof s === 'string' && s.trim() !== '';
const fillGame = (s, game) => s.replaceAll('{game}', game && GAMES[game] ? GAMES[game].name : 'くじ');

// 日本時間の今日の日付（1〜31）
export function lineDay(now = new Date()) { return jstParts(now).d; }

// key：状況キー、now：今の日時、lines：キャラのせりふ（JSON を読んだもの。読めなければ null）
// opts.game：{game} に入れるくじのキー、opts.fallback：予備のせりふ（CHARS[キャラ].lines）
export function chooseLine(key, now, lines, opts = {}) {
  const day = lineDay(now);
  const arr = lines && typeof lines === 'object' && Array.isArray(lines[key]) ? lines[key] : null;
  if (arr && okLine(arr[day - 1])) return fillGame(arr[day - 1], opts.game);
  const fb = opts.fallback && opts.fallback[fallbackKey(key)];
  const list = Array.isArray(fb) ? fb.filter(okLine) : [];
  if (list.length) return fillGame(list[(day - 1) % list.length], opts.game);
  return DEFAULT_LINE[key] || '';
}

// ホームで出す状況。優先順：newyear ＞ drawday ＞ carryover ＞（奇数日はくじ別、偶数日は時間帯）
// game：選んでいるくじのキー、lastDraw：そのくじの最新回（carryover を見る）
export function homeSituation(game, now = new Date(), lastDraw = null) {
  const p = jstParts(now);
  if (isHolidayBreak(p.m, p.d)) return 'newyear';
  if (isBeforeDrawToday(game, now)) return 'drawday';
  if ((game === 'loto6' || game === 'loto7') && lastDraw && Number(lastDraw.carryover) > 0) return 'carryover';
  if (p.d % 2 === 1) return game;
  return timeBand(now);
}
// 時間帯（日本時間）：朝 5:00〜10:59／昼 11:00〜16:59／夜 17:00〜4:59
export function timeBand(now = new Date()) {
  const h = jstParts(now).h;
  return h >= 5 && h < 11 ? 'morning' : h >= 11 && h < 17 ? 'noon' : 'night';
}

// せりふファイルの中身が仕様どおりかを確かめ、問題の一覧を返す（空なら合格）
export function checkLines(obj) {
  const errs = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return ['オブジェクトではない'];
  const extra = Object.keys(obj).filter(k => !LINE_KEYS.includes(k));
  if (extra.length) errs.push(`仕様にないキー：${extra.join('、')}`);
  for (const k of LINE_KEYS) {
    const arr = obj[k];
    if (!Array.isArray(arr)) { errs.push(`${k}：配列がない`); continue; }
    if (arr.length !== LINES_PER_KEY) errs.push(`${k}：${arr.length}個（${LINES_PER_KEY}個のはず）`);
    const max = k === 'cutin' ? CUTIN_MAX_LEN : MAX_LEN;
    arr.forEach((s, i) => {
      const at = `${k}[${i}]`;
      if (!okLine(s)) { errs.push(`${at}：空`); return; }
      const len = [...s].length; // {game}（6文字）は一番長いくじ名「ナンバーズ3」と同じ長さなので、そのまま数えれば置き換え後も超えない
      if (len > max) errs.push(`${at}：${len}文字（${max}文字以内のはず）`);
      const hasGame = s.includes('{game}');
      if (GAME_KEYS_IN_LINES.includes(k) && !hasGame) errs.push(`${at}：{game} がない`);
      if (!GAME_KEYS_IN_LINES.includes(k) && hasGame) errs.push(`${at}：{game} は使わない状況`);
      if (/\{(?!game\})[^}]*\}/.test(s)) errs.push(`${at}：{game} 以外の置き換え文字`);
    });
  }
  return errs;
}
