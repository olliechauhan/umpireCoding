#!/bin/bash
# install.sh - one-time setup for Umpire Coder native messaging host (macOS)
# Run once from the mac/native-host directory:
#   cd ~/Documents/umpireCoding/mac/native-host
#   chmod +x install.sh
#   ./install.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
POST_PROCESS_DIR="$(cd "$SCRIPT_DIR/../../post-processing" && pwd)"
HOST_SH="$SCRIPT_DIR/host.sh"
MANIFEST_NAME="com.umpirecoder.postprocess"
MANIFEST_PATH="$SCRIPT_DIR/$MANIFEST_NAME.json"
CHROME_HOSTS_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"

# Locate node — check common install locations if not on PATH
NODE_PATH="$(which node 2>/dev/null)"
if [ -z "$NODE_PATH" ]; then
  for candidate in /opt/homebrew/bin/node /usr/local/bin/node; do
    if [ -x "$candidate" ]; then NODE_PATH="$candidate"; break; fi
  done
fi
if [ -z "$NODE_PATH" ]; then
  echo "Error: node not found. Make sure Node.js is installed (https://nodejs.org) and try again."
  exit 1
fi

echo ""
echo "Umpire Coder - Native Host Setup"
echo "================================"
echo ""

# Step 1: npm install
echo "Step 1/3  Installing post-processing dependencies..."
cd "$POST_PROCESS_DIR"
npm install --silent
echo "          pdfkit installed."

# Step 2: Get extension ID
echo ""
echo "Step 2/3  Extension ID"
echo "  1. Open Chrome and go to: chrome://extensions"
echo "  2. Enable Developer mode (top-right toggle)"
echo "  3. Find 'Umpire Coder' and copy its ID (32-character string)"
echo ""
read -p "  Paste extension ID: " EXT_ID
EXT_ID="$(echo "$EXT_ID" | tr -d '[:space:]')"

if [ "${#EXT_ID}" -ne 32 ]; then
    echo "Warning: Extension ID is ${#EXT_ID} characters - expected 32. Continuing anyway."
fi

# Step 3: Write manifest and register with Chrome
echo ""
echo "Step 3/3  Registering native messaging host..."

# Write host.sh with the absolute node path so Chrome can launch it
# without inheriting the user's shell PATH.
cat > "$HOST_SH" <<SCRIPT
#!/bin/bash
exec "$NODE_PATH" "\$(dirname "\$0")/host.js"
SCRIPT
chmod +x "$HOST_SH"

cat > "$MANIFEST_PATH" <<EOF
{
  "name": "$MANIFEST_NAME",
  "description": "Umpire Coder post-processing host",
  "path": "$HOST_SH",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXT_ID/"]
}
EOF

mkdir -p "$CHROME_HOSTS_DIR"
cp "$MANIFEST_PATH" "$CHROME_HOSTS_DIR/$MANIFEST_NAME.json"

echo ""
echo "Done!"
echo "  Manifest: $CHROME_HOSTS_DIR/$MANIFEST_NAME.json"
echo ""
echo "Reload the Umpire Coder extension in Chrome (chrome://extensions -> reload button)."
echo "Post-processing will now run automatically when you end a match."
echo ""
