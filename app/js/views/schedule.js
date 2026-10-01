// 일일 · 주간 · 월간 화면
import { h, confirmDialog, toast, labeledChips, stackOnPhone } from '../lib/dom.js';
import {
  CATEGORY, STATUS, WEEKDAY, fmtK, today, addDays, addMonths,
  weekStart, sundayStart, monthStart, monthEnd, range, parseYmd, isWeekend, ymd, occursOn,
} from '../model.js';
import { activitiesOn, recurringOn, afterSchoolFor, dayBundle, clashesOn, timetableOn, isNoMeal, cleanDetail } from '../select.js';
import { clashLabel, bellList, defaultBell, bellById, dayBellId, bellFor, describeTime } from '../conflict.js';
import { openActivityForm } from '../ui/activityForm.js';
import { openHiliteMenu, hlClass } from '../ui/hilite.js';
import { canDelete, deleteOrRequest, delTitle } from '../del.js';
import { openDayExport, openPeriodExport } from '../ui/exporter.js';
import { loadConfig } from '../config.js';
import { holidayOn } from '../lib/holidays.js';
import { isAdmin, put, remove, audit, currentUser, list } from '../store.js';
import { isChecked, toggleCheck, clearChecks, countChecked } from '../checks.js';
import { makeDraggable, makeDropTarget, canMove } from '../dragmove.js';
import { noticeBox } from './notice.js';
import { boardBox, postsIn } from './board.js';
import { memoPanel, memoComposer } from './memoview.js';
import { memosOn, memosBetween } from '../memo.js';
import { academicOn } from './academic.js';
import { tripsOn, openTripForm } from './trips.js';
import { subBox, mySubBar, aheadLine, unassignedCount, planState, planRows } from './subplan.js';

// ── 공통 조각 ───────────────────────────────────────────────
/**
 * 상태 배지.
 * '승인 완료' 는 기본 상태라 일일·주간·월간에서는 붙이지 않는다.
 * 대부분이 승인된 일정이라 배지가 도배되면 정작 봐야 할 '확인 대기' 가 묻힌다.
 * 승인 여부를 확인하러 오는 화면(승인함)에서만 showAll 로 켠다.
 */
export function statusBadge(a, { showAll = false } = {}) {
  if (!showAll && a.status === 'approved') return null;
  const s = STATUS[a.status];
  return s ? h('span', { class: `badge ${s.cls}` }, s.label) : null;
}

/**
 * @param checkDate  이 날짜 기준으로 내 체크 상태를 반영한다(빈 값이면 체크 개념 없음)
 * @param showCheck  체크박스를 그릴지. 주간 화면은 상태만 반영하고 체크박스는 안 그린다.
 */
export function activityCard(a, { compact = false, onChange, checkDate = '', showCheck = false, showStatus = false, clash = null, showDate = false, onOpen = null } = {}) {
  const chips = [['대상', a.target], ['장소', a.place], ['담당', a.owner], ['계', a.dept]];
  const canEdit = isAdmin() || a.createdBy === currentUser().name;
  const done = isChecked(checkDate, a);
  const detail = cleanDetail(a.detail);
  const card = h('div', { class: `card cat-${a.category}${hlClass(a)}${a.status === 'pending' ? ' is-pending' : ''}${done ? ' is-done' : ''}${showCheck ? ' has-check' : ''}${clash ? ' is-clash' : ''}` },
    showCheck
      ? h('label', { class: 'card-check', title: done ? '확인 표시 해제' : '확인했으면 체크하세요 (나에게만 보입니다)' },
        h('input', {
          type: 'checkbox', checked: done,
          onChange: () => toggleCheck(checkDate, a),
        }))
      : null,
    h('div', { class: 'card-time' },
      // 날짜가 섞인 목록(내 제출 등)에서는 날짜를 먼저 적는다. 없으면 어느 날 건지 모른다.
      showDate && a.date ? h('span', { class: 'card-date' }, fmtK(a.date, { year: false })) : null,
      describeTime(a) || (showDate ? '' : '—'),
      a.bellId && bellById(a.bellId)
        ? h('span', { class: 'bell-tag' }, bellById(a.bellId).name)
        : null),
    h('div', { class: 'card-main' },
      h('div', { class: 'card-title-row' },
        h('span', { class: 'card-title' }, a.title),
        a.isRecurring ? h('span', { class: 'badge st-rec' }, '상시') : statusBadge(a, { showAll: showStatus }),
        a.delReq ? h('span', { class: 'badge st-del', title: a.delReqReason || '' }, '삭제 요청') : null,
        a.needsBus ? h('span', { class: 'badge st-bus', title: a.busNote || '배차 필요' }, '\u{1F68C} 배차') : null,
        a.endDate ? h('span', { class: 'badge st-span' }, `~ ${fmtK(a.endDate, { year: false })}`) : null),
      labeledChips(chips),
      clash ? h('p', { class: 'clash-note' }, '\u26A0 ', clashLabel(clash)) : null,
      // 비고는 좁은 칸에서도 보여준다. '1-5교시 · 6-5-3-4-6년 순' 처럼
      // 시간 표기만으로는 알 수 없는 내용이 여기 들어가기 때문이다.
      // '비급식일' 은 일정이 아니라 그 날의 성격이라 위쪽 띠 한 줄로 올린다.
      detail ? h('p', { class: `card-detail${compact ? ' is-compact' : ''}` }, detail) : null,
      !compact && a.status === 'rejected' && a.rejectReason
        ? h('p', { class: 'card-reject' }, `반려 사유: ${a.rejectReason}`) : null),
    !a.isRecurring && canEdit
      ? h('div', { class: 'card-actions' },
        h('button', { class: 'icon-btn', title: '수정', onClick: () => openActivityForm(a, { onSaved: onChange }) }, '✎'),
        // 강조는 창을 열지 않고 그 자리에서 색만 바꾼다. 여러 건을 훑으며 칠하는 일이라서다.
        // 늘 쓰던 ✎ 는 자리를 지킨다. 손이 기억하는 자리를 옮기면 잘못 누른다.
        isAdmin()
          ? h('button', {
            class: `icon-btn hl-btn${a.hl ? ' on' : ''}`, title: '음영 강조 색 고르기',
            onClick: () => openHiliteMenu(a, onChange),
          }, '\u{1F3A8}')
          : null,
        h('button', {
          class: `icon-btn danger${a.delReq ? ' on' : ''}`, title: delTitle(a),
          onClick: () => deleteOrRequest(a, onChange),
        }, '✕'))
      : null);

  // 좁은 칸(주간)에서는 눌러서 그 날 일일 화면으로 간다.
  // 칸이 좁아 담당·장소가 접히고 세부 내용이 잘리는데, 여태 눌러도 아무 일이 없었다.
  // 월간은 칸을 누르면 일일로 가는데 주간만 그러지 않아 선생님들이 막다른 길을 만났다.
  if (onOpen) {
    card.classList.add('is-openable');
    const fire = () => onOpen(a);
    card.addEventListener('click', (e) => {
      // 안에 든 단추·체크칸을 누른 것이면 그쪽 일이다.
      if (e.target.closest('button, input, select, textarea, a, label')) return;
      fire();
    });
    card.tabIndex = 0;
    card.setAttribute('role', 'link');
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(); }
    });
  }

  // 좁은 칸(주간)에서만 끌어 옮긴다. 일일 화면은 세로 목록이라 끌 곳이 없다.
  if (compact && canMove(a)) {
    makeDraggable(card, a);
    card.title = onOpen
      ? '눌러서 자세히 보기 · 끌어서 다른 날짜로 옮기기'
      : '끌어서 다른 날짜로 옮길 수 있습니다';
  } else if (onOpen) {
    card.title = '눌러서 자세히 보기';
  }
  // 테를 두르는 것은 건너온 쪽(일일)의 넓은 카드다. 주간의 좁은 카드가 먼저
  // 가져가 버리면(날짜를 옮기며 주간이 한 번 더 그려진다) 정작 일일에서는 표가 안 난다.
  return compact ? card : flashIfOpened(card, a);
}

function emptyBox(msg) { return h('div', { class: 'empty' }, msg); }

/**
 * 주간에서 눌러 일일로 건너온 일정의 id.
 *
 * 주간 칸은 좁아 제목과 몇 줄만 보인다. 눌러서 그 날 일일 화면으로 가게 했는데,
 * 그 날 일정이 열 건이면 내가 누른 것이 어디 있는지 또 찾아야 한다. 건너온 뒤
 * 그 카드로 화면을 옮기고 잠깐 테를 둘러 둔다. 한 번 쓰고 비운다.
 */
let openedId = '';

/** 주간·월간에서 누른 일정을 그 날 일일 화면에서 연다. */
function openOnDay(ctx, day, a) {
  openedId = a.id;
  ctx.setDate(day);
  ctx.go('daily');
}

/** 건너온 그 카드면 화면을 옮기고 잠깐 테를 두른다. */
function flashIfOpened(node, a) {
  if (!openedId || a.id !== openedId) return node;
  openedId = '';
  node.classList.add('is-opened');
  setTimeout(() => {
    node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(() => node.classList.remove('is-opened'), 2400);
  }, 60);
  return node;
}

/** 여러 날에 걸치는 일정인가 */
export const isSpan = (a) => !!(a.endDate && a.endDate > a.date);

/**
 * 기간 일정을 [from, to] 구간의 띠로 배치한다.
 * 겹치는 띠는 위아래 줄로 나눠 서로 가리지 않게 한다.
 * @returns [{ a, start, span, lane, cutLeft, cutRight }]
 */
export function layoutBands(spans, from, to) {
  const days = range(from, to);
  const idx = (d) => days.indexOf(d);
  const lanes = [];   // lane 별로 [끝난 칸 번호]

  return spans
    .slice()
    .sort((x, y) => (x.date === y.date
      ? (y.endDate || '').localeCompare(x.endDate || '')
      : x.date.localeCompare(y.date)))
    .map((a) => {
      const s = Math.max(0, idx(a.date < from ? from : a.date));
      const eDate = a.endDate > to ? to : a.endDate;
      const e = Math.max(s, idx(eDate));
      let lane = lanes.findIndex((end) => end < s);
      if (lane < 0) { lane = lanes.length; lanes.push(-1); }
      lanes[lane] = e;
      return {
        a, start: s, span: e - s + 1, lane,
        cutLeft: a.date < from, cutRight: (a.endDate || a.date) > to,
      };
    });
}

/** 띠 하나 */
function bandNode(b, opt0 = {}) {
  const { compact = false, onClick } = opt0;
  const { a } = b;
  const node = h(onClick ? 'button' : 'div', {
    class: `band cat-${a.category}${hlClass(a)}${b.cutLeft ? ' cut-l' : ''}${b.cutRight ? ' cut-r' : ''}`,
    title: `${a.title} (${fmtK(a.date, { year: false })} ~ ${fmtK(a.endDate, { year: false })})`,
    onClick: onClick ? () => onClick(a) : undefined,
  },
    b.cutLeft ? h('span', { class: 'band-arrow' }, '\u25C0') : null,
    h('span', { class: 'band-text' }, compact ? a.title : `${a.title}${a.target ? ` · ${a.target}` : ''}`),
    a.delReq ? h('span', { class: 'band-delmark', title: '삭제 요청' }, '\u2715') : null,
    b.cutRight ? h('span', { class: 'band-arrow' }, '\u25B6') : null);
  makeDraggable(node, a);
  // 띠에도 지우는 자리를 둔다. 단추 안에 단추를 넣을 수 없어 겉을 한 번 감싼다.
  return h('div', {
    class: 'band-wrap',
    style: { gridColumn: `${b.start + 1} / span ${b.span}`, gridRow: String(b.lane + 1) },
  },
    node,
    canDelete(a)
      ? h('button', {
        class: 'band-del', title: delTitle(a),
        onClick: (e) => { e.stopPropagation(); deleteOrRequest(a, opt0.onChange); },
      }, '\u2715')
      : null);
}

/**
 * 그 날 어떤 시정으로 움직이는지 고른다.
 * 1년에 몇 번 있는 일이라 기본은 건드리지 않고 그 날짜만 예외로 둔다.
 */
function dayBellPicker(day, onChange) {
  const bells = bellList();
  const def = defaultBell();
  const cur = dayBellId(day);
  if (bells.length < 2 && !cur) return null;      // 시정이 하나뿐이면 고를 것이 없다
  if (!isAdmin()) {
    return cur && bellById(cur)
      ? h('span', { class: 'bell-tag big' }, bellById(cur).name)
      : null;
  }
  const sel = h('select', {
    class: `input date-pick bell-pick${cur ? ' is-set' : ''}`,
    title: '이 날짜의 시정. 단축수업 날에 바꿔주세요.',
    onChange: async (e) => {
      const v = e.target.value;
      if (v) await put('daybell', { id: day, bellId: v });
      else {
        const row = list('daybell').find((x) => x.id === day);
        if (row) await remove('daybell', day);
      }
      toast(v ? `${fmtK(day, { year: false })} 는 '${bellById(v).name}' 으로 봅니다.` : '기본 시정으로 되돌렸습니다.', 'ok');
      if (onChange) onChange();
    },
  },
    h('option', { value: '' }, `${def.name} (기본)`),
    ...bells.filter((b) => b.id !== def.id).map((b) => h('option', { value: b.id, selected: cur === b.id }, b.name)));
  return sel;
}

/** 중복 목록에서 그 항목을 되찾는다. */
function findById(id, acts, slots) {
  const a = acts.find((x) => x.id === id);
  if (a) return a;
  const s = (slots || []).find((x) => `tt_${x.id}` === id);
  return s ? { ...s, time: `${s.period}교시` } : null;
}

/**
 * 반복일정 한 줄. 행사와 겹칠 때 '이 날만 제외' 할 수 있어야 한다.
 * 규칙 자체를 끄면 다른 주까지 사라지므로, 그 날짜만 예외로 넣는다.
 */
function recurringRow(a, day, clash, onChange) {
  const card = activityCard(a, { compact: true, checkDate: day, showCheck: true, clash });
  if (!isAdmin()) return card;
  const btn = h('button', {
    class: 'btn btn-sm btn-danger skip-btn',
    title: '이 날짜에만 이 반복일정을 빼고, 다음 주부터는 그대로 운영합니다',
    onClick: async (e) => {
      e.stopPropagation();
      const rule = list('recurring').find((r) => r.id === a.recurringId);
      if (!rule) return;
      if (!(await confirmDialog(`${fmtK(day, { year: false })} 에만 '${a.title}' 을(를) 빼시겠습니까?\n다른 날짜는 그대로 운영됩니다.`, { okText: '이 날만 빼기' }))) return;
      const next = { ...rule, exceptions: [...(rule.exceptions || []), day] };
      await put('recurring', next);
      await audit('반복제외', rule.id, rule, next);
      toast(`${fmtK(day, { year: false })} 에는 '${a.title}' 을(를) 뺐습니다.`, 'ok');
      if (onChange) onChange();
    },
  }, '이 날만 빼기');
  card.appendChild(h('div', { class: 'card-actions' }, btn));
  return card;
}

/** 그 날 교담·특별실 시간표를 한 줄로 */
/**
 * 제목에서 학년·반 표기를 떼어낸 '과목 줄기'.
 * 꿈자람반1,2 → 꿈자람반 / 영어5,6(원어민) → 영어(원어민) / 과학5 → 과학
 * 같은 줄기끼리 세로로 줄을 세우려고 쓴다.
 */
function slotStem(title) {
  const t = String(title || '').replace(/\s+/g, '');
  return t.replace(/[\d,~\-·]+(?=\(|$)/g, '') || t;
}

/**
 * 한 칸이 설 '열'. 같은 열에 든 것끼리 세로로 줄이 선다.
 *
 * 1) 담당 선생님 이름이 적혀 있으면 그쪽이 먼저다. 한 분이 맡은 과목은 한 줄이다.
 * 2) 이름이 없으면 [설정]의 묶음을 본다. 전담 한 분이 도덕·과학·체육을 함께 맡는 것이
 *    보통인데, 칸마다 이름을 적어 두는 학교는 드물기 때문이다.
 * 3) 그것도 아니면 과목 줄기대로 선다.
 */
function slotLane(s, groups) {
  if (s.owner && String(s.owner).trim()) return `@${String(s.owner).trim()}`;
  const stem = slotStem(s.title);
  const g = groups.find((x) => x.names.has(stem));
  return g ? `#${g.key}` : stem;
}

/** [설정]의 '도덕,과학,체육' 같은 줄을 찾아보기 쉬운 꼴로 바꾼다. */
function laneGroups() {
  return (loadConfig().timetableGroups || [])
    .map((line) => String(line || '').split(',').map((x) => x.trim()).filter(Boolean))
    .filter((xs) => xs.length > 1)
    .map((xs) => ({ key: xs.join(','), names: new Set(xs) }));
}

/**
 * 교과교담·특별실 — 교시마다 한 줄, 같은 과목은 같은 자리.
 *
 * 전에는 칩을 쭉 늘어놓아 '1교시' 가 칸마다 되풀이됐다. 교시를 왼쪽에 한 번만
 * 세우고, 과목 줄기별로 열을 고정해 세로로도 눈이 따라가게 한다.
 * (5교시에 영어만 있어도 영어 자리에 선다)
 */
function timetableGrid(slots, clash) {
  const periods = [...new Set(slots.map((s) => Number(s.period) || 0))].sort((a, b) => a - b);

  const groups = laneGroups();

  // 열 차례 — 처음 나온 순서대로. 대개 특별실·교담이 쓰던 차례와 같다.
  const cols = [];
  for (const p of periods) {
    for (const s of slots.filter((x) => Number(x.period) === p)) {
      const k = slotLane(s, groups);
      if (!cols.includes(k)) cols.push(k);
    }
  }

  const chip = (s) => {
    const hits = clash.get(`tt_${s.id}`);
    return h('span', {
      class: `ttg-item kind-${s.kind}${hits ? ' is-clash' : ''}`,
      title: hits ? clashLabel(hits) : [s.title, s.target, s.place, s.owner, s.note].filter(Boolean).join(' · '),
    },
      hits ? h('span', { class: 'clash-mark' }, '\u26A0') : null,
      s.title,
      s.note ? h('span', { class: 'ttg-note' }, s.note) : null);
  };

  return h('div', { class: 'ttg', style: { '--cols': cols.length } },
    ...periods.map((p) => {
      const mine = slots.filter((x) => Number(x.period) === p);
      return h('div', { class: 'ttg-row' },
        h('span', { class: 'ttg-p' }, `${p}교시`),
        ...cols.map((k) => {
          const here = mine.filter((x) => slotLane(x, groups) === k);
          return h('span', { class: `ttg-cell${here.length ? '' : ' is-empty'}` }, ...here.map(chip));
        }));
    }));
}

/** 월간 칸의 '+N' — 올리면(또는 눌러 초점이 가면) 가려진 일정을 펼쳐 보인다. */
function morePop(label, cls, items) {
  return h('span', { class: `${cls} has-pop`, tabindex: '0' }, label,
    h('span', { class: 'month-pop', role: 'tooltip' },
      ...items.map(([time, title, pending]) => h('span', { class: 'month-pop-item' },
        time ? h('span', { class: 'month-pop-time' }, time) : null,
        title,
        pending ? h('span', { class: 'month-pop-pend' }, '대기') : null))));
}

/** 일일 화면의 기간 일정 — 며칠째인지 함께 보여준다. */
function spanCard(a, day, onChange) {
  const days = range(a.date, a.endDate);
  const nth = days.indexOf(day) + 1;
  return flashIfOpened(h('div', { class: `band band-day cat-${a.category}${hlClass(a)}` },
    h('span', { class: 'band-text' }, a.title),
    h('span', { class: 'band-meta' },
      `${fmtK(a.date, { year: false })} ~ ${fmtK(a.endDate, { year: false })}`,
      nth > 0 ? ` · ${nth}일째/${days.length}일` : ''),
    labeledChips([['대상', a.target], ['장소', a.place], ['담당', a.owner]]),
    a.delReq ? h('span', { class: 'badge st-del', title: a.delReqReason || '' }, '삭제 요청') : null,
    // 기간 일정에는 지우는 자리가 아예 없었다. 잘못 올리면 손댈 방법이 없었다.
    canDelete(a)
      ? h('span', { class: 'band-tools' },
        h('button', {
          class: 'icon-btn', title: '수정',
          onClick: () => openActivityForm(a, { onSaved: onChange }),
        }, '\u270E'),
        isAdmin()
          ? h('button', {
            class: `icon-btn hl-btn${a.hl ? ' on' : ''}`, title: '음영 강조 색 고르기',
            onClick: () => openHiliteMenu(a, onChange),
          }, '\u{1F3A8}')
          : null,
        h('button', {
          class: `icon-btn danger${a.delReq ? ' on' : ''}`, title: delTitle(a),
          onClick: () => deleteOrRequest(a, onChange),
        }, '\u2715'))
      : null), a);
}

/** 7칸짜리 띠 영역 (주간·월간 공통) */
function bandGrid(bands, opt) {
  if (!bands.length) return null;
  const lanes = Math.max(...bands.map((b) => b.lane)) + 1;
  return h('div', {
    class: 'band-grid',
    style: { gridTemplateRows: `repeat(${lanes}, auto)` },
  }, ...bands.map((b) => bandNode(b, opt)));
}

/** '확인 2/5' 와 초기화 버튼. 체크는 사람마다 따로라 안내 문구를 함께 둔다. */
function progressNode(date, items, rerender) {
  if (!items.length) return null;
  const done = countChecked(date, items);
  return h('div', { class: 'row gap' },
    h('span', { class: `progress${done === items.length ? ' all-done' : ''}` },
      done === items.length ? `확인 완료 ${done}/${items.length}` : `확인 ${done}/${items.length}`),
    h('span', { class: 'muted small' }, '체크는 나에게만 보입니다'),
    done
      ? h('button', {
        class: 'btn btn-sm',
        onClick: async () => { await clearChecks(date); rerender(); },
      }, '내 체크 지우기')
      : null);
}

function section(title, nodes, extra) {
  return h('section', { class: 'sec' },
    h('div', { class: 'sec-head' }, h('h3', {}, title), extra || null),
    ...(nodes.length ? nodes : [emptyBox('등록된 내용이 없습니다.')]));
}

/**
 * 접었다 펼 수 있는 구역.
 * 편 채로 시작하고, 접으면 그대로 기억한다(이 컴퓨터에만).
 */
function foldSection(key, title, body, extra) {
  const K = `sam.fold.${key}`;
  let open = true;
  try { open = localStorage.getItem(K) !== '0'; } catch { /* 저장 못 해도 편 채로 */ }

  const wrap = h('section', { class: `sec sec-fold${open ? '' : ' is-closed'}` });
  const arrow = h('span', { class: 'fold-arrow' }, open ? '\u25BC' : '\u25B6');
  const inner = h('div', { class: 'fold-body' }, body);
  if (!open) inner.style.display = 'none';

  const toggle = () => {
    open = !open;
    arrow.textContent = open ? '\u25BC' : '\u25B6';
    inner.style.display = open ? '' : 'none';
    wrap.classList.toggle('is-closed', !open);
    try { localStorage.setItem(K, open ? '1' : '0'); } catch { /* 무시 */ }
  };

  wrap.append(
    h('div', { class: 'sec-head' },
      h('button', {
        class: 'fold-btn', title: open ? '접기' : '펴기', onClick: toggle,
      }, arrow, h('h3', {}, title)),
      extra || null),
    inner);
  return wrap;
}

export function afterSchoolTableNode(programs) {
  if (!programs.length) return emptyBox('이 날짜에 운영하는 방과후 강좌가 없습니다.');
  return h('div', { class: 'table-wrap' },
    stackOnPhone(h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {},
        ...['시간', '강좌명', '대상', '장소', '강사', '인원'].map((t) => h('th', {}, t)))),
      h('tbody', {}, ...programs.map((p) => h('tr', {},
        h('td', { class: 'nowrap' }, p.time || '—'),
        h('td', { class: 'strong' }, p.name || ''),
        h('td', {}, p.grade || ''),
        h('td', {}, p.room || ''),
        h('td', {}, p.teacher || ''),
        h('td', {}, [p.enrolled, p.capacity].filter(Boolean).join(' / ') || ''))))), 2));
}

// ── 일일 ───────────────────────────────────────────────────
export function renderDaily(ctx) {
  const d = ctx.date;
  const acts = activitiesOn(d);
  // 여러 날 걸치는 일정은 시간이 없어 맨 아래로 밀리곤 했다. 맨 위 띠로 따로 뺀다.
  const spans = acts.filter((a) => a.status === 'approved' && isSpan(a));
  const approved = acts.filter((a) => a.status === 'approved' && !isSpan(a));
  const pending = acts.filter((a) => a.status === 'pending');
  const rejected = acts.filter((a) => a.status === 'rejected');
  const rec = recurringOn(d);
  const after = afterSchoolFor(d);
  const slots = timetableOn(d);
  const clash = clashesOn(d);
  const trips = tripsOn(d);
  const myMemos = memosOn(d);
  const rerender = () => ctx.refresh();
  const cl = (a) => clash.get(a.id) || null;

  return h('div', { class: 'view' },
    dateBar(ctx, {
      label: fmtK(d),
      onPrev: () => ctx.setDate(addDays(d, -1)),
      onNext: () => ctx.setDate(addDays(d, 1)),
      picker: h('span', { class: 'row gap' },
        h('input', { type: 'date', class: 'input date-pick', value: d, onChange: (e) => ctx.setDate(e.target.value) }),
        dayBellPicker(d, rerender)),
      actions: [
        h('button', {
          class: 'btn btn-primary btn-add',
          title: '이 날짜에 교육활동을 올립니다. 관리자 확인 뒤 모두에게 보입니다.',
          onClick: () => openActivityForm(null, { defaultDate: d, onSaved: rerender }),
        }, '\u2795 일정 추가'),
        h('button', { class: 'btn', onClick: () => openDayExport(d) }, '일일 안내문'),
      ],
    }),

    // 내가 보결로 들어가는 날이면 맨 위에 띄운다. 그 날 가장 중요한 알림이다.
    mySubBar(d),

    // 급식이 없는 날은 그 날 화면에서 바로 보여야 한다. 문서를 열어야 아는 것이 아니라.
    isNoMeal(d)
      ? h('div', { class: 'nomeal-bar' },
        h('span', { class: 'nomeal-ico' }, '\u{1F37D}'),
        h('div', {}, h('b', {}, '비급식일'), ' — 이 날은 급식이 없습니다.'))
      : null,

    (() => {
      const off = holidayOn(d);
      return off
        ? h('div', { class: 'holiday-bar' },
            h('span', { class: 'holiday-ico' }, '\u{1F6CC}'),
            h('div', {},
              h('b', {}, off),
              h('span', { class: 'muted small' },
                ' 수업이 없는 날입니다. 상시·반복 일정은 이 날 돌지 않습니다.')))
        : null;
    })(),

    // 오늘 요약 — 아침에 열고 3초 안에 '오늘 나한테 뭐가 있지' 가 보이게.
    // 보결이 있는 날은 그 칸이 주황으로 선다.
    (() => {
      const subs = trips.filter((t) => t.needsSub).length;
      // 숫자가 주황으로 서는 것은 '아직 들어갈 사람을 못 정한' 건이 있을 때다.
      const subLeft = isAdmin() ? unassignedCount(d) : 0;
      const posts = postsIn(d, d).length;
      const tile = (n, label, hot) => h('div', { class: `sum-tile${hot ? ' hot' : ''}` },
        h('b', {}, n), h('span', {}, label));
      return h('div', { class: 'sum-strip', role: 'group', 'aria-label': '오늘 요약' },
        tile(approved.length + spans.length, '교육활동'),
        tile(slots.length, '교담'),
        tile(subs, '보결', isAdmin() ? subLeft > 0 : subs > 0),
        tile(posts, '공지'));
    })(),

    pending.length
      ? section(`확인 대기 ${pending.length}건`, pending.map((a) => activityCard(a, { onChange: rerender, checkDate: d, clash: cl(a) })),
        isAdmin() ? h('button', { class: 'btn btn-sm', onClick: () => ctx.go('approvals') }, '승인함에서 처리') : null)
      : null,

    // 앞으로 못 정한 보결이 있으면 한 줄로만. 관리자만 본다.
    aheadLine(d, ctx),

    // 보결이 필요한 날에만 뜨는 체크리스트. 관리자만 본다.
    // '확인 대기' 바로 아래 둔다. 그 날 관리 선생님이 해야 할 일이고, 아침에 화면을
    // 내리기 전에 눈에 들어와야 그 날 수업이 빈 채로 시작되지 않는다.
    subBox(d, rerender),

    // 공지는 일일과 주간이 같은 것을 본다. 기간이 오늘에 걸치면 여기 뜬다.
    boardBox(d, d, { title: '공지사항', refresh: rerender }),

    // 학사일정은 **이 화면에 아직 없는 것만** 띄운다.
    // 학사일정을 올려 두면 같은 것이 교육활동으로도 들어와, 한 날에 두 번 적히기 때문이다.
    // 공휴일은 위 띠가 이미 말하고 있으니 여기서 또 말하지 않는다.
    (() => {
      const bare = (t) => String(t || '').replace(/\s+/g, '').replace(/[(（].*$/, '');
      const shown = new Set([...approved, ...pending, ...rejected, ...spans, ...rec, ...trips]
        .map((x) => bare(x.title || x.reason)).filter(Boolean));
      const off = holidayOn(d);
      if (off) shown.add(bare(off));
      const acad = academicOn(d).filter((a) => !shown.has(bare(a.title)));
      if (!acad.length) return null;
      return h('section', { class: 'sec sec-acad' },
        h('div', { class: 'sec-head' },
          h('h3', {}, '\u{1F4C5} 학사일정'),
          h('button', { class: 'btn btn-sm', onClick: () => ctx.go('academic') }, '학사일정 전체')),
        h('div', { class: 'chips' }, ...acad.map((a) => h('span', { class: 'acad-pill' }, a.title))));
    })(),

    clash.size
      ? h('section', { class: 'sec sec-clash' },
        h('div', { class: 'sec-head' },
          h('h3', {}, `중복 ${clash.size}건`),
          h('span', { class: 'muted small' }, '겹쳐도 되는 것이면 그대로 두셔도 됩니다')),
        h('ul', { class: 'clash-list' },
          ...[...clash.entries()].map(([id, hits]) => {
            const me = hits[0].other && findById(id, [...approved, ...pending, ...rec, ...spans], slots);
            return h('li', {},
              h('strong', {}, me ? `${me.time || ''} ${me.title}` : id),
              ' — ', clashLabel(hits));
          })))
      : null,

    spans.length
      ? h('section', { class: 'sec sec-span' },
        h('div', { class: 'sec-head' }, h('h3', {}, `기간 운영 ${spans.length}건`),
          h('span', { class: 'muted small' }, '오늘을 포함해 여러 날 이어지는 활동입니다')),
        ...spans.map((a) => spanCard(a, d, rerender)))
      : null,

    section('교육활동', approved.map((a) => activityCard(a, { onChange: rerender, checkDate: d, showCheck: true, clash: cl(a) })),
      progressNode(d, [...spans, ...approved, ...rec], rerender)),
    section('상시·반복 운영', rec.map((a) => recurringRow(a, d, cl(a), rerender)),
      isAdmin() ? h('button', { class: 'btn btn-sm', onClick: () => ctx.go('recurring') }, '반복일정 관리') : null),

    slots.length
      ? foldSection('daily-tt', `교과교담·특별실 ${slots.length}칸`,
        timetableGrid(slots, clash),
        h('button', { class: 'btn btn-sm', onClick: () => ctx.go('timetable') }, isAdmin() ? '시간표 관리' : '주간 시간표'))
      : null,
    section('방과후학교', [afterSchoolTableNode(after)],
      h('button', { class: 'btn btn-sm', onClick: () => ctx.go('afterschool') }, isAdmin() ? '강좌 관리' : '강좌 전체')),

    rejected.length ? section('반려된 일정', rejected.map((a) => activityCard(a, { onChange: rerender }))) : null,

    h('section', { class: 'sec' },
      h('div', { class: 'sec-head' },
        h('h3', {}, `\u{1F697} 출장 ${trips.length}건`),
        h('div', { class: 'row gap' },
          h('button', { class: 'btn btn-sm', onClick: () => openTripForm({ date: d }, rerender) }, '+ 출장 신청'),
          h('button', { class: 'btn btn-sm', onClick: () => ctx.go('trips') }, '출장 현황'))),
      trips.length
        ? h('div', { class: 'trip-strip' }, ...trips.map((t) => h('span', {
          class: `trip-pill${t.needsSub ? ' need-sub' : ''}${t.status === 'pending' ? ' is-pending' : ''}`,
          title: [t.reason, t.place, t.needsSub ? `보결: ${t.subNote || '교시 미기재'}` : ''].filter(Boolean).join(' · '),
        },
          h('strong', {}, t.applicant),
          t.time ? h('span', { class: 'muted small' }, t.time) : null,
          // 보결을 들어갈 선생님이 알아야 할 건 '몇 교시·몇 반' 이다. 마우스를 올려야
          // 보이던 것을 칩에 그대로 붙인다(휴대전화에는 마우스가 없다).
          t.needsSub ? h('span', { class: 'badge badge-sub' }, '보결') : null,
          // 관리자에게는 '누가 들어가는지' 를, 다른 분들께는 전처럼 요청 글만 적는다.
          // 들어가실 분은 맨 위 띠로 따로 알고 있으니, 모두의 화면에 이름을 늘어놓지 않는다.
          t.needsSub
            ? h('span', { class: 'trip-sub-note' },
              isAdmin() && planState(t) === 'done'
                ? planRows(t).map((r) => `${[r.period, r.klass].filter(Boolean).join(' ')} ${r.teacher}`).join(' / ')
                : (t.subNote || '교시 미기재'))
            : null,
          t.needsSub && isAdmin() && planState(t) !== 'done'
            ? h('span', { class: 'badge st-rejected' }, '미배정') : null)))
        : h('div', { class: 'empty' }, '이 날짜에 등록된 출장이 없습니다.')),

    h('section', { class: 'sec sec-memo' },
      h('div', { class: 'sec-head' },
        h('h3', {}, `\u{1F4DD} 내 메모`),
        h('span', { class: 'muted small' }, '나에게만 보입니다')),
      memoPanel(rerender, {
        filter: () => myMemos,
        emptyText: '이 날짜에 걸린 내 메모가 없습니다. 아래에 적으면 이 날짜로 붙습니다.',
      }),
      memoComposer(rerender, { date: d })),
  );
}

// ── 주간 ───────────────────────────────────────────────────
export function renderWeekly(ctx) {
  const from = weekStart(ctx.date);
  const to = addDays(from, 6);
  const days = range(from, to);
  const rerender = () => ctx.refresh();

  return h('div', { class: 'view' },
    dateBar(ctx, {
      label: `${fmtK(from, { weekday: false })} ~ ${fmtK(to, { weekday: false, year: false })}`,
      onPrev: () => ctx.setDate(addDays(from, -7)),
      onNext: () => ctx.setDate(addDays(from, 7)),
      actions: [
        h('button', { class: 'btn', onClick: () => openPeriodExport(from, to, '주간활동계획', 'weekly') }, '주간활동계획 내보내기'),
      ],
    }),
    boardBox(from, to, { title: '이번 주 공지사항', refresh: rerender }),

    (() => {
      const mine = memosBetween(from, to);
      return mine.length
        ? h('section', { class: 'sec sec-memo' },
          h('div', { class: 'sec-head' },
            h('h3', {}, '\u{1F4DD} 이번 주 내 메모'),
            h('span', { class: 'muted small' }, '나에게만 보입니다')),
          memoPanel(rerender, { filter: () => mine, compact: true }))
        : null;
    })(),

    catLegend(),
    weekBands(from, to, ctx),
    (() => {
      // 칸에 실제로 올라갈 것을 먼저 센다. 비었는지, 주말 칸을 넓혀야 하는지가 여기서 갈린다.
      const cols = days.map((day) => {
        const b = dayBundle(day, { onlyApproved: false });
        // 기간 일정은 위쪽 띠에 이미 나와 있으므로 칸 안에서는 뺀다
        const acts = b.activities.filter((a) => !isSpan(a));
        // 매일 도는 반복일정은 주마다 스무 번씩 되풀이돼 피로하다.
        // 반복일정 탭에서 '주간·월간' 을 꺼둔 것은 여기서 뺀다(일일에는 그대로 나온다).
        const recs = b.recurring.filter((a) => a.showInPlan !== false);
        return { day, b, acts, recs, empty: !acts.length && !recs.length && !b.afterSchool.length };
      });
      // 토·일은 대개 비어 있다. 평일과 같은 폭을 주면 평일 제목이 세 줄로 꺾인다.
      // 비었으면 평일의 절반, 일정이 있으면 평일만큼.
      const w = (c) => (c.empty ? 'minmax(0, .5fr)' : 'minmax(0, 1fr)');
      return h('div', { class: 'week-grid', style: { '--sat': w(cols[5]), '--sun': w(cols[6]) } },
        ...cols.map(({ day, b, acts, recs, empty }) => {
      const pend = b.activities.filter((a) => a.status === 'pending').length;
      const off = holidayOn(day);
      const col = h('div', {
        class: `week-col${day === today() ? ' is-today' : ''}`
          + `${isWeekend(day) ? ' is-weekend' : ''}${off ? ' is-holiday' : ''}${empty ? ' is-empty' : ''}`,
        dataset: { day },
      },
        h('button', {
          class: 'week-head', onClick: () => { ctx.setDate(day); ctx.go('daily'); },
          title: off ? `${off} — 수업 없음` : '이 날짜의 일일 화면으로',
        },
          h('span', { class: 'week-dow' }, WEEKDAY[parseYmd(day).getDay()]),
          h('span', { class: 'week-date' }, parseYmd(day).getDate()),
          off ? h('span', { class: 'week-off' }, off) : null,
          isNoMeal(day) ? h('span', { class: 'nomeal-tag', title: '비급식일 — 급식 없음' }, '\u{1F37D} 비급식') : null,
          pend ? h('span', { class: 'dot-pending', title: `확인 대기 ${pend}건` }, pend) : null),
        h('button', {
          class: 'cell-add wk', title: `${fmtK(day, { year: false })}에 일정 추가`,
          onClick: () => openActivityForm(null, { defaultDate: day, onSaved: rerender }),
        }, '\uFF0B'),
        h('div', { class: 'week-body' },
          ...acts.map((a) => activityCard(a, {
            compact: true, onChange: rerender, checkDate: day,
            onOpen: () => openOnDay(ctx, day, a),
          })),
          ...recs.map((a) => activityCard(a, {
            compact: true, checkDate: day,
            onOpen: () => openOnDay(ctx, day, a),
          })),
          b.afterSchool.length
            ? h('button', {
              class: 'mini-after', title: `${fmtK(day, { year: false })} 방과후 강좌 보기`,
              onClick: () => { ctx.setDate(day); ctx.go('daily'); },
            }, `방과후 ${b.afterSchool.length}강좌`)
            : null,
          empty ? h('div', { class: 'empty sm' }, '—') : null));
      return makeDropTarget(col, day);
    }));
    })());
}

function weekBands(from, to, ctx) {
  const spans = list('activities')
    .filter((a) => a.status !== 'rejected' && isSpan(a) && a.date <= to && a.endDate >= from);
  if (!spans.length) return null;
  const bands = layoutBands(spans, from, to);
  return h('div', { class: 'week-bandwrap' },
    h('div', { class: 'band-label' }, '기간 운영'),
    bandGrid(bands, {
      // 지난 주에 시작한 것이면 그 시작일이 아니라 보고 있는 주의 첫날로 간다.
      onClick: (a) => openOnDay(ctx, a.date < from ? from : a.date, a),
      onChange: () => ctx.refresh(),
    }));
}

/**
 * 분류 색 범례. 카드 왼쪽 띠와 월간 칸의 색이 분류를 뜻하는데 어디에도 적혀 있지 않았다.
 */
function catLegend() {
  return h('div', { class: 'cat-legend', 'aria-label': '분류 색' },
    ...Object.entries(CATEGORY).map(([k, v]) =>
      h('span', { class: `cat-key cat-${k}` }, h('i', { 'aria-hidden': 'true' }), v)));
}

// ── 월간 ───────────────────────────────────────────────────
export function renderMonthly(ctx) {
  const first = monthStart(ctx.date);
  const last = monthEnd(ctx.date);
  // 머리글이 일·월·화… 이므로 달력 격자도 일요일에서 시작해야 칸이 맞는다.
  const gridStart = sundayStart(first);
  const gridEnd = addDays(sundayStart(last), 6);
  const mm = first.slice(0, 7);

  // 주 단위로 나눠야 여러 날짜에 걸친 띠를 그릴 수 있다.
  const weeks = [];
  for (let w = gridStart; w <= gridEnd; w = addDays(w, 7)) weeks.push(w);
  const allSpans = list('activities').filter((a) => a.status !== 'rejected' && isSpan(a));

  const goDay = (day) => { ctx.setDate(day); ctx.go('daily'); };

  return h('div', { class: 'view' },
    dateBar(ctx, {
      label: `${parseYmd(first).getFullYear()}년 ${parseYmd(first).getMonth() + 1}월`,
      onPrev: () => ctx.setDate(addMonths(ctx.date, -1)),
      onNext: () => ctx.setDate(addMonths(ctx.date, 1)),
      actions: [
        h('button', { class: 'btn', onClick: () => openPeriodExport(first, last, '월중 교육활동계획', 'monthly') }, '월중계획 내보내기'),
      ],
    }),
    catLegend(),
    h('div', { class: 'month-dows' },
      ...WEEKDAY.map((w, i) => h('div', { class: `month-dow${i === 0 || i === 6 ? ' is-weekend' : ''}` }, w))),
    ...weeks.map((ws) => {
      const we = addDays(ws, 6);
      const bands = layoutBands(allSpans.filter((a) => a.date <= we && a.endDate >= ws), ws, we);
      const lanes = bands.length ? Math.max(...bands.map((b) => b.lane)) + 1 : 0;
      return h('div', { class: 'month-week', style: { '--bands': lanes } },
        h('div', { class: 'month-days' }, ...range(ws, we).map((day) => {
          const out = day.slice(0, 7) !== mm;
          const acts = activitiesOn(day).filter((a) => !isSpan(a));
          // 월간 칸의 '상시 N' 도 계획에 띄우기로 한 것만 센다.
          const rec = recurringOn(day).filter((r) => r.showInPlan !== false);
          const off = holidayOn(day);
          const wd = parseYmd(day).getDay();
          const cell = h('button', {
            class: `month-cell${out ? ' is-out' : ''}${day === today() ? ' is-today' : ''}`
              + `${isWeekend(day) ? ' is-weekend' : ''}${wd === 0 ? ' is-sun' : ''}${wd === 6 ? ' is-sat' : ''}`
              + `${off ? ' is-holiday' : ''}`,
            dataset: { day },
            onClick: () => goDay(day),
            title: off || '',
          },
            h('span', { class: 'month-num' }, parseYmd(day).getDate()),
            // 달력에서 날짜를 보고 바로 올릴 수 있게 한다. 붙여넣기보다 이 길이 쉽다.
            // 칸 자체가 단추라 그 안에 단추를 또 넣을 수 없어 눌리는 span 으로 둔다.
            h('span', {
              class: 'cell-add', role: 'button', tabindex: '0',
              title: `${fmtK(day, { year: false })}에 일정 추가`,
              onClick: (e) => { e.stopPropagation(); e.preventDefault(); openActivityForm(null, { defaultDate: day, onSaved: () => ctx.refresh() }); },
              onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); openActivityForm(null, { defaultDate: day, onSaved: () => ctx.refresh() }); } },
            }, '\uFF0B'),
            off ? h('span', { class: 'month-off', title: off }, off) : null,
            isNoMeal(day) ? h('span', { class: 'nomeal-tag sm', title: '비급식일 — 급식 없음' }, '\u{1F37D} 비급식') : null,
            lanes ? h('span', { class: 'month-bandspace' }) : null,
            ...acts.slice(0, 3).map((a) => makeDraggable(h('span', {
              class: `month-item cat-${a.category}${hlClass(a)}${a.status === 'pending' ? ' is-pending' : ''}`
                + `${a.needsBus ? ' needs-bus' : ''}${a.delReq ? ' is-delreq' : ''}`,
              title: a.needsBus
                ? `${a.title} — 배차 필요: ${a.busNote || '(내용 없음)'}`
                : (canMove(a) ? `${a.title} — 눌러서 자세히, 끌어서 옮기기` : `${a.title} — 눌러서 자세히`),
              // 칸 전체를 눌러도 그 날로 가지만, 일정을 콕 집어 누르면 그 카드로 데려간다.
              onClick: (e) => { e.stopPropagation(); openOnDay(ctx, day, a); },
            },
              a.needsBus ? h('span', { class: 'bus-dot' }, '\u{1F68C}') : null,
              h('span', { class: 'mi-text' }, a.title),
              // 칸 전체가 단추라 그 안에 단추를 또 넣을 수 없다. 눌리는 span 으로 둔다.
              canDelete(a)
                ? h('span', {
                  class: 'mi-del', role: 'button', tabindex: '0', title: delTitle(a),
                  onClick: (e) => { e.stopPropagation(); e.preventDefault(); deleteOrRequest(a, () => ctx.refresh()); },
                  onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); deleteOrRequest(a, () => ctx.refresh()); } },
                }, '\u2715')
                : null), a)),
            // 가려진 것은 마우스를 올리면 작은 목록으로 펼친다.
            // title 풍선은 늦게 뜨고 한 줄로 뭉개져서, 올려도 안 보인다는 말을 들었다.
            acts.length > 3
              ? morePop(`+${acts.length - 3}`, 'month-more', acts.slice(3).map((a) => [a.time, a.title, a.status === 'pending']))
              : null,
            rec.length
              ? morePop(`+ 반복 ${rec.length}`, 'month-rec', rec.map((r) => [r.time, r.title, false]))
              : null);
          return makeDropTarget(cell, day);
        })),
        bandGrid(bands, { compact: true, onClick: (a) => openOnDay(ctx, a.date, a), onChange: () => ctx.refresh() }));
    }),

    // 배차가 필요한 활동만 따로 모은다.
    // 교무행정사가 한 달 치를 미리 보고 신청해야 하므로, 달력 칸만으로는 부족하다.
    (() => {
      const bus = range(first, last)
        .flatMap((d) => activitiesOn(d).filter((a) => a.needsBus && a.date === d))
        .sort((x, y) => x.date.localeCompare(y.date));
      if (!bus.length) return null;
      return h('section', { class: 'sec sec-bus' },
        h('div', { class: 'sec-head' },
          h('h3', {}, '\u{1F68C} 배차가 필요한 교육활동 ', h('span', { class: 'sec-count' }, bus.length)),
          h('span', { class: 'muted small' }, '미리 배차를 신청해 주세요')),
        h('div', { class: 'table-wrap' },
          stackOnPhone(h('table', { class: 'tbl bus-tbl' },
            h('thead', {}, h('tr', {},
              h('th', {}, '날짜'), h('th', {}, '교육활동'), h('th', {}, '대상'),
              h('th', {}, '배차 내용'), h('th', {}, '담당'))),
            h('tbody', {}, ...bus.map((a) => h('tr', {
              class: a.status === 'pending' ? 'is-pending' : '',
            },
              h('td', {}, fmtK(a.date, { year: false })),
              h('td', {}, h('b', {}, a.title),
                a.status === 'pending' ? h('span', { class: 'badge st-pending' }, '확인 대기') : null),
              h('td', {}, a.target || ''),
              h('td', { class: 'bus-note' }, a.busNote || h('span', { class: 'warn-inline' }, '내용 미기재')),
              h('td', {}, a.owner || a.dept || ''))))), 2)));
    })(),

    noticeBox('focus', mm, {
      title: `${parseYmd(first).getMonth() + 1}월 중점지도 내용`,
      placeholder: '월간 주간교육활동 한글 문서에 들어가는 이 달의 중점지도 내용을 적으세요.',
      onChange: () => ctx.refresh(),
    }),

    (() => {
      const mine = memosBetween(first, last);
      return mine.length
        ? h('section', { class: 'sec sec-memo' },
          h('div', { class: 'sec-head' },
            h('h3', {}, '\u{1F4DD} 이 달 내 메모'),
            h('span', { class: 'muted small' }, '나에게만 보입니다')),
          memoPanel(() => ctx.refresh(), { filter: () => mine, compact: true }))
        : null;
    })());
}

// ── 날짜 이동 막대 ──────────────────────────────────────────
function dateBar(ctx, { label, onPrev, onNext, picker, actions = [] }) {
  // 날짜 글자를 누르면 날짜 고르는 창을 연다. 휴대전화에서는 날짜 입력 칸을 숨기므로
  // (첫 화면의 3분의 1을 먹었다) 이것이 날짜를 건너뛰는 길이 된다.
  const input = picker && picker.querySelector ? picker.querySelector('input[type=date]') : null;
  const openPick = () => {
    if (!input) return;
    try { input.showPicker(); } catch { input.focus(); input.click(); }
  };
  return h('div', { class: 'datebar' },
    h('div', { class: 'datebar-nav' },
      h('button', { class: 'icon-btn', title: '이전', onClick: onPrev }, '‹'),
      input
        ? h('button', { class: 'datebar-label as-link', title: '날짜 고르기', onClick: openPick }, label)
        : h('strong', { class: 'datebar-label' }, label),
      h('button', { class: 'icon-btn', title: '다음', onClick: onNext }, '›'),
      h('button', { class: 'btn btn-sm', onClick: () => ctx.setDate(today()) }, '오늘'),
      picker || null),
    h('div', { class: 'datebar-actions' }, ...actions));
}

export { list, put, ymd };
