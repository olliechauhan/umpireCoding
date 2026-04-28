# Umpire Coder — Setup Guide (macOS)

This guide will walk you through setting up Umpire Coder from scratch on a Mac.
Follow every step in order. If something goes wrong, read the **Troubleshooting** section at the bottom.

---

## What You Will Need

- A Mac running macOS 12 (Monterey) or later
- Google Chrome installed
- An internet connection (for the initial setup only)

---

## Step 1 — Install the Required Software

You need to install four pieces of software. Install them in the order listed below.

### 1a. Homebrew

Homebrew is a package manager for Mac — it makes installing developer tools simple. You will use it to install ffmpeg.

1. Open **Terminal** (press Cmd + Space, type `Terminal`, press Enter)
2. Paste the following command and press **Enter**:

```
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

3. You may be asked for your Mac password — type it and press Enter (you won't see the characters as you type, that's normal)
4. Wait for it to finish. It will say `Installation successful` when done.

> If you see a message at the end saying to run two commands starting with `echo` and `eval`, run both of them before continuing.

### 1b. Node.js

Node.js is the engine that runs the post-processing scripts.

1. Go to **https://nodejs.org**
2. Click the big **"LTS"** download button (LTS = Long Term Support, the stable version)
3. Open the downloaded `.pkg` file and click through the installer, accepting all defaults
4. When finished, click **Close**

### 1c. Git

Git is used to download the Umpire Coder code. Most Macs already have it. To check:

1. Open **Terminal**
2. Type the following and press Enter:

```
git --version
```

3. If you see a version number (e.g. `git version 2.39.0`), you already have Git — skip to Step 1d.
4. If you do not have Git, run this command in Terminal and wait for it to finish:

```
xcode-select --install
```

   A window will appear asking you to install Command Line Developer Tools — click **Install**. When it finishes, run `git --version` again to confirm it worked.

### 1d. OBS Studio

OBS records the livestream video during the match.

1. Go to **https://obsproject.com**
2. Click **macOS** to download
3. Open the downloaded `.dmg` file, drag OBS into your Applications folder
4. Open OBS from Applications. If you see a security warning, go to **System Settings → Privacy & Security** and click **Open Anyway**

### 1e. ffmpeg

ffmpeg is the tool that cuts the video clips.

1. Open **Terminal**
2. Paste the following command and press **Enter**:

```
brew install ffmpeg
```

3. Wait for it to finish (this may take a few minutes). Close Terminal when done.

---

## Step 2 — Download Umpire Coder

1. Open **Terminal**
2. Paste the following command and press **Enter** to go to your Documents folder:

```
cd ~/Documents
```

3. Then paste this command and press **Enter**:

```
git clone https://github.com/olliechauhan/umpireCoding.git
```

4. Wait for it to finish. A new folder called **umpireCoding** will appear in your Documents folder.

---

## Step 3 — Load the Extension into Chrome

1. Open **Google Chrome**
2. In the address bar at the top, type the following and press **Enter**:

```
chrome://extensions
```

3. In the top-right corner of the page, turn on **Developer mode** (toggle switch)
4. Click the **Load unpacked** button that appears on the left
5. A file browser window will open. Navigate to your Documents folder, then into `umpireCoding`, then into `extension`

   The full path is: `~/Documents/umpireCoding/extension`

   > Tip: In the file browser, press **Cmd + Shift + G**, paste `~/Documents/umpireCoding/extension` and press Enter to jump straight there.

6. Click **Select** (or **Open**)
7. **Umpire Coder** will now appear in your extensions list
8. **Copy the Extension ID** — it is the long string of letters underneath the extension name (looks like `abcdefghijklmnopqrstuvwxyzabcdef`). You will need this in Step 4.

   > Tip: You can pin the extension to your toolbar by clicking the puzzle piece icon at the top right of Chrome and clicking the pin next to Umpire Coder.

---

## Step 4 — Run the Setup Script

This script does three things automatically: installs the PDF library, links the extension to the post-processing scripts, and registers everything with Chrome.

1. Open **Terminal**
2. Paste the following commands one at a time, pressing **Enter** after each:

```
cd ~/Documents/umpireCoding/mac/native-host
```

```
chmod +x install.sh
```

```
./install.sh
```

3. The script will install the PDF library automatically, then ask you to paste your **Extension ID** from Step 3. Paste it in and press **Enter**.

4. When you see **Done!** the setup is complete.

5. Go back to Chrome, go to `chrome://extensions`, find **Umpire Coder**, and click the **circular reload arrow** (↺) to reload it.

---

## Step 5 — Set Up OBS

### 5a. Enable the WebSocket Server

The extension controls OBS over a local connection called a WebSocket. You need to turn this on.

1. Open **OBS Studio**
2. In the menu bar at the top, click **Tools**
3. Click **WebSocket Server Settings**
4. Tick the box **Enable WebSocket server**
5. Tick **Enable Authentication** and set a password you will remember (e.g. `umpire123`)
6. Leave the port as **4455**
7. Click **OK**

### 5b. Add a Window Capture Source

OBS needs to record the Chrome window that has the livestream playing.

1. In OBS, look at the **Sources** panel at the bottom
2. Click the **+** button
3. Click **Window Capture**
4. Name it `Stream Capture` and click **OK**
5. In the **Window** dropdown, select your Chrome window
6. Click **OK**
7. Resize and position the capture in the preview so it fills the screen

### 5c. Set the Recording Output Folder

1. In OBS, click **OBS** in the menu bar → **Settings** (or press Cmd + ,)
2. Click **Output** on the left
3. Under **Recording**, note or change the **Recording Path** to a folder you want the full match videos saved to

   Suggested path: `/Users/[YourName]/Movies/umpire-recordings`

   *(Replace `[YourName]` with your Mac username)*

4. Click **OK**

---

## Step 6 — Configure the Extension Settings

1. Click the **Umpire Coder** icon in your Chrome toolbar
2. Click the **⚙ Settings** button
3. Fill in the following:

   **OBS Connection**
   - Host: `localhost`
   - Port: `4455`
   - Password: the password you set in Step 5a
   - Click **Test Connection** — you should see ✓ Connected

   **OBS Output Settings**
   - Recording Output Directory: the folder from Step 5c (e.g. `/Users/[YourName]/Movies/umpire-recordings`)
   - Leave format, resolution, and framerate as defaults unless you have a reason to change them
   - Click **Apply OBS Settings**

   **Post-Processing Output**
   - Clips & Report Output Directory: a folder where you want the clips and PDF reports saved

   Suggested path: `/Users/[YourName]/Documents/umpire-clips`

4. Click **Save Settings** at the bottom of the page

---

## Step 7 — You're Ready

Here is the workflow for each match:

### Before the match
1. Open OBS — it will be ready in the background
2. Open the livestream in Chrome
3. Click the **Umpire Coder** icon in Chrome
4. Fill in the umpire names (required) and optionally the date, competition, and venue
5. Click **Start Match**
6. The recording starts in OBS and the tagging overlay appears on screen

### During the match
- Use the overlay to tag events:
  - Select an **umpire**
  - Select a **tag type**
  - Optionally add a **note**
  - Click **Log Event**
- If the livestream is delayed behind the live venue, enter the delay in seconds in the **Stream delay** field (e.g. `90` for a 90-second delay). You can adjust this at any time during the match.
- Drag the overlay by its header to move it out of the way. Use **⇔** to toggle between wide and narrow layouts.

### After the match
1. Click **End Match** on the overlay, then **Confirm**
2. OBS stops recording
3. The clips and PDF report are generated automatically — this may take a minute
4. The overlay will show green ticks when done, and display the output folder path
5. Your files will be in the **Clips & Report Output Directory** you set in Step 6

---

## Troubleshooting

**"Can't install the software because it is currently not available in the software update server"**
- This happens when macOS tries to install Command Line Developer Tools through the popup and the Apple server is unavailable.
- Fix: close the popup, open Terminal, and run `xcode-select --install` instead. A fresh install window will appear — click **Install** and wait for it to finish.
- If that also fails, restart your Mac and try again, or connect to a different network.

**"OBS connection refused" error when testing**
- Make sure OBS is open
- Check that the WebSocket server is enabled (Step 5a)
- Make sure the password matches exactly

**"ffmpeg not found on PATH"**
- Re-run the ffmpeg install from Step 1e: `brew install ffmpeg`
- After it installs, fully quit Chrome (Cmd + Q) and reopen it

**The overlay does not appear after starting a match**
- Make sure the livestream tab is the active tab when you click Start Match
- Try clicking the extension icon and clicking "Show Overlay on This Tab"

**"Permission denied" when running install.sh**
- Make sure you ran `chmod +x install.sh` before `./install.sh`

**Clips were not cut but the PDF was generated**
- Check that the full match video exists in your OBS recording folder (Step 5c)
- Check that ffmpeg is installed: open Terminal and run `ffmpeg -version`
- The PDF report is always generated regardless of whether clips are cut

**The extension disappeared from Chrome after restarting**
- Extensions loaded in Developer mode stay loaded unless you remove them. If it disappeared, repeat Step 3.

**OBS shows a security warning and won't open**
- Go to System Settings → Privacy & Security → scroll down and click Open Anyway next to the OBS entry

---

## File Structure Reference

After setup your folder structure will look like this:

```
Documents/
  umpireCoding/
    extension/          <-- loaded into Chrome (shared with Windows)
    mac/
      native-host/      <-- runs automatically, no need to touch
    post-processing/    <-- runs automatically, no need to touch (shared with Windows)

Movies/
  umpire-recordings/    <-- full match recordings from OBS

Documents/
  umpire-clips/         <-- clips and PDF reports (or wherever you chose in Step 6)
    2026-04-27_NationalLeague_clips/
      001_JohnSmith_Positioning_00-32-15.mp4
      002_JaneSmith_Advantage_00-45-02.mp4
      ...
    2026-04-27_NationalLeague_report.pdf
    2026-04-27_NationalLeague_events.json
```

---

*For issues or questions, contact the person who shared this guide with you.*
