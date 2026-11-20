@echo off
cd /d "%~dp0"
echo ===================================================
echo [Silverium DB] Avvio Sincronizzazione con SPVault...
echo ===================================================
node sync_spvault.js
echo ===================================================
echo Sincronizzazione completata. Controlla sync.log per i dettagli.
echo ===================================================
