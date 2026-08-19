@echo off
cd /d "C:\Users\ITHN\.gemini\antigravity\scratch\h-mmo"
set Path=%Path%;C:\Program Files\nodejs\
echo Dang khoi dong H-MMO (Electron)...
call npm.cmd run dev
echo.
echo Process exited.
pause
