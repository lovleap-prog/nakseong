// 승인함 — 교사 제출 → 확인 대기 → 승인/반려, 관리자의 오기재 수정
import { h, toast, promptDialog, confirmDialog, labeledChips } from '../lib/dom.js';
import { fmtK, STATUS } from '../model.js';
import { pendingList } from '../select.js';
import { put, audit, list, isAdmin, currentUser, remove } from '../store.js';
import { openActivityForm } from '../ui/activityForm.js';
import { activityCard } from './schedule.js';
import { deleteRequests, approveDelete, rejectDelete } from '../del.js';
import { revertDateChange } from '../dragmove.js';

export function renderApprovals(ctx) {
  const pending = pendingList();
  const me = currentUser();
  // 선생님이 승인된 제 일정을 지워 달라고 올린 것. 지우는 것은 관리자가 한다.
  const delReqs = deleteRequests(list('activities'));
  const mine = list('activities')
    .filter((a) => a.createdBy === me.name && a.status !== 'pending')
    .sort((x, y) => String(y.updatedAt || '').localeCompare(String(x.updatedAt || '')))
    .slice(0, 20);

  const refresh = () => ctx.refresh();

  const approveAll = async () => {
    if (!pending.length) return;
    if (!(await confirmDialog(`대기 중인 ${pending.length}건을 모두 승인할까요?`))) return;
    for (const a of pending) await approve(a, me);
    toast(`${pending.length}건을 승인했습니다.`, 'ok');
    refresh();
  };

  return h('div', { class: 'view' },
    h('div', { class: 'datebar' },
      h('div', { class: 'datebar-nav' },
        h('strong', { class: 'datebar-label' }, isAdmin() ? `확인 대기 ${pending.length}건` : '내 제출 현황')),
      h('div', { class: 'datebar-actions' },
        isAdmin() && pending.length
          ? h('button', { class: 'btn btn-primary', onClick: approveAll }, '전체 승인')
          : null)),

    isAdmin() && delReqs.length
      ? h('section', { class: 'sec' },
        h('div', { class: 'sec-head' }, h('h3', {}, `\u{1F5D1} 삭제 요청 ${delReqs.length}건`),
          h('span', { class: 'muted small' }, '지우면 되돌릴 수 없습니다.')),
        ...delReqs.map((a) => delRow(a, refresh)))
      : null,

    isAdmin()
      ? h('section', { class: 'sec' },
        h('div', { class: 'sec-head' }, h('h3', {}, '확인 대기'),
          h('span', { class: 'muted small' }, '내용을 고쳐야 하면 [수정] 후 승인하세요.')),
        ...(pending.length ? pending.map((a) => pendingRow(a, me, refresh)) : [h('div', { class: 'empty' }, '대기 중인 일정이 없습니다.')]))
      : h('section', { class: 'sec' },
        h('div', { class: 'sec-head' }, h('h3', {}, '내가 제출한 대기 건')),
        ...(pending.filter((a) => a.createdBy === me.name).length
          ? pending.filter((a) => a.createdBy === me.name).map((a) => activityCard(a, { onChange: refresh, showStatus: true, showDate: true }))
          : [h('div', { class: 'empty' }, '대기 중인 제출이 없습니다.')])),

    h('section', { class: 'sec' },
      h('div', { class: 'sec-head' }, h('h3', {}, isAdmin() ? '최근 처리 이력' : '내 최근 처리 결과')),
      isAdmin() ? auditTable() : (mine.length
        ? h('div', {}, ...mine.map((a) => activityCard(a, { compact: true, onChange: refresh, showStatus: true, showDate: true })))
        : h('div', { class: 'empty' }, '처리된 내역이 없습니다.'))));
}

/** 삭제 요청 한 줄 — 누가 왜 지워 달라고 했는지 보이고, 지우거나 물린다. */
function delRow(a, refresh) {
  return h('div', { class: 'pending-row' },
    h('div', { class: 'pending-date' }, fmtK(a.date, { year: false })),
    h('div', { class: 'pending-main' },
      h('div', { class: 'card-title-row' },
        h('span', { class: 'card-title' }, a.title),
        a.time ? h('span', { class: 'chip' }, a.time) : null,
        a.endDate ? h('span', { class: 'badge st-span' }, `~ ${fmtK(a.endDate, { year: false })}`) : null),
      labeledChips([['대상', a.target], ['장소', a.place], ['담당', a.owner], ['요청', a.delReqBy || '-']]),
      a.delReqReason ? h('p', { class: 'card-detail' }, `까닭: ${a.delReqReason}`) : null),
    h('div', { class: 'pending-actions' },
      h('button', {
        class: 'btn btn-sm', onClick: async () => {
          const why = await promptDialog('삭제 요청을 물립니다. 까닭을 적어주세요. (요청한 분에게 보입니다)',
            { placeholder: '예) 계획에 이미 실려 있어 그대로 둡니다.' });
          if (why === null) return;
          await rejectDelete(a, why);
          toast('삭제 요청을 물렸습니다.', 'ok');
          refresh();
        },
      }, '요청 물리기'),
      h('button', {
        class: 'btn btn-sm btn-danger', onClick: async () => {
          if (!(await confirmDialog(`"${a.title}" 을 지웁니다. 되돌릴 수 없습니다.`, { danger: true, okText: '지우기' }))) return;
          await approveDelete(a);
          toast('지웠습니다.', 'ok');
          refresh();
        },
      }, '지우기')));
}

function pendingRow(a, me, refresh) {
  return h('div', { class: 'pending-row' },
    h('div', { class: 'pending-date' }, fmtK(a.date, { year: false })),
    h('div', { class: 'pending-main' },
      h('div', { class: 'card-title-row' },
        h('span', { class: 'card-title' }, a.title),
        a.time ? h('span', { class: 'chip' }, a.time) : null),
      labeledChips([['대상', a.target], ['장소', a.place], ['담당', a.owner], ['계', a.dept], ['제출', a.createdBy || '-']]),
      a.source !== 'manual' ? h('div', { class: 'chips' }, h('span', { class: 'chip ghost' }, srcLabel(a.source))) : null,
      a.changeNote ? h('div', {}, h('span', { class: 'change-note' }, a.changeNote)) : null,
      a.detail ? h('p', { class: 'card-detail' }, a.detail) : null,
      a._raw ? h('p', { class: 'card-raw' }, `원문: ${a._raw}`) : null),
    h('div', { class: 'pending-actions' },
      h('button', { class: 'btn btn-sm', onClick: () => openActivityForm(a, { onSaved: refresh }) }, '수정'),
      h('button', {
        class: 'btn btn-sm btn-danger', onClick: async () => {
          const reason = await promptDialog('반려 사유를 적어주세요. (제출자에게 보입니다)', { placeholder: '예) 날짜가 중복됩니다.' });
          if (reason === null) return;
          // 날짜 변경 요청을 반려하면 원래 날짜로 되돌린다.
          // 이미 승인돼 있던 일정이므로 '반려' 로 두면 달력에서 사라져 버린다.
          const reverted = revertDateChange(a);
          const after = reverted
            ? { ...reverted, rejectReason: `날짜 변경 반려: ${reason}`, reviewedBy: me.name, reviewedAt: new Date().toISOString() }
            : { ...a, status: 'rejected', rejectReason: reason, reviewedBy: me.name, reviewedAt: new Date().toISOString() };
          await put('activities', after);
          await audit(reverted ? '날짜변경반려' : '반려', a.id, a, after);
          toast(reverted ? '날짜를 원래대로 되돌렸습니다.' : '반려 처리했습니다.', 'ok');
          refresh();
        },
      }, '반려'),
      h('button', {
        class: 'btn btn-sm btn-primary', onClick: async () => {
          await approve(a, me);
          toast('승인했습니다.', 'ok');
          refresh();
        },
      }, '승인')));
}

async function approve(a, me) {
  const after = {
    ...a, status: 'approved', rejectReason: '',
    prevDate: '', prevEndDate: '', changeNote: '',   // 변경 요청이 받아들여졌으니 흔적을 지운다
    reviewedBy: me.name, reviewedAt: new Date().toISOString(),
  };
  await put('activities', after);
  await audit('승인', a.id, a, after);
}

function srcLabel(s) {
  return { hwpx: 'HWPX 업로드', xlsx: '엑셀 업로드', csv: 'CSV 업로드', text: '붙여넣기', recurring: '반복' }[s] || s;
}

function auditTable() {
  const rows = list('audit')
    .slice().sort((x, y) => String(y.at).localeCompare(String(x.at)))
    .slice(0, 40);
  if (!rows.length) return h('div', { class: 'empty' }, '이력이 없습니다.');
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, ...['시각', '처리자', '작업', '대상'].map((t) => h('th', {}, t)))),
      h('tbody', {}, ...rows.map((r) => h('tr', {},
        h('td', { class: 'nowrap' }, new Date(r.at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })),
        h('td', {}, r.by),
        h('td', {}, h('span', { class: `badge ${badgeCls(r.action)}` }, r.action)),
        h('td', {}, (r.after && r.after.title) || (r.before && r.before.title) || r.targetId))))));
}

function badgeCls(action) {
  if (action === '승인') return STATUS.approved.cls;
  if (action === '반려' || action === '삭제') return STATUS.rejected.cls;
  return STATUS.pending.cls;
}

export { remove };
