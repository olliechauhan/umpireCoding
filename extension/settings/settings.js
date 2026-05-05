document.addEventListener('DOMContentLoaded', async () => {
  const { settings } = await msg({ type: 'GET_SETTINGS' });
  populate(settings ?? {});
  bindEvents();
});

// ── Populate form from stored settings ────────────────────────────────────────

function populate(s) {
  set('obs-host',      s.obsHost      ?? 'localhost');
  set('obs-port',      s.obsPort      ?? 4455);
  set('obs-password',  s.obsPassword  ?? '');
  set('obs-exe-path',  s.obsExePath   ?? '');
  set('output-dir',    s.outputDirectory || s.clipOutputDirectory || '');
  set('obs-format',    s.obsOutputFormat ?? 'mp4');
  set('obs-resolution', s.obsResolution  ?? '1920x1080');
  set('obs-framerate', String(s.obsFramerate ?? 30));
  set('crop-margin',   String(s.cropOverlayMargin ?? 200));
  document.getElementById('crop-margin-value').textContent = s.cropOverlayMargin ?? 200;

  renderTagList(s.tagTypes ?? []);
}

// ── Tag list ──────────────────────────────────────────────────────────────────

function renderTagList(tags) {
  document.getElementById('tag-list').innerHTML = '';
  tags.forEach(appendTag);
}

function appendTag(name) {
  const list = document.getElementById('tag-list');

  const item = document.createElement('div');
  item.className = 'tag-item';
  item.dataset.tag = name;

  const nameEl = document.createElement('span');
  nameEl.className = 'tag-name';
  nameEl.textContent = name;

  const editBtn = document.createElement('button');
  editBtn.className = 'icon-btn';
  editBtn.title = 'Edit';
  editBtn.textContent = '✏';

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'icon-btn danger';
  deleteBtn.title = 'Delete';
  deleteBtn.textContent = '×';

  // Inline edit toggle
  editBtn.addEventListener('click', () => {
    const editing = nameEl.isContentEditable;
    if (editing) {
      const newName = nameEl.textContent.trim();
      if (newName) {
        item.dataset.tag = newName;
        nameEl.contentEditable = 'false';
        editBtn.textContent = '✏';
        editBtn.title = 'Edit';
      }
    } else {
      nameEl.contentEditable = 'true';
      nameEl.focus();
      selectAll(nameEl);
      editBtn.textContent = '✓';
      editBtn.title = 'Save';
    }
  });

  nameEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); editBtn.click(); }
    if (e.key === 'Escape') {
      nameEl.textContent = item.dataset.tag;
      nameEl.contentEditable = 'false';
      editBtn.textContent = '✏';
    }
  });

  deleteBtn.addEventListener('click', () => item.remove());

  item.append(nameEl, editBtn, deleteBtn);
  list.appendChild(item);
}

function tagsFromDOM() {
  return Array.from(
    document.querySelectorAll('.tag-item')
  ).map((el) => el.dataset.tag);
}

// ── Events ────────────────────────────────────────────────────────────────────

function bindEvents() {
  // Browse buttons for path fields
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.browse-btn');
    if (!btn) return;

    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '…';

    const result = await msg({
      type:   'PICK_PATH',
      kind:   btn.dataset.kind,
      prompt: btn.dataset.prompt || 'Select',
      filter: btn.dataset.filter || '',
    });

    btn.disabled = false;
    btn.textContent = originalText;

    if (result?.success && result.path) {
      document.getElementById(btn.dataset.target).value = result.path;
    }
  });

  // Add tag
  const addBtn = document.getElementById('add-tag-btn');
  const newTagInput = document.getElementById('new-tag');

  addBtn.addEventListener('click', () => {
    const name = newTagInput.value.trim();
    if (!name) return;
    if (tagsFromDOM().includes(name)) {
      newTagInput.value = '';
      return;
    }
    appendTag(name);
    newTagInput.value = '';
    newTagInput.focus();
  });

  newTagInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addBtn.click();
  });

  // Live-update the crop margin label as the slider moves
  document.getElementById('crop-margin').addEventListener('input', (e) => {
    document.getElementById('crop-margin-value').textContent = e.target.value;
  });

  // Test OBS connection
  document.getElementById('test-conn-btn').addEventListener('click', async () => {
    const statusEl = document.getElementById('test-conn-status');
    setStatus(statusEl, 'Connecting…', '');
    const result = await msg({
      type: 'TEST_OBS_CONNECTION',
      settings: {
        obsHost:     get('obs-host')    || 'localhost',
        obsPort:     parseInt(get('obs-port')) || 4455,
        obsPassword: get('obs-password'),
      },
    });
    if (result.error) {
      setStatus(statusEl, '✗ ' + result.error, 'error');
    } else {
      const version = result.obsWebSocketVersion ?? '5';
      setStatus(statusEl, `✓ Connected (OBS WebSocket v${version})`, 'success');
    }
  });

  // Apply OBS settings
  document.getElementById('apply-obs-btn').addEventListener('click', async () => {
    const statusEl = document.getElementById('obs-status');
    setStatus(statusEl, 'Applying…', '');
    const result = await msg({ type: 'APPLY_OBS_SETTINGS', settings: gather() });
    if (result.error) {
      setStatus(statusEl, 'Error: ' + result.error, 'error');
    } else {
      setStatus(statusEl, 'Applied.', 'success');
    }
  });

  // Check for updates
  document.getElementById('update-btn').addEventListener('click', async () => {
    const statusEl = document.getElementById('update-status');
    const btn = document.getElementById('update-btn');
    btn.disabled = true;
    setStatus(statusEl, 'Checking…', '');
    const result = await msg({ type: 'GIT_PULL' });
    btn.disabled = false;
    if (!result.success) {
      setStatus(statusEl, '✗ ' + result.error, 'error');
      return;
    }
    if (result.upToDate) {
      setStatus(statusEl, 'Already up to date.', 'success');
    } else {
      setStatus(statusEl, 'UmpireCoder has been updated. Reloading in 3 seconds…', 'success');
      setTimeout(() => chrome.runtime.reload(), 3000);
    }
  });

  // Save all settings
  document.getElementById('save-btn').addEventListener('click', async () => {
    const statusEl = document.getElementById('save-status');
    setStatus(statusEl, 'Saving…', '');
    const result = await msg({ type: 'SAVE_SETTINGS', settings: gather() });
    if (result.error) {
      setStatus(statusEl, 'Error: ' + result.error, 'error');
    } else {
      setStatus(statusEl, 'Saved.', 'success');
      setTimeout(() => setStatus(statusEl, '', ''), 3000);
    }
  });
}

// ── Gather current form values ────────────────────────────────────────────────

function gather() {
  const outputDir = get('output-dir');
  return {
    obsHost:             get('obs-host')              || 'localhost',
    obsPort:             parseInt(get('obs-port'))    || 4455,
    obsPassword:         get('obs-password'),
    obsExePath:          get('obs-exe-path'),
    outputDirectory:     outputDir,
    obsOutputFormat:     get('obs-format'),
    obsResolution:       get('obs-resolution'),
    obsFramerate:        parseInt(get('obs-framerate')) || 30,
    cropOverlayMargin:   parseInt(get('crop-margin'))  || 200,
    clipOutputDirectory: outputDir,
    tagTypes:            tagsFromDOM(),
  };
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

function msg(payload) {
  return chrome.runtime.sendMessage(payload);
}

function set(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function get(id) {
  return (document.getElementById(id)?.value ?? '').trim();
}

function setStatus(el, text, type) {
  el.textContent = text;
  el.className = 'inline-status' + (type ? ' ' + type : '');
}

function selectAll(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}
