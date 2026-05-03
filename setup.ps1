#Requires -RunAsAdministrator
# setup.ps1 - Umpire Coder one-shot setup script
#
# Downloads and installs all required software, clones the repo, pre-configures
# OBS, and registers the native messaging host with Chrome. The only two manual
# steps are: selecting the Chrome window in OBS (the script opens Chrome and
# guides you), and loading the unpacked extension into Chrome (Chrome's security
# model prevents automation of this).
#
# Run from PowerShell as Administrator:
#   powershell -ExecutionPolicy Bypass -File setup.ps1

$ErrorActionPreference = 'Stop'

$REPO_URL    = "https://github.com/olliechauhan/umpireCoding.git"
$INSTALL_DIR = Join-Path $env:USERPROFILE "Documents\umpireCoding"
$OBS_PASSWORD = "umpire123"

function Write-Step { param($n, $msg) Write-Host "`nStep $n  $msg" -ForegroundColor Yellow }
function Write-OK   { param($msg) Write-Host "       OK  $msg" -ForegroundColor Green }
function Write-Skip { param($msg) Write-Host "     SKIP  $msg" -ForegroundColor DarkGray }
function Write-Info { param($msg) Write-Host "           $msg" }

function Reload-Path {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path", "User")
}

function Install-Winget {
    param($Id, $Name, [string[]]$KillProcesses = @())
    $listResult = winget list --id $Id --accept-source-agreements 2>&1 | Out-String
    if ($listResult -match [regex]::Escape($Id)) {
        Write-Skip "$Name already installed."
        return
    }
    if ($KillProcesses) {
        Stop-Process -Name $KillProcesses -Force -ErrorAction SilentlyContinue
    }
    Write-Info "Installing $Name..."
    winget install --id $Id --accept-package-agreements --accept-source-agreements --silent
    $code = $LASTEXITCODE
    if ($code -eq 0) {
        Reload-Path
        Write-OK "$Name installed."
    } else {
        Write-Host ""
        Write-Host "  WARNING: $Name installer exited with code $code." -ForegroundColor Yellow
        Write-Host "  If $Name is not working, install it manually from its website then re-run." -ForegroundColor Yellow
    }
}

# Reads an INI file, sets a key in a section, and writes it back.
# Creates the file and/or section if they don't exist.
function Set-IniValue {
    param([string]$Path, [string]$Section, [string]$Key, [string]$Value)

    $dir = Split-Path $Path
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }

    $raw   = if (Test-Path $Path) { Get-Content $Path -Raw -Encoding UTF8 } else { "" }
    $lines = if ($raw) { $raw -split "`r?`n" } else { @() }

    $result       = [System.Collections.Generic.List[string]]::new()
    $inSection    = $false
    $sectionFound = $false
    $keyWritten   = $false

    foreach ($line in $lines) {
        if ($line -match "^\[$([regex]::Escape($Section))\]\s*$") {
            $inSection = $true; $sectionFound = $true
            $result.Add($line); continue
        }
        if ($inSection -and $line -match "^\[") {
            if (-not $keyWritten) { $result.Add("$Key=$Value"); $keyWritten = $true }
            $inSection = $false
        }
        if ($inSection -and $line -match "^$([regex]::Escape($Key))\s*=") {
            $result.Add("$Key=$Value"); $keyWritten = $true; continue
        }
        $result.Add($line)
    }

    if (-not $sectionFound)      { $result.Add("[$Section]"); $result.Add("$Key=$Value") }
    elseif (-not $keyWritten)    { $result.Add("$Key=$Value") }

    [System.IO.File]::WriteAllText($Path, ($result -join "`r`n"), [System.Text.Encoding]::UTF8)
}

Clear-Host
Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "    Umpire Coder - Automated Setup" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  This will install all required software and configure"
Write-Host "  Umpire Coder. It will take a few minutes."
Write-Host ""
Write-Host "  Press Enter to begin, or Ctrl+C to cancel." -NoNewline
Read-Host

# -- Step 1: Node.js ----------------------------------------------------------
Write-Step "1/8" "Node.js (LTS)"
Install-Winget "OpenJS.NodeJS.LTS" "Node.js"

# -- Step 2: Git --------------------------------------------------------------
Write-Step "2/8" "Git"
Install-Winget "Git.Git" "Git"

# -- Step 3: OBS Studio -------------------------------------------------------
Write-Step "3/8" "OBS Studio"
Install-Winget "OBSProject.OBSStudio" "OBS Studio" -KillProcesses @("obs64", "obs32", "obs-browser-page", "obs-ffmpeg-mux")

# -- Step 4: ffmpeg -----------------------------------------------------------
Write-Step "4/8" "ffmpeg"
Install-Winget "Gyan.FFmpeg" "ffmpeg"
Reload-Path

# -- Step 5: Clone / update repo ----------------------------------------------
Write-Step "5/8" "Umpire Coder files"
if (Test-Path (Join-Path $INSTALL_DIR ".git")) {
    Write-Info "Repository already exists at $INSTALL_DIR"
    Write-Info "Pulling latest updates..."
    Push-Location $INSTALL_DIR
    git pull --quiet
    Pop-Location
    Write-OK "Repository up to date."
} else {
    Write-Info "Downloading to $INSTALL_DIR ..."
    git clone $REPO_URL $INSTALL_DIR --quiet
    Write-OK "Files downloaded."
}

# -- Step 6: npm install ------------------------------------------------------
Write-Step "6/8" "Post-processing dependencies (pdfkit)"
Push-Location (Join-Path $INSTALL_DIR "post-processing")
npm install --silent
Pop-Location
Write-OK "Dependencies installed."

# -- Step 7: Configure OBS ----------------------------------------------------
Write-Step "7/8" "Configuring OBS"

$obsConfig     = Join-Path $env:APPDATA "obs-studio"
$globalIni     = Join-Path $obsConfig "global.ini"
$profileDir    = Join-Path $obsConfig "basic\profiles\Umpire Coder"
$profileIni    = Join-Path $profileDir "basic.ini"
$scenesDir     = Join-Path $obsConfig "basic\scenes"
$sceneFile     = Join-Path $scenesDir "Umpire Coder.json"
$recordingPath = Join-Path $env:USERPROFILE "Videos\umpire-recordings"

foreach ($d in @($obsConfig, $profileDir, $scenesDir, $recordingPath)) {
    if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
}

# WebSocket server
Set-IniValue $globalIni "OBSWebSocket" "ServerEnabled"  "true"
Set-IniValue $globalIni "OBSWebSocket" "ServerPort"     "4455"
Set-IniValue $globalIni "OBSWebSocket" "AuthRequired"   "true"
Set-IniValue $globalIni "OBSWebSocket" "ServerPassword" $OBS_PASSWORD
Set-IniValue $globalIni "OBSWebSocket" "AlertsEnabled"  "false"

# Active profile + scene collection
Set-IniValue $globalIni "Basic" "Profile"             "Umpire Coder"
Set-IniValue $globalIni "Basic" "ProfileDir"          "Umpire Coder"
Set-IniValue $globalIni "Basic" "SceneCollection"     "Umpire Coder"
Set-IniValue $globalIni "Basic" "SceneCollectionFile" "Umpire Coder"

# Recording output path
Set-IniValue $profileIni "Output"       "Mode"     "Simple"
Set-IniValue $profileIni "SimpleOutput" "FilePath" $recordingPath

# Scene collection with Stream Capture source pre-created
$sceneJson = @"
{
    "current_scene": "Match Recording",
    "current_program_scene": "Match Recording",
    "scene_order": [{"name": "Match Recording"}],
    "name": "Umpire Coder",
    "sources": [
        {
            "balance": 0.5,
            "deinterlace_field_order": 0,
            "deinterlace_mode": 0,
            "enabled": true,
            "flags": 0,
            "hotkeys": {},
            "id": "window_capture",
            "mixers": 255,
            "monitoring_type": 0,
            "muted": false,
            "name": "Stream Capture",
            "prev_ver": 503316480,
            "private_settings": {},
            "push-to-mute-delay": 0,
            "push-to-talk-delay": 0,
            "settings": {
                "cursor": true,
                "method": 2,
                "window": ""
            },
            "sync": 0,
            "versioned_id": "window_capture",
            "volume": 1.0
        },
        {
            "balance": 0.5,
            "deinterlace_field_order": 0,
            "deinterlace_mode": 0,
            "enabled": true,
            "flags": 0,
            "hotkeys": {},
            "id": "scene",
            "mixers": 0,
            "monitoring_type": 0,
            "muted": false,
            "name": "Match Recording",
            "prev_ver": 503316480,
            "private_settings": {},
            "push-to-mute-delay": 0,
            "push-to-talk-delay": 0,
            "settings": {
                "id_counter": 1,
                "items": [
                    {
                        "align": 5,
                        "bounds": {"x": 0.0, "y": 0.0},
                        "bounds_align": 0,
                        "bounds_type": 0,
                        "crop_bottom": 0,
                        "crop_left": 0,
                        "crop_right": 0,
                        "crop_top": 0,
                        "group_item_backup": false,
                        "id": 1,
                        "locked": false,
                        "name": "Stream Capture",
                        "pos": {"x": 0.0, "y": 0.0},
                        "private_settings": {},
                        "rot": 0.0,
                        "scale": {"x": 1.0, "y": 1.0},
                        "scale_filter": "disable",
                        "show_in_multiview": true,
                        "visible": true
                    }
                ]
            },
            "sync": 0,
            "versioned_id": "scene",
            "volume": 1.0
        }
    ],
    "groups": [],
    "transitions": [
        {
            "balance": 0.5,
            "enabled": true,
            "flags": 0,
            "hotkeys": {},
            "id": "fade_transition",
            "mixers": 0,
            "monitoring_type": 0,
            "muted": false,
            "name": "Fade",
            "prev_ver": 503316480,
            "private_settings": {},
            "push-to-mute-delay": 0,
            "push-to-talk-delay": 0,
            "settings": {"duration": 300},
            "sync": 0,
            "volume": 1.0
        }
    ],
    "current_transition": "Fade",
    "transition_duration": 300,
    "preview_locked": false,
    "scaling_enabled": false,
    "scaling_level": 0,
    "scaling_off_x": 0.0,
    "scaling_off_y": 0.0
}
"@
[System.IO.File]::WriteAllText($sceneFile, $sceneJson, [System.Text.Encoding]::UTF8)

Write-OK "WebSocket enabled  (port 4455, password: $OBS_PASSWORD)"
Write-OK "Recording path set ($recordingPath)"
Write-OK "Scene 'Match Recording' + Stream Capture source created"

# Open Chrome minimised so it appears in OBS window capture list
$chromePaths = @(
    "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$chromeExe = $chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($chromeExe) {
    Start-Process $chromeExe -ArgumentList "--new-window about:blank" -WindowStyle Minimized
    Write-Info "Chrome opened in background (needed for OBS window selection)."
} else {
    Write-Host ""
    Write-Host "  Could not find Chrome automatically." -ForegroundColor Yellow
    Write-Host "  Please open Chrome manually before completing the next step."
}

Write-Host ""
Write-Host "  MANUAL ACTION - Select Chrome in OBS:" -ForegroundColor White
Write-Host "  --------------------------------------"
Write-Host "  1. Open OBS Studio"
Write-Host "  2. In the Sources panel, double-click  Stream Capture"
Write-Host "  3. Click the Window dropdown and select your Chrome window"
Write-Host "     (it will appear as something like  [chrome.exe]: New Tab)"
Write-Host "  4. Click OK, then close OBS"
Write-Host ""
Read-Host "  Press Enter once you've selected the Chrome window in OBS"

# -- Step 8: Load extension into Chrome, then register native host -------------
Write-Step "8/8" "Chrome extension + native host registration"
Write-Host ""
Write-Host "  Chrome cannot load extensions automatically - you need to do this part." -ForegroundColor White
Write-Host ""
Write-Host "  We've opened Chrome and the extension folder for you." -ForegroundColor White
Write-Host ""
Write-Host "  Follow these steps:"
Write-Host "    1. In Chrome, turn on Developer mode (toggle, top-right corner)"
Write-Host "    2. Click  Load unpacked"
Write-Host "    3. The file browser should already show the extension folder."
Write-Host "       If not, navigate to:"
Write-Host "         $INSTALL_DIR\extension" -ForegroundColor Cyan
Write-Host "    4. Click  Select Folder"
Write-Host "    5. Copy the 32-character Extension ID shown under the extension name"
Write-Host ""

try { Start-Process $chromeExe -ArgumentList "--new-window chrome://extensions" } catch {
    try { Start-Process "chrome.exe" -ArgumentList "--new-window chrome://extensions" } catch {}
}
Start-Process "explorer.exe" -ArgumentList (Join-Path $INSTALL_DIR "extension")

Write-Host "  Once you have the Extension ID, come back here." -ForegroundColor White
Write-Host ""
$extId = (Read-Host "  Paste Extension ID and press Enter").Trim()

if ($extId.Length -ne 32) {
    Write-Warning "Extension ID is $($extId.Length) characters - expected 32. Continuing anyway."
}

$hostDir      = Join-Path $INSTALL_DIR "native-host"
$hostCmdPath  = Join-Path $hostDir "host.cmd"
$manifestPath = Join-Path $hostDir "com.umpirecoder.postprocess.json"

$manifest = [ordered]@{
    name            = "com.umpirecoder.postprocess"
    description     = "Umpire Coder post-processing host"
    path            = (Resolve-Path $hostCmdPath).Path
    type            = "stdio"
    allowed_origins = @("chrome-extension://$extId/")
}
$manifest | ConvertTo-Json -Depth 3 | Set-Content -Path $manifestPath -Encoding utf8

$regKey = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.umpirecoder.postprocess"
New-Item -Path $regKey -Force | Out-Null
Set-ItemProperty -Path $regKey -Name "(Default)" -Value (Resolve-Path $manifestPath).Path

Write-OK "Native messaging host registered."

# -- Done ---------------------------------------------------------------------
Write-Host ""
Write-Host "  ============================================" -ForegroundColor Green
Write-Host "    Setup complete!" -ForegroundColor Green
Write-Host "  ============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Last steps in Chrome:" -ForegroundColor White
Write-Host "    1. Go to chrome://extensions and click the reload button on Umpire Coder"
Write-Host "    2. Click the Umpire Coder icon, then Settings, and fill in:"
Write-Host "         OBS Password  :  $OBS_PASSWORD"
Write-Host "         Recording folder  :  $recordingPath"
Write-Host "         Clips & reports folder  :  (choose any folder you like)"
Write-Host "    3. Click Save Settings"
Write-Host ""
Write-Host "  See windowsSETUP.md for the full workflow guide."
Write-Host ""
