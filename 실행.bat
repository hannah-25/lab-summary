@echo off
chcp 949 > nul
cd /d "%~dp0"
if exist "%~dp0node\node.exe" (
    set PATH=%~dp0node;%PATH%
) else (
    node --version >nul 2>&1
    if errorlevel 1 (
        echo.
        echo [오류] Node.js를 찾을 수 없습니다.
        echo        배포 패키지에 node\ 폴더가 포함되어 있어야 합니다.
        echo.
        pause
        exit /b 1
    )
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
echo   [2]  미생물 검사     -- 균, VRE/CRE 등 (최근 30일)
echo.
set /p subChoice=검사 종류 선택 (1 또는 2): 
echo.
if "%subChoice%"=="1" (
    npm.cmd run capture
    goto end
)
if "%subChoice%"=="2" (
    npm.cmd run capture-micro
    goto end
)
echo 잘못된 입력입니다. 1 또는 2를 입력하세요.
goto personal

:ward
echo.
echo   [1]  일반검사 / UA   -- 혈액, 뇨 검사 결과 (최근 2회)
echo   [2]  미생물 검사     -- 균, VRE/CRE 등 (최근 30일)
echo.
set /p subChoice=검사 종류 선택 (1 또는 2): 
echo.
if "%subChoice%"=="1" (
    npm.cmd run batch
    goto end
)
if "%subChoice%"=="2" (
    npm.cmd run batch-micro
    goto end
)
echo 잘못된 입력입니다. 1 또는 2를 입력하세요.
goto ward

:end
echo.
pause
