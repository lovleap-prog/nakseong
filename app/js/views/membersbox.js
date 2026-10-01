// 명단 관리 — 로그인한 사람을 승인하고 역할을 준다. 관리자만 보인다.
//
// 선생님들이 개인 지메일·다음 메일을 쓰는 학교가 많다. 그러면 구글 도메인으로
// 문을 막을 수가 없어서, 주소를 아는 사람이 아무 계정으로 들어와 출장 사유와
// 업무분장까지 다 보게 된다. 그래서 여기서 한 사람씩 승인한다.
import { h, toast, confirmDialog } from '../lib/dom.js';
import { list, setMember, currentUser, backendKind } from '../store.js';

const fmtWhen = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
};

export function membersBox(ctx) {
  if (backendKind() !== 'firestore') {
    return h('p', { class: 'note' },
      '이 컴퓨터에만 저장하는 방식이라 명단이 없습니다. ',
      '학교 전체가 함께 쓰려면 Firebase 로 바꾸세요.');
  }

  const me = currentUser();
  const rows = list('members').slice().sort((a, b) => {
    // 기다리는 사람이 맨 위. 매번 찾아 헤매지 않도록.
    if (!!a.approved !== !!b.approved) return a.approved ? 1 : -1;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  const waiting = rows.filter((r) => !r.approved);

  const change = async (m, patch, msg) => {
    try {
      await setMember(m.id, patch);
      toast(msg, 'ok');
      ctx.refresh();
    } catch (e) {
      console.error(e);
      toast('바꾸지 못했습니다: ' + (e.message || ''), 'warn');
    }
  };

  const row = (m) => {
    const isMe = m.id === me.uid;
    return h('tr', { class: m.approved ? '' : 'mem-wait' },
      h('td', {}, h('b', {}, m.name || '(이름 없음)'), isMe ? h('span', { class: 'chip chip-me' }, '나') : null),
      h('td', { class: 'mono small' }, m.email || ''),
      h('td', {}, m.dept || ''),
      // 담임 학급. 보결을 정할 때 '1학년' 이 누구 반인지 알려면 이것이 있어야 한다.
      h('td', {}, h('input', {
        class: 'input input-sm', value: m.homeroom || '', placeholder: '예) 1학년',
        title: '담임 학급. 보결을 정할 때 그 반이 누구 반인지 알려 줍니다.',
        onChange: (e) => change(m, { homeroom: e.target.value.trim() },
          e.target.value.trim() ? `${m.name || ''} — ${e.target.value.trim()} 담임으로 적었습니다.` : '담임 학급을 비웠습니다.'),
      })),
      h('td', {}, m.approved
        ? h('span', { class: 'chip chip-ok' }, '승인됨')
        : h('span', { class: 'chip chip-wait' }, '대기')),
      h('td', {}, m.role === 'admin'
        ? h('span', { class: 'chip chip-admin' }, '관리자')
        : (m.canNotice ? h('span', { class: 'chip chip-notice' }, '공지') : '교사')),
      h('td', { class: 'small muted' }, fmtWhen(m.joinedAt)),
      h('td', { class: 'row gap nowrap' },
        m.approved
          ? h('button', {
              class: 'btn btn-sm',
              disabled: isMe,
              title: isMe ? '자기 자신은 내릴 수 없습니다' : '',
              onClick: async () => {
                const ok = await confirmDialog(
                  `${m.name || m.email} 님의 승인을 취소할까요? 그 즉시 학교 자료가 보이지 않습니다.`,
                  { okText: '승인 취소', danger: true });
                if (ok) await change(m, { approved: false }, '승인을 취소했습니다.');
              },
            }, '승인 취소')
          : h('button', {
              class: 'btn btn-sm btn-primary',
              onClick: () => change(m, { approved: true }, `${m.name || m.email} 님을 승인했습니다.`),
            }, '승인'),
        m.approved
          ? h('button', {
              class: 'btn btn-sm',
              disabled: isMe,
              title: isMe ? '자기 자신의 역할은 바꿀 수 없습니다' : '',
              onClick: () => change(m,
                { role: m.role === 'admin' ? 'teacher' : 'admin' },
                m.role === 'admin' ? '교사로 바꿨습니다.' : '관리자로 바꿨습니다.'),
            }, m.role === 'admin' ? '교사로' : '관리자로')
          : null,
        // 관리자가 아니어도 공지는 쓰게 할 수 있다. 교무행정사가 공문 접수·
        // 안내장 수합을 담임께 알리는 일은 그분이 하는 게 맞다.
        m.approved && m.role !== 'admin'
          ? h('button', {
              class: `btn btn-sm${m.canNotice ? ' on' : ''}`,
              title: m.canNotice
                ? '공지 권한을 거둡니다'
                : '이 분도 공지를 쓸 수 있게 합니다 (일정 승인 권한은 주지 않습니다)',
              onClick: () => change(m, { canNotice: !m.canNotice },
                m.canNotice ? '공지 권한을 거뒀습니다.' : '공지를 쓸 수 있게 했습니다.'),
            }, m.canNotice ? '공지 끄기' : '공지 권한')
          : null));
  };

  return h('div', {},
    h('p', { class: 'note' },
      '처음 로그인한 분은 ', h('b', {}, '대기'), ' 상태로 들어옵니다. ',
      '승인하기 전에는 학교 자료를 ', h('b', {}, '한 줄도 내려받지 않습니다.'),
      ' 모르는 이름이면 승인하지 마세요.'),
    h('p', { class: 'note' },
      h('b', {}, '[공지 권한]'), ' 은 교무행정사처럼 ',
      '공문 접수·안내장 수합을 알려야 하는 분께 주세요. ',
      '공지만 쓸 수 있고 ', h('b', {}, '일정 승인·수정 권한은 생기지 않습니다.'),
      ' 관리자는 따로 주지 않아도 공지를 씁니다.'),

    waiting.length
      ? h('p', { class: 'warn-line' }, `⏳ ${waiting.length}분이 승인을 기다리고 있습니다.`)
      : null,

    rows.length
      ? h('div', { class: 'table-wrap' },
          h('table', { class: 'tbl mem-tbl' },
            h('thead', {}, h('tr', {},
              h('th', {}, '이름'), h('th', {}, '계정'), h('th', {}, '부서'), h('th', {}, '담임'),
              h('th', {}, '상태'), h('th', {}, '역할'), h('th', {}, '처음 로그인'), h('th', {}, ''))),
            h('tbody', {}, ...rows.map(row))))
      : h('p', { class: 'muted' }, '아직 로그인한 사람이 없습니다.'),

    h('p', { class: 'muted small' },
      '자기 자신은 승인 취소나 역할 변경을 할 수 없습니다. ',
      '관리자가 실수로 혼자 잠기면 아무도 풀어줄 수 없기 때문입니다. ',
      '그럴 때는 Firebase 콘솔에서 고쳐야 합니다.'));
}
