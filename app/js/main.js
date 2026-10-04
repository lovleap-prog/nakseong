// 앱 진입점 — 탭 전환, 헤더, 첫 실행 안내, 위젯 모드
import { h, mount, clear, toast, openModal, confirmDialog } from './lib/dom.js';
import { loadConfig, saveConfig, DEFAULTS } from './config.js';
import { effectiveLinks } from './links.js';
import {
  initStore, on, loadSavedUser, currentUser, setUser, isAdmin, backendKind,
  signIn, signOut, needsSignIn, isApproved, pruneAudit, setInitError, initError,
} from './store.js';
import { today, fmtK, addDays, ymd, parseYmd } from './model.js';
import { renderDaily, renderWeekly, renderMonthly } from './views/schedule.js';
import { renderRecurring } from './views/recurring.js';
import { renderTimetable } from './views/timetable.js';
import { renderAcademic } from './views/academic.js';
import { renderTrips } from './views/trips.js';
import { memoPanel, memoComposer } from './views/memoview.js';
import { memoCounts, clearDoneMemos } from './memo.js';
import { renderAfterSchool } from './views/afterschool.js';
import { renderApprovals } from './views/approvals.js';
import { renderImporter } from './views/importer.js';
import { renderSettings } from './views/settings.js';
import { dayBundle, pendingList, myPendingCount, isNoMeal } from './select.js';
import { postsIn } from './views/board.js';
import { mySubs } from './views/subplan.js';
import { isChecked, toggleCheck } from './checks.js';
import { openDayExport } from './ui/exporter.js';
import { hlClass } from './ui/hilite.js';
import { ROLE } from './model.js';

const TABS = [
  ['daily', '일일', renderDaily],
  ['weekly', '주간', renderWeekly],
  ['monthly', '월간', renderMonthly],
  ['timetable', '시간표', renderTimetable],
  ['recurring', '반복일정', renderRecurring],
  ['afterschool', '방과후', renderAfterSchool],
  ['academic', '학사일정', renderAcademic],
  ['trips', '출장', renderTrips],
  ['approvals', '승인함', renderApprovals],
  ['import', '불러오기', renderImporter],
  ['settings', '설정', renderSettings],
];

// 교사가 쓰는 탭. 나머지(시간표·반복일정·방과후·학사일정·불러오기)는 관리자가 고치는
// 곳이라, 교사에게 열어 두면 들어가서 할 일이 없거나 잘못 눌러 헷갈리기만 한다.
// 교사가 보는 교과교담·방과후·학사일정은 [일일]·[주간]·[월간] 안에 이미 다 나온다.
// 시간표·방과후·학사일정은 선생님도 봐야 흐름이 잡힌다. 불러오기는 선생님도 제 일정을 한꺼번에 올린다(확인 대기로). 고치는 단추는 각 화면에서 관리자에게만 보인다.
const TEACHER_TABS = new Set(['daily', 'weekly', 'monthly', 'timetable', 'afterschool', 'academic', 'trips', 'approvals', 'import', 'settings']);
const visibleTabs = () => TABS.filter(([k]) => isAdmin() || TEACHER_TABS.has(k));
// 교사에게 '승인함' 은 맞지 않는 이름이다. 교사는 승인하지 않고 제출한다.
const tabLabel = (key, label) => (key === 'approvals' && !isAdmin() ? '내 제출' : label);

/**
 * 주소에 ?date=2026-11-03 이 실려 있으면 그 날로 연다.
 * 남에게 '이 날 좀 보세요' 하고 보낼 때 쓰는 길이다. 아래 '늘 오늘부터' 규칙보다 앞선다.
 */
const askedDate = (() => {
  try {
    const d = new URLSearchParams(location.search).get('date') || '';
    // 모양만 맞는 '2026-13-99' 같은 것은 버린다. 되돌려 적어 보고 같을 때만 날짜로 본다.
    return /^\d{4}-\d{2}-\d{2}$/.test(d) && ymd(parseYmd(d)) === d ? d : '';
  } catch { return ''; }
})();

const state = {
  tab: 'daily',
  date: askedDate || today(),
  state: {},   // 각 화면이 쓰는 임시 상태
  memoOpen: (() => { try { return !!localStorage.getItem('sam.memoOpen'); } catch { return false; } })(),
  userMenu: false,   // 머리말 이름 단추를 눌러 연 상태
  moreOpen: false,   // 휴대전화 아래 탭바의 [관리] 를 펼친 상태
};

const ctx = {
  get date() { return state.date; },
  get state() { return state.state; },
  setDate(d) { state.date = d; render(); },
  go(tab) { state.tab = tab; state.moreOpen = false; syncHash(); render(); },
  refresh() { render(); },
};

const app = document.getElementById('app');
const isWidget = new URLSearchParams(location.search).get('mode') === 'widget';

let cfg = loadConfig();

/**
 * 조용히 떨어지는 실패를 막는다.
 *
 * 시정표 저장이 파이어스토어에 막혀 터졌는데 아무 말도 없이 '눌러도 아무 일이 없다'
 * 로만 보였다. 선생님들 화면의 콘솔을 볼 수가 없으니, 터진 것은 무조건 화면에 띄운다.
 */
function catchSilentFailures() {
  const say = (err) => {
    const msg = (err && (err.message || err.code)) || String(err || '');
    if (!msg) return;
    console.error(err);
    toast('문제가 생겼습니다: ' + msg, 'warn');
  };
  window.addEventListener('unhandledrejection', (e) => say(e.reason));
  window.addEventListener('error', (e) => { if (e.error) say(e.error); });
}

/**
 * '지금 이 컴퓨터에만 저장되고 있다' 를 늘 보이게 하는 띠.
 *
 * 학교 전체로 쓰기로 해 둔 앱인데 이 브라우저만 혼자 저장으로 돌고 있으면, 적는 사람은
 * 알 길이 없다. 화면은 똑같고 저장도 되니까. 그러다 다른 컴퓨터에서 열어 보고 나서야
 * '자료가 사라졌다' 고 한다. 사라진 게 아니라 그 컴퓨터에만 있었던 것이다.
 * 연결이 끊겨 갈아탄 경우엔 토스트 하나가 3초 떴다 사라질 뿐이었다. 그래서 띠로 세운다.
 */
function localOnlyBar() {
  const meant = DEFAULTS.backend === 'firestore' && !!(DEFAULTS.firebase || {}).apiKey;
  if (!meant || backendKind() === 'firestore') return null;
  // 붙으려다 실패한 것과, 애초에 '이 컴퓨터' 로 맞춰져 있는 것은 손쓸 방법이 다르다.
  const failed = !!initError();
  return h('div', { class: 'local-bar', role: 'alert' },
    h('span', { class: 'local-bar-ico' }, '\u26A0'),
    h('span', {},
      h('b', {}, '지금 이 컴퓨터에만 저장됩니다.'),
      ' 여기서 적은 것은 다른 선생님께 보이지 않습니다. ',
      failed
        ? h('span', { class: 'muted' }, `학교 서버에 붙지 못했습니다 — ${initError()}`)
        : h('span', { class: 'muted' }, '이 컴퓨터가 [이 컴퓨터에만 저장] 으로 맞춰져 있습니다.')),
    h('button', {
      class: 'btn btn-sm btn-primary',
      onClick: () => {
        const c = loadConfig();
        c.backend = 'firestore';
        saveConfig(c);
        location.reload();
      },
    }, failed ? '다시 연결해 보기' : '학교 전체로 연결'));
}

async function boot() {
  catchSilentFailures();
  loadSavedUser();
  document.body.classList.toggle('widget', isWidget);

  try {
    const kind = await initStore(cfg);
    if (kind === 'firestore') document.body.classList.add('online');
  } catch (e) {
    console.error(e);
    // 갈아탄 것을 설정에 저장하지는 않는다. 다음에 열 때 다시 학교 전체로 붙어야 한다.
    setInitError(e && e.message ? e.message : String(e));
    toast('학교 서버에 연결하지 못했습니다. 이 컴퓨터 저장으로 엽니다.', 'warn');
    await initStore({ ...cfg, backend: 'local' });
  }

  // 데이터가 바뀌면 화면을 다시 그린다(다른 선생님의 입력이 바로 보인다).
  on('*', () => render());

  readHash();
  render();
  // 위젯(작은 창)은 보기 전용이라 이름을 묻지 않는다.
  // 학교 전체가 함께 쓰는 방식에서는 이름·역할이 구글 로그인과 명단에서 오므로 묻지 않는다.
  if (!isWidget && backendKind() !== 'firestore' && !currentUser().name) setTimeout(askName, 300);
  registerSW();

  // 오래된 변경 이력은 관리자가 들어올 때 조용히 치운다. 하루에 한 번만 돈다.
  // 자료가 다 들어온 뒤에 세어야 하므로 조금 늦춘다. 위젯 창에서는 하지 않는다.
  if (!isWidget) {
    setTimeout(() => {
      pruneAudit()
        .then((n) => { if (n) console.info(`[이력] 오래된 ${n}건을 치웠습니다.`); })
        .catch(() => {});
    }, 8000);
  }
}

/**
 * 앱을 새로 열 때인가 (다시 불러오기·뒤로가기가 아니라).
 * 알 수 없는 브라우저에서는 '새로 열었다' 고 본다. 오늘로 여는 쪽이 안전하다.
 */
function openedFresh() {
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    return !nav || nav.type === 'navigate';
  } catch { return true; }
}

let firstRead = true;

/**
 * 주소의 #/daily/2026-09-21 을 읽는다.
 *
 * 화면을 옮길 때마다 날짜를 주소에 적어 둔다. 그런데 바탕화면·홈 화면 아이콘은
 * **마지막에 보던 주소를 그대로 다시 연다.** 그래서 9월에 보던 날짜가 10월에도
 * 그대로 떴다. 아침에 열면 오늘이 떠야 한다.
 *
 * 그래서 **앱을 새로 열 때는 주소에 적힌 날짜를 버리고 오늘로 연다.** 탭은 그대로 둔다
 * (월간을 보던 분은 월간으로 여는 게 맞다). 다시 불러오기(F5)와 뒤로·앞으로는 건드리지
 * 않는다. 보던 날을 잃으면 그게 더 성가시다.
 * 날짜를 실어 보내려면 ?date=2026-11-03 을 쓴다. 그것은 늘 따른다.
 */
function readHash() {
  const first = firstRead;
  firstRead = false;
  const m = location.hash.match(/^#\/(\w+)(?:\/(\d{4}-\d{2}-\d{2}))?/);
  if (!m) return;
  if (TABS.some(([k]) => k === m[1])) state.tab = m[1];
  if (!m[2]) return;
  // 처음 읽을 때는 주소에 적힌 날짜를 쓰지 않는다 — ?date= 가 있으면 그것이 앞서고,
  // 없으면 오늘이다. 다시 불러오기·뒤로가기일 때만 보던 날을 되살린다.
  if (first && (askedDate || openedFresh())) return;
  state.date = m[2];
}
function syncHash() {
  const next = `#/${state.tab}/${state.date}`;
  if (location.hash !== next) history.replaceState(null, '', next);
}
window.addEventListener('hashchange', () => { readHash(); render(); });

function askName() {
  const nameIn = h('input', { class: 'input', placeholder: '예) 김민수' });
  const deptIn = h('input', { class: 'input', placeholder: '예) 교무기획부' });
  const roleSel = h('select', { class: 'input' },
    ...Object.entries(ROLE).map(([k, v]) => h('option', { value: k }, v)));
  openModal('처음 오셨네요. 이름을 알려주세요.', h('div', { class: 'form-grid' },
    h('div', { class: 'span2' }, h('label', { class: 'field' }, h('span', { class: 'field-label' }, '이름 *'), nameIn)),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, '부서/계'), deptIn),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, '역할'), roleSel,
      h('span', { class: 'field-hint' }, '승인 권한이 필요하면 관리자를 고르세요.')),
    h('p', { class: 'span2 muted small' }, '나중에 [설정] 탭에서 바꿀 수 있습니다.')), [
    {
      label: '시작하기', class: 'btn-primary',
      onClick: (c) => {
        if (!nameIn.value.trim()) return toast('이름을 입력해 주세요.', 'warn');
        setUser({ name: nameIn.value.trim(), dept: deptIn.value.trim(), role: roleSel.value });
        c(); render();
      },
    },
  ]);
  setTimeout(() => nameIn.focus(), 50);
}

/** @param {{bare?:boolean}} opt  bare 면 탭과 개인 단추를 감춘다(로그인·승인 대기 화면). */
function header(opt = {}) {
  cfg = loadConfig();
  const me = currentUser();
  const bare = !!opt.bare;
  // 탭의 숫자는 그 탭 안에 보이는 건수와 같아야 한다.
  // 관리자: 학교 전체 대기. 교사: 내가 낸 대기만.
  const pend = bare ? 0 : (isAdmin() ? pendingList().length : myPendingCount(me.name));

  return h('header', { class: 'top' },
    h('div', { class: 'brand' },
      h('span', { class: 'logo' }, '\u{1F4DA}'),
      h('div', {},
        h('strong', {}, cfg.school.name || '학교 교육활동'),
        h('span', { class: 'sub' }, '일일 · 주간 · 월간 교육활동'))),
    h('div', { class: 'top-right' },
      ...(bare ? [] : linkButtons()),
      h('span', { class: `conn ${backendKind()}` },
        backendKind() === 'firestore' ? '실시간 공유' : '이 컴퓨터 저장'),
      ...(bare ? [] : [
        memoButton(),
        h('button', {
          class: 'btn btn-sm widget-btn', title: '작은 창으로 띄우기 (바탕화면 한쪽에 두고 보기 좋습니다)',
          onClick: openWidget,
        }, '위젯 창'),
        userMenu(me),
      ])),
    bare ? null : h('nav', { class: 'tabs' },
      ...visibleTabs().map(([key, label]) => h('button', {
        class: `tab${state.tab === key ? ' on' : ''}`,
        onClick: () => ctx.go(key),
      }, tabLabel(key, label),
        key === 'approvals' && pend ? h('span', { class: 'tab-badge' }, pend) : null))));
}

/**
 * 머리말의 이름 단추. 누르면 [설정]과 [로그아웃]이 함께 열린다.
 *
 * 교무실 공용 컴퓨터를 함께 쓰는 학교가 많다. 앞사람 계정이 남아 있으면
 * 다음 분이 낸 출장 신청이 앞사람 이름으로 올라간다. 그래서 로그아웃을
 * 설정 탭 안쪽이 아니라 여기, 한 번 누르면 닿는 자리에 둔다.
 */
function userMenu(me) {
  const label = `${me.name || '이름 설정'}${isAdmin() ? ' · 관리자' : ''}`;
  const btn = h('button', {
    class: `user-btn${state.userMenu ? ' on' : ''}`,
    title: backendKind() === 'firestore' ? '내 정보 · 로그아웃' : '설정',
    onClick: (e) => {
      e.stopPropagation();
      // 로그인이 없는 방식에서는 여닫을 것이 없으니 바로 설정으로 간다.
      if (backendKind() !== 'firestore') return ctx.go('settings');
      state.userMenu = !state.userMenu;
      render();
    },
  }, label, backendKind() === 'firestore' ? h('span', { class: 'caret' }, '\u25BE') : null);

  if (!state.userMenu || backendKind() !== 'firestore') return h('div', { class: 'user-wrap' }, btn);

  const close = () => { state.userMenu = false; render(); };
  // 바깥을 누르면 닫는다. 한 번만 듣고 스스로 뗀다.
  setTimeout(() => document.addEventListener('click', close, { once: true }), 0);

  return h('div', { class: 'user-wrap' }, btn,
    h('div', { class: 'user-pop', onClick: (e) => e.stopPropagation() },
      h('div', { class: 'user-pop-head' },
        h('b', {}, me.name || '(이름 없음)'),
        h('span', { class: 'muted small' }, me.email || '')),
      h('button', {
        class: 'user-pop-item',
        onClick: () => { close(); ctx.go('settings'); },
      }, '\u2699\uFE0F 설정'),
      h('button', {
        class: 'user-pop-item danger',
        onClick: async () => {
          const ok = await confirmDialog(
            '로그아웃할까요? 공용 컴퓨터라면 쓰고 나서 꼭 눌러주세요.',
            { okText: '로그아웃' });
          if (ok) { state.userMenu = false; await signOut(); }
        },
      }, '\u{1F6AA} 로그아웃')));
}

/**
 * 학교 자료실(노션) 같은 바로가기.
 * 접근 권한이 없는 분에게도 그냥 보여준다 — 눌러도 그쪽에서 막히기 때문에
 * 굳이 숨길 이유가 없고, 권한 있는 분이 찾기 쉬운 편이 낫다.
 */
function linkButtons() {
  return effectiveLinks()
    .map((l) => h('a', {
      class: 'link-btn',
      href: l.url,
      target: '_blank',
      rel: 'noopener noreferrer',
      title: `${l.url}\n새 창에서 열립니다. 접근 권한이 있는 계정만 볼 수 있습니다.`,
    }, h('span', { class: 'link-ico' }, '\u{1F517}'), l.label || '바로가기'));
}

// ── 스티커 메모 (개인) ─────────────────────────────────────
// 바탕화면 스티커처럼 화면 한쪽에 띄워두고 쓴다. 본인에게만 보인다.
function memoButton() {
  const { open } = memoCounts();
  return h('button', {
    class: `btn btn-sm memo-btn${state.memoOpen ? ' on' : ''}`,
    title: '내 메모 (나에게만 보입니다)',
    onClick: () => { state.memoOpen = !state.memoOpen; saveMemoOpen(); render(); },
  }, '\u{1F4DD} 메모', open ? h('span', { class: 'memo-badge' }, open) : null);
}

function saveMemoOpen() {
  try { localStorage.setItem('sam.memoOpen', state.memoOpen ? '1' : ''); } catch { /* 저장 불가 */ }
}

function memoDock() {
  if (!state.memoOpen) return null;
  const rerender = () => render();
  return h('aside', { class: 'memo-dock' },
    h('div', { class: 'memo-dock-head' },
      h('strong', {}, '\u{1F4DD} 내 메모'),
      h('span', { class: 'muted small' }, '나에게만 보입니다'),
      h('button', {
        class: 'btn btn-sm',
        onClick: async () => {
          const n = await clearDoneMemos();
          toast(n ? `끝낸 메모 ${n}장을 지웠습니다.` : '끝낸 메모가 없습니다.', n ? 'ok' : 'warn');
          render();
        },
      }, '끝난 것 치우기'),
      h('button', { class: 'icon-btn', title: '닫기', onClick: () => { state.memoOpen = false; saveMemoOpen(); render(); } }, '\u2715')),
    h('div', { class: 'memo-dock-body' }, memoPanel(rerender)),
    h('div', { class: 'memo-dock-foot' }, memoComposer(rerender)));
}

function openWidget() {
  // 보던 날짜를 ?date= 로 싣는다. 해시에 적힌 날짜는 '새로 연 창' 에서 버려지기 때문이다.
  const url = `${location.pathname}?mode=widget&date=${state.date}#/daily/${state.date}`;
  const w = window.open(url, 'sam-widget', 'width=430,height=760,menubar=no,toolbar=no,location=no');
  if (!w) toast('팝업이 차단됐습니다. 주소창의 차단 해제를 눌러주세요.', 'warn');
}

// ── 위젯(작은 창) 화면 ──────────────────────────────────────
function renderWidget() {
  const b = dayBundle(state.date, { onlyApproved: true });
  const items = [...b.activities, ...b.recurring];
  // 공지는 큰 화면에만 있었다. 그런데 위젯은 하루 내내 한쪽에 띄워 두는 창이라,
  // 공문 접수·안내장 수합 같은 알림은 오히려 여기서 봐야 한다. 읽기만 한다.
  const posts = postsIn(state.date, state.date);
  return h('div', { class: 'widget-wrap' },
    h('div', { class: 'widget-top' },
      h('button', { class: 'icon-btn', onClick: () => ctx.setDate(addDays(state.date, -1)) }, '‹'),
      h('strong', {}, fmtK(state.date)),
      h('button', { class: 'icon-btn', onClick: () => ctx.setDate(addDays(state.date, 1)) }, '›'),
      h('button', { class: 'btn btn-sm', onClick: () => ctx.setDate(today()) }, '오늘')),
    h('div', { class: 'widget-body' },
      // 내가 보결로 들어가는 날이면 위젯에도 뜬다. 하루 내내 띄워 두는 창이라 여기서 본다.
      (() => {
        const mine = mySubs(state.date, currentUser().name);
        if (!mine.length) return null;
        return h('div', { class: 'widget-mysub' },
          h('h4', {}, `\u{1F64B} 내 보결 ${mine.length}건`),
          h('ul', {}, ...mine.map(({ trip, row }) => h('li', {},
            h('strong', {}, [row.period, row.klass].filter(Boolean).join(' ') || '교시 미기재'),
            ` — ${trip.applicant || ''} 출장`))));
      })(),
      isNoMeal(state.date)
        ? h('div', { class: 'widget-nomeal' }, '\u{1F37D} 비급식일 — 급식이 없습니다')
        : null,
      posts.length
        ? h('div', { class: 'widget-notice' },
          h('h4', {}, '\u{1F4E2} 공지 ', h('span', { class: 'sec-count' }, posts.length)),
          h('ul', {}, ...posts.map((p) => h('li', {},
            h('span', { class: 'wn-text' }, p.text || ''),
            p.by ? h('span', { class: 'wn-by' }, p.by) : null))))
        : null,
      items.length
        ? h('ul', { class: 'widget-list' }, ...items.map((a) => {
          const done = isChecked(state.date, a);
          return h('li', { class: `${done ? 'is-done' : ''}${hlClass(a)}`.trim() },
            h('input', {
              type: 'checkbox', class: 'w-check', checked: done,
              title: '확인했으면 체크하세요 (나에게만 보입니다)',
              onChange: () => toggleCheck(state.date, a),
            }),
            h('span', { class: 'w-time' }, a.time || '—'),
            h('span', { class: 'w-title' }, a.title),
            a.isRecurring ? h('span', { class: 'badge st-rec' }, '상시') : null,
            a.place ? h('span', { class: 'w-place' }, a.place) : null);
        }))
        : h('div', { class: 'empty' }, '승인된 일정이 없습니다.'),
      b.afterSchool.length
        ? h('div', { class: 'widget-after' },
          h('h4', {}, `방과후 ${b.afterSchool.length}강좌`),
          h('ul', {}, ...b.afterSchool.map((p) => h('li', {}, `${p.time || ''} ${p.name}${p.room ? ` (${p.room})` : ''}`))))
        : null),
    h('div', { class: 'widget-foot' },
      ...linkButtons().slice(0, 1),
      h('button', { class: 'btn btn-sm', onClick: () => openDayExport(state.date) }, '일일 안내문'),
      h('button', {
        class: 'btn btn-sm',
        onClick: () => window.open(`${location.pathname}?date=${state.date}#/daily/${state.date}`, 'sam-main'),
      }, '전체 열기')));
}

function render() {
  syncHash();
  if (isWidget) { mount(app, localOnlyBar(), renderWidget()); return; }
  // 학교 전체가 함께 쓰는 방식일 때는 로그인과 승인을 먼저 지난다.
  const gate = authGate();
  if (gate) { mount(app, localOnlyBar(), header({ bare: true }), h('main', { class: 'main' }, gate)); return; }

  // 주소창이나 예전 바로가기로 관리 탭에 들어온 교사는 일일로 돌려보낸다.
  if (!visibleTabs().some(([k]) => k === state.tab)) { state.tab = 'daily'; syncHash(); }
  const tab = TABS.find(([k]) => k === state.tab) || TABS[0];
  mount(app, localOnlyBar(), header(), h('main', { class: 'main' }, tab[2](ctx)), memoDock(), bottomNav());
}

// 아래 탭바의 선 그림. 글자만으로는 엄지로 누를 자리가 작다.
const NAV_ICON = {
  daily: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  weekly: '<rect x="4" y="6" width="16" height="14" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  monthly: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 9h16M8 13h2M12 13h2M16 13h1M8 16h2M12 16h2"/>',
  trips: '<path d="M5 16l2-6h10l2 6M4 16h16v3H4zM7 19v1M17 19v1"/>',
  approvals: '<path d="M6 4h9l3 3v13H6z"/><path d="M9 12l2 2 4-4"/>',
  more: '<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>',
};
// 관리자가 [관리] 로 펴는 탭들
const MORE_TABS = ['timetable', 'recurring', 'afterschool', 'academic', 'trips', 'import', 'settings'];
const TEACHER_MORE = ['timetable', 'afterschool', 'academic', 'trips', 'import', 'settings'];
const moreTabs = () => (isAdmin() ? MORE_TABS : TEACHER_MORE);

/**
 * 휴대전화 아래 탭바. 컴퓨터에서는 보이지 않는다(CSS).
 *
 * 위 탭 줄은 폭이 785px 인데 휴대전화 화면은 366px 이라 여섯째 탭부터 옆으로 밀어야
 * 나왔고, 밀 수 있다는 표시도 없었다. 엄지가 닿는 아래로 내리고 다섯 칸으로 줄인다.
 * 교사: 오늘·이번 주·이번 달·출장·내 제출. 관리자: 넷째가 승인함, 다섯째 [관리] 가 나머지를 편다.
 * 설정은 머리말의 이름 단추로 간다.
 */
function bottomNav() {
  const me = currentUser();
  const pend = isAdmin() ? pendingList().length : myPendingCount(me.name);
  const items = isAdmin()
    ? [['daily', '오늘'], ['weekly', '이번 주'], ['monthly', '이번 달'], ['approvals', '승인함'], ['more', '관리']]
    : [['daily', '오늘'], ['weekly', '이번 주'], ['monthly', '이번 달'], ['approvals', '내 제출'], ['more', '더보기']];
  const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${NAV_ICON[k]}</svg>`;

  return h('div', { class: 'bnav-wrap' },
    state.moreOpen
      ? h('div', { class: 'bnav-sheet', role: 'menu' },
        ...TABS.filter(([k]) => moreTabs().includes(k)).map(([k, label]) => h('button', {
          class: `bnav-sheet-item${state.tab === k ? ' on' : ''}`, role: 'menuitem',
          onClick: () => ctx.go(k),
        }, label)))
      : null,
    h('nav', { class: 'bnav', 'aria-label': '화면 이동' },
      ...items.map(([k, label]) => {
        const on = k === 'more' ? (state.moreOpen || moreTabs().includes(state.tab)) : state.tab === k;
        return h('button', {
          class: `bnav-item${on ? ' on' : ''}`,
          'aria-current': on && k !== 'more' ? 'page' : null,
          'aria-expanded': k === 'more' ? String(state.moreOpen) : null,
          onClick: () => {
            if (k === 'more') { state.moreOpen = !state.moreOpen; render(); } else ctx.go(k);
          },
        },
        h('span', { class: 'bnav-ico', html: svg(k) }),
        h('span', { class: 'bnav-label' }, label,
          k === 'approvals' && pend ? h('i', { class: 'bnav-badge' }, pend) : null));
      })));
}

/**
 * 로그인·승인 관문. 통과할 게 없으면 null 을 돌려준다.
 *
 * 선생님들이 개인 메일을 쓰면 구글 도메인으로 막을 수가 없다.
 * 그래서 '로그인했으면 통과' 대신 '관리자가 명단에서 승인해야 통과' 로 한다.
 * 승인 전에는 자료를 한 줄도 내려받지 않는다(구독 자체를 시작하지 않는다).
 */
function authGate() {
  if (backendKind() !== 'firestore') return null;
  const u = currentUser();

  if (needsSignIn()) {
    return h('div', { class: 'gate' },
      h('div', { class: 'gate-card' },
        h('div', { class: 'gate-ico' }, '\u{1F3EB}'),
        h('h2', {}, `${cfg.school.name || '학교'} 교육활동`),
        h('p', { class: 'muted' }, '선생님 구글 계정으로 로그인해 주세요.'),
        h('button', {
          class: 'btn btn-primary btn-lg',
          onClick: async (e) => {
            e.currentTarget.disabled = true;
            try { await signIn(); }
            catch (err) {
              console.error(err);
              toast('로그인에 실패했습니다: ' + (err.message || err.code || ''), 'warn');
              e.currentTarget.disabled = false;
            }
          },
        }, '구글 계정으로 로그인'),
        h('p', { class: 'muted small' },
          '처음 오신 분은 로그인 뒤 관리자 승인을 기다리셔야 합니다.')));
  }

  if (!isApproved()) {
    return h('div', { class: 'gate' },
      h('div', { class: 'gate-card' },
        h('div', { class: 'gate-ico' }, '\u{23F3}'),
        h('h2', {}, '승인을 기다리고 있습니다'),
        h('p', {}, h('b', {}, u.name || u.email), ' 님으로 로그인했습니다.'),
        h('p', { class: 'muted' },
          '관리자가 명단에서 승인하면 바로 열립니다. 새로 고치지 않으셔도 됩니다.'),
        h('p', { class: 'muted small' },
          '승인 전에는 학교 자료를 전혀 내려받지 않습니다.'),
        h('button', { class: 'btn', onClick: () => signOut() }, '다른 계정으로 로그인')));
  }
  return null;
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return; // 파일로 직접 열면 설치가 안 된다

  navigator.serviceWorker.register('./sw.js')
    .then((reg) => {
      // 새 판이 올라오면 알려준다. 앱을 하루 종일 켜 두는 분이 많아서,
      // 말해주지 않으면 며칠씩 옛 화면을 보게 된다.
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          // controller 가 이미 있다는 건 첫 설치가 아니라 '갱신' 이라는 뜻이다.
          if (sw.state === 'installed' && navigator.serviceWorker.controller) offerReload();
        });
      });
      // 다른 탭에서 갱신됐을 수도 있으니 한 번 확인한다.
      reg.update().catch(() => {});

      // 앱으로 설치해 하루 종일 켜 두면 새로 여는 일이 없어 갱신을 놓친다.
      // 창을 다시 볼 때와 한 시간마다 한 번씩 서버에 물어본다.
      const look = () => reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => { if (!document.hidden) look(); });
      window.addEventListener('focus', look);
      setInterval(look, 60 * 60 * 1000);
    })
    .catch((e) => console.warn('SW 등록 실패', e));
}

let reloadOffered = false;
function offerReload() {
  if (reloadOffered) return;
  reloadOffered = true;
  const bar = h('div', { class: 'update-bar' },
    h('span', {}, '새 버전이 나왔습니다.'),
    h('button', { class: 'btn btn-sm btn-primary', onClick: () => location.reload() }, '새로고침'),
    h('button', { class: 'btn btn-sm', onClick: () => bar.remove() }, '나중에'));
  document.body.appendChild(bar);
}

boot();
export { ctx, state };
