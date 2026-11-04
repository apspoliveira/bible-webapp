@echo off
cd /d "%~dp0"
echo A iniciar servidor local em http://localhost:8791 ...
start "" "http://localhost:8791/index.html"
python serve.py
