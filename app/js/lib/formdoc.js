// 학교 서식 그대로 내보내기 — 주간활동계획 / 월중(월간)교육활동계획.
//
// 지금까지는 줄글로만 내보냈다. 그런데 결재를 올리려면 학교가 쓰던 표 서식이어야 한다.
// 여기서는 앱에 쌓인 자료를 그 표 모양(칸 배치·열 너비까지)으로 바꿔 놓는다.
// 실제 문서를 열어 열 너비 비율을 그대로 옮겨왔다.
import { list } from '../store.js';
import {
  WEEKDAY, fmtK, parseYmd, ymd, addDays, range, byTime, monthEnd, noticeId,
} from '../model.js';
import { describeTime } from '../conflict.js';
import { holidayOn } from './holidays.js';
import { activitiesOn, recurringOn, isNoMeal, cleanDetail } from '../select.js';
import { loadConfig } from '../config.js';
import { packItems, fitText, capEm } from './fitline.js';

/**
 * 그 주가 몇 월 몇째 주인가.
 * 목요일을 기준으로 삼는다. 주가 달을 걸칠 때(8.31~9.5) 어느 달로 볼지가 갈리는데,
 * 목요일이 든 달로 보면 '9월 1주' 가 되어 학교에서 쓰는 이름과 맞는다.
 * (3.16(월) 주 → 목 3.19 → 3월 3주, 5.11(월) 주 → 목 5.14 → 5월 2주)
 */
export function weekAnchor(monday) {
  const d = parseYmd(addDays(monday, 3));
  return { month: d.getMonth() + 1, no: Math.floor((d.getDate() - 1) / 7) + 1, date: ymd(d) };
}

const yy = (s) => String(parseYmd(s).getFullYear()).slice(2);
const md = (s) => { const d = parseYmd(s); return `${d.getMonth() + 1}.${d.getDate()}.`; };

/** '3월 3주(26.3.16.-3.21.)' */
export function weekLabel(from, to) {
  const a = weekAnchor(from);
  return `${a.month}월 ${a.no}주(${yy(from)}.${md(from)}-${md(to)})`;
}

/** 1학기/2학기 — 교담 시간표 제목에만 쓴다. */
function termOf(date) {
  const d = parseYmd(date);
  const m = d.getMonth() + 1;
  if (m >= 3 && m <= 7) return '1';
  if (m === 8) return d.getDate() >= 19 ? '2' : '1';
  return '2';
}

/**
 * 월중·주간 서식에 넣을 반복일정.
 * 매일 도는 것(아침 독서활동 등)은 뺀다. 날마다 같은 줄이 반복되면 계획표를 읽을 수 없고,
 * 실제 학교 문서도 요일제 일정(화요일 스포츠클럽 등)만 적는다.
 */
function planRecurring(date) {
  return recurringOn(date).filter((r) => {
    if (r.includeInNeis === false) return false;
    // 반복일정 탭에서 '주간·월간' 을 꺼둔 것은 계획 문서에도 넣지 않는다.
    if (r.showInPlan === false) return false;
    if (r.freq === 'daily') return false;
    return (r.weekdays || []).length <= 4;
  });
}

const noticeText = (kind, key) => {
  const found = list('notices').find((n) => n.id === noticeId(kind, key));
  return found ? found.text : '';
};

/** 여러 줄을 한 칸에 담을 때 쓰는 줄바꿈 정리 */
const lines = (...xs) => xs.filter((x) => String(x || '').trim()).join('\n');

/** 시간 칸은 좁다. '19:00~21:00' 처럼 긴 것은 물결 앞에서 접는다(실제 문서도 그렇게 적혀 있다). */
const timeCell = (t) => {
  const s = String(t || '').trim();
  return s.length > 7 && s.includes('~') ? s.replace(/\s*~\s*/, '\n~') : s;
};

/** 주요 업무 내용 칸 — 제목 아래에 세부 내용을 '- ' 로 붙인다. */
function workText(a) {
  const head = a.target ? `${a.title}(${a.target})` : a.title;
  const detail = cleanDetail(a.detail)
    .split('\n').map((s) => s.trim()).filter(Boolean)
    .map((s) => (/^[-·•]/.test(s) ? s : `- ${s}`));
  return lines(head, ...detail);
}

// ── 주간활동계획 ────────────────────────────────────────────

/**
 * 그 주 표에 들어갈 하루치 줄들.
 * 기간 일정(교육주간 등)은 시작한 날에 한 번만 적는다. 나흘 내내 같은 줄이 서면
 * 계획표가 아니라 도배가 된다. 저번 주에 시작한 것이면 이 주 첫날에 적는다.
 */
function weekRowsOf(date, from) {
  const out = [];
  const spanTitle = (a) => {
    if (!a.endDate || a.endDate <= a.date) return a.title;
    const e = parseYmd(a.endDate);
    const s = parseYmd(a.date);
    return `${a.title}(~${e.getMonth() === s.getMonth() ? e.getDate() : `${e.getMonth() + 1}.${e.getDate()}`})`;
  };
  for (const a of activitiesOn(date, { onlyApproved: true }).sort(byTime)) {
    const span = a.endDate && a.endDate > a.date;
    if (span && !(a.date === date || (a.date < from && date === from))) continue;
    out.push({
      dept: a.dept, owner: a.owner,
      work: workText({ ...a, title: spanTitle(a) }),
      time: timeCell(describeTime(a) || a.time), place: a.place,
    });
  }
  for (const r of planRecurring(date).sort(byTime)) {
    out.push({ dept: r.dept, owner: r.owner, work: workText(r), time: timeCell(describeTime(r) || r.time), place: r.place });
  }
  // 추석 연휴 같은 공휴일도 한 줄로 넣는다. 그 날이 통째로 빠지면
  // 주간계획을 보는 사람이 '왜 목요일이 없지?' 하게 된다.
  const off = holidayOn(date);
  if (off) out.unshift({ dept: '', owner: '', work: off, time: '', place: '', off: true });
  // 출장은 실제 문서에도 '계 = 출장' 줄로 들어간다. 보결이 필요하면 그것까지 적어야
  // 주간계획을 보는 선생님이 대비할 수 있다.
  for (const t of list('trips')) {
    if (t.status !== 'approved') continue;
    const last = t.endDate || t.date;
    if (!(t.date <= date && date <= last)) continue;
    out.push({
      dept: '출장', owner: t.applicant,
      work: lines(t.reason, t.needsSub ? `- 보결 필요: ${t.subNote || '교시 미기재'}` : ''),
      time: timeCell(t.time), place: t.place,
    });
  }
  return out;
}

// 시간 칸은 '1~4교시' 가 한 줄에, 장소 칸은 '득량남초병설유치원' 이 두 줄 안에 들어가야 한다.
// 사진에서 '1-5교/시' 로 접히고 기관 이름이 잘려 나갔다. 내용 칸에서 그만큼 덜어 온다.
// 글이 들어가는 쪽 너비 (HWPUNIT). hwpx-write.js 의 PAGE_W 에서 좌우 여백을 뺀 값과 같다.
// 여기서 칸마다 몇 글자가 들어가는지 알아야 줄을 끊고 자간을 좁힐 수 있다.
const PAGE_W = 59528;
const USABLE_WEEK = PAGE_W - 2834 * 2;     // 주간: 좌우 10mm
const USABLE_MONTH = PAGE_W - 4251 * 2;    // 월중: 좌우 15mm
const fontPt = () => loadConfig().hwp.fontSize || 11;

const WEEK_COLS = [
  { label: '날짜\n(요일)', w: 8.2 },
  { label: '계', w: 8.6 },
  { label: '담당자', w: 8.6 },
  { label: '주요 업무 내용', w: 46.4, align: 'left' },
  { label: '시간', w: 10.2 },
  { label: '장소', w: 18.0 },
];

/** 주간 표 하나 */
function weekMainTable(from, to) {
  const rows = [];
  let lastDay = '';
  for (const d of range(from, to)) {
    const items = weekRowsOf(d, from);
    if (!items.length) continue;
    lastDay = d;
    const dt = parseYmd(d);
    const label = `${dt.getMonth() + 1}.${dt.getDate()}\n(${WEEKDAY[dt.getDay()]})`;
    const many = items.length > 1;
    const off = !!holidayOn(d);
    items.forEach((it, i) => {
      // 한 요일에 여러 건이면 사이를 점선으로 긋고, 한 칸 걸러 옅게 깐다.
      // 어디까지가 같은 날인지 눈으로 바로 갈라 보라는 뜻이다.
      const dashTop = i > 0;                       // 그 날의 둘째 줄부터
      const dashBottom = i < items.length - 1;     // 그 날의 마지막 줄만 빼고
      const shade = (many && i % 2 === 1) || off;
      const mark = (c) => (typeof c === 'object'
        ? { ...c, dashTop, dashBottom, shade }
        : { t: c, dashTop, dashBottom, shade });
      // 좁은 칸에 한두 글자가 넘치면 자간을 조금 줄여 한 줄에 앉힌다.
      // '정하늘아, 오진영' 이 이름 한가운데서 끊기던 자리다.
      const fit = (text, col) => {
        const f = fitText(text, capEm(USABLE_WEEK, WEEK_COLS[col].w, fontPt()));
        return { t: f.text, tight: f.tight };
      };
      // 이름이 둘이면 '정하늘아, 오진영' 이 '정하늘 / 아, 오진영' 으로 끊겼다.
      // 쉼표에서 끊어 한 줄에 한 사람씩 세운다. 쉼표도 함께 떼어 낸다.
      const fitNames = (text, col) => {
        const cap = capEm(USABLE_WEEK, WEEK_COLS[col].w, fontPt());
        const names = String(text || '').split(/\s*,\s*/).filter(Boolean);
        const f = names.length > 1 ? packItems(names, cap, ', ') : fitText(text, cap);
        return { t: f.text.replace(/,$/gm, ''), tight: f.tight };
      };
      rows.push([
        // 날짜 칸은 그 날 전체를 세로로 덮으니 줄 걸러 깔지 않는다. 공휴일일 때만 깐다.
        ...(i === 0 ? [{ t: label, rowSpan: items.length, shade: off }] : []),
        mark(fit(it.dept || '', 1)),
        mark(fitNames(it.owner || '', 2)),
        mark({ ...fit(it.work, 3), align: 'left' }),
        mark(fit(it.time || '', 4)),
        mark(fit(it.place || '', 5)),
      ]);
    });
  }
  return { cols: WEEK_COLS.map((c) => c.w), head: WEEK_COLS.map((c) => c.label), rows, lastDay };
}

/** 그 주 교담·특별실 시간표 표 */
function weekTimetable(from) {
  const slots = list('timetable').filter((s) => s.week === from && s.title);
  const days = [1, 2, 3, 4, 5];
  const maxP = slots.reduce((m, s) => Math.max(m, Number(s.period) || 0), 0);
  const cell = (d, p) => slots.filter((s) => Number(s.dow) === d && Number(s.period) === p);

  const rows = [];
  for (let p = 1; p <= maxP; p++) {
    rows.push([`${p}교시`, ...days.map((d) => cell(d, p).map((s) => s.title).join('\n'))]);
  }

  // 방과후는 교시가 아니라 시각으로 돌아간다. 시각마다 한 줄씩 붙인다.
  const prog = list('afterschool').filter((p) => p.active !== false);
  const times = [...new Set(prog.map((p) => p.time).filter(Boolean))].sort();
  for (const t of times) {
    rows.push([t, ...days.map((d) => prog
      .filter((p) => (p.weekdays || []).includes(d) && p.time === t)
      .map((p) => p.name).join('\n'))]);
  }

  const joinUniq = (xs) => [...new Set(xs.filter(Boolean))].join(' / ');
  rows.push(['장소', ...days.map((d) => joinUniq(slots.filter((s) => Number(s.dow) === d).map((s) => s.place)))]);
  rows.push(['비고', ...days.map((d) => joinUniq(slots.filter((s) => Number(s.dow) === d).map((s) => s.note)))]);

  const w = 100 / (days.length + 1);
  return {
    cols: [w * 0.7, ...days.map(() => (100 - w * 0.7) / days.length)],
    head: ['', ...days.map((d) => WEEKDAY[d])],
    rows,
    empty: !slots.length && !times.length,
  };
}

/**
 * 주간활동계획 한 부.
 * @returns {{ title:string, blocks:Array }}
 */
export function weeklyForm(from, to, { timetable = true } = {}) {
  const cfg = loadConfig();
  const main = weekMainTable(from, to);
  // 학교 서식은 월~토가 한 주다. 일요일에 일정이 있을 때만 거기까지 늘린다.
  const sat = addDays(from, 5);
  const label = weekLabel(from, main.lastDay > sat ? main.lastDay : sat);
  const tt = weekTimetable(from);
  const notice = noticeText('notice', from);

  const blocks = [
    { kind: 'title', text: `${label} 주요 교육활동` },
    { kind: 'table', table: main },
  ];
  // 비급식일은 학교 서식에 칸이 따로 없다. 칸을 늘리면 결재 서식이 달라지니 표 밑에 한 줄로 적는다.
  const meals = noMealIn(from, addDays(from, 6));
  if (meals) blocks.push({ kind: 'small', text: `※ 비급식일: ${meals}` });
  if (notice) blocks.push({ kind: 'small', text: `※ ${notice.replace(/\n/g, ' ')}` });
  if (timetable && !tt.empty) {
    blocks.push({ kind: 'title', text: `${label} 교과교담` });
    blocks.push({ kind: 'body', text: `${parseYmd(from).getFullYear()}. ${termOf(from)}학기 교담 시간표` });
    blocks.push({ kind: 'table', table: tt });
  }
  return { title: `${label} 주요 교육활동${cfg.school.name ? ` - ${cfg.school.name}` : ''}`, label, blocks };
}

/** 그 주의 비급식일을 '10.2.(금)' 꼴로 이어 붙인다. 없으면 빈 글. */
function noMealIn(from, to) {
  return range(from, to).filter(isNoMeal).map((d) => {
    const dt = parseYmd(d);
    return `${dt.getMonth() + 1}.${dt.getDate()}.(${WEEKDAY[dt.getDay()]})`;
  }).join(', ');
}

// ── 월중(월간) 교육활동계획 ──────────────────────────────────

/** '보건수업(5,6년, 3,2교시, 각 교실)' — 실제 문서의 괄호 차례를 그대로 따른다. */
function monthItemText(a) {
  const bits = [];
  if (a.endDate && a.endDate > a.date) {
    const e = parseYmd(a.endDate);
    const s = parseYmd(a.date);
    bits.push(e.getMonth() === s.getMonth() ? `~${e.getDate()}` : `~${e.getMonth() + 1}.${e.getDate()}`);
  }
  if (a.target) bits.push(a.target);
  const t = describeTime(a) || a.time;
  if (t) bits.push(t);
  if (a.place) bits.push(a.place);
  return bits.length ? `${a.title}(${bits.join(', ')})` : a.title;
}

// 실제 문서 비율(3.5/4.6/81.2/10.8)에서 '요일' 이 두 줄로 접히지 않을 만큼만 넓혔다.
const MONTH_COLS = [3.8, 5.2, 80.2, 10.8];

/**
 * 월중 교육활동계획 한 부.
 * @param {string} first  그 달 1일 (YYYY-MM-01)
 */
export function monthlyForm(first) {
  const cfg = loadConfig();
  const last = monthEnd(first);
  const d0 = parseYmd(first);
  const year = d0.getFullYear();
  const month = d0.getMonth() + 1;

  const aca = list('academic');
  // 학사일정에 넣어 둔 것과, 붙여넣기로 들어와 세부 내용에 붙은 표시를 함께 본다.
  const noMeal = new Set(range(first, last).filter(isNoMeal));
  const stat = aca.find((a) => a.kind === 'stat');
  const monthDays = stat && stat.stats
    ? (stat.stats.months || []).find((m) => m.month === month)
    : null;

  const rows = [];
  for (const d of range(first, last)) {
    const dt = parseYmd(d);
    // 기간 일정은 시작한 날에만 적는다. 문서도 그렇게 쓴다.
    // 기간 일정을 맨 앞에 세운다. 실제 문서도 '양성평등교육주간(~4)' 을 먼저 적는다.
    const span = (a) => (a.endDate && a.endDate > a.date ? 0 : 1);
    const acts = [
      ...activitiesOn(d, { onlyApproved: true }).filter((a) => a.date === d),
      ...planRecurring(d),
    ]
      .sort((x, y) => span(x) - span(y) || byTime(x, y))
      .map((a) => monthItemText(a));
    // 주말(토·일)과 법정공휴일은 옅게 깔아 수업일과 갈라 보이게 한다.
    const off = holidayOn(d);
    const shade = dt.getDay() === 0 || dt.getDay() === 6 || !!off;
    // 공휴일 이름은 학사일정에 없더라도 앞세워 적는다.
    const all = [off && !acts.some((x) => x.startsWith(off)) ? off : '', ...acts].filter(Boolean);
    // 항목을 반으로 자르지 않는다. 자간을 좁혀도 안 들어가면 항목이 시작되는 자리에서
    // 줄을 바꾼다. 여태 '영어원어민 순회(6-5-' 에서 끊기던 것이 이 때문이었다.
    const packed = packItems(all, capEm(USABLE_MONTH, MONTH_COLS[2], fontPt()));
    rows.push([
      { t: String(dt.getDate()), shade },
      { t: WEEKDAY[dt.getDay()], shade },
      { t: packed.text, tight: packed.tight, align: 'left', shade },
      { t: noMeal.has(d) ? '비급식일' : '', shade },
    ]);
  }

  const focus = noticeText('focus', first.slice(0, 7));
  const nDays = monthDays ? monthDays.days : null;
  const nMeal = nDays == null ? null : nDays - range(first, last).filter((d) => noMeal.has(d)).length;

  rows.push([
    // 좁고 긴 칸이라 글자가 멋대로 접힌다. 두 글자씩 끊어 세운다.
    { t: '월별\n교육\n활동\n중점', colSpan: 2, rowSpan: 2 },
    { t: focus, rowSpan: 2, align: 'left' },
    '수업일수 (급식)',
  ]);
  rows.push([nDays == null ? '' : `${nDays}일 (${nMeal}일)`]);

  return {
    title: `${year}년 ${month}월 교육활동계획`,
    label: `${year}년 ${month}월`,
    blocks: [
      { kind: 'banner', text: lines(`${year}년 ${month}월 교육활동계획`, cfg.school.name) },
      { kind: 'table', table: { cols: MONTH_COLS, head: ['일', '요일', '주요 업무 내용', '비고'], rows } },
    ],
  };
}

export { fmtK };
