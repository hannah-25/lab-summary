#!/bin/bash

cd "$(dirname "$0")"

# --- node 확인 ---
if [ -f "./node" ]; then
    NODE="./node"
elif command -v node >/dev/null 2>&1; then
    NODE="node"
else
    echo ""
    echo "[오류] Node.js가 설치되어 있지 않습니다."
    echo "       https://nodejs.org 에서 설치 후 다시 실행하세요."
    echo ""
    read -rp "종료하려면 Enter를 누르세요..."
    exit 1
fi

# --- playwright-core 확인 ---
if [ ! -d "./node_modules/playwright-core" ]; then
    echo ""
    echo "패키지를 설치합니다 (최초 1회)..."
    echo ""
    npm install --prefix . playwright-core@1.60.0
    if [ $? -ne 0 ]; then
        echo ""
        echo "[오류] 패키지 설치에 실패했습니다."
        echo "       인터넷 연결을 확인하고 다시 시도하세요."
        echo ""
        read -rp "종료하려면 Enter를 누르세요..."
        exit 1
    fi
fi

# --- Chrome 확인 (macOS) ---
if [ ! -d "/Applications/Google Chrome.app" ] && [ ! -d "$HOME/Applications/Google Chrome.app" ]; then
    echo ""
    echo "[오류] Chrome이 설치되어 있지 않습니다."
    echo "       https://www.google.com/chrome 에서 설치 후 다시 실행하세요."
    echo ""
    read -rp "종료하려면 Enter를 누르세요..."
    exit 1
fi

show_mode_menu() {
    local mode=$1
    while true; do
        echo ""
        echo "  [1]  일반검사 / UA   -- 혈액, 뇨 검사 결과 (최근 2회)"
        echo "  [2]  미생물 검사     -- 객담, VRE/CRE 등 (최근 30일)"
        echo ""
        read -rp "검사 종류 선택 (1 또는 2): " sub
        echo ""

        if [ "$mode" = "personal" ]; then
            case "$sub" in
                1) "$NODE" src/capture.mjs; return;;
                2) "$NODE" src/capture.mjs --micro; return;;
                *) echo "잘못된 입력입니다. 1 또는 2를 입력하세요.";;
            esac
        else
            case "$sub" in
                1) "$NODE" src/batch.mjs; return;;
                2) "$NODE" src/batch.mjs --micro; return;;
                *) echo "잘못된 입력입니다. 1 또는 2를 입력하세요.";;
            esac
        fi
    done
}

while true; do
    echo ""
    echo "=============================="
    echo "       Lab Summary"
    echo "=============================="
    echo ""
    echo "  [1]  개인 조회   -- 환자 이름 직접 입력"
    echo "  [2]  병동 조회   -- ward-patients.txt 사용"
    echo ""
    read -rp "조회 방법 선택 (1 또는 2): " choice
    echo ""

    case "$choice" in
        1) show_mode_menu "personal"; break;;
        2) show_mode_menu "ward"; break;;
        *) echo "잘못된 입력입니다. 1 또는 2를 입력하세요.";;
    esac
done

echo ""
read -rp "종료하려면 Enter를 누르세요..."
