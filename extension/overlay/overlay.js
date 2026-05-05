// Umpire Coder — overlay window.
// Runs as a standalone extension popup opened by background.js via chrome.windows.create.
// Communicates with the service worker exclusively via chrome.runtime.sendMessage.

let matchState      = null;
let tagTypes        = [];
let settings        = null;
let selectedUmpire  = null;
let selectedTag     = null;
let timerInterval   = null;
let streamDelaySecs = 0;
let pinned          = false;

document.addEventListener('DOMContentLoaded', () => {
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
});

// ── Render ───────────────────────────────────────────────────────────────────

function mount() {
  document.body.innerHTML = buildPanelHTML();
  bindEvents();
  startAutoResize();
}

function buildPanelHTML() {
  const u1 = esc(matchState?.matchData?.umpire1 ?? 'Umpire 1');
  const u2 = esc(matchState?.matchData?.umpire2 ?? 'Umpire 2');
  const tagButtons = tagTypes
    .map((t) => `<button class="tag-btn" data-tag="${esc(t)}">${esc(t)}</button>`)
    .join('');

  return `
    <div class="header">
      <span class="title">Umpire Coder</span>
      <div class="controls">
        <button class="ctrl" id="folder-btn" title="Open output folder">📁</button>
<button class="ctrl" id="settings-btn" title="Settings">⚙</button>
        <button class="ctrl" id="pin-btn" title="Pin to top">📌</button>
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
  `;
}

// ── Events ───────────────────────────────────────────────────────────────────

function bindEvents() {
  // Pin — toggle always-on-top (Windows) / raise-to-front (Mac)
  q('#pin-btn').addEventListener('click', async () => {
    pinned = !pinned;
    q('#pin-btn').classList.toggle('pinned', pinned);
    q('#pin-btn').title = pinned ? 'Unpin' : 'Pin to top';
    const res = await sendMsg({ type: 'SET_PIN_OVERLAY', pinned });
    if (res && !res.success) flash(`Pin failed: ${res.error}`, 'error');
  });

  // Minimise — minimize the OS window
  q('#min-btn').addEventListener('click', async () => {
    const win = await chrome.windows.getCurrent();
    chrome.windows.update(win.id, { state: 'minimized' });
  });

  // Settings
  q('#settings-btn').addEventListener('click', () => sendMsg({ type: 'OPEN_SETTINGS' }));

  // Folder — open output directory in File Explorer
  q('#folder-btn').addEventListener('click', () => {
    const dir = settings?.outputDirectory || settings?.clipOutputDirectory;
    if (!dir) {
      flash('No output directory set — configure in Settings.', 'error');
      return;
    }
    sendMsg({ type: 'OPEN_FOLDER', path: dir }).catch(() => {});
    flash('Opening folder…', 'success');
  });

  // Stream delay
  q('#delay-input').addEventListener('change', (e) => {
    streamDelaySecs = Math.max(0, parseInt(e.target.value) || 0);
    e.target.value = streamDelaySecs;
  });

  // Umpire selection
  q('#u1-btn').addEventListener('click', () => selectUmpire('umpire1'));
  q('#u2-btn').addEventListener('click', () => selectUmpire('umpire2'));

  // Tag selection
  q('#tags-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('.tag-btn');
    if (!btn) return;
    document.querySelectorAll('.tag-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    selectedTag = btn.dataset.tag;
  });

  // Log event
  q('#log-btn').addEventListener('click', logEvent);

  // End match — step 1
  q('#end-btn').addEventListener('click', () => {
    q('#end-choice').classList.remove('hidden');
    q('#end-btn').disabled = true;
  });

  q('#end-cancel-btn').addEventListener('click', () => {
    q('#end-choice').classList.add('hidden');
    q('#end-btn').disabled = false;
  });

  q('#save-match-btn').addEventListener('click', endMatch);

  // Abandon — step 2
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

// ── Actions ──────────────────────────────────────────────────────────────────

function selectUmpire(which) {
  selectedUmpire = which;
  q('#u1-btn').classList.toggle('active', which === 'umpire1');
  q('#u2-btn').classList.toggle('active', which === 'umpire2');
}

async function logEvent() {
  if (!selectedUmpire) { flash('Select an umpire first.', 'error'); return; }
  if (!selectedTag)    { flash('Select a tag type first.', 'error'); return; }

  const liveElapsed     = q('#timer').textContent;
  const adjustedElapsed = applyDelay(liveElapsed, streamDelaySecs);
  const umpireName      = selectedUmpire === 'umpire1'
    ? matchState.matchData.umpire1
    : matchState.matchData.umpire2;

  const event = {
    timestamp_elapsed:      adjustedElapsed,
    timestamp_elapsed_live: liveElapsed,
    stream_delay_seconds:   streamDelaySecs,
    timestamp_unix:         Math.floor(Date.now() / 1000),
    umpire: umpireName,
    tag:    selectedTag,
    notes:  q('#notes').value.trim(),
  };

  const result = await sendMsg({ type: 'LOG_EVENT', event });
  if (result.error) { flash('Error: ' + result.error, 'error'); return; }

  q('#notes').value = '';
  document.querySelectorAll('.tag-btn.active').forEach((b) => b.classList.remove('active'));
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
  window.close();
}

function showPostMatchScreen(result) {
  const body = q('#panel-body');
  if (!body) return;

  const pr = result.processingResult;
  let statusHTML;

  if (!pr) {
    const jsonFile  = result.jsonFilename || '<events.json>';
    const jsonPath  = `~/Downloads/${jsonFile}`;
    const videoPath = result.outputPath   || '<path/to/recording.mov>';
    const outFlag   = result.clipOutputDir ? ` --out "${result.clipOutputDir}"` : '';
    const clipCmd   = `node clip_cutter.js --json "${jsonPath}" --video "${videoPath}"${outFlag}`;
    const reportCmd = `node report_generator.js --json "${jsonPath}"${outFlag}`;

    statusHTML = `
      <p class="post-hint">JSON saved to Downloads. Run from the <code>post-processing</code> folder:</p>
      <div class="post-label">Cut clips</div>
      <div class="cmd-block">${esc(clipCmd)}</div>
      <div class="post-label" style="margin-top:10px">Generate PDF report</div>
      <div class="cmd-block">${esc(reportCmd)}</div>
    `;
  } else if (!pr.success) {
    statusHTML = `<p class="post-status error">Processing error: ${esc(pr.error || 'unknown')}</p>`;
  } else {
    const rows = (pr.results || []).map(r => {
      if (r.type === 'cleanup' && r.success) return '';
      const icon  = r.success ? '✓' : '✗';
      const label = r.type === 'report'  ? 'PDF report generated'
                  : r.type === 'clips'   ? 'Clips recorded'
                  : r.type === 'cleanup' ? 'Original recording deleted'
                  : r.type;
      const extra = r.success ? '' : ` — ${esc(r.error || 'failed')}`;
      return `<div class="result-row ${r.success ? 'ok' : 'fail'}">${icon} ${label}${extra}</div>`;
    }).join('');
    const outDir = pr.outDir || result.clipOutputDir || '';
    statusHTML = `
      ${rows}
      ${outDir ? `<button class="open-folder-btn" data-dir="${esc(outDir)}">📂 Open folder</button>` : ''}
    `;
  }

  body.innerHTML = `
    <div class="post-header">Match ended</div>
    ${statusHTML}
    <button class="close-overlay-btn" id="close-overlay-btn">Close</button>
  `;

  const openBtn = body.querySelector('.open-folder-btn');
  if (openBtn) {
    openBtn.addEventListener('click', () => {
      sendMsg({ type: 'OPEN_FOLDER', path: openBtn.dataset.dir }).catch(() => {});
    });
  }

  body.querySelector('#close-overlay-btn').addEventListener('click', () => window.close());
}

// ── Auto-resize ──────────────────────────────────────────────────────────────

let _cachedWinId = null;
let _chromeH     = null; // title bar + border height, computed once

async function resizeToContent() {
  if (_chromeH === null) _chromeH = window.outerHeight - window.innerHeight;
  const targetH = Math.round(document.body.offsetHeight + _chromeH);
  if (!_cachedWinId) {
    const win = await chrome.windows.getCurrent();
    _cachedWinId = win.id;
  }
  chrome.windows.update(_cachedWinId, { height: targetH });
}

function startAutoResize() {
  resizeToContent();
  const ro = new ResizeObserver(() => resizeToContent());
  ro.observe(document.body);
}

// ── Timer ────────────────────────────────────────────────────────────────────

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

// ── Utilities ─────────────────────────────────────────────────────────────────

function q(sel) { return document.querySelector(sel); }

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
