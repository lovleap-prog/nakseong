// 표기 맞추기 — 같은 말을 사람마다 다르게 적는 것을 한 가지로
//
// 대상 칸에 '3~6학년', '3~6년', '3-6학년', '3-6년' 이 섞여 들어왔다. 주간 서식으로
// 내보내면 한 표 안에서 표기가 들쭉날쭉해 결재 전에 손으로 고치고 있었다.
//
// 학교 문서가 이미 쓰고 있는 원칙을 규칙으로 삼는다.
//   숫자를 세는 범위(학년·교시) 는 하이픈   3-6학년, 1-2교시
//   흐르는 시간(시각·날짜)      은 물결     15:00~16:00, 11.16~11.20
//   '년' 은 '학년' 으로                     3-6년 → 3-6학년, 5년 → 5학년
//
// 입력은 짧게 '년' 으로 치셔도 된다. 저장할 때 바꾼다. 앱의 겹침 판정은 둘 다 알아듣는다.
//
// 바꾸지 않는 것 — 뜻이 달라질 수 있어서다.
//   '3,4학년'·'1/3학년'  쉼표·빗금은 '이것과 저것' 이다. '1-3학년' 으로 바꾸면 2학년이 끼어든다.
//   '2026년', '3년차', '3년간', '6년제'  학년이 아니다.

/** 저장할 때 쓸 학년 표기. '년' 으로 바꾸려면 이 한 줄만 고치면 된다. */
export const GRADE_WORD = '학년';

const DASH = '[~∼～〜\\-－–—]';           // 사람들이 범위에 쓰는 온갖 물결·줄표
const NOT_GRADE_TAIL = '(?![차간째제도생수])'; // 3년차 · 3년간 · 6년제 · 2년도 · 1년생 · 3년수 는 학년이 아니다

// 학년 범위·순회 — 1~6 사이 숫자가 물결·줄표로 이어지고 끝에 학년/년
//   3~6학년 · 3 ~ 6 년 · 6-5-3-4-6년  → 3-6학년 · 3-6학년 · 6-5-3-4-6학년
const GRADE_RUN = new RegExp(
  `(?<![\\d.:])([1-6](?:\\s*${DASH}\\s*[1-6])+)\\s*(?:학년|년${NOT_GRADE_TAIL})`, 'g');

// 쉼표·빗금·가운뎃점으로 이은 학년 — 기호는 두고 꼬리만 맞춘다   3,4년 → 3,4학년
const GRADE_LIST = new RegExp(
  `(?<![\\d.:])([1-6](?:\\s*[,/·]\\s*[1-6])+)\\s*년${NOT_GRADE_TAIL}`, 'g');

// 학년 하나                                                    5년 → 5학년
const GRADE_ONE = new RegExp(`(?<![\\d.:,/·~\\-])([1-6])\\s*년${NOT_GRADE_TAIL}`, 'g');

// 교시 범위 — 하이픈                                           1~2교시 → 1-2교시
const PERIOD_RUN = new RegExp(`(?<![\\d.:])([1-9])\\s*${DASH}\\s*([1-9])\\s*교시`, 'g');

// 시각 범위 — 물결                                             15:00-16:00 → 15:00~16:00
const CLOCK_RUN = new RegExp(`(\\d{1,2}:\\d{2})\\s*${DASH}\\s*(\\d{1,2}:\\d{2})`, 'g');

// 날짜 범위 — 물결 (월.일 꼴만. 그 밖의 숫자는 건드리지 않는다)   11.16-11.20 → 11.16~11.20
const MD = '(?:1[0-2]|0?[1-9])\\.\\s?(?:[12]\\d|3[01]|0?[1-9])\\.?';
const DATE_RUN = new RegExp(`(?<![\\d.])(${MD})\\s*${DASH}\\s*(${MD})(?![\\d])`, 'g');

// 대상 칸에서는 숫자만 쳐도 학년이다          3-6 → 3-6학년, 5 → 5학년, 6-5-3-4-6 → 6-5-3-4-6학년
// 뒤에 '반·명·교시' 처럼 다른 낱말이 붙은 숫자는 학년이 아니라 두고(3학년 2반, 교사 3명),
// 1~6 이 아닌 숫자가 섞인 것도 두고(20명, 3-7),
// '3-1' 처럼 앞이 큰 두 숫자는 '3학년 1반' 일 수 있어 그대로 둔다.
const SEP = '[~∼～〜\\-－–—,/·]';
const BARE_GRADES = new RegExp(
  `(?<![\\d.:]|${SEP}\\s*)([1-6](?:\\s*${SEP}\\s*[1-6])*)`
  + `(?![\\d.:]|\\s*${SEP}\\s*\\d|\\s*(?:학년|년|반|명|교시|시|분|층|호|번|개|회|차|월|일|세|살|학급|모둠|조|쪽|권|팀|부))`, 'g');

/** 대상 칸 — 숫자만 친 학년에 '학년' 을 붙인다. */
export function normBareGrades(text) {
  return String(text || '').replace(BARE_GRADES, (whole, run) => {
    const nums = run.match(/[1-6]/g);
    const dashed = new RegExp(DASH).test(run);
    // '3-1' — 두 숫자가 줄표로 이어졌는데 앞이 더 크면 학년 범위가 아니라 반일 수 있다.
    if (nums.length === 2 && dashed && Number(nums[0]) > Number(nums[1])) return whole;
    const tidy = run.replace(new RegExp(`\\s*${DASH}\\s*`, 'g'), '-').replace(/\s+/g, '');
    return `${tidy}${GRADE_WORD}`;
  });
}

/** 학년 표기만 맞춘다. */
export function normGrades(text) {
  return String(text || '')
    .replace(GRADE_RUN, (_, run) => `${run.replace(new RegExp(`\\s*${DASH}\\s*`, 'g'), '-')}${GRADE_WORD}`)
    .replace(GRADE_LIST, (_, run) => `${run.replace(/\s+/g, '')}${GRADE_WORD}`)
    .replace(GRADE_ONE, (_, g) => `${g}${GRADE_WORD}`);
}

/** 교시·시각 표기를 맞춘다 — 시간 칸에 쓴다. */
export function normTime(text) {
  return String(text || '')
    .replace(PERIOD_RUN, '$1-$2교시')
    .replace(CLOCK_RUN, '$1~$2');
}

/** 날짜 범위 표기를 맞춘다. */
export function normDates(text) {
  return String(text || '').replace(DATE_RUN, (_, a, b) => `${a.replace(/\s+/g, '')}~${b.replace(/\s+/g, '')}`);
}

/**
 * 활동명·세부 내용 안의 학년은 **괄호 안에 든 것만** 맞춘다.
 * 보내 주신 문서처럼 '장애이해 교육(3-4학년)' 꼴로 적는다. 괄호 밖 글은 문장이라,
 * '3~6년 경력 교사 연수' 같은 말을 '3-6학년 경력…' 으로 바꿔 버릴 수 있다.
 */
function normInParens(text) {
  return String(text || '').replace(/\(([^()]*)\)/g, (_, inner) => `(${normGrades(normTime(inner))})`);
}

/** 칸마다 무엇을 맞추는가 */
const RULES = {
  target: (t) => normBareGrades(normGrades(t)),
  time: (t) => normTime(t),
  title: (t) => normDates(normInParens(t)),
  detail: (t) => normDates(normInParens(normTime(t))),
};

export const FIELD_LABEL = { target: '대상', time: '시간', title: '활동명', detail: '세부 내용' };

/**
 * 한 칸을 맞춘다.
 * @returns {string} 맞춘 글. 바꿀 것이 없으면 그대로.
 */
export function normalizeField(key, value) {
  const rule = RULES[key];
  if (!rule || value == null) return value;
  return rule(String(value));
}

/**
 * 일정 하나의 칸들을 맞춘다. 원본은 건드리지 않는다.
 * @returns {{ next: object, changes: Array<{key, label, from, to}> }}
 */
export function normalizeActivity(a) {
  const next = { ...a };
  const changes = [];
  for (const key of Object.keys(RULES)) {
    if (typeof a[key] !== 'string' || !a[key]) continue;
    const to = normalizeField(key, a[key]);
    if (to !== a[key]) {
      next[key] = to;
      changes.push({ key, label: FIELD_LABEL[key], from: a[key], to });
    }
  }
  return { next, changes };
}

/** 바뀐 것을 사람이 읽는 한 줄로 — '대상 3~6년 → 3-6학년' */
export const describeChange = (c) => `${c.label} ${short(c.from)} → ${short(c.to)}`;
const short = (t) => { const s = String(t).replace(/\s+/g, ' '); return s.length > 24 ? `${s.slice(0, 23)}…` : s; };
