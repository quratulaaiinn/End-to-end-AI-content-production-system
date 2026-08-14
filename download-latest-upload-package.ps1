<#
    Downloads the newest manual-download package (video.mp4 + upload-details.txt)
    produced by the content-production n8n workflow, from wherever the render
    server's OUTPUT_PATH is deployed, over SSH.

    Read-only against the remote host: only `ls` and `test` are run remotely,
    and files are copied via `scp` (never moved, renamed, or deleted on the
    remote side). No password, API key, or render token is stored or
    hardcoded anywhere in this script — SSH/SCP authentication is whatever
    your OpenSSH client already uses (key/agent, or an interactive password
    prompt).

    -SshHost is required and has no default on purpose: put your own
    deployment's address here (a Tailscale IP, a public hostname, whatever
    you use to reach it over SSH).

    Usage:
      .\download-latest-upload-package.ps1 -SshHost 100.x.x.x
      .\download-latest-upload-package.ps1 -SshHost 100.x.x.x -JobId 20260810-102036-fjt7md
#>

[CmdletBinding()]
param(
    # Leave blank to auto-detect the newest package on the remote host.
    [string]$JobId,

    # SSH login on the remote host. Change this if your account there isn't "root".
    [string]$SshUser = 'root',

    # Address of the machine running the render server (Tailscale IP, VPN IP,
    # or public hostname). No default — set this to your own deployment.
    [Parameter(Mandatory = $true)]
    [string]$SshHost,

    # Must match the render server's OUTPUT_PATH on that host (see
    # scripts/render-server.mjs / .env.example).
    [string]$RemoteJobsDir = '/opt/content-production-system/out/jobs'
)

$ErrorActionPreference = 'Stop'

function Write-Step {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Green
}

function Write-ErrorMsg {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Red
}

function Main {
    # Explicitly Windows' own System32 OpenSSH client — never whatever
    # "ssh"/"scp" might otherwise resolve to on PATH (Git's bundled OpenSSH,
    # a different install, etc.).
    $sshExe = Join-Path $env:SystemRoot 'System32\OpenSSH\ssh.exe'
    $scpExe = Join-Path $env:SystemRoot 'System32\OpenSSH\scp.exe'

    if (-not (Test-Path -LiteralPath $sshExe)) {
        Write-ErrorMsg "OpenSSH client not found at: $sshExe"
        Write-ErrorMsg "Enable it under Settings > Optional Features > 'OpenSSH Client', then try again."
        exit 1
    }
    if (-not (Test-Path -LiteralPath $scpExe)) {
        Write-ErrorMsg "OpenSSH scp not found at: $scpExe"
        Write-ErrorMsg "Enable it under Settings > Optional Features > 'OpenSSH Client', then try again."
        exit 1
    }

    # accept-new: trusts a host key only the first time this VPS is ever
    # contacted from this machine, then verifies it matches on every run
    # after that — not the same as disabling host-key checking.
    $sshOpts = @('-o', 'StrictHostKeyChecking=accept-new')
    $target = "$SshUser@$SshHost"

    Write-Step "Connecting to $target ..."

    $remoteDetailsPath = $null

    if ([string]::IsNullOrWhiteSpace($JobId)) {
        Write-Step "Looking up the newest upload package in $RemoteJobsDir ..."
        $listCmd = "ls -1t '$RemoteJobsDir'/*-upload-details.txt 2>/dev/null | head -n 1"
        $listOutput = & $sshExe @sshOpts $target $listCmd
        if ($LASTEXITCODE -ne 0) {
            Write-ErrorMsg "Could not connect to the VPS (ssh exit code $LASTEXITCODE)."
            exit 1
        }

        $remoteDetailsPath = ($listOutput | Where-Object { $_ -and $_.Trim() -ne '' } | Select-Object -First 1)
        if (-not $remoteDetailsPath) {
            Write-ErrorMsg "No '*-upload-details.txt' files found in $RemoteJobsDir on the VPS."
            exit 1
        }
        $remoteDetailsPath = $remoteDetailsPath.Trim()

        $fileName = [System.IO.Path]::GetFileName($remoteDetailsPath)
        $JobId = $fileName -replace '-upload-details\.txt$', ''
    }
    else {
        $remoteDetailsPath = "$RemoteJobsDir/$JobId-upload-details.txt"
    }

    if ([string]::IsNullOrWhiteSpace($JobId)) {
        Write-ErrorMsg "Could not determine a job ID from the VPS."
        exit 1
    }

    Write-Ok "Job ID: $JobId"

    $remoteMp4Path = "$RemoteJobsDir/$JobId.mp4"

    Write-Step "Verifying both files exist on the VPS (read-only check) ..."
    $verifyCmd = "test -s '$remoteDetailsPath' && echo DETAILS_OK || echo DETAILS_MISSING; " +
                 "test -s '$remoteMp4Path' && echo MP4_OK || echo MP4_MISSING"
    $verifyOutput = & $sshExe @sshOpts $target $verifyCmd
    if ($LASTEXITCODE -ne 0) {
        Write-ErrorMsg "Could not connect to the VPS while verifying files (ssh exit code $LASTEXITCODE)."
        exit 1
    }

    $verifyText = [string]::Join("`n", $verifyOutput)
    if ($verifyText -notmatch 'DETAILS_OK') {
        Write-ErrorMsg "Upload-details file missing or empty on the VPS: $remoteDetailsPath"
        exit 1
    }
    if ($verifyText -notmatch 'MP4_OK') {
        Write-ErrorMsg "Video file missing or empty on the VPS: $remoteMp4Path"
        exit 1
    }
    Write-Ok "Both files confirmed on the VPS."

    # [Environment]::GetFolderPath resolves the REAL Desktop path even when
    # it's been redirected (e.g. OneDrive Desktop), unlike a hardcoded
    # "$env:USERPROFILE\Desktop".
    $desktop = [Environment]::GetFolderPath('Desktop')
    $localRoot = Join-Path $desktop 'Content Production Downloads'
    $jobDir = Join-Path $localRoot $JobId
    $localMp4 = Join-Path $jobDir 'video.mp4'
    $localDetails = Join-Path $jobDir 'upload-details.txt'

    $alreadyHaveMp4 = (Test-Path -LiteralPath $localMp4) -and ((Get-Item -LiteralPath $localMp4).Length -gt 0)
    $alreadyHaveDetails = (Test-Path -LiteralPath $localDetails) -and ((Get-Item -LiteralPath $localDetails).Length -gt 0)

    if ($alreadyHaveMp4 -and $alreadyHaveDetails) {
        Write-Ok "Package for job $JobId is already downloaded."
        Write-Step "Opening $jobDir ..."
        Invoke-Item -LiteralPath $jobDir
        return
    }

    New-Item -ItemType Directory -Path $jobDir -Force | Out-Null

    $partDetails = "$localDetails.part"
    $partMp4 = "$localMp4.part"
    Remove-Item -LiteralPath $partDetails -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $partMp4 -ErrorAction SilentlyContinue

    Write-Step "Downloading upload-details.txt ..."
    & $scpExe @sshOpts "${target}:${remoteDetailsPath}" $partDetails
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $partDetails) -or (Get-Item -LiteralPath $partDetails).Length -eq 0) {
        Write-ErrorMsg "Failed to download upload-details.txt (scp exit code $LASTEXITCODE)."
        Remove-Item -LiteralPath $partDetails -ErrorAction SilentlyContinue
        exit 1
    }

    Write-Step "Downloading video.mp4 (this can take a while on a large file) ..."
    & $scpExe @sshOpts "${target}:${remoteMp4Path}" $partMp4
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $partMp4) -or (Get-Item -LiteralPath $partMp4).Length -eq 0) {
        Write-ErrorMsg "Failed to download video.mp4 (scp exit code $LASTEXITCODE)."
        Remove-Item -LiteralPath $partMp4 -ErrorAction SilentlyContinue
        exit 1
    }

    Move-Item -LiteralPath $partDetails -Destination $localDetails -Force
    Move-Item -LiteralPath $partMp4 -Destination $localMp4 -Force

    $mp4SizeMb = [Math]::Round((Get-Item -LiteralPath $localMp4).Length / 1MB, 1)
    Write-Ok "Download complete: $jobDir  (video.mp4: $mp4SizeMb MB)"

    Write-Step "Opening folder in File Explorer ..."
    Invoke-Item -LiteralPath $jobDir
}

try {
    Main
}
catch {
    Write-ErrorMsg "Unexpected error: $($_.Exception.Message)"
    exit 1
}
