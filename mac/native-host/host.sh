#!/bin/bash
# Launcher for Umpire Coder native messaging host.
# Searches common node locations because Chrome uses a restricted PATH
# that does not include Homebrew's bin directories.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

for dir in \
  /usr/local/bin \
  /opt/homebrew/bin \
  /opt/homebrew/opt/node/bin \
  /opt/homebrew/opt/node@20/bin \
  /opt/homebrew/opt/node@18/bin \
  /usr/bin; do
  if [ -x "$dir/node" ]; then
    exec "$dir/node" "$SCRIPT_DIR/host.js"
  fi
done

# Last resort: try whatever is on PATH
exec node "$SCRIPT_DIR/host.js"
