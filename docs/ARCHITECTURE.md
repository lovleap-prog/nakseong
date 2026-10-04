# 구조 메모 (고치실 분을 위해)

## 원칙

- **빌드 도구 없음.** npm 설치, 컴파일 과정이 없습니다. 파일을 고치고 올리면 그게 배포입니다.
- **외부 라이브러리 없음.** ZIP·hwpx·xlsx 처리까지 브라우저 기본 기능만 씁니다.
  (`CompressionStream('deflate-raw')` — 크롬 103+, 엣지 103+, 사파리 16.4+)
  Firebase SDK만 예외이고, 그것도 `backend: 'firestore'` 일 때만 불러옵니다.
- **저장소는 갈아끼울 수 있게.** 화면 코드는 `store.js` 의 API만 부릅니다.

## 파일

```
app/
  index.html              앱 껍데기
  manifest.webmanifest    설치(PWA) 정보
  sw.js                   오프라인 캐시 (네트워크 우선)
  css/app.css             전체 스타일 (밝은/어두운 테마)
  js/
    main.js               진입점 · 탭 전환 · 위젯 모드
    config.js             학교별 설정 (여기만 고치면 됨)
    model.js              데이터 모양 · 날짜 계산 · 반복일정 전개
    store.js              저장소 파사드 + 로컬(브라우저) 백엔드
    store-firestore.js    Firestore 백엔드 (실시간 구독 · 구글 로그인)
    select.js             화면 공통 조회
    lib/
      dom.js              DOM 헬퍼 · 모달 · 토스트 · 다운로드
      zip.js              의존성 없는 ZIP 읽기/쓰기
      hwpx-read.js        hwpx → 문단 + 표
      hwpx-write.js       결재용 hwpx 생성 · 한글용 HTML 생성
      xlsx-read.js        xlsx 첫 시트 → 2차원 배열
      textparse.js        자유 형식 글 · 표 → 일정 행
      fitline.js          서식 칸에 맞게 줄 끊기 · 자간 좁히기
      neis.js             일일 안내문 · 주간/월간 줄글 요약
    ui/
      activityForm.js     일정 입력/수정 모달
      exporter.js         내보내기 모달
      hilite.js           음영 강조 색 고르개 (관리자)
    views/                탭별 화면 7개
sheets/Code.gs            구글시트 Apps Script
docs/                     설정 · 사용 안내
```

## 데이터

Firestore 경로: `schools/{schoolId}/{컬렉션}/{문서id}`

| 컬렉션 | 내용 |
|---|---|
| `activities` | 낱개 교육활동. `status`: `pending` → `approved` / `rejected` |
| `recurring` | 반복 규칙. 화면에 보일 때 `expandRecurring()` 이 날짜별로 펼침 (저장은 규칙 하나뿐) |
| `afterschool` | 방과후 강좌. `weekdays` 로 요일 매칭 |
| `audit` | 누가·언제·무엇을 승인/반려/수정했는지 |

반복일정을 날짜마다 문서로 만들지 않는 이유: 규칙이 바뀌면 과거·미래를 모두 다시 써야 하고,
문서 수가 금세 수만 개가 됩니다. 펼치는 비용은 무시할 수준입니다.

## 상태 흐름

```
교사 등록/업로드 ──▶ pending ──▶ (관리자 승인) ──▶ approved ──▶ 결재문구·화면에 노출
                       │
                       └──▶ (관리자 반려, 사유 기록) ──▶ rejected
```

- 관리자는 승인 전후 모두 **오기재 수정** 가능. 수정하면 `audit` 에 기록이 남습니다.
- 교사는 자기가 올린 **대기 중인 건만** 고칠 수 있습니다(규칙으로도 강제).
- 반복일정은 사전에 합의된 상시 활동이라 승인 절차 없이 바로 반영됩니다.

## 화면 갱신

`store.js` 의 아주 작은 이벤트 버스를 씁니다. 데이터가 바뀌면 `emit(컬렉션)`,
`main.js` 가 `on('*')` 로 받아 화면 전체를 다시 그립니다.
Firestore의 `onSnapshot` 도 같은 `emit` 을 부르기 때문에,
**다른 선생님의 입력이 들어오면 아무것도 안 해도 화면이 바뀝니다.**

화면이 크지 않아 전체 다시 그리기로 충분합니다. 느려지면 그때 부분 갱신으로 바꾸세요.

## 손대기 쉬운 곳

| 하고 싶은 것 | 고칠 곳 |
|---|---|
| 분류(교과·행사·안전…) 바꾸기 | `model.js` 의 `CATEGORY` |
| 장소·부서 자동 인식 목록 늘리기 | `lib/textparse.js` 의 `PLACES`, `DEPTS` |
| 일일 안내문 형식 바꾸기 | `lib/neis.js` 의 `dailyPlanText()` |
| 음영 강조 색 늘리기 | `model.js` 의 `HILITE` + `css/app.css` 의 `.hl-*` |
| 보결 배정 · 알림 | `views/subplan.js` (체크리스트 · 배정 창 · 메신저 글) |
| '비급식일' 로 볼 말 늘리기 | `select.js` 의 `NOMEAL_RE` |
| 자간을 좁히는 단계 | `lib/fitline.js` 의 `TIGHT_PCT` (한글·CSS 가 같이 쓴다) |
| 화면에 바로 쓰는 메모 칸 늘리기 | `views/notice.js` 의 `noticeBox(kind, key)` + `ICON` |
| 위젯 창 크기 | `main.js` 의 `openWidget()` |
| 열 때 어느 날짜로 뜰지 | `main.js` 의 `readHash()` · `askedDate` |
| 색 · 테마 | `css/app.css` 맨 위 `:root` |

## 알아둘 제약

- 구버전 `.hwp`(이진 형식)는 읽지 못합니다. hwpx로 저장해 올려야 합니다.
- `.hwpx` 생성은 문단만 지원하고 표는 넣지 않습니다(`docs/HWP-EXPORT.md` 참고).
- 로컬 백엔드(`backend: 'local'`)는 브라우저 저장소를 쓰므로 **기기 간 동기화가 없습니다.**
  방문 기록 삭제 시 함께 지워질 수 있으니 체험용으로만 쓰세요.
