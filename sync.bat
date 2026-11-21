@echo off
cd /d "%~dp0"
echo ===================================================
echo [Silverium DB] Sync del vault SPVault verso il sito
echo ===================================================
node sync_spvault.js %*
set EXITCODE=%ERRORLEVEL%
echo.
if not "%EXITCODE%"=="0" (
  echo [ERRORE] Sync interrotto. Nessun file e' stato scritto: controlla sync.log.
  exit /b %EXITCODE%
)
echo Fatto. Drift e stato: apri status.html
echo Pubblicazione manuale: git push origin main ^&^& git push origin main:gh-pages
exit /b 0
