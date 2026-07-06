# Lab Summary

SRMS(검사결과관리시스템)의 환자 검사 결과를 수집·요약하는 **크롬 익스텐션**입니다.

- **기타검사 감시** — 지정 환자의 기타검사(혈액/UA 제외)에 새 결과가 나오면 크롬 알림 (자동 폴링)
- **혈액 / UA 조회** — 여러 환자의 혈액·UA 요약을 온디맨드 조회 + 뷰어 창

설치·사용법·동작 원리는 [`extension/README.md`](extension/README.md)를 보세요.

## 빠른 시작

1. `chrome://extensions` → 개발자 모드 켜기 → **압축 해제된 확장 프로그램을 로드** → `extension` 폴더 선택
2. SRMS(`srms.seegenemedical.com`) 로그인 후 검사결과 목록을 한 번 조회 (요청 양식 자동 수집)
3. 익스텐션 아이콘 클릭 → 탭에서 기능 선택

## 참고

이전의 Playwright 기반 CLI 파이프라인(개인 조회 `capture.mjs`, 병동 일괄 조회 `batch.mjs` 등)은 `legacy-pipeline` 브랜치에 보관되어 있습니다. 병동 일괄 조회가 필요하면 해당 브랜치를 사용하세요.
