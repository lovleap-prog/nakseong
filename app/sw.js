// 오프라인에서도 열리도록 앱 파일을 캐시한다.
// 앱 파일은 '네트워크 우선, 실패하면 캐시' 방식이라 배포하면 다음 실행 때 갱신된다.
//
// ASSETS 에는 js 아래 파일을 모두 적는다. 빠진 파일은 새 판으로 바뀐 직후 오프라인이면
// 받아 둔 것이 없어 앱이 아예 안 열린다(v67 까지 7개가 빠져 있었다).
//
// VERSION 은 고칠 때마다 올린다. 올리면 옛 캐시를 통째로 버리고 새로 받는다.
// 안 올리면 학교 컴퓨터에 낡은 파일이 남아 '내 화면만 다르다' 는 일이 생긴다.
const VERSION = 'v68';
const CACHE = `sam-${VERSION}`;
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './css/app.css',
  './js/checks.js', './js/clashok.js', './js/config.js', './js/conflict.js', './js/del.js',
  './js/dragmove.js', './js/lib/acadparse.js', './js/lib/dom.js', './js/lib/fitline.js',
  './js/lib/formdoc.js', './js/lib/holidays.js', './js/lib/hwpx-read.js', './js/lib/hwpx-write.js',
  './js/lib/neis.js', './js/lib/notation.js', './js/lib/textparse.js', './js/lib/ttparse.js',
  './js/lib/xlsx-read.js', './js/lib/zip.js', './js/links.js', './js/main.js', './js/matcher.js',
  './js/memo.js', './js/model.js', './js/sampledata.js', './js/select.js', './js/store-firestore.js',
  './js/store.js', './js/todo.js', './js/ui/activityForm.js', './js/ui/exporter.js',
  './js/ui/hilite.js', './js/views/academic.js', './js/views/afterschool.js',
  './js/views/approvals.js', './js/views/bellsbox.js', './js/views/board.js', './js/views/importer.js',
  './js/views/membersbox.js', './js/views/memoview.js', './js/views/notice.js',
  './js/views/recurring.js', './js/views/schedule.js', './js/views/settings.js',
  './js/views/staffbox.js', './js/views/subplan.js', './js/views/timetable.js', './js/views/trips.js',
  './icons/icon-192.png', './icons/icon-512.png',
];

/**
 * 서버에 '바뀌었나?' 를 꼭 묻고 받는다.
 *
 * GitHub Pages 는 파일마다 '10분 동안은 다시 묻지 말고 가진 것을 써라'(max-age=600)
 * 를 붙여 보낸다. 그냥 fetch 하면 배포 뒤 10분 동안은 서버의 새 파일 대신 브라우저에
 * 남은 옛 파일이 왔다. 서버에는 v67 이 있는데 [새 판 받기] 를 아무리 눌러도 v66 이었다.
 * 'no-cache' 는 매번 묻되, 안 바뀌었으면 짧은 대답(304)으로 끝나 느려지지 않는다.
 */
const fresh = (url) => fetch(url, { cache: 'no-cache' });

self.addEventListener('install', (e) => {
  // 파일 하나가 빠져도 나머지는 담는다. 한 개 실패로 설치가 통째로 엎어지면
  // 오프라인에서 앱이 아예 안 열린다.
  // cache: 'reload' — 브라우저에 남은 옛 파일이 아니라 서버의 새 파일을 담는다(아래 fresh 참고).
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.all(ASSETS.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {}))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // 파이어베이스 등 외부 요청은 손대지 않는다.
  if (url.origin !== location.origin) return;

  e.respondWith(
    fresh(e.request.url)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html')))
  );
});
