# CLAUDE.md

이 파일은 Claude Code가 이 저장소에서 작업할 때 참고하는 프로젝트 안내서입니다.

이 저장소는 SRMS(검사결과관리시스템) 검사 결과를 수집·요약하는 **크롬 익스텐션(MV3)** 프로젝트입니다. 코드는 전부 `extension/`에 있고 빌드 단계가 없습니다 — 파일을 수정한 뒤 `chrome://extensions`에서 새로고침(⟳)하면 반영됩니다.

> 이전의 Playwright 기반 CLI 파이프라인(`src/capture.mjs`, `src/batch.mjs` 등)은 `legacy-pipeline` 브랜치에 보관되어 있습니다. 병동 일괄 조회 기능은 익스텐션으로 이식하지 않기로 했으므로, 관련 요청이 오면 해당 브랜치를 안내하세요.

## 검증 명령어

```powershell
node extension\verify.mjs   # 추출·필터·감시(monitor) 로직 검증 (자체 픽스처 사용)
```

CLI와의 출력 패리티를 검증하던 `verify-blood.mjs`/`verify-view.mjs`는 이식 완료 후 `legacy-pipeline` 브랜치로 보냈습니다 (로컬 raw 캡처 + CLI 코드 필요).

## 아키텍처

두 기능이 한 팝업의 두 탭으로 제공됩니다:

- **기타검사 감시** — 감시 환자 목록을 알람 주기로 폴링해, 혈액/UA를 제외한 검사(객담·대변·VRE/CRE·혈액배양·미분류)에 새 결과가 생기면 크롬 알림
- **혈액 / UA 조회** — 여러 환자의 최근 2회 접수를 비교한 혈액·UA 요약을 온디맨드 생성, 뷰어 창(`viewer.html`)에 표시

### 요청 양식 수집

익스텐션은 SRMS API(`rstUserList.do` 환자 검색, `rstUserDtl.do` 상세 조회)에 직접 POST합니다. 요청 양식(파라미터 템플릿)은 사용자가 SRMS에서 검사결과 목록을 한 번 조회할 때 캡처합니다:

`inject.js`(MAIN world, fetch/XHR 후킹) → `content.js`(ISOLATED, 브릿지) → `background.js`(storage 저장)

### 파일 구성 (`extension/`)

| 파일 | 역할 |
|------|------|
| `manifest.json` | MV3 설정 (storage/alarms/notifications, srms 호스트 권한) |
| `background.js` | 알람 스케줄, 감시 실행, 알림·배지, 메시지 핸들러. 자동 점검 시간대는 상단 `WINDOW_START_MIN`/`WINDOW_END_MIN`/`STEP_MIN` |
| `popup.html/js/css` | 2탭 UI (감시 환자 관리 / 혈액·UA 조회) |
| `viewer.html/js/css` | 혈액/UA 결과 뷰어 창. 편집 가능, "전체 결과 생성"으로 복사 |
| `lib/srms.js` | fetch 기반 목록/상세 조회, STS(검사 상태) 판정 |
| `lib/monitor.js` | STS diff로 신규 결과 판정, 기준선 저장 (최초 관찰은 알림 없음) |
| `lib/lookup.js` | 혈액/UA 온디맨드 수집 |
| `lib/extract.js` | 상세 응답의 중첩 JSON → 검사 행 추출 |
| `lib/classify.js` | 행 분류 + 감시용 혈액/UA 제외 필터 |
| `lib/rules.js` | 혈액/UA 요약 포맷 규칙 |
| `lib/report.js` | 환자별 리포트 및 뷰어용 구조체(`buildPatientView`) 생성 |
| `dev-local.js` | (선택, git 미추적) 존재하면 팝업이 로드하는 로컬 개발 도구 |

### Extract (`lib/extract.js`)

`extractLabRows(payload, sourceUrl)` — SRMS 응답의 중첩 JSON을 순회하며 검사 결과 행을 추출.
- 환자 메타데이터: `JNO` + `NAM`/`CHN`/`JN` 필드가 있는 객체
- 결과 행: `O_GCDN`(검사명) + `O_CHR`(결과값) 필드가 있는 객체
- 서술형 결과(배양 결과의 `CRST` 필드)는 `O_CHR`이 비어있는 행에 병합

`parent` 필드는 그룹 헤더를 추적함. `result === "**"`인 행이 섹션 헤더이고, 이후 행들은 새 코드 행이 나올 때까지 해당 헤더를 `parent`로 상속.

### Classify (`lib/classify.js`)

`classifyRows(rows)` — 행을 `blood | urine | sputum | stool | vre | bloodCulture | unclassified`로 분류.

분류 기준: `name + sample + parent + remark`에 정규식 적용. 우선순위: VRE/CRE → 객담 → 대변 → 혈액배양 → 소변 → 혈액. 미매칭은 `unclassified`.

### Report / Rules (`lib/report.js`, `lib/rules.js`)

- `splitRecentAndPrevious(rows)` — `patientJno` 키 기준으로 최근 접수 2회를 분리 (폴백: `accessionDate`/`date`)
- `buildBloodSummary` — WBC, CRP, Na/K 항상 표시; BUN/Cr, OT/PT는 이상 수치 시 표시; `ABBR`로 표시명, `LAB_ORDER`로 순서 지정. Albumin 2 미만 `★` 접두사.
- `buildUaSummary` — 비정상(플래그 또는 참고치 이탈)인 UA 항목만 표시
- `shouldShowLab` — Glucose는 150 초과일 때만 표시

## 자주 쓰는 수정

**`미분류` 결과 발생 시** → `extension/lib/classify.js` 상단 정규식 상수 수정
**표시 항목/순서 변경 시** → `extension/lib/rules.js`의 `ABBR`, `UA_ABBR`, `IGNORE`, `LAB_ORDER`, `UA_ORDER` 상수 수정

수정 후 `node extension\verify.mjs`를 돌리고, 뷰어 창에서 실제 조회 결과로 포맷을 확인하세요.
