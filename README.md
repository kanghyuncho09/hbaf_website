# HBAF 사내 공용업무 포털

회의실/법인차량 예약, 공지 게시판, 바프·베프 병원 기록, 미니게임을 담은 사내 인트라넷.
HTML/CSS/JS(순수, 프레임워크 없음) + Node.js(Express) 서버, 데이터는 로컬 JSON 파일에 저장합니다.

## 로컬에서 실행하기

```bash
npm install
npm start
```

브라우저에서 `http://localhost:3000` 접속. (Windows에서는 [start-server.bat](start-server.bat) 더블클릭으로도 실행됩니다.)

## 관리자 비밀번호

`data/admin-config.json`은 **git에 올라가지 않습니다** (저장소가 Public이라 비밀번호가
코드에 남으면 안 되기 때문). 대신:

- 로컬에서 서버를 처음 실행하면 파일이 없을 경우 랜덤 비밀번호를 만들어서
  터미널에 한 번 출력해줍니다 (`[관리자 비밀번호 생성됨] ...`). 이후에는
  `data/admin-config.json`의 `password` 값을 원하는 문자열로 직접 바꾸면 됩니다
  (재시작 불필요, 다음 로그인부터 바로 적용).
- 배포 환경(Render 등)에서는 `ADMIN_PASSWORD` 환경변수를 설정하세요. 설정돼 있으면
  파일보다 항상 우선 적용됩니다 — 저장소가 Public이어도 실제 비밀번호는 절대
  코드/깃허브에 노출되지 않습니다.

## GitHub에 올리기

```bash
git remote add origin <GitHub에서 만든 저장소 URL>
git push -u origin master
```

저장소를 Public으로 두셔도 됩니다. `data/cleaning-schedule.json`(부서명 등)은
공개돼도 무방한 정보라 그대로 커밋되어 있고, 관리자 비밀번호는 위처럼 git에 아예
포함되지 않도록 이미 빠져있습니다. **배포하기 전에 Render의 `ADMIN_PASSWORD`
환경변수를 꼭 설정**해서 실제 관리자 비밀번호를 정해주세요.

## Render에 배포하기

**방법 A — 대시보드에서 직접 (제일 쉬움)**

1. [render.com](https://render.com) 로그인 → New → Web Service
2. GitHub 저장소 연결 후 이 저장소 선택
3. 설정値:
   - Environment: **Node**
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Environment 탭에서 `ADMIN_PASSWORD` 변수 추가 (원하는 비밀번호로)
5. Create Web Service → 몇 분 뒤 `https://<이름>.onrender.com` 으로 접속 가능

**방법 B — render.yaml 블루프린트로 한 번에**

저장소에 [render.yaml](render.yaml)이 포함되어 있어서, Render 대시보드에서
New → Blueprint → 이 저장소 선택하면 위 설정이 자동으로 적용됩니다.
배포 중 `ADMIN_PASSWORD` 값을 입력하라는 창이 뜹니다.

### ⚠️ 데이터 보존 관련 중요 안내

이 앱은 예약/게시글/게임 점수 등을 **로컬 JSON 파일**에 저장합니다. Render 무료 플랜은
디스크가 배포될 때마다(= git push해서 재배포할 때마다) 초기화되기 때문에,
**재배포하면 그동안 쌓인 예약/게시글/점수 등이 전부 사라집니다.** (청소분담표처럼 코드에
커밋된 값은 재배포해도 그대로 다시 생성됩니다.) 관리자 비밀번호는 `ADMIN_PASSWORD`
환경변수를 설정해두지 않으면 재배포마다 랜덤하게 새로 생성되어 매번 바뀌니, Render에서는
**꼭 `ADMIN_PASSWORD` 환경변수를 설정**해서 비밀번호가 고정되게 해주세요.

계속 보존하고 싶다면:
1. Render에서 유료 플랜(Starter 이상)으로 전환
2. 해당 서비스에 **Disk** 추가 (Mount Path 예: `/var/data`)
3. 환경변수 `DATA_DIR=/var/data` 추가 (render.yaml에 주석으로 예시 있음)

이렇게 하면 서버가 그 디스크 안에 데이터를 저장해서 재배포해도 유지됩니다.

## 기술 스택 / 구조

- `server.js` — Express 서버, 정적 파일 서빙 + REST API
- `db.js` — JSON 파일 기반 간단한 데이터 계층
- `public/` — 프론트엔드 (HTML/CSS/JS, 프레임워크 없이 순수 구현)
- `data/` — 데이터 저장 폴더 (예약/게시글 등은 `.gitignore`로 git 추적 제외, 서버가 최초
  실행 시 자동 생성)
