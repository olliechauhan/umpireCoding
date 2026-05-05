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
# Step 4: Clone / update repo
# ---------------------------------------------------------------------------

step "4/8" "Umpire Coder files"
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
# Step 5: ffmpeg (static binary from evermeet.cx)
# ---------------------------------------------------------------------------

step "5/8" "ffmpeg"
FFMPEG_BIN="$INSTALL_DIR/bin/ffmpeg"
if [ -x "$FFMPEG_BIN" ]; then
    skip "ffmpeg already downloaded."
else
    mkdir -p "$INSTALL_DIR/bin"
    info "Downloading ffmpeg static build..."
    curl -fsSL "https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip" -o /tmp/ffmpeg-mac.zip
    unzip -q -o /tmp/ffmpeg-mac.zip -d "$INSTALL_DIR/bin"
    rm -f /tmp/ffmpeg-mac.zip
    chmod +x "$FFMPEG_BIN"
    xattr -d com.apple.quarantine "$FFMPEG_BIN" 2>/dev/null || true
    ok "ffmpeg downloaded."
fi
export PATH="$INSTALL_DIR/bin:$PATH"

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

ok "OBS configured. Open it from your Dock before starting a match — the extension sets the capture source automatically."

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

MANIFEST_NAME="com.umpirecoder.postprocess"
CHROME_HOSTS_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"

# Install native host and post-processing to ~/.umpire-coder — this directory
# is outside ~/Documents so Chrome's sandboxed subprocess can access it freely.
UC_DIR="$HOME/.umpire-coder"
mkdir -p "$UC_DIR/native-host" "$UC_DIR/post-processing" "$UC_DIR/bin"

cp "$INSTALL_DIR/mac/native-host/host.js"     "$UC_DIR/native-host/host.js"
cp "$INSTALL_DIR/mac/native-host/package.json" "$UC_DIR/native-host/package.json"
cp -r "$INSTALL_DIR/post-processing/."        "$UC_DIR/post-processing/"
(cd "$UC_DIR/post-processing" && npm install --silent)
[ -f "$INSTALL_DIR/bin/ffmpeg" ] && cp "$INSTALL_DIR/bin/ffmpeg" "$UC_DIR/bin/ffmpeg"

# Write host.sh wrapper inside ~/.umpire-coder (not in ~/Documents)
UC_HOST_SH="$UC_DIR/native-host/host.sh"
cat > "$UC_HOST_SH" <<'HOSTEOF'
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export UC_POST_DIR="$SCRIPT_DIR/../post-processing"
export UC_LOG="$SCRIPT_DIR/debug.log"
export UC_REPO_DIR="__UC_REPO_DIR__"
[ -d "$SCRIPT_DIR/../bin" ] && export PATH="$SCRIPT_DIR/../bin:$PATH"
[ -f "$SCRIPT_DIR/../bin/ffmpeg" ] && export UC_FFMPEG_PATH="$SCRIPT_DIR/../bin/ffmpeg"
for dir in /usr/local/bin /opt/homebrew/bin /opt/homebrew/opt/node/bin \
           /opt/homebrew/opt/node@20/bin /opt/homebrew/opt/node@18/bin /usr/bin; do
  [ -x "$dir/node" ] && exec "$dir/node" "$SCRIPT_DIR/host.js"
done
exec node "$SCRIPT_DIR/host.js"
HOSTEOF
sed -i '' "s|__UC_REPO_DIR__|$INSTALL_DIR|g" "$UC_HOST_SH"
chmod +x "$UC_HOST_SH"

mkdir -p "$CHROME_HOSTS_DIR"
cat > "$CHROME_HOSTS_DIR/$MANIFEST_NAME.json" <<EOF
{
  "name": "$MANIFEST_NAME",
  "description": "Umpire Coder post-processing host",
  "path": "$UC_HOST_SH",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXT_ID/"]
}
EOF

ok "Native messaging host registered (installed to ~/.umpire-coder)."

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
printf "  See macSETUP.md for the full workflow guide.\n"
printf "\n"
