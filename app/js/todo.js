// 관리 선생님이 아직 손대지 않은 것들 — 한 자리에서 센다.
//
// 교육활동 승인은 [승인함], 출장은 [출장], 보결은 [일일] 에 흩어져 있었다. 탭마다
// 눌러 보지 않으면 뭔가 올라왔는지 알 수가 없다. 아침에 다섯 군데를 돌 수는 없으니,
// 세는 자리를 하나로 모으고 머리말에서 그 수를 보여 준다.
import { today } from './model.js';
import { list, isAdmin } from './store.js';
import { pendingList } from './select.js';
import { deleteRequests } from './del.js';
import { unassignedCount, unassignedAhead } from './views/subplan.js';

/**
 * 지금 기다리고 있는 것들.
 * @returns [{ key, label, count, tab, hint }]  count 가 0 인 줄은 담지 않는다.
 */
export function todoList() {
  if (!isAdmin()) return [];
  const d = today();
  const acts = pendingList();
  const trips = list('trips').filter((x) => x.status === 'pending');
  const dels = deleteRequests(list('activities'));
  // 오늘 것과 앞으로 보름 안의 것을 함께 센다. 오늘 아침에야 알면 늦다.
  const subs = unassignedCount(d) + unassignedAhead(d).length;

  return [
    { key: 'acts', label: '교육활동 확인 대기', count: acts.length, tab: 'approvals',
      hint: acts.length ? `${acts[0].createdBy || ''} 외 ${acts.length - 1}건`.replace(' 외 0건', '') : '' },
    { key: 'trips', label: '출장 확인 대기', count: trips.length, tab: 'approvals',
      hint: trips.length ? `${trips[0].applicant || ''} 외 ${trips.length - 1}건`.replace(' 외 0건', '') : '' },
    { key: 'dels', label: '삭제 요청', count: dels.length, tab: 'approvals', hint: '' },
    { key: 'subs', label: '보결 미배정', count: subs, tab: 'daily', hint: '오늘과 앞으로 보름' },
  ].filter((x) => x.count > 0);
}

/** 기다리는 것이 모두 몇 건인가 */
export function todoCount() {
  return todoList().reduce((n, x) => n + x.count, 0);
}

/**
 * 머리말의 숫자가 늘었는지 보려고 쓰는 쪽지.
 * 건수만으로는 '하나 승인되고 하나 올라온' 경우를 못 잡아서 종류별로 적어 둔다.
 */
export function todoSnapshot() {
  const m = {};
  for (const x of todoList()) m[x.key] = x.count;
  return m;
}

/** 지난번보다 늘어난 것 (새로 올라온 것). 없으면 빈 배열. */
export function newlyAdded(before, after) {
  const out = [];
  for (const [k, n] of Object.entries(after)) {
    const was = before[k] || 0;
    if (n > was) out.push({ key: k, more: n - was });
  }
  return out;
}

export const TODO_LABEL = {
  acts: '교육활동 확인 요청',
  trips: '출장 신청',
  dels: '삭제 요청',
  subs: '보결 미배정',
};
