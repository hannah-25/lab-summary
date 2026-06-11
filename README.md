# Lab Summary

SRMS(검사결과관리시스템)에서 환자 검사 결과를 자동으로 수집하고 요약 정리하는 도구입니다.

## 빠른 시작

`run.bat`을 더블클릭하면 메뉴가 뜹니다.

```
[1] 개인 조회 — 환자 이름 직접 입력
[2] 병동 조회 — ward-patients.txt 기반 일괄 조회
```

각 모드에서 검사 종류를 선택합니다.

```
[1] 일반검사 / UA   — 혈액, 뇨 검사 요약 (최근 2회)
[2] 미생물 검사     — 배양, VRE/CRE 등 (최근 30일)
```

## 요구 사항

- Google Chrome (설치 경로 자동 탐지)
- `node.exe` (프로젝트 루트에 위치)
- `node_modules/playwright-core` (프로젝트 루트에 위치)

## 명령어 (직접 실행)

```powershell
node src\capture.mjs          # 개인 조회
node src\capture.mjs --micro  # 개인 조회 - 미생물 검사 모드
node src\batch.mjs            # 병동 일괄 조회
node src\batch.mjs --micro    # 병동 일괄 조회 - 미생물 검사 모드
node src\reprocess.mjs        # 마지막 수집 결과 재처리 (SRMS 재접속 없이)
node src\test.mjs             # 단위 테스트
```

`batch`는 이전 `capture` 실행 결과(`%LOCALAPPDATA%\TrinityLabSummary\raw\`)가 있어야 합니다.

## 병동 조회 설정

`ward-patients.txt`에 환자 이름을 한 줄씩 입력합니다.

```
홍길동
김철수
이영희
```

## 출력 위치

| 경로 | 내용 |
|------|------|
| `%LOCALAPPDATA%\TrinityLabSummary\output\` | 요약 텍스트 및 뷰어 JSON |
| `%LOCALAPPDATA%\TrinityLabSummary\raw\` | 원본 응답 (재처리용) |

## 아키텍처

```
capture / batch  →  extract  →  classify  →  report
```

| 단계 | 파일 | 역할 |
|------|------|------|
| Capture | `capture.mjs`, `batch.mjs` | SRMS 응답 수집 |
| Extract | `extract.mjs` | 중첩 JSON에서 검사 행 추출 |
| Classify | `classify.mjs` | 혈액/소변/객담/대변/배양/VRE 분류 |
| Report | `report.mjs`, `rules.mjs` | 텍스트 요약 및 JSON 생성 |

Chrome 프로필은 `%LOCALAPPDATA%\TrinityLabSummary\srms-profile`에 저장되어 로그인 세션을 재사용합니다.

## 자주 쓰는 수정

**미분류 항목이 생겼을 때** → `src/classify.mjs` 상단 정규식 수정

**표시 항목·순서 변경** → `src/rules.mjs`의 `ABBR`, `UA_ABBR`, `LAB_ORDER`, `UA_ORDER` 상수 수정
