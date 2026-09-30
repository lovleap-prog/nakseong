// 화면들이 공통으로 쓰는 조회 함수 모음
import { list } from './store.js';
import { expandRecurring, afterSchoolOn, occursOn, byTime, range, weekStart, dow } from './model.js';
import { findClashes } from './conflict.js';
import { holidayOn } from './lib/holidays.js';

// '비급식일' 을 뜻하는 말들. 학교마다 적는 말이 조금씩 다르다.
const NOMEAL_RE = /^(비급식일?|급식\s*없음|급식\s*미실시|급식\s*안\s*함)$/;

/**
 * 세부 내용에 섞여 들어온 '비급식일' 표시를 떼어낸다.
 *
 * 월중 시트의 비급식일 칸은 그 날 **줄마다** 붙어 들어온다. 그래서 그 날 일정이
 * 셋이면 카드 아래에 '비급식일' 이 세 번 적혔다. 급식이 없는 것은 일정마다가 아니라
 * 그 날의 성격이니, 표시는 날 단위로 올리고 세부 내용에서는 지운다.
 *
 * @returns {{ text: string, noMeal: boolean }}
 */
export function splitNoMeal(text) {
  let noMeal = false;
  const kept = String(text || '').split(/\r?\n/).map((line) => line
    .split(/\s*[,·]\s*/)
    .filter((piece) => {
      if (!NOMEAL_RE.test(piece.trim())) return true;
      noMeal = true;
      return false;
    })
    .join(', ')
    .trim())
    .filter(Boolean);
  return { text: kept.join('\n'), noMeal };
}

/** 화면·문서에 내보낼 세부 내용 (비급식일 표시를 뺀 것) */
export const cleanDetail = (text) => splitNoMeal(text).text;

/**
 * 그 날이 비급식일인가.
 *
 * 학사일정 탭에 넣어 둔 것을 먼저 보고, 없으면 그 날 일정의 세부 내용에 붙어 온
 * 표시를 본다. 붙여넣기로 들어온 자료는 학사일정을 거치지 않기 때문이다.
 *
 * 여태 비급식일은 학사일정 화면과 월중계획 한글 문서에만 있었다. 정작 날마다 보는
 * 일일·주간·월간 화면에는 없어서, 급식이 없는 날을 문서를 열어야 알 수 있었다.
 */
export function isNoMeal(date) {
  if (list('academic').some((a) => a.kind === 'nomeal' && a.date === date)) return true;
  // 기간 일정에는 붙이지 않는다. 시작한 날 하루만 급식이 없는 경우가 대부분이다.
  // 달력은 42칸을 한 번에 그리므로, 쪼개 보기 전에 '급식' 이 들어 있는지부터 본다.
  return list('activities').some((a) => a.date === date && a.status !== 'rejected'
    && String(a.detail || '').includes('급식') && splitNoMeal(a.detail).noMeal);
}

export function activitiesOn(date, { onlyApproved = false } = {}) {
  return list('activities')
    .filter((a) => occursOn(a, date))
    .filter((a) => (onlyApproved ? a.status === 'approved' : a.status !== 'rejected'))
    .sort(byTime);
}

export function pendingList() {
  return list('activities')
    .filter((a) => a.status === 'pending')
    .sort((x, y) => (x.date === y.date ? byTime(x, y) : x.date.localeCompare(y.date)));
}

/**
 * 그 날 도는 반복일정.
 * 공휴일·휴업일에는 내보내지 않는다. 추석에 아침 독서활동이 잡혀 있으면
 * 계획표가 틀린 것이고, 중복 판정까지 함께 어긋난다.
 */
export function recurringOn(date) {
  if (holidayOn(date)) return [];
  return expandRecurring(list('recurring'), date, date).sort(byTime);
}

export function afterSchoolFor(date) {
  return afterSchoolOn(list('afterschool'), date)
    .sort((a, b) => String(a.time).localeCompare(String(b.time)));
}

/** 결재문구·내보내기에 쓰는 하루치 묶음 */
export function dayBundle(date, { onlyApproved = true } = {}) {
  return {
    date,
    activities: activitiesOn(date, { onlyApproved }),
    recurring: recurringOn(date).filter((r) => r.includeInNeis !== false),
    afterSchool: afterSchoolFor(date),
  };
}

export function periodBundle(from, to, opt = {}) {
  return range(from, to).map((d) => dayBundle(d, opt));
}

/** 내가 낸 확인 대기 건수. 교사의 [내 제출] 탭 숫자로 쓴다(그 탭에 보이는 것과 같은 수). */
export function myPendingCount(name) {
  if (!name) return 0;
  return list('activities').filter((a) => a.status === 'pending' && a.createdBy === name).length;
}

/** 그 날 그 주 시간표에 잡힌 칸들 (교과교담·특별실) */
export function timetableOn(date) {
  const wk = weekStart(date);
  const d = dow(date);
  return list('timetable')
    .filter((s) => s.week === wk && Number(s.dow) === d && s.title)
    .sort((a, b) => a.period - b.period);
}

/**
 * 그 날 '자리를 차지하는' 모든 것. 중복 판정은 이 목록 위에서 한다.
 * 교육활동만 보면 시간표와의 충돌을 놓친다.
 */
export function occupancyOn(date) {
  const acts = activitiesOn(date, { onlyApproved: false })
    .map((a) => ({ ...a, kind: 'activity' }));
  const recs = recurringOn(date).map((a) => ({ ...a, kind: 'recurring' }));
  const slots = timetableOn(date).map((s) => ({
    ...s, kind: 'timetable',
    time: `${s.period}교시`,
    id: `tt_${s.id}`,
  }));
  return [...acts, ...recs, ...slots];
}

/** 그 날의 중복 목록. Map(id → [{other, why}]) */
export function clashesOn(date) {
  return findClashes(occupancyOn(date));
}

/** 그 날 중복이 몇 건인지(항목 수 기준) */
export function clashCountOn(date) {
  return clashesOn(date).size;
}
