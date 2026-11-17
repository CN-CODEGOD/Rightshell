@echo off
rem rsctl - RightShell shell control helper.
rem Usage: rsctl play "C:\path\to.mp3" | enqueue <file> | open <path> | notify <text> | ping
setlocal
set "CMD=%~1"
set "ARG=%~2"
if "%RS_IPC_PORT%"=="" (
  echo rsctl: not running inside a RightShell session.
  exit /b 1
)
if "%CMD%"=="" (
  echo Usage: rsctl ^<play^|enqueue^|open^|notify^|ping^> [argument]
  exit /b 1
)
curl -s -X POST -H "X-RS-Token: %RS_IPC_TOKEN%" --data-urlencode "arg=%ARG%" "http://127.0.0.1:%RS_IPC_PORT%/%CMD%"
echo.
endlocal