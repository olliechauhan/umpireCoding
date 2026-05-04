#!/bin/bash
# setup.sh - Umpire Coder one-shot setup script (macOS)
#
# Installs all required software, clones the repo, pre-configures OBS, and
# registers the native messaging host with Chrome. The only two manual steps
# are: selecting the Chrome window in OBS (the script opens both and guides
# you), and loading the unpacked extension into Chrome (Chrome's security
# model prevents automation of this).
#
# Run from Terminal:
#   chmod +x setup.sh && ./setup.sh

set -e

REPO_URL="https://github.com/olliechauhan/umpireCoding.git"
INSTALL_DIR="$HOME/Documents/umpireCoding"
OBS_PASSWORD="umpire123"
RECORDING_DIR="$HOME/Movies/umpire-recordings"
OBS_CONFIG_DIR="$HOME/Library/Application Support/obs-studio"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

step()  { printf "\n\033[33mStep %s  %s\033[0m\n" "$1" "$2"; }
ok()    { printf "       \033[32mOK\033[0m  %s\n" "$1"; }
skip()  { printf "     \033[90mSKIP\033[0m  %s\n" "$1"; }
info()  { printf "           %s\n" "$1"; }
warn()  { printf "\n  \033[33mWARNING: %s\033[0m\n" "$1"; }

brew_install() {
    local formula="$1"
    local name="$2"
    local cask="${3:-}"   # pass "cask" for --cask installs

    if [ "$cask" = "cask" ]; then
        if brew list --cask "$formula" &>/dev/null 2>&1; then
            skip "$name already installed."
            return
        fi
        info "Installing $name..."
        if brew install --cask "$formula"; then
            ok "$name installed."
        else
            warn "$name installation failed. Install it manually from its website then re-run."
        fi
    else
        if brew list "$formula" &>/dev/null 2>&1; then
            skip "$name already installed."
            return
        fi
        info "Installing $name..."
        if brew install "$formula"; then
            ok "$name installed."
        else
            warn "$name installation failed. Install it manually then re-run."
        fi
    fi
}

# ---------------------------------------------------------------------------
# Intro
# ---------------------------------------------------------------------------

clear
printf "\n"
printf "  \033[36m============================================\033[0m\n"
printf "  \033[36m  Umpire Coder - Automated Setup (macOS)\033[0m\n"
printf "  \033[36m============================================\033[0m\n"
printf "\n"
printf "  This will install all required software and configure\n"
printf "  Umpire Coder. It will take a few minutes.\n"
printf "\n"
printf "  Press Enter to begin, or Ctrl+C to cancel."
read -r

# ---------------------------------------------------------------------------
# Prerequisite: Homebrew
# ---------------------------------------------------------------------------

printf "\n"
if ! command -v brew &>/dev/null; then
    info "Homebrew not found - installing..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # Add Homebrew to PATH for Apple Silicon Macs
    if [ -f /opt/homebrew/bin/brew ]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
    ok "Homebrew installed."
else
    skip "Homebrew already installed."
fi

# ---------------------------------------------------------------------------
# Step 1: Node.js
# ---------------------------------------------------------------------------

step "1/8" "Node.js (LTS)"
if command -v node &>/dev/null; then
    skip "Node.js already installed ($(node --version))."
else
    brew_install "node" "Node.js"
fi

# ---------------------------------------------------------------------------
# Step 2: Git
# ---------------------------------------------------------------------------

step "2/8" "Git"
if command -v git &>/dev/null; then
    skip "Git already installed ($(git --version | awk '{print $3}'))."
else
    brew_install "git" "Git"
fi

# ---------------------------------------------------------------------------
# Step 3: OBS Studio
# ---------------------------------------------------------------------------

step "3/8" "OBS Studio"
if [ -d "/Applications/OBS.app" ]; then
    skip "OBS Studio already installed."
else
    brew_install "obs" "OBS Studio" "cask"
fi

# ---------------------------------------------------------------------------
# Step 4: ffmpeg
# ---------------------------------------------------------------------------

step "4/8" "ffmpeg"
if command -v ffmpeg &>/dev/null; then
    skip "ffmpeg already installed ($(ffmpeg -version 2>&1 | head -1 | awk '{print $3}'))."
else
    info "ffmpeg has many dependencies -- this step may take several minutes."
    brew install ffmpeg
    ok "ffmpeg installed."
fi

# ---------------------------------------------------------------------------
# Step 5: Clone / update repo
# ---------------------------------------------------------------------------

step "5/8" "Umpire Coder files"
if [ -d "$INSTALL_DIR/.git" ]; then
    info "Repository already exists at $INSTALL_DIR"
    info "Pulling latest updates..."
    git -C "$INSTALL_DIR" pull --quiet
    ok "Repository up to date."
else
    info "Downloading to $INSTALL_DIR ..."
    git clone "$REPO_URL" "$INSTALL_DIR" --quiet
    ok "Files downloaded."
fi

# ---------------------------------------------------------------------------
# Step 6: npm install
# ---------------------------------------------------------------------------

step "6/8" "Post-processing dependencies (pdfkit)"
(cd "$INSTALL_DIR/post-processing" && npm install --silent)
ok "Dependencies installed."

# ---------------------------------------------------------------------------
# Step 7: Configure OBS
# ---------------------------------------------------------------------------

step "7/8" "Configuring OBS"

PROFILE_DIR="$OBS_CONFIG_DIR/basic/profiles/Umpire Coder"
SCENES_DIR="$OBS_CONFIG_DIR/basic/scenes"
SCENE_FILE="$SCENES_DIR/Umpire Coder.json"
GLOBAL_INI="$OBS_CONFIG_DIR/global.ini"
PROFILE_INI="$PROFILE_DIR/basic.ini"
USER_INI="$PROFILE_DIR/user.ini"

mkdir -p "$OBS_CONFIG_DIR" "$PROFILE_DIR" "$SCENES_DIR" "$RECORDING_DIR"

# Derive LastVersion from the installed OBS bundle so OBS skips migration.
OBS_VER_STR=$(defaults read /Applications/OBS.app/Contents/Info CFBundleShortVersionString 2>/dev/null || echo "")
if [ -n "$OBS_VER_STR" ]; then
    IFS='.' read -r obs_major obs_minor obs_patch _ <<< "$OBS_VER_STR"
    OBS_LAST_VER=$(( obs_major * 1000000 + obs_minor * 10000 + obs_patch * 100 ))
else
    OBS_LAST_VER=0
fi

cat > "$GLOBAL_INI" <<EOF
[General]
LastVersion=$OBS_LAST_VER
Pre31Migrated=true

[OBSWebSocket]
ServerEnabled=true
ServerPort=4455
AuthRequired=true
ServerPassword=$OBS_PASSWORD
AlertsEnabled=false
EOF

# SampleRate and ChannelSetup are required for OBS to treat [Audio] as valid.
cat > "$PROFILE_INI" <<EOF
[Output]
Mode=Simple

[SimpleOutput]
FilePath=$RECORDING_DIR

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
EOF

# OBS 31+ reads per-user settings from user.ini; mirror audio devices here too.
cat > "$USER_INI" <<EOF
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
EOF

# Scene collection: Stream Capture source + Mic/Aux muted.
# Mac uses coreaudio_* source IDs instead of wasapi_*.
cat > "$SCENE_FILE" <<'ENDJSON'
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
            "id": "coreaudio_output_capture",
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
            "versioned_id": "coreaudio_output_capture",
            "volume": 1.0
        },
        {
            "balance": 0.5,
            "deinterlace_field_order": 0,
            "deinterlace_mode": 0,
            "enabled": true,
            "flags": 0,
            "hotkeys": {},
            "id": "coreaudio_input_capture",
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
            "versioned_id": "coreaudio_input_capture",
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
ENDJSON

ok "WebSocket enabled  (port 4455, password: $OBS_PASSWORD)"
ok "Recording path set ($RECORDING_DIR)"
ok "Scene 'Match Recording' created  (Stream Capture + Mic/Aux muted)"

# Open Chrome first so it appears in OBS's window capture list
if [ -d "/Applications/Google Chrome.app" ]; then
    open -a "Google Chrome" --args --new-window "https://www.google.com"
    info "Chrome opened - waiting for it to load..."
    sleep 3
else
    printf "\n  \033[33mCould not find Chrome. Please open it manually.\033[0m\n"
    sleep 2
fi

# Launch OBS with the pre-configured profile and scene collection
if [ -d "/Applications/OBS.app" ]; then
    /Applications/OBS.app/Contents/MacOS/OBS \
        --profile "Umpire Coder" \
        --collection "Umpire Coder" &>/dev/null &
    info "OBS opened."
else
    printf "\n  \033[33mCould not find OBS - please open it manually.\033[0m\n"
fi

printf "\n"
printf "  \033[1mMANUAL ACTION - Select Chrome in OBS:\033[0m\n"
printf "  --------------------------------------\n"
printf "\n"
printf "  In OBS:\n"
printf "    1. In the Sources panel, double-click  Stream Capture\n"
printf "    2. Click the Window dropdown and select your Chrome window\n"
printf "       (it will appear as something like  Google Chrome - New Tab)\n"
printf "    3. Click OK, then close OBS\n"
printf "\n"
printf "  Press Enter once you have closed OBS"
read -r

# ---------------------------------------------------------------------------
# Step 8: Chrome extension + native host registration
# ---------------------------------------------------------------------------

step "8/8" "Chrome extension + native host registration"
printf "\n"
printf "  Chrome cannot load extensions automatically - you need to do this part.\n"
printf "\n"
printf "  Follow these steps:\n"
printf "\n"
printf "    1. Click on Chrome in your Dock to bring it up\n"
printf "    2. In the address bar, type  \033[36mchrome://extensions\033[0m  and press Enter\n"
printf "    3. Turn on Developer mode (toggle, top-right corner)\n"
printf "    4. Click  Load unpacked\n"
printf "    5. In the file browser, press Cmd+Shift+G, paste:\n"
printf "         \033[36m%s/extension\033[0m\n" "$INSTALL_DIR"
printf "       and press Enter, then click  Open\n"
printf "    6. Copy the 32-character Extension ID shown under the extension name\n"
printf "\n"

open "$INSTALL_DIR/extension"

printf "  Once you have the Extension ID, come back here.\n"
printf "\n"
printf "  Paste Extension ID and press Enter: "
read -r EXT_ID
EXT_ID="$(echo "$EXT_ID" | tr -d '[:space:]')"

if [ "${#EXT_ID}" -ne 32 ]; then
    warn "Extension ID is ${#EXT_ID} characters - expected 32. Continuing anyway."
fi

HOST_DIR="$INSTALL_DIR/mac/native-host"
HOST_SH="$HOST_DIR/host.sh"
MANIFEST_NAME="com.umpirecoder.postprocess"
MANIFEST_FILE="$HOST_DIR/$MANIFEST_NAME.json"
CHROME_HOSTS_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"

chmod +x "$HOST_SH"

cat > "$MANIFEST_FILE" <<EOF
{
  "name": "$MANIFEST_NAME",
  "description": "Umpire Coder post-processing host",
  "path": "$HOST_SH",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXT_ID/"]
}
EOF

mkdir -p "$CHROME_HOSTS_DIR"
cp "$MANIFEST_FILE" "$CHROME_HOSTS_DIR/$MANIFEST_NAME.json"

ok "Native messaging host registered."

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

printf "\n"
printf "  \033[32m============================================\033[0m\n"
printf "  \033[32m  Setup complete!\033[0m\n"
printf "  \033[32m============================================\033[0m\n"
printf "\n"
printf "  Last steps in Chrome:\n"
printf "    1. Go to chrome://extensions and click the reload button on Umpire Coder\n"
printf "    2. Click the Umpire Coder icon, then Settings, and fill in:\n"
printf "         OBS Password         :  %s\n" "$OBS_PASSWORD"
printf "         Recording folder     :  %s\n" "$RECORDING_DIR"
printf "         Clips & reports folder  :  (choose any folder you like)\n"
printf "    3. Click Save Settings\n"
printf "\n"
printf "  See mac/macSETUP.md for the full workflow guide.\n"
printf "\n"
