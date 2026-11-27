// キャラのせりふ（src/lines/<キャラID>.json）の選び方。画面のコードとは分けて、テストしやすくしている。
// 仕様：docs/lines-spec.md
// ・同じ状況なら、日本時間の今日の日付（1〜31日）で (日-1) 番目を出す（newyear だけは年末年始の4日間で全部使うよう、時で選ぶ）
// ・{game} はくじ名（ロト6 など）に置き換える
// ・ファイルが読めない／足りないときは、app.js の CHARS のせりふ（予備）を使い、落ちない
import { GAMES, jstParts, isHolidayBreak, isDrawDay, nextDraw, DRAW_MINUTE } from './lotto.js';

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

// 何番目（0〜30）のせりふを出すか。ふつうは (日-1) 番目。
// newyear は 12/31・1/1〜1/3 の4日間しか出ないので、日付だけで選ぶと4〜30番目が使われない。そこで
//   ・各日の0時台は、その日のあいさつ（12/31 は31番目、1/1〜1/3 は1〜3番目）
//   ・1時台〜23時台は、4〜30番目（27個）を時で順に出す。日ごとに続きから始めるので、4日間で27個すべてが出る
const NY_POOL_FROM = 3, NY_POOL_SIZE = 27;
export function lineIndex(key, now = new Date()) {
  const p = jstParts(now);
  if (key !== 'newyear' || !isHolidayBreak(p.m, p.d)) return p.d - 1;
  const k = p.m === 11 ? 0 : p.d; // 12/31 → 0、1/1 → 1、1/2 → 2、1/3 → 3（4日間の何日目か）
  if (p.h === 0) return p.m === 11 ? 30 : p.d - 1;
  return NY_POOL_FROM + (k * 23 + p.h - 1) % NY_POOL_SIZE;
}

// key：状況キー、now：今の日時、lines：キャラのせりふ（JSON を読んだもの。読めなければ null）
// opts.game：{game} に入れるくじのキー、opts.fallback：予備のせりふ（CHARS[キャラ].lines）
export function chooseLine(key, now, lines, opts = {}) {
  const day = lineDay(now), i = lineIndex(key, now);
  const arr = lines && typeof lines === 'object' && Array.isArray(lines[key]) ? lines[key] : null;
  if (arr && okLine(arr[i])) return fillGame(arr[i], opts.game);
  const fb = opts.fallback && opts.fallback[fallbackKey(key)];
  const list = Array.isArray(fb) ? fb.filter(okLine) : [];
  if (list.length) return fillGame(list[(day - 1) % list.length], opts.game);
  return DEFAULT_LINE[key] || '';
}

// drawday を出す時間（日本時間）：抽せん日の 12:00〜18:44。朝はふつうの順番（ナンバーズは平日毎日が抽せん日のため）
export const DRAWDAY_FROM = 12 * 60;

// ホームで出す状況。優先順：newyear ＞ drawday ＞ carryover ＞（奇数日はくじ別、偶数日は時間帯）
// game：選んでいるくじのキー、lastDraw：そのくじの最新回（carryover を見る。date があれば取り込み待ちかも見る）
export function homeSituation(game, now = new Date(), lastDraw = null) {
  const p = jstParts(now), minute = p.h * 60 + p.min;
  if (isHolidayBreak(p.m, p.d)) return 'newyear';
  if (isDrawDay(game, now) && minute >= DRAWDAY_FROM && minute < DRAW_MINUTE) return 'drawday';
  // 抽せんが済んで新しい回をまだ取り込んでいない間は、前の回のキャリーオーバーの話になるので出さない
  if ((game === 'loto6' || game === 'loto7') && lastDraw && Number(lastDraw.carryover) > 0 && !awaitingResult(game, lastDraw, now)) return 'carryover';
  if (p.d % 2 === 1) return game;
  return timeBand(now);
}
function awaitingResult(game, lastDraw, now) {
  if (typeof lastDraw.date !== 'string') return false;
  const nx = nextDraw(game, lastDraw, now);
  return !!nx && nx.pending > 0;
}

// ホームのせりふが変わりうる次の時刻（日本時間の 5:00・11:00・12:00・17:00・18:45・0:00。年末年始は毎時0分も）
const CHANGE_MINUTES = [5 * 60, 11 * 60, DRAWDAY_FROM, 17 * 60, DRAW_MINUTE, 24 * 60];
export function nextLineChange(now = new Date()) {
  const p = jstParts(now), cur = p.h * 60 + p.min;
  const marks = isHolidayBreak(p.m, p.d) ? [...CHANGE_MINUTES, ...Array.from({ length: 24 }, (_, h) => (h + 1) * 60)] : CHANGE_MINUTES;
  const next = Math.min(...marks.filter(x => x > cur));
  return new Date(Date.UTC(p.y, p.m, p.d) - 9 * 3600e3 + next * 60e3);
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
