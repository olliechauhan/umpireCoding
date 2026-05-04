/**
 * OBS WebSocket v5 client — zero external dependencies.
 *
 * Implements the obs-websocket 5.x protocol directly using the browser
 * WebSocket API and SubtleCrypto for authentication. No bundler required.
 *
 * Protocol spec:
 *   https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md
 *
 * ── OBS first-time setup (do once) ───────────────────────────────────────────
 *   1. OBS → Tools → WebSocket Server Settings → Enable WebSocket server.
 *      Set a password and enter it in the extension Settings page.
 *
 *   2. In OBS, add a Window Capture source to your scene:
 *        Sources → + → Window Capture
 *        Window: [Chrome] (select your Chrome window from the dropdown)
 *        Capture method: Windows 10 (1903 and up)  ← most reliable for Chrome
 *      Resize/position it to fill the canvas.
 *      The extension only controls Start/Stop recording — the source stays as-is.
 */

export class OBSWebSocket {
  constructor() {
    this._ws = null;
    this._connected = false;
    this._obsVersion = null;
    /** @type {Map<string, {resolve: Function, reject: Function, timer: number}>} */
    this._pending = new Map();
  }

  get isConnected() {
    return this._connected && this._ws?.readyState === WebSocket.OPEN;
  }

  // ── Connection ─────────────────────────────────────────────────────────────

  /**
   * Connect and authenticate with OBS.
   * Resolves with { obsWebSocketVersion, negotiatedRpcVersion } on success.
   */
  connect(host = 'localhost', port = 4455, password = '') {
    this._cleanup();

    return new Promise((resolve, reject) => {
      let handshakeDone = false;

      const ws = new WebSocket(`ws://${host}:${port}`);
      this._ws = ws;

      const timeout = setTimeout(() => {
        if (!handshakeDone) {
          ws.close();
          reject(new Error(
            `Timed out connecting to OBS at ws://${host}:${port}. ` +
            'Ensure OBS is running and Tools → WebSocket Server Settings → Enable is checked.'
          ));
        }
      }, 10_000);

      ws.addEventListener('message', async (evt) => {
        let msg;
        try { msg = JSON.parse(evt.data); } catch { return; }

        if (msg.op === 0) {
          // HELLO — server announces auth requirements
          this._obsVersion = msg.d.obsWebSocketVersion ?? null;
          const d = { rpcVersion: 1, eventSubscriptions: 0 };

          if (msg.d.authentication) {
            if (!password) {
              clearTimeout(timeout);
              ws.close();
              reject(new Error(
                'OBS WebSocket requires a password. ' +
                'Enter it in Settings → OBS Connection → WebSocket Password.'
              ));
              return;
            }
            try {
              d.authentication = await _calcAuth(
                password,
                msg.d.authentication.challenge,
                msg.d.authentication.salt
              );
            } catch (err) {
              clearTimeout(timeout);
              ws.close();
              reject(new Error('Failed to compute OBS auth: ' + err.message));
              return;
            }
          }

          ws.send(JSON.stringify({ op: 1, d })); // IDENTIFY

        } else if (msg.op === 2) {
          // IDENTIFIED — connection ready
          handshakeDone = true;
          clearTimeout(timeout);
          this._connected = true;

          ws.onmessage = (e) => this._onMessage(e);
          ws.onclose = () => {
            this._connected = false;
            console.warn('[OBS] WebSocket closed unexpectedly');
          };

          resolve({
            obsWebSocketVersion: this._obsVersion,
            negotiatedRpcVersion: msg.d.negotiatedRpcVersion,
          });
        }
      });

      ws.addEventListener('error', () => {
        // onclose fires right after and handles rejection
      });

      ws.addEventListener('close', (evt) => {
        clearTimeout(timeout);
        this._connected = false;
        if (!handshakeDone) {
          reject(new Error(
            `OBS WebSocket connection refused (code ${evt.code})` +
            (evt.reason ? `: ${evt.reason}` : '') +
            '. Is OBS running with the WebSocket server enabled?'
          ));
        }
      });
    });
  }

  async disconnect() {
    this._cleanup();
  }

  // ── Recording ──────────────────────────────────────────────────────────────

  /** StartRecord. Called on match start. */
  async startRecording() {
    await this._call('StartRecord');
  }

  /**
   * StopRecord. Called on match end.
   * @returns {{ outputPath: string|null }}
   */
  async stopRecording() {
    const data = await this._call('StopRecord');
    return { outputPath: data?.outputPath ?? null };
  }

  // ── Window capture ─────────────────────────────────────────────────────────

  /**
   * Find every window_capture source in the current scene and re-point it at
   * the Chrome window whose title best matches `tabTitle`.
   * Non-fatal: all errors are caught and ignored.
   */
  async updateWindowCaptureToChromeWindow(tabTitle) {
    try {
      const { currentProgramSceneName } = await this._call('GetCurrentProgramScene');
      const { sceneItems = [] } = await this._call('GetSceneItemList', {
        sceneName: currentProgramSceneName,
      });

      for (const item of sceneItems) {
        if (!item.inputKind?.includes('window_capture')) continue;

        let propertyItems = [];
        try {
          const res = await this._call('GetInputPropertiesListPropertyItems', {
            inputName: item.sourceName,
            propertyName: 'window',
          });
          propertyItems = res.propertyItems ?? [];
        } catch { continue; }

        // itemValue is a string on Windows (e.g. "chrome.exe") and an integer
        // window ID on macOS. itemName always contains the app name in brackets.
        const chromeWindows = propertyItems.filter(w => {
          const val  = String(w.itemValue ?? '').toLowerCase();
          const name = String(w.itemName  ?? '').toLowerCase();
          return val.includes('chrome.exe') || val.includes('google chrome') || name.includes('google chrome');
        });
        if (!chromeWindows.length) continue;

        // Prefer the window whose display name includes the current tab title.
        const best = (tabTitle && chromeWindows.find(w => String(w.itemName ?? '').includes(tabTitle)))
          ?? chromeWindows[0];

        try {
          await this._call('SetInputSettings', {
            inputName: item.sourceName,
            inputSettings: { window: best.itemValue },
          });
        } catch { /* non-fatal */ }
      }
    } catch { /* non-fatal — don't block match start */ }
  }

  // ── Crop ───────────────────────────────────────────────────────────────────

  /**
   * Apply pixel crop to every window_capture source in the current scene so
   * only the video element area is recorded. Non-fatal — errors are swallowed.
   */
  async cropWindowCapture(cropLeft, cropTop, cropRight, cropBottom) {
    try {
      const { currentProgramSceneName } = await this._call('GetCurrentProgramScene');
      const [{ sceneItems = [] }, { baseWidth, baseHeight }] = await Promise.all([
        this._call('GetSceneItemList', { sceneName: currentProgramSceneName }),
        this._call('GetVideoSettings'),
      ]);

      for (const item of sceneItems) {
        if (!item.inputKind?.includes('window_capture')) continue;
        await this._call('SetSceneItemTransform', {
          sceneName: currentProgramSceneName,
          sceneItemId: item.sceneItemId,
          sceneItemTransform: {
            // Crop to the video player area.
            cropLeft,
            cropTop,
            cropRight,
            cropBottom,
            // Scale the cropped source to fill the canvas, maintaining aspect ratio.
            // OBS_BOUNDS_SCALE_INNER scales up as large as possible without distortion.
            positionX:      0,
            positionY:      0,
            alignment:      5, // OBS_ALIGN_LEFT | OBS_ALIGN_TOP
            boundsType:     'OBS_BOUNDS_SCALE_INNER',
            boundsAlignment: 0, // centre within bounds
            boundsWidth:    baseWidth,
            boundsHeight:   baseHeight,
          },
        });
      }
    } catch (err) {
      console.warn('[OBS] cropWindowCapture failed:', err.message);
    }
  }

  // ── Settings ───────────────────────────────────────────────────────────────

  /** Push video and output-directory settings to OBS. */
  async applySettings({ outputDirectory, obsResolution, obsFramerate }) {
    const [width, height] = (obsResolution ?? '1920x1080').split('x').map(Number);
    const fps = Number(obsFramerate) || 30;

    await this._call('SetVideoSettings', {
      baseWidth: width,
      baseHeight: height,
      outputWidth: width,
      outputHeight: height,
      fpsNumerator: fps,
      fpsDenominator: 1,
    });

    if (outputDirectory) {
      await this._call('SetRecordDirectory', { recordDirectory: outputDirectory });
    }
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  _onMessage(evt) {
    let msg;
    try { msg = JSON.parse(evt.data); } catch { return; }

    if (msg.op !== 7) return; // We only handle RequestResponse; ignore events.

    const entry = this._pending.get(msg.d.requestId);
    if (!entry) return;

    clearTimeout(entry.timer);
    this._pending.delete(msg.d.requestId);

    if (msg.d.requestStatus.result) {
      entry.resolve(msg.d.responseData ?? {});
    } else {
      const { code, comment } = msg.d.requestStatus;
      const err = new Error(
        `OBS ${msg.d.requestType} failed (code ${code})` +
        (comment ? `: ${comment}` : '')
      );
      err.obsCode = code;
      entry.reject(err);
    }
  }

  _call(requestType, requestData = {}) {
    if (!this.isConnected) {
      return Promise.reject(
        new Error(`Cannot call OBS ${requestType} — not connected.`)
      );
    }

    const requestId = crypto.randomUUID();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(requestId);
        reject(new Error(`OBS request "${requestType}" timed out after 10 s`));
      }, 10_000);

      this._pending.set(requestId, { resolve, reject, timer });
      this._ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
    });
  }

  _cleanup() {
    for (const entry of this._pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error('OBS connection closed'));
    }
    this._pending.clear();
    this._connected = false;

    if (this._ws) {
      // Detach handlers before closing so we don't trigger stale callbacks.
      this._ws.onmessage = null;
      this._ws.onclose   = null;
      this._ws.onerror   = null;
      this._ws.close();
      this._ws = null;
    }
  }
}

// ── Auth helpers (module-private) ─────────────────────────────────────────────

/**
 * OBS WebSocket v5 authentication:
 *   secret      = base64( sha256( password + salt ) )
 *   authString  = base64( sha256( secret + challenge ) )
 */
async function _calcAuth(password, challenge, salt) {
  const secret = await _sha256b64(password + salt);
  return _sha256b64(secret + challenge);
}

async function _sha256b64(str) {
  const buf   = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  const bytes = new Uint8Array(buf);
  let binary  = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
