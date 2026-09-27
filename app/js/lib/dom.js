// 아주 작은 DOM 헬퍼. 빌드 도구 없이 쓰기 위한 최소 구현.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style' && typeof v === 'object') {
      // CSS 변수(--이름)는 Object.assign 으로는 안 들어가서 따로 넣는다.
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith('--')) el.style.setProperty(sk, String(sv));
        else el.style[sk] = sv;
      }
    }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/**
 * 이름표 붙은 칩 한 줄. [['대상', '2,4년'], ['장소', 'AI교실'], ...] 을 받아 빈 값은 건너뛴다.
 * 테두리 상자만 늘어놓으면 '꿈자람반' 이 대상인지 장소인지, '정미래' 가 담당인지 알 길이 없다.
 */
export function labeledChips(pairs) {
  const on = pairs.filter(([, v]) => v);
  if (!on.length) return null;
  return h('div', { class: 'chips labeled' },
    ...on.map(([k, v]) => h('span', { class: 'chip-l' }, h('i', {}, k), v)));
}

/**
 * 휴대전화에서 표를 '한 줄 = 카드 하나' 로 보이게 한다. 컴퓨터에서는 그대로 표다.
 *
 * 여섯 칸짜리 표를 좁은 폭에 억지로 넣으면 '과/학/실', '외/부/강/사' 처럼 한 글자씩
 * 세로로 떨어진다. 앞의 lead 칸은 제목 줄(이름표 없이), 나머지는 머리 글자를 이름표로
 * 달아 다음 줄에 늘어놓는다. 빈 칸은 휴대전화에서 뺀다.
 */
export function stackOnPhone(table, lead = 1) {
  const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
  table.classList.add('tbl-cards');
  for (const tr of table.querySelectorAll('tbody tr')) {
    const cells = [...tr.children];
    cells.forEach((td, i) => {
      if (i < lead) td.classList.add('tc-lead');
      else if (heads[i]) td.dataset.label = heads[i];
      if (!td.textContent.trim()) td.classList.add('tc-empty');
    });
    // 제목 줄과 이름표 줄 사이의 줄바꿈. 컴퓨터에서는 보이지 않는다.
    if (cells[lead]) tr.insertBefore(h('td', { class: 'tc-br', 'aria-hidden': 'true' }), cells[lead]);
  }
  return table;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

export function mount(el, ...children) { clear(el); append(el, children); return el; }

/**
 * 바깥을 눌러 창 닫기 — **누르기와 떼기가 모두 바깥일 때만.**
 *
 * 여태는 click 하나만 봤다. 그런데 브라우저는 누른 자리와 뗀 자리의 '공통 조상' 에
 * click 을 보낸다. 칸 안에서 글자를 드래그해 고르다 손이 창 밖에서 떨어지면 그 조상이
 * 곧 바탕이라, 적던 내용이 통째로 사라졌다. 담당·세부 내용을 적다 여러 번 겪은 일이다.
 */
function closeOnBackdrop(back, close) {
  let downOnBack = false;
  back.addEventListener('mousedown', (e) => { downOnBack = e.target === back; });
  back.addEventListener('touchstart', (e) => { downOnBack = e.target === back; }, { passive: true });
  back.addEventListener('click', (e) => {
    const was = downOnBack;
    downOnBack = false;
    if (was && e.target === back) close();
  });
  return back;
}

/** 간단한 토스트 알림 */
export function toast(msg, kind = 'info') {
  let host = $('#toast-host');
  if (!host) { host = h('div', { id: 'toast-host' }); document.body.appendChild(host); }
  const t = h('div', { class: `toast toast-${kind}` }, msg);
  host.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 3200);
}

/** 확인 모달 (window.confirm 대체) */
export function confirmDialog(message, { okText = '확인', cancelText = '취소', danger = false } = {}) {
  return new Promise((resolve) => {
    const close = (v) => { back.remove(); resolve(v); };
    const back = h('div', { class: 'modal-back' },
      h('div', { class: 'modal modal-sm' },
        h('p', { class: 'modal-msg' }, message),
        h('div', { class: 'modal-actions' },
          h('button', { class: 'btn', onClick: () => close(false) }, cancelText),
          h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, onClick: () => close(true) }, okText))));
    closeOnBackdrop(back, () => close(false));
    document.body.appendChild(back);
  });
}

/** 입력 모달 — 반려 사유 등 */
export function promptDialog(message, { placeholder = '', okText = '확인' } = {}) {
  return new Promise((resolve) => {
    const input = h('textarea', { class: 'input', rows: 3, placeholder });
    const close = (v) => { back.remove(); resolve(v); };
    const back = h('div', { class: 'modal-back' },
      h('div', { class: 'modal modal-sm' },
        h('p', { class: 'modal-msg' }, message), input,
        h('div', { class: 'modal-actions' },
          h('button', { class: 'btn', onClick: () => close(null) }, '취소'),
          h('button', { class: 'btn btn-primary', onClick: () => close(input.value.trim()) }, okText))));
    closeOnBackdrop(back, () => close(null));
    document.body.appendChild(back);
    setTimeout(() => input.focus(), 30);
  });
}

/** 큰 모달 (미리보기 등) */
export function openModal(title, bodyNode, actions = [], { confirmClose } = {}) {
  const close = () => back.remove();
  // 적다 만 것이 있으면 한 번 물어본다. 실수로 바깥을 눌러 십 분치 입력이 날아가면
  // 다시 적을 마음이 안 난다.
  const tryClose = async () => {
    if (confirmClose && !(await confirmClose())) return;
    close();
  };
  const back = h('div', { class: 'modal-back' },
    h('div', { class: 'modal' },
      h('div', { class: 'modal-head' }, h('h3', {}, title), h('button', { class: 'icon-btn', title: '닫기', onClick: tryClose }, '✕')),
      h('div', { class: 'modal-body' }, bodyNode),
      h('div', { class: 'modal-actions' }, ...actions.map((a) =>
        h('button', { class: `btn ${a.class || ''}`, onClick: () => a.onClick(close) }, a.label)))));
  closeOnBackdrop(back, tryClose);
  document.body.appendChild(back);
  return close;
}

/** 파일 다운로드 */
export function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, rel: 'noopener' });
  document.body.appendChild(a);
  a.click();
  // 앵커를 곧바로 지우면 크로미움이 download 속성(파일명)을 잃어버린다.
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch { // 보안 컨텍스트가 아닐 때 폴백
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } });
    ta.value = text; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  }
}
