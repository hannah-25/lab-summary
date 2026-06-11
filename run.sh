#!/bin/bash

cd "$(dirname "$0")"

# --- node 확인 ---
if [ -f "./node" ]; then
    NODE="./node"
else
    echo ""
    echo "[오류] node 파일이 없습니다."
    echo "       폴더가 완전히 복사되었는지 확인하세요."
    echo ""
    read -p "종료하려면 Enter를 누르세요..."
    exit 1
fi

# --- playwright-core 확인 ---
if [ ! -d "./node_modules/playwright-core" ]; then
    echo ""
    echo "[오류] node_modules/playwright-core 폴더가 없습니다."
    echo "       폴더가 완전히 복사되었는지 확인하세요."
    echo ""
    read -p "종료하려면 Enter를 누르세요..."
    exit 1
fi

# --- Chrome 확인 (macOS) ---
CHROME_FOUND=""
if [ -f "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
    CHROME_FOUND=1
fi
if [ -z "$CHROME_FOUND" ]; then
    echo ""
    echo "[오류] Chrome이 설치되어 있지 않습니다."
    echo "       https://www.google.com/chrome 에서 설치 후 다시 실행하세요."
    echo ""
    read -p "종료하려면 Enter를 누르세요..."
    exit 1
fi

main_menu() {
    while true; do
        echo ""
        echo "=============================="
        echo "       Lab Summary"
        echo "=============================="
        echo ""
        echo "  [1]  개인 조회   -- 환자 이름 직접 입력"
        echo "  [2]  병동 조회   -- ward-patients.txt 사용"
        echo ""
        read -p "조회 방법 선택 (1 또는 2): " choice
        echo ""

        case "$choice" in
            1) mode_menu "personal"; return;;
            2) mode_menu "ward"; return;;
            *) echo "잘못된 입력입니다. 1 또는 2를 입력하세요.";;
        esac
    done
}

mode_menu() {
    local mode=$1
    while true; do
        echo ""
        echo "  [1]  일반검사 / UA   -- 혈액, 뇨 검사 결과 (최근 2회)"
        echo "  [2]  미생물 검사     -- 객담, VRE/CRE 등 (최근 30일)"
        echo ""
        read -p "검사 종류 선택 (1 또는 2): " subChoice
        echo ""

        if [ "$mode" = "personal" ]; then
            case "$subChoice" in
                1) "$NODE" src/capture.mjs || echo "[오류] 프로그램이 비정상 종료되었습니다. 위 오류 메시지를 확인하세요."; break;;
                2) "$NODE" src/capture.mjs --micro || echo "[오류] 프로그램이 비정상 종료되었습니다. 위 오류 메시지를 확인하세요."; break;;
                *) echo "잘못된 입력입니다. 1 또는 2를 입력하세요.";;
            esac
        else
            case "$subChoice" in
                1) "$NODE" src/batch.mjs || echo "[오류] 프로그램이 비정상 종료되었습니다. 위 오류 메시지를 확인하세요."; break;;
                2) "$NODE" src/batch.mjs --micro || echo "[오류] 프로그램이 비정상 종료되었습니다. 위 오류 메시지를 확인하세요."; break;;
                *) echo "잘못된 입력입니다. 1 또는 2를 입력하세요.";;
            esac
        fi
    done
}

main_menu

echo ""
read -p "종료하려면 Enter를 누르세요..."
