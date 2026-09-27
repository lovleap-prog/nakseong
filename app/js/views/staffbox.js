// 설정 탭의 '담당자 자동 매칭' 상자 — 업무분장표 + 과거 계획 학습
import { h, toast, confirmDialog, clear, download, openModal } from '../lib/dom.js';
import { newStaff } from '../model.js';
import { list, putMany, remove, replaceAllStaff } from '../store.js';
import { mergeLessons, suggestOwner, matchSources } from '../matcher.js';
import { parseTable, parseFreeText, findMonthContext } from '../lib/textparse.js';
import { readHwpx } from '../lib/hwpx-read.js';
import { readXlsx } from '../lib/xlsx-read.js';

export function staffBox(ctx) {
  const box = h('div', {});
  const redraw = () => draw();

  function draw() {
    clear(box);
    const staff = list('staff');
    const lessons = list('lessons');
    const learned = lessons.reduce((n, l) => n + (l.count || 1), 0);

    // ── 업무분장표 표 ──
    const rows = staff.map((s) => staffRow(s, redraw));

    box.appendChild(h('p', { class: 'note' },
      '업무분장표를 넣어두면 불러오기 할 때 ', h('strong', {}, '담당자와 부서가 자동으로 채워집니다'), '. ',
      '담당 업무 낱말은 쉼표로 여러 개 적으세요. 예) 박지현 / 생활인성부 / ',
      h('code', {}, '안전, 학교폭력, 소방, 생활지도')));

    box.appendChild(h('p', { class: 'muted small' },
      h('b', {}, '콕'), ' 을 켜면 그 낱말이 활동명에 들어 있을 때 ',
      h('b', {}, '저울질 없이 그 사람·계로 정합니다.'), ' ',
      '이미 다른 이름이 채워져 있어도 바로잡습니다. \u2018영어원어민 순회는 무조건 영어 담당\u2019 처럼 ',
      '학교에서 이미 정해진 것에 쓰세요.'));

    box.appendChild(staff.length
      ? h('div', { class: 'table-wrap' },
        h('table', { class: 'tbl' },
          h('thead', {}, h('tr', {},
            ...['이름', '부서/계', '담당 업무 낱말'].map((t) => h('th', {}, t)),
            h('th', { class: 'center', title: '켜면 저울질 없이 이 사람으로 정합니다' }, '콕'),
            h('th', {}, ''))),
          h('tbody', {}, ...rows)))
      : h('div', { class: 'empty' }, '등록된 업무분장이 없습니다.'));

    box.appendChild(h('div', { class: 'row gap', style: { marginTop: '10px' } },
      h('button', { class: 'btn btn-sm', onClick: () => addOne(redraw) }, '+ 사람 추가'),
      h('button', { class: 'btn btn-sm', onClick: () => openPaste(redraw) }, '\u{1F4CB} 여러 줄 붙여넣기'),
      uploadButton('업무분장표 올리기', '.hwpx,.xlsx,.csv,.tsv', (file) => importStaff(file, redraw)),
      h('button', { class: 'btn btn-sm', onClick: () => downloadStaff(staff) }, 'CSV 내려받기')));

    // ── 과거 계획 학습 ──
    box.appendChild(h('hr', { class: 'sep' }));
    box.appendChild(h('div', { class: 'sec-head' },
      h('h4', {}, '과거 계획으로 배우기'),
      h('span', { class: `progress${learned ? ' all-done' : ''}` }, `사례 ${lessons.length}종 / ${learned}건`)));
    box.appendChild(h('p', { class: 'note' },
      '그동안 만든 주간학습계획·월중계획 한글 파일을 올리면 ',
      h('strong', {}, '활동명과 담당자 짝만 뽑아'), ' 기억합니다. ',
      '일정으로 등록되지 않으니 지난 일정이 달력에 뜨지 않습니다. ',
      h('strong', {}, '파일에 담당자(또는 부서)가 적혀 있어야 배울 수 있습니다.')));
    box.appendChild(h('div', { class: 'row gap' },
      uploadButton('과거 계획 파일 올리기', '.hwpx,.xlsx,.csv,.tsv,.txt', (file) => learnFrom(file, redraw), true),
      lessons.length
        ? h('button', {
          class: 'btn btn-sm btn-danger',
          onClick: async () => {
            if (!(await confirmDialog(`배운 사례 ${lessons.length}종을 모두 지울까요?`, { danger: true, okText: '지우기' }))) return;
            for (const l of lessons) await remove('lessons', l.id);
            toast('사례를 지웠습니다.', 'ok'); redraw();
          },
        }, '배운 것 지우기')
        : null));

    // ── 시험해 보기 ──
    box.appendChild(h('hr', { class: 'sep' }));
    const testIn = h('input', { class: 'input', placeholder: '예) 2학기 소방대피 훈련' });
    const testOut = h('div', { class: 'muted small', style: { minHeight: '20px' } });
    const runTest = () => {
      const t = testIn.value.trim();
      if (!t) { clear(testOut); return; }
      const hit = suggestOwner({ title: t }, matchSources());
      clear(testOut);
      testOut.appendChild(hit
        ? h('span', {},
          h('strong', {}, `${hit.owner || '(이름 없음)'}${hit.dept ? ` · ${hit.dept}` : ''}`),
          h('span', { class: `badge ${confCls(hit.confidence)}` }, confLabel(hit.confidence)),
          ` — ${hit.reason}`)
        : h('span', {}, '추천할 만한 근거가 없습니다. 업무분장 낱말을 추가해 보세요.'));
    };
    testIn.addEventListener('input', runTest);
    box.appendChild(h('div', { class: 'sec-head' }, h('h4', {}, '시험해 보기')));
    box.appendChild(h('div', { class: 'row gap' }, testIn));
    box.appendChild(testOut);
  }

  draw();
  return box;
}

export const confCls = (c) => (c === 'high' ? 'st-approved' : c === 'medium' ? 'st-pending' : 'st-span');
export const confLabel = (c) => (c === 'high' ? '확실' : c === 'medium' ? '보통' : '참고');

function staffRow(s, redraw) {
  const name = h('input', { class: 'cell', value: s.name || '' });
  const dept = h('input', { class: 'cell', value: s.dept || '' });
  const kw = h('input', { class: 'cell', value: (s.keywords || []).join(', '), placeholder: '안전, 학교폭력, 소방' });
  const strict = h('input', { type: 'checkbox', checked: !!s.strict, title: '이 낱말이 활동명에 있으면 무조건 이 사람으로 정합니다' });
  const save = async () => {
    await putMany('staff', [{
      ...s, name: name.value.trim(), dept: dept.value.trim(),
      keywords: splitKeywords(kw.value), strict: strict.checked,
    }]);
  };
  [name, dept, kw, strict].forEach((el) => el.addEventListener('change', save));
  return h('tr', {},
    h('td', {}, name), h('td', {}, dept), h('td', {}, kw),
    h('td', { class: 'center' }, strict),
    h('td', { class: 'nowrap' }, h('button', {
      class: 'icon-btn danger', title: '삭제',
      onClick: async () => {
        if (!(await confirmDialog(`${s.name || '이 줄'}을 업무분장에서 지울까요?`, { danger: true, okText: '지우기' }))) return;
        await remove('staff', s.id); redraw();
      },
    }, '✕')));
}

/**
 * 여러 줄 붙여넣기 — '낱말 / 이름 / 계' 한 줄에 하나.
 * 네댓 줄 넣자고 [+ 사람 추가] 를 네 번 누르고 칸마다 옮겨 다니는 것이 성가시다.
 */
function openPaste(redraw) {
  const ta = h('textarea', {
    class: 'input', rows: 8,
    placeholder: ['영어원어민, 정하늘아, 영어',
      '유치원, 이정아, 유치원',
      '토요스포츠, 진치훈, 학부모회',
      '좋은수업, 김용신, 연구'].join('\n'),
  });
  const strict = h('input', { type: 'checkbox', checked: true });

  openModal('여러 줄 붙여넣기', h('div', {},
    h('p', { class: 'note' },
      '한 줄에 하나씩 ', h('b', {}, '낱말, 이름, 계'), ' 를 쉼표로 적으세요. ',
      '낱말을 여러 개 주려면 ', h('code', {}, '영어원어민|영어회화, 정하늘아, 영어'),
      ' 처럼 ', h('code', {}, '|'), ' 로 묶습니다.'),
    ta,
    h('label', { class: 'check' }, strict, '\u2018콕\u2019 으로 넣기 (저울질 없이 이 사람으로 정함)')), [
    { label: '취소', onClick: (c) => c() },
    {
      label: '넣기', class: 'btn-primary',
      onClick: async (c) => {
        const rows = [];
        for (const line of ta.value.split(/\r?\n/)) {
          const t = line.trim();
          if (!t) continue;
          const parts = t.split(/[,\t]/).map((x) => x.trim());
          const [kws, name, dept] = [parts[0] || '', parts[1] || '', parts[2] || ''];
          if (!kws || !name) continue;
          rows.push(newStaff({
            name, dept,
            keywords: kws.split(/[|·]/).map((x) => x.trim()).filter(Boolean),
            strict: strict.checked,
          }));
        }
        if (!rows.length) return toast('넣을 줄을 찾지 못했습니다. \u2018낱말, 이름, 계\u2019 차례로 적어주세요.', 'warn');
        await putMany('staff', rows);
        toast(`${rows.length}줄을 넣었습니다.`, 'ok');
        c(); redraw();
      },
    },
  ]);
}

const splitKeywords = (v) => String(v).split(/[,、·|/]+/).map((x) => x.trim()).filter(Boolean);

async function addOne(redraw) {
  await putMany('staff', [newStaff()]);
  redraw();
}

function uploadButton(label, accept, onFile, multiple = false) {
  const input = h('input', { type: 'file', class: 'sr-file', accept, multiple });
  input.addEventListener('change', async () => {
    const files = [...input.files];
    input.value = '';
    for (const f of files) await onFile(f);
  });
  return h('span', {},
    h('button', { class: 'btn btn-sm', onClick: () => input.click() }, label), input);
}

/** 파일 → 표 행들 (hwpx/xlsx/csv 공통) */
async function readRows(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.hwpx')) {
    const { paragraphs, tables } = await readHwpx(file);
    const text = paragraphs.join('\n') + ' ' + tables.flat(2).join(' ');
    const ctx = { ...(findMonthContext(text) || {}) };
    const fromTables = tables.flatMap((t) => parseTable(t, ctx));
    return fromTables.length ? fromTables : parseFreeText(paragraphs.join('\n'), ctx);
  }
  if (name.endsWith('.xlsx')) return parseTable(await readXlsx(file), {});
  const text = await file.text();
  if (name.endsWith('.txt')) return parseFreeText(text, {});
  const sep = name.endsWith('.tsv') ? '\t' : ',';
  const grid = text.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean)
    .map((l) => l.split(sep).map((c) => c.replace(/^"|"$/g, '').trim()));
  return parseTable(grid, {});
}

/** 업무분장표 업로드: 이름 / 부서 / 담당업무 열을 찾아 넣는다. */
async function importStaff(file, redraw) {
  try {
    const grid = await rawGrid(file);
    if (!grid.length) throw new Error('표를 찾지 못했습니다.');
    const header = grid.findIndex((r) => r.some((c) => /성명|이름|담당자/.test(String(c))));
    const head = (header >= 0 ? grid[header] : grid[0]).map((c) => String(c || '').replace(/\s/g, ''));
    const col = (re) => head.findIndex((c) => re.test(c));
    const iName = col(/성명|이름|담당자/);
    const iDept = col(/부서|부|계|소속|업무분장/);
    const iWork = col(/담당업무|업무내용|분장사항|주요업무|업무/);
    if (iName < 0) throw new Error('이름(성명) 열을 찾지 못했습니다.');

    const made = [];
    for (const r of grid.slice(header >= 0 ? header + 1 : 1)) {
      const nm = String(r[iName] || '').trim();
      if (!nm || nm.length > 5) continue;
      const work = iWork >= 0 ? String(r[iWork] || '') : '';
      made.push(newStaff({
        name: nm,
        dept: iDept >= 0 ? String(r[iDept] || '').trim() : '',
        keywords: splitKeywords(work.replace(/[()]/g, ' ')),
      }));
    }
    if (!made.length) throw new Error('읽어들일 사람이 없습니다.');
    if (!(await confirmDialog(`${made.length}명을 읽었습니다. 기존 업무분장을 지우고 새로 넣을까요?\n[취소]를 누르면 기존 것에 더합니다.`, { okText: '지우고 넣기' }))) {
      await putMany('staff', made);
    } else {
      await replaceAllStaff(made);
    }
    toast(`업무분장 ${made.length}명을 넣었습니다.`, 'ok');
    redraw();
  } catch (e) {
    console.error(e);
    toast('업무분장표를 읽지 못했습니다: ' + e.message, 'warn');
  }
}

/** 표를 해석하지 않고 원래 칸 그대로 받아온다(업무분장표는 일정 표가 아니므로). */
async function rawGrid(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.hwpx')) {
    const { tables } = await readHwpx(file);
    return tables.sort((a, b) => b.length - a.length)[0] || [];
  }
  if (name.endsWith('.xlsx')) return readXlsx(file);
  const text = await file.text();
  const sep = name.endsWith('.tsv') ? '\t' : ',';
  return text.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean)
    .map((l) => l.split(sep).map((c) => c.replace(/^"|"$/g, '').trim()));
}

/** 과거 계획 파일에서 (활동명, 담당자) 짝만 뽑아 쌓는다. */
async function learnFrom(file, redraw) {
  try {
    const rows = await readRows(file);
    const pairs = rows.filter((r) => r.title && (r.owner || r.dept));
    if (!pairs.length) {
      toast(`${file.name}: 담당자가 적힌 일정을 찾지 못했습니다. 파일에 담당자·부서 열이 있어야 배울 수 있습니다.`, 'warn');
      return;
    }
    const { rows: merged, added, bumped } = mergeLessons(list('lessons'), pairs, file.name);
    await putMany('lessons', merged.map((m) => ({ id: m.id, ...m })));
    toast(`${file.name}: 새 사례 ${added}종, 기존 사례 ${bumped}건 보강`, 'ok');
    redraw();
  } catch (e) {
    console.error(e);
    toast(`${file.name} 을(를) 읽지 못했습니다: ` + e.message, 'warn');
  }
}

function downloadStaff(staff) {
  const head = ['이름', '부서', '담당 업무 낱말'];
  const csv = [head, ...staff.map((s) => [s.name, s.dept, (s.keywords || []).join(' ')])]
    .map((r) => r.map((c) => `"${String(c || '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  download('업무분장.csv', new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
}
