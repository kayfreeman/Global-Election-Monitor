@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 18+ is required: https://nodejs.org & pause & exit /b 1)
set GP_SUPERVISED=1
set OPEN_BROWSER=1
:run
node server\server.js
set RC=%errorlevel%
set OPEN_BROWSER=
if "%RC%"=="3" (echo Restarting to apply settings... & goto run)
pause
