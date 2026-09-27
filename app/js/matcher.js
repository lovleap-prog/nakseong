// 교육활동 ↔ 담당자 자동 매칭
//
// 두 갈래 근거를 같은 저울에 올린다.
//   (1) 업무분장표  — '안전' 은 생활인성부 박지현 …  = 규칙. 학교가 정한 사실이라 가중치가 높다.
//   (2) 과거 사례    — 작년에 '소방대피 훈련' 을 누가 맡았나 = 통계. 규칙에 없는 것을 메운다.
//
// 외부 AI 를 쓰지 않는다. 학교 일정은 낱말이 정형화돼 있어서 글자 2-gram 유사도만으로
// 충분히 맞고, API 키도 필요 없고, 명단이 학교 밖으로 나가지 않는다.
import { list } from './store.js';

/** 한글은 띄어쓰기가 들쭉날쭉해서 낱말 대신 글자 2-gram 으로 비교한다. */
export function bigrams(text) {
  const t = String(text || '').replace(/[^가-힣A-Za-z0-9]+/g, '');
  if (t.length < 2) return t ? [t] : [];
  const out = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
}

/** 두 문자열이 얼마나 닮았는지 0~1 (Dice 계수) */
export function similarity(a, b) {
  const A = new Set(bigrams(a));
  const B = new Set(bigrams(b));
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const x of A) if (B.has(x)) hit++;
  return (2 * hit) / (A.size + B.size);
}

/**
 * '콕 집어' 규칙 — 낱말이 활동명·세부내용에 들어 있으면 그 사람으로 정한다.
 * 낱말이 긴 규칙을 먼저 본다. '유치원' 과 '작은유치원' 이 함께 있으면 긴 쪽이 맞다.
 */
function strictHit(activity, staff) {
  const text = [activity.title, activity.detail].filter(Boolean).join(' ');
  if (!text.trim()) return null;
  const rules = [];
  for (const s of staff) {
    if (!s.strict) continue;
    for (const kw of s.keywords || []) {
      const k = String(kw).trim();
      if (k.length >= 2) rules.push({ k, s });
    }
  }
  rules.sort((a, b) => b.k.length - a.k.length);
  const flat = (t) => String(t).replace(/\s+/g, '');
  for (const { k, s } of rules) {
    if (text.includes(k) || flat(text).includes(flat(k))) {
      return {
        owner: s.name, dept: s.dept, score: 2,
        confidence: 'high', reason: `콕 집어 '${k}'`, strict: true,
      };
    }
  }
  return null;
}

const RULE_WEIGHT = 1.0;
const CASE_WEIGHT = 0.8;
const CASE_FLOOR = 0.45;      // 이만큼은 닮아야 같은 활동으로 친다
const WEAK_FIELD = 0.5;       // 장소·대상에서 걸린 근거는 절반만 인정한다
const SUGGEST_FLOOR = 0.35;   // 이보다 낮으면 아무 말도 하지 않는다
export const AUTO_FILL_FLOOR = 0.6;  // 이보다 낮으면 '제안' 만 하고 직접 채우지는 않는다

/**
 * 낱말이 그대로 없어도 3글자 이상 겹치면 약한 근거로 인정한다.
 * 업무분장에 '스포츠클럽' 이라 적혀 있고 일정은 '토요스포츠' 인 경우가 흔하다.
 */
function partialHit(keyword, text) {
  const k = String(keyword);
  for (let len = k.length - 1; len >= 3; len--) {
    for (let i = 0; i + len <= k.length; i++) {
      const piece = k.slice(i, i + len);
      if (text.includes(piece)) return piece;
    }
  }
  return null;
}

/** 업무분장표 + 과거 사례를 모은다. 이미 등록돼 담당자가 적힌 일정도 사례로 쓴다. */
export function matchSources() {
  const staff = list('staff').filter((s) => s.active !== false && s.name);
  const lessons = list('lessons').filter((l) => l.title && (l.owner || l.dept));
  const fromActivities = list('activities')
    .filter((a) => a.title && (a.owner || a.dept) && a.status === 'approved')
    .map((a) => ({ title: a.title, owner: a.owner, dept: a.dept, count: 1, source: '등록된 일정' }));
  return { staff, lessons: lessons.concat(fromActivities) };
}

/**
 * 활동 하나에 담당자를 추천한다.
 * @returns {{owner, dept, score, confidence, reason}|null}
 */
export function suggestOwner(activity, sources = matchSources()) {
  // (0) '콕 집어' 규칙이 걸리면 여기서 끝낸다. 저울질하지 않는다.
  const pinned = strictHit(activity, sources.staff);
  if (pinned) return pinned;

  // 활동명·세부내용은 강한 근거, 장소·대상은 약한 근거로 나눈다.
  // 'AI교실' 에서 수업한다고 정보 담당자가 맡는 건 아니기 때문이다.
  const strong = [activity.title, activity.detail].filter(Boolean).join(' ');
  const weak = [activity.place, activity.target].filter(Boolean).join(' ');
  const text = `${strong} ${weak}`.trim();
  if (!strong.trim()) return null;

  const cand = new Map();   // '이름|부서' → { owner, dept, score, reasons:[] }
  const add = (owner, dept, score, reason) => {
    const key = `${owner || ''}|${dept || ''}`;
    const cur = cand.get(key) || { owner: owner || '', dept: dept || '', score: 0, reasons: [] };
    cur.score += score;
    if (reason && cur.reasons.length < 3) cur.reasons.push(reason);
    cand.set(key, cur);
  };

  // (1) 업무분장표 규칙
  for (const s of sources.staff) {
    for (const kw of s.keywords || []) {
      const k = String(kw).trim();
      if (k.length < 2) continue;
      // 긴 낱말일수록 구체적이라 더 믿는다. '학교폭력' > '교육'
      const inStrong = strong.includes(k);
      if (inStrong || weak.includes(k)) {
        const weight = Math.min(1, 0.45 + k.length * 0.12);
        add(s.name, s.dept, RULE_WEIGHT * weight * (inStrong ? 1 : WEAK_FIELD),
          `업무분장 '${k}'${inStrong ? '' : ' (장소·대상)'}`);
        continue;
      }
      const piece = partialHit(k, strong);
      if (piece) {
        const weight = Math.min(1, 0.45 + piece.length * 0.12);
        add(s.name, s.dept, RULE_WEIGHT * weight * 0.6, `업무분장 '${k}' 중 '${piece}'`);
      }
    }
  }

  // (2) 과거 사례
  const best = new Map();   // 같은 담당자에 대해 가장 닮은 사례 하나만 센다
  for (const l of sources.lessons) {
    const sim = similarity(activity.title, l.title);
    if (sim < CASE_FLOOR) continue;
    const key = `${l.owner || ''}|${l.dept || ''}`;
    const prev = best.get(key);
    if (!prev || sim > prev.sim) best.set(key, { sim, lesson: l });
  }
  for (const [, { sim, lesson }] of best) {
    const repeat = Math.min(1.3, 1 + Math.log10(Math.max(1, lesson.count || 1)));
    add(lesson.owner, lesson.dept, CASE_WEIGHT * sim * repeat,
      `과거 '${lesson.title}'${sim >= 0.95 ? '' : ` (${Math.round(sim * 100)}% 유사)`}`);
  }

  const ranked = [...cand.values()].sort((a, b) => b.score - a.score);
  const top = ranked[0];
  if (!top || top.score < SUGGEST_FLOOR) return null;

  // 1등과 2등이 붙어 있으면 확신이 낮다는 뜻이다.
  const gap = ranked[1] ? top.score - ranked[1].score : top.score;
  const confidence = gap >= 0.5 && top.score >= 1 ? 'high' : gap >= 0.2 ? 'medium' : 'low';

  return {
    owner: top.owner,
    dept: top.dept,
    score: Math.round(top.score * 100) / 100,
    confidence,
    reason: top.reasons.join(' · '),
  };
}

/**
 * 여러 건에 한꺼번에 추천을 붙인다. 이미 담당자가 적힌 행은 건드리지 않는다.
 * 확신이 낮으면 직접 채우지 않고 '제안' 으로만 남긴다.
 * 엉뚱한 이름이 채워져 있는 것보다 비어 있는 편이 낫고, 제안은 눌러서 넣을 수 있다.
 */
export function fillOwners(rows, { overwrite = false } = {}) {
  const sources = matchSources();
  let filled = 0;
  let hinted = 0;
  for (const r of rows) {
    // '콕 집어' 규칙은 이미 채워진 칸도 바로잡는다. 그러라고 콕 집어 둔 것이다.
    const pre = suggestOwner(r, sources);
    const strict = pre && pre.strict;
    if (!overwrite && !strict && (r.owner || r.dept)) continue;
    const hit = pre;
    if (!hit) continue;
    r._suggested = hit;
    if (hit.score >= AUTO_FILL_FLOOR) {
      if (hit.owner) r.owner = hit.owner;
      if (hit.dept && (strict || !r.dept)) r.dept = hit.dept;
      filled++;
    } else {
      hinted++;
    }
  }
  return { filled, hinted };
}

/** 과거 계획에서 뽑은 (활동명, 담당자) 쌍을 사례로 쌓는다. 같은 쌍은 횟수만 올린다. */
export function mergeLessons(existing, pairs, source = '') {
  const byKey = new Map();
  for (const l of existing) byKey.set(`${l.title}|${l.owner}|${l.dept}`, { ...l });

  let added = 0;
  let bumped = 0;
  for (const p of pairs) {
    const title = String(p.title || '').trim();
    const owner = String(p.owner || '').trim();
    const dept = String(p.dept || '').trim();
    if (!title || (!owner && !dept)) continue;
    const key = `${title}|${owner}|${dept}`;
    const hit = byKey.get(key);
    if (hit) { hit.count = (hit.count || 1) + 1; bumped++; }
    else { byKey.set(key, { title, owner, dept, count: 1, source }); added++; }
  }
  return { rows: [...byKey.values()], added, bumped };
}
