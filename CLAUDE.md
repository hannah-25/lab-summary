# CLAUDE.md

이 파일은 Claude Code가 이 저장소에서 작업할 때 참고하는 프로젝트 안내서입니다.

## 실행 명령어

```powershell
node src\capture.mjs        # 개인 조회 (Chrome 열고 SRMS 직접 탐색)
node src\capture.mjs --micro  # 개인 조회 - 미생물 검사 모드
node src\batch.mjs          # 병동 일괄 조회 (ward-patients.txt 기반)
node src\batch.mjs --micro  # 병동 일괄 조회 - 미생물 검사 모드
node src\reprocess.mjs      # 마지막 수집 결과 재처리 (SRMS 재접속 없이)
node src\test.mjs           # 단위 테스트
```

`batch`는 이전 `capture` 실행 결과가 `%LOCALAPPDATA%\TrinityLabSummary\raw\`에 있어야 합니다 (API 요청 템플릿 추출 용도).

출력 결과: `%LOCALAPPDATA%\TrinityLabSummary\output\`  
원본 응답: `%LOCALAPPDATA%\TrinityLabSummary\raw\` (재처리용 보관)

## 아키텍처

파이프라인 4단계: **capture → extract → classify → report**

### Capture (`capture.mjs`, `batch.mjs`)

진입점 두 개, 출력 형식은 동일:

- **capture**: Playwright `context.on("response")`로 브라우저 네트워크 응답을 가로챔. 사용자가 SRMS를 탐색하는 동안 JSON 페이로드를 수집. `raw/capture-<timestamp>.json`에 저장.
- **batch**: `ward-patients.txt`에서 환자 이름을 읽고, 마지막 capture에서 추출한 요청 템플릿으로 `rstUserList.do`(환자 검색)와 `rstUserDtl.do`(상세 조회)에 직접 POST. `raw/batch-<timestamp>.json`에 저장.

두 모드 모두 `%LOCALAPPDATA%\TrinityLabSummary\srms-profile`에 Chrome 프로필을 유지해 로그인 세션을 재사용함.

### Extract (`extract.mjs`)

`extractLabRows(payload, sourceUrl)` — SRMS 응답의 중첩 JSON을 순회하며 검사 결과 행을 추출.
- 환자 메타데이터: `JNO` + `NAM`/`CHN`/`JN` 필드가 있는 객체
- 결과 행: `O_GCDN`(검사명) + `O_CHR`(결과값) 필드가 있는 객체
- 서술형 결과(배양 결과의 `CRST` 필드)는 `O_CHR`이 비어있는 행에 병합

행 구조: `{ patientJno, patientName, chartNo, accessionDate, code, internalCode, name, result, reference, flag, date, sample, parent, remark, sourceUrl }`

`parent` 필드는 그룹 헤더를 추적함. `result === "**"`인 행이 섹션 헤더이고, 이후 행들은 새 코드 행이 나올 때까지 해당 헤더를 `parent`로 상속.

### Classify (`classify.mjs`)

`classifyRows(rows)` — 행을 `blood | urine | sputum | stool | vre | bloodCulture | unclassified`로 분류.

분류 기준: `name + sample + parent + remark`에 정규식 적용. 우선순위: VRE/CRE → 객담 → 대변 → 혈액배양 → 소변 → 혈액. 미매칭은 `unclassified`.  
→ `미분류` 항목이 나오면 `src/classify.mjs` 상단의 정규식 상수를 수정.

`formatMicroSection`, `microItems` — 미생물 검사 포맷. 가장 최근 접수일만 필터링하고 섹션 헤더 제거.

### Report (`report.mjs`, `rules.mjs`)

`groupByPatient(rows)` — `chartNo` → `patientName` → `patientJno` 순으로 그룹화.

`buildPatientReport` — 텍스트 출력 생성.  
`buildPatientView` — `viewer-<timestamp>.json`용 구조화 JSON 생성.

`rules.mjs`의 혈액/UA 포맷 로직:
- `splitRecentAndPrevious(rows)` — `patientJno` 키 기준으로 최근 접수 2회를 분리 (폴백: `accessionDate`/`date`)
- `buildBloodSummary` — WBC, CRP, Na/K 항상 표시; BUN/Cr, OT/PT는 이상 수치 시 표시; `ABBR`로 표시명, `LAB_ORDER`로 순서 지정. Albumin ≥2 미만 `★` 접두사.
- `buildUaSummary` — 비정상(플래그 또는 참고치 이탈)인 UA 항목만 표시
- `shouldShowLab` — Glucose는 150 초과일 때만 표시

## 분류 수정 시 핵심 파일

`미분류` 결과 발생 시: `src/classify.mjs` 상단 정규식 상수 수정  
표시 항목/순서 변경 시: `src/rules.mjs`의 `ABBR`, `UA_ABBR`, `IGNORE`, `LAB_ORDER`, `UA_ORDER` 상수 수정
