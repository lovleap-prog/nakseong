// 주간·월간에서 일정을 끌어다 날짜 옮기기 (마우스 + 손가락)
//
// HTML5 끌어놓기(draggable)는 손가락을 지원하지 않는다. 그래서 포인터 이벤트로
// 직접 구현했다. 마우스와 터치가 같은 코드를 지난다.
//
//   마우스 : 5px 만 움직여도 바로 끌기
//   손가락 : 350ms 꾹 누른 뒤에 끌기. 그 전에 움직이면 '화면 넘기기' 로 보고 손을 뗀다.
//            (바로 끌기로 만들면 목록을 넘길 수가 없다)
//
// 승인 흐름을 건너뛰지 않는 것이 핵심이다.
//   관리자 → 바로 옮기고 이력을 남긴다.
//   교사   → 옮긴 뒤 '확인 대기' 로 되돌려 관리자 승인을 받는다.
//            원래 날짜를 prevDate 에 적어두어, 반려되면 되돌릴 수 있게 한다.
import { toast, confirmDialog } from './lib/dom.js';
import { fmtK, parseYmd, addDays, ymd } from './model.js';
import { get, put, audit, isAdmin, currentUser } from './store.js';

const dayDiff = (from, to) => Math.round((parseYmd(to) - parseYmd(from)) / 864e5);

const LONG_PRESS_MS = 350;   // 손가락으로 꾹 누르는 시간
const SCROLL_SLACK = 10;     // 누르는 동안 이만큼 넘게 움직이면 화면 넘기기로 본다
const MOUSE_SLACK = 5;       // 마우스는 이만큼 움직이면 끌기 시작

/** 이 사람이 이 일정을 옮길 수 있나 */
export function canMove(a) {
  if (!a) return false;
  if (a.canDrag) return true;          // 시간표 칸처럼 스스로 판정을 끝낸 경우
  if (a.isRecurring || a.source === 'recurring') return false;
  return isAdmin() || a.createdBy === currentUser().name;
}

let st = null;   // 끄는 중인 상태

export function makeDraggable(el, a) {
  if (!canMove(a)) return el;
  el.classList.add('is-draggable');
  el.addEventListener('pointerdown', (e) => onDown(e, el, a));
  return el;
}

/**
 * 받는 칸. 실제 판정은 손가락·마우스 위치로 하기 때문에
 * 여기서는 날짜만 표시해 두면 된다.
 */
export function makeDropTarget(el, day) {
  el.dataset.day = day;
  return el;
}

/** 받는 칸으로 인정하는 것들. 날짜 칸과 시간표 칸. */
// 휴지통도 받는 자리다. 여러 개를 골라 끌어다 버릴 수 있게 한다.
const TARGET_SEL = '[data-day],[data-tt-dow],[data-drop-trash]';

function onDown(e, el, a) {
  if (e.button > 0) return;           // 오른쪽·가운데 버튼은 무시
  // 안에 든 단추·입력칸을 눌렀으면 끌기가 아니다. 다만 끌 것 자체가 단추인 경우가 있어
  // (시간표 칸·조각), 그 안의 글자를 눌렀다고 끌기를 접으면 안 된다.
  const hit = e.target.closest('button, input, select, a, textarea');
  if (hit && hit !== el && el.contains(hit)) return;
  cleanup();

  st = {
    a, el, pid: e.pointerId, touch: e.pointerType !== 'mouse',
    x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY,
    started: false, timer: null, target: null, ghost: null, offX: 0, offY: 0,
  };
  if (st.touch) st.timer = setTimeout(() => { if (st && !st.started) begin(); }, LONG_PRESS_MS);

  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  window.addEventListener('keydown', onKey);
  // 끄는 동안 화면이 따라 움직이지 않게 막는다(passive 가 아니어야 막을 수 있다).
  window.addEventListener('touchmove', blockScroll, { passive: false });
  window.addEventListener('contextmenu', blockMenu);
}

function begin() {
  clearTimeout(st.timer);
  st.started = true;
  document.body.classList.add('dragging-now');
  st.el.classList.add('dragging');

  const r = st.el.getBoundingClientRect();
  st.offX = st.x0 - r.left;
  st.offY = st.y0 - r.top;

  const g = st.el.cloneNode(true);
  g.classList.add('drag-ghost');
  g.classList.remove('dragging');
  g.style.width = `${r.width}px`;
  st.ghost = g;
  document.body.appendChild(g);
  placeGhost();

  // 손가락으로 끌기 시작했다는 걸 알려준다
  if (st.touch && navigator.vibrate) { try { navigator.vibrate(10); } catch { /* 지원 안 하면 그만 */ } }
}

function placeGhost() {
  st.ghost.style.transform = `translate(${st.x - st.offX}px, ${st.y - st.offY}px)`;
}

function onMove(e) {
  if (!st || e.pointerId !== st.pid) return;
  st.x = e.clientX;
  st.y = e.clientY;
  const moved = Math.abs(st.x - st.x0) + Math.abs(st.y - st.y0);

  if (!st.started) {
    if (!st.touch) { if (moved > MOUSE_SLACK) begin(); }
    else if (moved > SCROLL_SLACK) { cleanup(); }   // 화면을 넘기려는 것이다
    return;
  }
  e.preventDefault();
  placeGhost();
  markTarget();
}

/** 지금 손가락·커서 아래에 있는 날짜 칸을 찾는다. */
function markTarget() {
  st.ghost.style.visibility = 'hidden';
  const under = document.elementFromPoint(st.x, st.y);
  st.ghost.style.visibility = '';
  const cell = under && under.closest(TARGET_SEL);
  if (cell === st.target) return;
  if (st.target) st.target.classList.remove('drop-on');
  st.target = cell;
  if (cell) cell.classList.add('drop-on');
}

async function onUp(e) {
  if (!st || e.pointerId !== st.pid) return;
  // Ctrl(윈도) · Alt · Cmd 를 누른 채 놓으면 옮기지 않고 복사한다.
  // cleanup() 이 st 를 비우므로 필요한 값은 먼저 꺼내 둔다.
  const copy = !!(e.ctrlKey || e.altKey || e.metaKey);
  const { started, target, a } = st;
  cleanup();
  if (!started || !target) return;
  swallowNextClick();          // 끌고 놓은 뒤 칸이 눌리지 않게
  // 옮기는 방법을 스스로 아는 항목(시간표 칸, 학사일정 줄)은 그쪽에 맡긴다.
  if (a.onDrop) { await a.onDrop(target, { copy }); return; }
  if (target.dataset.day) await moveActivity(a.id, target.dataset.day);
}

function onCancel(e) {
  if (st && e.pointerId !== st.pid) return;
  cleanup();
}

function onKey(e) {
  if (e.key === 'Escape') { cleanup(); toast('옮기기를 취소했습니다.'); }
}

function blockScroll(e) { if (st && st.started) e.preventDefault(); }
function blockMenu(e) { if (st && st.started) e.preventDefault(); }

function cleanup() {
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
  window.removeEventListener('pointercancel', onCancel);
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('touchmove', blockScroll);
  window.removeEventListener('contextmenu', blockMenu);
  if (!st) return;
  clearTimeout(st.timer);
  if (st.ghost) st.ghost.remove();
  if (st.target) st.target.classList.remove('drop-on');
  st.el.classList.remove('dragging');
  document.body.classList.remove('dragging-now');
  st = null;
}

/** 끌어 놓은 직후의 click 한 번을 삼킨다(월간 칸은 버튼이라 날짜가 바뀌어 버린다). */
function swallowNextClick() {
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
  window.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 400);
}

export async function moveActivity(id, toDate) {
  const a = get('activities', id);
  if (!a) return;
  if (!canMove(a)) { toast('이 일정은 옮길 권한이 없습니다.', 'warn'); return; }
  if (a.date === toDate) return;

  const me = currentUser();
  const before = structuredClone(a);
  // 기간 일정은 길이를 유지한 채 통째로 옮긴다.
  const span = a.endDate && a.endDate > a.date ? dayDiff(a.date, a.endDate) : 0;
  const next = {
    ...a,
    date: toDate,
    endDate: span ? addDays(toDate, span) : '',
  };
  const label = `${fmtK(a.date, { year: false })} → ${fmtK(toDate, { year: false })}`;

  if (isAdmin()) {
    next.history = (a.history || []).concat([{
      at: new Date().toISOString(), by: me.name, action: `날짜 이동 ${label}`,
    }]);
    await put('activities', next);
    await audit('날짜이동', a.id, before, next);
    toast(`'${a.title}' 을(를) ${fmtK(toDate, { year: false })} 로 옮겼습니다.`, 'ok');
    return;
  }

  // 교사가 승인된 일정을 옮기면 다시 확인을 받아야 한다.
  const needsApproval = a.status === 'approved';
  if (needsApproval) {
    const ok = await confirmDialog(
      `'${a.title}' 을(를) ${label} 로 옮깁니다.\n이미 승인된 일정이라 관리자 확인을 다시 받습니다.`,
      { okText: '변경 요청' });
    if (!ok) return;
    next.status = 'pending';
    next.prevDate = a.date;
    next.prevEndDate = a.endDate || '';
    next.changeNote = `날짜 변경 요청 ${label}`;
    next.reviewedBy = '';
    next.reviewedAt = '';
  }
  next.history = (a.history || []).concat([{
    at: new Date().toISOString(), by: me.name, action: `날짜 이동 ${label}`,
  }]);
  await put('activities', next);
  await audit(needsApproval ? '날짜변경요청' : '날짜이동', a.id, before, next);
  toast(needsApproval
    ? `변경을 요청했습니다. 관리자 승인 후 반영됩니다.`
    : `${fmtK(toDate, { year: false })} 로 옮겼습니다.`, 'ok');
}

/** 반려됐을 때 날짜 변경 요청을 원래대로 되돌린다. */
export function revertDateChange(a) {
  if (!a.prevDate) return null;
  return {
    ...a,
    date: a.prevDate,
    endDate: a.prevEndDate || '',
    prevDate: '', prevEndDate: '', changeNote: '',
    status: 'approved',   // 원래 승인돼 있던 일정이므로 승인 상태로 되돌린다
  };
}

export { ymd };
