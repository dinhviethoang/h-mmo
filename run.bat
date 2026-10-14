@echo off
cd /d "%~dp0"
set Path=%Path%;C:\Program Files\nodejs\
echo Dang khoi dong H-MMO (Electron)...
call npm.cmd run dev
echo.
echo Process exited.
pause
