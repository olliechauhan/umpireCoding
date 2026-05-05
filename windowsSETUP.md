# Umpire Coder — Windows Setup Guide

This guide walks you through setting up Umpire Coder from scratch on a Windows PC.
Follow every step in order. If something goes wrong, read the **Troubleshooting** section at the bottom.

---

## What You Will Need

- A Windows 10 or 11 PC
- Google Chrome installed
- An internet connection (for the initial setup only)

---

## Step 1 — Run the Setup Script

The setup script handles everything automatically: installs Node.js, Git, OBS Studio and ffmpeg, downloads Umpire Coder, configures OBS (WebSocket, recording folder, window capture source), and registers the background helper.

There are two short manual actions the script will guide you through:
- **Selecting your Chrome window in OBS** — the script opens Chrome in the background so it appears in the OBS source list
- **Loading the extension into Chrome** — Chrome's security model prevents this being automated; the script opens Chrome and the extension folder for you

### How to run it

1. Press the **Windows key**, type **PowerShell**, right-click **Windows PowerShell**, and click **Run as administrator**
2. Paste the following command and press **Enter**:

```
powershell -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/olliechauhan/umpireCoding/main/setup.ps1 -OutFile $env:TEMP\umpire-setup.ps1; & $env:TEMP\umpire-setup.ps1"
```

3. Press **Enter** when prompted to begin and follow the on-screen instructions
4. When the script asks you to select a Chrome window in OBS — open OBS, double-click **Stream Capture** in the Sources panel, choose your Chrome window from the dropdown, and click **OK**
5. When the script asks you to load the extension — follow the instructions on screen (Chrome and the extension folder will already be open)

> **Tip:** If you already have some of the software installed, the script detects it and skips those steps automatically.

---

## Step 2 — Configure the Extension Settings

1. Go to `chrome://extensions` and click the **reload button (↺)** on Umpire Coder
2. Click the **Umpire Coder** icon in your Chrome toolbar and click **⚙ Settings**
3. Fill in the following:

   **OBS Connection**
   - Host: `localhost`
   - Port: `4455`
   - Password: `umpire123` *(set automatically by the setup script)*
   - Click **Test Connection** — you should see ✓ Connected

   **OBS Output Settings**
   - Recording Output Directory: `C:\Users\[YourName]\Videos\umpire-recordings` *(created automatically by the setup script)*
   - Leave format, resolution, and framerate as defaults
   - Click **Apply OBS Settings**

   **Post-Processing Output**
   - Clips & Report Output Directory: choose any folder where you want clips and PDF reports saved (e.g. `C:\Users\[YourName]\Documents\umpire-clips`)

4. Click **Save Settings** at the bottom of the page

> **Tip:** You can pin the extension to your toolbar by clicking the puzzle piece icon at the top right of Chrome and clicking the pin next to Umpire Coder.

---

## Step 3 — You're Ready

Here is the workflow for each match:

### Before the match
1. Open the livestream in Chrome
2. Click the **Umpire Coder** icon in Chrome
3. Fill in the umpire names (required) and optionally the date, competition, and venue
4. Click **▶ Start Match** — OBS will launch automatically, begin recording, and the tagging overlay will appear on screen

### During the match
- Use the overlay to tag events:
  - Select an **umpire**
  - Select a **tag type**
  - Optionally add a **note**
  - Click **Log Event**
- If the livestream is delayed behind the live venue, enter the delay in seconds in the **Stream delay** field (e.g. `90` for a 90-second delay). You can adjust this at any time during the match.
- Drag the overlay by its header to move it out of the way.

### After the match
1. Click **End Match** on the overlay, then **Confirm**
2. OBS stops recording
3. The clips and PDF report are generated automatically — this may take a minute or two
4. The overlay will show ✓ green ticks when done, and display the output folder path
5. Your files will be in the **Clips & Report Output Directory** you set in Step 2

---

## Keeping Umpire Coder Up to Date

Click the **🔄** button in the top-right corner of the extension popup. If new changes are available they are downloaded and the extension reloads automatically. You do not need to open a terminal or repeat any setup steps.

---

## Troubleshooting

**"OBS connection refused" error when testing**
- Make sure OBS is open
- Check that the password in Settings matches `umpire123` (or whatever you changed it to)
- In OBS: Tools → WebSocket Server Settings → confirm Enable WebSocket server is ticked

**"ffmpeg not found on PATH"**
- Re-run the setup script — it will detect ffmpeg is missing and reinstall it
- After it finishes, fully close Chrome and reopen it

**The overlay doesn't appear after starting a match**
- Make sure the livestream tab is the active tab when you click Start Match
- Try clicking the extension icon and clicking "Show Overlay on This Tab"

**The extension disappeared from Chrome after restarting**
- Extensions loaded in Developer mode stay loaded unless you remove them. If it disappeared, go to `chrome://extensions`, click **Load unpacked**, and select the `extension` folder inside your `umpireCoding` folder.

**Clips were not cut but the PDF was generated**
- Check that the full match video exists in `C:\Users\[YourName]\Videos\umpire-recordings`
- Check that ffmpeg is installed — re-run the setup script to verify
- The PDF report is always generated regardless of whether clips are cut

**Stream Capture in OBS shows a black screen**
- In OBS, right-click **Stream Capture** in Sources → Properties
- Try changing the **Capture Method** to a different option (e.g. BitBlt instead of Windows Graphics Capture)

---

## File Structure Reference

After setup your folder structure will look like this:

```
Documents\
  umpireCoding\
    extension\          <-- loaded into Chrome
    native-host\        <-- runs automatically, no need to touch
    post-processing\    <-- runs automatically, no need to touch

Videos\
  umpire-recordings\    <-- full match recordings from OBS

Documents\
  umpire-clips\         <-- clips and PDF reports (or wherever you chose in Step 2)
    2026-04-27_NationalLeague_clips\
      JohnSmith_Positioning_00-32-15.mp4
      JaneDoe_Advantage_00-45-02.mp4
      ...
    2026-04-27_NationalLeague_report.pdf
    2026-04-27_NationalLeague_events.json
```

---

For issues or questions, open a report at [github.com/olliechauhan/umpireCoding/issues](https://github.com/olliechauhan/umpireCoding/issues)..
