// 설정 탭 — 사용자, 학교 정보, 저장 방식, 백업/복원, 설치 안내
import { h, toast, confirmDialog, download, clear } from '../lib/dom.js';
import { loadConfig, saveConfig, resetConfig, APP_VERSION } from '../config.js';
import {
  currentUser, setUser, exportAll, importAll, backendKind, list, isAdmin, signOut,
  whereAmI, readErrors,
} from '../store.js';
import { ROLE } from '../model.js';
import { insertSample, removeSample, hasSample } from '../sampledata.js';
import { staffBox } from './staffbox.js';
import { bellsBox } from './bellsbox.js';
import { membersBox } from './membersbox.js';
import { sharedLinksMeta, saveSharedLinks, hasSharedLinks, editableLinks, localLinks } from '../links.js';
import { localLeftovers, uploadLeftovers } from '../store.js';

const field = (label, input, hint) =>
  h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input,
    hint ? h('span', { class: 'field-hint' }, hint) : null);

export function renderSettings(ctx) {
  const cfg = loadConfig();
  const me = currentUser();
  // 학교 전체가 함께 쓰는 방식에서는 이름·역할이 구글 계정과 명단에서 온다.
  // 여기서 고칠 수 있게 두면, 스스로 '관리자' 로 바꿔 놓고 왜 저장이 안 되는지
  // 헤매게 된다(규칙이 막으므로 실제로 되지는 않는다).
  const shared = backendKind() === 'firestore';
  // 학교 전체 방식에서 교사는 내 정보·앱 판 확인·설치 안내만 본다. 나머지는 학교 설정이라
  // 관리자가 고친다. 교사에게 열어 두면 [저장 위치] 를 잘못 바꿔 자료가 '사라진' 것처럼
  // 보이거나, 규칙에 막혀 저장이 안 되는 단추를 누르게 된다.
  // 혼자 쓰는 방식(로컬)은 그 컴퓨터 주인이 곧 관리자다. 거기서 파이어베이스로 넘어가므로 다 보인다.
  const full = !shared || isAdmin();

  // ── 사용자 ──
  const nameIn = h('input', { class: 'input', value: me.name || '', placeholder: '예) 김민수' });
  const deptIn = h('input', { class: 'input', value: me.dept || '', placeholder: '예) 교무기획부' });
  const roleSel = h('select', { class: 'input' },
    ...Object.entries(ROLE).map(([k, v]) => h('option', { value: k, selected: me.role === k }, v)));

  // ── 학교 ──
  const schoolIn = h('input', { class: 'input', value: cfg.school.name || '' });
  const principalIn = h('input', { class: 'input', value: cfg.school.principal || '', placeholder: '예) 교장' });
  const contactIn = h('input', { class: 'input', value: cfg.school.contact || '' });

  // ── 저장 방식 ──
  const backendSel = h('select', { class: 'input' },
    h('option', { value: 'local', selected: cfg.backend === 'local' }, '이 컴퓨터에만 저장 (체험용, 동기화 없음)'),
    h('option', { value: 'firestore', selected: cfg.backend === 'firestore' }, 'Firebase 실시간 공유 (학교 전체)'));

  const fb = {};
  const fbFields = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
  const fbBox = h('div', { class: 'form-grid' },
    ...fbFields.map((k) => field(k, (fb[k] = h('input', { class: 'input', value: cfg.firebase[k] || '' })))),
    field('학교 구글 도메인(선택)', (fb.hd = h('input', { class: 'input', value: cfg.googleHostedDomain || '', placeholder: '예) goe.go.kr' })),
      '적어두면 그 도메인 계정만 로그인됩니다.'),
    field('학교 코드', (fb.schoolId = h('input', { class: 'input', value: cfg.schoolId || 'default' })),
      '한 프로젝트를 여러 학교가 함께 쓸 때 구분값'));
  const syncFb = () => { fbBox.style.display = backendSel.value === 'firestore' ? '' : 'none'; };
  backendSel.addEventListener('change', syncFb);
  setTimeout(syncFb, 0);

  // ── 바로가기 링크 (학교 노션 자료실 등) ──
  const linkRows = [];
  const linkBox = h('div', { class: 'link-rows' });
  // 공용 방식에서 교사는 보기만 한다. 고치는 것은 관리자다.
  const linksLocked = shared && !isAdmin();
  const addLinkRow = (link = { label: '', url: '' }) => {
    const label = h('input', { class: 'input', value: link.label || '', placeholder: '예) 학교 자료실(노션)', disabled: linksLocked });
    const url = h('input', { class: 'input', value: link.url || '', placeholder: 'https://www.notion.so/...', disabled: linksLocked });
    const row = h('div', { class: 'link-row' }, label, url,
      linksLocked ? null : h('button', {
        class: 'icon-btn danger', title: '이 줄 삭제',
        onClick: () => { row.remove(); const i = linkRows.indexOf(entry); if (i >= 0) linkRows.splice(i, 1); },
      }, '\u2715'));
    const entry = { label, url };
    linkRows.push(entry);
    linkBox.appendChild(row);
  };
  // 학교 전체가 함께 쓰는 방식이면 공용 목록을 채운다(그게 모두에게 보이는 값이다).
  const startLinks = editableLinks();
  ((startLinks && startLinks.length) ? startLinks : [{ label: '', url: '' }]).forEach(addLinkRow);
  const readLinkRows = () => linkRows
    .map((r) => ({ label: r.label.value.trim(), url: r.url.value.trim() }))
    .filter((l) => l.url);

  // ── 한글 문서 ──
  const fontIn = h('input', { class: 'input', value: cfg.hwp.font });
  const sizeIn = h('input', { class: 'input', type: 'number', min: '8', max: '20', value: String(cfg.hwp.fontSize) });
  const groupIn = h('textarea', {
    class: 'input mono', rows: 3, spellcheck: 'false',
    placeholder: '도덕,과학,체육',
  });
  groupIn.value = (cfg.timetableGroups || []).join('\n');

  const fileIn = h('input', { type: 'file', class: 'sr-file', accept: '.json' });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files[0]; fileIn.value = '';
    if (!f) return;
    try {
      const payload = JSON.parse(await f.text());
      const replace = await confirmDialog('기존 자료를 모두 지우고 복원할까요?\n[취소]를 누르면 기존 자료에 합쳐집니다.', { okText: '지우고 복원' });
      await importAll(payload, { replace });
      toast('복원했습니다.', 'ok');
      ctx.refresh();
    } catch (e) { toast('복원 실패: ' + e.message, 'warn'); }
  });

  const counts = ['activities', 'recurring', 'afterschool', 'audit'].map((c) => `${labelOf(c)} ${list(c).length}`).join(' · ');

  return h('div', { class: 'view view-narrow' },
    box('내 정보', shared
      ? h('div', {},
          h('div', { class: 'form-grid' },
            field('이름', h('input', { class: 'input', value: me.name || '', disabled: true })),
            field('계정', h('input', { class: 'input', value: me.email || '', disabled: true })),
            h('div', { class: 'span2' }, field('역할',
              h('input', {
                class: 'input',
                value: me.role === 'admin' ? ROLE.admin : ROLE.teacher,
                disabled: true,
              })))),
          h('p', { class: 'muted small' },
            '이름과 역할은 구글 계정과 학교 명단에서 옵니다. 바꾸시려면 관리자에게 말씀하세요.'),
          h('div', { class: 'row gap' },
            h('button', {
              class: 'btn btn-sm',
              onClick: async () => { await signOut(); },
            }, '로그아웃')))
      : h('div', { class: 'form-grid' },
          field('이름 *', nameIn, '결재 문구와 이력에 이 이름이 쓰입니다.'),
          field('부서/계', deptIn),
          h('div', { class: 'span2' }, field('역할', roleSel,
            '관리자만 승인·반려·오기재 수정을 할 수 있습니다.')))),

    full && box('학교 정보', h('div', { class: 'form-grid' },
      field('학교명', schoolIn),
      field('결재선 표기', principalIn),
      h('div', { class: 'span2' }, field('안내 문의처', contactIn, '메신저 안내문 맨 아래에 들어갑니다.')))),

    full && box('자료 저장 방식', h('div', {},
      h('div', { class: 'form-grid' }, h('div', { class: 'span2' }, field('저장 위치', backendSel))),
      h('p', { class: 'note' },
        '현재 연결: ', h('strong', {}, backendKind() === 'firestore' ? 'Firebase 실시간 공유' : '이 컴퓨터(로컬)'),
        ' — ', counts),
      fbBox,
      h('div', { class: 'row gap' },
        h('button', {
          class: 'btn btn-sm',
          title: '이 컴퓨터에 저장된 설정을 지우고 앱에 들어 있는 학교 기본 설정으로 되돌립니다',
          onClick: async () => {
            if (!(await confirmDialog(
              '이 컴퓨터에 저장된 설정만 지우고 앱 기본 설정(학교 전체 공유)으로 되돌립니다. '
              + '입력하신 교육활동·시간표 자료는 지워지지 않습니다.',
              { okText: '되돌리기' }))) return;
            resetConfig();
            location.reload();
          },
        }, '\u21BA 학교 기본 설정으로 되돌리기')),
      h('p', { class: 'muted small' },
        '칸을 비워 두면 앱에 들어 있는 기본 열쇠를 씁니다. 저장 위치를 바꾸면 새로 고침해야 적용됩니다. ',
        '설정 방법은 docs/SETUP-firebase.md 를 보세요.'))),

    // 로컬로 먼저 써 보다 넘어온 경우, 그때 넣은 자료가 따라오지 않았을 수 있다.
    versionBox(),

    whereBox(),

    leftoverBox(ctx),

    // 명단은 관리자에게만. 교사 화면에 남의 계정을 늘어놓을 이유가 없다.
    isAdmin() && backendKind() === 'firestore'
      ? box(`명단 · 승인 (${list('members').filter((m) => !m.approved).length}명 대기)`, membersBox(ctx))
      : null,

    full && box('담당자 자동 매칭 (업무분장표 · 과거 계획 학습)', staffBox(ctx)),

    full && box('바로가기 링크', h('div', {},
      h('p', { class: 'note' },
        '머리말 오른쪽에 버튼으로 걸립니다. 학교 노션 자료실, 업무포털 주소 등을 넣으세요. ',
        '새 창에서 열리며, ', h('strong', {}, '접근 권한이 없는 분은 그쪽에서 막히므로'),
        ' 링크가 보이는 것 자체는 문제되지 않습니다.'),
      shared && !isAdmin()
        ? h('p', { class: 'muted small' }, '관리자가 정한 링크입니다.')
        : null,
      linkBox,
      (!shared || isAdmin())
        ? h('div', { class: 'row gap' },
          h('button', { class: 'btn btn-sm', onClick: () => addLinkRow() }, '+ 줄 추가'),
          shared
            ? h('button', {
              class: 'btn btn-sm btn-primary',
              onClick: async () => {
                try {
                  await saveSharedLinks(readLinkRows());
                  toast('모든 선생님에게 보이도록 저장했습니다.', 'ok');
                  ctx.refresh();
                } catch (e) {
                  console.error(e);
                  toast('저장하지 못했습니다: ' + (e.message || ''), 'warn');
                }
              },
            }, '모두에게 보이게 저장')
            : null)
        : null,
      shared
        ? h('p', { class: 'muted small' },
          '여기 넣은 링크는 ', h('strong', {}, '모든 선생님 화면에 똑같이'), ' 보입니다. ',
          '[모두에게 보이게 저장] 을 누르면 바로 반영되고, 다시 배포할 필요가 없습니다.',
          (() => {
            const m = sharedLinksMeta();
            return m && m.by ? ` (마지막 수정: ${m.by})` : '';
          })(),
          !hasSharedLinks() && localLinks().length
            ? h('span', { class: 'warn-inline' },
              ' 이 컴퓨터에 있던 링크를 채워두었습니다. 저장을 누르면 모두에게 올라갑니다.')
            : null)
        : h('p', { class: 'muted small' },
          '여기서 넣은 값은 이 컴퓨터에만 저장됩니다. 모든 선생님에게 똑같이 보이게 하려면 ',
          h('code', {}, 'app/js/config.js'), ' 의 ', h('code', {}, 'links'), ' 를 고쳐 배포하세요.'))),

    full && box('시정표 (기본 · 단축 · 수업공개)', bellsBox(ctx)),

    full && box('결재용 한글 문서', h('div', { class: 'form-grid' },
      field('글꼴', fontIn),
      field('글자 크기(pt)', sizeIn))),

    full && box('교과교담 한 줄로 묶기', h('div', {},
      h('p', { class: 'note' },
        '[일일] 화면의 교과교담 표에서 한 자리에 세울 과목들입니다. ',
        '전담 선생님 한 분이 도덕·과학·체육을 함께 맡으면 세 과목이 한 줄에 서야 읽기 좋습니다. ',
        '쉼표로 묶고, 묶음이 여럿이면 줄을 바꿔 적으세요.'),
      groupIn,
      h('p', { class: 'muted small' },
        '시간표 칸에 담당 선생님 이름을 적어 두었다면 그쪽이 먼저입니다. 같은 분이 맡은 것은 저절로 한 줄에 섭니다.'))),

    full && box('둘러보기용 예시 자료', h('div', {},
      h('p', { class: 'note' },
        '이번 주 일정·반복일정·방과후 강좌 예시를 한 번에 넣어 화면이 어떻게 보이는지 확인할 수 있습니다. ',
        '예시 자료만 골라서 한 번에 지울 수 있으니 실제 자료와 섞이지 않습니다.'),
      h('div', { class: 'row gap' },
        h('button', {
          class: 'btn', onClick: async () => {
            if (hasSample() && !(await confirmDialog('이미 예시 자료가 들어 있습니다. 한 벌 더 넣을까요?'))) return;
            const n = await insertSample();
            toast(`예시 자료 ${n}건을 넣었습니다. [일일]·[주간] 탭을 보세요.`, 'ok');
            ctx.refresh();
          },
        }, '예시 자료 넣기'),
        h('button', {
          class: 'btn btn-danger', onClick: async () => {
            if (!hasSample()) return toast('지울 예시 자료가 없습니다.', 'warn');
            if (!(await confirmDialog('예시 자료만 골라서 지웁니다. 직접 입력하신 자료는 그대로 남습니다.', { danger: true, okText: '지우기' }))) return;
            const n = await removeSample();
            toast(`예시 자료 ${n}건을 지웠습니다.`, 'ok');
            ctx.refresh();
          },
        }, '예시 자료만 지우기')))),

    full && box('백업 · 복원', h('div', { class: 'row gap' },
      h('button', {
        class: 'btn', onClick: () => {
          const data = JSON.stringify(exportAll(), null, 2);
          download(`교육활동백업_${new Date().toISOString().slice(0, 10)}.json`, new Blob([data], { type: 'application/json' }));
        },
      }, '전체 내려받기(JSON)'),
      h('button', { class: 'btn', onClick: () => fileIn.click() }, '파일에서 복원'),
      fileIn,
      h('button', {
        class: 'btn btn-danger', onClick: async () => {
          if (!(await confirmDialog('설정을 초기값으로 되돌릴까요? (등록한 일정은 지워지지 않습니다)', { danger: true, okText: '초기화' }))) return;
          resetConfig(); toast('설정을 초기화했습니다. 새로 고쳐 주세요.', 'ok');
        },
      }, '설정 초기화'))),

    box('바탕화면에 설치하기', h('div', {},
      h('ol', { class: 'guide' },
        h('li', {}, '크롬 또는 엣지로 이 주소를 엽니다.'),
        h('li', {}, '주소창 오른쪽 끝의 ', h('strong', {}, '설치(⊕)'), ' 아이콘을 누릅니다. (엣지: ··· → 앱 → 이 사이트를 앱으로 설치)'),
        h('li', {}, '바탕화면에 아이콘이 생기고, 브라우저 주소창 없는 창으로 열립니다.'),
        h('li', {}, '휴대전화는 크롬/사파리에서 ', h('strong', {}, '홈 화면에 추가'), ' 를 누르면 됩니다.')),
      h('p', { class: 'muted small' }, '설치해도 자료는 서버에 있으므로, 어느 기기에서 고쳐도 모두에게 바로 반영됩니다(Firebase 사용 시).'))),

    full && h('div', { class: 'submit-bar' },
      h('button', {
        class: 'btn btn-primary',
        onClick: () => {
          // 함께 쓰는 방식에서는 이름·역할이 명단에서 오므로 여기서 건드리지 않는다.
          if (!shared) {
            if (!nameIn.value.trim()) return toast('이름을 입력해 주세요.', 'warn');
            setUser({ name: nameIn.value.trim(), dept: deptIn.value.trim(), role: roleSel.value });
          }
          const next = loadConfig();
          next.school = { name: schoolIn.value.trim(), principal: principalIn.value.trim(), contact: contactIn.value.trim() };
          next.backend = backendSel.value;
          next.schoolId = fb.schoolId.value.trim() || 'default';
          next.googleHostedDomain = fb.hd.value.trim();
          // 공용 방식에서는 링크가 학교 목록으로 가므로 이 컴퓨터 값은 건드리지 않는다.
          if (!shared) {
            next.links = readLinkRows()
              .map((l) => ({ label: l.label || l.url.replace(/^https?:\/\//, '').slice(0, 24), url: l.url }));
          }
          // 빈 칸은 '지우기' 가 아니라 '건드리지 않음' 이다. 빈 값을 적어 넣으면 앱에 박힌
          // 열쇠를 덮어써서, 화면은 '학교 전체' 인데 조용히 이 컴퓨터 저장으로 돌게 된다.
          for (const k of fbFields) {
            const v = fb[k].value.trim();
            if (v) next.firebase[k] = v; else delete next.firebase[k];
          }
          next.hwp = { font: fontIn.value.trim() || '함초롬바탕', fontSize: Number(sizeIn.value) || 11 };
          next.timetableGroups = groupIn.value.split('\n').map((x) => x.trim()).filter(Boolean);

          saveConfig(next);
          toast('저장했습니다.', 'ok');
          ctx.refresh();
        },
      }, '설정 저장')));
}

function box(title, node) {
  return h('section', { class: 'sec' }, h('div', { class: 'sec-head' }, h('h3', {}, title)), node);
}

const labelOf = (c) => ({
  activities: '교육활동', recurring: '반복일정', afterschool: '방과후', audit: '이력',
  academic: '학사일정', bells: '시정표', daybell: '날짜별 시정', timetable: '시간표',
  staff: '업무분장', lessons: '학습한 사례', notices: '공지·중점지도', trips: '출장', board: '공지',
}[c] || c);


/**
 * 이 컴퓨터에만 남아 있는 예전 자료를 학교 공용으로 올리는 상자.
 *
 * 로컬로 써 보다가 파이어스토어로 바꾸면 저장하는 곳이 아예 달라져서, 그때까지
 * 넣은 학사일정·시정표·시간표가 따라오지 않는다. 학사일정이 빠지면 추석 같은
 * 음력 공휴일이 안 잡히는 식으로 조용히 티가 난다. 그래서 찾아서 알려준다.
 */
/**
 * 앱 판 확인 — '내 화면만 안 바뀐다' 를 눈으로 잡는 자리.
 *
 * 고쳐 올려도 학교 컴퓨터가 옛 파일을 붙들고 있는 일이 있다. 그때 무엇이
 * 낡았는지(서버가 옛것인지, 이 컴퓨터가 옛것인지) 가릴 방법이 없으면
 * 서로 짐작만 하게 된다. 그래서 둘을 나란히 적고, 밀어내는 단추를 둔다.
 */
function versionBox() {
  const mine = h('code', {}, APP_VERSION);
  const serverOut = h('span', { class: 'muted' }, '아직 확인하지 않았습니다');
  const verdict = h('p', { class: 'muted small' }, '');

  // 서버에 올라간 sw.js 를 캐시를 건너뛰고 직접 읽어 판을 본다.
  // 앱 파일이 아니라 서버가 낡은 것인지 여기서 갈린다.
  const check = async (btn) => {
    btn.disabled = true;
    serverOut.textContent = '확인하는 중\u2026';
    verdict.textContent = '';
    try {
      const res = await fetch(`./sw.js?t=${Date.now()}`, { cache: 'no-store' });
      const text = await res.text();
      const m = text.match(/VERSION\s*=\s*'([^']+)'/);
      const server = m ? m[1] : '?';
      serverOut.textContent = server;
      serverOut.className = '';
      if (server === APP_VERSION) {
        verdict.textContent = '이 컴퓨터가 서버와 같은 판입니다. 최신입니다.';
      } else {
        verdict.innerHTML = '';
        verdict.append('서버에는 ', h('b', {}, server), ' 가 올라와 있는데 이 컴퓨터는 ',
          h('b', {}, APP_VERSION), ' 입니다. 아래 [새 판 받기] 를 누르세요.');
      }
    } catch (e) {
      serverOut.textContent = '확인 실패';
      verdict.textContent = '인터넷 연결을 확인해 주세요.';
    }
    btn.disabled = false;
  };

  // 캐시와 서비스워커를 통째로 버리고 다시 받는다. 자료는 건드리지 않는다.
  const force = async (btn) => {
    if (!(await confirmDialog(
      '이 컴퓨터에 받아둔 앱 파일을 모두 버리고 새로 받습니다. 입력하신 자료는 그대로 있습니다.',
      { okText: '새로 받기' }))) return;
    btn.disabled = true;
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (e) { console.warn(e); }
    location.reload();
  };

  return box('앱 판 확인', h('div', {},
    h('p', { class: 'note' },
      '고쳐 올린 것이 화면에 안 보일 때 여기서 확인합니다. ',
      '두 판이 같으면 최신이고, 서버 쪽이 높으면 이 컴퓨터가 낡은 것입니다.'),
    h('div', { class: 'ver-row' },
      h('span', {}, '이 컴퓨터가 쓰는 판'), mine),
    h('div', { class: 'ver-row' },
      h('span', {}, '서버에 올라온 판'), serverOut),
    verdict,
    h('div', { class: 'row gap' },
      h('button', { class: 'btn', onClick: (e) => check(e.currentTarget) }, '서버 판 확인'),
      h('button', { class: 'btn btn-danger', onClick: (e) => force(e.currentTarget) }, '새 판 받기'))));
}

/**
 * 자료 진단 — '넣은 것이 안 보인다' 를 혼자 가릴 수 있게 한다.
 *
 * 화면이 비어 있는 까닭은 셋인데 셋 다 똑같이 '없음' 으로 보인다.
 * (1) 다른 곳을 보고 있다(학교 코드가 다르거나 이 컴퓨터 저장으로 돌아가 있다)
 * (2) 규칙에 막혀 못 읽는다  (3) 정말로 비어 있다.
 * 그래서 어디를 보고 있는지, 컬렉션마다 몇 건인지, 막힌 것이 있는지를 한 자리에 적는다.
 */
const DIAG_COLS = ['activities', 'timetable', 'academic', 'afterschool', 'recurring',
  'bells', 'daybell', 'notices', 'trips', 'staff'];

function whereBox() {
  const shared = backendKind() === 'firestore';
  const w = whereAmI();
  const code = w.schoolId || loadConfig().schoolId || 'default';
  const errs = readErrors();
  const left = localLeftovers();
  const bad = Object.keys(errs);

  const rows = DIAG_COLS.map((c) => {
    const n = list(c).length;
    // 혼자 쓰는 방식에서는 두 칸이 같은 자료라 나란히 적으면 헷갈린다.
    const here = (left[c] || []).length;
    return h('tr', { class: errs[c] ? 'diag-bad' : '' },
      h('td', {}, labelOf(c)),
      h('td', { class: 'nowrap' }, errs[c] ? '읽지 못함' : `${n}건`),
      shared ? h('td', { class: 'nowrap muted' }, here ? `${here}건` : '-') : null);
  });

  return box('\u{1F50E} 자료 진단', h('div', {},
    h('p', { class: 'note' },
      '넣은 자료가 화면에 안 보일 때 여기를 봅니다. ',
      h('b', {}, '보는 곳'), ' 이 자료를 넣던 때와 같은지 먼저 맞춰보세요.'),
    h('div', { class: 'ver-row' }, h('span', {}, '저장 방식'),
      h('code', {}, shared ? '학교 전체 (Firebase)' : '이 컴퓨터에만')),
    shared ? h('div', { class: 'ver-row' }, h('span', {}, '학교 코드'), h('code', {}, code)) : null,
    shared ? null : h('p', { class: 'muted small' },
      '아래 자료는 ', h('b', {}, '이 브라우저 안(크롬·엣지의 사이트 저장 공간)'), ' 에만 있습니다. ',
      '인터넷 어딘가에 올라가 있지 않아서 다른 컴퓨터·휴대전화에서는 보이지 않고, ',
      h('b', {}, '이 브라우저의 사이트 데이터를 지우면 같이 지워집니다.')),
    shared ? h('div', { class: 'ver-row' }, h('span', {}, '로그인 계정'), h('code', {}, w.email || '(로그인 안 됨)')) : null,
    h('div', { class: 'table-wrap' },
      h('table', { class: 'tbl' },
        h('thead', {}, h('tr', {},
          h('th', {}, '자료'),
          h('th', {}, shared ? '학교 공용' : '이 컴퓨터'),
          shared ? h('th', {}, '이 컴퓨터에 남은 것') : null)),
        h('tbody', {}, ...rows))),
    bad.length
      ? h('p', { class: 'warn-text' },
        bad.map(labelOf).join(', '), ' 을(를) 읽지 못했습니다 (',
        [...new Set(Object.values(errs))].join(', '),
        '). 파이어스토어 규칙을 확인해 주세요 — docs/SETUP-firebase.md 의 규칙을 통째로 붙여넣으면 됩니다.')
      : null,
    shared ? null : h('p', { class: 'warn-text' },
      '학교 전체로 연결하면 이 자료를 올릴 수 있는 [📦 이 컴퓨터에 남아 있는 예전 자료] 상자가 바로 아래에 나타납니다. ',
      '연결 전에는 올릴 곳이 없어 단추도 나오지 않습니다. 화면 맨 위 띠의 [학교 전체로 연결] 을 누르세요.'),
    shared && code === 'default'
      ? h('p', { class: 'muted small' },
        '학교 코드가 ', h('code', {}, 'default'), ' 입니다. [자료 저장 방식] 에서 코드를 바꾸면 ',
        h('b', {}, '다른 서랍을 보게 되어 자료가 사라진 것처럼 보입니다.'), ' 넣을 때 쓰던 코드와 같아야 합니다.')
      : null));
}

function leftoverBox(ctx) {
  if (backendKind() !== 'firestore' || !isAdmin()) return null;
  const left = localLeftovers();
  const cols = Object.keys(left);
  if (!cols.length) return null;

  // 이미 공용에 들어가 있는 것은 뺀다.
  //
  // 문서 번호만 견주면 모자란다. 같은 한글 파일을 이 컴퓨터에도 올리고 공용에도
  // 올렸으면 번호가 새로 매겨져 '다른 자료' 로 보이고, 올리는 순간 학사일정이
  // 두 배가 된다. 그래서 **속을 견준다.**
  // 번호와 시각 도장은 내용이 아니다. 같은 자료를 두 번 넣으면 이것들만 달라진다.
  const sig = (d) => {
    const { id, createdAt, updatedAt, ...rest } = d;
    return JSON.stringify(Object.keys(rest).sort().map((k) => [k, rest[k]]));
  };
  const todo = {};
  for (const c of cols) {
    const haveIds = new Set(list(c).map((d) => d.id));
    const haveSigs = new Set(list(c).map(sig));
    const rows = left[c].filter((d) => d.id && !haveIds.has(d.id) && !haveSigs.has(sig(d)));
    if (rows.length) todo[c] = rows;
  }
  const names = Object.keys(todo);
  if (!names.length) return null;
  const total = names.reduce((n, c) => n + todo[c].length, 0);

  return box('\u{1F4E6} 이 컴퓨터에 남아 있는 예전 자료', h('div', {},
    h('p', { class: 'note' },
      '이 앱을 ', h('b', {}, '이 컴퓨터에만 저장'), ' 하던 때에 넣은 자료가 남아 있습니다. ',
      'Firebase 로 바꾸면 저장하는 곳이 아예 달라져서 ', h('b', {}, '자동으로 따라가지 않습니다.'),
      ' 아래를 올리면 모든 선생님이 함께 보게 됩니다.'),
    h('ul', { class: 'leftover-list' },
      ...names.map((c) => h('li', {}, h('b', {}, labelOf(c)), ` ${todo[c].length}건`))),
    h('p', { class: 'muted small' },
      '학사일정이 빠져 있으면 추석·설날 같은 ', h('b', {}, '음력 공휴일이 잡히지 않습니다.'),
      ' 시간표와 월간에 연휴 표시가 안 나오면 이것 때문입니다.'),
    h('div', { class: 'row gap' },
      h('button', {
        class: 'btn btn-primary',
        onClick: async (e) => {
          e.currentTarget.disabled = true;
          try {
            const n = await uploadLeftovers(todo);
            toast(`${n}건을 학교 공용으로 올렸습니다.`, 'ok');
            ctx.refresh();
          } catch (err) {
            console.error(err);
            toast('올리지 못했습니다: ' + (err.message || ''), 'warn');
            e.currentTarget.disabled = false;
          }
        },
      }, `${total}건 모두 올리기`),
      h('button', {
        class: 'btn',
        title: '올리지 않고, 이 컴퓨터에 남은 것만 지웁니다',
        onClick: async (e) => {
          if (!(await confirmDialog(
            '올리지 않고 이 컴퓨터에 남은 것만 지웁니다. 학교 공용 자료는 그대로입니다.\n'
            + '이미 공용에 같은 내용이 들어 있을 때 쓰세요.',
            { danger: true, okText: '이 컴퓨터 것만 지우기' }))) return;
          e.currentTarget.disabled = true;
          try {
            for (const k of Object.keys(localStorage)) {
              if (k.startsWith('sam.col.')) localStorage.removeItem(k);
            }
          } catch (err) { console.warn(err); }
          toast('이 컴퓨터에 남아 있던 것을 지웠습니다.', 'ok');
          location.reload();
        },
      }, '올리지 않고 지우기')),
    h('p', { class: 'muted small' },
      '속이 같은 것은 이미 걸러 냈습니다. 그래도 학교 공용에 이미 들어 있는 자료라면 ',
      h('b', {}, '[올리지 않고 지우기]'), ' 를 쓰세요. 공용 자료는 건드리지 않습니다.')));
}
