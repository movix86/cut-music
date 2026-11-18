@echo off
cd /d "%~dp0"
echo Cut Music se abrira en http://127.0.0.1:8130/
start "" http://127.0.0.1:8130/
node tools\servidor.mjs 8130
pause
