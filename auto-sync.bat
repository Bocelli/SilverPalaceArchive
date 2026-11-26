@echo off
cd /d "%~dp0"
node sync_spvault.js >> sync-auto.log 2>&1
if errorlevel 1 exit /b 1
git push origin main >> sync-auto.log 2>&1
git push origin main:gh-pages >> sync-auto.log 2>&1
