@echo off
chcp 949 > nul
cd /d "%~dp0"
echo.
echo ==============================
echo       Lab Summary
echo ==============================
echo.
echo   [1]  개인 조회   -- 환자 이름 직접 입력
echo   [2]  병동 일괄   -- ward-patients.txt 사용
echo.
set /p choice=모드 선택 (1 또는 2): 
echo.
if "%choice%"=="1" (
    npm.cmd run capture
    goto end
)
if "%choice%"=="2" (
    npm.cmd run batch
    goto end
)
echo 잘못된 입력입니다. 1 또는 2를 입력하세요.
:end
echo.
pause