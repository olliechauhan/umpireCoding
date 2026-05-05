# Umpire Coder

A Chrome extension for hockey match official performance analysis. Tag events live during a streamed match, then automatically generate timestamped video clips and a PDF report — no video editing required.

---

## What It Does

- **Live tagging overlay** — a floating panel appears over any livestream tab in Chrome. Tag events to either umpire with one click: positioning, advantage calls, card decisions, and any custom tag types you define.
- **Automatic OBS recording** — the extension starts and stops OBS recording for you when you begin and end a match. No manual recording control needed.
- **Video clip cutting** — after the match, each tagged event is automatically cut into a short clip from the full recording.
- **PDF report** — a summary report is generated for each umpire showing all tagged events with timestamps.
- **One-click updates** — press the 🔄 button in the extension to pull the latest version without opening a terminal.

---

## Requirements

- Google Chrome
- Windows 10/11 or macOS 12 (Monterey) or later

Everything else (Node.js, Git, OBS Studio, ffmpeg) is installed automatically by the setup script.

---

## Setup

Follow the guide for your operating system:

| OS | Guide |
|---|---|
| **Windows** | [windowsSETUP.md](windowsSETUP.md) |
| **macOS** | [macSETUP.md](macSETUP.md) |

Setup takes around 5–10 minutes. The script handles the technical parts automatically.

---

## How to Use

### Starting a match
1. Open the livestream in Chrome
2. Click the **Umpire Coder** icon in your toolbar
3. Fill in the umpire names and optional match details
4. Click **▶ Start Match** — OBS begins recording and the tagging overlay appears

### During the match
- Select an umpire, select a tag type, optionally add a note, then click **Log Event**
- If the stream is delayed behind the live venue, enter the delay in seconds in the **Stream delay** field
- Drag the overlay by its title bar to reposition it

### Ending a match
1. Click **End Match** on the overlay, then **Confirm**
2. OBS stops recording
3. Clips and PDF report are generated automatically (takes a minute or two)
4. The overlay shows a summary with green ticks when everything is done

---

## Updating

Press the **🔄** button in the top-right corner of the extension popup. If new changes are available they are downloaded and the extension reloads automatically.

---

## Customising Tag Types

Open **Settings** (⚙ in the extension popup) → **Tag Types** to add, edit or remove tag buttons. Changes apply immediately the next time you start a match.

---

## Output Files

All output is saved to the **Clips & Report Output Directory** you set in Settings:

```
umpire-clips/
  2026-04-27_NationalLeague_JohnSmith_JaneDoe/
    JohnSmith_Positioning_00-12-34.mp4
    JaneDoe_Advantage_00-32-01.mp4
    ...
  2026-04-27_NationalLeague_JohnSmith_JaneDoe_report.pdf
  2026-04-27_NationalLeague_JohnSmith_JaneDoe_events.json
```

---

## Reporting Issues

Open an issue on [GitHub](https://github.com/olliechauhan/umpireCoding/issues) with a description of what happened and what you expected to happen.
