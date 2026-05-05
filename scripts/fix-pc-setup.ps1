# fix-pc-setup.ps1
# Run this if your PC has a duplicate umpireCoding repo and the wrong one is
# registered as the native messaging host.
#
# What it does:
#   1. Re-registers the native messaging host from the correct repo (~\umpirecoding)
#   2. Runs npm install for post-processing in the correct location
#   3. Offers to remove the duplicate repo at ~\Documents\umpireCoding
#
# How to run (in PowerShell):
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   ~\umpirecoding\scripts\fix-pc-setup.ps1

$ErrorActionPreference = 'Stop'

$CorrectRepo   = "$env:USERPROFILE\umpirecoding"
$DuplicateRepo = "$env:USERPROFILE\Documents\umpireCoding"
$RegKey        = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.umpirecoder.postprocess"
$ManifestName  = "com.umpirecoder.postprocess"

Write-Host ""
Write-Host "Umpire Coder - Fix Duplicate Repo" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Verify the correct repo exists
if (-not (Test-Path "$CorrectRepo\extension\manifest.json")) {
    Write-Host "ERROR: Could not find the extension at $CorrectRepo\extension" -ForegroundColor Red
    Write-Host "Make sure the repo exists at $CorrectRepo and try again." -ForegroundColor Red
    exit 1
}
Write-Host "Correct repo found at $CorrectRepo" -ForegroundColor Green

# Step 2: Read extension ID from existing registration
$extId = $null
try {
    $existingManifestPath = (Get-ItemProperty -Path $RegKey -Name "(Default)")."(Default)"
    if ($existingManifestPath -and (Test-Path $existingManifestPath)) {
        $existingManifest = Get-Content $existingManifestPath | ConvertFrom-Json
        $origin = $existingManifest.allowed_origins[0]
        $extId  = $origin -replace 'chrome-extension://', '' -replace '/', ''
    }
} catch {}

if (-not $extId -or $extId.Length -ne 32) {
    Write-Host ""
    Write-Host "Could not read the extension ID from the existing registration." -ForegroundColor Yellow
    Write-Host "  1. Open Chrome and go to: chrome://extensions"
    Write-Host "  2. Enable Developer mode (top-right toggle if not already on)"
    Write-Host "  3. Find Umpire Coder and copy its ID (the 32-character string below the name)"
    Write-Host ""
    $extId = (Read-Host "  Paste extension ID here").Trim()
}

Write-Host "Extension ID: $extId" -ForegroundColor Green

# Step 3: Re-register native messaging host from correct location
Write-Host ""
Write-Host "Re-registering native messaging host..." -ForegroundColor Yellow

$hostCmdPath  = "$CorrectRepo\native-host\host.cmd"
$manifestPath = "$CorrectRepo\native-host\$ManifestName.json"

if (-not (Test-Path $hostCmdPath)) {
    Write-Host "ERROR: host.cmd not found at $hostCmdPath" -ForegroundColor Red
    exit 1
}

$manifest = [ordered]@{
    name            = $ManifestName
    description     = "Umpire Coder post-processing host"
    path            = (Resolve-Path $hostCmdPath).Path
    type            = "stdio"
    allowed_origins = @("chrome-extension://$extId/")
}

$manifest | ConvertTo-Json -Depth 3 | Set-Content -Path $manifestPath -Encoding utf8
New-Item -Path $RegKey -Force | Out-Null
Set-ItemProperty -Path $RegKey -Name "(Default)" -Value (Resolve-Path $manifestPath).Path

Write-Host "  Registered: $manifestPath" -ForegroundColor Green

# Step 4: npm install in the correct post-processing folder
Write-Host ""
Write-Host "Installing post-processing dependencies..." -ForegroundColor Yellow
Push-Location "$CorrectRepo\post-processing"
try {
    npm install --silent
    Write-Host "  Done." -ForegroundColor Green
} catch {
    Write-Host "  WARNING: npm install failed - $_" -ForegroundColor Yellow
    Write-Host "  Make sure Node.js is installed (https://nodejs.org) and re-run this script." -ForegroundColor Yellow
} finally {
    Pop-Location
}

# Step 5: Offer to remove the duplicate repo
if (Test-Path $DuplicateRepo) {
    Write-Host ""
    Write-Host "Duplicate repo found at $DuplicateRepo" -ForegroundColor Yellow
    $confirm = Read-Host "  Remove it now? (y/n)"
    if ($confirm.Trim().ToLower() -eq 'y') {
        Remove-Item -Path $DuplicateRepo -Recurse -Force
        Write-Host "  Removed." -ForegroundColor Green
    } else {
        Write-Host "  Skipped. You can delete $DuplicateRepo manually later." -ForegroundColor Gray
    }
} else {
    Write-Host ""
    Write-Host "No duplicate repo found at $DuplicateRepo - nothing to clean up." -ForegroundColor Green
}

# Done
Write-Host ""
Write-Host "All done!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Open Chrome and go to chrome://extensions"
Write-Host "  2. Click the reload arrow next to Umpire Coder"
Write-Host "  3. The extension version should now match the Mac version"
Write-Host "  4. Check for Updates in Settings will now pull to the correct location"
Write-Host ""
