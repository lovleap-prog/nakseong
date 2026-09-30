// 나이스 일일교육활동 결재용 문구 · 메신저 안내문 생성
import { fmtK, byTime, WEEKDAY, parseYmd, CATEGORY } from '../model.js';
import { describeTime, dayBellId, bellById, defaultBell } from '../conflict.js';
import { isNoMeal, cleanDetail } from '../select.js';

const KO_ORDER = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'];
const koIdx = (i) => (i < KO_ORDER.length ? KO_ORDER[i] : `${KO_ORDER[i % 14]}${Math.floor(i / 14) + 1}`);

/** 한 줄 요약: "1~2교시 3학년 안전교육(시청각실, 김민수)" */
export function lineOf(a, { withTime = true } = {}) {
  // 단축·수업공개 시정이면 '3교시 (10:30~11:10)' 처럼 실제 시각까지 적는다.
  // 결재 문서를 보는 사람이 교시만 보고 시각을 잘못 짚으면 안 된다.
  const shown = withTime ? describeTime(a) : '';
  const head = shown ? `${shown} ` : '';
  const who = a.target ? `${a.target} ` : '';
  const meta = [a.place, a.owner].filter(Boolean).join(', ');
  const tail = meta ? `(${meta})` : '';
  return `${head}${who}${a.title}${tail}`.replace(/\s{2,}/g, ' ').trim();
}

/**
 * 나이스 결재 상신용 본문.
 * @param {object} p { date, activities, recurring, afterSchool, school, options }
 */
export function neisApprovalText(p) {
  const { date, activities = [], recurring = [], afterSchool = [] } = p;
  const o = { includeRecurring: true, includeAfterSchool: true, ...(p.options || {}) };
  const school = p.school || {};
  const L = [];

  L.push(`${fmtK(date)} 일일교육활동 계획`);
  const dayBell = bellById(dayBellId(date));
  if (dayBell && dayBell.id !== defaultBell().id) L.push(`※ ${dayBell.name} 운영`);
  // 급식이 없는 날은 기안에 한 줄 적어 둔다. 놓치면 그 날 아이들 점심이 걸린다.
  if (isNoMeal(date)) L.push('※ 비급식일 (급식 미실시)');
  L.push('');

  let sec = 1;
  const sorted = activities.slice().sort(byTime);
  L.push(`${sec}. 교육활동`);
  if (sorted.length) sorted.forEach((a, i) => L.push(`  ${koIdx(i)}. ${lineOf(a)}`));
  else L.push('  가. 특기사항 없음(정규 교육과정 운영)');
  sec++;

  if (o.includeRecurring && recurring.length) {
    L.push('');
    L.push(`${sec}. 상시·반복 운영 활동`);
    recurring.slice().sort(byTime).forEach((a, i) => L.push(`  ${koIdx(i)}. ${lineOf(a)}`));
    sec++;
  }

  if (o.includeAfterSchool && afterSchool.length) {
    L.push('');
    L.push(`${sec}. 방과후학교 (${afterSchool.length}강좌)`);
    afterSchool.slice().sort((x, y) => String(x.time).localeCompare(String(y.time)))
      .forEach((c, i) => L.push(`  ${koIdx(i)}. ${[c.time, c.name].filter(Boolean).join(' ')}` +
        `${[c.room, c.teacher].filter(Boolean).length ? `(${[c.room, c.teacher].filter(Boolean).join(', ')})` : ''}` +
        `${c.grade ? ` / ${c.grade}` : ''}`));
    sec++;
  }

  L.push('');
  L.push(`위와 같이 ${fmtK(date)} 일일교육활동을 실시하고자 합니다.`);
  if (school.name || school.principal) {
    L.push('');
    L.push([school.name, school.principal && `${school.principal} 귀하`].filter(Boolean).join('  '));
  }
  return L.join('\n');
}

/** 낙성초 일일교육활동 안내문의 고정 문구 기본값. 설정에서 학교에 맞게 고친다. */
export const DEFAULT_DAILY_TAIL = [
  '* 아침책다방(08:00-08:50, 사제동행 독서, 연중)',
  '* 교육활동 내실화',
  '{{기간}}',
  '- 따뜻하고 행복한 학교문화 만들기: 공수인사',
  '* 일일 생활안전지도',
  '- 쉬는 시간 및 복도 통행 안전, 우유급식',
  '- 화장실 및 정수기 사용 위생안전',
  '- 식중독 예방 철저(급식실), 식사전 반드시 손씻기',
  '- 화재예방, 교통안전, 생활안전, 놀이시설 안전(꿀벌놀이터 등)',
  '* 1, 2학년 돌봄교실 운영',
  '- 피아노(화, 목) / 주산,음악줄넘기(수) / 뮤지컬(목) / 외발자전거(금)',
  '* 방과후학교 운영(7,8교시)',
  '* 저녁돌봄 운영(~19시, 유치원)',
  '* 급식 시간: 유 12:20~ / 1-3년 12:30~ / 4-6년 12:40~',
  '* 감염병 관련 예방수칙 준수 철저 안내 (학생, 학부모)',
  '- 의심 증상 시 마스크 착용 및 손 씻기 교육 강화',
  '- 증상 시 즉시 진료, 타인 접촉 최소화',
  '- 학생, 학부모, 교직원 소통 채널 확보 및 소통강화(비상연락망 구비)',
  '* 교직원 안전(급식실 안전 등)',
].join('\n');

/** '제목(대상, 시간, 장소)' — 학교 안내문이 쓰는 차례 그대로. */
function itemText(a, date) {
  const bits = [];
  if (a.target) bits.push(a.target);
  // 여러 날 이어지는 것은 '~30' 처럼 끝나는 날만 적는다(문서가 그렇게 쓰여 있다).
  if (a.endDate && a.endDate > a.date) {
    const e = parseYmd(a.endDate);
    const s = parseYmd(a.date);
    bits.push(e.getMonth() === s.getMonth() ? `~${e.getDate()}` : `~${e.getMonth() + 1}.${e.getDate()}`);
  }
  const t = describeTime(a) || a.time;
  if (t) bits.push(t);
  if (a.place) bits.push(a.place);
  const head = bits.length ? `${a.title}(${bits.join(', ')})` : a.title;
  // 세부 내용은 다음 줄에 그대로 붙인다. 구글시트 주소 같은 것이 여기 들어간다.
  // '비급식일' 은 아래 ※ 한 줄로 따로 나가므로 여기서는 뺀다.
  const detail = cleanDetail(a.detail).split('\n').map((x) => x.trim()).filter(Boolean);
  return [head, ...detail];
}

/**
 * 일일교육활동 안내문.
 *
 * 학교마다 쓰던 모양이 있다. 낙성초는 '9월 9일 수요일' 아래 번호 목록을 적고,
 * 그 아래 해마다 똑같은 * · - 문단이 붙는다. 그 고정 문단은 설정에 적어 두고
 * 여기서는 날마다 달라지는 것만 만들어 얹는다.
 *
 * 고정 문단에 {{기간}} 을 적어 두면 그 자리에 기간 일정이 '- 이름(~11)' 로 들어간다.
 * 적어 두지 않으면 기간 일정도 위 번호 목록에 들어간다.
 */
export function dailyPlanText(p) {
  const { date, activities = [], trips = [] } = p;
  const tail = String(p.tail == null ? DEFAULT_DAILY_TAIL : p.tail);
  const d = parseYmd(date);
  const L = [];

  L.push(`${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAY[d.getDay()]}요일`);

  const isSpan = (a) => a.endDate && a.endDate > a.date;
  const hasSlot = tail.includes('{{기간}}');
  const spans = activities.filter(isSpan);
  const main = activities.filter((a) => !hasSlot || !isSpan(a)).slice().sort(byTime);

  let n = 0;
  for (const a of main) {
    const [head, ...rest] = itemText(a, date);
    L.push(`${++n}. ${head}`);
    for (const line of rest) L.push(line);
  }

  // 보결이 필요한 출장은 안내문에 꼭 들어간다. 그 날 수업을 누가 들어가는지가 걸려서다.
  for (const t of trips.filter((x) => x.needsSub)) {
    L.push(`${++n}. ${t.subTitle || `${t.applicant || ''} 보결`}`.replace(/\s+/g, ' ').trim());
    if (t.subNote) L.push(t.subNote);
  }

  const dayBell = bellById(dayBellId(date));
  if (dayBell && dayBell.id !== defaultBell().id) L.push(`※ ${dayBell.name} 운영`);
  if (isNoMeal(date)) L.push('※ 비급식일 (급식 없음)');

  L.push('');
  const spanLines = spans.map((a) => {
    const e = parseYmd(a.endDate);
    const s = parseYmd(a.date);
    const to = e.getMonth() === s.getMonth() ? `~${e.getDate()}` : `~${e.getMonth() + 1}.${e.getDate()}`;
    return `- ${a.title}(${to})`;
  });
  L.push(hasSlot
    ? tail.split('\n').flatMap((line) => (line.trim() === '{{기간}}' ? spanLines : [line])).join('\n')
    : tail);

  return L.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

/** 교직원 메신저용 안내문 (결재 문구 대체 가능) */
export function messengerText(p) {
  const { date, activities = [], recurring = [], afterSchool = [] } = p;
  const o = { includeRecurring: true, includeAfterSchool: true, ...(p.options || {}) };
  const d = parseYmd(date);
  const L = [];
  L.push(`[일일교육활동 안내] ${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY[d.getDay()]})`);
  const mBell = bellById(dayBellId(date));
  if (mBell && mBell.id !== defaultBell().id) L.push(`※ 오늘은 ${mBell.name} 입니다.`);
  if (isNoMeal(date)) L.push('※ 오늘은 비급식일입니다. (급식 없음)');
  L.push('');
  L.push('▷ 오늘의 교육활동');
  const sorted = activities.slice().sort(byTime);
  if (sorted.length) sorted.forEach((a) => L.push(` • ${lineOf(a)}`));
  else L.push(' • 별도 행사 없음 / 정규 시간표 운영');

  if (o.includeRecurring && recurring.length) {
    L.push('');
    L.push('▷ 상시 운영 활동');
    recurring.slice().sort(byTime).forEach((a) => L.push(` • ${lineOf(a)}`));
  }
  if (o.includeAfterSchool && afterSchool.length) {
    L.push('');
    L.push(`▷ 방과후학교 (${afterSchool.length}강좌)`);
    afterSchool.forEach((c) => L.push(` • ${[c.time, c.name, c.room && `(${c.room})`].filter(Boolean).join(' ')}`));
  }
  const dept = (p.school && p.school.contact) || '';
  if (dept) { L.push(''); L.push(`※ 문의: ${dept}`); }
  return L.join('\n');
}

/** 주간/월간 요약 문구 */
export function periodText(p) {
  const { from, to, days, title } = p; // days: [{date, activities, recurring, afterSchool}]
  const L = [];
  L.push(`${title || '교육활동 계획'} (${fmtK(from, { weekday: false })} ~ ${fmtK(to, { weekday: false, year: false })})`);
  L.push('');
  for (const d of days) {
    const items = d.activities.slice().sort(byTime);
    const rec = (d.recurring || []).slice().sort(byTime);
    if (!items.length && !rec.length && !(d.afterSchool || []).length) continue;
    L.push(`■ ${fmtK(d.date, { year: false })}`);
    items.forEach((a) => L.push(`   - ${lineOf(a)}`));
    rec.forEach((a) => L.push(`   - (상시) ${lineOf(a)}`));
    if ((d.afterSchool || []).length) L.push(`   - (방과후) ${d.afterSchool.map((c) => c.name).join(', ')}`);
    L.push('');
  }
  return L.join('\n').trimEnd();
}

export const categoryLabel = (k) => CATEGORY[k] || '기타';
