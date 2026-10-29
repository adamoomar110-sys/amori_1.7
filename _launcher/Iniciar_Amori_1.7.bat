@echo off
chcp 65001 >nul
title Amori 1.7 - Aura Ediciones
for %%I in ("%~dp0..") do set "RAIZ=%%~fI"
for %%I in ("%~dp0..\..\amori\backend\venv\Scripts\python.exe") do set "PY=%%~fI"
set "PYTHONPATH=%~dp0"

set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

if not exist "%PY%" (
    echo [ERROR] No se encontro el entorno Python en: "%PY%"
    pause
    exit /b 1
)

if not exist "%RAIZ%\frontend\dist\index.html" (
    echo Compilando interfaz de Amori 1.7 por primera vez...
    pushd "%RAIZ%\frontend"
    call npm install --no-audit --no-fund
    call npm run build
    popd
)

:: Verificar si el servidor ya esta corriendo en 127.0.0.1:8000
curl.exe -s -o NUL --max-time 1 "http://127.0.0.1:8000/library" >nul 2>&1
if %errorlevel%==0 (
    echo Amori 1.7 ya esta activo. Abriendo ventana...
    if exist "%CHROME%" (
        start "" "%CHROME%" --app="http://127.0.0.1:8000"
    ) else (
        start "" "http://127.0.0.1:8000"
    )
    exit /b 0
)

echo ============================================================
echo   AMORI 1.7 - Lector Inmersivo de Libros y Audiolibros
echo   URL Local: http://127.0.0.1:8000
echo   (c) 2026 Aura - Omar Horacio Adamo
echo ============================================================
echo.
echo Iniciando servidor local... (Cerra esta ventana cuando termines de leer)

cd /d "%RAIZ%\backend"

if exist "%CHROME%" (
    start "" /min cmd /c "for /L %%n in (1,1,15) do @(curl.exe -s -o NUL --max-time 1 http://127.0.0.1:8000/library >nul 2>&1 && (start """" ""%CHROME%"" --app=http://127.0.0.1:8000 & exit /b) || timeout /t 1 /nobreak >nul)"
) else (
    start "" /min cmd /c "timeout /t 4 /nobreak >nul & start """" http://127.0.0.1:8000"
)

"%PY%" -m uvicorn main:app --host 127.0.0.1 --port 8000
pause
