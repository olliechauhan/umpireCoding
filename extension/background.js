import { OBSWebSocket } from './obs/websocket.js';

const obs = new OBSWebSocket();

// Track the overlay popup window so REINJECT_OVERLAY can focus rather than re-open.
// Module-level — resets if the service worker is restarted, which is acceptable.
let overlayWindowId = null;

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === overlayWindowId) overlayWindowId = null;
});

const DEFAULT_TAG_TYPES = [
  'Positioning',
  'Overheads',
  'Breakdown',
  'Whistle Timing',
  'Hitting Ball Away',
  'Advantage',
  'Player Management',
  'Green Card',
  'Yellow Card',
  'Red Card',
  'Presentation',
  'Teamwork',
];

const DEFAULT_SETTINGS = {
  obsHost: 'localhost',
  obsPort: 4455,
  obsPassword: '',
  obsExePath: '',
  outputDirectory: '',
  obsOutputFormat: 'mp4',
  obsResolution: '1920x1080',
  obsFramerate: 30,
  clipOutputDirectory: '',
  cropOverlayMargin: 200,
  tagTypes: DEFAULT_TAG_TYPES,
};

// ─── Lifecycle ────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await chrome.storage.local.get('settings');
  if (!settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
  const { matchState } = await chrome.storage.local.get('matchState');
  if (!matchState) {
    await chrome.storage.local.set({ matchState: { active: false } });
  }
});

// ─── Message routing ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handle(message)
    .then(sendResponse)
    .catch((err) => {
      console.error('[BG] Unhandled error:', err);
      sendResponse({ error: err.message });
    });
  return true; // keep channel open for async response
});

async function handle(message) {
  switch (message.type) {
    case 'GET_MATCH_STATE': {
      const { matchState } = await chrome.storage.local.get('matchState');
      return { matchState };
    }

    case 'GET_SETTINGS': {
      const { settings } = await chrome.storage.local.get('settings');
      return { settings };
    }

    case 'SAVE_SETTINGS': {
      await chrome.storage.local.set({ settings: message.settings });
      return { success: true };
    }

    case 'START_MATCH': {
      const { matchState: current } = await chrome.storage.local.get('matchState');
      if (current?.active) return { error: 'A match is already in progress.' };

      const { settings } = await chrome.storage.local.get('settings');

      // Ask the native host to launch OBS (or confirm it's already running).
      // waitForPort inside the host blocks until the WebSocket is ready, so
      // a successful response means OBS is definitely ready to accept connections.
      // To roll back: revert this try/catch block (git show 1ffd756 for prior state).
      try {
        const launchResult = await sendNativeMessage('com.umpirecoder.postprocess', {
          type:       'LAUNCH_OBS',
          obsPort:    settings.obsPort    || 4455,
          obsExePath: settings.obsExePath || '',
        });
        if (!launchResult.success) {
          return { obsError: true, canRetry: true, errorMessage: launchResult.error || 'OBS failed to start.' };
        }
      } catch (err) {
        const notInstalled = /not found|not registered/i.test(err.message);
        if (notInstalled) {
          const { os } = await chrome.runtime.getPlatformInfo();
          const setupCmd = os === 'mac'
            ? 'Run install.sh in the mac/native-host folder'
            : 'Run install.ps1 in the native-host folder';
          return {
            obsError: true,
            canRetry: false,
            errorMessage: `The Umpire Coder helper is not set up on this computer. ${setupCmd}, then try again.`,
          };
        }
        return {
          obsError: true,
          canRetry: true,
          errorMessage: `Could not launch OBS: ${err.message}`,
        };
      }

      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

      let crop = null;
      if (activeTab?.id) {
        try {
          const margin = settings.cropOverlayMargin ?? 200;
          const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            func: getVideoCrop,
            args: [margin],
          });
          crop = result;
        } catch { /* non-fatal — page may not be scriptable */ }
      }

      try {
        await obs.connect(settings.obsHost, settings.obsPort, settings.obsPassword);
        await obs.updateWindowCaptureToChromeWindow(activeTab?.title ?? '');
        if (crop) {
          await obs.cropWindowCapture(crop.cropLeft, crop.cropTop, crop.cropRight, crop.cropBottom);
        }
        await obs.startRecording();
      } catch (err) {
        let msg;
        if (/requires a password/i.test(err.message)) {
          msg = 'No OBS WebSocket password is set. Go to Umpire Coder Settings → OBS Connection and enter the password shown in OBS → Tools → WebSocket Server Settings.';
        } else if (/authentication failed|code 4009/i.test(err.message)) {
          msg = `OBS rejected the connection — wrong password. Check the password in Umpire Coder Settings matches OBS → Tools → WebSocket Server Settings. (${err.message})`;
        } else {
          msg = `OBS launched but WebSocket connection failed. Make sure the WebSocket server is enabled in OBS → Tools → WebSocket Server Settings, and the password in Umpire Coder Settings is correct. (${err.message})`;
        }
        chrome.notifications.create('obs-error', {
          type: 'basic', iconUrl: '../icons/icon48.png',
          title: 'Umpire Coder — OBS Error', message: msg,
        });
        await chrome.storage.local.set({ pendingObsError: msg });
        return { obsError: true, canRetry: true, errorMessage: msg };
      }

      return startMatchAndInjectOverlay(message.matchData);
    }

    case 'ABANDON_MATCH': {
      const { matchState: current } = await chrome.storage.local.get('matchState');
      if (!current?.active) return { success: true };

      const { settings } = await chrome.storage.local.get('settings');
      try {
        if (!obs.isConnected) {
          await obs.connect(settings.obsHost, settings.obsPort, settings.obsPassword);
        }
        await obs.stopRecording();
      } catch (err) {
        console.warn('[BG] OBS stop on abandon failed:', err.message);
      }

      await chrome.storage.local.set({ matchState: { active: false } });
      return { success: true };
    }

    case 'START_MATCH_SKIP_OBS': {
      const { matchState: current } = await chrome.storage.local.get('matchState');
      if (current?.active) return { error: 'A match is already in progress.' };
      return startMatchAndInjectOverlay(message.matchData);
    }

    case 'REINJECT_OVERLAY': {
      if (overlayWindowId !== null) {
        try {
          await chrome.windows.update(overlayWindowId, { focused: true });
          return { success: true };
        } catch { /* window was closed, fall through to open a new one */ }
      }
      await openOverlayWindow();
      return { success: true };
    }

    case 'LOG_EVENT': {
      const { matchState } = await chrome.storage.local.get('matchState');
      if (!matchState?.active) return { error: 'No active match.' };

      const newEvent = { id: matchState.nextEventId, ...message.event };
      matchState.events.push(newEvent);
      matchState.nextEventId += 1;
      await chrome.storage.local.set({ matchState });

      return { success: true, eventId: newEvent.id };
    }

    case 'END_MATCH': {
      const { matchState } = await chrome.storage.local.get('matchState');
      if (!matchState?.active) return { error: 'No active match.' };

      const { settings } = await chrome.storage.local.get('settings');

      let outputPath = null;
      try {
        if (!obs.isConnected) {
          await obs.connect(settings.obsHost, settings.obsPort, settings.obsPassword);
        }
        const result = await obs.stopRecording();
        outputPath = result?.outputPath ?? null;
      } catch (err) {
        console.warn('[BG] OBS stop failed:', err.message);
      }

      const ended = { ...matchState, active: false, endTime: Date.now(), outputPath };
      await chrome.storage.local.set({ matchState: ended });

      const { filename: jsonFilename, jsonData } = buildEventLog(ended);
      const clipOutputDir = settings.clipOutputDirectory || settings.outputDirectory || '';

      // Try native host (runs report + clips automatically)
      let processingResult = null;
      try {
        processingResult = await sendNativeMessage('com.umpirecoder.postprocess', {
          jsonData,
          jsonFilename,
          videoPath:     outputPath,
          clipOutputDir,
        });
      } catch (err) {
        console.warn('[BG] Native host unavailable:', err.message);
      }

      // Always download the JSON as a backup copy
      await downloadEventLog(jsonData, jsonFilename);

      return { success: true, outputPath, jsonFilename, clipOutputDir, processingResult };
    }

    case 'APPLY_OBS_SETTINGS': {
      const { settings } = message;
      try {
        await obs.connect(settings.obsHost, settings.obsPort, settings.obsPassword);
        await obs.applySettings(settings);
      } catch (err) {
        return { error: err.message };
      }
      return { success: true };
    }

    case 'TEST_OBS_CONNECTION': {
      // Use a throw-away instance so we never interfere with a live match.
      const { settings } = message;
      const testObs = new OBSWebSocket();
      try {
        const info = await testObs.connect(
          settings.obsHost,
          settings.obsPort,
          settings.obsPassword
        );
        await testObs.disconnect();
        return { success: true, obsWebSocketVersion: info.obsWebSocketVersion };
      } catch (err) {
        return { error: err.message };
      }
    }

    case 'PICK_PATH': {
      try {
        const result = await sendNativeMessage('com.umpirecoder.postprocess', message);
        return result;
      } catch (err) {
        return { success: false, error: err.message };
      }
    }

    case 'SET_PIN_OVERLAY': {
      try {
        await sendNativeMessage('com.umpirecoder.postprocess', message);
      } catch { /* non-fatal */ }
      return { success: true };
    }

    case 'OPEN_FOLDER': {
      try {
        await sendNativeMessage('com.umpirecoder.postprocess', message);
      } catch (err) {
        return { success: false, error: err.message };
      }
      return { success: true };
    }

    case 'OPEN_SETTINGS': {
      await chrome.tabs.create({
        url: chrome.runtime.getURL('settings/settings.html'),
      });
      return { success: true };
    }

    default:
      return { error: `Unknown message type: ${message.type}` };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function startMatchAndInjectOverlay(matchData) {
  const startTime = Date.now();
  const matchState = {
    active: true,
    startTime,
    matchData,
    events: [],
    nextEventId: 1,
  };
  await chrome.storage.local.set({ matchState });
  await openOverlayWindow();
  return { success: true, startTime };
}

async function openOverlayWindow() {
  const win = await chrome.windows.create({
    url:     chrome.runtime.getURL('overlay/overlay.html'),
    type:    'popup',
    width:   320,
    left:    20,
    top:     20,
    focused: true,
  });
  overlayWindowId = win.id;
}

function slugPart(str) {
  return (str || '').trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function matchSlug(d) {
  const date  = (d.date || 'unknown-date');
  const ump1  = slugPart(d.umpire1) || 'Umpire1';
  const ump2  = slugPart(d.umpire2) || 'Umpire2';
  const t1    = slugPart(d.team1);
  const t2    = slugPart(d.team2);
  const teams = (t1 && t2) ? `${t1}_v_${t2}_` : '';
  return `${date}_${teams}${ump1}_${ump2}`;
}

function buildEventLog(matchState) {
  const { matchData, events } = matchState;
  const log = {
    match: {
      date:        matchData.date,
      competition: matchData.competition,
      venue:       matchData.venue,
      team1:       matchData.team1,
      team2:       matchData.team2,
      umpire1:     matchData.umpire1,
      umpire2:     matchData.umpire2,
    },
    events,
  };
  const jsonData = JSON.stringify(log, null, 2);
  const filename = `${matchSlug(matchData)}_events.json`;
  return { jsonData, filename };
}

async function downloadEventLog(jsonData, filename) {
  const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonData);
  await chrome.downloads.download({ url: dataUrl, filename, saveAs: false });
}

// Runs inside the page via chrome.scripting.executeScript — must be self-contained.
function getVideoCrop(overlayMargin) {
  const videos = Array.from(document.querySelectorAll('video'))
    .filter(v => v.offsetWidth > 0 && v.offsetHeight > 0);
  if (!videos.length) return null;

  const video = videos.reduce((best, v) =>
    v.offsetWidth * v.offsetHeight > best.offsetWidth * best.offsetHeight ? v : best
  );

  // Walk up from the <video> to find the player container — the element that
  // wraps both the video and any HTML overlays (scoreboards, controls, etc.).
  // Stop as soon as an ancestor exceeds the video size by more than overlayMargin
  // CSS px; anything larger is a page layout wrapper, not the player.
  const vRect = video.getBoundingClientRect();
  let playerRect = vRect;
  let el = video.parentElement;
  while (el && el !== document.documentElement) {
    const r = el.getBoundingClientRect();
    if (r.width > vRect.width + overlayMargin || r.height > vRect.height + overlayMargin) break;
    playerRect = r;
    el = el.parentElement;
  }

  const dpr = window.devicePixelRatio || 1;
  const topChrome = window.outerHeight - window.innerHeight;

  return {
    cropLeft:   Math.round(playerRect.left * dpr),
    cropTop:    Math.round((topChrome + playerRect.top) * dpr),
    cropRight:  Math.round((window.outerWidth - playerRect.right) * dpr),
    cropBottom: Math.round((window.outerHeight - playerRect.bottom) * dpr),
  };
}

function sendNativeMessage(host, message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(host, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}
