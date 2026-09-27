// 학사일정 탭 — 1학기 / 2학기. 한글 파일을 올려 통째로 채운다.
import { h, openModal, toast, confirmDialog, clear, download } from '../lib/dom.js';
import {
  newAcademic, fmtK, parseYmd, today, WEEKDAY, addDays, ymd, range, sundayStart, monthEnd,
} from '../model.js';
import { list, put, putMany, remove, isAdmin, audit } from '../store.js';
import {
  parseAcademic, parseAcademicLines, findYear, findSchoolYear,
  parseTermRanges, termOfDate, parseSchoolDays, parseNoMealDays,
} from '../lib/acadparse.js';
import { makeDraggable } from '../dragmove.js';
import { looksLikeHoliday, holidayOn } from '../lib/holidays.js';
import { readHwpx } from '../lib/hwpx-read.js';
import { readXlsx } from '../lib/xlsx-read.js';

const TERMS = [['1', '1학기'], ['2', '2학기']];
const VIEWS = [['cal', '\u{1F4C5} 달력'], ['list', '\u2630 목록']];

/**
 * 방학 구간을 찾는다.
 *
 * 학사일정에는 '여름방학식' 과 '개학식' 만 하루씩 적혀 있고 그 사이가 방학이다.
 * 달력에서 그 구간이 안 보이면 언제부터 언제까지 쉬는지 알 수가 없다.
 */
export function vacationRanges(rows) {
  const opens = /방학식$|종업식$/;
  const closes = /개학식$|시업식$/;
  const sorted = rows.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const out = [];
  let open = null;
  for (const r of sorted) {
    const t = String(r.title || '').replace(/\s/g, '');
    if (open && closes.test(t)) {
      if (addDays(open.date, 1) <= addDays(r.date, -1)) {
        out.push({ from: addDays(open.date, 1), to: addDays(r.date, -1), name: open.name });
      }
      open = null;
    } else if (!open && opens.test(t)) {
      open = { date: r.date, name: t.replace(/식$/, '').replace(/^종업$/, '봄방학') || '방학' };
    }
  }
  // 학년도 끝에서 개학식을 못 만나면 그 학기 마지막까지로 본다.
  if (open && sorted.length) {
    const last = sorted[sorted.length - 1].date;
    if (addDays(open.date, 1) <= last) out.push({ from: addDays(open.date, 1), to: last, name: open.name });
  }
  return out;
}

const vacationOn = (ranges, d) => (ranges.find((v) => d >= v.from && d <= v.to) || {}).name || '';

/** 처음 열 때 보여줄 학기. 3~8월은 1학기, 9~2월은 2학기. 비어 있으면 자료가 있는 쪽. */
function openingTerm() {
  const mon = Number(today().slice(5, 7));
  const guess = mon >= 3 && mon <= 8 ? '1' : '2';
  const rows = list('academic').filter((a) => a.kind !== 'stat');
  const has = (t) => rows.some((a) => a.term === t);
  if (has(guess) || !rows.length) return guess;
  return has(guess === '1' ? '2' : '1') ? (guess === '1' ? '2' : '1') : guess;
}

export function renderAcademic(ctx) {
  // 늘 1학기로 열려서, 2학기에 들어가면 자료가 있어도 빈 화면이 보였다.
  // 오늘이 속한 학기로 열고, 그 학기가 비어 있으면 자료가 있는 쪽으로 연다.
  const st = ctx.state.acad || (ctx.state.acad = { term: openingTerm(), q: '', view: 'cal' });
  if (!st.view) st.view = 'cal';
  const admin = isAdmin();
  const refresh = () => ctx.refresh();
  const all = list('academic');
  const stat = all.find((a) => a.kind === 'stat');
  const noMeal = all
    .filter((a) => a.kind === 'nomeal' && a.term === st.term)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const rows = all
    .filter((a) => (a.kind || 'event') === 'event')
    .filter((a) => a.term === st.term)
    .filter((a) => !st.q || (a.title + a.note).includes(st.q))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  // 월별로 묶어서 보여준다. 학사일정은 월 단위로 보는 자료다.
  const groups = [];
  for (const r of rows) {
    const mm = String(r.date).slice(0, 7);
    if (!groups.length || groups[groups.length - 1].mm !== mm) groups.push({ mm, items: [] });
    groups[groups.length - 1].items.push(r);
  }

  const search = h('input', {
    class: 'input', value: st.q, placeholder: '행사 이름으로 찾기',
    onInput: (e) => { st.q = e.target.value; refresh(); },
  });

  return h('div', { class: 'view' },
    h('div', { class: 'datebar' },
      h('div', { class: 'datebar-nav' },
        h('div', { class: 'seg' }, ...TERMS.map(([k, label]) => h('button', {
          class: `seg-btn${st.term === k ? ' on' : ''}`,
          onClick: () => { st.term = k; refresh(); },
        }, label))),
        h('span', { class: 'muted small' }, `${rows.length}건`),
        h('div', { class: 'seg' }, ...VIEWS.map(([k, label]) => h('button', {
          class: `seg-btn${st.view === k ? ' on' : ''}`,
          onClick: () => { st.view = k; refresh(); },
        }, label)))),
      h('div', { class: 'datebar-actions' },
        admin ? h('button', { class: 'btn btn-primary', onClick: () => openImport(st.term, refresh) }, '파일에서 가져오기') : null,
        admin ? h('button', { class: 'btn btn-sm', onClick: () => openRow(null, st.term, refresh) }, '+ 한 줄 추가') : null,
        rows.length ? h('button', { class: 'btn btn-sm', onClick: () => exportCsv(rows, st.term) }, 'CSV') : null,
        admin && rows.length ? h('button', {
          class: 'btn btn-sm btn-danger',
          onClick: async () => {
            if (!(await confirmDialog(`${TERMS.find((t) => t[0] === st.term)[1]} 학사일정 ${rows.length}건을 모두 지울까요?`, { danger: true, okText: '지우기' }))) return;
            for (const r of rows) await remove('academic', r.id);
            toast('지웠습니다.', 'ok'); refresh();
          },
        }, '이 학기 비우기') : null)),

    stat ? statTable(stat, st.term) : null,

    h('div', { class: 'row gap' }, search),

    rows.length
      ? (st.view === 'cal'
        ? calendarView(rows, admin, refresh)
        : h('div', { class: 'acad-wrap' }, ...groups.map((g) => h('section', { class: 'sec acad-month' },
          h('div', { class: 'sec-head' },
            h('h3', {}, `${Number(g.mm.slice(5, 7))}월`),
            h('span', { class: 'muted small' }, `${g.items.length}건`)),
          h('ul', { class: 'acad-list' }, ...g.items.map((a) => acadRow(a, admin, refresh)))))))
      : h('div', { class: 'empty' },
        admin ? '학사일정이 없습니다. [파일에서 가져오기] 로 한글 파일을 올려보세요.' : '등록된 학사일정이 없습니다.'),

    noMealBox(noMeal, st.term, admin, refresh));
}

/**
 * 달력 보기 — 학교가 쓰는 학사일정 문서가 원래 이 모양이다.
 *
 * 목록으로 늘어놓으면 주말이 어디인지, 방학이 언제부터인지, 한 달이 어디서
 * 끊기는지 알 수가 없다. 달력으로 보면 그것이 전부 자리로 드러난다.
 */
function calendarView(rows, admin, refresh) {
  const vac = vacationRanges(rows);
  const byDay = new Map();
  for (const r of rows) {
    // 기간 일정은 시작한 날에 한 번만. 끝날은 제목 옆에 붙인다.
    const k = r.date;
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(r);
  }

  const months = [...new Set(rows.map((r) => String(r.date).slice(0, 7)))].sort();
  const t = today();

  return h('div', { class: 'acad-cal-wrap' }, ...months.map((mm) => {
    const first = `${mm}-01`;
    const last = monthEnd(first);
    const ws = sundayStart(first);
    const we = addDays(sundayStart(last), 6);
    const vacHere = vac.filter((v) => v.from <= last && v.to >= first);

    return h('section', { class: 'sec acad-cal' },
      h('div', { class: 'sec-head' },
        h('h3', {}, `${Number(mm.slice(5, 7))}월`),
        vacHere.length
          ? h('span', { class: 'chip chip-vac' },
            vacHere.map((v) => `${v.name} ${fmtK(v.from, { year: false, weekday: false })}~${fmtK(v.to, { year: false, weekday: false })}`).join(' · '))
          : null),
      h('div', { class: 'acad-dows' }, ...WEEKDAY.map((w, i) => h('span', {
        class: `acad-dow${i === 0 ? ' sun' : ''}${i === 6 ? ' sat' : ''}`,
      }, w))),
      h('div', { class: 'acad-grid' }, ...range(ws, we).map((d) => {
        const out = d.slice(0, 7) !== mm;
        const wd = parseYmd(d).getDay();
        const off = holidayOn(d);
        const vname = vacationOn(vac, d);
        const items = byDay.get(d) || [];
        return h('div', {
          class: `acad-cell${out ? ' is-out' : ''}${wd === 0 ? ' is-sun' : ''}${wd === 6 ? ' is-sat' : ''}`
            + `${off ? ' is-holiday' : ''}${vname ? ' is-vac' : ''}${d === t ? ' is-today' : ''}`,
          dataset: { day: d },
          title: [off, vname].filter(Boolean).join(' · '),
        },
          h('span', { class: 'acad-cell-num' }, parseYmd(d).getDate()),
          // 휴일 이름이 그 날 행사 제목과 같으면 한 번만 보인다.
          // ('삼일절' 이 위아래로 두 번 찍히던 것)
          off && !items.some((x) => String(x.title).trim() === off)
            ? h('span', { class: 'acad-cell-off' }, off) : null,
          ...items.map((a) => makeDraggable(h('span', {
            class: `acad-cell-item${a.isHoliday || looksLikeHoliday(a.title) ? ' is-off' : ''}`,
            title: admin ? `${a.title} — 끌어서 옮기기` : a.title,
            onClick: () => { if (admin) openRow(a, a.term, refresh); },
          },
            a.title,
            a.endDate && a.endDate > a.date
              ? h('span', { class: 'acad-cell-to' }, `~${parseYmd(a.endDate).getDate()}`)
              : null),
          { id: a.id, canDrag: admin, onDrop: async (cell) => {
            if (!cell.dataset.day || cell.dataset.day === a.date) return;
            await put('academic', { ...a, date: cell.dataset.day });
            toast(`${fmtK(cell.dataset.day, { year: false })} 로 옮겼습니다.`, 'ok');
            refresh();
          } })));
      })));
  }));
}

/** 수업일수 요약 — 원본 문서 맨 위에 있는 그 표 */
function statTable(stat, term) {
  const s = stat.stats || {};
  const months = (s.months || []).filter((m) => !term || m.term === term || !m.term);
  const show = months.length ? months : (s.months || []);
  const sub = s.subtotal || {};
  return h('section', { class: 'sec sec-stat' },
    h('div', { class: 'sec-head' },
      h('h3', {}, '\u{1F4CA} 수업일수'),
      h('span', { class: 'muted small' },
        [sub['1'] ? `1학기 ${sub['1']}일` : '', sub['2'] ? `2학기 ${sub['2']}일` : '',
          s.total ? `계 ${s.total}일` : ''].filter(Boolean).join(' · '))),
    h('div', { class: 'table-wrap' },
      h('table', { class: 'tbl stat-tbl' },
        h('thead', {}, h('tr', {},
          h('th', {}, '월'),
          ...show.map((m) => h('th', { class: m.term === '2' ? 'term2' : '' }, `${m.month}월`)),
          h('th', {}, '소계'))),
        h('tbody', {}, h('tr', {},
          h('td', { class: 'strong' }, '수업일수'),
          ...show.map((m) => h('td', { class: m.term === '2' ? 'term2' : '' }, m.days)),
          h('td', { class: 'strong' }, sub[term] || show.reduce((a, m) => a + m.days, 0)))))));
}

/** 비급식일 — 조정되는 값이라 끌어 옮기거나 날짜를 바로 고칠 수 있게 둔다. */
function noMealBox(items, term, admin, refresh) {
  return h('section', { class: 'sec sec-nomeal' },
    h('div', { class: 'sec-head' },
      h('h3', {}, `\u{1F374} 비급식일 ${items.length}일`),
      admin
        ? h('button', {
          class: 'btn btn-sm',
          onClick: async () => {
            await put('academic', newAcademic({ kind: 'nomeal', term, date: today(), title: '비급식일' }));
            toast('비급식일을 넣었습니다. 날짜를 고쳐주세요.', 'ok'); refresh();
          },
        }, '+ 비급식일')
        : null),
    items.length
      ? h('div', { class: 'nomeal-wrap' }, ...items.map((x) => noMealChip(x, admin, refresh)))
      : h('div', { class: 'empty' }, '등록된 비급식일이 없습니다.'));
}

function noMealChip(x, admin, refresh) {
  const chip = h('span', { class: 'nomeal-chip', dataset: { day: x.date } },
    h('strong', {}, fmtK(x.date, { year: false })),
    x.note ? h('span', { class: 'muted small' }, x.note) : null,
    admin
      ? h('input', {
        type: 'date', class: 'nomeal-date', value: x.date, title: '날짜 바꾸기',
        onChange: async (e) => {
          if (!e.target.value) return;
          await put('academic', { ...x, date: e.target.value });
          toast('옮겼습니다.', 'ok'); refresh();
        },
      })
      : null,
    admin
      ? h('button', {
        class: 'icon-btn danger', title: '지우기',
        onClick: async () => { await remove('academic', x.id); toast('지웠습니다.', 'ok'); refresh(); },
      }, '\u2715')
      : null);
  if (admin) {
    makeDraggable(chip, {
      id: x.id, canDrag: true,
      onDrop: async (cell) => {
        if (!cell.dataset.day || cell.dataset.day === x.date) return;
        await put('academic', { ...x, date: cell.dataset.day });
        toast(`${fmtK(cell.dataset.day, { year: false })} 로 옮겼습니다.`, 'ok');
      },
    });
  }
  return chip;
}

function acadRow(a, admin, refresh) {
  const d = parseYmd(a.date);
  const isPast = (a.endDate || a.date) < today();
  // 쉬는 날인가. 제목으로 짐작하되, 관리자가 정해 둔 것이 있으면 그것을 따른다.
  const off = a.isHoliday === undefined ? looksLikeHoliday(a.title) : !!a.isHoliday;
  // 줄 자체가 받는 칸이다. 다른 줄 위로 끌어다 놓으면 그 날짜로 옮겨진다.
  const li = h('li', {
    class: `acad-item${isPast ? ' is-past' : ''}${a.date === today() ? ' is-today' : ''}`
      + `${off ? ' is-holiday' : ''}`,
    dataset: { day: a.date },
  },
    h('span', { class: 'acad-day' },
      h('strong', {}, d.getDate()),
      h('span', { class: 'acad-dow' }, WEEKDAY[d.getDay()])),
    h('span', { class: 'acad-main' },
      h('span', { class: 'acad-title' }, a.title),
      a.endDate && a.endDate > a.date
        ? h('span', { class: 'badge st-span' }, `~ ${fmtK(a.endDate, { year: false })}`) : null,
      off ? h('span', { class: 'chip chip-off' }, '휴일') : null,
      a.note ? h('span', { class: 'chip' }, a.note) : null),
    admin
      ? h('span', { class: 'acad-tools' },
        h('input', {
          type: 'date', class: 'acad-date', value: a.date, title: '날짜 바꾸기',
          onChange: async (e) => {
            if (!e.target.value) return;
            await put('academic', { ...a, date: e.target.value });
            toast('옮겼습니다.', 'ok'); refresh();
          },
        }),
        h('button', {
          class: `icon-btn${off ? ' on' : ''}`,
          title: off
            ? '쉬는 날로 보고 있습니다. 눌러서 수업하는 날로 되돌립니다'
            : '이 날을 쉬는 날(공휴일·휴업일)로 표시합니다',
          onClick: async () => {
            await put('academic', { ...a, isHoliday: !off });
            toast(off ? '수업하는 날로 되돌렸습니다.' : '쉬는 날로 표시했습니다.', 'ok');
            refresh();
          },
        }, '\u{1F6CC}'),
        h('button', { class: 'icon-btn', title: '수정', onClick: () => openRow(a, a.term, refresh) }, '✎'),
        h('button', {
          class: 'icon-btn danger', title: '삭제',
          onClick: async () => { await remove('academic', a.id); toast('지웠습니다.', 'ok'); refresh(); },
        }, '✕'))
      : null);

  if (admin) {
    makeDraggable(li, {
      id: a.id, canDrag: true,
      onDrop: async (cell) => {
        if (!cell.dataset.day || cell.dataset.day === a.date) return;
        await put('academic', { ...a, date: cell.dataset.day });
        toast(`${fmtK(cell.dataset.day, { year: false })} 로 옮겼습니다.`, 'ok');
      },
    });
  }
  return li;
}

const field = (label, input, hint) =>
  h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input,
    hint ? h('span', { class: 'field-hint' }, hint) : null);

function openRow(existing, term, onSaved) {
  const a = existing ? structuredClone(existing) : newAcademic({ term, date: today() });
  const inp = {};
  const mk = (k, attrs = {}) => (inp[k] = h('input', { class: 'input', value: a[k] || '', ...attrs }));
  const termSel = h('select', { class: 'input' },
    ...TERMS.map(([k, label]) => h('option', { value: k, selected: a.term === k }, label)));
  const body = h('div', { class: 'form-grid' },
    field('날짜 *', mk('date', { type: 'date' })),
    field('종료일', mk('endDate', { type: 'date' }), '여러 날 이어질 때만'),
    h('div', { class: 'span2' }, field('행사명 *', mk('title'))),
    field('학기', termSel),
    field('비고', mk('note')));
  openModal(existing ? '학사일정 수정' : '학사일정 추가', body, [
    { label: '취소', onClick: (c) => c() },
    {
      label: '저장', class: 'btn-primary',
      onClick: async (c) => {
        const v = (k) => (inp[k] ? inp[k].value.trim() : '');
        if (!v('date') || !v('title')) return toast('날짜와 행사명을 입력해 주세요.', 'warn');
        await put('academic', {
          ...a, date: v('date'), endDate: v('endDate'), title: v('title'),
          note: v('note'), term: termSel.value,
        });
        toast('저장했습니다.', 'ok'); c(); if (onSaved) onSaved();
      },
    },
  ]);
}

function exportCsv(rows, term) {
  const head = ['날짜', '종료일', '행사명', '비고'];
  const csv = [head, ...rows.map((r) => [r.date, r.endDate, r.title, r.note])]
    .map((r) => r.map((c) => `"${String(c || '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  download(`학사일정_${term}학기.csv`, new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
}

// ── 파일에서 가져오기 ──────────────────────────────────────
function openImport(term, refresh) {
  let found = [];
  const extra = { ranges: [], stat: null, noMeal: [] };
  const summary = h('div', { class: 'tt-import-sum' });
  const yearIn = h('input', { class: 'input sm', type: 'number', value: String(new Date().getFullYear()) });
  const paste = h('textarea', {
    class: 'input', rows: 6,
    placeholder: '표를 복사해 붙여넣거나 줄로 적어도 됩니다.\n\n3/2 시업식\n5/4~5/8 현장체험학습 주간\n7/18 여름방학식',
  });
  const fileIn = h('input', { type: 'file', class: 'sr-file', accept: '.hwpx,.xlsx,.csv,.tsv' });

  const show = (items, how) => {
    found = items;
    clear(summary);
    if (!items.length) {
      summary.appendChild(h('p', { class: 'warn-text' },
        '읽어들일 일정을 찾지 못했습니다. 날짜와 행사명이 있는 표여야 합니다.'));
      return;
    }
    const months = [...new Set(items.map((x) => Number(x.date.slice(5, 7))))].sort((a, b) => a - b);
    const t1 = items.filter((x) => x.term === '1').length;
    const t2 = items.filter((x) => x.term === '2').length;
    summary.appendChild(h('p', {}, h('strong', {}, `${items.length}건`), ` 을(를) 읽었습니다. (${how})`));
    summary.appendChild(h('p', { class: 'muted small' },
      `${months.join('월 · ')}월` + (t1 && t2 ? ` — 1학기 ${t1}건, 2학기 ${t2}건` : '')));
    const bits = [];
    if (extra.ranges.length) bits.push(extra.ranges.map((r) => `${r.term}학기 ${r.from}~${r.to}`).join(' / '));
    if (extra.stat) bits.push(`수업일수 표 (계 ${extra.stat.total}일)`);
    if (extra.noMeal.length) bits.push(`비급식일 ${extra.noMeal.length}일`);
    if (bits.length) summary.appendChild(h('p', { class: 'muted small' }, '✓ ' + bits.join(' · ')));
    summary.appendChild(h('div', { class: 'tt-import-preview' },
      ...items.slice(0, 16).map((x) => h('span', { class: 'tt-chip kind-subject' },
        h('span', { class: 'tt-chip-sub' }, x.date.slice(5).replace('-', '/')),
        h('span', { class: 'tt-chip-title' }, x.title))),
      items.length > 16 ? h('span', { class: 'muted small' }, `외 ${items.length - 16}건`) : null));
  };

  const readFile = async (file) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    try {
      if (name.endsWith('.hwpx')) {
        const { paragraphs, tables } = await readHwpx(file);
        const docText = paragraphs.join(' ') + ' ' + tables.flat(2).join(' ') + ' ' + file.name;
        const year = findSchoolYear(docText) || findYear(docText) || Number(yearIn.value);
        yearIn.value = String(year);

        // 학기 기간('2학기 (2026.08.19 ~ …)')이 적혀 있으면 그것이 학기의 기준이다.
        // 문서 작성 편의상 8월이 1학기 표에 들어 있어도 제자리로 간다.
        extra.ranges = tables.flatMap((t) => parseTermRanges(t));
        extra.stat = tables.map((t) => parseSchoolDays(t)).find(Boolean) || null;
        extra.noMeal = parseNoMealDays(paragraphs, year);

        let best = [];
        for (const t of tables) best = best.concat(parseAcademic(t, { year, schoolYear: year, term }));
        show(best.map((x) => ({
          ...x,
          term: termOfDate(x.date, extra.ranges) || x.term || term,
          source: file.name,
        })), file.name);
        return;
      }
      let grid = [];
      if (name.endsWith('.xlsx')) grid = await readXlsx(file);
      else {
        const text = await file.text();
        const sep = name.endsWith('.tsv') ? '\t' : ',';
        grid = text.replace(/^﻿/, '').split(/\r?\n/).map((l) => l.split(sep).map((c) => c.replace(/^"|"$/g, '')));
      }
      show(parseAcademic(grid, { year: Number(yearIn.value), term }).map((x) => ({ ...x, term, source: file.name })), file.name);
    } catch (e) {
      console.error(e);
      toast('파일을 읽지 못했습니다: ' + e.message, 'warn');
    }
  };
  fileIn.addEventListener('change', () => { readFile(fileIn.files[0]); fileIn.value = ''; });

  const drop = h('div', { class: 'drop' },
    h('div', { class: 'drop-icon' }, '\u{1F4C5}'),
    h('p', {}, h('strong', {}, '학사일정 파일'), '을 끌어다 놓거나'),
    h('button', { class: 'btn', onClick: () => fileIn.click() }, '파일 고르기'),
    fileIn,
    h('p', { class: 'muted small' }, '한글(.hwpx) · 엑셀(.xlsx) · CSV'));
  ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
  drop.addEventListener('drop', (e) => { e.preventDefault(); readFile(e.dataTransfer.files[0]); });

  const body = h('div', {},
    h('div', { class: 'row gap', style: { marginBottom: '10px' } },
      h('label', { class: 'check' }, '기준 연도', yearIn),
      h('span', { class: 'muted small' }, '문서에 "2026학년도" 가 있으면 자동으로 잡습니다')),
    drop,
    h('div', { class: 'sec-head', style: { marginTop: '14px' } }, h('h4', {}, '또는 붙여넣기')),
    paste,
    h('div', { class: 'row gap', style: { marginTop: '8px' } },
      h('button', {
        class: 'btn',
        onClick: () => {
          const t = paste.value;
          const grid = t.includes('\t')
            ? t.split(/\r?\n/).map((l) => l.split('\t'))
            : null;
          const viaGrid = grid ? parseAcademic(grid, { year: Number(yearIn.value), term }) : [];
          const items = viaGrid.length ? viaGrid : parseAcademicLines(t, Number(yearIn.value));
          show(items.map((x) => ({ ...x, term })), viaGrid.length ? '붙여넣은 표' : '붙여넣은 줄');
        },
      }, '읽어들이기')),
    summary);

  openModal(`학사일정 가져오기 — ${TERMS.find((t) => t[0] === term)[1]}`, body, [
    { label: '닫기', onClick: (c) => c() },
    {
      label: '넣기', class: 'btn-primary',
      onClick: async (c) => {
        if (!found.length) return toast('먼저 파일이나 표를 읽어들이세요.', 'warn');
        const terms = [...new Set(found.map((x) => x.term || term))];
        const here = list('academic').filter((x) => terms.includes(x.term));
        if (here.length) {
          const names = terms.map((t) => (TERMS.find((x) => x[0] === t) || [, t])[1]).join(' · ');
          const wipe = await confirmDialog(
            `${names} 에 이미 ${here.length}건이 있습니다. 지우고 넣을까요?\n[취소]를 누르면 그대로 더합니다.`,
            { okText: '지우고 넣기' });
          if (wipe) for (const x of here) await remove('academic', x.id);
        }
        await putMany('academic', found.map((x) => newAcademic({ ...x, kind: 'event', term: x.term || term })));

        if (extra.stat) {
          const prev = list('academic').find((x) => x.kind === 'stat');
          if (prev) await remove('academic', prev.id);
          await put('academic', newAcademic({ kind: 'stat', title: '수업일수', stats: extra.stat }));
        }
        if (extra.noMeal.length) {
          for (const x of list('academic').filter((y) => y.kind === 'nomeal')) await remove('academic', x.id);
          await putMany('academic', extra.noMeal.map((x) => newAcademic({
            kind: 'nomeal', date: x.date, note: x.note, title: '비급식일',
            term: termOfDate(x.date, extra.ranges) || term,
          })));
        }
        await audit('학사일정가져오기', term, null, {
          count: found.length, stat: !!extra.stat, noMeal: extra.noMeal.length,
        });
        toast(`${found.length}건을 넣었습니다.`
          + (extra.noMeal.length ? ` (비급식일 ${extra.noMeal.length}일 포함)` : ''), 'ok');
        c(); refresh();
      },
    },
  ]);
}

/** 그 날짜의 학사일정 (일일 화면에서 쓴다) */
export function academicOn(date) {
  return list('academic').filter((a) => {
    const e = a.endDate && a.endDate > a.date ? a.endDate : a.date;
    return date >= a.date && date <= e;
  });
}
