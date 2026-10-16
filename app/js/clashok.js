// 중복 인정 — '겹쳐도 되는 것' 에 붙이는 표시를 저장한다.
//
// 같은 시간에 여러 교육활동이 함께 도는 날이 있다. 인성교육주간 알뜰장터를 열면서
// 그 옆에서 독도교육 무브퀴즈를 하는 것처럼, 장소와 학년이 겹쳐도 그렇게 하기로
// 정한 것들이다. 그런데 화면에는 빨간 테두리가 둘러져서 '잘못 들어간 일정' 으로
// 읽힌다. 보는 선생님마다 관리 선생님께 다시 여쭤보게 되는 것이 이 기능의 이유다.
//
// 표시는 짝(둘) 단위다. 한 항목을 통째로 '중복 안 봄' 으로 두면, 정말 어긋난 일정이
// 나중에 그 자리에 들어와도 조용히 넘어가 버린다.
import { list, get, put, audit, isAdmin } from './store.js';
import { clashOkIds } from './conflict.js';

/**
 * 이 id 를 가진 것이 어느 문서인가.
 *
 * 중복 판정은 교육활동·반복일정·시간표 칸을 한 줄에 세워 놓고 본다(select.js 의
 * occupancyOn). 그래서 인정 표시도 세 군데 중 어디든 적힐 수 있다.
 *   교육활동   act_1234            → activities
 *   반복일정   rec_12@2026-10-16   → recurring  (그 날로 펼쳐 놓은 것이라 날짜가 붙는다)
 *   시간표 칸  tt_slt_5678         → timetable  ('tt_' 를 앞에 더 붙여 둔다)
 */
export function locate(id) {
  const s = String(id || '');
  if (s.startsWith('tt_')) return { col: 'timetable', docId: s.slice(3) };
  const at = s.indexOf('@');
  if (at > 0) {
    const ruleId = s.slice(0, at);
    if (list('recurring').some((r) => r.id === ruleId)) return { col: 'recurring', docId: ruleId };
  }
  return { col: 'activities', docId: s };
}

/** 인정 표시를 적어 둘 문서 한 건. 못 찾으면 null. */
function docOf(id) {
  const { col, docId } = locate(id);
  const doc = get(col, docId);
  return doc ? { col, doc } : null;
}

/** 인정 표시를 적을 수 있는 항목인가(문서가 남아 있는가). */
export const canAck = (id) => isAdmin() && !!docOf(id);

/**
 * 중복 인정 — 이 항목이 지금 겹치고 있는 상대들을 '그래도 된다' 고 적는다.
 *
 * 상대 쪽 문서는 건드리지 않는다. 판정은 양쪽을 다 보므로 한 곳에 적으면 충분하고,
 * 둘 다 적어 두면 나중에 한쪽만 지워졌을 때 어느 쪽이 맞는지 알 수 없게 된다.
 *
 * @param {string} id        인정 단추를 누른 항목의 id
 * @param {string[]} others  그 항목이 겹치고 있는 상대들의 id
 */
export async function ackClash(id, others) {
  const t = docOf(id);
  if (!t) throw new Error('이 항목을 찾을 수 없습니다. 화면을 새로 고쳐 주세요.');
  const add = (others || []).filter(Boolean);
  const next = { ...t.doc, clashOk: [...new Set([...clashOkIds(t.doc), ...add])] };
  if (next.clashOk.length === clashOkIds(t.doc).length) return t.doc;
  await put(t.col, next);
  await audit('중복인정', t.doc.id, t.doc, next);
  return next;
}

/**
 * 인정 되돌리기 — 다시 빨갛게 뜨게 한다.
 * 표시가 어느 쪽에 적혀 있는지 모르므로 양쪽에서 지운다.
 */
export async function unackClash(id, others) {
  const drop = new Set((others || []).filter(Boolean));
  for (const [mine, theirs] of [[id, drop], ...[...drop].map((o) => [o, new Set([id])])]) {
    const t = docOf(mine);
    if (!t) continue;
    const kept = clashOkIds(t.doc).filter((x) => !theirs.has(x));
    if (kept.length === clashOkIds(t.doc).length) continue;
    const next = { ...t.doc, clashOk: kept };
    await put(t.col, next);
    await audit('중복인정해제', t.doc.id, t.doc, next);
  }
}
