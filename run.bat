@echo off
echo Starting Keynesian Beauty Contest Server...
.\.venv\Scripts\uvicorn.exe main:app --reload --host 127.0.0.1 --port 8000
pause
