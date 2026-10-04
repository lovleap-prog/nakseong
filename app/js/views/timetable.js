// 주간 시간표 탭 — 교과교담(과학·도덕·체육…)과 특별실 순회(꿈자람반·보건·영양·국악·원어민)
//
// 주마다 조금씩 달라지기 때문에 '주 단위'로 따로 둔다.
// 한 칸(요일×교시)에 여러 개가 들어갈 수 있다. 실제 교담 시간표가 그렇게 생겼다.
// 관리자만 고칠 수 있고, 교사는 보기만 한다.
import { h, openModal, toast, confirmDialog, clear } from '../lib/dom.js';
import { parseTimetableGrid, parseTimetableLines, parsePastedGrid } from '../lib/ttparse.js';
import { readHwpx } from '../lib/hwpx-read.js';
import { readXlsx } from '../lib/xlsx-read.js';
import { WEEKDAY, newSlot, weekStart, addDays, fmtK, range, today, parseYmd } from '../model.js';
import { noticeBox } from './notice.js';
import { holidayOn } from '../lib/holidays.js';
import { list, put, putMany, remove, isAdmin, audit } from '../store.js';
import { periodTable, clashReasons } from '../conflict.js';
import { occupancyOn } from '../select.js';
import { makeDraggable } from '../dragmove.js';

const DOWS = [1, 2, 3, 4, 5];

// '기본 시간표' 는 어느 주에도 속하지 않는 한 벌이다. 주 이름 자리에 날짜 대신
// 이 표를 넣어 같은 칸에 함께 둔다. 다른 곳은 모두 week 가 'YYYY-MM-DD' 인지로
// 걸러 보기 때문에, 이 한 벌은 주간 화면·계획 문서 어디에도 새어 나가지 않는다.
export const BASE_WEEK = 'base';
// 조각 모음. 주마다 과목이 갈아 끼워지는 학교가 많아, 쓰던 과목을 옆에 늘어놓고
// 끌어다 넣게 한다. 같은 timetable 컬렉션에 두어 서버 규칙을 더 손대지 않는다.
export const PIECE_WEEK = 'pieces';
const pieceList = () => list('timetable').filter((s) => s.week === PIECE_WEEK && s.title)
  .sort((a, b) => Number(a.period || 0) - Number(b.period || 0)
    || String(a.title).localeCompare(String(b.title), 'ko'));
const baseSlots = () => list('timetable').filter((s) => s.week === BASE_WEEK && s.title)
  .sort((a, b) => a.dow - b.dow || a.period - b.period);

// 복사해 둔 칸/요일. 화면을 다시 그려도 남아 있도록 모듈 수준에 둔다.
let clip = null;   // { type:'cell'|'day', label, items:[{title,kind,target,place,owner,note,period?,dow?}] }

// 고른 칸들. 하나씩 지우기가 번거로워 여러 개를 골라 한 번에 지우고 복사한다.
let selMode = false;
let sel = new Set();
const clearSel = () => { sel = new Set(); };
const stripId = (x) => {
  const { id, week, ...rest } = x;
  return rest;
};

export function renderTimetable(ctx) {
  const wk = weekStart(ctx.date);
  const periods = periodTable();
  const slots = list('timetable').filter((s) => s.week === wk);
  const admin = isAdmin();
  const refresh = () => ctx.refresh();

  // 이 주에 실제로 쓰는 교시까지만 그린다(빈 줄이 길게 남지 않게).
  const used = slots.length ? Math.max(...slots.map((s) => Number(s.period) || 1)) : 6;
  const rows = Math.min(periods.length, Math.max(6, used + 1));

  // 중복 표시 — 시간표 안에서만 보는 게 아니라 그 날 교육활동·반복일정까지 함께 본다.
  const clash = new Map();
  for (const d of DOWS) {
    const date = addDays(wk, d - 1);
    const all = occupancyOn(date);
    for (const s of slots.filter((x) => Number(x.dow) === d)) {
      const me = { ...s, time: `${s.period}교시`, id: `tt_${s.id}` };
      const hits = all
        .filter((o) => o.id !== me.id)
        .map((o) => ({ other: o, why: clashReasons(me, o) }))
        .filter((x) => x.why.length);
      if (hits.length) clash.set(s.id, hits);
    }
  }

  const grid = h('div', { class: 'tt-grid', style: { '--rows': rows } },
    h('div', { class: 'tt-corner' }, '교시'),
    ...DOWS.map((d) => {
      const off = holidayOn(addDays(wk, d - 1));
      return h('div', {
        class: `tt-dow${admin ? ' is-editable' : ''}${clip && clip.type === 'day' ? ' is-target' : ''}`
          + `${off ? ' is-holiday' : ''}`,
        title: off
          ? `${off} — 수업이 없어 시간표를 넣지 않아도 됩니다`
          : (admin ? (clip && clip.type === 'day' ? '여기에 붙여넣기' : '이 요일 전체를 복사') : ''),
        onClick: () => {
          if (!admin) return;
          if (clip && clip.type === 'day') return pasteDay(wk, d, refresh);
          copyDay(wk, d, slots, refresh);
        },
      },
        h('strong', {}, WEEKDAY[d]),
        h('span', { class: 'muted small' }, fmtK(addDays(wk, d - 1), { year: false, weekday: false })),
        off ? h('span', { class: 'tt-off' }, off) : null);
    }),
    ...Array.from({ length: rows }, (_, i) => {
      const p = i + 1;
      const t = periods[i];
      return [
        h('div', { class: 'tt-period' },
          h('strong', {}, `${p}교시`),
          t ? h('span', { class: 'muted small' }, `${fmtMin(t.s)}~${fmtMin(t.e)}`) : null),
        ...DOWS.map((d) => cellNode(wk, d, p, slots, clash, admin, refresh)),
      ];
    }).flat());

  const clashTotal = clash.size;

  return h('div', { class: 'view' },
    h('div', { class: 'datebar' },
      h('div', { class: 'datebar-nav' },
        h('button', { class: 'icon-btn', title: '이전 주', onClick: () => ctx.setDate(addDays(wk, -7)) }, '‹'),
        h('strong', { class: 'datebar-label' },
          `${fmtK(wk, { weekday: false })} ~ ${fmtK(addDays(wk, 4), { weekday: false, year: false })}`),
        h('button', { class: 'icon-btn', title: '다음 주', onClick: () => ctx.setDate(addDays(wk, 7)) }, '›'),
        h('button', { class: 'btn btn-sm', onClick: () => ctx.setDate(today()) }, '이번 주'),
        clashTotal
          ? h('span', { class: 'clash-count' }, `중복 ${clashTotal}건`)
          : h('span', { class: 'progress all-done' }, '중복 없음')),
      h('div', { class: 'datebar-actions' },
        admin ? h('button', { class: 'btn btn-primary', onClick: () => openImport(wk, refresh) }, '파일에서 가져오기') : null,
        admin ? h('button', {
          class: 'btn',
          title: '해마다 바뀌지 않는 한 벌을 저장해 두고, 주마다 깔고 나서 고칩니다',
          onClick: () => openBase(wk, refresh),
        }, '\u{1F4CB} 기본 시간표') : null,
        admin ? h('button', { class: 'btn', onClick: () => copyWeek(wk, -7, refresh) }, '지난 주 복사') : null,
        admin && slots.length
          ? h('button', {
            class: `btn${selMode ? ' on' : ''}`,
            title: '여러 칸을 골라 한 번에 복사하거나 지웁니다',
            onClick: () => { selMode = !selMode; clearSel(); refresh(); },
          }, selMode ? '고르기 끝내기' : '\u2611 고르기')
          : null,
        admin && slots.length
          ? h('button', {
            class: 'btn btn-danger',
            onClick: async () => {
              if (!(await confirmDialog(`이 주의 시간표 ${slots.length}칸을 모두 지울까요?`, { danger: true, okText: '지우기' }))) return;
              for (const s of slots) await remove('timetable', s.id);
              toast('지웠습니다.', 'ok'); refresh();
            },
          }, '이 주 비우기')
          : null)),

    // 고르기 막대 — 몇 개를 골랐고 무엇을 할 수 있는지
    admin && selMode
      ? h('div', { class: 'sel-bar' },
        h('span', { class: 'sel-ico' }, '\u2611'),
        sel.size
          ? h('span', {}, h('strong', {}, `${sel.size}칸`), ' 골랐습니다')
          : h('span', { class: 'muted' }, '지우거나 복사할 칸을 누르세요'),
        h('span', { class: 'sel-sp' }),
        h('button', {
          class: 'btn btn-sm',
          onClick: () => { sel = new Set(slots.map((x) => x.id)); refresh(); },
        }, `이 주 전체 (${slots.length})`),
        sel.size ? h('button', { class: 'btn btn-sm', onClick: () => { clearSel(); refresh(); } }, '고른 것 해제') : null,
        sel.size
          ? h('button', {
            class: 'btn btn-sm',
            title: '고른 칸을 복사합니다. 붙여넣을 칸을 누르면 들어갑니다.',
            onClick: () => {
              const items = slots.filter((x) => sel.has(x.id));
              clip = { type: 'cell', label: `고른 ${items.length}개`, items: items.map(stripId) };
              selMode = false; clearSel();
              toast('복사했습니다. 붙여넣을 칸을 누르세요.', 'ok');
              refresh();
            },
          }, '\u29C9 복사')
          : null,
        sel.size
          ? h('button', {
            class: 'btn btn-sm btn-danger',
            onClick: () => dropDelete([...sel], refresh),
          }, `\u{1F5D1} ${sel.size}칸 지우기`)
          : null)
      : null,

    admin && clip
      ? h('div', { class: 'clip-bar' },
        h('span', { class: 'clip-ico' }, '\u{1F4CB}'),
        h('span', {}, '복사함: ', h('strong', {}, clip.label)),
        h('span', { class: 'muted small' },
          clip.type === 'cell' ? '붙여넣을 칸을 누르세요' : '붙여넣을 요일 이름을 누르세요'),
        h('button', { class: 'btn btn-sm', onClick: () => { clip = null; refresh(); } }, '복사 끝내기'))
      : null,

    // 빈 주를 보고 '자료가 사라졌다' 고 하신 일이 있다. 일요일에 열면 방금 끝난 주가 뜨는데
    // 시간표는 다음 주에 넣어 두신 것이었다. 어느 주에 들어 있는지 짚고 바로 건너뛰게 한다.
    nearbyWeekHint(wk, slots.length, ctx),

    h('p', { class: 'note' },
      admin
        ? '칸을 눌러 과목·특별실을 넣으세요. 넣은 칸은 끌어서 다른 요일·교시로 옮길 수 있습니다. 교육활동·반복일정과 시간이 겹치면 빨갛게 표시됩니다.'
        : '시간표는 관리자만 고칠 수 있습니다. 겹치는 칸이 보이면 관리자에게 알려주세요.'),

    // 이 주에 시간표가 왜 바뀌었는지. 표만 보아서는 알 수 없는 것이라 표 위에 둔다.
    // 일일 화면의 교과교담 표 옆에도 같은 글이 뜬다(같은 주면 같은 메모다).
    noticeBox('tt', wk, {
      title: '시간표 운영 메모',
      placeholder: '예) 10.8(목) 공동교육과정으로 5학년 과학 1-2교시 → 다음 주로 미룸\n수요일 1교시 꿈자람반은 담당 출장으로 쉼',
      onChange: refresh,
    }),

    admin ? h('div', { class: 'tt-work' }, grid, palette(wk, refresh)) : grid,

    // 휴지통 — 칸을 끌어다 놓으면 지운다. 골라 둔 것이 있으면 한꺼번에.
    admin && slots.length
      ? h('div', {
        class: `tt-trash${sel.size ? ' has-sel' : ''}`,
        dataset: { dropTrash: '' },
        title: sel.size ? `골라 둔 ${sel.size}칸을 여기로 끌어다 놓으세요` : '칸을 여기로 끌어다 놓으면 지워집니다',
        onClick: () => { if (sel.size) dropDelete([...sel], refresh); },
      },
        h('span', { class: 'tt-trash-ico' }, '\u{1F5D1}'),
        h('span', { class: 'tt-trash-txt' },
          sel.size ? `${sel.size}칸 버리기` : '여기로 끌면 삭제'))
      : null,

    clashTotal ? clashList(clash, slots, wk) : null);
}

/** 이 주가 비었을 때, 시간표가 들어 있는 가장 가까운 주를 알려준다. */
function nearbyWeekHint(wk, count, ctx) {
  if (count) return null;
  const weeks = [...new Set(list('timetable').map((s2) => s2.week))].filter(Boolean);
  if (!weeks.length) return null;
  const near = weeks
    .map((w) => [w, Math.abs(Math.round((parseYmd(w) - parseYmd(wk)) / 86400000))])
    .sort((a, b) => a[1] - b[1])[0][0];
  const n = list('timetable').filter((s2) => s2.week === near).length;
  return h('div', { class: 'week-hint' },
    h('span', {},
      '이 주에는 시간표가 없습니다. ',
      h('b', {}, `${fmtK(near, { weekday: false })} 주`), `에 ${n}칸이 들어 있습니다.`),
    h('button', { class: 'btn btn-sm', onClick: () => ctx.setDate(near) }, '그 주 보기'));
}

const fmtMin = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function cellNode(wk, d, p, slots, clash, admin, refresh) {
  const mine = slots.filter((s) => Number(s.dow) === d && Number(s.period) === p);
  // 공휴일·휴업일은 흐리게 둔다. 그 날은 넣을 필요가 없다는 뜻이다.
  // (막지는 않는다. 쉬는 날에 돌봄이나 방과후를 적어 두는 학교도 있다)
  const off = holidayOn(addDays(wk, d - 1));
  const cell = h('div', {
    class: `tt-cell${admin ? ' is-editable' : ''}${off && !mine.length ? ' is-holiday' : ''}`,
    dataset: { ttDow: d, ttPeriod: p, ttWeek: wk },
    onClick: (e) => {
      if (!admin) return;
      if (e.target.closest('.tt-chip')) return;
      if (clip && clip.type === 'cell') return pasteCell(wk, d, p, refresh);
      openSlotForm(null, { week: wk, dow: d, period: p }, refresh);
    },
  },
    ...mine.map((s) => {
      const hits = clash.get(s.id);
      const picked = sel.has(s.id);
      const chip = h('button', {
        class: `tt-chip kind-${s.kind}${hits ? ' is-clash' : ''}${picked ? ' is-sel' : ''}`,
        title: selMode
          ? '눌러서 고르기/해제'
          : (hits
            ? `${s.title} — 중복: ${hits.map((x) => `${x.other.title}(${x.why.join(', ')})`).join(' / ')}`
            : [s.title, s.target, s.place, s.owner, s.note].filter(Boolean).join(' · ')),
        onClick: (e) => {
          e.stopPropagation();
          if (!admin) return;
          // 고르는 중에는 누르면 골라진다. 수정 창은 고르기를 끝낸 뒤에 연다.
          if (selMode) { if (picked) sel.delete(s.id); else sel.add(s.id); return refresh(); }
          openSlotForm(s, null, refresh);
        },
      },
        selMode ? h('span', { class: 'tt-pick' }, picked ? '\u2611' : '\u2610') : null,
        h('span', { class: 'tt-chip-main' },
          hits ? h('span', { class: 'clash-mark' }, '⚠') : null,
          h('span', { class: 'tt-chip-title' }, s.title),
          s.place ? h('span', { class: 'tt-chip-sub' }, s.place) : null),
        // 비고는 오른쪽 여백에. 칸이 좁으면 줄여 보이고 전체는 도움말로 뜬다.
        s.note ? h('span', { class: 'tt-chip-note', title: s.note }, s.note) : null);
      // 시간표 칸도 끌어서 옮긴다. 옮기는 방법은 여기서 알려준다.
      if (admin) {
        makeDraggable(chip, {
          id: s.id, canDrag: true,
          onDrop: async (cell, opt) => {
            // 휴지통에 놓으면 지운다. 골라 둔 것이 있으면 그것들을 한꺼번에.
            if (cell.dataset.dropTrash !== undefined) {
              const ids = sel.size ? [...sel] : [s.id];
              if (sel.size && !sel.has(s.id)) ids.push(s.id);
              return dropDelete(ids, refresh);
            }
            if (!cell.dataset.ttDow) return;
            const dw = Number(cell.dataset.ttDow);
            const pd = Number(cell.dataset.ttPeriod);
            if (opt && opt.copy) {
              await put('timetable', newSlot({ ...stripId(s), week: wk, dow: dw, period: pd }));
              toast(`${WEEKDAY[dw]} ${pd}교시에 복사했습니다.`, 'ok');
              return;
            }
            await moveSlot(s.id, dw, pd);
          },
        });
      }
      return chip;
    }),
    !mine.length && admin ? h('span', { class: 'tt-add' }, '+') : null,
    mine.length && admin
      ? h('button', {
        class: 'tt-copy', title: '이 칸을 복사',
        onClick: (e) => {
          e.stopPropagation();
          clip = { type: 'cell', label: `${WEEKDAY[d]} ${p}교시 ${mine.length}개`, items: mine.map(stripId) };
          toast('복사했습니다. 붙여넣을 칸을 누르세요.', 'ok');
          refresh();
        },
      }, '\u29C9')
      : null);
  return cell;   // 받는 판정은 data-tt-dow / data-tt-period 로 한다
}

/** 고른(또는 끌어온) 칸들을 지운다. 한 번만 되묻는다. */
async function dropDelete(ids, refresh) {
  const uniq = [...new Set(ids)].filter(Boolean);
  if (!uniq.length) return;
  const ok = await confirmDialog(
    uniq.length === 1 ? '이 칸을 지울까요?' : `고른 ${uniq.length}칸을 지울까요?`,
    { danger: true, okText: '지우기' });
  if (!ok) return;
  try {
    for (const id of uniq) await remove('timetable', id);
    for (const id of uniq) sel.delete(id);
    toast(`${uniq.length}칸을 지웠습니다.`, 'ok');
    refresh();
  } catch (e) {
    console.error(e);
    toast('지우지 못했습니다: ' + (e.message || ''), 'warn');
  }
}

// ── 복사 · 붙여넣기 ────────────────────────────────────────
function copyDay(wk, dow, slots, refresh) {
  const items = slots.filter((x) => Number(x.dow) === dow);
  if (!items.length) { toast(`${WEEKDAY[dow]}요일에 복사할 칸이 없습니다.`, 'warn'); return; }
  clip = { type: 'day', label: `${WEEKDAY[dow]}요일 ${items.length}개`, items: items.map(stripId) };
  toast('복사했습니다. 붙여넣을 요일 이름을 누르세요.', 'ok');
  refresh();
}

/**
 * 조각 모음 — 과목 하나를 칸에 끌어다 넣는다.
 *
 * 주마다 교담이 갈아 끼워지는 학교에서는 지우고 다시 넣는 일이 잦은데, 넣을 때마다
 * 창을 열어 과목명을 치거나 다른 칸을 복사해 붙여야 했다. 쓰는 과목은 뻔하니
 * 옆에 늘어놓고 끌어다 놓게 한다. 손가락으로 쓸 때는 조각을 누르고 칸을 누르면 된다.
 */
function palette(wk, refresh) {
  const pieces = pieceList();

  const chip = (s) => {
    const node = h('button', {
      class: `pal-chip kind-${s.kind}${clip && clip.piece === s.id ? ' is-armed' : ''}`,
      title: [s.title, s.place, s.owner, s.note].filter(Boolean).join(' · ') + ' — 끌어다 놓거나, 눌러서 칸을 고르세요',
      onClick: () => {
        // 누르면 손에 쥔다. 그다음 칸을 누르면 들어간다(휴대전화에서 끌기 대신).
        if (clip && clip.piece === s.id) { clip = null; return refresh(); }
        clip = { type: 'cell', label: s.title, piece: s.id, items: [stripId(s)] };
        toast(`'${s.title}' 을 쥐었습니다. 넣을 칸을 누르세요.`, 'ok');
        refresh();
      },
    },
      h('span', { class: 'pal-title' }, s.title),
      s.place ? h('span', { class: 'pal-sub' }, s.place) : null,
      h('span', {
        class: 'pal-del', role: 'button', tabindex: '0', title: '조각 지우기',
        onClick: async (e) => {
          e.stopPropagation();
          await remove('timetable', s.id);
          if (clip && clip.piece === s.id) clip = null;
          refresh();
        },
      }, '\u2715'));
    makeDraggable(node, {
      id: `pal_${s.id}`, canDrag: true,
      onDrop: async (cell) => {
        if (!cell.dataset.ttDow) return;
        const dw = Number(cell.dataset.ttDow);
        const pd = Number(cell.dataset.ttPeriod);
        await put('timetable', newSlot({ ...stripId(s), week: wk, dow: dw, period: pd }));
        toast(`${WEEKDAY[dw]} ${pd}교시에 '${s.title}' 을 넣었습니다.`, 'ok');
        refresh();
      },
    });
    return node;
  };

  return h('aside', { class: 'tt-palette' },
    h('div', { class: 'pal-head' },
      h('b', {}, '\u{1F9E9} 조각'),
      h('span', { class: 'muted small' }, '끌어다 놓기')),
    pieces.length
      ? h('div', { class: 'pal-list' }, ...pieces.map(chip))
      : h('p', { class: 'muted small' }, '아래 [쓰던 과목 모으기] 를 누르면 기본 시간표와 요즘 쓴 과목이 조각으로 들어옵니다.'),
    h('div', { class: 'pal-foot' },
      h('button', { class: 'btn btn-sm', onClick: () => collectPieces(refresh) }, '\u{1F504} 쓰던 과목 모으기'),
      h('button', { class: 'btn btn-sm', onClick: () => openPieceForm(refresh) }, '+ 조각 추가')));
}

/** 기본 시간표와 요즘 쓴 칸에서 과목을 그러모은다. 이미 있는 것은 건너뛴다. */
async function collectPieces(refresh) {
  const have = new Set(pieceList().map((s) => key(s)));
  const recent = list('timetable')
    .filter((s) => s.title && s.week !== PIECE_WEEK)
    .sort((a, b) => String(b.week).localeCompare(String(a.week)))
    .slice(0, 400);
  const add = [];
  for (const s of recent) {
    const k = key(s);
    if (have.has(k)) continue;
    have.add(k);
    add.push(newSlot({ ...stripId(s), week: PIECE_WEEK, dow: 0, period: 0 }));
  }
  if (!add.length) return toast('새로 모을 과목이 없습니다.', 'warn');
  await putMany('timetable', add);
  toast(`${add.length}개를 조각으로 모았습니다.`, 'ok');
  refresh();
}

/** 같은 과목인가 — 이름·장소·담당이 같으면 한 조각으로 본다. */
const key = (s) => [s.title, s.place || '', s.owner || '', s.kind || ''].join('|').replace(/\s+/g, '');

function openPieceForm(refresh) {
  const inp = {};
  const mk = (k, attrs = {}) => (inp[k] = h('input', { class: 'input', ...attrs }));
  const kindSel = h('select', { class: 'input' },
    h('option', { value: 'subject' }, '교과·교담'),
    h('option', { value: 'special' }, '특별실·기타'));
  const body = h('div', { class: 'form-grid' },
    h('div', { class: 'span2' }, field('과목명 *', mk('title', { placeholder: '예) 과학3' }))),
    field('장소', mk('place', { placeholder: '예) 과학실' })),
    field('담당', mk('owner', { placeholder: '예) 김용신' })),
    h('div', { class: 'span2' }, field('갈래', kindSel)));

  openModal('조각 추가', body, [
    { label: '취소', onClick: (c) => c() },
    {
      label: '넣기', class: 'btn-primary',
      onClick: async (c) => {
        const t = inp.title.value.trim();
        if (!t) return toast('과목명을 적어주세요.', 'warn');
        await put('timetable', newSlot({
          week: PIECE_WEEK, dow: 0, period: 0, title: t,
          place: inp.place.value.trim(), owner: inp.owner.value.trim(), kind: kindSel.value,
        }));
        toast('조각을 넣었습니다.', 'ok');
        c(); refresh();
      },
    },
  ]);
}

async function pasteCell(wk, dow, period, refresh) {
  if (!clip || !clip.items.length) return;
  await putMany('timetable', clip.items.map((x) => newSlot({ ...x, week: wk, dow, period })));
  toast(`${WEEKDAY[dow]} ${period}교시에 ${clip.items.length}개 붙여넣었습니다.`, 'ok');
  refresh();
}

async function pasteDay(wk, dow, refresh) {
  if (!clip || !clip.items.length) return;
  const here = list('timetable').filter((x) => x.week === wk && Number(x.dow) === dow);
  if (here.length && !(await confirmDialog(
    `${WEEKDAY[dow]}요일에 이미 ${here.length}개가 있습니다. 지우고 붙여넣을까요?\n[취소]를 누르면 그대로 더합니다.`,
    { okText: '지우고 붙여넣기' }))) {
    await putMany('timetable', clip.items.map((x) => newSlot({ ...x, week: wk, dow })));
  } else {
    for (const x of here) await remove('timetable', x.id);
    await putMany('timetable', clip.items.map((x) => newSlot({ ...x, week: wk, dow })));
  }
  toast(`${WEEKDAY[dow]}요일에 ${clip.items.length}개 붙여넣었습니다.`, 'ok');
  refresh();
}

// ── 파일·붙여넣기로 통째 가져오기 ──────────────────────────
function openImport(wk, refresh) {
  let found = [];
  const summary = h('div', { class: 'tt-import-sum' });
  const paste = h('textarea', {
    class: 'input', rows: 7,
    placeholder: [
      '한글·엑셀에서 시간표 표를 복사해 붙여넣거나, 아래처럼 줄로 적어도 됩니다.',
      '',
      '월 1교시 공자람반1,2 / 과학5',
      '화 1교시 공자람반1,2 / 영어(원어민) / 국악5',
      '화 2교시 국악3',
    ].join('\n'),
  });
  const fileIn = h('input', { type: 'file', class: 'sr-file', accept: '.hwpx,.xlsx,.csv,.tsv' });

  const show = (slots, how) => {
    found = slots;
    clear(summary);
    if (!slots.length) {
      summary.appendChild(h('p', { class: 'warn-text' },
        '읽어들일 칸을 찾지 못했습니다. 요일(월·화·수…) 머리글과 \'N교시\' 가 있는 표여야 합니다.'));
      return;
    }
    const byDow = DOWS.map((d) => slots.filter((s) => s.dow === d).length);
    summary.appendChild(h('p', {},
      h('strong', {}, `${slots.length}칸`), ` 을(를) 읽었습니다. (${how})`));
    summary.appendChild(h('p', { class: 'muted small' },
      DOWS.map((d, i) => `${WEEKDAY[d]} ${byDow[i]}`).join(' · ')));
    summary.appendChild(h('div', { class: 'tt-import-preview' },
      ...slots.slice(0, 18).map((s) => h('span', { class: `tt-chip kind-${s.kind}` },
        h('span', { class: 'tt-chip-sub' }, `${WEEKDAY[s.dow]}${s.period}`),
        h('span', { class: 'tt-chip-title' }, s.title))),
      slots.length > 18 ? h('span', { class: 'muted small' }, `외 ${slots.length - 18}칸`) : null));
  };

  const readFile = async (file) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    try {
      let grid = [];
      if (name.endsWith('.hwpx')) {
        const { tables } = await readHwpx(file);
        // 가장 그럴듯한 표(요일 머리글이 있는 것)를 고른다.
        let best = { slots: [] };
        for (const t of tables) {
          const r = parseTimetableGrid(t);
          if (r.slots.length > best.slots.length) best = r;
        }
        show(best.slots, file.name);
        return;
      }
      if (name.endsWith('.xlsx')) grid = await readXlsx(file);
      else {
        const text = await file.text();
        const sep = name.endsWith('.tsv') ? '\t' : ',';
        grid = text.replace(/^\uFEFF/, '').split(/\r?\n/)
          .map((l) => l.split(sep).map((c) => c.replace(/^"|"$/g, '')));
      }
      show(parseTimetableGrid(grid).slots, file.name);
    } catch (e) {
      console.error(e);
      toast('파일을 읽지 못했습니다: ' + e.message, 'warn');
    }
  };
  fileIn.addEventListener('change', () => { readFile(fileIn.files[0]); fileIn.value = ''; });

  const drop = h('div', { class: 'drop' },
    h('div', { class: 'drop-icon' }, '\u{1F4C4}'),
    h('p', {}, h('strong', {}, '교담 시간표 파일'), '을 끌어다 놓거나'),
    h('button', { class: 'btn', onClick: () => fileIn.click() }, '파일 고르기'),
    fileIn,
    h('p', { class: 'muted small' }, '한글(.hwpx) · 엑셀(.xlsx) · CSV'));
  ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
  drop.addEventListener('drop', (e) => { e.preventDefault(); readFile(e.dataTransfer.files[0]); });

  const body = h('div', {},
    drop,
    h('div', { class: 'sec-head', style: { marginTop: '14px' } }, h('h4', {}, '또는 붙여넣기')),
    paste,
    h('div', { class: 'row gap', style: { marginTop: '8px' } },
      h('button', {
        class: 'btn', onClick: () => {
          const t = paste.value;
          const grid = parsePastedGrid(t);
          const viaGrid = grid ? parseTimetableGrid(grid).slots : [];
          show(viaGrid.length ? viaGrid : parseTimetableLines(t), viaGrid.length ? '붙여넣은 표' : '붙여넣은 줄');
        },
      }, '읽어들이기')),
    summary);

  openModal(`시간표 가져오기 — ${fmtK(wk, { weekday: false })} 주`, body, [
    { label: '닫기', onClick: (c) => c() },
    {
      label: '이 주에 넣기', class: 'btn-primary',
      onClick: async (c) => {
        if (!found.length) return toast('먼저 파일이나 표를 읽어들이세요.', 'warn');
        const here = list('timetable').filter((x) => x.week === wk);
        if (here.length) {
          const wipe = await confirmDialog(
            `이 주에 이미 ${here.length}칸이 있습니다. 지우고 넣을까요?\n[취소]를 누르면 그대로 더합니다.`,
            { okText: '지우고 넣기' });
          if (wipe) for (const x of here) await remove('timetable', x.id);
        }
        await putMany('timetable', found.map((x) => newSlot({ ...x, week: wk })));
        await audit('시간표가져오기', wk, null, { count: found.length });
        toast(`${found.length}칸을 넣었습니다.`, 'ok');
        c(); refresh();
      },
    },
  ]);
}

/**
 * 기본 시간표 — 한 벌을 저장해 두고 주마다 깔아 쓴다.
 *
 * 지난 주 복사는 연휴가 끼면 쓸모가 없다. 쉰 날의 빈 칸까지 그대로 따라온다.
 * 학기 내내 크게 바뀌지 않는 한 벌을 따로 두고, 그것을 깔고 나서 그 주만 고치는 편이 낫다.
 */
function openBase(wk, refresh) {
  const base = baseSlots();
  const here = list('timetable').filter((s) => s.week === wk && s.title);

  // 저장해 둔 한 벌을 요일별로 훑어 보여 준다. 무엇이 깔릴지 보고 누르라는 뜻이다.
  const peek = base.length
    ? h('div', { class: 'base-peek' }, ...DOWS.map((d) => {
      const day = base.filter((s) => s.dow === d);
      return h('div', { class: 'base-day' },
        h('strong', {}, WEEKDAY[d]),
        day.length
          ? h('span', {}, day.map((s) => `${s.period}교시 ${s.title}`).join(' · '))
          : h('span', { class: 'muted' }, '없음'));
    }))
    : h('p', { class: 'muted' },
      '아직 저장해 둔 기본 시간표가 없습니다. 한 주를 제대로 짜 두고 [이 주를 기본으로 저장]을 누르세요.');

  const body = h('div', {},
    h('p', { class: 'muted small' },
      '학기 내내 크게 바뀌지 않는 한 벌입니다. 주마다 깔고 나서 그 주에 달라진 것만 고치면 됩니다. ' +
      '연휴가 낀 주를 복사할 때처럼 빈 칸이 따라오지 않습니다.'),
    base.length ? h('h4', { class: 'base-title' }, `저장된 기본 시간표 ${base.length}칸`) : null,
    peek);

  openModal('기본 시간표', body, [
    { label: '닫기', onClick: (c) => c() },
    base.length ? {
      label: '기본 지우기',
      class: 'btn-danger',
      onClick: async (close) => {
        if (!(await confirmDialog(`저장해 둔 기본 시간표 ${base.length}칸을 지울까요? 이 주의 시간표는 그대로 둡니다.`,
          { danger: true, okText: '지우기' }))) return;
        for (const x of base) await remove('timetable', x.id);
        toast('기본 시간표를 지웠습니다.', 'ok');
        close(); refresh();
      },
    } : null,
    {
      label: '이 주를 기본으로 저장',
      onClick: async (close) => {
        if (!here.length) { toast('이 주에 저장할 시간표가 없습니다.', 'warn'); return; }
        if (base.length && !(await confirmDialog(
          `저장해 둔 기본 시간표 ${base.length}칸을 이 주(${here.length}칸)로 바꿀까요?`, { okText: '바꾸기' }))) return;
        for (const x of base) await remove('timetable', x.id);
        await putMany('timetable', here.map((x) => newSlot({ ...stripId(x), week: BASE_WEEK })));
        await audit('기본시간표저장', wk, null, { count: here.length });
        toast(`${here.length}칸을 기본 시간표로 저장했습니다.`, 'ok');
        close(); refresh();
      },
    },
    base.length ? {
      label: '이 주에 깔기',
      class: 'btn-primary',
      onClick: async (close) => {
        if (here.length && !(await confirmDialog(
          `이 주에 이미 ${here.length}칸이 있습니다. 지우고 기본 시간표 ${base.length}칸을 깔까요?`,
          { okText: '깔기' }))) return;
        for (const x of list('timetable').filter((s) => s.week === wk)) await remove('timetable', x.id);
        await putMany('timetable', base.map((x) => newSlot({ ...stripId(x), week: wk })));
        await audit('기본시간표적용', wk, null, { count: base.length });
        toast(`기본 시간표 ${base.length}칸을 깔았습니다. 이 주에 달라진 것만 고치세요.`, 'ok');
        close(); refresh();
      },
    } : null,
  ].filter(Boolean));
}

async function copyWeek(wk, offset, refresh) {
  const src = weekStart(addDays(wk, offset));
  const from = list('timetable').filter((s) => s.week === src);
  if (!from.length) { toast('지난 주 시간표가 없습니다.', 'warn'); return; }
  const here = list('timetable').filter((s) => s.week === wk);
  if (here.length && !(await confirmDialog(`이 주에 이미 ${here.length}칸이 있습니다. 지우고 지난 주(${fmtK(src, { weekday: false })})에서 가져올까요?`, { okText: '가져오기' }))) return;
  for (const s of here) await remove('timetable', s.id);
  await putMany('timetable', from.map((s) => newSlot({ ...s, id: undefined, week: wk })));
  await audit('시간표복사', wk, null, { from: src, count: from.length });
  toast(`${from.length}칸을 가져왔습니다.`, 'ok');
  refresh();
}

function clashList(clash, slots, wk) {
  const rows = [];
  for (const [id, hits] of clash) {
    const s = slots.find((x) => x.id === id);
    if (!s) continue;
    rows.push(h('li', {},
      h('strong', {}, `${WEEKDAY[s.dow]} ${s.period}교시 · ${s.title}`),
      ' — ',
      hits.map((x) => `'${x.other.title}' (${x.why.join(', ')})`).join(', ')));
  }
  return h('section', { class: 'sec sec-clash' },
    h('div', { class: 'sec-head' }, h('h3', {}, `중복 ${rows.length}건`),
      h('span', { class: 'muted small' }, '겹쳐도 되는 것이면 그대로 두셔도 됩니다')),
    h('ul', { class: 'clash-list' }, ...rows));
}

const field = (label, input, hint) =>
  h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input,
    hint ? h('span', { class: 'field-hint' }, hint) : null);

export function openSlotForm(existing, seed, onSaved) {
  const s = existing ? structuredClone(existing) : newSlot(seed || {});
  const inp = {};
  const mk = (k, attrs = {}) => (inp[k] = h('input', { class: 'input', value: s[k] || '', ...attrs }));
  const kindSel = h('select', { class: 'input' },
    h('option', { value: 'subject', selected: s.kind === 'subject' }, '교과 교담'),
    h('option', { value: 'special', selected: s.kind === 'special' }, '특별실·순회'));
  const dowSel = h('select', { class: 'input' },
    ...DOWS.map((d) => h('option', { value: d, selected: Number(s.dow) === d }, WEEKDAY[d])));
  const perSel = h('select', { class: 'input' },
    ...periodTable().map((_, i) => h('option', { value: i + 1, selected: Number(s.period) === i + 1 }, `${i + 1}교시`)));

  const body = h('div', { class: 'form-grid' },
    h('div', { class: 'span2' }, field('내용 *', mk('title', { placeholder: '예) 과학5, 공자람반1,2, 영어(원어민)' }))),
    field('요일', dowSel),
    field('교시', perSel),
    field('구분', kindSel),
    field('대상', mk('target', { placeholder: '예) 5학년' })),
    field('장소', mk('place', { placeholder: '예) 과학실' })),
    field('담당', mk('owner', { placeholder: '예) 김서연' })),
    h('div', { class: 'span2' }, field('비고', mk('note'))));

  openModal(existing ? '시간표 칸 수정' : '시간표 칸 추가', body, [
    ...(existing ? [{
      label: '삭제', class: 'btn-danger',
      onClick: async (c) => {
        if (!(await confirmDialog(`'${s.title}' 을(를) 지울까요?`, { danger: true, okText: '지우기' }))) return;
        await remove('timetable', s.id);
        toast('지웠습니다.', 'ok'); c(); if (onSaved) onSaved();
      },
    }] : []),
    { label: '취소', onClick: (c) => c() },
    {
      label: '저장', class: 'btn-primary',
      onClick: async (c) => {
        const v = (k) => (inp[k] ? inp[k].value.trim() : '');
        if (!v('title')) return toast('내용을 입력해 주세요.', 'warn');
        Object.assign(s, {
          title: v('title'), target: v('target'), place: v('place'), owner: v('owner'),
          note: v('note'), kind: kindSel.value,
          dow: Number(dowSel.value), period: Number(perSel.value),
        });
        await put('timetable', s);
        toast('저장했습니다.', 'ok');
        c(); if (onSaved) onSaved();
      },
    },
  ]);
}

/** 시간표 칸을 다른 요일·교시로 옮긴다(끌어놓기에서 부른다). */
export async function moveSlot(id, dow, period) {
  const s = list('timetable').find((x) => x.id === id);
  if (!s) return;
  if (Number(s.dow) === Number(dow) && Number(s.period) === Number(period)) return;
  await put('timetable', { ...s, dow: Number(dow), period: Number(period) });
  toast(`${WEEKDAY[dow]} ${period}교시로 옮겼습니다.`, 'ok');
}

export { range };
