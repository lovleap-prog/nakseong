// 데이터 모델 · 상태값 · 날짜 유틸 · 반복일정 전개
export const STATUS = {
  pending:  { key: 'pending',  label: '확인 대기', cls: 'st-pending' },
  approved: { key: 'approved', label: '승인 완료', cls: 'st-approved' },
  rejected: { key: 'rejected', label: '반려',      cls: 'st-rejected' },
};

export const CATEGORY = {
  academic: '교과·수업',
  event:    '행사·체험',
  safety:   '안전·보건',
  meeting:  '회의·연수',
  afterschool: '방과후',
  etc:      '기타',
};

export const ROLE = { admin: '관리자(결재)', teacher: '교사(입력)' };

export const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

// ── 날짜 유틸 ───────────────────────────────────────────────
export const pad = (n) => String(n).padStart(2, '0');

export function ymd(d) {
  if (typeof d === 'string') return d.slice(0, 10);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parseYmd(s) {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export function addDays(s, n) {
  const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d);
}
export function today() { return ymd(new Date()); }

/** 그 주의 월요일 */
export function weekStart(s) {
  const d = parseYmd(s);
  const off = (d.getDay() + 6) % 7; // 월=0
  d.setDate(d.getDate() - off);
  return ymd(d);
}
/** 그 주의 일요일. 달력(월간)은 일요일부터 시작하는 게 학교 관행이다. */
export function sundayStart(s) {
  const d = parseYmd(s);
  d.setDate(d.getDate() - d.getDay());
  return ymd(d);
}
export function monthStart(s) { return s.slice(0, 8) + '01'; }
export function monthEnd(s) {
  const d = parseYmd(s); return ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}
export function addMonths(s, n) {
  const d = parseYmd(s);
  const day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return ymd(d);
}
export function range(from, to) {
  const out = []; let c = from;
  while (c <= to) { out.push(c); c = addDays(c, 1); }
  return out;
}
export function fmtK(s, { weekday = true, year = true } = {}) {
  const d = parseYmd(s);
  const base = `${year ? d.getFullYear() + '. ' : ''}${d.getMonth() + 1}. ${d.getDate()}.`;
  return weekday ? `${base}(${WEEKDAY[d.getDay()]})` : base;
}
export const dow = (s) => parseYmd(s).getDay();
export const isWeekend = (s) => dow(s) === 0 || dow(s) === 6;

// ── 기본값 ─────────────────────────────────────────────────
export function newActivity(partial = {}) {
  return {
    id: uid('act'),
    date: today(), endDate: '', time: '',
    title: '', detail: '', target: '', place: '', dept: '', owner: '',
    category: 'academic',
    // 차를 불러야 하는 활동인가. 교무행정사가 미리 배차를 신청해야 해서
    // 월간 계획에서 한눈에 보여야 한다.
    needsBus: false,
    busNote: '',        // 몇 시에 어디로, 몇 명 — 배차 신청에 필요한 것
    status: 'pending',
    source: 'manual',
    createdBy: '', createdAt: new Date().toISOString(),
    reviewedBy: '', reviewedAt: '', rejectReason: '',
    history: [],
    ...partial,
  };
}

export function newRecurring(partial = {}) {
  return {
    id: uid('rec'),
    title: '', freq: 'weekly', weekdays: [1, 2, 3, 4, 5], nth: [],
    time: '', place: '', target: '', owner: '', dept: '',
    category: 'academic',
    startDate: today(), endDate: '',
    exceptions: [],      // 이 날짜에는 쉰다. 행사와 겹칠 때 그 주만 빼는 용도.
    active: true, includeInNeis: true, note: '',
    // 주간·월간 계획에 낱개로 띄울지. 아침 독서처럼 매일 도는 것은 주마다 스무 번,
    // 달마다 백 번씩 되풀이돼 피로하기만 하다.
    // 일일 화면과 나이스 결재 문구에는 꺼도 그대로 나온다.
    showInPlan: true,
    createdBy: '', createdAt: new Date().toISOString(),
    ...partial,
  };
}

export function newAfterSchool(partial = {}) {
  return {
    id: uid('as'),
    name: '', teacher: '', grade: '', room: '',
    weekdays: [], time: '', term: '', capacity: '', enrolled: '', fee: '', note: '',
    active: true,
    ...partial,
  };
}

/** 업무분장표 한 줄 */
export function newStaff(partial = {}) {
  return {
    id: uid('stf'),
    name: '', dept: '', position: '',
    keywords: [],        // 담당 업무 낱말. 이게 매칭의 핵심 근거가 된다.
    // '콕 집어' 규칙. 켜 두면 낱말이 활동명에 들어 있을 때 저울질 없이 이 사람으로 정한다.
    // 학교마다 '이건 무조건 누구' 인 일이 있는데(영어원어민 순회 → 영어 담당),
    // 닮은 정도로 겨루게 두면 엉뚱한 사람이 이기거나 '참고' 로만 남았다.
    strict: false,
    active: true,
    ...partial,
  };
}

/** 과거 계획에서 배운 '활동명 → 담당자' 사례 */
export function newLesson(partial = {}) {
  return {
    id: uid('lsn'),
    title: '', owner: '', dept: '',
    count: 1,
    source: '',
    ...partial,
  };
}

/** 주간 시간표(교과교담·특별실) 항목 하나 */
export function newSlot(partial = {}) {
  return {
    id: uid('slt'),
    week: '',          // 그 주의 월요일 (weekStart)
    dow: 1,            // 1=월 … 5=금
    period: 1,         // 1~8교시
    title: '',         // 예) 과학5, 공자람반1,2
    target: '', place: '', owner: '',
    kind: 'subject',   // subject(교과교담) | special(특별실·순회)
    note: '',
    ...partial,
  };
}

/** 시정표 하나 (기본 / 단축 / 수업공개 …) */
export function newBell(partial = {}) {
  return {
    id: uid('bel'),
    name: '',
    // [{ s:'09:00', e:'09:40' }, …]
    // 파이어스토어는 배열 안의 배열을 받지 않는다. 그래서 짝을 객체로 담는다.
    // 읽을 때는 periodPairs() 가 옛 [['09:00','09:40']] 모양도 함께 받아준다.
    periods: [],
    isDefault: false,
    order: 0,
    note: '',
    ...partial,
  };
}

/** 공지사항 · 월별 중점지도 — kind 로 구분하고 key(날짜/주/월)마다 한 장 */
export function noticeId(kind, key) { return `${kind}_${key}`; }

/**
 * 공지 한 장. 날짜마다 따로 쓰지 않고 '언제부터 언제까지' 붙여 둔다.
 *
 * 공문 접수나 안내장 수합처럼 며칠 이어지는 알림이 많다. 전에는 일일과 주간이
 * 각각 따로여서 같은 말을 두 번 써야 했다. 이제 기간이 걸치는 날에 모두 뜬다.
 */
export function newPost(partial = {}) {
  return {
    id: uid('pst'),
    text: '',
    from: today(),
    to: today(),
    always: false,           // 기간 없이 계속 붙여둘 것인가 (자유 메모)
    pinned: false,           // 위로 올려 둘 것인가
    by: '', uid: '',         // 쓴 사람 (이름 / 로그인 식별자)
    at: new Date().toISOString(),
    extendedTo: '',          // 마지막으로 연장한 날짜. 연장 이력 한 줄.
    ...partial,
  };
}

/** 학사일정 한 줄 */
export function newAcademic(partial = {}) {
  return {
    id: uid('aca'),
    kind: 'event',      // event(행사) | nomeal(비급식일) | stat(수업일수 요약)
    date: '', endDate: '', title: '', note: '',
    // 쉬는 날인가. 비워두면 제목으로 짐작하고, 정해두면 그것을 따른다.
    // isHoliday: true | false | undefined
    term: '1',          // 1학기 / 2학기
    source: '',
    ...partial,
  };
}

/** 출장 신청 한 건 */
export function newTrip(partial = {}) {
  return {
    id: uid('trp'),
    date: '', endDate: '', time: '',
    applicant: '', dept: '',
    reason: '', place: '',
    needsSub: false,     // 보결 필요 여부
    subNote: '',         // 몇 교시 보결이 필요한지
    status: 'pending',   // pending → approved / rejected
    reviewedBy: '', reviewedAt: '', rejectReason: '',
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

/** 개인 메모 한 줄 (본인에게만 보인다) */
export function newMemo(partial = {}) {
  return {
    id: uid('mem'),
    text: '',
    done: false,
    checklist: false,    // 체크리스트로 쓸지
    pinned: false,
    color: 'yellow',
    date: '', endDate: '',   // 기간을 적으면 일일·주간·월간에 함께 뜬다
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

let seq = 0;
export function uid(prefix = 'id') {
  seq = (seq + 1) % 1000;
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36).padStart(2, '0')}${Math.random().toString(36).slice(2, 6)}`;
}

// ── 반복일정 전개 ───────────────────────────────────────────
/** 반복 규칙을 [from, to] 구간의 가상 활동 목록으로 전개한다. */
export function expandRecurring(rules, from, to) {
  const out = [];
  for (const r of rules) {
    if (!r.active) continue;
    for (const day of range(from, to)) {
      if (r.startDate && day < r.startDate) continue;
      if (r.endDate && day > r.endDate) continue;
      if ((r.exceptions || []).includes(day)) continue;   // 그 날만 제외된 경우
      if (!matchesRule(r, day)) continue;
      out.push({
        id: `${r.id}@${day}`,
        recurringId: r.id,
        date: day, endDate: '', time: r.time,
        title: r.title, detail: r.note,
        target: r.target, place: r.place, dept: r.dept, owner: r.owner,
        category: r.category,
        status: 'approved',       // 반복일정은 사전 승인된 상시 운영 활동
        source: 'recurring',
        isRecurring: true,
        includeInNeis: r.includeInNeis !== false,
        // showInWeekly 는 옛 이름. 먼저 쓰던 자료가 그대로 읽히게 둘 다 본다.
        showInPlan: r.showInPlan !== false && r.showInWeekly !== false,
      });
    }
  }
  return out;
}

export function matchesRule(r, day) {
  const d = parseYmd(day);
  const wd = d.getDay();
  switch (r.freq) {
    case 'daily':
      return true;
    case 'weekly':
      return (r.weekdays || []).includes(wd);
    case 'biweekly': {
      if (!(r.weekdays || []).includes(wd)) return false;
      const base = parseYmd(weekStart(r.startDate || day));
      const weeks = Math.round((parseYmd(weekStart(day)) - base) / (7 * 864e5));
      return weeks >= 0 && weeks % 2 === 0;
    }
    case 'monthlyNth': {
      if (!(r.weekdays || []).includes(wd)) return false;
      const nth = Math.floor((d.getDate() - 1) / 7) + 1;
      return (r.nth || []).map(Number).includes(nth);
    }
    case 'monthlyDate':
      return (r.nth || []).map(Number).includes(d.getDate());
    default:
      return false;
  }
}

export function describeRule(r) {
  const wd = (r.weekdays || []).map((i) => WEEKDAY[i]).join('·');
  switch (r.freq) {
    case 'daily': return '매일';
    case 'weekly': return `매주 ${wd}`;
    case 'biweekly': return `격주 ${wd}`;
    case 'monthlyNth': return `매월 ${(r.nth || []).join('·')}번째 ${wd}`;
    case 'monthlyDate': return `매월 ${(r.nth || []).join('·')}일`;
    default: return '';
  }
}

/** 방과후 프로그램을 특정 날짜의 활동처럼 변환 */
export function afterSchoolOn(programs, day) {
  const wd = dow(day);
  return programs.filter((p) => p.active !== false && (p.weekdays || []).includes(wd));
}

/** 정렬: 시간 → 제목 */
export function byTime(a, b) {
  const ka = timeKey(a.time), kb = timeKey(b.time);
  if (ka !== kb) return ka - kb;
  return String(a.title).localeCompare(String(b.title), 'ko');
}

/** '3교시', '09:30', '2~3교시' 등을 정렬 가능한 숫자로 */
export function timeKey(t) {
  if (!t) return 9999;
  const hm = String(t).match(/(\d{1,2})\s*:\s*(\d{2})/);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  const per = String(t).match(/(\d)\s*교시/);
  if (per) return 480 + Number(per[1]) * 45; // 1교시=09:05 부근으로 근사
  if (/아침|조회/.test(t)) return 500;
  if (/점심|중식/.test(t)) return 720;
  if (/방과\s*후|하교/.test(t)) return 900;
  return 9998;
}

/** 활동이 특정 날짜에 걸치는지 (기간 일정 지원) */
export function occursOn(a, day) {
  const s = a.date;
  const e = a.endDate && a.endDate > a.date ? a.endDate : a.date;
  return day >= s && day <= e;
}
