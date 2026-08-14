@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "PS1=%SCRIPT_DIR%download-latest-upload-package.ps1"

if not exist "%PS1%" (
    echo Could not find download-latest-upload-package.ps1 next to this file:
    echo   %PS1%
    echo.
    pause
    exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS1%" %*
set "EXITCODE=%ERRORLEVEL%"

if not "%EXITCODE%"=="0" (
    echo.
    echo download-latest-upload-package.ps1 reported an error ^(exit code %EXITCODE%^).
    echo.
    pause
)

endlocal
exit /b %EXITCODE%
