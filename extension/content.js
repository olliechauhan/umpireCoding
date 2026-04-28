/**
 * Umpire Coder — tagging overlay.
 * Injected dynamically into the active tab by the background service worker.
 * Builds a shadow DOM panel so extension styles never bleed into the host page.
 */
(function () {
  if (document.getElementById('umpire-coder-root')) return;

  // ── Shadow DOM host ─────────────────────────────────────────────────────────

  const host = document.createElement('div');
  host.id = 'umpire-coder-root';
  Object.assign(host.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    zIndex: '2147483647',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  });
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  // ── State ───────────────────────────────────────────────────────────────────

  let matchState      = null;
  let tagTypes        = [];
  let settings        = null;
  let selectedUmpire  = null;   // 'umpire1' | 'umpire2' | null
  let selectedTag     = null;   // tag string | null
  let timerInterval   = null;
  let streamDelaySecs = 0;      // subtracted from live timer when logging

  // ── Boot ────────────────────────────────────────────────────────────────────

  Promise.all([
    sendMsg({ type: 'GET_MATCH_STATE' }),
    sendMsg({ type: 'GET_SETTINGS' }),
  ]).then(([stateRes, settingsRes]) => {
    matchState = stateRes.matchState;
    settings   = settingsRes.settings ?? {};
    tagTypes   = settings.tagTypes ?? [];
    mount();
    startTimer();
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SHOW_OVERLAY') host.style.display = '';
  });

  // ── Render ──────────────────────────────────────────────────────────────────

  function mount() {
    const styleEl = document.createElement('style');
    styleEl.textContent = CSS;
    shadow.appendChild(styleEl);

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = buildPanelHTML();
    shadow.appendChild(panel);

    bindEvents(panel);
  }

  function buildPanelHTML() {
    const u1 = esc(matchState?.matchData?.umpire1 ?? 'Umpire 1');
    const u2 = esc(matchState?.matchData?.umpire2 ?? 'Umpire 2');
    const tagButtons = tagTypes
      .map((t) => `<button class="tag-btn" data-tag="${esc(t)}">${esc(t)}</button>`)
      .join('');

    return `
      <div class="header" id="drag-handle">
        <span class="title">Umpire Coder</span>
        <div class="controls">
          <button class="ctrl" id="folder-btn" title="Copy output folder path">📁</button>
          <button class="ctrl" id="layout-btn" title="Toggle thin/wide">⇔</button>
          <button class="ctrl" id="settings-btn" title="Settings">⚙</button>
          <button class="ctrl" id="min-btn" title="Minimise">−</button>
        </div>
      </div>

      <div class="body" id="panel-body">
        <div class="timer" id="timer">00:00:00</div>

        <div class="delay-row">
          <span class="delay-label">Stream delay</span>
          <input class="delay-input" id="delay-input" type="number" min="0" max="600" value="0">
          <span class="delay-unit">s</span>
        </div>

        <div class="section-label">Umpire</div>
        <div class="umpire-row">
          <button class="umpire-btn" id="u1-btn">${u1}</button>
          <button class="umpire-btn" id="u2-btn">${u2}</button>
        </div>

        <div class="section-label">Tag Type</div>
        <div class="tags-grid" id="tags-grid">${tagButtons}</div>

        <div class="section-label">Notes <span class="optional">(optional)</span></div>
        <textarea id="notes" rows="2" placeholder="Add notes…"></textarea>

        <div class="status" id="status"></div>

        <div class="action-row">
          <button class="log-btn" id="log-btn">Log Event</button>
          <button class="end-btn" id="end-btn">End Match</button>
        </div>

        <div class="confirm-row hidden" id="end-choice">
          <span class="confirm-label">End match?</span>
          <div class="end-choice-btns">
            <button class="confirm-yes" id="save-match-btn">Save &amp; process</button>
            <button class="abandon-btn" id="abandon-match-btn">Abandon</button>
          </div>
          <button class="confirm-no" id="end-cancel-btn">Cancel</button>
        </div>

        <div class="confirm-row hidden" id="abandon-confirm">
          <span class="confirm-label abandon-warn">Discard all timestamps? This cannot be undone.</span>
          <button class="abandon-btn" id="abandon-yes-btn">Yes, abandon</button>
          <button class="confirm-no" id="abandon-back-btn">Go back</button>
        </div>
      </div>

      <div class="resize-handle" id="resize-handle" title="Drag to resize"></div>
    `;
  }

  // ── Events ──────────────────────────────────────────────────────────────────

  function bindEvents(panel) {
    // Minimise
    let minimised = false;
    q('#min-btn').addEventListener('click', () => {
      minimised = !minimised;
      q('#panel-body').style.display = minimised ? 'none' : '';
      q('#min-btn').textContent = minimised ? '+' : '−';
    });

    // Layout toggle (wide ↔ thin)
    let thinMode = false;
    q('#layout-btn').addEventListener('click', () => {
      thinMode = !thinMode;
      q('.panel').classList.toggle('thin', thinMode);
      q('#layout-btn').textContent = thinMode ? '⇔' : '⇔';
      // Clear any freeform resize so preset widths take over
      q('.panel').style.width  = '';
      q('.panel').style.height = '';
    });

    // Settings
    q('#settings-btn').addEventListener('click', () => sendMsg({ type: 'OPEN_SETTINGS' }));

    // Folder — copy configured output path to clipboard
    q('#folder-btn').addEventListener('click', () => {
      const dir = settings?.clipOutputDirectory || settings?.outputDirectory;
      if (!dir) {
        flash('No output directory set — configure in Settings.', 'error');
        return;
      }
      navigator.clipboard.writeText(dir).catch(() => {});
      flash('Path copied: ' + dir, 'success');
    });

    // Drag (header)
    makeDraggable(q('#drag-handle'), host);

    // Resize (bottom-right handle)
    makeResizable(q('#resize-handle'), q('.panel'));

    // Stream delay input
    q('#delay-input').addEventListener('change', (e) => {
      streamDelaySecs = Math.max(0, parseInt(e.target.value) || 0);
      e.target.value = streamDelaySecs;
    });

    // Umpire selection
    q('#u1-btn').addEventListener('click', () => selectUmpire('umpire1'));
    q('#u2-btn').addEventListener('click', () => selectUmpire('umpire2'));

    // Tag selection — event delegation
    q('#tags-grid').addEventListener('click', (e) => {
      const btn = e.target.closest('.tag-btn');
      if (!btn) return;
      shadow.querySelectorAll('.tag-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedTag = btn.dataset.tag;
    });

    // Log event
    q('#log-btn').addEventListener('click', logEvent);

    // End match — step 1: save or abandon
    q('#end-btn').addEventListener('click', () => {
      q('#end-choice').classList.remove('hidden');
      q('#end-btn').disabled = true;
    });

    q('#end-cancel-btn').addEventListener('click', () => {
      q('#end-choice').classList.add('hidden');
      q('#end-btn').disabled = false;
    });

    q('#save-match-btn').addEventListener('click', endMatch);

    // Abandon — step 2: secondary confirmation
    q('#abandon-match-btn').addEventListener('click', () => {
      q('#end-choice').classList.add('hidden');
      q('#abandon-confirm').classList.remove('hidden');
    });

    q('#abandon-back-btn').addEventListener('click', () => {
      q('#abandon-confirm').classList.add('hidden');
      q('#end-choice').classList.remove('hidden');
    });

    q('#abandon-yes-btn').addEventListener('click', abandonMatch);
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  function selectUmpire(which) {
    selectedUmpire = which;
    q('#u1-btn').classList.toggle('active', which === 'umpire1');
    q('#u2-btn').classList.toggle('active', which === 'umpire2');
  }

  async function logEvent() {
    if (!selectedUmpire) { flash('Select an umpire first.', 'error'); return; }
    if (!selectedTag)    { flash('Select a tag type first.', 'error'); return; }

    const liveElapsed    = q('#timer').textContent;
    const adjustedElapsed = applyDelay(liveElapsed, streamDelaySecs);
    const umpireName = selectedUmpire === 'umpire1'
      ? matchState.matchData.umpire1
      : matchState.matchData.umpire2;

    const event = {
      timestamp_elapsed:      adjustedElapsed,   // recording-aligned (used for clip cutting)
      timestamp_elapsed_live: liveElapsed,        // what the timer showed at the venue
      stream_delay_seconds:   streamDelaySecs,
      timestamp_unix:         Math.floor(Date.now() / 1000),
      umpire: umpireName,
      tag:    selectedTag,
      notes:  q('#notes').value.trim(),
    };

    const result = await sendMsg({ type: 'LOG_EVENT', event });
    if (result.error) { flash('Error: ' + result.error, 'error'); return; }

    q('#notes').value = '';
    shadow.querySelectorAll('.tag-btn.active').forEach((b) => b.classList.remove('active'));
    selectedTag = null;

    const delayNote = streamDelaySecs > 0 ? ` (+${streamDelaySecs}s → ${adjustedElapsed})` : '';
    flash(`#${result.eventId} — ${umpireName} / ${event.tag}${delayNote}`, 'success');
  }

  async function endMatch() {
    const saveBtn = q('#save-match-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Stopping…';

    const result = await sendMsg({ type: 'END_MATCH' });
    if (result.error) {
      flash('Error: ' + result.error, 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save & process';
      q('#end-btn').disabled = false;
      q('#end-choice').classList.add('hidden');
      return;
    }

    clearInterval(timerInterval);
    showPostMatchScreen(result);
  }

  async function abandonMatch() {
    const btn = q('#abandon-yes-btn');
    btn.disabled = true;
    btn.textContent = 'Abandoning…';

    const result = await sendMsg({ type: 'ABANDON_MATCH' });
    if (result.error) {
      flash('Error: ' + result.error, 'error');
      btn.disabled = false;
      btn.textContent = 'Yes, abandon';
      return;
    }

    clearInterval(timerInterval);
    host.remove();
  }

  function showPostMatchScreen(result) {
    const body = q('#panel-body');
    if (!body) { host.remove(); return; }

    const pr = result.processingResult;

    let statusHTML;
    if (!pr) {
      // Native host not installed — show fallback commands
      const jsonFile  = result.jsonFilename || '<events.json>';
      const videoPath = result.outputPath   || '<path/to/recording.mp4>';
      const outFlag   = result.clipOutputDir ? ` --out "${result.clipOutputDir}"` : '';
      const clipCmd   = `node clip_cutter.js --json "${jsonFile}" --video "${videoPath}"${outFlag}`;
      const reportCmd = `node report_generator.js --json "${jsonFile}"${outFlag}`;

      statusHTML = `
        <p class="post-hint">JSON saved to Downloads. Run from the <code>post-processing</code> folder to process:</p>
        <div class="post-label">Cut clips</div>
        <div class="cmd-block">${esc(clipCmd)}</div>
        <button class="copy-btn" data-copy="${esc(clipCmd)}">Copy</button>
        <div class="post-label" style="margin-top:10px">Generate PDF report</div>
        <div class="cmd-block">${esc(reportCmd)}</div>
        <button class="copy-btn" data-copy="${esc(reportCmd)}">Copy</button>
        <p class="post-hint" style="margin-top:8px">To automate this, run <code>install.ps1</code> in <code>native-host/</code>.</p>
      `;
    } else if (!pr.success) {
      statusHTML = `<p class="post-status error">Processing error: ${esc(pr.error || 'unknown')}</p>`;
    } else {
      const rows = (pr.results || []).map(r => {
        const icon  = r.success ? '✓' : '✗';
        const label = r.type === 'report' ? 'PDF report' : 'Clips';
        const msg   = r.success ? (r.message || 'done') : (r.error || 'failed');
        return `<div class="result-row ${r.success ? 'ok' : 'fail'}">${icon} ${label} — ${esc(msg)}</div>`;
      }).join('');
      const outDir = esc(pr.outDir || result.clipOutputDir || '');
      statusHTML = `
        ${rows}
        ${outDir ? `<div class="post-label" style="margin-top:10px">Output folder</div>
        <div class="cmd-block">${outDir}</div>
        <button class="copy-btn" data-copy="${outDir}">Copy path</button>` : ''}
      `;
    }

    body.innerHTML = `
      <div class="post-header">Match ended</div>
      ${statusHTML}
      <button class="close-overlay-btn" id="close-overlay-btn">Close</button>
    `;

    body.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(btn.dataset.copy).catch(() => {});
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = orig; }, 1800);
      });
    });

    body.querySelector('#close-overlay-btn').addEventListener('click', () => host.remove());
  }

  // ── Timer ───────────────────────────────────────────────────────────────────

  function startTimer() {
    if (!matchState?.startTime) return;
    const start = matchState.startTime;
    function tick() {
      const el = q('#timer');
      if (!el) return;
      const ms = Date.now() - start;
      el.textContent = secsToElapsed(Math.floor(ms / 1000));
    }
    tick();
    timerInterval = setInterval(tick, 1000);
  }

  // ── Drag ────────────────────────────────────────────────────────────────────

  function makeDraggable(handle, target) {
    handle.addEventListener('mousedown', (e) => {
      // Don't steal clicks on control buttons inside the header
      if (e.target.closest('.ctrl')) return;

      const rect = target.getBoundingClientRect();
      const startX = e.clientX, startY = e.clientY;
      const startL = rect.left,  startT = rect.top;

      const onMove = (e) => {
        target.style.left  = startL + (e.clientX - startX) + 'px';
        target.style.top   = startT + (e.clientY - startY) + 'px';
        target.style.right = 'auto';
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault();
    });
  }

  // ── Resize ──────────────────────────────────────────────────────────────────

  function makeResizable(handle, panel) {
    handle.addEventListener('mousedown', (e) => {
      const startX = e.clientX, startY = e.clientY;
      const startW = panel.offsetWidth, startH = panel.offsetHeight;

      const onMove = (e) => {
        panel.style.width  = Math.max(220, startW + (e.clientX - startX)) + 'px';
        panel.style.height = Math.max(180, startH + (e.clientY - startY)) + 'px';
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault();
      e.stopPropagation();
    });
  }

  // ── Utilities ────────────────────────────────────────────────────────────────

  function q(sel) { return shadow.querySelector(sel); }

  function pad(n) { return String(n).padStart(2, '0'); }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function elapsedToSecs(elapsed) {
    const [h, m, s] = elapsed.split(':').map(Number);
    return h * 3600 + m * 60 + (s || 0);
  }

  function secsToElapsed(total) {
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  /** Add stream delay to elapsed (recording is behind live venue). */
  function applyDelay(elapsed, delaySecs) {
    return secsToElapsed(elapsedToSecs(elapsed) + delaySecs);
  }

  function flash(msg, type) {
    const el = q('#status');
    if (!el) return;
    el.textContent = msg;
    el.className = `status ${type}`;
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.textContent = ''; el.className = 'status'; }, 4500);
  }

  function sendMsg(payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(payload, (res) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(res);
      });
    });
  }

  // ── Styles ──────────────────────────────────────────────────────────────────

  const CSS = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    .panel {
      position: relative;
      width: 300px;
      min-width: 220px;
      background: rgba(10, 12, 20, 0.97);
      border: 1px solid rgba(79, 124, 255, 0.25);
      border-radius: 12px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04);
      color: #e8eaf0;
      font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      user-select: none;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    /* ── Header ── */

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 9px 12px;
      background: rgba(79, 124, 255, 0.08);
      border-bottom: 1px solid rgba(255,255,255,0.07);
      cursor: grab;
      flex-shrink: 0;
    }
    .header:active { cursor: grabbing; }

    .title {
      font-size: 12px;
      font-weight: 700;
      color: #4f7cff;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }

    .controls { display: flex; gap: 5px; }

    .ctrl {
      background: none;
      border: 1px solid rgba(255,255,255,0.12);
      color: rgba(255,255,255,0.45);
      border-radius: 5px;
      width: 24px;
      height: 24px;
      cursor: pointer;
      font-size: 12px;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: border-color 0.15s, color 0.15s;
      padding: 0;
    }
    .ctrl:hover { border-color: #4f7cff; color: #4f7cff; }

    /* ── Body ── */

    .body {
      padding: 11px 13px 13px;
      overflow-y: auto;
      flex: 1;
    }

    /* ── Timer ── */

    .timer {
      font-size: 30px;
      font-weight: 800;
      text-align: center;
      letter-spacing: 4px;
      color: #4f7cff;
      padding: 6px 0 6px;
      font-variant-numeric: tabular-nums;
    }

    /* ── Stream delay ── */

    .delay-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 4px 0 6px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      margin-bottom: 2px;
    }

    .delay-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: rgba(255,255,255,0.35);
    }

    .delay-input {
      width: 52px;
      padding: 3px 6px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 5px;
      color: #e8eaf0;
      font-size: 12px;
      font-family: inherit;
      text-align: center;
      font-variant-numeric: tabular-nums;
      -moz-appearance: textfield;
    }
    .delay-input::-webkit-outer-spin-button,
    .delay-input::-webkit-inner-spin-button { -webkit-appearance: none; }
    .delay-input:focus { outline: none; border-color: rgba(79,124,255,0.6); }

    .delay-unit {
      font-size: 10px;
      color: rgba(255,255,255,0.3);
      font-weight: 600;
    }

    /* ── Labels ── */

    .section-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: rgba(255,255,255,0.3);
      margin: 9px 0 5px;
    }
    .optional { font-weight: 400; text-transform: none; letter-spacing: 0; }

    /* ── Umpires ── */

    .umpire-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 7px;
    }

    .umpire-btn {
      padding: 7px 5px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 7px;
      color: #c8cadb;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: all 0.15s;
    }
    .umpire-btn:hover { border-color: #4f7cff; color: #4f7cff; }
    .umpire-btn.active {
      background: rgba(79,124,255,0.18);
      border-color: #4f7cff;
      color: #4f7cff;
      font-weight: 700;
    }

    /* ── Tag grid — reflows as panel widens ── */

    .tags-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
      gap: 5px;
    }

    .tag-btn {
      padding: 6px 4px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.09);
      border-radius: 6px;
      color: #9a9db8;
      font-size: 11px;
      cursor: pointer;
      text-align: center;
      transition: all 0.12s;
      font-family: inherit;
    }
    .tag-btn:hover { background: rgba(255,255,255,0.08); color: #e8eaf0; }
    .tag-btn.active {
      background: rgba(79,124,255,0.14);
      border-color: #4f7cff;
      color: #7aa3ff;
      font-weight: 700;
    }

    /* Card-specific colours */
    .tag-btn[data-tag="Green Card"]         { border-color: rgba(45,206,137,0.25); }
    .tag-btn[data-tag="Green Card"].active  { background: rgba(45,206,137,0.14); border-color: #2dce89; color: #2dce89; }
    .tag-btn[data-tag="Yellow Card"]        { border-color: rgba(255,196,0,0.25); }
    .tag-btn[data-tag="Yellow Card"].active { background: rgba(255,196,0,0.14); border-color: #ffc400; color: #ffc400; }
    .tag-btn[data-tag="Red Card"]           { border-color: rgba(233,69,96,0.25); }
    .tag-btn[data-tag="Red Card"].active    { background: rgba(233,69,96,0.14); border-color: #e94560; color: #e94560; }

    /* ── Notes ── */

    textarea {
      width: 100%;
      padding: 7px 9px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.09);
      border-radius: 6px;
      color: #e8eaf0;
      font-size: 12px;
      font-family: inherit;
      resize: none;
      transition: border-color 0.15s;
    }
    textarea:focus { outline: none; border-color: rgba(79,124,255,0.5); }
    textarea::placeholder { color: rgba(255,255,255,0.2); }

    /* ── Status flash ── */

    .status {
      min-height: 18px;
      font-size: 11px;
      text-align: center;
      margin: 6px 0 3px;
      padding: 3px 8px;
      border-radius: 4px;
    }
    .status.success { color: #2dce89; background: rgba(45,206,137,0.1); }
    .status.error   { color: #e94560; background: rgba(233,69,96,0.1); }

    /* ── Actions ── */

    .action-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 7px;
      margin-top: 7px;
    }

    .log-btn {
      padding: 9px;
      background: #4f7cff;
      border: none;
      border-radius: 7px;
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.15s;
      font-family: inherit;
    }
    .log-btn:hover { background: #6b93ff; }

    .end-btn {
      padding: 9px;
      background: transparent;
      border: 1px solid rgba(233,69,96,0.5);
      border-radius: 7px;
      color: #e94560;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s;
      font-family: inherit;
    }
    .end-btn:hover:not(:disabled) { background: #e94560; color: #fff; border-color: #e94560; }
    .end-btn:disabled { opacity: 0.45; cursor: not-allowed; }

    /* ── End-match confirm ── */

    .confirm-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 8px;
      padding: 8px 10px;
      background: rgba(233,69,96,0.08);
      border: 1px solid rgba(233,69,96,0.3);
      border-radius: 7px;
    }
    .confirm-row.hidden { display: none; }

    .confirm-label { font-size: 11px; color: #e94560; line-height: 1.3; }
    .abandon-warn  { color: #ffa040; }

    .end-choice-btns {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 5px;
    }

    .confirm-yes {
      padding: 5px 10px;
      background: #2dce89;
      border: none;
      border-radius: 5px;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      font-family: inherit;
      white-space: nowrap;
    }
    .confirm-yes:disabled { opacity: 0.6; cursor: not-allowed; }

    .abandon-btn {
      padding: 5px 10px;
      background: #e94560;
      border: none;
      border-radius: 5px;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      font-family: inherit;
      white-space: nowrap;
    }
    .abandon-btn:disabled { opacity: 0.6; cursor: not-allowed; }

    .confirm-no {
      padding: 5px 10px;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 5px;
      color: rgba(255,255,255,0.55);
      font-size: 11px;
      cursor: pointer;
      font-family: inherit;
      align-self: flex-start;
    }
    .confirm-no:hover { color: #fff; border-color: rgba(255,255,255,0.4); }

    /* ── Thin mode ── */

    .panel.thin {
      width: 165px !important;
    }

    .panel.thin .timer {
      font-size: 22px;
      letter-spacing: 2px;
    }

    .panel.thin .umpire-row {
      grid-template-columns: 1fr;
    }

    .panel.thin .tags-grid {
      grid-template-columns: 1fr;
    }

    .panel.thin .action-row {
      grid-template-columns: 1fr;
    }

    .panel.thin .delay-row {
      gap: 4px;
    }

    .panel.thin .delay-label {
      font-size: 9px;
    }

    /* ── Post-match screen ── */

    .post-header {
      font-size: 15px;
      font-weight: 800;
      color: #2dce89;
      text-align: center;
      padding: 8px 0 4px;
    }

    .post-hint {
      font-size: 11px;
      color: rgba(255,255,255,0.45);
      text-align: center;
      line-height: 1.5;
      margin-bottom: 10px;
    }

    .post-hint code {
      font-family: monospace;
      background: rgba(255,255,255,0.08);
      padding: 1px 4px;
      border-radius: 3px;
    }

    .post-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: rgba(255,255,255,0.3);
      margin-bottom: 5px;
    }

    .cmd-block {
      background: rgba(0,0,0,0.4);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px;
      padding: 7px 9px;
      font-family: 'Courier New', monospace;
      font-size: 10px;
      color: #a8d8ff;
      word-break: break-all;
      line-height: 1.5;
      user-select: text;
      margin-bottom: 5px;
    }

    .copy-btn {
      display: block;
      width: 100%;
      padding: 6px;
      background: rgba(79,124,255,0.1);
      border: 1px solid rgba(79,124,255,0.3);
      border-radius: 5px;
      color: #4f7cff;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      transition: background 0.15s;
    }
    .copy-btn:hover { background: rgba(79,124,255,0.25); }

    .post-status {
      font-size: 11px;
      padding: 8px 10px;
      border-radius: 6px;
      margin: 6px 0;
    }
    .post-status.error { color: #e94560; background: rgba(233,69,96,0.1); border: 1px solid rgba(233,69,96,0.3); }

    .result-row {
      font-size: 11px;
      padding: 5px 8px;
      border-radius: 5px;
      margin-bottom: 5px;
      line-height: 1.4;
    }
    .result-row.ok   { color: #2dce89; background: rgba(45,206,137,0.08); }
    .result-row.fail { color: #e94560; background: rgba(233,69,96,0.08); }

    .close-overlay-btn {
      display: block;
      width: 100%;
      margin-top: 14px;
      padding: 8px;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 7px;
      color: rgba(255,255,255,0.4);
      font-size: 12px;
      cursor: pointer;
      font-family: inherit;
      transition: color 0.15s, border-color 0.15s;
    }
    .close-overlay-btn:hover { color: rgba(255,255,255,0.7); border-color: rgba(255,255,255,0.3); }

    /* ── Resize handle ── */

    .resize-handle {
      position: absolute;
      right: 0;
      bottom: 0;
      width: 16px;
      height: 16px;
      cursor: se-resize;
      /* Three diagonal lines in the corner */
      background-image:
        linear-gradient(135deg,
          transparent 40%, rgba(255,255,255,0.15) 40%, rgba(255,255,255,0.15) 50%,
          transparent 50%, transparent 65%, rgba(255,255,255,0.15) 65%, rgba(255,255,255,0.15) 75%,
          transparent 75%
        );
      border-bottom-right-radius: 12px;
    }
  `;
})();
