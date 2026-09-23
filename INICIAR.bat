@echo off
chcp 65001 >nul
title Sorteo Creadores Beauty - SERVIDOR (no cerrar)
cd /d "%~dp0"

REM Usa node.exe de esta carpeta si existe (para notebooks sin Node instalado)
set "NODE=node"
if exist "%~dp0node.exe" set "NODE=%~dp0node.exe"

"%NODE%" -v >nul 2>&1
if errorlevel 1 (
  echo.
  echo  No se encontro Node.js.
  echo  Instala Node desde https://nodejs.org  o copia node.exe dentro de esta carpeta.
  echo.
  pause
  exit /b 1
)

REM Arranca el servidor en otra ventana (minimizada)
start "Servidor Sorteo - NO CERRAR" /min "%NODE%" "%~dp0server.js"
timeout /t 2 /nobreak >nul

REM Busca Chrome, si no usa Edge. Perfil propio dentro de la carpeta.
set "BROWSER="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "BROWSER=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

start "" "%BROWSER%" --kiosk http://localhost:3602 --user-data-dir="%~dp0browser-profile" --no-first-run --no-default-browser-check --autoplay-policy=no-user-gesture-required --overscroll-history-navigation=0 --disable-pinch --disable-features=Translate,TouchpadOverscrollHistoryNavigation --disable-session-crashed-bubble
exit
