# Check for Updates Feature — Mac Handoff

## What was built

A "Check for Updates" button in the extension Settings page. When pressed it runs `git pull` via the native host and shows:
- "Already up to date" — no new commits
- "UmpireCoder has been updated. Reloading in 3 seconds…" — then calls `chrome.runtime.reload()`

## Files changed

| File | Change |
|---|---|
| `extension/settings/settings.html` | Added "Updates" section with button + status span |
| `extension/settings/settings.js` | Click handler — sends `GIT_PULL` message, shows result, reloads if updated |
| `extension/background.js` | `GIT_PULL` case — forwards to native host via `sendNativeMessage` |
| `native-host/host.js` | Windows `GIT_PULL` handler |
| `mac/native-host/host.js` | Mac `GIT_PULL` handler — **THIS IS THE BROKEN ONE** |

## Architecture

```
Settings page button click
  → chrome.runtime.sendMessage({ type: 'GIT_PULL' })
    → background.js GIT_PULL case
      → sendNativeMessage('com.umpirecoder.postprocess', { type: 'GIT_PULL' })
        → mac/native-host/host.js
          → runs git pull in repo root
          → returns { success: true, upToDate: true/false }
            OR { success: false, error: '...' }
```

## What fixed it on Windows

Windows had the same error. Root cause: Chrome's subprocess inherits a **stripped PATH** that doesn't include Git or even cmd.exe. The fix was to call `cmd.exe` via its absolute path using `process.env.ComSpec`:

```javascript
// Working Windows handler (native-host/host.js)
if (msg.type === 'GIT_PULL') {
  try {
    const repoDir = join(__dirname, '..');
    const cmdExe = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';
    const stdout = execFileSync(cmdExe, ['/d', '/s', '/c', 'git pull'], {
      cwd: repoDir, encoding: 'utf8', timeout: 30_000,
    });
    const upToDate = stdout.includes('Already up to date');
    sendMessage({ success: true, upToDate });
  } catch (err) {
    const detail = (err.stdout || err.stderr || '').toString().trim() || err.message;
    sendMessage({ success: false, error: detail });
  }
  return;
}
```

## Mac error

Same error as Windows had: `The "path" argument must be of type string. Received undefined`

## Current Mac handler (broken)

In `mac/native-host/host.js`, the current GIT_PULL handler tries multiple git binary candidates in a loop without `shell`, and has NO outer try/catch — so if `join(__dirname, '..', '..')` throws (because Chrome's env causes `__dirname` to be undefined), it propagates uncaught.

**Note on Mac repo root:** Mac host.js lives at `mac/native-host/host.js`, so repo root = `join(__dirname, '..', '..')` (two levels up, unlike Windows which is one level up).

## What to fix

Apply the same pattern as Windows but for Mac — use `/bin/sh` with explicit path instead of searching PATH:

```javascript
// Suggested fix for mac/native-host/host.js
if (msg.type === 'GIT_PULL') {
  try {
    const repoDir = join(__dirname, '..', '..');
    const sh = '/bin/sh';
    const stdout = execFileSync(sh, ['-c', 'git pull'], {
      cwd: repoDir, encoding: 'utf8', timeout: 30_000,
    });
    const upToDate = stdout.includes('Already up to date');
    dbg('GIT_PULL success upToDate=' + upToDate);
    sendMessage({ success: true, upToDate });
  } catch (err) {
    const detail = (err.stdout || err.stderr || '').toString().trim() || err.message;
    dbg('GIT_PULL error: ' + detail);
    sendMessage({ success: false, error: detail });
  }
  return;
}
```

`/bin/sh` is always at that exact path on Mac/Linux regardless of Chrome's PATH. `/bin/sh` will then find `git` via the user's full shell PATH (which includes Homebrew git, Xcode CLI tools git, etc.).

## Diagnosing which host Chrome uses on Mac

On Mac, Chrome reads native host manifests from:
```
~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.umpirecoder.postprocess.json
```

Check it:
```bash
cat ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.umpirecoder.postprocess.json
```

The `path` field shows which `host.sh` Chrome is running. The `host.sh` then runs `host.js` from the same directory. That directory is the actual repo — run `git pull` there if doing a manual update.

## Mac debug log

The Mac host.js writes a debug log. Check it at the path set by `UC_LOG` env var, or look in the `mac/native-host/` directory for `debug.log`.

## Rollback commit

If needed, roll back to: `6ca9b20` (before the update button was added, v1.0.14)

## Current main branch tip

`7d467d3` — v1.0.18 (dummy bump for update detection test)

## Key rule

Always bump `extension/manifest.json` version on every push that touches the extension. Use `node scripts/bump-version.js` from repo root.
