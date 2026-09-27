// 화면들이 공통으로 쓰는 조회 함수 모음
import { list } from './store.js';
import { expandRecurring, afterSchoolOn, occursOn, byTime, range, weekStart, dow } from './model.js';
import { findClashes } from './conflict.js';
import { holidayOn } from './lib/holidays.js';

/**
 * 그 날이 비급식일인가. 학사일정 탭에 넣어 둔 것을 본다.
 *
 * 여태 비급식일은 학사일정 화면과 월중계획 한글 문서에만 있었다. 정작 날마다 보는
 * 일일·주간·월간 화면에는 없어서, 급식이 없는 날을 문서를 열어야 알 수 있었다.
 */
export function isNoMeal(date) {
  return list('academic').some((a) => a.kind === 'nomeal' && a.date === date);
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
