// 앱 설정. 학교별로 이 파일만 고치면 된다.
// backend: 'local'  → 이 컴퓨터 브라우저에만 저장(설치·체험용, 동기화 없음)
//          'firestore' → 학교 전체 실시간 공유 (권장). docs/SETUP-firebase.md 참고
const DEFAULTS = {
  backend: 'firestore',
  schoolId: 'default',
  school: {
    name: '낙성초등학교',
    principal: '',
    contact: '교무기획부',
  },
  // 'firestore' 를 쓸 때만 채우면 된다. Firebase 콘솔 > 프로젝트 설정 > 웹 앱.
  firebase: {
    apiKey: 'AIzaSyCdO1S2OsR-7TlDGcbDYCNR31SHAYHgSak',
    authDomain: 'nakseong-plan.firebaseapp.com',
    projectId: 'nakseong-plan',
    storageBucket: 'nakseong-plan.firebasestorage.app',
    messagingSenderId: '424353122920',
    appId: '1:424353122920:web:e39962c37f197e375089dd',
  },
  // 머리말에 띄울 바로가기 링크. 학교 노션 자료실, 업무포털 등.
  // 모든 선생님에게 똑같이 보이게 하려면 [설정] 탭이 아니라 이 파일을 고쳐 배포한다.
  // (설정 탭에서 넣은 값은 그 컴퓨터에만 남는다)
  // 예: [{ label: '학교 자료실(노션)', url: 'https://www.notion.so/...' }]
  links: [],
  // 학교 구글 계정만 로그인시키려면 도메인을 적는다. 예: 'goe.go.kr'
  googleHostedDomain: '',
  hwp: { font: '함초롬바탕', fontSize: 11 },
  // 일일 화면의 교과교담 표에서 **한 줄에 세울 과목들**.
  // 전담 선생님 한 분이 도덕·과학·체육을 함께 맡으면 세 과목이 한 자리에 서야
  // 시간표가 한눈에 읽힌다. 쉼표로 묶고, 줄이 여럿이면 따로 적는다.
  // 담당 선생님 이름을 칸에 적어 두었다면 그쪽이 먼저다(같은 사람 = 같은 줄).
  timetableGroups: ['도덕,과학,체육'],
  // 교시별 시각. 중복(같은 시간) 판정의 기준이 된다. 학교마다 다르므로 설정에서 고친다.
  periods: [
    ['09:00', '09:40'], ['09:50', '10:30'], ['10:40', '11:20'], ['11:30', '12:10'],
    ['13:10', '13:50'], ['14:00', '14:40'], ['14:50', '15:30'], ['15:40', '16:20'],
  ],
};

// 지금 브라우저가 돌리고 있는 앱의 판. app/sw.js 의 VERSION 과 같이 올린다.
// [설정] 에서 서버에 올라간 판과 견줘 보여 준다. '내 화면만 안 바뀐다' 를
// 눈으로 확인할 수 있어야 하기 때문이다.
export const APP_VERSION = 'v34';

const LS_KEY = 'sam.config';

export function loadConfig() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { saved = {}; }
  return deepMerge(structuredClone(DEFAULTS), stripBlankKeys(saved));
}

/**
 * 이 컴퓨터에 저장된 설정에서 '빈 파이어베이스 열쇠' 를 걷어낸다.
 *
 * 설정 화면에서 [저장] 을 누르면 여섯 칸을 그대로 받아 적는다. 그 칸이 비어 있던 때에
 * 한 번 저장하면 빈 문자열이 앱에 박힌 열쇠를 덮어써 버린다. 그러면 저장 위치가
 * 'Firebase 실시간 공유' 로 보이는데도 열쇠가 없어 **말없이 이 컴퓨터 저장으로 돈다.**
 * 실제로 그렇게 됐다. 빈 값은 '지정하지 않음' 으로 보고 앱 기본값을 쓴다.
 */
function stripBlankKeys(saved) {
  const out = { ...saved };
  if (out.firebase && typeof out.firebase === 'object') {
    const fb = {};
    for (const [k, v] of Object.entries(out.firebase)) if (String(v || '').trim()) fb[k] = v;
    if (Object.keys(fb).length) out.firebase = fb; else delete out.firebase;
  }
  if (!String(out.schoolId || '').trim()) delete out.schoolId;
  return out;
}

export function saveConfig(cfg) {
  localStorage.setItem(LS_KEY, JSON.stringify(cfg));
}

export function resetConfig() { localStorage.removeItem(LS_KEY); }

function deepMerge(base, over) {
  for (const [k, v] of Object.entries(over || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v)) base[k] = deepMerge(base[k] || {}, v);
    else if (v !== undefined) base[k] = v;
  }
  return base;
}

export { DEFAULTS };
