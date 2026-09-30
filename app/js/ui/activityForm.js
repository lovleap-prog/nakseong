// 일정 입력/수정 모달. 교사가 쓰면 '확인 대기', 관리자가 쓰면 바로 승인 가능.
import { h, openModal, toast, confirmDialog } from '../lib/dom.js';
import { CATEGORY, STATUS, newActivity, today, fmtK, parseYmd, range } from '../model.js';
import { put, audit, currentUser, isAdmin } from '../store.js';
import { bellList, clashReasons } from '../conflict.js';
import { hilitePicker } from './hilite.js';
import { holidayOn } from '../lib/holidays.js';
import { occupancyOn } from '../select.js';

const field = (label, input, hint) =>
  h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input,
    hint ? h('span', { class: 'field-hint' }, hint) : null);

export function openActivityForm(existing, { onSaved, defaultDate } = {}) {
  const isNew = !existing;
  const a = existing ? structuredClone(existing) : newActivity({ date: defaultDate || today() });
  const before = existing ? structuredClone(existing) : null;
  const me = currentUser();

  const inp = {};
  const mk = (key, attrs = {}) => (inp[key] = h('input', { class: 'input', value: a[key] || '', ...attrs }));
  // 새로 쓸 때 담당·부서는 내 이름·부서로 미리 채운다. 비워 두면 어차피 내 이름으로 저장되는데,
  // 칸에 안 보이니 선생님마다 매번 제 이름을 다시 치고 있었다.
  if (isNew) { a.owner = a.owner || me.name || ''; a.dept = a.dept || me.dept || ''; }

  const catSel = h('select', { class: 'input' },
    ...Object.entries(CATEGORY).map(([k, v]) =>
      h('option', { value: k, selected: a.category === k }, v)));
  const detail = h('textarea', { class: 'input', rows: 3 });
  detail.value = a.detail || '';

  const statusSel = h('select', { class: 'input' },
    ...Object.values(STATUS).map((s) =>
      h('option', { value: s.key, selected: a.status === s.key }, s.label)));

  // 수업공개처럼 그 학년만 다른 시정으로 움직이는 활동을 위한 칸.
  // 비워두면 그 날짜의 시정을 따른다.
  const bells = bellList();
  const bellSel = h('select', { class: 'input' },
    h('option', { value: '' }, '그 날 시정 따름'),
    ...bells.map((b) => h('option', { value: b.id, selected: a.bellId === b.id }, b.name)));

  // 배차 — 차를 불러야 하는 활동은 교무행정사가 미리 신청해야 한다.
  // 체크만 하고 내용을 비우면 정작 신청할 때 다시 물어봐야 하므로 칸을 같이 연다.
  const busChk = h('input', { type: 'checkbox', checked: !!a.needsBus });
  const busNote = h('input', {
    class: 'input', value: a.busNote || '',
    placeholder: '예) 9:00 출발, 순천만생태교육문화원, 3~4학년 48명',
  });
  const busWrap = h('div', { class: 'sub-field' },
    h('span', { class: 'field-label' }, '배차 내용'), busNote,
    h('span', { class: 'field-hint' }, '출발 시각 · 가는 곳 · 인원을 적어주세요.'));
  const syncBus = () => { busWrap.style.display = busChk.checked ? '' : 'none'; };
  busChk.addEventListener('change', syncBus);
  setTimeout(syncBus, 0);
  const busBox = h('div', { class: 'bus-box' },
    h('label', { class: 'check' }, busChk, '\u{1F68C} 배차가 필요합니다'),
    busWrap);

  // 음영 강조 — 관리자만. 여느 일정과 달리 눈여겨볼 것에 바탕색을 깐다.
  let hl = a.hl || '';
  // field() 는 <label> 이라 안에 든 단추가 두 번 눌린다(레이블이 제 컨트롤로 클릭을 또 보낸다).
  // 색이 켜졌다 바로 꺼져 버려서, 여기서는 label 을 쓰지 않고 칸을 직접 짠다.
  const hlBox = isAdmin()
    ? h('div', { class: 'span2 field' },
      h('span', { class: 'field-label' }, '음영 강조'),
      hilitePicker(hl, (k) => { hl = k; }),
      h('span', { class: 'field-hint' },
        '주간·일일 화면에서 이 일정에 바탕색이 깔립니다. 늘 있는 일정에 묻히지 않게 할 때 쓰세요.'))
    : null;

  // 여러 날 이어지는 일정은 드물다. 종료일 칸은 켤 때만 연다.
  const multiChk = h('input', { type: 'checkbox', checked: !!a.endDate });
  const endWrap = h('div', { class: 'span2 sub-field' });
  const syncMulti = () => { endWrap.style.display = multiChk.checked ? '' : 'none'; };
  multiChk.addEventListener('change', syncMulti);

  // 쉬는 날·겹침을 제출 전에 알려 준다. 막지는 않는다(쉬는 날 돌봄·방과후를 적는 학교가 있다).
  const warnBox = h('div', { class: 'span2 form-warn', role: 'status', 'aria-live': 'polite' });

  // 활동명을 맨 위에 둔다. '무엇을' 이 먼저 떠오르는데 날짜·종료일·시간·분류를 지나야 나왔다.
  const body = h('div', { class: 'form-grid' },
    h('div', { class: 'span2' }, field('활동명 *', mk('title', { placeholder: '예) 3학년 소방안전교육' }))),
    field('날짜 *', mk('date', { type: 'date' })),
    field('시간/교시', mk('time', { placeholder: '예) 3교시, 10:00~11:40, 아침활동' })),
    h('label', { class: 'check span2' }, multiChk, '여러 날 이어집니다'),
    (endWrap.append(field('종료일', mk('endDate', { type: 'date' }))), endWrap),
    warnBox,
    field('대상', mk('target', { placeholder: '예) 3학년, 전교생' })),
    field('장소', mk('place', { placeholder: '예) 시청각실' })),
    field('담당', mk('owner', { placeholder: '예) 김민수' })),
    field('부서/계', mk('dept', { placeholder: '예) 교무기획부' })),
    field('분류', catSel),
    bells.length > 1
      ? h('div', { class: 'span2' }, field('시정', bellSel,
        '수업공개처럼 이 활동만 다른 시정으로 움직일 때 고르세요. 비워두면 그 날 시정을 따릅니다.'))
      : null,
    h('div', { class: 'span2' }, field('세부 내용', detail)),
    hlBox,
    h('div', { class: 'span2' }, busBox),
    isAdmin() ? h('div', { class: 'span2' }, field('처리 상태', statusSel, '관리자만 변경할 수 있습니다.')) : null,
  );

  // 적은 것이 있는지 본다. 빈 창을 닫을 때까지 물어보면 그것대로 성가시다.
  const snapshot = () => JSON.stringify([...Object.keys(inp).map((k) => inp[k].value), detail.value,
    catSel.value, bellSel.value, busChk.checked, busNote.value, multiChk.checked, hl]);
  let saved = false;
  const at0 = snapshot();

  const close = openModal(isNew ? '교육활동 추가' : '교육활동 수정', body, [
    { label: '취소', onClick: (c) => c() },
    {
      label: isNew ? (isAdmin() ? '등록' : '제출(확인 요청)') : '저장',
      class: 'btn-primary',
      onClick: async (c) => {
        const val = (k) => (inp[k] ? inp[k].value.trim() : '');
        if (!val('date')) return toast('날짜를 입력해 주세요.', 'warn');
        if (!val('title')) return toast('활동명을 입력해 주세요.', 'warn');
        if (busChk.checked && !busNote.value.trim()) {
          return toast('배차 내용을 적어주세요. 출발 시각과 가는 곳이 있어야 신청할 수 있습니다.', 'warn');
        }

        Object.assign(a, {
          date: val('date'),
          endDate: multiChk.checked && val('endDate') > val('date') ? val('endDate') : '',
          time: val('time'), title: val('title'),
          target: val('target'), place: val('place'),
          owner: val('owner') || (isNew ? me.name : a.owner),
          dept: val('dept') || (isNew ? me.dept : a.dept),
          category: catSel.value,
          detail: detail.value.trim(),
          bellId: bellSel.value,
          needsBus: busChk.checked,
          busNote: busChk.checked ? busNote.value.trim() : '',
          // 강조는 관리자만 고른다. 교사가 고친 것은 그대로 둔다.
          hl: isAdmin() ? hl : (a.hl || ''),
        });

        if (isNew) {
          a.createdBy = me.name;
          a.status = isAdmin() ? 'approved' : 'pending';
          if (isAdmin()) { a.reviewedBy = me.name; a.reviewedAt = new Date().toISOString(); }
        } else if (isAdmin()) {
          if (statusSel.value !== a.status) {
            a.status = statusSel.value;
            a.reviewedBy = me.name;
            a.reviewedAt = new Date().toISOString();
          }
          // 관리자의 오기재 수정 이력
          a.history = (a.history || []).concat([{
            at: new Date().toISOString(), by: me.name, action: '수정',
          }]);
        }

        await put('activities', a);
        await audit(isNew ? '등록' : '수정', a.id, before, a);
        saved = true;
        toast(isNew ? (isAdmin() ? '등록했습니다.' : '제출했습니다. 관리자 확인을 기다립니다.') : '저장했습니다.', 'ok');
        c();
        if (onSaved) onSaved(a);
      },
    },
  ], {
    confirmClose: async () => saved || snapshot() === at0
      || confirmDialog('적으신 내용이 저장되지 않았습니다. 창을 닫을까요?', { danger: true, okText: '닫기' }),
  });
  // 날짜·시간·장소·대상·담당이 바뀔 때마다 다시 본다.
  const checkAhead = () => {
    const date = inp.date.value;
    const lines = [];
    if (date) {
      const last = multiChk.checked && inp.endDate.value > date ? inp.endDate.value : date;
      const days = range(date, last);
      const offs = days.map((d) => [d, holidayOn(d)]).filter(([, n]) => n);
      for (const [d, n] of offs.slice(0, 3)) lines.push(`${fmtK(d, { year: false })}은 ${n}입니다.`);
      if (offs.length > 3) lines.push(`그 밖에도 쉬는 날이 ${offs.length - 3}일 더 있습니다.`);
      const w = parseYmd(date).getDay();
      if (!offs.length && days.length === 1 && (w === 0 || w === 6)) {
        lines.push(`${fmtK(date, { year: false })}은 주말입니다.`);
      }
      // 겹침은 그 날 화면에서 빨갛게 뜨는 것과 같은 기준으로 본다(시간 + 담당·장소·학년).
      const cand = {
        id: a.id, date, time: inp.time.value.trim(), bellId: bellSel.value,
        place: inp.place.value.trim(), target: inp.target.value.trim(), owner: inp.owner.value.trim(),
      };
      if (cand.time) {
        const hits = occupancyOn(date)
          .filter((o) => o.id !== a.id)
          .map((o) => [o, clashReasons(cand, o)])
          .filter(([, why]) => why.length);
        for (const [o, why] of hits.slice(0, 3)) {
          // 조사(와/과)는 앞 글자 받침에 따라 달라서 붙이지 않는다.
          lines.push(`겹침 · ${o.time ? `${o.time} ` : ''}${o.title} (${why.join(', ')})`);
        }
        if (hits.length > 3) lines.push(`그 밖에도 ${hits.length - 3}건이 겹칩니다.`);
      }
    }
    warnBox.replaceChildren(...lines.map((t) => h('p', {}, '\u26A0 ', t)));
    warnBox.hidden = !lines.length;
  };
  for (const el of [inp.date, inp.endDate, inp.time, inp.place, inp.target, inp.owner, bellSel, multiChk]) {
    el.addEventListener('input', checkAhead);
    el.addEventListener('change', checkAhead);
  }
  syncMulti();
  checkAhead();

  setTimeout(() => inp.title && inp.title.focus(), 40);
  return close;
}
