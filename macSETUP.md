# Umpire Coder — Setup Guide (macOS)

This guide will walk you through setting up Umpire Coder from scratch on a Mac.
Follow every step in order. If something goes wrong, read the **Troubleshooting** section at the bottom.

---

## What You Will Need

- A Mac running macOS 12 (Monterey) or later
- Google Chrome installed
- An internet connection (for the initial setup only)

---

## Step 1 — Run the Setup Script

The setup script handles everything automatically: installs Homebrew, Node.js, Git, OBS Studio and ffmpeg, downloads Umpire Coder, configures OBS (WebSocket, recording folder, window capture source), and registers the native messaging host.

There are two short manual actions the script will guide you through:
- **Selecting your Chrome window in OBS** — the script opens Chrome in the background so it appears in the OBS source list
- **Loading the extension into Chrome** — Chrome's security model prevents this being automated; the script opens Chrome and the extension folder for you

### How to run it

1. Open **Terminal** (press Cmd + Space, type `Terminal`, press Enter)
2. Paste the following command and press **Enter**:

```
bash <(curl -fsSL https://raw.githubusercontent.com/olliechauhan/umpireCoding/main/setup.sh)
```

3. You may be asked for your Mac password during the Homebrew installation — type it and press Enter (you won't see the characters as you type, that's normal)
4. Press **Enter** when prompted to begin and follow the on-screen instructions
5. When the script asks you to select a Chrome window in OBS — in OBS, double-click **Stream Capture** in the Sources panel, choose your Chrome window from the dropdown, and click **OK**
6. When the script asks you to load the extension — follow the instructions on screen (Chrome and the extension folder will already be open)

> **Tip:** If you already have some of the software installed, the script detects it and skips those steps automatically.

> **Note:** If you see a security warning when OBS first opens, go to **System Settings → Privacy & Security** and click **Open Anyway**. You only need to do this once.

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
   - Recording Output Directory: `/Users/[YourName]/Movies/umpire-recordings` *(created automatically by the setup script)*
   - Leave format, resolution, and framerate as defaults
   - Click **Apply OBS Settings**

   **Post-Processing Output**
   - Clips & Report Output Directory: choose any folder where you want clips and PDF reports saved (e.g. `/Users/[YourName]/Documents/umpire-clips`)

4. Click **Save Settings** at the bottom of the page

> **Tip:** You can pin the extension to your toolbar by clicking the puzzle piece icon at the top right of Chrome and clicking the pin next to Umpire Coder.

---

## Step 3 — You're Ready

Here is the workflow for each match:

### Before the match
1. Open **OBS Studio** and make sure it is running
2. Open the livestream in Chrome
3. Click the **Umpire Coder** icon in Chrome
4. Fill in the umpire names (required) and optionally the date, competition, and venue
5. Click **▶ Start Match** — OBS will begin recording and the tagging overlay will appear on screen

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
3. The clips and PDF report are generated automatically — this may take a minute
4. The overlay will show ✓ green ticks when done, and display the output folder path
5. Your files will be in the **Clips & Report Output Directory** you set in Step 2

---

## Troubleshooting

**"OBS connection refused" error when testing**
- Make sure OBS is open
- Check that the password in Settings matches `umpire123` (or whatever you changed it to)
- In OBS: Tools → WebSocket Server Settings → confirm Enable WebSocket server is ticked

**"ffmpeg not found on PATH"**
- Open Terminal and run: `brew install ffmpeg`
- After it finishes, fully quit Chrome (Cmd + Q) and reopen it

**The overlay doesn't appear after starting a match**
- Make sure the livestream tab is the active tab when you click Start Match
- Try clicking the extension icon and clicking "Show Overlay on This Tab"

**The extension disappeared from Chrome after restarting**
- Extensions loaded in Developer mode stay loaded unless you remove them. If it disappeared, go to `chrome://extensions`, click **Load unpacked**, and select `~/Documents/umpireCoding/extension`.

**Clips were not cut but the PDF was generated**
- Check that the full match video exists in `~/Movies/umpire-recordings`
- Check that ffmpeg is installed: open Terminal and run `ffmpeg -version`
- The PDF report is always generated regardless of whether clips are cut

**OBS shows a security warning and won't open**
- Go to System Settings → Privacy & Security → scroll down and click **Open Anyway** next to the OBS entry

**"Permission denied" running the setup script**
- Run `chmod +x setup.sh` first, then `./setup.sh`

---

## File Structure Reference

After setup your folder structure will look like this:

```
Documents/
  umpireCoding/
    extension/          <-- loaded into Chrome
    mac/
      native-host/      <-- runs automatically, no need to touch
    post-processing/    <-- runs automatically, no need to touch

Movies/
  umpire-recordings/    <-- full match recordings from OBS

Documents/
  umpire-clips/         <-- clips and PDF reports (or wherever you chose in Step 2)
    2026-04-27_NationalLeague_clips/
      001_JohnSmith_Positioning_00-32-15.mp4
      002_JaneSmith_Advantage_00-45-02.mp4
      ...
    2026-04-27_NationalLeague_report.pdf
    2026-04-27_NationalLeague_events.json
```

---

*For issues or questions, contact the person who shared this guide with you.*
