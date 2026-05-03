#Requires -RunAsAdministrator
# setup.ps1 - Umpire Coder one-shot setup script
#
# Downloads and installs all required software, clones the repo, and registers
# the native messaging host with Chrome. The only manual step is loading the
# unpacked Chrome extension (Chrome's security model prevents automation of this).
#
# Run from PowerShell as Administrator:
#   powershell -ExecutionPolicy Bypass -File setup.ps1

$ErrorActionPreference = 'Stop'

$REPO_URL   = "https://github.com/olliechauhan/umpireCoding.git"
$INSTALL_DIR = Join-Path $env:USERPROFILE "Documents\umpireCoding"

function Write-Step  { param($n, $msg) Write-Host "`nStep $n  $msg" -ForegroundColor Yellow }
function Write-OK    { param($msg) Write-Host "       OK  $msg" -ForegroundColor Green }
function Write-Skip  { param($msg) Write-Host "     SKIP  $msg" -ForegroundColor DarkGray }
function Write-Info  { param($msg) Write-Host "           $msg" }

function Reload-Path {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path", "User")
}

function Install-Winget {
    param($Id, $Name)
    $result = winget list --id $Id --accept-source-agreements 2>&1 | Out-String
    if ($result -match [regex]::Escape($Id)) {
        Write-Skip "$Name already installed."
    } else {
        Write-Info "Installing $Name..."
        winget install --id $Id --accept-package-agreements --accept-source-agreements --silent
        Reload-Path
        Write-OK "$Name installed."
    }
}

Clear-Host
Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "    Umpire Coder — Automated Setup" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  This will install all required software and configure"
Write-Host "  Umpire Coder. It will take a few minutes."
Write-Host ""
Write-Host "  Press Enter to begin, or Ctrl+C to cancel." -NoNewline
Read-Host

# ── Step 1: Node.js ──────────────────────────────────────────────────────────
Write-Step "1/7" "Node.js (LTS)"
Install-Winget "OpenJS.NodeJS.LTS" "Node.js"

# ── Step 2: Git ──────────────────────────────────────────────────────────────
Write-Step "2/7" "Git"
Install-Winget "Git.Git" "Git"

# ── Step 3: OBS Studio ───────────────────────────────────────────────────────
Write-Step "3/7" "OBS Studio"
Install-Winget "OBSProject.OBSStudio" "OBS Studio"

# ── Step 4: ffmpeg ───────────────────────────────────────────────────────────
Write-Step "4/7" "ffmpeg"
Install-Winget "Gyan.FFmpeg" "ffmpeg"
Reload-Path

# ── Step 5: Clone / update repo ──────────────────────────────────────────────
Write-Step "5/7" "Umpire Coder files"
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

# ── Step 6: npm install ──────────────────────────────────────────────────────
Write-Step "6/7" "Post-processing dependencies (pdfkit)"
Push-Location (Join-Path $INSTALL_DIR "post-processing")
npm install --silent
Pop-Location
Write-OK "Dependencies installed."

# ── Step 7: Load extension into Chrome, then register native host ─────────────
Write-Step "7/7" "Chrome extension + native host registration"
Write-Host ""
Write-Host "  Chrome cannot load extensions automatically — you need to do this part." -ForegroundColor White
Write-Host ""
Write-Host "  We've opened Chrome and the extension folder for you." -ForegroundColor White
Write-Host ""
Write-Host "  Follow these steps:"
Write-Host "    1. In Chrome, turn on Developer mode (toggle, top-right corner)"
Write-Host "    2. Click  Load unpacked"
Write-Host "    3. The file browser should already be showing the extension folder."
Write-Host "       If not, navigate to:"
Write-Host "         $INSTALL_DIR\extension" -ForegroundColor Cyan
Write-Host "    4. Click  Select Folder"
Write-Host "    5. Copy the 32-character Extension ID shown under the extension name"
Write-Host ""

# Open Chrome to the extensions page and File Explorer to the extension folder
try { Start-Process "chrome.exe" -ArgumentList "--new-window chrome://extensions" } catch {}
Start-Process "explorer.exe" -ArgumentList (Join-Path $INSTALL_DIR "extension")

Write-Host "  Once you have the Extension ID, come back here." -ForegroundColor White
Write-Host ""
$extId = (Read-Host "  Paste Extension ID and press Enter").Trim()

if ($extId.Length -ne 32) {
    Write-Warning "Extension ID is $($extId.Length) characters — expected 32. Continuing anyway."
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

# ── Done ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ============================================" -ForegroundColor Green
Write-Host "    Setup complete!" -ForegroundColor Green
Write-Host "  ============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Two quick steps left before your first match:" -ForegroundColor White
Write-Host ""
Write-Host "  In Chrome:"
Write-Host "    1. Go to chrome://extensions and click the reload button (↺) on Umpire Coder"
Write-Host "    2. Click the Umpire Coder icon → Settings"
Write-Host "    3. Enter your OBS connection password and recording folder, then Save"
Write-Host ""
Write-Host "  In OBS:"
Write-Host "    1. Tools → WebSocket Server Settings"
Write-Host "    2. Tick  Enable WebSocket server"
Write-Host "    3. Tick  Enable Authentication  and set a password (e.g. umpire123)"
Write-Host "    4. Leave port as 4455 → OK"
Write-Host "    5. File → Settings → Output → set your Recording Path"
Write-Host ""
Write-Host "  See windowsSETUP.md for full instructions and troubleshooting."
Write-Host ""
