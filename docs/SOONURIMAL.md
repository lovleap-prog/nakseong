# 순우리말 낱말 사전 (2학년 수업공개용)

`app/soonurimal/index.html` 한 파일로 된 작은 사전 앱입니다. 활동지에 나온 순우리말 19개만 찾아집니다.

- 주소: 사이트 주소 뒤에 `/soonurimal/` (예: `https://lovleap-prog.github.io/class/soonurimal/`) — 학생 기기에는 QR 코드로 나눠 주세요.
- 바로 열어 보기: `cd app && python3 -m http.server 8000` → `http://localhost:8000/soonurimal/`
- 낱말·뜻풀이 고치기: 파일 안 `WORDS` 목록만 고치면 됩니다.
- 찾은 낱말 도장은 학생 기기(브라우저)에만 저장됩니다.

## 선생님 확인 필요
- **아리아**, **아라**는 표준국어대사전에 없는 낱말입니다. 활동지에 적은 뜻과 다르면 `WORDS`의 `mean` 을 고치세요. (`note` 에 근거를 적어 두었습니다.)
