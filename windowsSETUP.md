# Umpire Coder — Setup Guide

This guide will walk you through setting up Umpire Coder from scratch on a Windows PC.
Follow every step in order. If something goes wrong, read the **Troubleshooting** section at the bottom.

---

## What You Will Need

- A Windows 10 or 11 PC
- Google Chrome installed
- An internet connection (for the initial setup only)

---

## Step 1 — Install the Required Software

You need to install four pieces of software. Install them in the order listed below.

### 1a. Node.js

Node.js is the engine that runs the post-processing scripts.

1. Go to **https://nodejs.org**
2. Click the big **"LTS"** download button (LTS = Long Term Support, the stable version)
3. Open the downloaded file and click through the installer, accepting all defaults
4. When finished, click **Close**

### 1b. Git

Git is used to download the Umpire Coder code.

1. Go to **https://git-scm.com/download/win**
2. Click the top download link (it will say something like "64-bit Git for Windows Setup")
3. Open the downloaded file and click through the installer, accepting all defaults
4. When finished, click **Close**

### 1c. OBS Studio

OBS records the livestream video during the match.

1. Go to **https://obsproject.com**
2. Click **Windows** to download
3. Open the downloaded file and install, accepting all defaults

   > **Important:** When the installer asks where to install OBS, leave the path as the default (`C:\Program Files\obs-studio`). Umpire Coder opens OBS automatically and will not find it if it is installed anywhere else.

### 1d. ffmpeg

ffmpeg is the tool that cuts the video clips. It is installed via a command.

1. Press the **Windows key**, type **PowerShell**, right-click **Windows PowerShell**, and click **Run as administrator**
2. A blue window will open. Click inside it, paste the following command exactly, and press **Enter**:

```
winget install ffmpeg
```

3. Wait for it to finish. You will see a message like `Successfully installed`. Close the window when done.

---

## Step 2 — Download Umpire Coder

1. Press the **Windows key**, type **PowerShell**, and open **Windows PowerShell** (no need to run as administrator this time)
2. Paste the following command and press **Enter**:

```
cd C:\Users\%USERNAME%\Documents
```

3. Then paste this command and press **Enter**:

```
git clone https://github.com/olliechauhan/umpireCoding.git
```

4. Wait for it to finish. When done, you will see a new folder called **umpireCoding** inside your Documents folder.

---

## Step 3 — Load the Extension into Chrome

1. Open **Google Chrome**
2. In the address bar at the top, type the following and press **Enter**:

```
chrome://extensions
```

3. In the top-right corner of the page, turn on **Developer mode** (toggle switch)
4. Click the **Load unpacked** button that appears on the left
5. A file browser window will open. Navigate to:

```
C:\Users\[YourName]\Documents\umpireCoding\extension
```

   *(Replace `[YourName]` with your actual Windows username, e.g. `C:\Users\ollie\Documents\umpireCoding\extension`)*

6. Click **Select Folder**
7. **Umpire Coder** will now appear in your extensions list
8. **Copy the Extension ID** — it is the long string of letters underneath the extension name (looks like `abcdefghijklmnopqrstuvwxyzabcdef`). You will need this in Step 4.

   > Tip: You can pin the extension to your toolbar by clicking the puzzle piece icon (🧩) at the top right of Chrome and clicking the pin next to Umpire Coder.

---

## Step 4 — Run the Setup Script

This script does three things automatically: installs the PDF library, links the extension to the post-processing scripts, and registers everything with Windows.

1. Open **File Explorer** and navigate to:

```
C:\Users\[YourName]\Documents\umpireCoding\native-host
```

2. In the address bar of File Explorer, click once to select the path, type **PowerShell**, and press **Enter**. A PowerShell window will open already in the correct folder.

3. Paste the following command and press **Enter**:

```
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

   > This form of the command runs the script directly and sidesteps Windows script-blocking, so you do not need to change any settings first.

4. The script will install the PDF library automatically, then ask you to paste your **Extension ID** from Step 3. Paste it in and press **Enter**.

5. When you see **Done!** the setup is complete.

6. Go back to Chrome, go to `chrome://extensions`, find **Umpire Coder**, and click the **circular reload arrow** (↺) to reload it.

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
5. In the **Window** dropdown, select your Chrome window (it will appear something like `[chrome.exe]: YouTube`)
6. Click **OK**
7. Resize and position the capture in the preview so it fills the screen

### 5c. Set the Recording Output Folder

1. In OBS, click **File** → **Settings**
2. Click **Output** on the left
3. Under **Recording**, note or change the **Recording Path** to a folder you want the full match videos saved to (e.g. `C:\Users\[YourName]\Videos\umpire-recordings`)
4. Click **OK**

---

## Step 6 — Configure the Extension Settings

1. Click the **Umpire Coder** icon in your Chrome toolbar (or open `chrome://extensions` and click the extension)
2. Click the **⚙ Settings** button
3. Fill in the following:

   **OBS Connection**
   - Host: `localhost`
   - Port: `4455`
   - Password: the password you set in Step 5a
   - Click **Test Connection** — you should see ✓ Connected

   **OBS Output Settings**
   - Recording Output Directory: the folder from Step 5c (e.g. `C:\Users\[YourName]\Videos\umpire-recordings`)
   - Leave format, resolution, and framerate as defaults unless you have a reason to change them
   - Click **Apply OBS Settings**

   **Post-Processing Output**
   - Clips & Report Output Directory: a folder where you want the clips and PDF reports saved (e.g. `C:\Users\[YourName]\Documents\umpire-clips`)

4. Click **Save Settings** at the bottom of the page

---

## Step 7 — You're Ready

Here is the workflow for each match:

### Before the match
1. Open the livestream in Chrome
2. Click the **Umpire Coder** icon in Chrome
3. Fill in the umpire names (required) and optionally the date, competition, and venue
4. Click **▶ Start Match**
5. OBS will open automatically and begin recording. The tagging overlay will appear on screen.

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
4. The overlay will show ✓ green ticks when done, and display the output folder path
5. Your files will be in the **Clips & Report Output Directory** you set in Step 6

---

## Troubleshooting

**"OBS connection refused" error when testing**
- Make sure OBS is open
- Check that the WebSocket server is enabled (Step 5a)
- Make sure the password matches exactly

**"ffmpeg not found on PATH"**
- Re-run the ffmpeg install command from Step 1d
- After it installs, fully close Chrome and reopen it

**The overlay doesn't appear after starting a match**
- Make sure the livestream tab is the active tab when you click Start Match
- Try clicking the extension icon and clicking "Show Overlay on This Tab"

**"running scripts is disabled" when running install.ps1**
- Use the bypass form of the command instead of `.\install.ps1`:
  ```
  powershell -ExecutionPolicy Bypass -File .\install.ps1
  ```
- `Set-ExecutionPolicy RemoteSigned` alone is not enough — files downloaded via git are marked as coming from the internet and will still be blocked unless you use the bypass form above.

**The extension disappeared from Chrome after restarting**
- Extensions loaded in Developer mode stay loaded unless you remove them. If it disappeared, repeat Step 3.

**Clips were not cut but the PDF was generated**
- Check that the full match video exists in your OBS recording folder (Step 5c)
- Check that ffmpeg is installed (Step 1d)
- The PDF report is always generated regardless of whether clips are cut

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
  umpire-clips\         <-- clips and PDF reports (or wherever you chose in Step 6)
    2026-04-27_NationalLeague_clips\
      001_JohnSmith_Positioning_00-32-15.mp4
      002_JaneSmith_Advantage_00-45-02.mp4
      ...
    2026-04-27_NationalLeague_report.pdf
    2026-04-27_NationalLeague_events.json
```

---

*For issues or questions, contact the person who shared this guide with you.*
