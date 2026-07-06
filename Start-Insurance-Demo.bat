@echo off
echo ==========================================
echo   INSURANCE DEMO - STARTING SERVERS
echo ==========================================
echo.

REM Start Node.js server in a new window
echo [1/2] Starting Node.js server...
start "Insurance Node Server" cmd /k "cd /d "C:\Users\user\Downloads\insurance-demo" && npm start"

REM Wait 3 seconds to let Node connect to MongoDB first
timeout /t 3 /nobreak > NUL

REM Start Ngrok tunnel in a new window
echo [2/2] Starting Ngrok tunnel...
start "Ngrok Tunnel" cmd /k "ngrok http 3000"

echo.
echo ==========================================
echo   SUCCESS! Two new windows should open.
echo   - Window 1: Node.js logs
echo   - Window 2: Ngrok public URL
echo ==========================================
echo.
echo NOTE: Your Ngrok URL changes every time!
echo You will need to copy the new URL and 
echo update your Respond.io Workflow.
echo.
pause