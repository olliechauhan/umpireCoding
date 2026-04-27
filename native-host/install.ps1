# install.ps1 - one-time setup for Umpire Coder native messaging host
# Run once from the native-host directory:
#   cd C:\Users\ollie\umpireCoding\native-host
#   .\install.ps1
#
# What it does:
#   1. Runs 'npm install' in post-processing/ to install pdfkit
#   2. Creates the native messaging manifest JSON
#   3. Registers it in the Windows registry so Chrome can find it

$ErrorActionPreference = 'Stop'
$hostDir        = Split-Path -Parent $MyInvocation.MyCommand.Path
$postProcessDir = Join-Path $hostDir '..\post-processing'
$hostCmdPath    = Join-Path $hostDir 'host.cmd'
$manifestPath   = Join-Path $hostDir 'com.umpirecoder.postprocess.json'

Write-Host ""
Write-Host "Umpire Coder - Native Host Setup" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: npm install
Write-Host "Step 1/3  Installing post-processing dependencies..." -ForegroundColor Yellow
Push-Location $postProcessDir
try {
    npm install --silent
    Write-Host "          pdfkit installed." -ForegroundColor Green
} catch {
    Write-Warning "npm install failed: $_"
    Write-Warning "Make sure Node.js is installed (https://nodejs.org) and try again."
    exit 1
} finally {
    Pop-Location
}

# Step 2: Get extension ID
Write-Host ""
Write-Host "Step 2/3  Extension ID" -ForegroundColor Yellow
Write-Host "  1. Open Chrome and go to: chrome://extensions"
Write-Host "  2. Enable Developer mode (top-right toggle)"
Write-Host "  3. Find 'Umpire Coder' and copy its ID (32-character string)"
Write-Host ""
$extId = Read-Host "  Paste extension ID"
$extId = $extId.Trim()

if ($extId.Length -ne 32) {
    Write-Warning "Extension ID is $($extId.Length) characters - expected 32. Continuing anyway."
}

# Step 3: Write manifest + registry key
Write-Host ""
Write-Host "Step 3/3  Registering native messaging host..." -ForegroundColor Yellow

$absHostCmd = (Resolve-Path $hostCmdPath).Path

$manifest = [ordered]@{
    name            = "com.umpirecoder.postprocess"
    description     = "Umpire Coder post-processing host"
    path            = $absHostCmd
    type            = "stdio"
    allowed_origins = @("chrome-extension://$extId/")
}

$manifest | ConvertTo-Json -Depth 3 | Set-Content -Path $manifestPath -Encoding utf8

$regKey = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.umpirecoder.postprocess"
New-Item -Path $regKey -Force | Out-Null
Set-ItemProperty -Path $regKey -Name "(Default)" -Value (Resolve-Path $manifestPath).Path

Write-Host ""
Write-Host "Done!" -ForegroundColor Green
Write-Host "  Manifest : $manifestPath"
Write-Host "  Registry : $regKey"
Write-Host ""
Write-Host "Reload the Umpire Coder extension in Chrome (chrome://extensions -> reload button)."
Write-Host "Post-processing will now run automatically when you end a match."
Write-Host ""
