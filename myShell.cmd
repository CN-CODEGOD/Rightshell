@echo off
rem myShell launcher (dev mode) - starts/summons the quake focus client.
start "" /D "%~dp0app" "%~dp0app\node_modules\.bin\electron.cmd" . --client=myshell %*