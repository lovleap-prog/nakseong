// 음영 강조 고르개 — 일정 창과 카드의 🎨 단추가 같은 것을 쓴다.
//
// 주간·일일 화면은 하얀 카드가 죽 늘어선다. 그 안에서 '그 주에 한 번뿐인 것' 을
// 눈에 띄게 하려면 바탕색이 있어야 한다. 분류 색은 이미 '무엇인가' 를 뜻하고 있어서
// 여기에 겹쳐 쓸 수 없다. 그래서 강조 색을 따로 둔다.
import { h, openModal, toast } from '../lib/dom.js';
import { HILITE, hiliteOk } from '../model.js';
import { put, audit, isAdmin } from '../store.js';

/**
 * 색 단추 줄. 고르면 onPick(key) 를 부른다. 다시 고르면 꺼진다.
 * @param {string} value  지금 값 ('' 이면 강조 없음)
 */
export function hilitePicker(value, onPick) {
  let cur = hiliteOk(value) ? value : '';
  const row = h('div', { class: 'hl-row', role: 'group', 'aria-label': '음영 강조 색' });

  const draw = () => {
    row.replaceChildren(
      h('button', {
        type: 'button', class: `hl-swatch hl-none${cur === '' ? ' on' : ''}`,
        title: '강조 없음', 'aria-pressed': String(cur === ''),
        onClick: () => { cur = ''; draw(); onPick(''); },
      }, '✖'),
      ...Object.entries(HILITE).map(([k, v]) => h('button', {
        type: 'button', class: `hl-swatch hl-${k}${cur === k ? ' on' : ''}`,
        title: `${v.label} — ${v.hint}`, 'aria-pressed': String(cur === k),
        onClick: () => { cur = cur === k ? '' : k; draw(); onPick(cur); },
      }, v.label)));
  };
  draw();
  return row;
}

/** 카드의 🎨 단추 — 창을 열지 않고 그 자리에서 색만 바꾼다. */
export function openHiliteMenu(a, onSaved) {
  if (!isAdmin()) return;
  let picked = a.hl || '';
  const close = openModal('음영 강조', h('div', {},
    h('p', { class: 'muted small' },
      `'${a.title}' 을(를) 어떤 색으로 눈에 띄게 할까요? 모든 선생님 화면에 같이 보입니다.`),
    hilitePicker(picked, (k) => { picked = k; })), [
    { label: '취소', onClick: (c) => c() },
    {
      label: '적용', class: 'btn-primary',
      onClick: async (c) => {
        if (picked === (a.hl || '')) return c();
        const before = { ...a };
        const next = { ...a, hl: picked };
        await put('activities', next);
        await audit('강조', a.id, before, next);
        toast(picked ? `${HILITE[picked].label}으로 강조했습니다.` : '강조를 껐습니다.', 'ok');
        c();
        if (onSaved) onSaved(next);
      },
    },
  ]);
  return close;
}

/** 클래스 이름 조각. 값이 없거나 모르는 값이면 빈 글자. */
export const hlClass = (a) => (a && hiliteOk(a.hl) ? ` is-hl hl-${a.hl}` : '');
