# test-obs-config.ps1 - DEV TOOL ONLY
#
# Overwrites the Umpire Coder OBS config files (global.ini, profile basic.ini,
# scene collection JSON) and opens OBS so you can verify the result.
# Run this as many times as needed without touching the OBS install.
#
# Usage (no admin needed):
#   powershell -ExecutionPolicy Bypass -File .\scripts\test-obs-config.ps1

$ErrorActionPreference = 'Stop'
$OBS_PASSWORD  = "umpire123"
$INSTALL_DIR   = Join-Path $env:USERPROFILE "Documents\umpireCoding"
$recordingPath = Join-Path $env:USERPROFILE "Videos\umpire-recordings"

# -- OBS paths ----------------------------------------------------------------
$obsConfig   = Join-Path $env:APPDATA "obs-studio"
$globalIni   = Join-Path $obsConfig "global.ini"
$profileDir  = Join-Path $obsConfig "basic\profiles\Umpire Coder"
$profileIni  = Join-Path $profileDir "basic.ini"
$scenesDir   = Join-Path $obsConfig "basic\scenes"
$sceneFile   = Join-Path $scenesDir "Umpire Coder.json"

$obsPaths = @(
    "${env:ProgramFiles}\obs-studio\bin\64bit\obs64.exe",
    "${env:ProgramFiles(x86)}\obs-studio\bin\64bit\obs64.exe"
)
$obsExe = $obsPaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $obsExe) {
    Write-Host "OBS not found. Install it first." -ForegroundColor Red
    exit 1
}

# -- Helper: patch one key in an INI file -------------------------------------
function Set-IniValue {
    param([string]$Path, [string]$Section, [string]$Key, [string]$Value)
    $dir = Split-Path $Path
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $raw   = if (Test-Path $Path) { Get-Content $Path -Raw -Encoding UTF8 } else { "" }
    $lines = if ($raw) { $raw -split "`r?`n" } else { @() }
    $result = [System.Collections.Generic.List[string]]::new()
    $inSection = $false; $sectionFound = $false; $keyWritten = $false
    foreach ($line in $lines) {
        if ($line -match "^\[$([regex]::Escape($Section))\]\s*$") {
            $inSection = $true; $sectionFound = $true; $result.Add($line); continue
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
    if (-not $sectionFound)   { $result.Add("[$Section]"); $result.Add("$Key=$Value") }
    elseif (-not $keyWritten) { $result.Add("$Key=$Value") }
    [System.IO.File]::WriteAllText($Path, ($result -join "`r`n"), [System.Text.Encoding]::UTF8)
}

# -- Kill OBS if running -------------------------------------------------------
$obsProcs = Get-Process -Name "obs64","obs32" -ErrorAction SilentlyContinue
if ($obsProcs) {
    Write-Host "OBS is running - closing it before applying config..." -ForegroundColor Yellow
    $obsProcs | Stop-Process -Force
    Start-Sleep -Seconds 2
}

# -- Create directories --------------------------------------------------------
foreach ($d in @($obsConfig, $profileDir, $scenesDir, $recordingPath)) {
    if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
}

# -- global.ini ---------------------------------------------------------------
Write-Host ""
Write-Host "Writing global.ini..." -ForegroundColor Cyan

Set-IniValue $globalIni "General"      "LastVersion"         "30030000"
Set-IniValue $globalIni "OBSWebSocket" "ServerEnabled"       "true"
Set-IniValue $globalIni "OBSWebSocket" "ServerPort"          "4455"
Set-IniValue $globalIni "OBSWebSocket" "AuthRequired"        "true"
Set-IniValue $globalIni "OBSWebSocket" "ServerPassword"      $OBS_PASSWORD
Set-IniValue $globalIni "OBSWebSocket" "AlertsEnabled"       "false"
Set-IniValue $globalIni "Basic"        "Profile"             "Umpire Coder"
Set-IniValue $globalIni "Basic"        "ProfileDir"          "Umpire Coder"
Set-IniValue $globalIni "Basic"        "SceneCollection"     "Umpire Coder"
Set-IniValue $globalIni "Basic"        "SceneCollectionFile" "Umpire Coder"
# Fix [Locations] section -- OBS uses this (not [Basic]) to resolve where profiles
# and scene collections live. A previous OBS run wrote these pointing at AppData\Roaming
# directly, so OBS was looking in the wrong folder and falling back to all-disabled defaults.
Set-IniValue $globalIni "Locations"    "Configuration"       $obsConfig
Set-IniValue $globalIni "Locations"    "Profiles"            (Join-Path $obsConfig "basic\profiles")
Set-IniValue $globalIni "Locations"    "SceneCollections"    (Join-Path $obsConfig "basic\scenes")
Set-IniValue $globalIni "Locations"    "PluginManagerSettings" $obsConfig

Write-Host "  $globalIni" -ForegroundColor DarkGray

# -- profile basic.ini ---------------------------------------------------------
# Write as a complete fresh file so there is no stale content OBS could
# misread. Patching leaves the risk of duplicate keys or wrong section order.
Write-Host "Writing profile basic.ini (fresh)..." -ForegroundColor Cyan

$basicIniContent = @"
[Output]
Mode=Simple

[SimpleOutput]
FilePath=$recordingPath

[Audio]
DesktopDevice1=default
DesktopDevice2=disabled
AuxDevice1=default
AuxDevice2=disabled
AuxDevice3=disabled
AuxDevice4=disabled
MonitoringDeviceId=default
MonitoringDeviceName=
"@

[System.IO.File]::WriteAllText($profileIni, $basicIniContent, [System.Text.Encoding]::UTF8)

# Diagnostic -- print file contents so we can verify the writes
Write-Host "  $profileIni" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  --- basic.ini contents ---" -ForegroundColor DarkGray
Get-Content $profileIni | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
Write-Host "  --------------------------" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  --- global.ini (full) ---" -ForegroundColor DarkGray
Get-Content $globalIni | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
Write-Host "  -------------------------" -ForegroundColor DarkGray

# -- scene collection JSON -----------------------------------------------------
Write-Host "Writing scene collection JSON..." -ForegroundColor Cyan

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
Write-Host "  $sceneFile" -ForegroundColor DarkGray

# -- Open Chrome (minimised) then OBS ----------------------------------------
$chromePaths = @(
    "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$chromeExe = $chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($chromeExe) {
    Start-Process $chromeExe -ArgumentList "--new-window https://www.google.com" -WindowStyle Minimized
    Write-Host "Chrome opened (minimised) -- waiting for it to register..." -ForegroundColor Cyan
    Start-Sleep -Seconds 3
} else {
    Write-Host "Chrome not found automatically -- open it manually before checking OBS." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
}

Write-Host ""
Write-Host "Config written. Opening OBS..." -ForegroundColor Green
Write-Host ""
Write-Host "  Check for:"
Write-Host "    - Scene collection 'Umpire Coder' in the top menu bar"
Write-Host "    - 'Match Recording' scene in the Scenes panel"
Write-Host "    - 'Stream Capture' source in the Sources panel"
Write-Host "    - Audio mixer: Desktop Audio (active) + Mic/Aux (muted)"
Write-Host ""
Write-Host "  When done, close OBS and re-run this script to apply changes."
Write-Host ""

Start-Process $obsExe -WorkingDirectory (Split-Path $obsExe)
