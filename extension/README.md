# Lab Summary Monitor (크롬 익스텐션)

팝업에 두 개의 탭이 있습니다.

- **기타검사 감시** — 지정 환자의 기타검사(혈액/UA 제외)에 새 결과가 나오면 **크롬 알림**으로 알려줌 (자동 폴링)
- **혈액 / UA 조회** — 여러 환자의 혈액·UA 요약을 그 자리에서 조회 (개인 조회 `capture.mjs` 의 익스텐션 버전, 온디맨드)

로직(`extract`/`classify`/`rules`/`report`)은 이전 Playwright CLI에서 그대로 이식했습니다. CLI 파이프라인(병동 일괄 조회 포함)은 `legacy-pipeline` 브랜치에 보관되어 있습니다.

## 설치 (개발자 모드)

1. 크롬 주소창에 `chrome://extensions` 입력
2. 우측 상단 **개발자 모드** 켜기
3. **압축 해제된 확장 프로그램을 로드** 클릭 → 이 `extension` 폴더 선택

## 첫 사용 (양식 1회 수집)

익스텐션이 SRMS에 조회하려면 요청 양식을 한 번 확보해야 합니다.

1. SRMS(`srms.seegenemedical.com`)에 **로그인**
2. **검사결과 목록을 한 번 조회** → 익스텐션이 조회 양식을 자동 수집·저장
   (팝업 상태줄이 "양식 수집됨 ✓"으로 바뀜)

이후에는 로그인 세션이 살아있는 한 다시 할 필요 없습니다.

## 사용

익스텐션 아이콘 클릭 → 팝업 상단 탭에서 기능 선택.

### 기타검사 감시 탭

- **감시 환자** 추가/삭제 (이름 뒤 숫자가 있으면 그대로 입력: 예 `홍길동2`)
- **지금 확인** — 즉시 1회 점검 (시간대와 무관하게 수동 실행)
- **최근 새 결과** — 감지된 신규 기타검사 결과 목록

### 혈액 / UA 조회 탭

- 환자 이름을 **쉼표 또는 줄바꿈**으로 여러 명 입력
- **최근 N일**(기본 60) 범위에서 최근 2회 접수를 비교해 요약
- **조회**하면:
  - 팝업에 텍스트 요약이 뜨고,
  - **예쁜 뷰어 창이 자동으로 새로 열립니다** (기존 CLI 의 HTML 뷰어와 동일).
- 출력 형식·계산은 기존 CLI 개인 조회와 **동일**합니다.

### 뷰어 창 (viewer.html)

조회하면 자동으로 열리는 독립 창입니다.

- 상단 **환자 드롭다운** (오늘 결과 / 이전 결과 그룹)
- 환자별 **피검사 / UA / Sputum / Stool / VRE·CRE / Blood culture** 섹션 (내용 없으면 숨김) — **직접 편집 가능**
- **전체 결과 생성** → 편집한 내용을 한 번에 모아 **복사** (이름·검사일 헤더 없이 결과만)
- 창을 열어둔 채 다시 조회하면 **같은 창이 새 결과로 갱신**됩니다.

## 자동 감시 시간

**매시 정각** 자동 점검하고, **매일 06:00 ~ 06:30은 10분 간격**(06:00 · 06:10 · 06:20 · 06:30)으로 추가 점검합니다.
그 외 시간에는 "지금 확인" 버튼으로 수동 점검할 수 있습니다.

> 변경하려면 `background.js` 상단의 `WINDOW_START_MIN` / `WINDOW_END_MIN` / `STEP_MIN` 수정.

## 동작 원리

1. 지정 환자의 검사 목록(`rstUserList`)을 조회
2. 각 검사(JNO)의 상태(`STS`)를 이전 값과 비교
   - `1 검사중` → `2 완료` / `4 중간보고` 로 바뀌면 **새 결과**
   - 최초 관찰은 기준선으로만 기록(알림 없음) → 과거 결과 무더기 알림 방지
3. 새 결과만 상세(`rstUserDtl`) 조회 → `extract` → `classify`
4. **혈액/UA를 제외한 항목**(객담·대변·VRE/CRE·혈액배양·미분류)만 알림

## 제약 / 알아둘 점

- **크롬이 켜져 있고 SRMS에 로그인된 상태**에서만 감시됩니다. 크롬을 닫으면 감시도 멈춥니다.
- 세션 만료 시 "SRMS 로그인 필요" 알림이 뜹니다 → 다시 로그인하세요.
- 개발자 모드 확장은 **자동 업데이트가 없습니다.** 코드 수정 후 `chrome://extensions`에서 새로고침(⟳) 하세요.
- 배양 검사는 완료 상태여도 결과 텍스트가 "MM/DD 보고예정"으로 표시될 수 있습니다(중간 단계). 최종값은 다음 완료 시 갱신됩니다.

## 파일 구성

```
manifest.json     MV3 설정 (storage/alarms/notifications, srms 호스트 권한)
inject.js         (MAIN world) SRMS fetch/XHR 후킹 → 조회 양식 캡처
content.js        (ISOLATED) 양식을 background로 전달하는 브릿지
background.js     알람 스케줄·감시 실행·알림·배지, 메시지 핸들러
popup.html/js/css 감시 환자 관리 및 조회 UI (2탭)
viewer.html/js/css 혈액/UA 결과 뷰어 창 (CLI lab-summary.html 이식)
trinity-logo.svg  뷰어 로고
lab-mascot.png    뷰어 마스코트
lib/extract.js    상세 응답 → 검사 행 추출 (CLI에서 이식)
lib/classify.js   분류 + 혈액/UA 제외 필터 + 요약
lib/rules.js      혈액/UA 요약 포맷 (CLI rules.mjs 이식)
lib/report.js     환자별 혈액/UA 리포트 생성 (CLI report.mjs 이식)
lib/lookup.js     혈액/UA 온디맨드 수집 (capture.mjs blood 경로 이식)
lib/report.js 의 buildPatientView 가 뷰어용 구조체 생성
lib/srms.js       fetch 기반 목록/상세 조회, STS 판정
lib/monitor.js    STS diff 신규 판정, 상태 저장
verify.mjs        추출·필터·감시 로직 검증 (node extension/verify.mjs)
```
