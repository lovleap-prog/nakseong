// 공지사항 · 월별 중점지도 — 화면에 바로 쓰는 메모장
//
// 설정 탭에 두지 않았다. 매주 바뀌는 글을 설정에 들어가서 써야 하면 아무도 안 쓴다.
// 보는 화면에서 바로 고치는 편이 맞다. 고치는 건 관리자만.
import { h, toast, clear } from '../lib/dom.js';
import { noticeId } from '../model.js';
import { list, put, remove, isAdmin, currentUser } from '../store.js';

const ICON = { focus: '\u{1F3AF}', tt: '\u{1F4DD}', notice: '\u{1F4E2}' };

/**
 * @param kind  'notice'(공지사항) | 'focus'(월별 중점지도) | 'tt'(시간표 운영 메모)
 * @param key   날짜 / 그 주 월요일 / 'YYYY-MM'
 * @param compact  옆칸에 끼워 넣는 작은 모양. 일일 화면의 교과교담 표 오른쪽에 쓴다.
 */
export function noticeBox(kind, key, { title, placeholder, onChange, compact = false } = {}) {
  const id = noticeId(kind, key);
  const found = list('notices').find((n) => n.id === id);
  const text = found ? found.text : '';
  const admin = isAdmin();
  const box = h(compact ? 'div' : 'section',
    { class: `${compact ? 'notice-pane' : 'sec sec-notice'} kind-${kind}` });

  const draw = (editing) => {
    clear(box);
    const head = h('div', { class: 'sec-head' },
      h(compact ? 'h4' : 'h3', {},
        h('span', { class: 'notice-ico' }, ICON[kind] || ICON.notice), ' ', title),
      admin && !editing
        ? h('button', { class: 'btn btn-sm', onClick: () => draw(true) }, text ? '고치기' : '+ 쓰기')
        : null);
    box.appendChild(head);

    if (!editing) {
      box.appendChild(text
        ? h('p', { class: 'notice-text' }, text)
        : h('div', { class: 'empty' }, admin ? '아직 적은 내용이 없습니다.' : '등록된 내용이 없습니다.'));
      if (found && found.updatedBy) {
        box.appendChild(h('p', { class: 'muted small' },
          `${found.updatedBy} · ${new Date(found.updatedAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}`));
      }
      return;
    }

    const ta = h('textarea', { class: 'input', rows: compact ? 3 : 4, placeholder: placeholder || '' });
    ta.value = text;
    box.appendChild(ta);
    box.appendChild(h('div', { class: 'row gap', style: { marginTop: '8px' } },
      h('button', {
        class: 'btn btn-primary',
        onClick: async () => {
          const v = ta.value.trim();
          if (v) {
            await put('notices', {
              id, kind, key, text: v,
              updatedBy: currentUser().name || '', updatedAt: new Date().toISOString(),
            });
          } else if (found) {
            await remove('notices', id);
          }
          toast(v ? '저장했습니다.' : '지웠습니다.', 'ok');
          if (onChange) onChange();
        },
      }, '저장'),
      h('button', { class: 'btn', onClick: () => draw(false) }, '취소'),
      text ? h('button', {
        class: 'btn btn-danger',
        onClick: async () => { await remove('notices', id); toast('지웠습니다.', 'ok'); if (onChange) onChange(); },
      }, '지우기') : null));
    setTimeout(() => ta.focus(), 30);
  };

  draw(false);
  // 관리자가 아니고 내용도 없으면 자리를 차지하지 않는다.
  if (!admin && !text) return null;
  return box;
}

export function noticeText(kind, key) {
  const found = list('notices').find((n) => n.id === noticeId(kind, key));
  return found ? found.text : '';
}
