@echo off
echo Cleaning up previous processes...
taskkill /F /IM python.exe /T >nul 2>&1
taskkill /F /IM ngrok.exe /T >nul 2>&1
timeout /t 2 >nul

echo Starting Amori Server + Ngrok Tunnel...

cd /d "%~dp0"

:: Check if start_app.py exists
if not exist "start_app.py" (
    echo Error: start_app.py not found!
    pause
    exit /b
)

python start_app.py
pause
