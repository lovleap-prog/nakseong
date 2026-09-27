// 나이스 일일교육활동 결재용 문구 · 메신저 안내문 생성
import { fmtK, byTime, WEEKDAY, parseYmd, CATEGORY } from '../model.js';
import { describeTime, dayBellId, bellById, defaultBell } from '../conflict.js';
import { isNoMeal } from '../select.js';

const KO_ORDER = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'];
const koIdx = (i) => (i < KO_ORDER.length ? KO_ORDER[i] : `${KO_ORDER[i % 14]}${Math.floor(i / 14) + 1}`);

/** 한 줄 요약: "1~2교시 3학년 안전교육(시청각실, 김민수)" */
export function lineOf(a, { withTime = true } = {}) {
  // 단축·수업공개 시정이면 '3교시 (10:30~11:10)' 처럼 실제 시각까지 적는다.
  // 결재 문서를 보는 사람이 교시만 보고 시각을 잘못 짚으면 안 된다.
  const shown = withTime ? describeTime(a) : '';
  const head = shown ? `${shown} ` : '';
  const who = a.target ? `${a.target} ` : '';
  const meta = [a.place, a.owner].filter(Boolean).join(', ');
  const tail = meta ? `(${meta})` : '';
  return `${head}${who}${a.title}${tail}`.replace(/\s{2,}/g, ' ').trim();
}

/**
 * 나이스 결재 상신용 본문.
 * @param {object} p { date, activities, recurring, afterSchool, school, options }
 */
export function neisApprovalText(p) {
  const { date, activities = [], recurring = [], afterSchool = [] } = p;
  const o = { includeRecurring: true, includeAfterSchool: true, ...(p.options || {}) };
  const school = p.school || {};
  const L = [];

  L.push(`${fmtK(date)} 일일교육활동 계획`);
  const dayBell = bellById(dayBellId(date));
  if (dayBell && dayBell.id !== defaultBell().id) L.push(`※ ${dayBell.name} 운영`);
  // 급식이 없는 날은 기안에 한 줄 적어 둔다. 놓치면 그 날 아이들 점심이 걸린다.
  if (isNoMeal(date)) L.push('※ 비급식일 (급식 미실시)');
  L.push('');

  let sec = 1;
  const sorted = activities.slice().sort(byTime);
  L.push(`${sec}. 교육활동`);
  if (sorted.length) sorted.forEach((a, i) => L.push(`  ${koIdx(i)}. ${lineOf(a)}`));
  else L.push('  가. 특기사항 없음(정규 교육과정 운영)');
  sec++;

  if (o.includeRecurring && recurring.length) {
    L.push('');
    L.push(`${sec}. 상시·반복 운영 활동`);
    recurring.slice().sort(byTime).forEach((a, i) => L.push(`  ${koIdx(i)}. ${lineOf(a)}`));
    sec++;
  }

  if (o.includeAfterSchool && afterSchool.length) {
    L.push('');
    L.push(`${sec}. 방과후학교 (${afterSchool.length}강좌)`);
    afterSchool.slice().sort((x, y) => String(x.time).localeCompare(String(y.time)))
      .forEach((c, i) => L.push(`  ${koIdx(i)}. ${[c.time, c.name].filter(Boolean).join(' ')}` +
        `${[c.room, c.teacher].filter(Boolean).length ? `(${[c.room, c.teacher].filter(Boolean).join(', ')})` : ''}` +
        `${c.grade ? ` / ${c.grade}` : ''}`));
    sec++;
  }

  L.push('');
  L.push(`위와 같이 ${fmtK(date)} 일일교육활동을 실시하고자 합니다.`);
  if (school.name || school.principal) {
    L.push('');
    L.push([school.name, school.principal && `${school.principal} 귀하`].filter(Boolean).join('  '));
  }
  return L.join('\n');
}

/** 교직원 메신저용 안내문 (결재 문구 대체 가능) */
export function messengerText(p) {
  const { date, activities = [], recurring = [], afterSchool = [] } = p;
  const o = { includeRecurring: true, includeAfterSchool: true, ...(p.options || {}) };
  const d = parseYmd(date);
  const L = [];
  L.push(`[일일교육활동 안내] ${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY[d.getDay()]})`);
  const mBell = bellById(dayBellId(date));
  if (mBell && mBell.id !== defaultBell().id) L.push(`※ 오늘은 ${mBell.name} 입니다.`);
  if (isNoMeal(date)) L.push('※ 오늘은 비급식일입니다. (급식 없음)');
  L.push('');
  L.push('▷ 오늘의 교육활동');
  const sorted = activities.slice().sort(byTime);
  if (sorted.length) sorted.forEach((a) => L.push(` • ${lineOf(a)}`));
  else L.push(' • 별도 행사 없음 / 정규 시간표 운영');

  if (o.includeRecurring && recurring.length) {
    L.push('');
    L.push('▷ 상시 운영 활동');
    recurring.slice().sort(byTime).forEach((a) => L.push(` • ${lineOf(a)}`));
  }
  if (o.includeAfterSchool && afterSchool.length) {
    L.push('');
    L.push(`▷ 방과후학교 (${afterSchool.length}강좌)`);
    afterSchool.forEach((c) => L.push(` • ${[c.time, c.name, c.room && `(${c.room})`].filter(Boolean).join(' ')}`));
  }
  const dept = (p.school && p.school.contact) || '';
  if (dept) { L.push(''); L.push(`※ 문의: ${dept}`); }
  return L.join('\n');
}

/** 주간/월간 요약 문구 */
export function periodText(p) {
  const { from, to, days, title } = p; // days: [{date, activities, recurring, afterSchool}]
  const L = [];
  L.push(`${title || '교육활동 계획'} (${fmtK(from, { weekday: false })} ~ ${fmtK(to, { weekday: false, year: false })})`);
  L.push('');
  for (const d of days) {
    const items = d.activities.slice().sort(byTime);
    const rec = (d.recurring || []).slice().sort(byTime);
    if (!items.length && !rec.length && !(d.afterSchool || []).length) continue;
    L.push(`■ ${fmtK(d.date, { year: false })}`);
    items.forEach((a) => L.push(`   - ${lineOf(a)}`));
    rec.forEach((a) => L.push(`   - (상시) ${lineOf(a)}`));
    if ((d.afterSchool || []).length) L.push(`   - (방과후) ${d.afterSchool.map((c) => c.name).join(', ')}`);
    L.push('');
  }
  return L.join('\n').trimEnd();
}

export const categoryLabel = (k) => CATEGORY[k] || '기타';
