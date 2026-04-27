document.addEventListener('DOMContentLoaded', async () => {
  // Default date to today
  document.getElementById('date').value = new Date().toISOString().slice(0, 10);

  const { matchState } = await msg({ type: 'GET_MATCH_STATE' });
  if (matchState?.active) {
    showActiveScreen(matchState);
    return;
  }

  // ── Setup form ───────────────────────────────────────────────────────────────

  document.getElementById('settings-btn').addEventListener('click', openSettings);

  document.getElementById('setup-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const umpire1    = val('umpire1');
    const umpire2    = val('umpire2');
    const date       = val('date');
    const competition = val('competition');
    const venue      = val('venue');

    if (!umpire1 || !umpire2) {
      showError('Both umpire names are required.');
      return;
    }

    const startBtn = document.getElementById('start-btn');
    startBtn.disabled = true;
    startBtn.textContent = 'Starting…';
    hideError();

    const result = await msg({
      type: 'START_MATCH',
      matchData: { umpire1, umpire2, date, competition, venue },
    });

    if (result.error) {
      showError(result.error);
      startBtn.disabled = false;
      startBtn.textContent = '▶ Start Match';
      return;
    }

    window.close(); // overlay is now injected into the active tab
  });
});

function showActiveScreen(matchState) {
  document.getElementById('setup-screen').hidden = true;
  document.getElementById('active-screen').hidden = false;

  const m = matchState.matchData;
  document.getElementById('active-meta').textContent =
    `${m.umpire1} & ${m.umpire2}\n${m.competition} · ${m.venue}`;

  document.getElementById('settings-btn').addEventListener('click', openSettings);

  document.getElementById('resume-btn').addEventListener('click', async () => {
    await msg({ type: 'REINJECT_OVERLAY' });
    window.close();
  });

  document.getElementById('end-early-btn').addEventListener('click', async () => {
    const btn = document.getElementById('end-early-btn');
    btn.disabled = true;
    btn.textContent = 'Ending…';
    await msg({ type: 'END_MATCH' });
    window.close();
  });
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function msg(payload) {
  return chrome.runtime.sendMessage(payload);
}

function val(id) {
  return document.getElementById(id).value.trim();
}

function showError(text) {
  const el = document.getElementById('error-msg');
  el.textContent = text;
  el.hidden = false;
}

function hideError() {
  document.getElementById('error-msg').hidden = true;
}

function openSettings() {
  msg({ type: 'OPEN_SETTINGS' });
  window.close();
}
