# Firebase 실시간 공유 설정 (30분)

학교 전체가 같은 자료를 보고, 어느 기기에서 고쳐도 바로 반영되게 만드는 단계입니다.
개발 경험이 없어도 따라 할 수 있게 적었습니다.

## 1. 프로젝트 만들기

1. https://console.firebase.google.com 접속 → **프로젝트 추가**
2. 이름은 아무거나 (예: `school-activity`). Google 애널리틱스는 **사용 안 함**으로 두면 됩니다.

## 2. 웹 앱 등록

1. 프로젝트 개요 화면에서 **웹(`</>`)** 아이콘 클릭
2. 앱 닉네임 입력 → 등록
3. 화면에 나오는 `firebaseConfig` 값을 복사해 둡니다.

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "school-activity.firebaseapp.com",
  projectId: "school-activity",
  storageBucket: "school-activity.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef"
};
```

> 이 값들은 비밀번호가 아닙니다. 웹앱에 그대로 들어가는 공개 식별자이고,
> 실제 보호는 아래 **보안 규칙**이 합니다.

## 3. 로그인 방식 켜기

**빌드 → Authentication → 시작하기 → Google** 사용 설정.
학교 구글 계정(Workspace)을 쓰면 아래 6번에서 도메인을 제한할 수 있습니다.

## 4. 데이터베이스 만들기

**빌드 → Firestore Database → 데이터베이스 만들기**
위치는 `asia-northeast3 (서울)` 을 고르세요. 모드는 **프로덕션 모드**.

## 5. 보안 규칙 붙여넣기

Firestore의 **규칙** 탭에 아래를 그대로 넣고 게시합니다.
`default` 자리에는 설정 탭에 적은 '학교 코드'를 씁니다(그대로 둬도 됩니다).

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() { return request.auth != null; }

    function memberPath(school) {
      return /databases/$(database)/documents/schools/$(school)/members/$(request.auth.uid);
    }
    function member(school) { return get(memberPath(school)).data; }

    // 로그인만으로는 아무것도 못 본다. 관리자가 명단에서 승인해야 열린다.
    // 선생님들이 개인 지메일·다음 메일을 쓰면 구글 도메인으로 막을 수가 없어서,
    // '로그인했으면 통과' 로 두면 주소를 아는 사람이 아무 계정으로 들어와
    // 출장 사유와 업무분장까지 다 보게 된다.
    function ok(school) {
      return signedIn() && exists(memberPath(school)) && member(school).approved == true;
    }
    function isAdmin(school) { return ok(school) && member(school).role == 'admin'; }

    // 공지는 관리자 말고도 '공지 권한' 을 받은 사람이 쓴다.
    // 공문 접수·안내장 수합을 담임께 알리는 일은 교무행정사가 하기 때문이다.
    // 일정 승인 권한은 여기에 딸려 오지 않는다.
    function canPost(school) {
      return ok(school) && (member(school).role == 'admin' || member(school).canNotice == true);
    }

    match /schools/{school}/members/{uid} {
      // 자기 문서는 늘 읽을 수 있어야 한다. 그래야 '승인 대기' 화면을 띄운다.
      allow get: if signedIn() && request.auth.uid == uid;
      // 남의 것까지 보는 건 승인된 사람만
      allow read: if ok(school);
      // 첫 로그인: 본인 문서만, 교사로, 승인 안 된 상태로만 만들 수 있다.
      // approved 를 스스로 true 로 넣지 못하게 막는 것이 이 줄의 핵심이다.
      allow create: if signedIn() && request.auth.uid == uid
                    && request.resource.data.role == 'teacher'
                    && request.resource.data.approved == false;
      // 승인·역할 변경은 관리자만.
      // 본인은 이름·부서만. role·approved·canNotice 는 스스로 올리지 못한다.
      allow update: if isAdmin(school)
                    || (signedIn() && request.auth.uid == uid
                        && request.resource.data.role == resource.data.role
                        && request.resource.data.approved == resource.data.approved
                        && request.resource.data.get('canNotice', false)
                           == resource.data.get('canNotice', false));
      allow delete: if isAdmin(school);
    }

    match /schools/{school}/activities/{id} {
      allow read: if ok(school);
      // 교사는 '확인 대기' 상태로만 올릴 수 있다
      allow create: if ok(school) &&
        (isAdmin(school) || request.resource.data.status == 'pending');
      // 승인/반려와 남의 글 수정은 관리자만.
      // 교사는 아직 대기 중인 '자기 글'만 고칠 수 있다.
      allow update: if isAdmin(school) ||
        (ok(school)
         && resource.data.status == 'pending'
         && request.resource.data.status == 'pending'
         && resource.data.createdBy == member(school).name) ||
        // 이미 승인된 제 일정에 '삭제 요청' 만 달거나 거두는 것. 지우는 것은 관리자가 한다.
        (ok(school)
         && resource.data.createdBy == member(school).name
         && request.resource.data.diff(resource.data).affectedKeys()
              .hasOnly(['delReq', 'delReqBy', 'delReqAt', 'delReqReason', 'updatedAt']));
      allow delete: if isAdmin(school) ||
        (ok(school) && resource.data.status == 'pending'
         && resource.data.createdBy == member(school).name);
    }

    // 반복일정 · 방과후 시간표는 관리자만 고친다
    match /schools/{school}/recurring/{id} {
      allow read: if ok(school);
      allow write: if isAdmin(school);
    }
    match /schools/{school}/afterschool/{id} {
      allow read: if ok(school);
      allow write: if isAdmin(school);
    }

    // 개인 확인 체크 — 문서 id 가 그 사람의 uid 다.
    // 읽기도 본인만. 앱도 컬렉션 전체가 아니라 본인 문서 하나만 구독한다.
    match /schools/{school}/checks/{uid} {
      allow read, write: if ok(school) && request.auth.uid == uid;
    }

    // 개인 메모 — 문서 id 가 그 사람의 uid 다. 본인만 읽고 쓴다.
    match /schools/{school}/memos/{uid} {
      allow read, write: if ok(school) && request.auth.uid == uid;
    }

    // 공지사항 · 월별 중점지도 · 학사일정 · 시정표 — 읽기는 모두, 쓰기는 관리자만
    match /schools/{school}/notices/{id} {
      allow read: if ok(school);
      allow write: if isAdmin(school);
    }
    match /schools/{school}/academic/{id} {
      allow read: if ok(school);
      allow write: if isAdmin(school);
    }
    match /schools/{school}/bells/{id} {
      allow read: if ok(school);
      allow write: if isAdmin(school);
    }
    match /schools/{school}/daybell/{id} {
      allow read: if ok(school);
      allow write: if isAdmin(school);
    }
    match /schools/{school}/timetable/{id} {
      allow read: if ok(school);
      allow write: if isAdmin(school);
    }

    // 출장 — 본인이 신청하고, 승인·반려는 관리자만
    match /schools/{school}/trips/{id} {
      allow read: if ok(school);
      allow create: if ok(school) &&
        (isAdmin(school) || request.resource.data.status == 'pending');
      allow update: if isAdmin(school) ||
        (ok(school)
         && resource.data.status == 'pending'
         && request.resource.data.status == 'pending'
         && resource.data.applicant == member(school).name);
      allow delete: if isAdmin(school) ||
        (ok(school) && resource.data.status == 'pending'
         && resource.data.applicant == member(school).name);
    }

    // 공지 — 관리자와 '공지 권한' 받은 사람이 올린다.
    // 남의 공지를 고치거나 내리는 것은 관리자만. 자기 것은 본인도 한다.
    match /schools/{school}/board/{id} {
      allow read: if ok(school);
      allow create: if canPost(school) && request.resource.data.uid == request.auth.uid;
      allow update, delete: if isAdmin(school)
                            || (canPost(school) && resource.data.uid == request.auth.uid);
    }

    // 업무분장 · 학습 사례 — 읽기는 모두, 쓰기는 관리자만
    match /schools/{school}/staff/{id} {
      allow read: if ok(school);
      allow write: if isAdmin(school);
    }
    match /schools/{school}/lessons/{id} {
      allow read: if ok(school);
      allow write: if isAdmin(school);
    }

    // 이력은 남기기만 하고 고치지 못하게
    match /schools/{school}/audit/{id} {
      allow read: if ok(school);
      allow create: if ok(school);
      // 고쳐 쓰는 것은 누구도 못 한다. 이력이 이력 구실을 하려면 그래야 한다.
      allow update: if false;
      // 다만 관리자는 지울 수 있다. 앱이 반 년 지난 것을 알아서 치운다.
      // 안 치우면 해마다 몇 천 건씩 늘어 새 컴퓨터가 그것을 다 받아오게 된다.
      allow delete: if isAdmin(school);
    }
  }
}
```

## 6. 앱에 값 넣기

방법은 둘 중 하나입니다.

**(가) 앱 화면에서** — 앱 실행 → **설정** 탭 → '자료 저장 방식'을
`Firebase 실시간 공유` 로 바꾸고 2번에서 복사한 값들을 붙여넣은 뒤 [설정 저장] → 새로 고침.
이 방법은 그 컴퓨터에만 적용됩니다.

**(나) 파일에 박아두기(권장)** — `app/js/config.js` 를 열어
`backend` 를 `'firestore'` 로 바꾸고 `firebase` 항목을 채워 저장합니다.
이러면 선생님들은 주소만 열면 되고 아무 설정도 하지 않아도 됩니다.

```js
const DEFAULTS = {
  backend: 'firestore',
  schoolId: 'default',
  ...
  firebase: {
    apiKey: 'AIza...',
    authDomain: 'school-activity.firebaseapp.com',
    projectId: 'school-activity',
    storageBucket: 'school-activity.appspot.com',
    messagingSenderId: '1234567890',
    appId: '1:1234567890:web:abcdef',
  },
  googleHostedDomain: 'goe.go.kr',   // 학교 구글 도메인만 로그인 허용 (선택)
};
```

## 7. 첫 관리자 지정 (한 번만 콘솔에서)

명단 승인제라서 **맨 처음 한 사람은 콘솔에서 직접 열어줘야 합니다.** 그 뒤로는 앱에서 다 됩니다.

1. 선생님이 먼저 앱에 들어가 **구글 로그인**을 합니다.
   → 화면에 `승인을 기다리고 있습니다` 가 뜨고, `members` 컬렉션에 본인 문서가 생깁니다.
2. Firebase 콘솔 → Firestore → `schools/default/members/{본인 uid}` 문서를 열어
   **두 값을 고칩니다.**

   | 필드 | 바꿀 값 |
   |---|---|
   | `role` | `teacher` → **`admin`** |
   | `approved` | `false` → **`true`** (불리언) |

3. 앱 화면이 **새로 고치지 않아도** 곧바로 열립니다. 문서를 계속 지켜보고 있기 때문입니다.

이제부터 다른 선생님은 **[설정] 탭 → 명단 · 승인** 에서 승인하시면 됩니다. 콘솔에 다시 들어갈 일이 없습니다.

## 7-1. 선생님들 승인하기

선생님이 앱 주소를 열고 구글 로그인을 하면 `대기` 로 명단에 올라옵니다.
그 상태에서는 **학교 자료를 한 줄도 내려받지 않습니다.** 구독 자체를 시작하지 않습니다.

관리자는 **[설정] 탭 → 명단 · 승인** 에서

- **[승인]** — 이 사람에게 자료를 연다. 누르는 즉시 그분 화면이 열린다(새로 고침 불필요)
- **[관리자로]** — 승인함(결재) 권한까지 준다
- **[승인 취소]** — 그 즉시 자료가 안 보인다. 전근 가신 분 정리에 쓴다

> **모르는 이름이면 승인하지 마세요.** 주소만 알면 누구나 로그인까지는 할 수 있습니다.
> 막는 것은 로그인이 아니라 이 승인입니다.

자기 자신은 승인 취소나 역할 변경을 할 수 없게 막아 두었습니다.
관리자가 실수로 혼자 잠기면 아무도 풀어줄 수 없기 때문입니다.

## 8. 배포

앱은 정적 파일이라 아무 데나 올려도 됩니다.

**→ 인터넷에 올리는 법은 `docs/DEPLOY.md` 에 따로 적어두었습니다.**
깃허브에 연결해두면 올릴 때마다 자동으로 배포되고, 명령어를 쓸 일이 없습니다.

다른 길도 있습니다.

- **GitHub Pages** — 저장소 Settings → Pages → Branch `main` / 폴더 `/ (root)`
  → 주소는 `https://<계정>.github.io/class/app/`
- **Firebase Hosting** — `npm i -g firebase-tools && firebase init hosting && firebase deploy`
  (public 폴더를 `app` 으로 지정)

**반드시 `https://` 주소여야 합니다.** 그래야 설치(PWA)와 구글 로그인이 됩니다.

### ⚠️ 어디에 올리든 — 승인된 도메인

배포 주소가 정해지면 **Authentication → Settings → 승인된 도메인** 에 그 주소를 넣어야 합니다.
넣지 않으면 구글 로그인 창이 뜨자마자 닫힙니다. 가장 흔한 실수입니다.

## 고친 것이 자동으로 반영되나

두 가지를 나눠서 봐야 합니다. **자료는 자동, 앱은 반자동**입니다.

### 자료(일정·승인·시간표) — 자동입니다

앱은 모든 자료를 파이어스토어의 `onSnapshot` 으로 **구독**합니다.
누가 어디서 고치든 서버가 밀어주기 때문에, 보고 있는 화면이 **새로 고침 없이** 바뀝니다.

| 이런 일이 생기면 | 다른 선생님 화면은 |
|---|---|
| 교사가 일정 등록 | 관리자 승인함에 곧바로 뜸 |
| 관리자가 승인 | 신청한 분 화면에서 '확인 대기' 가 사라짐 |
| 날짜를 끌어서 옮김 | 모두의 주간·월간이 같이 움직임 |
| 시간표·공지·학사일정 수정 | 즉시 |

휴대전화와 컴퓨터를 같이 켜 두고 한쪽에서 고쳐 보면 바로 확인됩니다.

> 개인 메모와 개인 확인 체크만 예외입니다. 본인 것만 오갑니다(아래 참고).

### 앱(기능 수정) — 다음에 열 때 반영됩니다

앱 파일은 **'네트워크 우선'** 으로 받습니다. 새 파일을 올리면 선생님들이 **다음에 앱을 열 때**
자동으로 받아갑니다. 따로 알려서 다시 깔게 할 필요가 없습니다.

앱을 하루 종일 켜 두는 분을 위해, 새 판이 올라오면 화면 아래에
**`새 버전이 나왔습니다 [새로고침]`** 이 뜹니다. 눌러야 바뀌고, [나중에] 로 미룰 수 있습니다.

**앱 파일을 고쳐 올릴 때는 `app/sw.js` 맨 위의 `VERSION` 을 한 칸 올려주세요.**

```js
const VERSION = 'v2';   // → 'v3' 으로
```

이걸 올려야 학교 컴퓨터에 남은 옛 파일이 버려집니다.
안 올리면 어떤 분은 새 화면, 어떤 분은 옛 화면을 보는 일이 생깁니다.

> 급할 때(한 분만 화면이 이상할 때)는 그 컴퓨터에서 **Ctrl+Shift+R** 로 강제 새로 고침하면 됩니다.

### 정리

| | 누가 반영하나 | 언제 |
|---|---|---|
| 일정·승인·시간표·공지 | 파이어스토어 | 즉시, 새로 고침 없이 |
| 앱 기능 수정 | 올린 파일 + 서비스워커 | 다음에 열 때 (켜 둔 화면은 알림 뒤 새로고침) |
| 보안 규칙 | 파이어베이스 콘솔에서 [게시] | 게시 즉시 |

보안 규칙은 앱 파일과 **따로** 갑니다. 규칙을 고쳤으면 콘솔에서 [게시] 를 눌러야 합니다.

## 누가 볼 수 있나 — 명단 승인제

선생님들이 **개인 지메일·다음 메일**을 쓰시면 구글 도메인(`goe.go.kr` 등)으로 문을 막을 수가 없습니다.
그때 '로그인했으면 통과' 로 두면 이렇게 됩니다.

```
모르는 사람이 주소를 앎 → 아무 지메일로 로그인 → 출장 사유·업무분장까지 다 보임
```

그래서 로그인 뒤에 **승인**을 한 단계 더 두었습니다.

| 상태 | 볼 수 있는 것 |
|---|---|
| 로그인 안 함 | 없음. 로그인 화면만 |
| 로그인함 · 승인 대기 | **없음.** '승인을 기다리고 있습니다' 화면만 |
| 승인됨 | 학교 자료 전부 |
| 승인됨 · 관리자 | + 승인함(결재), 명단 관리 |

승인 전에는 화면만 가리는 것이 아니라 **구독 자체를 시작하지 않습니다.**
개발자 도구를 열어도 자료가 한 줄도 오지 않습니다.
보안 규칙에서도 모든 자료에 `approved == true` 를 걸어두었기 때문에,
앱을 거치지 않고 직접 요청해도 거부됩니다.

`approved` 를 스스로 `true` 로 만들 수 없게 규칙에 못 박아 두었습니다.

```
allow create: if signedIn() && request.auth.uid == uid
              && request.resource.data.role == 'teacher'
              && request.resource.data.approved == false;
```

> 학교 구글 계정(Workspace)을 쓰시는 학교라면 `config.js` 의 `googleHostedDomain` 에
> 도메인을 적어 **한 겹 더** 막을 수 있습니다. 승인제와 같이 써도 됩니다.

### 로그인은 한 번만 — 그런데 공용 컴퓨터는

구글 로그인 상태는 브라우저에 남습니다. **브라우저를 껐다 켜도, 컴퓨터를 재부팅해도 유지됩니다.**
두 번째부터는 주소만 열면 바로 열립니다. 기기마다 한 번씩만 하시면 되고,
기기를 바꿔 다시 로그인해도 **승인은 다시 받지 않습니다**(같은 구글 계정이므로).

다시 로그인이 필요한 때는 기기·브라우저를 바꿀 때, 로그아웃했을 때,
브라우저 기록을 지웠을 때, 시크릿 창을 닫았을 때입니다.

문제는 **교무실 공용 컴퓨터**입니다. 앞사람 계정이 그대로 남아 있으면
다음 분이 낸 출장 신청이 앞사람 이름으로 올라갑니다.
그래서 머리말의 이름 단추를 누르면 **[로그아웃]이 바로 나오게** 해 두었습니다.

```
[ 조요한 · 관리자 ▾ ]
   ├ ⚙️ 설정
   └ 🚪 로그아웃
```

공용 컴퓨터에서 쓰고 나면 꼭 눌러달라고 안내해 주세요.

### 다음 메일만 쓰시는 분

구글 로그인은 **구글 계정**이 있어야 합니다. 다음 메일 주소로 구글 계정을 만들어 두셨다면
그대로 되지만, 안 만드신 분은 로그인이 안 됩니다.
그런 분은 구글 계정을 하나 만드시거나(무료), 개인 지메일로 들어오시면 됩니다.

## 바로가기 링크는 모두에게 한 번에

머리말의 학교 자료실(노션)·업무포털·아이모두 같은 링크입니다.

[설정] → 바로가기 링크에서 넣고 **[모두에게 보이게 저장]** 을 누르면
**그 순간 모든 선생님 화면에 똑같이 걸립니다.** 다시 배포할 필요가 없습니다.

- 넣고 고치는 것은 **관리자만** 합니다. 교사에게는 링크만 보입니다
- 접근 권한이 없는 분에게도 그냥 보여줍니다. 눌러도 그쪽에서 막히므로
  숨길 이유가 없고, 권한 있는 분이 찾기 쉬운 편이 낫습니다

> 로컬로 먼저 써 보시면서 넣어둔 링크가 있으면 칸에 미리 채워 둡니다.
> 한 번 저장하면 모두에게 올라갑니다.

## 로컬로 먼저 써 보셨다면 — 자료 옮기기

'이 컴퓨터에만 저장' 으로 써 보다가 Firebase 로 바꾸면, **그때까지 넣은 자료가 따라가지 않습니다.**
저장하는 곳이 아예 다르기 때문입니다.

학사일정·시정표·시간표·업무분장 같은 것이 비어 보이면 이 때문입니다.
특히 **학사일정이 빠지면 추석·설날 같은 음력 공휴일이 잡히지 않아**,
시간표와 월간에 연휴 표시가 안 나옵니다.

관리자로 들어가면 [설정] 탭에 이런 상자가 뜹니다.

```
📦 이 컴퓨터에 남아 있는 예전 자료
   학사일정 138건
   시정표 3건
   업무분장 12건
   [153건 모두 올리기]
```

한 번 누르면 모두 학교 공용으로 올라갑니다.
문서 번호를 그대로 쓰므로 **두 번 눌러도 자료가 늘어나지 않습니다.**
다 올리고 나면 이 상자는 사라집니다.

> 자료를 넣었던 그 컴퓨터에서 눌러야 합니다. 다른 컴퓨터에는 남아 있는 것이 없습니다.

## 개인 확인 체크에 대해

일일교육활동의 체크박스는 일정 문서를 건드리지 않고 `checks` 컬렉션에 사람별로 따로 저장합니다.
그래서 **내가 체크해도 다른 선생님 화면은 그대로**이고, 같은 사람이 컴퓨터와 휴대전화에서 봐도
체크는 따라갑니다.

읽기·쓰기 모두 **본인 문서로 제한**했습니다. 앱도 `checks` 컬렉션 전체가 아니라
로그인한 본인의 문서 하나만 구독합니다. 그래서 개발자 도구를 열어도 남의 체크는 나오지 않습니다.
("누가 무엇을 아직 안 했는지"가 교직원 사이에 드러나지 않도록 한 것입니다)

이 때문에 체크 구독은 다른 자료와 달리 **로그인이 끝난 뒤에** 시작됩니다.
로그인 직후 잠깐 체크가 비어 보였다가 채워질 수 있는데 정상입니다.

## 점검

- 선생님 계정으로 로그인했을 때 **'승인을 기다리고 있습니다'** 가 뜨는지
- 관리자가 [설정] → 명단 · 승인 에서 승인하면 그분 화면이 **새로 고침 없이** 열리는지
- 승인 전에 개발자 도구를 열어 자료가 안 오는지 (와야 정상이 아닙니다)
- 선생님 컴퓨터와 휴대전화에서 각각 열어 같은 일정이 보이는지
- 교사 계정으로 등록했을 때 **확인 대기**로 들어가는지
- 관리자 계정에서 승인하면 교사 화면이 **새로 고치지 않아도** 바뀌는지
