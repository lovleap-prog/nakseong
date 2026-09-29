// 머리말 바로가기 링크 — 학교 노션 자료실, 업무포털, 아이모두 같은 것.
//
// 전에는 이 컴퓨터에만 저장돼서, 모든 선생님에게 보이려면 config.js 를 고쳐
// 다시 배포해야 했다. 링크 하나 바꾸자고 배포를 할 수는 없다.
// 그래서 학교 전체가 함께 쓰는 방식일 때는 공지사항과 같은 자리에 담는다.
// (읽기는 모두, 쓰기는 관리자 — 권한 규칙이 공지사항과 똑같아 규칙을 고칠 일이 없다)
import { list, put, backendKind, currentUser } from './store.js';
import { noticeId } from './model.js';
import { loadConfig } from './config.js';

const DOC_ID = noticeId('links', 'all');

const clean = (rows) => (rows || [])
  .map((l) => ({ label: String(l.label || '').trim(), url: String(l.url || '').trim() }))
  .filter((l) => l.url)
  .map((l) => ({ label: l.label || l.url.replace(/^https?:\/\//, '').slice(0, 24), url: l.url }));

const sharedDoc = () =>
  (backendKind() === 'firestore' ? list('notices').find((n) => n.id === DOC_ID) : null) || null;

/** 학교 공용 목록을 이미 정해 두었는가 */
export const hasSharedLinks = () => !!sharedDoc();

/** 학교 전체가 함께 보는 링크. 로컬 방식이면 빈 목록. */
export function sharedLinks() {
  const doc = sharedDoc();
  return doc && Array.isArray(doc.links) ? clean(doc.links) : [];
}

/** 언제 누가 고쳤는지 */
export function sharedLinksMeta() {
  const doc = list('notices').find((n) => n.id === DOC_ID);
  return doc ? { by: doc.by || '', at: doc.at || '' } : null;
}

/** 관리자만. 모두에게 보이도록 저장한다. */
export async function saveSharedLinks(rows) {
  await put('notices', {
    id: DOC_ID, kind: 'links', key: 'all',
    links: clean(rows),
    by: currentUser().name || '', at: new Date().toISOString(),
  });
}

/** 이 컴퓨터(또는 config.js)에 적힌 링크 */
export const localLinks = () => clean(loadConfig().links);

/**
 * 실제로 머리말에 걸 링크.
 *
 * 학교 공용 목록을 한 번이라도 정했으면 그것만 건다. 둘을 섞으면 관리자에게만
 * 보이는 단추가 하나 더 생겨, 남들 화면과 달라 보인다.
 * 아직 정하기 전에는 이 컴퓨터 설정을 쓴다(그래야 처음부터 비어 보이지 않는다).
 */
export function effectiveLinks() {
  return hasSharedLinks() ? sharedLinks() : localLinks();
}

/** 설정 화면의 링크 칸을 무엇으로 채울지 */
export function editableLinks() {
  if (backendKind() !== 'firestore') return localLinks();
  // 공용 목록이 아직 없으면 이 컴퓨터 값을 채워 둔다. 한 번 눌러 올리면 된다.
  return hasSharedLinks() ? sharedLinks() : localLinks();
}

// ── 일일 안내문 고정 문구 ────────────────────────────────
//
// 학교마다 안내문 아래에 해마다 똑같이 붙는 문단이 있다(생활안전지도·급식 시간 …).
// 앱이 만들어 낼 수 있는 것이 아니라 학교가 정하는 말이라, 한 번 적어 두고 쓴다.
// 링크와 같은 자리(notices)에 담는다 — 읽기는 모두, 쓰기는 관리자.
const TAIL_ID = noticeId('dailytail', 'all');

/** 저장해 둔 고정 문구. 아직 없으면 null(기본 문구를 쓴다는 뜻). */
export function dailyTail() {
  const doc = list('notices').find((n) => n.id === TAIL_ID);
  return doc && typeof doc.text === 'string' ? doc.text : null;
}

export function dailyTailMeta() {
  const doc = list('notices').find((n) => n.id === TAIL_ID);
  return doc ? { by: doc.by || '', at: doc.at || '' } : null;
}

/** 관리자만. 빈 글로 저장하면 안내문 아래 문단이 통째로 빠진다. */
export async function saveDailyTail(text) {
  await put('notices', {
    id: TAIL_ID, kind: 'dailytail', key: 'all',
    text: String(text == null ? '' : text),
    by: currentUser().name || '', at: new Date().toISOString(),
  });
}
