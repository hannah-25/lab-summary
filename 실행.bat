@echo off
chcp 949 > nul
setlocal

cd /d "%~dp0"

rem --- node.exe 확인 ---
if exist "%~dp0node\node.exe" (
    set "NODE=%~dp0node\node.exe"
) else (
    echo.
    echo [오류] node\node.exe 파일이 없습니다.
    echo        폴더가 완전히 복사되었는지 확인하세요.
    echo.
    pause
    exit /b 1
)

rem --- playwright-core 확인 ---
if not exist "%~dp0node_modules\playwright-core" (
    echo.
    echo [오류] node_modules\playwright-core 폴더가 없습니다.
    echo        폴더가 완전히 복사되었는지 확인하세요.
    echo.
    pause
    exit /b 1
)

:main
echo.
echo ==============================
echo       Lab Summary
echo ==============================
echo.
echo   [1]  개인 조회   -- 환자 이름 직접 입력
echo   [2]  병동 조회   -- ward-patients.txt 사용
echo.
set /p choice=조회 방법 선택 (1 또는 2):
echo.

if "%choice%"=="1" goto personal
if "%choice%"=="2" goto ward
echo 잘못된 입력입니다. 1 또는 2를 입력하세요.
goto main

:personal
echo.
echo   [1]  일반검사 / UA   -- 혈액, 뇨 검사 결과 (최근 2회)
echo   [2]  미생물 검사     -- 객담, VRE/CRE 등 (최근 30일)
echo.
set /p subChoice=검사 종류 선택 (1 또는 2):
echo.
if "%subChoice%"=="1" (
    "%NODE%" src\capture.mjs
    if errorlevel 1 echo [오류] 프로그램이 비정상 종료되었습니다. 위 오류 메시지를 확인하세요.
    goto end
)
if "%subChoice%"=="2" (
    "%NODE%" src\capture.mjs --micro
    if errorlevel 1 echo [오류] 프로그램이 비정상 종료되었습니다. 위 오류 메시지를 확인하세요.
    goto end
)
echo 잘못된 입력입니다. 1 또는 2를 입력하세요.
goto personal

:ward
echo.
echo   [1]  일반검사 / UA   -- 혈액, 뇨 검사 결과 (최근 2회)
echo   [2]  미생물 검사     -- 객담, VRE/CRE 등 (최근 30일)
echo.
set /p subChoice=검사 종류 선택 (1 또는 2):
echo.
if "%subChoice%"=="1" (
    "%NODE%" src\batch.mjs
    if errorlevel 1 echo [오류] 프로그램이 비정상 종료되었습니다. 위 오류 메시지를 확인하세요.
    goto end
)
if "%subChoice%"=="2" (
    "%NODE%" src\batch.mjs --micro
    if errorlevel 1 echo [오류] 프로그램이 비정상 종료되었습니다. 위 오류 메시지를 확인하세요.
    goto end
)
echo 잘못된 입력입니다. 1 또는 2를 입력하세요.
goto ward

:end
echo.
pause
