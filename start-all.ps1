[CmdletBinding()]
param(
    [switch]$NoApi,
    [switch]$NoWorker,
    [switch]$NoBeat,
    [switch]$NoFrontend
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $projectRoot "backend"
$frontendDir = Join-Path $projectRoot "frontend"
$pythonExe = Join-Path $backendDir "venv\Scripts\python.exe"
$envFile = Join-Path $backendDir ".env"
$isWindowsHost = $env:OS -eq "Windows_NT"

if (-not (Test-Path -LiteralPath $backendDir)) {
    throw "Backend folder not found at: $backendDir"
}

if (-not (Test-Path -LiteralPath $frontendDir)) {
    throw "Frontend folder not found at: $frontendDir"
}

if (-not (Test-Path -LiteralPath $pythonExe)) {
    throw "Python venv not found at: $pythonExe`nCreate it first in backend folder (python -m venv venv) and install requirements."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm command not found. Please install Node.js 18+ and try again."
}

function Import-DotEnv {
    param(
        [Parameter(Mandatory = $true)][string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }

    Get-Content -LiteralPath $Path | ForEach-Object {
        $line = $_.Trim()
        if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith("#")) {
            return
        }
        $separatorIndex = $line.IndexOf("=")
        if ($separatorIndex -lt 1) {
            return
        }

        $name = $line.Substring(0, $separatorIndex).Trim()
        $value = $line.Substring($separatorIndex + 1).Trim().Trim("'`"")
        Set-Item -Path "Env:$name" -Value $value
    }
}

function Get-BoolEnv {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [bool]$Default = $false
    )

    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        return $Default
    }
    return @("1", "true", "yes", "on") -contains $value.Trim().ToLowerInvariant()
}

function Test-TcpPort {
    param(
        [Parameter(Mandatory = $true)][string]$HostName,
        [Parameter(Mandatory = $true)][int]$Port,
        [int]$TimeoutMs = 800
    )

    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $asyncResult = $client.BeginConnect($HostName, $Port, $null, $null)
        if (-not $asyncResult.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) {
            return $false
        }
        $client.EndConnect($asyncResult)
        return $true
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Start-ServiceWindow {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][string]$Command
    )

    $inlineCommand = "Set-Location -LiteralPath '$WorkingDirectory'; `$Host.UI.RawUI.WindowTitle = '$Title'; $Command"
    Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoExit", "-Command", $inlineCommand) | Out-Null
    Write-Host "Started: $Title"
}

Import-DotEnv -Path $envFile

$celeryAlwaysEager = Get-BoolEnv -Name "CELERY_TASK_ALWAYS_EAGER" -Default $false
$redisBrokerUrl = [Environment]::GetEnvironmentVariable("CELERY_BROKER_URL")
if ([string]::IsNullOrWhiteSpace($redisBrokerUrl)) {
    $redisBrokerUrl = "redis://127.0.0.1:6379/0"
}

if ($celeryAlwaysEager) {
    if (-not $NoWorker) {
        Write-Host "CELERY_TASK_ALWAYS_EAGER=True detected in backend/.env; skipping Celery worker."
    }
    if (-not $NoBeat) {
        Write-Host "CELERY_TASK_ALWAYS_EAGER=True detected in backend/.env; skipping Celery beat."
    }
    $NoWorker = $true
    $NoBeat = $true
}

if ((-not $NoWorker -or -not $NoBeat) -and ($redisBrokerUrl -match "^redis://([^:/]+):(\d+)")) {
    $redisHost = $matches[1]
    $redisPort = [int]$matches[2]
    if (-not (Test-TcpPort -HostName $redisHost -Port $redisPort)) {
        Write-Warning "Redis is not reachable at $redisHost`:$redisPort. Skipping worker/beat."
        Write-Host "Start Redis first (example): docker run --name playto-redis -p 6379:6379 -d redis:7"
        $NoWorker = $true
        $NoBeat = $true
    }
}

if (-not $NoApi) {
    Start-ServiceWindow `
        -Title "Playto Backend API" `
        -WorkingDirectory $backendDir `
        -Command "& '$pythonExe' manage.py runserver 0.0.0.0:8000"
}

if (-not $NoWorker) {
    $workerCommand = "& '$pythonExe' -m celery -A config worker -l info"
    if ($isWindowsHost) {
        # Celery prefork is unstable on Windows; solo mode is the safe local option.
        $workerCommand = "$workerCommand --pool=solo --concurrency=1"
    }
    Start-ServiceWindow `
        -Title "Playto Celery Worker" `
        -WorkingDirectory $backendDir `
        -Command $workerCommand
}

if (-not $NoBeat) {
    Start-ServiceWindow `
        -Title "Playto Celery Beat" `
        -WorkingDirectory $backendDir `
        -Command "& '$pythonExe' -m celery -A config beat -l info"
}

if (-not $NoFrontend) {
    Start-ServiceWindow `
        -Title "Playto Frontend" `
        -WorkingDirectory $frontendDir `
        -Command "if (-not (Test-Path -LiteralPath 'node_modules')) { npm install }; npm run dev"
}

Write-Host ""
Write-Host "All requested services launched."
Write-Host "Backend API:  http://localhost:8000"
Write-Host "Frontend App: http://localhost:5173"
Write-Host ""
Write-Host "Optional flags:"
Write-Host "  .\start-all.ps1 -NoFrontend"
Write-Host "  .\start-all.ps1 -NoWorker -NoBeat"
