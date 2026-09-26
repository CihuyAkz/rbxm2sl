@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18+ tidak ditemukan.
  echo Install Node.js terlebih dahulu, lalu jalankan file ini lagi.
  pause
  exit /b 1
)
node server.js
pause
