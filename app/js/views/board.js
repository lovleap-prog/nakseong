// 공지 — 일일과 주간이 같은 것을 본다.
//
// 전에는 날짜마다 한 장, 주마다 한 장으로 따로 있었다. 그래서 같은 말을 두 번
// 써야 했고, 이틀 이어지는 공지는 이틀 다 쓰거나 한쪽에서 놓쳤다.
// 이제 '언제부터 언제까지' 를 정해 한 번만 쓰면 그 기간에 걸치는 날에 모두 뜬다.
//
// 쓰는 사람도 관리자만이 아니다. 공문 접수나 안내장 수합을 담임께 알리는 일은
// 교무행정사가 한다. 관리자가 명단에서 '공지 권한' 을 준 사람도 쓸 수 있다.
import { h, toast, clear, confirmDialog, openModal } from '../lib/dom.js';
import { list, put, remove, canPost, isAdmin, currentUser } from '../store.js';
import { newPost, today, fmtK, addDays, parseYmd, ymd, hiliteOk } from '../model.js';
import { hilitePicker } from '../ui/hilite.js';

/**
 * 그 기간에 걸치는 공지.
 * '상시' 로 올린 자유 메모는 날짜와 상관없이 늘 들어간다.
 */
export function postsIn(from, to) {
  return list('board')
    .filter((p) => p.always || ((p.from || '') <= to && (p.to || p.from || '') >= from))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)
      || (a.always ? 0 : 1) - (b.always ? 0 : 1)
      || String(a.from).localeCompare(String(b.from))
      || String(a.at).localeCompare(String(b.at)));
}

/** 게시가 끝났는데 아직 치우지 않은 내 공지 (연장할지 물어볼 것) */
export function expiredMine() {
  const me = currentUser();
  const t = today();
  return list('board').filter((p) => {
    if (p.always) return false;               // 상시 메모는 끝나는 날이 없다
    if ((p.to || p.from || '') >= t) return false;
    return isAdmin() || (p.uid && p.uid === me.uid) || (!p.uid && p.by === me.name);
  });
}

const canEdit = (p) => {
  const me = currentUser();
  if (isAdmin()) return true;
  if (!canPost()) return false;
  return (p.uid && p.uid === me.uid) || (!p.uid && p.by === me.name);
};

const rangeLabel = (p) => {
  if (p.always) return '상시';
  const a = p.from, b = p.to || p.from;
  if (a === b) return fmtK(a, { year: false });
  return `${fmtK(a, { year: false })} ~ ${fmtK(b, { year: false })}`;
};

const daysLeft = (p) => {
  if (p.always) return 9999;
  const end = parseYmd(p.to || p.from);
  const now = parseYmd(today());
  return Math.round((end - now) / 86400000);
};

/**
 * 공지 상자. 일일·주간이 같은 것을 쓴다.
 * @param from,to  이 화면이 보고 있는 기간
 */
export function boardBox(from, to, { title = '공지사항', refresh } = {}) {
  const box = h('section', { class: 'sec sec-notice' });
  const redraw = () => { draw(); if (refresh) refresh(); };

  function draw() {
    clear(box);
    const posts = postsIn(from, to);
    const mayWrite = canPost();
    const stale = mayWrite ? expiredMine() : [];

    box.appendChild(h('div', { class: 'sec-head' },
      h('h3', {}, h('span', { class: 'notice-ico' }, '\u{1F4E2}'), ' ', title,
        posts.length ? h('span', { class: 'sec-count' }, posts.length) : null),
      mayWrite
        ? h('button', {
          class: 'btn btn-sm',
          title: '며칠 동안만 붙여둘 공지를 씁니다',
          onClick: () => openPostForm(null, { from, to }, redraw),
        }, '+ 기간 정해 쓰기')
        : null));

    // 자유 메모 — 날짜를 정하지 않고 바로 적는다.
    // 창을 열고 기간을 고르는 것이 번거로워 결국 안 쓰게 되는 짧은 알림이 많다.
    if (mayWrite) box.appendChild(quickAdd(redraw));

    // 게시가 끝난 내 공지 — 연장할지 묻는다
    if (stale.length) {
      box.appendChild(h('div', { class: 'post-stale' },
        h('span', {}, `게시가 끝난 공지 ${stale.length}건이 있습니다. 더 붙여둘까요?`),
        ...stale.map((p) => h('div', { class: 'post-stale-row' },
          h('span', { class: 'post-stale-text' }, firstLine(p.text)),
          h('span', { class: 'muted small' }, `${fmtK(p.to || p.from, { year: false })} 끝`),
          h('button', { class: 'btn btn-sm', onClick: () => extend(p, 7, redraw) }, '1주 더'),
          h('button', { class: 'btn btn-sm', onClick: () => extend(p, 30, redraw) }, '한 달 더'),
          h('button', { class: 'btn btn-sm', onClick: () => openPostForm(p, null, redraw) }, '날짜 정하기'),
          h('button', {
            class: 'btn btn-sm', onClick: async () => {
              if (!(await confirmDialog('이 공지를 내릴까요?', { okText: '내리기', danger: true }))) return;
              await remove('board', p.id); toast('내렸습니다.', 'ok'); redraw();
            },
          }, '내리기')))));
    }

    if (!posts.length) {
      box.appendChild(h('p', { class: 'muted' },
        mayWrite ? '붙여둔 공지가 없습니다. [+ 쓰기] 로 올리세요.' : '붙여둔 공지가 없습니다.'));
      return;
    }
    box.appendChild(h('div', { class: 'post-list' }, ...posts.map((p) => postCard(p, redraw))));
  }

  draw();
  return box;
}

// ── 공지 꾸미기 ────────────────────────────────────────────
// 공지가 여럿 붙으면 다 같은 검은 글씨라, 오늘 꼭 봐야 할 것이 묻힌다.
// 글 안의 일부만 칠하게 하면 글자 고르기·서식 지우기까지 따라붙고 휴대전화에서는
// 아예 고를 수가 없다. 그래서 일정의 음영 강조와 같이 **한 장을 통째로** 칠한다.
//
// 바탕색과 글자색이 같은 --hl 값을 쓰므로 한 칸에 둘 다 담을 수 없다.
// 바깥(.post-body)이 바탕색을, 안쪽 <span>이 글자색을 맡는다.

/** 공지 본문 칸의 클래스 — 굵게와 바탕색 */
export const postBodyClass = (p) =>
  `post-body${p && p.bold ? ' is-bold' : ''}${p && hiliteOk(p.hl) ? ` is-hl hl-${p.hl}` : ''}`;

/** 본문 — 글자색이 있으면 그 색을 쓰는 칸으로 한 번 감싼다 */
export function postInk(p) {
  const t = (p && p.text) || '';
  return p && hiliteOk(p.fg) ? h('span', { class: `post-ink hl-${p.fg}` }, t) : t;
}

/**
 * 꾸미기 칸 — 굵게 · 글자색 · 바탕색.
 * [공지 쓰기] 창과 카드의 🎨 메뉴가 같은 것을 쓴다. deco 를 그 자리에서 고친다.
 *
 * field() 처럼 <label> 로 감싸면 안에 든 색 단추가 두 번 눌린다(레이블이 제 컨트롤로
 * 클릭을 또 보낸다). 색이 켜졌다 바로 꺼져 버리므로 여기서는 칸을 직접 짠다.
 */
export function decoFields(deco, onChange = () => {}) {
  const boldChk = h('input', { type: 'checkbox', checked: !!deco.bold });
  boldChk.addEventListener('change', () => { deco.bold = boldChk.checked; onChange(); });
  const row = (label, node, hint) => h('div', { class: 'span2 field' },
    h('span', { class: 'field-label' }, label), node,
    hint ? h('span', { class: 'field-hint' }, hint) : null);
  return [
    h('div', { class: 'span2' }, h('label', { class: 'check' }, boldChk, '굵게')),
    row('글자색', hilitePicker(deco.fg || '', (k) => { deco.fg = k; onChange(); },
      { hints: false, noneTitle: '기본 글자색' }), '글씨 자체의 색입니다.'),
    row('바탕색', hilitePicker(deco.hl || '', (k) => { deco.hl = k; onChange(); },
      { noneTitle: '바탕색 없음' }), '공지 한 장에 바탕색이 깔립니다. 급한 것 하나에만 쓰세요.'),
  ];
}

/** 고른 대로 바로 보여 주는 칸. 색을 고르고 창을 닫아야 아는 것이 아니라. */
export function decoPreview(deco, text) {
  const box = h('div', { class: 'post-list deco-preview' });
  const draw = () => {
    clear(box);
    box.appendChild(h('article', { class: 'post' },
      h('div', { class: postBodyClass(deco) }, postInk({ ...deco, text: text() || '(내용을 적으면 여기 보입니다)' }))));
  };
  draw();
  return { box, draw };
}

/** 카드의 🎨 단추 — 창을 열지 않고 그 자리에서 꾸민다. */
export function openPostDeco(p, onSaved) {
  if (!canEdit(p)) return;
  const deco = { bold: !!p.bold, fg: p.fg || '', hl: p.hl || '' };
  const pv = decoPreview(deco, () => p.text);
  const refresh = () => pv.draw();
  return openModal('공지 꾸미기', h('div', { class: 'form-grid' },
    ...decoFields(deco, refresh),
    h('div', { class: 'span2 field' }, h('span', { class: 'field-label' }, '미리보기'), pv.box)), [
    { label: '취소', onClick: (c) => c() },
    {
      label: '적용', class: 'btn-primary',
      onClick: async (c) => {
        try {
          await put('board', { ...p, ...deco });
          toast('꾸몄습니다. 모든 선생님 화면에 같이 보입니다.', 'ok');
          c();
          if (onSaved) onSaved();
        } catch (e) {
          console.error(e);
          toast('바꾸지 못했습니다: ' + (e.message || ''), 'warn');
        }
      },
    },
  ]);
}

const firstLine = (t) => String(t || '').split('\n')[0].slice(0, 40);

/**
 * 바로 적는 칸. 여기서 적은 것은 기간 없이 '상시' 로 붙는다.
 * 엔터로 붙이고, Shift+엔터로 줄을 바꾼다(메모장처럼).
 */
function quickAdd(redraw) {
  const me = currentUser();
  const ta = h('textarea', {
    class: 'input quick-note', rows: 1,
    placeholder: '간단한 알림은 여기에 바로 적으세요 (기간 없이 계속 붙습니다)',
  });
  const grow = () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`; };
  ta.addEventListener('input', grow);

  const save = async () => {
    const t = ta.value.trim();
    if (!t) return;
    try {
      await put('board', newPost({ text: t, always: true, by: me.name, uid: me.uid || '' }));
      ta.value = ''; grow();
      toast('붙였습니다.', 'ok');
      redraw();
    } catch (e) {
      console.error(e);
      toast('붙이지 못했습니다: ' + (e.message || ''), 'warn');
    }
  };
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
  });

  return h('div', { class: 'quick-row' }, ta,
    h('button', { class: 'btn btn-sm btn-primary', onClick: save }, '붙이기'));
}

function postCard(p, redraw) {
  const left = daysLeft(p);
  return h('article', { class: `post${p.pinned ? ' is-pinned' : ''}` },
    h('div', { class: postBodyClass(p) }, postInk(p)),
    h('div', { class: 'post-foot' },
      h('span', { class: `post-range${p.always ? ' is-always' : ''}` }, rangeLabel(p)),
      left >= 0 && left <= 2
        ? h('span', { class: 'chip chip-wait' }, left === 0 ? '오늘까지' : `${left}일 남음`)
        : null,
      p.by ? h('span', { class: 'muted small' }, p.by) : null,
      canEdit(p)
        ? h('span', { class: 'post-tools' },
          h('button', {
            class: `icon-btn${p.pinned ? ' on' : ''}`, title: p.pinned ? '고정 풀기' : '맨 위에 고정',
            onClick: async () => { await put('board', { ...p, pinned: !p.pinned }); redraw(); },
          }, '\u{1F4CC}'),
          // 꾸미기는 창을 열지 않고 그 자리에서. 여러 건을 훑으며 칠하는 일이라서다.
          // 늘 쓰던 ✎ 는 자리를 지킨다 — 손이 기억하는 자리를 옮기면 잘못 누른다.
          h('button', {
            class: `icon-btn hl-btn${(p.bold || p.fg || p.hl) ? ' on' : ''}`,
            title: '굵기 · 글자색 · 바탕색',
            onClick: () => openPostDeco(p, redraw),
          }, '\u{1F3A8}'),
          h('button', { class: 'icon-btn', title: '고치기', onClick: () => openPostForm(p, null, redraw) }, '✎'),
          h('button', {
            class: 'icon-btn danger', title: '내리기',
            onClick: async () => {
              if (!(await confirmDialog('이 공지를 내릴까요?', { okText: '내리기', danger: true }))) return;
              await remove('board', p.id); toast('내렸습니다.', 'ok'); redraw();
            },
          }, '✕'))
        : null));
}

async function extend(p, days, redraw) {
  const base = (p.to || p.from) < today() ? today() : (p.to || p.from);
  const to = addDays(base, days);
  await put('board', { ...p, to, extendedTo: to });
  toast(`${fmtK(to, { year: false })} 까지 연장했습니다.`, 'ok');
  redraw();
}

/** 공지 쓰기·고치기 창 */
export function openPostForm(post, defaults, onSaved) {
  const me = currentUser();
  const base = post || newPost({
    from: (defaults && defaults.from) || today(),
    to: (defaults && defaults.to) || today(),
    by: me.name, uid: me.uid || '',
  });

  const text = h('textarea', {
    class: 'input', rows: 4,
    placeholder: '예) 학교폭력 예방교육 안내장 수합 — 금요일까지 담임 선생님께서 보내주세요.',
  });
  text.value = base.text || '';
  const from = h('input', { type: 'date', class: 'input', value: base.from || today() });
  const to = h('input', { type: 'date', class: 'input', value: base.to || base.from || today() });
  // 시작일을 뒤로 밀면 종료일도 같이 민다. 거꾸로 된 기간을 저장할 일이 없게.
  from.addEventListener('change', () => { if (to.value < from.value) to.value = from.value; });

  const quick = (label, days) => h('button', {
    class: 'btn btn-sm',
    onClick: () => { to.value = addDays(from.value || today(), days); },
  }, label);

  // 기간을 정할 것인가, 계속 붙여둘 것인가.
  const always = h('input', { type: 'checkbox', checked: !!base.always });
  const dateBox = h('div', { class: 'span2 form-grid nested' },
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, '게시 시작'), from),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, '게시 끝'), to),
    h('div', { class: 'span2 row gap' },
      h('span', { class: 'muted small' }, '빨리 정하기'),
      quick('오늘만', 0), quick('이번 주', 4), quick('1주', 7), quick('한 달', 30)));
  const syncMode = () => { dateBox.style.display = always.checked ? 'none' : ''; };
  always.addEventListener('change', syncMode);
  setTimeout(syncMode, 0);

  // 꾸미기 — 쓰면서 바로 고른다. 올리고 나서 다시 🎨 를 눌러야 한다면 안 쓰게 된다.
  const deco = { bold: !!base.bold, fg: base.fg || '', hl: base.hl || '' };
  const pv = decoPreview(deco, () => text.value.trim());
  text.addEventListener('input', () => pv.draw());

  openModal(post ? '공지 고치기' : '공지 쓰기', h('div', { class: 'form-grid' },
    h('div', { class: 'span2' },
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, '내용 *'), text)),
    h('div', { class: 'span2' },
      h('label', { class: 'check' }, always,
        '기간 없이 계속 붙여두기 (자유 메모)')),
    dateBox,
    ...decoFields(deco, () => pv.draw()),
    h('div', { class: 'span2 field' }, h('span', { class: 'field-label' }, '미리보기'), pv.box),
    h('p', { class: 'span2 muted small' },
      '정한 기간에 걸치는 날이면 ', h('b', {}, '일일·주간 화면 모두'), ' 에 뜹니다. ',
      '기간이 지나면 저절로 내려가고, 더 붙여둘지 다시 물어봅니다. ',
      '계속 붙여두면 내릴 때까지 그대로 있습니다.')), [
    { label: '닫기', onClick: (c) => c() },
    {
      label: '저장', class: 'btn-primary',
      onClick: async (close) => {
        const t = text.value.trim();
        if (!t) return toast('내용을 적어주세요.', 'warn');
        const keep = always.checked;
        if (!keep && !from.value) return toast('게시 시작일을 정해주세요.', 'warn');
        const end = to.value && to.value >= from.value ? to.value : from.value;
        try {
          await put('board', {
            ...base, ...deco, text: t, always: keep,
            from: keep ? (base.from || today()) : from.value,
            to: keep ? '' : end,
            by: base.by || me.name, uid: base.uid || me.uid || '',
          });
          toast(post ? '고쳤습니다.' : '올렸습니다.', 'ok');
          close();
          if (onSaved) onSaved();
        } catch (e) {
          console.error(e);
          toast('올리지 못했습니다: ' + (e.message || ''), 'warn');
        }
      },
    },
  ]);
  setTimeout(() => text.focus(), 40);
}

export { ymd };
