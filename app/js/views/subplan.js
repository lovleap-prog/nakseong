// 보결 배정 — 누가 어느 교시에 들어가는지 정하고, 그것을 알리는 곳.
//
// 여태 출장에는 '보결이 필요하다' 는 표시와 신청자가 적은 요청 글(몇 교시에 무엇이
// 필요한지)만 있었다. 정작 **누가 들어가는지**는 어디에도 없었다. 관리 선생님이
// 머릿속이나 쪽지로 정하고 메신저로 흘려보냈기 때문에, 그 날 아침에 '내가 보결이던가'
// 를 되묻는 일이 생겼다.
//
// 세 가지를 한다.
//   1) 그 날 보결이 필요하면 관리자에게 **체크리스트**를 띄운다. 빠진 칸이 바로 보인다.
//   2) 배정을 자료로 남긴다. 그래야 알릴 수 있다.
//   3) 알린다 — 들어갈 선생님 화면에 띄우고, 일일 안내문에 넣고, 메신저용 글을 만든다.
import { h, openModal, toast, clear, copyText } from '../lib/dom.js';
import { fmtK, parseYmd, WEEKDAY } from '../model.js';
import { list, put, audit, isAdmin, currentUser } from '../store.js';

/** 그 날 보결이 필요한 출장 (반려된 것은 뺀다) */
export function subTrips(date) {
  return list('trips')
    .filter((t) => t.needsSub && t.status !== 'rejected')
    .filter((t) => t.date <= date && (t.endDate || t.date) >= date)
    .sort((a, b) => String(a.applicant).localeCompare(String(b.applicant)));
}

/** 배정 줄들. 빈 줄과 옛 자료의 어그러진 모양을 걸러 낸다. */
export function planRows(t) {
  return (Array.isArray(t && t.subPlan) ? t.subPlan : [])
    .filter((r) => r && (r.period || r.klass || r.teacher))
    .map((r) => ({
      period: String(r.period || '').trim(),
      klass: String(r.klass || '').trim(),
      teacher: String(r.teacher || '').trim(),
      // 누구인지는 이름이 아니라 **로그인 계정**으로 잡는다. 같은 이름이 둘일 수도 있고,
      // 이름을 한 글자만 달리 적어도 그분 화면에 뜨지 않기 때문이다.
      uid: String(r.uid || '').trim(),
      note: String(r.note || '').trim(),
    }));
}

/**
 * 이 출장의 보결 배정이 끝났는가.
 *  none    — 아직 한 줄도 없다
 *  partial — 줄은 있는데 들어갈 사람이 빈 칸이 있다
 *  done    — 모든 줄에 사람이 있다
 */
export function planState(t) {
  const rows = planRows(t);
  if (!rows.length) return 'none';
  return rows.every((r) => r.teacher) ? 'done' : 'partial';
}

const STATE = {
  none: { label: '미배정', cls: 'st-rejected' },
  partial: { label: '덜 됨', cls: 'st-pending' },
  done: { label: '배정 완료', cls: 'st-approved' },
};

/** 한 줄을 '1-2교시 5학년 → 김용신' 꼴로 */
const rowText = (r) => {
  const left = [r.period, r.klass].filter(Boolean).join(' ');
  const right = r.teacher || '(미정)';
  return `${left ? `${left} ` : ''}→ ${right}${r.note ? ` (${r.note})` : ''}`;
};

/**
 * 그 날 내가 들어가야 하는 보결.
 * 계정(uid)으로 먼저 보고, 계정이 없는 옛 자료만 이름으로 본다.
 */
export function mySubs(date, name, uid = '') {
  const me = currentUser();
  const myUid = uid || me.uid || '';
  const myName = name || me.name || '';
  if (!myUid && !myName) return [];
  const out = [];
  for (const t of subTrips(date)) {
    for (const r of planRows(t)) {
      const hit = r.uid ? r.uid === myUid : (!!myName && r.teacher === myName);
      if (hit) out.push({ trip: t, row: r });
    }
  }
  return out;
}

/** 앱에 로그인한(승인된) 선생님들 — 배정에서 고를 사람들 */
export function appMembers() {
  return list('members')
    .filter((m) => m.approved && m.name)
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/**
 * 이 줄의 사람이 앱에 있는 분인가.
 * 아니면 정해 두어도 그분 화면에는 뜨지 않으니, 그것을 숨기지 않고 적어 둔다.
 */
export function rowReaches(r) {
  if (!r.teacher) return 'blank';
  if (r.uid) return 'ok';
  return appMembers().some((m) => m.name === r.teacher) ? 'ok' : 'offapp';
}

/** '1학년' 의 담임이 누구인가. [설정] → 명단 에 적어 둔 것을 본다. */
export function homeroomOf(klass) {
  const key = String(klass || '').replace(/\s+/g, '');
  if (!key) return null;
  return appMembers().find((m) => String(m.homeroom || '').replace(/\s+/g, '') === key) || null;
}

/** 그 날 아직 사람이 안 정해진 보결이 몇 건인가 (요약 줄의 주황 표시에 쓴다) */
export function unassignedCount(date) {
  return subTrips(date).filter((t) => planState(t) !== 'done').length;
}

/**
 * 앞으로 며칠 안에 아직 사람을 못 정한 보결이 있는 날들.
 * 오늘은 뺀다. 오늘 것은 바로 아래 체크리스트가 이미 다 보여주고 있다.
 */
export function unassignedAhead(fromDate, days = 14) {
  const until = (() => {
    const d = parseYmd(fromDate); d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const out = new Set();
  for (const t of list('trips')) {
    if (!t.needsSub || t.status === 'rejected') continue;
    if (t.date <= fromDate || t.date > until) continue;
    if (planState(t) !== 'done') out.add(t.date);
  }
  return [...out].sort();
}

/**
 * 앞으로 못 정한 것이 있으면 한 줄로만 알린다. 관리자만 본다.
 *
 * 크게 띄우지 않는다. 오늘 할 일이 아니라 '곧 해야 할 일' 이고, 날마다 보는 화면에
 * 큰 상자가 하나 더 늘면 정작 오늘 것이 묻힌다. 없으면 아무것도 그리지 않는다.
 */
export function aheadLine(date, ctx) {
  if (!isAdmin()) return null;
  const days = unassignedAhead(date);
  if (!days.length) return null;
  const shown = days.slice(0, 3).map((d) => fmtK(d, { year: false })).join(', ');
  return h('div', { class: 'sub-ahead' },
    h('span', {}, '\u{1F64B} 앞으로 보결을 못 정한 날 ',
      h('b', {}, `${days.length}일`), ' — ', shown,
      days.length > 3 ? ` 외 ${days.length - 3}일` : ''),
    h('button', {
      class: 'btn btn-sm',
      onClick: () => { ctx.setDate(days[0]); },
    }, `${fmtK(days[0], { year: false })} 보기`));
}

/** 적어 넣을 때 고를 이름들 — 업무분장 명단과 로그인 명단을 합친다. */
function teacherNames() {
  const names = new Set();
  for (const s of list('staff')) if (s.active !== false && s.name) names.add(s.name);
  for (const m of list('members')) if (m.name) names.add(m.name);
  return [...names].sort();
}

// ── 그 날 체크리스트 (관리자만) ─────────────────────────────
/**
 * 보결이 필요한 날에만 뜬다. 필요 없는 날에는 아무것도 그리지 않는다.
 * 매일 보는 화면이라, 할 일이 없는 날까지 자리를 차지하면 금세 눈이 지나친다.
 */
export function subBox(date, refresh) {
  if (!isAdmin()) return null;
  const trips = subTrips(date);
  if (!trips.length) return null;
  const left = trips.filter((t) => planState(t) !== 'done').length;

  const box = h('section', { class: `sec sec-sub${left ? ' is-left' : ''}` });

  const draw = () => {
    clear(box);
    const cur = subTrips(date);
    const todo = cur.filter((t) => planState(t) !== 'done').length;

    box.appendChild(h('div', { class: 'sec-head' },
      h('h3', {}, '\u{1F64B} 보결 배정 ',
        h('span', { class: 'sec-count' }, `${cur.length - todo}/${cur.length}`)),
      h('div', { class: 'row gap' },
        todo
          ? h('span', { class: 'badge st-rejected' }, `${todo}건 남음`)
          : h('span', { class: 'badge st-approved' }, '다 정했습니다'),
        h('button', {
          class: 'btn btn-sm', title: '메신저에 붙일 안내문을 만듭니다',
          onClick: () => openSubNotice(date),
        }, '\u{1F4CB} 보결 안내 복사'))));

    box.appendChild(h('ul', { class: 'sub-list' }, ...cur.map((t) => {
      const st = STATE[planState(t)];
      const rows = planRows(t);
      return h('li', { class: `sub-item is-${planState(t)}` },
        h('span', { class: 'sub-mark', 'aria-hidden': 'true' }, planState(t) === 'done' ? '✔' : '▢'),
        h('div', { class: 'sub-body' },
          h('div', { class: 'sub-top' },
            h('strong', {}, t.applicant || '(이름 없음)'),
            h('span', { class: `badge ${st.cls}` }, st.label),
            t.reason ? h('span', { class: 'muted small' }, t.reason) : null,
            t.status === 'pending' ? h('span', { class: 'badge st-pending' }, '출장 확인 대기') : null),
          // 신청자가 적은 '요청'. 이것을 보고 배정한다.
          t.subNote ? h('p', { class: 'sub-ask' }, '요청: ', t.subNote) : null,
          rows.length
            ? h('ul', { class: 'sub-rows' }, ...rows.map((r) => h('li', {
              class: r.teacher ? '' : 'is-blank',
            }, rowText(r),
            // 앱에 없는 분이면 그분 화면에는 뜨지 않는다. 숨기지 않고 적어 둔다.
            rowReaches(r) === 'offapp'
              ? h('span', { class: 'sub-hint warn-text' }, ' 앱을 쓰지 않는 분 — 따로 알려주세요')
              : null)))
            : h('p', { class: 'sub-ask warn-text' }, '아직 들어갈 분을 정하지 않았습니다.')),
        h('button', {
          class: `btn btn-sm${planState(t) === 'done' ? '' : ' btn-primary'}`,
          onClick: () => openSubForm(t, () => { draw(); if (refresh) refresh(); }),
        }, rows.length ? '고치기' : '배정하기'));
    })));

    box.appendChild(h('p', { class: 'muted small' },
      '정해 두면 들어가실 선생님 [일일] 화면에 뜨고, [일일 안내문]에도 함께 나갑니다.'));
  };

  draw();
  return box;
}

// ── 들어갈 선생님에게 알리는 칸 (모두에게) ───────────────────
/** 내가 보결로 들어가는 날이면 맨 위에 띄운다. 그 날 가장 중요한 알림이다. */
export function mySubBar(date) {
  const me = currentUser();
  const mine = mySubs(date, me.name);
  if (!mine.length) return null;
  return h('div', { class: 'mysub-bar', role: 'status' },
    h('span', { class: 'mysub-ico' }, '\u{1F64B}'),
    h('div', {},
      h('b', {}, `오늘 보결이 ${mine.length}건 있습니다.`),
      h('ul', {}, ...mine.map(({ trip, row }) => h('li', {},
        h('strong', {}, [row.period, row.klass].filter(Boolean).join(' ') || '교시 미기재'),
        ` — ${trip.applicant || ''} 선생님 출장`,
        trip.reason ? h('span', { class: 'muted small' }, ` (${trip.reason})`) : null,
        row.note ? h('span', { class: 'muted small' }, ` · ${row.note}`) : null)))));
}

// ── 배정 창 ─────────────────────────────────────────────────
export function openSubForm(trip, onSaved) {
  const rows = planRows(trip);
  const blank = () => ({ period: '', klass: '', teacher: '', uid: '', note: '' });
  if (!rows.length) rows.push(blank());

  // 들어갈 분은 **앱에 로그인한 분 중에서 고른다.** 이름을 손으로 치면 한 글자만 달라도
  // 그분 화면에 뜨지 않는다. 계정이 없는 분(강사·실무사)은 따로 적되, 뜨지 않는다고 알린다.
  const members = appMembers();
  const names = teacherNames();
  const listId = 'sub-names';
  const dl = h('datalist', { id: listId }, ...names.map((n) => h('option', { value: n })));

  const body = h('div', { class: 'sub-form' });
  const table = h('div', { class: 'sub-grid' });

  const draw = () => {
    clear(table);
    for (const t of ['교시', '학급·과목', '들어갈 분', '비고', '']) {
      table.appendChild(h('span', { class: 'sub-h' }, t));
    }
    rows.forEach((r, i) => {
      const mk = (key, ph, extra = {}) => {
        const el = h('input', { class: 'input', value: r[key] || '', placeholder: ph, ...extra });
        el.addEventListener('input', () => { r[key] = el.value; });
        return el;
      };

      table.appendChild(mk('period', '예) 1-2교시'));

      // 학급 — 담임이 누구인지 적어 준다. '1학년' 만 보고는 누구 반인지 알 수 없어서다.
      const klassWrap = h('div', { class: 'sub-cell' });
      const klassIn = h('input', { class: 'input', value: r.klass || '', placeholder: '예) 5학년' });
      const hint = h('span', { class: 'sub-hint' });
      const syncHint = () => {
        const hr = homeroomOf(klassIn.value);
        hint.textContent = hr ? `${klassIn.value.trim()} 담임: ${hr.name}` : '';
      };
      klassIn.addEventListener('input', () => { r.klass = klassIn.value; syncHint(); });
      syncHint();
      klassWrap.append(klassIn, hint);
      table.appendChild(klassWrap);

      // 들어갈 분 — 명단에서 고른다
      const who = h('div', { class: 'sub-cell' });
      if (members.length) {
        const sel = h('select', { class: 'input' },
          h('option', { value: '' }, '— 아직 안 정함 —'),
          ...members.map((m) => h('option', {
            value: m.id, selected: r.uid ? r.uid === m.id : r.teacher === m.name,
          }, m.name + (m.homeroom ? ` (${m.homeroom})` : ''))),
          h('option', {
            value: '__other',
            selected: !!r.teacher && !r.uid && !members.some((m) => m.name === r.teacher),
          }, '명단에 없는 분 (직접 적기)'));
        const other = h('input', {
          class: 'input', value: r.uid ? '' : (r.teacher || ''), placeholder: '이름', list: listId,
        });
        const warn = h('span', { class: 'sub-hint warn-text' });
        const sync = () => {
          const isOther = sel.value === '__other';
          other.style.display = isOther ? '' : 'none';
          if (isOther) { r.uid = ''; r.teacher = other.value.trim(); } else if (sel.value) {
            const m = members.find((x) => x.id === sel.value);
            r.uid = m ? m.id : ''; r.teacher = m ? m.name : '';
          } else { r.uid = ''; r.teacher = ''; }
          warn.textContent = isOther && r.teacher
            ? '앱을 쓰지 않는 분이라 그분 화면에는 뜨지 않습니다. 따로 알려주세요.' : '';
        };
        sel.addEventListener('change', sync);
        other.addEventListener('input', sync);
        sync();
        who.append(sel, other, warn);
      } else {
        // 명단이 없는 방식(이 컴퓨터에만 저장)에서는 전처럼 이름을 적는다.
        who.append(mk('teacher', '이름', { list: listId }));
      }
      table.appendChild(who);

      table.appendChild(mk('note', '예) 수학 문제집'));
      table.appendChild(h('button', {
        class: 'icon-btn danger', title: '이 줄 지우기', type: 'button',
        onClick: () => { rows.splice(i, 1); if (!rows.length) rows.push(blank()); draw(); },
      }, '✕'));
    });
  };
  draw();

  body.append(
    h('p', { class: 'muted small' },
      `${fmtK(trip.date, { year: false })} · ${trip.applicant || ''} 선생님 출장`,
      trip.reason ? ` — ${trip.reason}` : ''),
    trip.subNote
      ? h('p', { class: 'sub-ask' }, '신청자가 적은 요청: ', trip.subNote)
      : h('p', { class: 'muted small' }, '신청자가 몇 교시인지 적지 않았습니다. 확인해 주세요.'),
    table, dl,
    h('button', {
      class: 'btn btn-sm', type: 'button',
      onClick: () => { rows.push(blank()); draw(); },
    }, '+ 줄 추가'),
    h('p', { class: 'muted small' },
      "들어갈 분을 비워 두면 '덜 됨' 으로 남습니다. 정해지면 다시 와서 채우세요."));

  // 요청 글을 보고 '1-2교시: 5학년/3교시: 3학년' 같은 줄을 미리 끊어 넣어 준다.
  if (!planRows(trip).length && trip.subNote) {
    const guess = parseAsk(trip.subNote).map((g) => ({ ...g, uid: '' }));
    if (guess.length) {
      rows.length = 0;
      rows.push(...guess);
      draw();
      body.appendChild(h('p', { class: 'muted small' },
        '요청 글을 보고 교시를 미리 끊어 두었습니다. 틀린 곳은 고쳐 주세요.'));
    }
  }

  return openModal('보결 배정', body, [
    { label: '취소', onClick: (c) => c() },
    {
      label: '저장', class: 'btn-primary',
      onClick: async (c) => {
        const keep = rows
          .map((r) => ({
            period: String(r.period || '').trim(), klass: String(r.klass || '').trim(),
            teacher: String(r.teacher || '').trim(), uid: String(r.uid || '').trim(),
            note: String(r.note || '').trim(),
          }))
          .filter((r) => r.period || r.klass || r.teacher);
        const before = { ...trip };
        const next = { ...trip, subPlan: keep };
        await put('trips', next);
        await audit('보결배정', trip.id, before, next);
        const left = keep.filter((r) => !r.teacher).length;
        toast(left ? `저장했습니다. ${left}줄은 아직 사람이 비어 있습니다.` : '보결 배정을 마쳤습니다.', left ? 'warn' : 'ok');
        c();
        if (onSaved) onSaved(next);
      },
    },
  ]);
}

/**
 * '1-2교시: 5학년/3교시: 3학년/4교시: 4학년' 같은 요청 글을 줄로 끊는다.
 * 학교마다 적는 모양이 조금씩 달라 못 끊으면 빈 배열을 돌려주고 손으로 적게 둔다.
 */
export function parseAsk(text) {
  const out = [];
  for (const piece of String(text || '').split(/[\n/,·]+/)) {
    const s = piece.trim();
    if (!s) continue;
    // '1-2교시: 5학년' / '3교시 3학년' / '5교시: 교담'
    const m = s.match(/^([\d~\-,\s]*교시|아침\s*활동|점심|방과\s*후)\s*[:：]?\s*(.*)$/);
    if (m) out.push({ period: m[1].replace(/\s+/g, ''), klass: (m[2] || '').trim(), teacher: '', note: '' });
    else if (out.length) out[out.length - 1].note = [out[out.length - 1].note, s].filter(Boolean).join(' ');
  }
  return out.filter((r) => r.period);
}

// ── 메신저용 안내문 ─────────────────────────────────────────
/** 그 날 보결 배정을 메신저에 붙일 글로 */
export function subNoticeText(date) {
  const trips = subTrips(date);
  if (!trips.length) return '';
  const d = parseYmd(date);
  const L = [`[${d.getMonth() + 1}월 ${d.getDate()}일(${WEEKDAY[d.getDay()]}) 보결 안내]`];
  for (const t of trips) {
    L.push('');
    L.push(`▷ ${t.applicant || ''} 선생님 출장${t.reason ? ` (${t.reason})` : ''}`);
    const rows = planRows(t);
    if (!rows.length) { L.push('  · 보결 미배정'); continue; }
    for (const r of rows) L.push(`  · ${rowText(r)}`);
  }
  return L.join('\n');
}

function openSubNotice(date) {
  const out = h('textarea', { class: 'input mono', rows: 12, spellcheck: 'false' });
  out.value = subNoticeText(date);
  openModal(`${fmtK(date)} 보결 안내`, h('div', {}, out,
    h('p', { class: 'muted small' },
      '교직원 메신저나 단체 대화방에 그대로 붙이세요. 고쳐서 복사해도 됩니다. ',
      '[일일 안내문] 에도 같은 내용이 함께 나갑니다.')), [
    { label: '닫기', onClick: (c) => c() },
    {
      label: '복사', class: 'btn-primary',
      onClick: async () => {
        const ok = await copyText(out.value);
        toast(ok ? '복사했습니다. 메신저에 붙여넣으세요.' : '복사에 실패했습니다.', ok ? 'ok' : 'warn');
      },
    },
  ]);
}
