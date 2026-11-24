// 설정 탭의 '시정표' 상자 — 기본 시정 + 단축 시정 + 수업공개 시정 …
//
// 학교는 시정을 하나만 쓰지 않는다. 단축수업 날이 있고, 수업공개 날에는
// 공개 학년만 다른 시정으로 움직인다. 시정이 틀리면 중복 판정과 결재 문구의
// 시각이 함께 틀어지므로 여러 벌을 둘 수 있게 했다.
import { h, toast, confirmDialog, clear } from '../lib/dom.js';
import { newBell } from '../model.js';
import { list, put, remove } from '../store.js';
import { bellList, defaultBell, fmtMin, periodPairs, periodDocs } from '../conflict.js';

/** 단축 시정을 새로 만들 때 몇 교시까지 둘지 */
const SHORT_DAY = 6;

/** 단축 시정 기본안 — 40분 수업을 30분으로 줄이고 쉬는 시간도 줄인 형태 */
const SHORT_PRESET = [
  ['09:00', '09:30'], ['09:35', '10:05'], ['10:10', '10:40'], ['10:45', '11:15'],
  ['11:20', '11:50'], ['11:55', '12:25'], ['12:30', '13:00'], ['13:05', '13:35'],
];

export function bellsBox(ctx) {
  const box = h('div', {});
  const redraw = () => draw();

  /**
   * 시정 한 벌을 만들어 저장한다.
   * 실패하면 반드시 말한다. 예전에는 조용히 떨어져서 '눌러도 아무 일이 없다' 로 보였다.
   */
  const make = async (partial, okMsg) => {
    try {
      await put('bells', newBell(partial));
      toast(okMsg, 'ok');
      redraw();
    } catch (e) {
      console.error(e);
      toast('시정표를 저장하지 못했습니다: ' + (e.message || e.code || ''), 'warn');
    }
  };

  function draw() {
    clear(box);
    const bells = list('bells');
    const shown = bellList();      // 하나도 없으면 설정값으로 만든 기본 시정이 나온다
    const def = defaultBell();

    box.appendChild(h('p', { class: 'note' },
      '중복(같은 시간) 판정과 결재 문구의 시각이 이 표를 따릅니다. ',
      h('strong', {}, '기본 시정'), ' 은 반드시 하나 있어야 하고, ',
      '단축수업이나 수업공개처럼 다르게 움직이는 날을 위해 여러 벌을 둘 수 있습니다.'));

    if (!bells.length) {
      box.appendChild(h('p', { class: 'muted small' },
        '아직 저장된 시정표가 없어 설정의 기본값을 쓰고 있습니다. 아래에서 [기본 시정 만들기] 를 눌러 저장하세요.'));
    }

    for (const b of shown) box.appendChild(bellCard(b, def, redraw, bells.length));

    box.appendChild(h('div', { class: 'row gap', style: { marginTop: '12px' } },
      !bells.length
        ? h('button', {
          class: 'btn btn-primary',
          onClick: () => make(
            { name: '기본 시정', periods: periodDocs(periodPairs(shown[0].periods)), isDefault: true, order: 1 },
            '기본 시정을 저장했습니다.'),
        }, '기본 시정 만들기')
        : null,
      bells.length
        ? h('button', {
          class: 'btn', onClick: () => make({
            name: '단축 시정',
            // 단축하는 날은 보통 5·6교시까지만 한다. 기본 시정이 8교시까지 있어도 따라가지 않는다.
            // 5교시까지면 6교시 줄의 ✕ 로 지우면 된다.
            periods: periodDocs(SHORT_PRESET.slice(0, Math.min(SHORT_DAY, periodPairs(def.periods).length))),
            order: bells.length + 1,
          }, '단축 시정을 넣었습니다. 시각을 학교에 맞게 고쳐주세요.'),
        }, '+ 단축 시정')
        : null,
      bells.length
        ? h('button', {
          class: 'btn', onClick: () => make({
            name: '수업공개 시정', periods: periodDocs(periodPairs(def.periods)),
            order: bells.length + 1,
            note: '공개 학년만 이 시정으로 움직입니다. 활동에 이 시정을 지정하세요.',
          }, '수업공개 시정을 넣었습니다. 공개 교시의 시각을 고쳐주세요.'),
        }, '+ 수업공개 시정')
        : null,
      bells.length
        ? h('button', { class: 'btn', onClick: () => make(
          { name: '새 시정', periods: periodDocs(periodPairs(def.periods)), order: bells.length + 1 },
          '새 시정을 넣었습니다.') }, '+ 빈 시정')
        : null));
  }

  draw();
  return box;
}

function bellCard(b, def, redraw, saved) {
  const real = saved > 0;                    // 저장된 문서인지(기본값 대체물인지)
  const rows = periodPairs(b.periods);
  const inputs = [];

  const nameIn = h('input', { class: 'input bell-name', value: b.name || '' });
  const noteIn = h('input', { class: 'input', value: b.note || '', placeholder: '메모 (예: 공개 학년만 사용)' });

  const save = async (patch = {}) => {
    if (!real) return;
    try {
      await put('bells', {
        ...b, name: nameIn.value.trim() || b.name, note: noteIn.value.trim(),
        periods: periodDocs(inputs.map(([a, c]) => [a.value, c.value])),
        ...patch,
      });
    } catch (e) {
      console.error(e);
      toast('시정표를 저장하지 못했습니다: ' + (e.message || e.code || ''), 'warn');
    }
  };
  nameIn.addEventListener('change', () => save());
  noteIn.addEventListener('change', () => save());

  // 교시 하나를 빼거나 더한다. 여태 지우는 단추가 없어 단축 시정에 7·8교시가 그대로 남았다.
  // (시각 칸을 비우면 저장 때 빠지긴 했지만 그것을 알 길이 없었다.)
  const dropRow = async (i) => {
    if (inputs.length <= 1) return toast('교시가 하나는 있어야 합니다.', 'warn');
    inputs.splice(i, 1);
    await save();
    toast(`${i + 1}교시를 지웠습니다.`, 'ok');
    redraw();
  };
  const addRow = async () => {
    // 앞 교시와 같은 길이로, 10분 쉬고 잇는다.
    const toMin = (t) => { const [hh, mm] = String(t).split(':').map(Number); return hh * 60 + mm; };
    const last = inputs[inputs.length - 1];
    const s0 = last ? toMin(last[1].value) + 10 : 9 * 60;
    const len = last ? Math.max(20, toMin(last[1].value) - toMin(last[0].value)) : 40;
    inputs.push([{ value: fmtMin(s0) }, { value: fmtMin(s0 + len) }]);
    await save();
    redraw();
  };

  const grid = h('div', { class: 'period-rows' },
    ...rows.map(([s, e], i) => {
      const a = h('input', { class: 'input', type: 'time', value: s });
      const c = h('input', { class: 'input', type: 'time', value: e });
      [a, c].forEach((el) => el.addEventListener('change', () => save()));
      inputs.push([a, c]);
      return h('div', { class: 'period-row' },
        h('span', { class: 'period-label' }, `${i + 1}교시`), a, h('span', {}, '~'), c,
        real && rows.length > 1
          ? h('button', {
            class: 'icon-btn danger', type: 'button', title: `${i + 1}교시 지우기`,
            onClick: () => dropRow(i),
          }, '✕')
          : null);
    }),
    real
      ? h('button', { class: 'btn btn-sm period-add', type: 'button', onClick: addRow }, '+ 교시 추가')
      : null);

  return h('div', { class: `bell-card${b.isDefault ? ' is-default' : ''}` },
    h('div', { class: 'bell-head' },
      nameIn,
      b.isDefault
        ? h('span', { class: 'badge st-approved' }, '기본')
        : (real ? h('button', {
          class: 'btn btn-sm',
          title: '이 시정을 학교의 기본으로 삼습니다',
          onClick: async () => {
            for (const other of list('bells')) {
              if (other.isDefault) await put('bells', { ...other, isDefault: false });
            }
            await save({ isDefault: true });
            toast(`'${nameIn.value || b.name}' 을(를) 기본 시정으로 정했습니다.`, 'ok');
            redraw();
          },
        }, '기본으로') : null),
      real && !b.isDefault
        ? h('button', {
          class: 'icon-btn danger', title: '삭제',
          onClick: async () => {
            if (!(await confirmDialog(`'${b.name}' 시정표를 지울까요?\n이 시정을 쓰던 날짜와 활동은 기본 시정을 따르게 됩니다.`, { danger: true, okText: '지우기' }))) return;
            await remove('bells', b.id);
            for (const d of list('daybell').filter((x) => x.bellId === b.id)) await remove('daybell', d.id);
            toast('지웠습니다.', 'ok'); redraw();
          },
        }, '✕')
        : null),
    h('div', { class: 'bell-range muted small' },
      rows.length ? `1교시 ${rows[0][0]} ~ ${rows.length}교시 ${rows[rows.length - 1][1]}` : ''),
    grid,
    real ? noteIn : null);
}

export { fmtMin };
