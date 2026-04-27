import { OBSWebSocket } from './obs/websocket.js';

const obs = new OBSWebSocket();

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
  outputDirectory: '',
  obsOutputFormat: 'mp4',
  obsResolution: '1920x1080',
  obsFramerate: 30,
  clipOutputDirectory: '',
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
      if (current?.active) {
        return { error: 'A match is already in progress.' };
      }

      const { settings } = await chrome.storage.local.get('settings');

      // Connect to OBS and start recording.
      // Errors are non-fatal — tagging continues even if OBS is unreachable.
      try {
        await obs.connect(settings.obsHost, settings.obsPort, settings.obsPassword);
        await obs.startRecording();
      } catch (err) {
        console.warn('[BG] OBS unavailable — match continues without recording:', err.message);
      }

      const startTime = Date.now();
      const matchState = {
        active: true,
        startTime,
        matchData: message.matchData,
        events: [],
        nextEventId: 1,
      };
      await chrome.storage.local.set({ matchState });

      // Inject the overlay into the active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        await injectOverlay(tab.id);
      }

      return { success: true, startTime };
    }

    case 'REINJECT_OVERLAY': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        // Try messaging first — content script may already be live
        try {
          await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_OVERLAY' });
        } catch {
          await injectOverlay(tab.id);
        }
      }
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

async function injectOverlay(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    });
  } catch (err) {
    console.error('[BG] Overlay injection failed:', err.message);
  }
}

function buildEventLog(matchState) {
  const { matchData, events } = matchState;
  const log = {
    match: {
      date:        matchData.date,
      competition: matchData.competition,
      venue:       matchData.venue,
      umpire1:     matchData.umpire1,
      umpire2:     matchData.umpire2,
    },
    events,
  };
  const jsonData = JSON.stringify(log, null, 2);
  const date     = (matchData.date || '').replace(/-/g, '');
  const comp     = (matchData.competition || 'match').replace(/\s+/g, '_');
  const filename = `${date}_${comp}_events.json`;
  return { jsonData, filename };
}

async function downloadEventLog(jsonData, filename) {
  const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonData);
  await chrome.downloads.download({ url: dataUrl, filename, saveAs: false });
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
