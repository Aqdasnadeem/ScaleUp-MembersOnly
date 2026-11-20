# Run from any PowerShell at the repository root: .\start-dev.ps1
# Starts backend (8001), worker and frontend in 3 windows. Asks the Postgres password ONCE.
# JWT_SECRET is read from your Windows user environment (set once, see setup-jwt below). Nothing secret is stored in this file.
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$backendDir = Join-Path $root "backend"
$frontendDir = Join-Path $root "frontend"

$env:PGHOST = "localhost"; $env:PGPORT = "5432"; $env:PGUSER = "postgres"; $env:PGDATABASE = "scaleup_dev"
$sec = Read-Host "Postgres password" -AsSecureString
$env:PGPASSWORD = [System.Net.NetworkCredential]::new("", $sec).Password

$env:JWT_SECRET = [Environment]::GetEnvironmentVariable("JWT_SECRET", "User")
if (-not $env:JWT_SECRET -or $env:JWT_SECRET.Length -lt 32) {
    throw "JWT_SECRET missing or shorter than 32 chars. Run the one-time setup-jwt command first."
}

# child windows inherit the variables set above
$env:NEXT_PUBLIC_API_URL = "http://localhost:8001"   # the API above runs on 8001; the frontend's own default is 8000

# EncodedCommand avoids argument re-quoting issues when opening titled PowerShell windows.
function Start-TitledWindow($title, $workDir, $command) {
    $script = "`$host.UI.RawUI.WindowTitle = '$title'; cd '$workDir'; $command"
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
    Start-Process powershell -ArgumentList '-NoExit', '-EncodedCommand', $encoded
}

Start-TitledWindow 'ScaleUp API (8001)' $backendDir 'py -m uvicorn app.main:app --port 8001 --reload'
Start-TitledWindow 'ScaleUp worker' $backendDir 'py -m app.worker'
Start-TitledWindow 'ScaleUp frontend (3000)' $frontendDir 'npm.cmd run dev -- --webpack'

Write-Host "3 windows opened: API (8001), worker, frontend (3000). The frontend window takes ~15-20s longer to become ready (Next.js cold compile) - this is normal, not a failure."
