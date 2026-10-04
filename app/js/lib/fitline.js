// 칸에 글이 들어가게 줄을 끊고 자간을 좁힌다.
//
// 지금까지는 글을 그냥 칸에 부어 놓고 한글·브라우저가 알아서 접게 두었다. 그래서
// '영어원어민 순회(6-5-3-4-6, 1-5교시, 각 교실 및 도서관)' 이 '6-5-' 에서 잘리고
// '정하늘아, 오진영' 이 '정하늘 / 아, 오진영' 으로 이름 한가운데서 끊겼다. 사람이
// 손으로 짜 넣는다면 하지 않을 자리다.
//
// 사람은 이렇게 한다.
//   1) 한두 글자가 넘치면 **자간을 조금 줄여** 한 줄에 앉힌다.
//   2) 그걸로 안 되면 **항목이 시작되는 자리에서 줄을 바꾼다.** 항목을 반으로 자르지 않는다.
// 그대로 옮긴 것이 이 파일이다.
//
// 글자 폭은 재지 않고 어림한다. 한글은 네모 한 칸, 숫자·영문은 반 칸이다. 서식 칸은
// 조금 모자라게 잡아 두면 틀려도 한 줄 늘어날 뿐이라, 어림으로 충분하다.

/** 글자 한 자의 폭 (em). 한글 = 1. */
function charEm(ch) {
  const c = ch.codePointAt(0);
  if (ch === ' ') return 0.3;
  // 한글 · 한자 · 전각 기호
  if (c >= 0xac00 && c <= 0xd7a3) return 1;
  if (c >= 0x3130 && c <= 0x318f) return 1;
  if (c >= 0x4e00 && c <= 0x9fff) return 1;
  if (c >= 0xff01 && c <= 0xff60) return 1;
  if (c >= 0x3000 && c <= 0x303f) return 1;
  // 좁은 기호
  if ('.,:;!|\'`()[]{}-~/'.includes(ch)) return 0.3;
  // 숫자 · 영문 · 그 밖의 아스키
  if (c < 0x2000) return 0.52;
  return 1;
}

/** 글 한 토막의 폭 (em) */
export function emOf(s) {
  let w = 0;
  for (const ch of String(s || '')) w += charEm(ch);
  return w;
}

/**
 * 칸에 들어가는 폭 (em).
 * @param usable  글이 들어가는 쪽 너비 (HWPUNIT)
 * @param pct     이 열이 가지는 몫 (%)
 * @param fontPt  글자 크기 (pt)
 */
export function capEm(usable, pct, fontPt) {
  const CELL_MARGIN = 282;          // 칸 좌우 여백 141 + 141 (hwpx 와 같은 값)
  const w = (usable * pct) / 100 - CELL_MARGIN;
  return Math.max(1, w / (fontPt * 100));
}

// 자간을 줄이는 단계. 한글의 charPr spacing(%) 과 CSS letter-spacing(em) 에 같이 쓴다.
// -8% 아래로는 글자가 서로 붙어 읽기 나빠진다. 거기서 멈추고 줄을 바꾼다.
export const TIGHT_PCT = [0, -4, -8];
const headroom = (lvl) => 1 / (1 + TIGHT_PCT[lvl] / 100);   // 그 단계에서 늘어나는 여유

/** 이 줄들을 담으려면 몇 단계로 좁혀야 하나. 좁혀도 안 되면 0 (어차피 접힌다). */
export function tightenLevel(lines, cap) {
  const max = lines.reduce((m, l) => Math.max(m, emOf(l)), 0);
  if (max <= cap) return 0;
  for (let i = 1; i < TIGHT_PCT.length; i++) if (max <= cap * headroom(i)) return i;
  return 0;
}

/**
 * 항목들을 줄로 묶는다. **항목은 쪼개지 않는다.**
 * 한 줄에 더 넣어도 자간을 좁혀 앉힐 수 있으면 넣고, 아니면 줄을 바꾼다.
 *
 * @param items  ['2학년 우쿨렐레 공연(10:30, 중앙 계단)', …]
 * @param cap    칸에 들어가는 폭 (em)
 * @param sep    항목 사이에 넣는 글 (기본 ', ')
 * @returns {{ text: string, tight: number }}
 */
export function packItems(items, cap, sep = ', ') {
  const xs = (items || []).map((s) => String(s || '').trim()).filter(Boolean);
  if (!xs.length) return { text: '', tight: 0 };
  const room = cap * headroom(TIGHT_PCT.length - 1);   // 가장 좁혔을 때까지는 넣어 본다
  const sepEm = emOf(sep);

  const lines = [];
  let cur = '';
  let curEm = 0;
  for (let i = 0; i < xs.length; i++) {
    const last = i === xs.length - 1;
    // 마지막 항목이 아니면 뒤에 쉼표가 붙으므로 그만큼 더 본다
    const piece = last ? xs[i] : xs[i] + sep;
    const pieceEm = emOf(piece);
    if (!cur) { cur = piece; curEm = pieceEm; continue; }
    if (curEm + pieceEm <= room) { cur += piece; curEm += pieceEm; continue; }
    lines.push(cur);
    cur = piece;
    curEm = pieceEm;
  }
  if (cur) lines.push(cur);
  // 줄 끝에 남은 쉼표 뒤 빈칸은 떼어 낸다. 가운데 정렬 칸에서 글이 한쪽으로 쏠린다.
  const out = lines.map((l) => l.replace(/\s+$/, ''));
  return { text: out.join('\n'), tight: tightenLevel(out, cap) };
}

/**
 * 이미 짜인 글(줄바꿈이 들어 있는)을 그 칸에 맞게 좁힐 단계.
 * 담당자 이름 둘, 기관 이름처럼 쪼갤 수 없는 글에 쓴다.
 */
export function fitText(text, cap) {
  const lines = String(text || '').split('\n');
  return { text: String(text || ''), tight: tightenLevel(lines, cap) };
}
