// 자유 형식 입력 → 구조화된 일정 행.
// 각 계 담당자가 편한 대로 적어 붙여넣어도 날짜·시간·대상·장소·담당을 뽑아낸다.
// 100% 자동을 노리지 않고, 뽑아낸 결과를 미리보기 표에서 고친 뒤 제출하는 방식이다.
import { CATEGORY } from '../model.js';

const PLACES = ['체육관', '강당', '운동장', '시청각실', '다목적실', '도서관', '도서실', '과학실', '컴퓨터실', '음악실', '미술실', '실과실', '영어실', '급식실', '보건실', '상담실', '방송실', '교실', '운동실', '놀이터', '대강당', '회의실', '교무실', '돌봄교실'];
const DEPTS = ['교무기획부', '교육과정부', '생활인성부', '방과후부', '보건실', '영양실', '행정실', '교무부', '연구부', '생활부', '체육부', '과학부', '정보부', '진로부', '특수학급'];

const CAT_HINTS = [
  [/안전|소방|대피|보건|성교육|생명존중|재난|학교폭력|흡연|약물|정보통신윤리|아동학대/, 'safety'],
  [/회의|협의회|연수|컨설팅|워크숍|다모임|간담회|위원회/, 'meeting'],
  [/행사|체험|현장학습|대회|축제|발표회|운동회|캠프|공연|전시|수학여행|소풍|졸업|입학/, 'event'],
  [/방과후|돌봄|늘봄/, 'afterschool'],
];

// '10.1' 같은 날짜를 번호 글머리표로 오인하지 않도록 숫자 뒤 숫자는 제외한다.
const BULLET = /^\s*(?:[-*•▪◦·○●□■◎]|\(?\d{1,2}[.)](?!\d)|[가-힣][.)](?=\s)|[①-⑳])\s*/;

export function guessCategory(text) {
  for (const [re, cat] of CAT_HINTS) if (re.test(text)) return cat;
  return 'academic';
}

export function pad2(n) { return String(n).padStart(2, '0'); }

/**
 * @param {string} text 붙여넣은 원문
 * @param {{year?:number, month?:number, defaultDate?:string}} ctx
 * @returns {Array} 초안 행 목록
 */
export function parseFreeText(text, ctx = {}) {
  const year = ctx.year || new Date().getFullYear();
  let curDate = ctx.defaultDate || '';
  let curMonth = ctx.month || (ctx.defaultDate ? Number(ctx.defaultDate.slice(5, 7)) : new Date().getMonth() + 1);

  const out = [];
  for (const rawLine of String(text).split(/\r?\n/)) {
    const raw = rawLine.replace(/ /g, ' ').trimEnd();
    if (!raw.trim()) continue;

    let line = raw.replace(BULLET, '').trim();
    if (!line) continue;

    const d = extractDate(line, year, curMonth);
    if (d) {
      curDate = d.start;
      curMonth = Number(d.start.slice(5, 7));
      line = d.rest.trim();
    }

    // 날짜만 있는 줄 = 아래 줄들의 날짜 머리글
    if (!line || /^[([{【]?\s*[월화수목금토일]\s*[)\]}】]?$/.test(line)) continue;

    const time = extractTime(line);
    if (time) line = time.rest;

    const place = extractPlace(line);
    if (place) line = place.rest;

    const target = extractTarget(line);
    if (target) line = target.rest;

    const owner = extractOwner(line);
    if (owner) line = owner.rest;

    const dept = extractDept(line);
    if (dept) line = dept.rest;

    const title = cleanTitle(line);
    if (!title) continue;

    out.push({
      date: (d && d.start) || curDate || '',
      endDate: (d && d.end) || '',
      time: time ? time.value : '',
      title,
      detail: '',
      target: target ? target.value : '',
      place: place ? place.value : '',
      owner: owner ? owner.value : '',
      dept: dept ? dept.value : '',
      category: guessCategory(raw),
      _raw: raw.trim(),
      _needsDate: !((d && d.start) || curDate),
    });
  }
  return out;
}

// ── 날짜 ───────────────────────────────────────────────────
export function extractDate(line, year, curMonth) {
  // 2026-09-22 / 2026.9.22 / 2026년 9월 22일  (기간 지원)
  let m = line.match(/(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?\s*(?:[~-]\s*(?:(\d{4})\s*[-./년]\s*)?(?:(\d{1,2})\s*[-./월]\s*)?(\d{1,2})\s*일?)?/);
  if (m) {
    const start = `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
    const end = m[6] ? `${m[4] || m[1]}-${pad2(m[5] || m[2])}-${pad2(m[6])}` : '';
    return { start, end: end > start ? end : '', rest: strip(line, m) };
  }
  // 9/22 · 9.22 · 9월 22일  (기간 지원)
  m = line.match(/(?:^|[\s([{])(\d{1,2})\s*[/.월]\s*(\d{1,2})\s*일?(?!\s*(?:학년|반|교시|명|층|회|번|시간|주|개)(?![가-힣]))\s*(?:[~-]\s*(?:(\d{1,2})\s*[/.월]\s*)?(\d{1,2})\s*일?)?/);
  if (m) {
    const mo = Number(m[1]), da = Number(m[2]);
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
      const start = `${year}-${pad2(mo)}-${pad2(da)}`;
      const end = m[4] ? `${year}-${pad2(m[3] || mo)}-${pad2(m[4])}` : '';
      return { start, end: end > start ? end : '', rest: strip(line, m) };
    }
  }
  // 22일 · 22(월)  → 현재 월 기준
  m = line.match(/(?:^|[\s([{])(\d{1,2})\s*(?:일(?!\s*(?:반|정|과|째))|\(\s*[월화수목금토일]\s*\))/);
  if (m) {
    const da = Number(m[1]);
    if (da >= 1 && da <= 31) {
      return { start: `${year}-${pad2(curMonth)}-${pad2(da)}`, end: '', rest: strip(line, m) };
    }
  }
  return null;
}

function strip(line, m) {
  return (line.slice(0, m.index) + ' ' + line.slice(m.index + m[0].length))
    .replace(/\(\s*[월화수목금토일]\s*\)/, ' ')
    .replace(/^[\s,.:·\-~)\]]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ── 시간 ───────────────────────────────────────────────────
export function extractTime(line) {
  let m = line.match(/(\d{1,2})\s*:\s*(\d{2})\s*(?:[~-]\s*(\d{1,2})\s*:\s*(\d{2}))?/);
  if (m) {
    const v = m[3] ? `${pad2(m[1])}:${m[2]}~${pad2(m[3])}:${m[4]}` : `${pad2(m[1])}:${m[2]}`;
    return { value: v, rest: strip(line, m) };
  }
  m = line.match(/(\d)\s*[~-]\s*(\d)\s*교시/);
  if (m) return { value: `${m[1]}~${m[2]}교시`, rest: strip(line, m) };
  // '3,2교시' 처럼 학년별로 교시가 다를 때 쓰는 표기
  m = line.match(/(\d)\s*,\s*(\d)\s*교시/);
  if (m) return { value: `${m[1]},${m[2]}교시`, rest: strip(line, m) };
  m = line.match(/(\d)\s*교시/);
  if (m) return { value: `${m[1]}교시`, rest: strip(line, m) };
  m = line.match(/(아침활동|아침|조회|중식|점심시간|점심|방과\s*후|종례|창체|창의적\s*체험활동)/);
  if (m) return { value: m[1].replace(/\s+/g, ''), rest: strip(line, m) };
  return null;
}

// ── 대상 ───────────────────────────────────────────────────
export function extractTarget(line) {
  let m = line.match(/전\s*교\s*생|전\s*학\s*년|교\s*직\s*원\s*전\s*체|희망\s*학생/);
  if (m) return { value: m[0].replace(/\s+/g, ''), rest: strip(line, m) };
  m = line.match(/(\d)\s*학년\s*(\d)\s*반/);
  if (m) return { value: `${m[1]}학년 ${m[2]}반`, rest: strip(line, m) };
  // 월중계획은 '학' 을 빼고 '1-6년', '5,6년' 으로 적는 경우가 많다.
  // 앞에 숫자가 오면(2026년) 연도이므로 제외한다.
  m = line.match(/(?<!\d)(\d)\s*,\s*(\d)\s*학?년(?![도간생차])/);
  if (m) return { value: `${m[1]},${m[2]}학년`, rest: strip(line, m) };
  m = line.match(/(?<!\d)(\d)\s*[~-]\s*(\d)\s*학?년(?![도간생차])/);
  if (m) return { value: `${m[1]}~${m[2]}학년`, rest: strip(line, m) };
  m = line.match(/(?<!\d)(\d)\s*학?년(?![도간생차])/);
  if (m) return { value: `${m[1]}학년`, rest: strip(line, m) };
  m = line.match(/(\d)\s*-\s*(\d)(?![\d])/);
  if (m) return { value: `${m[1]}학년 ${m[2]}반`, rest: strip(line, m) };
  return null;
}

// ── 장소 ───────────────────────────────────────────────────
export function extractPlace(line) {
  const m = line.match(/장소\s*[:：]\s*([^,/·|]+)/);
  if (m) return { value: m[1].trim(), rest: strip(line, m) };
  for (const p of PLACES) {
    // '각 교실', '제2 음악실' 처럼 앞에 붙는 수식어까지 함께 가져간다.
    // (그러지 않으면 '(각 교실)' 에서 '교실' 만 빠져 '(각 )' 이 제목에 남는다)
    // 낱말의 일부는 장소가 아니다. '과학실험' 의 '과학실', '대강당' 의 '강당' 을 떼어 가면
    // 제목이 '험' 처럼 부서졌다. 앞뒤가 한글로 이어지면 건너뛴다(뒤의 '에서·에·으로·로' 는 허용).
    const re = new RegExp(`(?<![가-힣])((?:(?:각|전|제\\s*\\d+|\\d+)\\s*)?${p})(?:에서|에|으로|로)?(?![가-힣])`);
    const hit = line.match(re);
    if (hit) return { value: hit[1].trim(), rest: strip(line, hit) };
  }
  return null;
}

// ── 담당 ───────────────────────────────────────────────────
export function extractOwner(line) {
  let m = line.match(/담당\s*[:：]?\s*([가-힣]{2,4})\s*(?:선생님|교사|샘)?/);
  if (m) return { value: m[1], rest: strip(line, m) };
  m = line.match(/([가-힣]{2,4})\s*(?:선생님|교사|샘)(?![가-힣])/);
  if (m) return { value: m[1], rest: strip(line, m) };
  return null;
}

export function extractDept(line) {
  for (const d of DEPTS) {
    const i = line.indexOf(d);
    if (i >= 0) return { value: d, rest: strip(line, { index: i, 0: d }) };
  }
  return null;
}

function cleanTitle(s) {
  let t = s;
  // 정보를 빼내고 남은 빈 괄호·쉼표 찌꺼기를 정리한다.
  for (let i = 0; i < 3; i++) {
    t = t.replace(/[([{]\s*[,·、\s]*\s*[)\]}]/g, ' ')
         .replace(/[([{]\s*([,·、]\s*)+/g, '(')
         .replace(/([,·、]\s*)+\s*[)\]}]/g, ')');
  }
  return t
    .replace(/^[\s,.:;·\-~|/()[\]]+/, '')
    .replace(/[\s,.:;·\-~|/]+$/, '')
    .replace(/\s*,\s*,\s*/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ── 표(엑셀/hwpx 표) → 행 ────────────────────────────────────
const HEADER_MAP = [
  [/날짜|일자|월일|일시/, 'date'],
  [/종료|끝|~일자/, 'endDate'],
  [/시간|교시|시각/, 'time'],
  [/내용|활동|행사|일정|제목|프로그램|강좌/, 'title'],
  [/비고|세부|상세|설명/, 'detail'],
  [/대상|학년|참여/, 'target'],
  [/장소|교실|실/, 'place'],
  [/담당|강사|교사|지도/, 'owner'],
  [/부서|업무|담당부서|계/, 'dept'],
];

/** 표가 머리글을 가지고 있으면 열을 매핑해서 읽고, 아니면 각 행을 자유 텍스트로 해석한다. */
export function parseTable(rows, ctx = {}) {
  if (!rows || !rows.length) return [];

  // 제목만 들어 있는 표(노란 머리글 상자 등)는 일정이 아니다.
  if (rows.length <= 3 && /계획|낙성|학교$/.test(rows.map((r) => r.join(' ')).join(' ')) &&
      findMonthContext(rows.map((r) => r.join(' ')).join(' '))) {
    return [];
  }

  // 업무분장표는 일정 표가 아니다(설정 탭에서 따로 읽는다).
  //
  // 날짜 열이 있는지를 함께 본다. 주간활동계획의 머리가
  // '날짜(요일) | 계 | 담당자 | 주요 업무 내용 | 시간 | 장소' 인데,
  // '담당자' 와 '업무내용' 만 보고 업무분장표로 오해해 통째로 버리고 있었다.
  // 업무분장표에는 날짜 열이 없다. 그것이 둘을 가르는 가장 확실한 차이다.
  const head0 = (rows[0] || []).map((c) => String(c || '').replace(/\s/g, '')).join('|');
  const hasDateCol = /날짜|일자|월일|일시/.test(head0);
  if (!hasDateCol && /성명|담당자/.test(head0) && /분장|담당업무|업무내용/.test(head0)) return [];

  // 교담·특별실 시간표도 일정 표가 아니다([시간표] 탭에서 따로 읽는다).
  // 주간활동계획 한글 파일에는 이 표가 뒤에 딸려 오는데, 일정으로 읽으면
  // '피아노1 피아노1 피아노1' 같은 쓰레기가 섞인다.
  if (looksLikeTimetable(rows)) return [];

  // 월중 교육활동계획 표(일 | 요일 | 주요 업무 내용 | 비고)는 규칙이 달라 따로 읽는다.
  const monthPlan = parseMonthPlan(rows, ctx);
  if (monthPlan) return monthPlan;

  const headerIdx = rows.findIndex((r) => scoreHeader(r) >= 2);
  if (headerIdx < 0) {
    return parseFreeText(rows.map((r) => r.filter(Boolean).join(' ')).join('\n'), ctx);
  }
  const map = {};
  rows[headerIdx].forEach((cell, i) => {
    const t = String(cell || '').replace(/\s/g, '');
    for (const [re, key] of HEADER_MAP) {
      if (re.test(t) && map[key] === undefined) { map[key] = i; break; }
    }
  });

  const year = ctx.year || new Date().getFullYear();
  let curDate = ctx.defaultDate || '';
  const out = [];
  for (const r of rows.slice(headerIdx + 1)) {
    if (!r.some((c) => String(c || '').trim())) continue;
    const raw = (k) => (map[k] === undefined ? '' : String(r[map[k]] || '').trim());
    // 병합된 칸은 줄이 갈려 온다. '생활\n인성' 은 부서 이름이 두 줄로 쓰인 것뿐이다.
    const pick = (k) => raw(k).replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
    const dateCell = pick('date');
    let date = curDate, endDate = '';
    if (dateCell) {
      const d = extractDate(dateCell, year, Number((curDate || '').slice(5, 7)) || new Date().getMonth() + 1);
      if (d) { date = d.start; endDate = d.end; curDate = d.start; }
    }
    // 내용 칸은 '제목 ⏎ - 세부 ⏎ - 세부' 로 적히는 일이 많다(주간활동계획이 그렇다).
    // 첫 줄만 제목으로 삼고 나머지는 세부 내용으로 내린다.
    const titleLines = raw('title').split('\n').map((x) => x.trim()).filter(Boolean);
    const title = titleLines[0] || cleanTitle(r.filter(Boolean).join(' '));
    if (!title) continue;
    const detail = [pick('detail'), titleLines.slice(1).join('\n')].filter(Boolean).join('\n');
    out.push({
      date, endDate: pick('endDate') || endDate, time: pick('time'),
      title, detail, target: pick('target'),
      place: pick('place'), owner: pick('owner'), dept: pick('dept'),
      category: guessCategory(r.join(' ')),
      _raw: r.filter(Boolean).join(' | '),
      _needsDate: !date,
    });
  }
  return out;
}

/** 머리가 요일이고 첫 열이 'N교시' 면 교담 시간표다. */
function looksLikeTimetable(rows) {
  const head = (rows[0] || []).map((c) => String(c || '').replace(/\s/g, ''));
  const dows = new Set(head.filter((c) => /^[월화수목금토]$/.test(c)));
  if (dows.size < 3) return false;
  const periods = rows.slice(1)
    .filter((r) => /^\d교시$/.test(String(r[0] || '').replace(/\s/g, ''))).length;
  return periods >= 3;
}

function scoreHeader(row) {
  let n = 0;
  for (const cell of row) {
    const t = String(cell || '').replace(/\s/g, '');
    if (!t || t.length > 8) continue;
    if (HEADER_MAP.some(([re]) => re.test(t))) n++;
  }
  return n;
}

export const CATEGORY_KEYS = Object.keys(CATEGORY);

// ── 월중 교육활동계획 표 ─────────────────────────────────────
// 학교 월중계획은 '일 | 요일 | 주요 업무 내용 | 비고' 한 장짜리 표이고,
// 한 칸 안에 그날의 일정이 쉼표로 여러 개 들어간다.
//
//   1 | 화 | 양성평등교육주간(~4), 학교스포츠클럽(10:30, 부서별 장소), 영어원어민 순회
//
// 두 가지를 알아야 제대로 읽힌다.
//  (1) 칸을 나누는 쉼표와 괄호 안의 쉼표는 다르다. 괄호 깊이를 세면서 나눈다.
//  (2) 날짜는 칸에 없고 '일' 열의 숫자 + 문서 제목의 '2026년 9월' 을 합쳐 만든다.

/** 문서 어딘가의 '2026년 9월' 표기에서 연·월을 찾는다. */
export function findMonthContext(text) {
  const t = String(text || '');
  let m = t.match(/(\d{4})\s*년\s*(\d{1,2})\s*월/);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) {
    return { year: Number(m[1]), month: Number(m[2]) };
  }
  m = t.match(/(\d{1,2})\s*월\s*(?:중)?\s*(?:주요\s*)?(?:교육활동|업무|행사)?\s*계획/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return { month: Number(m[1]) };
  return null;
}

/**
 * 괄호 깊이를 세면서 쉼표로 나눈다.
 * '학교스포츠클럽(10:30, 부서별 장소)' 안의 쉼표는 건드리지 않는다.
 */
export function splitActivities(text) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of String(text || '')) {
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth = Math.max(0, depth - 1);
    if ((ch === ',' || ch === '，' || ch === '、' || ch === '\n') && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur);

  // 쉼표를 빠뜨린 '…(…) 다음활동(…)' 도 나눠준다.
  // 뒤쪽에 또 괄호가 있을 때만 나눠서 '…(~4) 운영' 같은 걸 자르지 않는다.
  const out = [];
  for (const part of parts) {
    let rest = part;
    let m;
    while ((m = rest.match(/\)\s+(?=[^,)]{2,}\()/))) {
      out.push(rest.slice(0, m.index + 1));
      rest = rest.slice(m.index + m[0].length);
    }
    out.push(rest);
  }
  return out.map((x) => x.trim()).filter(Boolean);
}

/** 월중계획 표의 열 위치를 찾는다. 아니면 null. */
function monthPlanColumns(rows) {
  const dayCell = (c) => /^\d{1,2}\s*\(?\s*[월화수목금토일]?\s*\)?$/.test(String(c || '').trim());

  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const cells = rows[i].map((c) => String(c || '').replace(/\s/g, ''));
    const dayIdx = cells.findIndex((c) => c === '일' || c === '일자' || c === '날짜');
    const contentIdx = cells.findIndex((c) => c.length <= 12 && /내용|업무|일정|행사|활동/.test(c));
    if (dayIdx >= 0 && contentIdx >= 0 && contentIdx !== dayIdx) {
      const noteIdx = cells.findIndex((c) => /비고|참고/.test(c));
      return { headerIdx: i, dayIdx, contentIdx, noteIdx };
    }
  }

  // 머리글이 없어도 1열이 날짜 숫자, 2열이 요일이면 월중계획으로 본다.
  const body = rows.filter((r) => r.length >= 3);
  if (body.length >= 5) {
    const dayLike = body.filter((r) => dayCell(r[0])).length;
    const dowLike = body.filter((r) => /^[월화수목금토일]$/.test(String(r[1] || '').trim())).length;
    if (dayLike >= body.length * 0.6 && dowLike >= body.length * 0.6) {
      return { headerIdx: rows.indexOf(body[0]) - 1, dayIdx: 0, contentIdx: 2, noteIdx: 3 };
    }
  }
  return null;
}

/** 월중계획 표 → 일정 행 목록. 월중계획이 아니면 null 을 돌려준다. */
export function parseMonthPlan(rows, ctx = {}) {
  const col = monthPlanColumns(rows);
  if (!col) return null;

  const year = ctx.year || new Date().getFullYear();
  const month = ctx.month || null;   // 모르면 날짜를 비워두고 사용자가 채운다
  const out = [];

  for (let i = col.headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const dayText = String(r[col.dayIdx] || '').trim();
    const dayNum = Number((dayText.match(/^(\d{1,2})/) || [])[1]);
    const content = String(r[col.contentIdx] || '').trim();
    if (!content) continue;                        // 주말처럼 비어 있는 날은 건너뛴다
    if (!(dayNum >= 1 && dayNum <= 31)) continue;

    const date = month ? `${year}-${pad2(month)}-${pad2(dayNum)}` : '';
    const note = col.noteIdx >= 0 ? String(r[col.noteIdx] || '').trim() : '';

    for (const piece of splitActivities(content)) {
      const item = parseActivityPiece(piece, { date, year, month, note });
      if (item) out.push(item);
    }
  }
  return out;
}

/**
 * '학교스포츠클럽(10:30, 부서별 장소)' 같은 한 덩어리를 항목 하나로 바꾼다.
 * 괄호 안은 시간·대상을 먼저 걷어내고 남는 것을 장소로 본다.
 * ('부서별 장소', 'AI교실', '별초병설유' 처럼 장소 이름을 목록으로 다 담을 수 없기 때문)
 */
export function parseActivityPiece(piece, { date = '', year, month, note = '' } = {}) {
  let line = String(piece || '').trim();
  if (!line) return null;

  // '(~4)' = 4일까지 이어지는 주간 행사
  let endDate = '';
  const span = line.match(/\(\s*~\s*(\d{1,2})\s*\)/);
  if (span) {
    const last = Number(span[1]);
    if (month && last >= 1 && last <= 31) {
      const cand = `${year}-${pad2(month)}-${pad2(last)}`;
      if (cand > date) endDate = cand;
    }
    line = (line.slice(0, span.index) + ' ' + line.slice(span.index + span[0].length)).trim();
  }

  let time = '';
  let target = '';
  let place = '';
  let owner = '';

  const paren = line.match(/^([^()]*?)\s*\(([^()]*)\)\s*(.*)$/);
  if (paren && paren[1].trim()) {
    let inside = paren[2];
    const t = extractTime(inside); if (t) { time = t.value; inside = t.rest; }
    const g = extractTarget(inside); if (g) { target = g.value; inside = g.rest; }
    const o = extractOwner(inside); if (o) { owner = o.value; inside = o.rest; }
    place = cleanTitle(inside);
    line = `${paren[1]} ${paren[3]}`.trim();
  } else {
    const t = extractTime(line); if (t) { time = t.value; line = t.rest; }
    const g = extractTarget(line); if (g) { target = g.value; line = g.rest; }
    const p = extractPlace(line); if (p) { place = p.value; line = p.rest; }
    const o = extractOwner(line); if (o) { owner = o.value; line = o.rest; }
  }

  const title = cleanTitle(line);
  if (!title) return null;

  return {
    date, endDate, time, title, detail: note,
    target, place, owner, dept: '',
    category: guessCategory(piece),
    _raw: String(piece).trim(),
    _needsDate: !date,
  };
}
