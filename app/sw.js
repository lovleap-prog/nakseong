// 오프라인에서도 열리도록 앱 파일을 캐시한다.
// 앱 파일은 '네트워크 우선, 실패하면 캐시' 방식이라 배포하면 다음 실행 때 갱신된다.
//
// VERSION 은 고칠 때마다 올린다. 올리면 옛 캐시를 통째로 버리고 새로 받는다.
// 안 올리면 학교 컴퓨터에 낡은 파일이 남아 '내 화면만 다르다' 는 일이 생긴다.
const VERSION = 'v46';
const CACHE = `sam-${VERSION}`;
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './css/app.css',
  './js/main.js', './js/config.js', './js/model.js', './js/store.js', './js/store-firestore.js', './js/select.js', './js/sampledata.js', './js/checks.js', './js/matcher.js', './js/dragmove.js', './js/conflict.js', './js/views/timetable.js',
  './js/lib/dom.js', './js/lib/zip.js', './js/lib/hwpx-read.js', './js/lib/hwpx-write.js', './js/lib/formdoc.js', './js/lib/holidays.js',
  './js/lib/xlsx-read.js', './js/lib/textparse.js', './js/lib/ttparse.js', './js/lib/neis.js',
  './js/ui/activityForm.js', './js/ui/exporter.js',
  './js/views/schedule.js', './js/views/recurring.js', './js/views/afterschool.js',
  './js/views/approvals.js', './js/views/importer.js', './js/views/settings.js', './js/views/staffbox.js', './js/views/bellsbox.js', './js/views/notice.js', './js/views/board.js', './js/views/membersbox.js', './js/views/memoview.js', './js/views/academic.js', './js/views/trips.js', './js/memo.js', './js/links.js', './js/lib/acadparse.js',
  './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  // 파일 하나가 빠져도 나머지는 담는다. 한 개 실패로 설치가 통째로 엎어지면
  // 오프라인에서 앱이 아예 안 열린다.
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.all(ASSETS.map((u) => c.add(u).catch(() => {}))))
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
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html')))
  );
});
