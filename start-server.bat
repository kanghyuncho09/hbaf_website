@echo off
chcp 65001 >nul
cd /d "%~dp0"
title HBAF 사내 포털 서버

if not exist "node_modules" (
  echo [1/2] 처음 실행이라 필요한 패키지를 설치합니다. 잠시만 기다려주세요...
  call npm install
  if errorlevel 1 (
    echo.
    echo 패키지 설치 중 오류가 발생했습니다. 위 내용을 확인해 주세요.
    pause
    exit /b 1
  )
)

echo [2/2] 서버를 시작합니다...
start "" "http://localhost:3000"
echo.
echo 브라우저가 자동으로 열리지 않으면 주소창에 http://localhost:3000 을 직접 입력해 접속하세요.
echo 이 창을 닫으면 서버가 종료됩니다. (창을 닫기 전까지는 계속 켜둔 상태로 두세요)
echo.
call npm start

echo.
echo 서버가 종료되었습니다. 위에 오류 메시지가 있는지 확인해 주세요.
pause
