@echo off
rem RightShell launcher (dev mode). Packaged builds use RightShell.exe instead.
start "" /D "%~dp0app" "%~dp0app\node_modules\.bin\electron.cmd" . %*