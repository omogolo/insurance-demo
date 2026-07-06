@echo off
echo Stopping all servers...
taskkill /IM node.exe /F >nul 2>&1
taskkill /IM ngrok.exe /F >nul 2>&1
echo.
echo All Node and Ngrok processes have been killed.
pause