@echo off
cd /d "%~dp0"
echo Starting musikcube -^> Discord Rich Presence bridge...
echo (Keep this window open while listening. Close it to stop.)
node bridge.js
pause
