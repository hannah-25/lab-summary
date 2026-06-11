[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location $PSScriptRoot

# --- node.exe 확인 ---
if (-not (Test-Path ".\node.exe")) {
    Write-Host ""
    Write-Host "[오류] node.exe 파일이 없습니다."
    Write-Host "       폴더가 완전히 복사되었는지 확인하세요."
    Write-Host ""
    Read-Host "종료하려면 Enter를 누르세요"
    exit 1
}
$NODE = ".\node.exe"

# --- playwright-core 확인 ---
if (-not (Test-Path ".\node_modules\playwright-core")) {
    Write-Host ""
    Write-Host "[오류] node_modules\playwright-core 폴더가 없습니다."
    Write-Host "       폴더가 완전히 복사되었는지 확인하세요."
    Write-Host ""
    Read-Host "종료하려면 Enter를 누르세요"
    exit 1
}

# --- Chrome 확인 ---
$pf86 = [System.Environment]::GetEnvironmentVariable("ProgramFiles(x86)")
$chromePaths = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "$pf86\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
if (-not ($chromePaths | Where-Object { Test-Path $_ })) {
    Write-Host ""
    Write-Host "[오류] Chrome이 설치되어 있지 않습니다."
    Write-Host "       https://www.google.com/chrome 에서 설치 후 다시 실행하세요."
    Write-Host ""
    Read-Host "종료하려면 Enter를 누르세요"
    exit 1
}

function Show-ModeMenu($mode) {
    while ($true) {
        Write-Host ""
        Write-Host "  [1]  일반검사 / UA   -- 혈액, 뇨 검사 결과 (최근 2회)"
        Write-Host "  [2]  미생물 검사     -- 객담, VRE/CRE 등 (최근 30일)"
        Write-Host ""
        $sub = Read-Host "검사 종류 선택 (1 또는 2)"
        Write-Host ""

        if ($mode -eq "personal") {
            switch ($sub) {
                "1" { & $NODE src\capture.mjs; return }
                "2" { & $NODE src\capture.mjs --micro; return }
                default { Write-Host "잘못된 입력입니다. 1 또는 2를 입력하세요." }
            }
        } else {
            switch ($sub) {
                "1" { & $NODE src\batch.mjs; return }
                "2" { & $NODE src\batch.mjs --micro; return }
                default { Write-Host "잘못된 입력입니다. 1 또는 2를 입력하세요." }
            }
        }
    }
}

while ($true) {
    Write-Host ""
    Write-Host "=============================="
    Write-Host "       Lab Summary"
    Write-Host "=============================="
    Write-Host ""
    Write-Host "  [1]  개인 조회   -- 환자 이름 직접 입력"
    Write-Host "  [2]  병동 조회   -- ward-patients.txt 사용"
    Write-Host ""
    $choice = Read-Host "조회 방법 선택 (1 또는 2)"
    Write-Host ""

    switch ($choice) {
        "1" { Show-ModeMenu "personal"; break }
        "2" { Show-ModeMenu "ward"; break }
        default { Write-Host "잘못된 입력입니다. 1 또는 2를 입력하세요." }
    }
    if ($choice -eq "1" -or $choice -eq "2") { break }
}

Write-Host ""
Read-Host "종료하려면 Enter를 누르세요"
