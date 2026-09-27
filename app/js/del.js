// 일정 지우기 — 관리자는 바로, 선생님은 관리자 확인을 거쳐서.
//
// 여태 카드의 ✕ 는 곧바로 지웠다. 관리자는 그래도 되지만 선생님이 이미 승인된
// 제 일정을 지우려 하면 서버 규칙이 막아서, 눌러도 아무 일이 없는 것처럼 보였다.
// 그래서 세 갈래로 나눈다.
//   관리자        → 바로 지운다
//   본인 · 대기 중 → 아직 아무 계획에도 안 실렸으니 바로 지운다
//   본인 · 승인됨  → '삭제 요청' 을 달아 두고 관리자가 승인함에서 처리한다
import { toast, confirmDialog, promptDialog } from './lib/dom.js';
import { put, remove, audit, currentUser, isAdmin } from './store.js';

export const canDelete = (a) => !a.isRecurring && (isAdmin() || a.createdBy === currentUser().name);

/** 지워지거나 요청이 올라가면 true. 취소하면 false. */
export async function deleteOrRequest(a, onChange) {
  const me = currentUser();
  const mine = a.createdBy === me.name;

  // 이미 요청해 둔 것을 다시 누르면 요청을 거둔다.
  if (a.delReq && !isAdmin()) {
    if (!mine) return false;
    if (!(await confirmDialog(`"${a.title}" 의 삭제 요청을 거둘까요?`))) return false;
    await put('activities', { ...a, delReq: false, delReqBy: '', delReqAt: '', delReqReason: '' });
    await audit('삭제요청취소', a.id, a, null);
    toast('삭제 요청을 거뒀습니다.', 'ok');
    if (onChange) onChange();
    return true;
  }

  if (isAdmin() || (mine && a.status === 'pending')) {
    if (!(await confirmDialog(`"${a.title}" 일정을 지울까요?`, { danger: true, okText: '지우기' }))) return false;
    await audit('삭제', a.id, a, null);
    await remove('activities', a.id);
    toast('지웠습니다.', 'ok');
    if (onChange) onChange();
    return true;
  }

  if (!mine) return false;

  const reason = await promptDialog(
    `"${a.title}" 은 이미 승인된 일정입니다. 관리자에게 삭제를 요청합니다. 까닭을 적어주세요.`,
    { placeholder: '예) 잘못 올렸습니다 / 행사가 취소됐습니다' });
  if (reason === null) return false;
  const after = {
    ...a, delReq: true, delReqBy: me.name,
    delReqAt: new Date().toISOString(), delReqReason: reason,
  };
  await put('activities', after);
  await audit('삭제요청', a.id, a, after);
  toast('삭제를 요청했습니다. 관리자가 확인하면 지워집니다.', 'ok');
  if (onChange) onChange();
  return true;
}

/** 관리자가 삭제 요청을 받아들인다. */
export async function approveDelete(a) {
  await audit('삭제승인', a.id, a, null);
  await remove('activities', a.id);
}

/** 관리자가 삭제 요청을 물린다. 일정은 그대로 남는다. */
export async function rejectDelete(a, why) {
  const me = currentUser();
  const after = {
    ...a, delReq: false, delReqBy: '', delReqAt: '',
    delReqReason: '', delRejectReason: why || '',
    reviewedBy: me.name, reviewedAt: new Date().toISOString(),
  };
  await put('activities', after);
  await audit('삭제요청반려', a.id, a, after);
}

/** 삭제 요청이 올라온 것들 — 승인함에서 쓴다. */
export const deleteRequests = (rows) => rows.filter((a) => a.delReq);

/** 카드 ✕ 단추에 붙일 설명. 누르면 무슨 일이 생기는지 미리 알려준다. */
export function delTitle(a) {
  if (a.delReq) return isAdmin() ? '삭제 요청이 올라온 일정입니다' : '삭제 요청을 거둡니다';
  if (isAdmin() || a.status === 'pending') return '지우기';
  return '삭제 요청 (관리자 확인 후 지워집니다)';
}
