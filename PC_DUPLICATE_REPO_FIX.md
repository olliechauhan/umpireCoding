# PC Duplicate Repo Fix

## What happened

There are two copies of the umpireCoding repo on this PC:

| Location | Used for |
|---|---|
| `~\umpirecoding\` | Chrome extension (loaded here) |
| `~\Documents\umpireCoding\` | Native messaging host (registered here) |

Because the native host and the extension are in different folders, **Check for Updates** pulls to the wrong location — the extension never actually updates. The two copies will also drift apart over time.

## Fix (automated)

A PowerShell script will:
1. Re-register the native messaging host from the correct location (`~\umpirecoding`)
2. Run `npm install` for post-processing in the correct location
3. Offer to delete the duplicate repo at `~\Documents\umpireCoding`

### How to run it

1. Open **PowerShell** (press Windows key, type `PowerShell`, press Enter)

2. Paste this and press **Enter** to allow the script to run:
   ```
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   ```

3. Paste this and press **Enter**:
   ```
   ~\umpirecoding\scripts\fix-pc-setup.ps1
   ```

4. The script will re-register the native host automatically. If it cannot read the extension ID from the existing registration, it will ask you to paste it from `chrome://extensions`.

5. When asked **"Remove it now? (y/n)"** for the duplicate repo — type `y` and press **Enter** to delete `~\Documents\umpireCoding`.

6. When the script finishes:
   - Open Chrome → `chrome://extensions`
   - Click the **reload arrow (↺)** next to Umpire Coder
   - The version should now match the Mac version

---

After this fix, **Check for Updates** in the extension Settings page will pull to `~\umpirecoding` and everything will stay in sync.
