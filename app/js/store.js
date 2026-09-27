// 저장소 파사드 — 백엔드(로컬/Firestore)를 갈아끼울 수 있게 분리했다.
// 화면 코드는 이 파일의 API만 사용한다.
import { uid } from './model.js';

export const COLLECTIONS = [
  'activities', 'recurring', 'afterschool', 'audit', 'checks',
  'staff', 'lessons', 'timetable',
  'bells',    // 시정표 (기본 / 단축 / 수업공개 …)
  'daybell',  // 날짜별로 어떤 시정을 쓰는지. 문서 id 가 날짜다.
  'notices',  // 공지사항 · 월별 중점지도
  'academic', // 학사일정 (1학기 / 2학기)
  'trips',    // 출장 신청
  'memos',    // 개인 메모. 사람마다 문서 하나. 본인만 읽는다.
  'members',  // 로그인한 사람 명단. 승인 전에는 아무것도 못 본다. (Firestore 전용)
  'board',    // 공지 — 기간을 정해 붙여 둔다. 관리자와 '공지 권한' 받은 사람이 쓴다.
];

let backend = null;
// approved: 관리자가 명단에서 승인했는가. 로컬 저장에서는 늘 참이다(혼자 쓰는 것이므로).
let user = { name: '', role: 'teacher', dept: '', email: '', uid: '', approved: true, canNotice: false };

export function currentUser() { return user; }
export function setUser(u) {
  user = { ...user, ...u };
  localStorage.setItem('sam.user', JSON.stringify(user));
  emit('user');
}

export function loadSavedUser() {
  try {
    const raw = localStorage.getItem('sam.user');
    if (raw) user = { ...user, ...JSON.parse(raw) };
  } catch { /* 저장값이 깨졌으면 기본값 사용 */ }
  return user;
}

export const isAdmin = () => user.role === 'admin' && user.approved !== false;

/** 자료를 볼 수 있는 사람인가. 승인 전에는 화면을 잠근다. */
export const isApproved = () => user.approved !== false;

/**
 * 공지를 쓸 수 있는가.
 * 관리자 말고도, 교무행정사처럼 관리자가 따로 권한을 준 사람이 쓴다.
 * 공문 접수·안내장 수합을 담임 선생님들께 알리는 일은 그분들이 하기 때문이다.
 */
export const canPost = () => isApproved() && (user.role === 'admin' || user.canNotice === true);

// ── 이벤트 버스 ─────────────────────────────────────────────
const listeners = new Map();
export function on(topic, cb) {
  if (!listeners.has(topic)) listeners.set(topic, new Set());
  listeners.get(topic).add(cb);
  return () => listeners.get(topic).delete(cb);
}
export function emit(topic) {
  for (const cb of listeners.get(topic) || []) cb();
  for (const cb of listeners.get('*') || []) cb(topic);
}

// ── 초기화 ─────────────────────────────────────────────────
export async function initStore(cfg) {
  if (cfg.backend === 'firestore' && cfg.firebase && cfg.firebase.apiKey) {
    const mod = await import('./store-firestore.js');
    backend = await mod.createFirestoreBackend(cfg);
  } else {
    backend = createLocalBackend();
  }
  await backend.ready();
  return backend.kind;
}

export function backendKind() { return backend ? backend.kind : 'none'; }

// 학교 서버에 붙으려다 실패한 사유. 설정이 '이 컴퓨터' 인 것과는 손쓸 방법이 다르다.
let initErr = '';
export function setInitError(m) { initErr = m || ''; }
export function initError() { return initErr; }

/** 자료를 어디서 읽고 있는지 — 학교 코드·계정. 혼자 쓰는 방식이면 빈 값이다. */
export function whereAmI() { return (backend && backend.where) ? backend.where() : {}; }

/** 규칙에 막혀 못 읽은 컬렉션 — { 컬렉션: 사유 }. 없으면 빈 객체다. */
export function readErrors() { return (backend && backend.readErrors) ? backend.readErrors() : {}; }

// ── 로그인 (Firestore 일 때만 뜻이 있다) ─────────────────────
/** 구글 로그인 창을 연다. */
export async function signIn() {
  if (backend && backend.signIn) return backend.signIn();
  throw new Error('이 저장 방식에는 로그인이 없습니다.');
}
export async function signOut() {
  if (backend && backend.signOut) return backend.signOut();
}
/** 로그인해야 하는 방식인데 아직 로그인하지 않았는가 */
export function needsSignIn() {
  return !!(backend && backend.signedIn) && !backend.signedIn();
}
/** 명단의 한 사람을 고친다(승인·역할). 관리자만. */
export async function setMember(uid2, patch) {
  if (!backend || !backend.setMember) throw new Error('이 저장 방식에는 명단이 없습니다.');
  await backend.setMember(uid2, patch);
  emit('members');
}

// ── 데이터 API ─────────────────────────────────────────────
export function list(col) { return backend.list(col); }

export async function put(col, doc) {
  const rec = { ...doc, updatedAt: new Date().toISOString() };
  if (!rec.id) rec.id = uid(col.slice(0, 3));
  await backend.put(col, rec);
  emit(col);
  return rec;
}

export async function putMany(col, docs) {
  const now = new Date().toISOString();
  const recs = docs.map((d) => ({ ...d, id: d.id || uid(col.slice(0, 3)), updatedAt: now }));
  await backend.putMany(col, recs);
  emit(col);
  return recs;
}

export async function remove(col, id) {
  await backend.remove(col, id);
  emit(col);
}

export function get(col, id) { return list(col).find((d) => d.id === id) || null; }

/** 변경 이력 기록 — '오기재 수정'의 근거를 남긴다. */
export async function audit(action, target, before, after) {
  await backend.put('audit', {
    id: uid('log'), at: new Date().toISOString(),
    by: user.name || '(이름없음)', role: user.role,
    action, targetId: target, before: slim(before), after: slim(after),
  });
  emit('audit');
}

// ── 오래된 이력 치우기 ─────────────────────────────────
// 이력은 21곳에서 쌓이는데 쓰이는 곳은 [승인함]의 최근 40건뿐이다. 두면 해마다
// 몇 천 건씩 늘고, 선생님이 새 컴퓨터에서 처음 열 때 그것을 다 받아오게 된다.
// 그래서 관리자가 앱을 열 때 조용히 치운다. 하루에 한 번만 본다.
const KEEP_DAYS = 180;   // 반 년. 오기재를 따질 일은 그 안에 끝난다.
const KEEP_MIN = 200;    // 아무리 오래됐어도 이만큼은 남긴다. 이력이 텅 비면 곤란하다.
const PRUNE_KEY = 'sam.auditPrunedAt';

/**
 * 오래된 변경 이력을 지운다. 관리자만, 하루에 한 번만.
 * 실패해도 조용히 넘어간다. 이력 정리가 앱을 막을 이유는 없다.
 * @returns {Promise<number>} 지운 건수
 */
export async function pruneAudit() {
  if (!isAdmin()) return 0;
  const today = new Date().toISOString().slice(0, 10);
  try { if (localStorage.getItem(PRUNE_KEY) === today) return 0; } catch { /* 무시 */ }

  const rows = list('audit').slice()
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  const cut = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString();
  // 최근 것부터 KEEP_MIN 개는 건너뛰고, 그 뒤에서 낡은 것만 고른다.
  const old = rows.slice(KEEP_MIN).filter((r) => String(r.at || '') < cut);

  try { localStorage.setItem(PRUNE_KEY, today); } catch { /* 무시 */ }
  if (!old.length) return 0;

  let n = 0;
  for (const r of old) {
    try { await backend.remove('audit', r.id); n += 1; } catch { break; }
  }
  if (n) emit('audit');
  return n;
}

function slim(o) {
  if (!o) return null;
  const { history, ...rest } = o;
  return rest;
}

/** 백업 대상. 개인 체크(checks)는 사람마다 다른 값이라 백업에 넣지 않는다. */
// 명단(members)도 뺀다. 로그인 계정에 딸린 것이라 백업 파일로 옮길 성질이 아니다.
export const BACKUP_COLLECTIONS = COLLECTIONS.filter(
  (c) => c !== 'checks' && c !== 'memos' && c !== 'members');

/** 업무분장표를 통째로 갈아끼운다. */
export async function replaceAllStaff(docs) {
  await backend.replace('staff', docs);
  emit('staff');
}

/**
 * 이 컴퓨터(로컬)에 남아 있는 자료.
 *
 * 로컬로 먼저 써 보다가 파이어스토어로 넘어가면 그때까지 넣은 것이 따라가지 않는다.
 * 저장하는 곳이 아예 다르기 때문이다. 학사일정을 올려두고 넘어가면 공휴일이
 * 안 잡히는 식으로 조용히 티가 난다. 그래서 남은 것을 찾아 올려줄 수 있게 한다.
 */
export function localLeftovers() {
  const out = {};
  for (const c of BACKUP_COLLECTIONS) {
    try {
      const rows = JSON.parse(localStorage.getItem(`sam.col.${c}`) || '[]');
      if (Array.isArray(rows) && rows.length) out[c] = rows;
    } catch { /* 깨진 값은 건너뛴다 */ }
  }
  return out;
}

/**
 * 남은 것을 학교 공용으로 올린다.
 * 문서 번호를 그대로 쓰므로 두 번 눌러도 같은 자료가 덮어써질 뿐 늘어나지 않는다.
 */
export async function uploadLeftovers(rowsByCol) {
  let n = 0;
  for (const [c, rows] of Object.entries(rowsByCol || {})) {
    if (!COLLECTIONS.includes(c) || !rows.length) continue;
    await backend.putMany(c, rows);
    emit(c);
    n += rows.length;
  }
  return n;
}

export function exportAll() {
  const data = {};
  for (const c of BACKUP_COLLECTIONS) data[c] = list(c);
  return { exportedAt: new Date().toISOString(), version: 1, data };
}

export async function importAll(payload, { replace = false } = {}) {
  const data = payload && payload.data ? payload.data : payload;
  for (const c of BACKUP_COLLECTIONS) {
    if (!Array.isArray(data[c])) continue;
    if (replace) await backend.replace(c, data[c]);
    else await backend.putMany(c, data[c]);
    emit(c);
  }
}

// ── 로컬 백엔드 (브라우저 저장소 + 탭 간 동기화) ──────────────
function createLocalBackend() {
  const KEY = (c) => `sam.col.${c}`;
  const cache = {};
  const chan = 'BroadcastChannel' in window ? new BroadcastChannel('sam-sync') : null;

  const read = (c) => {
    try { return JSON.parse(localStorage.getItem(KEY(c)) || '[]'); }
    catch { return []; }
  };
  const write = (c) => {
    localStorage.setItem(KEY(c), JSON.stringify(cache[c]));
    if (chan) chan.postMessage({ col: c });
  };

  if (chan) {
    chan.onmessage = (e) => {
      const c = e.data && e.data.col;
      if (!c) return;
      cache[c] = read(c);
      emit(c);
    };
  }
  // 다른 창에서의 변경 (BroadcastChannel 미지원 브라우저 대비)
  window.addEventListener('storage', (e) => {
    const c = COLLECTIONS.find((x) => KEY(x) === e.key);
    if (c) { cache[c] = read(c); emit(c); }
  });

  return {
    kind: 'local',
    async ready() { for (const c of COLLECTIONS) cache[c] = read(c); },
    list(c) { return cache[c] || []; },
    async put(c, doc) {
      const arr = cache[c] || (cache[c] = []);
      const i = arr.findIndex((d) => d.id === doc.id);
      if (i >= 0) arr[i] = doc; else arr.push(doc);
      write(c);
    },
    async putMany(c, docs) {
      const arr = cache[c] || (cache[c] = []);
      for (const doc of docs) {
        const i = arr.findIndex((d) => d.id === doc.id);
        if (i >= 0) arr[i] = doc; else arr.push(doc);
      }
      write(c);
    },
    async remove(c, id) {
      cache[c] = (cache[c] || []).filter((d) => d.id !== id);
      write(c);
    },
    async replace(c, docs) { cache[c] = docs.slice(); write(c); },
  };
}
