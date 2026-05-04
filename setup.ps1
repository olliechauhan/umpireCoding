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

# Pin this console window to always-on-top so it stays visible when OBS opens.
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WinHelper {
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
}
"@
$null = [WinHelper]::SetWindowPos([WinHelper]::GetConsoleWindow(), [IntPtr](-1), 0, 0, 0, 0, 0x0003)

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

$obsPaths = @(
    "${env:ProgramFiles}\obs-studio\bin\64bit\obs64.exe",
    "${env:ProgramFiles(x86)}\obs-studio\bin\64bit\obs64.exe"
)
$obsExe = $obsPaths | Where-Object { Test-Path $_ } | Select-Object -First 1

# Always let OBS run briefly before we write config. OBS performs first-time
# initialisation and version migration on startup regardless of whether
# global.ini already exists -- both create an "Untitled" profile that
# overwrites any settings we wrote beforehand. By letting OBS init first,
# killing it, then patching global.ini, we guarantee our settings are the
# last thing written and OBS's own migration flags stay intact.
Write-Info "Starting OBS to complete initialisation (this takes ~15 seconds)..."
if ($obsExe) {
    $obsProc = Start-Process $obsExe -WorkingDirectory (Split-Path $obsExe) -PassThru
    # Wait for global.ini to appear (up to 20 s), then give OBS a few more
    # seconds to finish writing all its initial config files before we kill it.
    $deadline = (Get-Date).AddSeconds(20)
    while (-not (Test-Path $globalIni) -and (Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 500
    }
    Start-Sleep -Seconds 6
    $obsProc | Stop-Process -Force -ErrorAction SilentlyContinue
    Get-Process "obs64","obs32" -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 2
}

foreach ($d in @($obsConfig, $profileDir, $scenesDir, $recordingPath)) {
    if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
}

# Strip the [Locations] section from global.ini if OBS wrote one -- it
# redirects profile/scene lookups to wrong paths. Then patch in our settings
# using Set-IniValue so OBS's own keys (LastVersion, migration flags, etc.)
# are preserved and no migration re-runs on the next launch.
if (Test-Path $globalIni) {
    $raw = Get-Content $globalIni -Raw -Encoding UTF8
    $filtered = [System.Collections.Generic.List[string]]::new()
    $inLocations = $false
    foreach ($line in ($raw -split "`r?`n")) {
        if ($line -match '^\[Locations\]\s*$')  { $inLocations = $true; continue }
        if ($inLocations -and $line -match '^\[') { $inLocations = $false }
        if (-not $inLocations) { $filtered.Add($line) }
    }
    [System.IO.File]::WriteAllText($globalIni, ($filtered -join "`r`n"), [System.Text.Encoding]::UTF8)
}

Set-IniValue $globalIni "Basic"        "Profile"             "Umpire Coder"
Set-IniValue $globalIni "Basic"        "ProfileDir"          "Umpire Coder"
Set-IniValue $globalIni "Basic"        "SceneCollection"     "Umpire Coder"
Set-IniValue $globalIni "Basic"        "SceneCollectionFile" "Umpire Coder"
Set-IniValue $globalIni "OBSWebSocket" "ServerEnabled"       "true"
Set-IniValue $globalIni "OBSWebSocket" "ServerPort"          "4455"
Set-IniValue $globalIni "OBSWebSocket" "AuthRequired"        "true"
Set-IniValue $globalIni "OBSWebSocket" "ServerPassword"      $OBS_PASSWORD
Set-IniValue $globalIni "OBSWebSocket" "AlertsEnabled"       "false"

# basic.ini -- write fresh. SampleRate and ChannelSetup are required for OBS
# to treat the [Audio] section as valid; without them it ignores the section
# and all devices default to Disabled.
[System.IO.File]::WriteAllText($profileIni, @"
[Output]
Mode=Simple

[SimpleOutput]
FilePath=$recordingPath

[Audio]
SampleRate=48000
ChannelSetup=Stereo
DesktopDevice1=default
DesktopDevice2=disabled
AuxDevice1=default
AuxDevice2=disabled
AuxDevice3=disabled
AuxDevice4=disabled
MonitoringDeviceId=default
MonitoringDeviceName=
"@, [System.Text.Encoding]::UTF8)

# user.ini -- OBS 31+ reads per-user profile settings from here; mirror the
# audio device settings so they are present regardless of which file OBS reads.
[System.IO.File]::WriteAllText((Join-Path $profileDir "user.ini"), @"
[Audio]
SampleRate=48000
ChannelSetup=Stereo
DesktopDevice1=default
DesktopDevice2=disabled
AuxDevice1=default
AuxDevice2=disabled
AuxDevice3=disabled
AuxDevice4=disabled
MonitoringDeviceId=default
MonitoringDeviceName=
"@, [System.Text.Encoding]::UTF8)

# Scene collection: Stream Capture source + Mic/Aux muted
$sceneJson = @"
{
    "current_scene": "Match Recording",
    "current_program_scene": "Match Recording",
    "current_transition": "Fade",
    "groups": [],
    "name": "Umpire Coder",
    "preview_locked": false,
    "scaling_enabled": false,
    "scaling_level": 7,
    "scaling_off_x": 0.0,
    "scaling_off_y": 0.0,
    "scene_order": [{"name": "Match Recording"}],
    "sources": [
        {
            "balance": 0.5,
            "deinterlace_field_order": 0,
            "deinterlace_mode": 0,
            "enabled": true,
            "flags": 0,
            "hotkeys": {},
            "id": "wasapi_output_capture",
            "mixers": 255,
            "monitoring_type": 0,
            "muted": false,
            "name": "Desktop Audio",
            "prev_ver": 503316480,
            "private_settings": {},
            "push-to-mute-delay": 0,
            "push-to-talk-delay": 0,
            "settings": {
                "device_id": "default",
                "use_device_timing": false
            },
            "sync": 0,
            "versioned_id": "wasapi_output_capture",
            "volume": 1.0
        },
        {
            "balance": 0.5,
            "deinterlace_field_order": 0,
            "deinterlace_mode": 0,
            "enabled": true,
            "flags": 0,
            "hotkeys": {},
            "id": "wasapi_input_capture",
            "mixers": 255,
            "monitoring_type": 0,
            "muted": true,
            "name": "Mic/Aux",
            "prev_ver": 503316480,
            "private_settings": {},
            "push-to-mute-delay": 0,
            "push-to-talk-delay": 0,
            "settings": {
                "device_id": "default",
                "use_device_timing": false
            },
            "sync": 0,
            "versioned_id": "wasapi_input_capture",
            "volume": 1.0
        },
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
                "id_counter": 3,
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
                    },
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
                        "id": 2,
                        "locked": true,
                        "name": "Desktop Audio",
                        "pos": {"x": 0.0, "y": 0.0},
                        "private_settings": {},
                        "rot": 0.0,
                        "scale": {"x": 1.0, "y": 1.0},
                        "scale_filter": "disable",
                        "show_in_multiview": true,
                        "visible": true
                    },
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
                        "id": 3,
                        "locked": true,
                        "name": "Mic/Aux",
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
    "transition_duration": 300,
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
    ]
}
"@
[System.IO.File]::WriteAllText($sceneFile, $sceneJson, [System.Text.Encoding]::UTF8)

Write-OK "WebSocket enabled  (port 4455, password: $OBS_PASSWORD)"
Write-OK "Recording path set ($recordingPath)"
Write-OK "Scene 'Match Recording' created  (Stream Capture + Mic/Aux muted)"

# Find Chrome and open it minimised so it appears in OBS window capture list
$chromePaths = @(
    "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$chromeExe = $chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1

# Open Chrome to google.com and minimise -- Chrome must be visible to OBS
# before OBS launches so it appears in the window capture dropdown
if ($chromeExe) {
    Start-Process $chromeExe -ArgumentList "--new-window https://www.google.com" -WindowStyle Minimized
    Write-Info "Chrome opened (minimised) -- waiting for it to load..."
    Start-Sleep -Seconds 3
} else {
    Write-Host ""
    Write-Host "  Could not find Chrome automatically. Please open Chrome manually." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
}

if ($obsExe) {
    Start-Process $obsExe -WorkingDirectory (Split-Path $obsExe)
    Write-Info "OBS opened."
} else {
    Write-Host "  Could not find OBS automatically - please open it manually." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  MANUAL ACTION - Select Chrome in OBS:" -ForegroundColor White
Write-Host "  --------------------------------------"

Write-Host ""
Write-Host "  In OBS:"
Write-Host "    1. In the Sources panel, double-click  Stream Capture"
Write-Host "    2. Click the Window dropdown and select your Chrome window"
Write-Host "       (it will appear as something like  [chrome.exe]: New Tab)"
Write-Host "    3. Click OK, then close OBS"
Write-Host ""
Read-Host "  Press Enter once you have closed OBS"

# -- Step 8: Load extension into Chrome, then register native host -------------
Write-Step "8/8" "Chrome extension + native host registration"
Write-Host ""
Write-Host "  Chrome cannot load extensions automatically - you need to do this part." -ForegroundColor White
Write-Host ""
Write-Host "  Follow these steps:"
Write-Host ""
Write-Host "    1. Click on Chrome in your taskbar to bring it up"
Write-Host "    2. In the address bar, type:" -NoNewline
Write-Host "  chrome://extensions" -ForegroundColor Cyan
Write-Host "       and press Enter"
Write-Host "    3. Turn on Developer mode (toggle, top-right corner)"
Write-Host "    4. Click  Load unpacked"
Write-Host "    5. In the file browser, navigate to:"
Write-Host "         $INSTALL_DIR\extension" -ForegroundColor Cyan
Write-Host "       and click  Select Folder"
Write-Host "    6. Copy the 32-character Extension ID shown under the extension name"
Write-Host ""

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
