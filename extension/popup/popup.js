document.addEventListener('DOMContentLoaded', async () => {
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
    const matchData = {
      umpire1:     val('umpire1'),
      umpire2:     val('umpire2'),
      team1:       val('team1'),
      team2:       val('team2'),
      date:        val('date'),
      competition: val('competition'),
      venue:       val('venue'),
    };

    if (!matchData.umpire1 || !matchData.umpire2) {
      showError('Both umpire names are required.');
      return;
    }

    await startMatch(matchData);
  });
});

// ── Start flow ────────────────────────────────────────────────────────────────

async function startMatch(matchData) {
  hideError();
  document.getElementById('skip-video-btn').hidden = true;

  const btn = document.getElementById('start-btn');
  btn.disabled = true;
  btn.textContent = 'Starting…';

  const result = await msg({ type: 'START_MATCH', matchData });

  btn.disabled = false;
  btn.textContent = '▶ Start Match';

  if (result.obsError) {
    showError(result.errorMessage);
    const skipBtn = document.getElementById('skip-video-btn');
    skipBtn.hidden = false;
    skipBtn.onclick = () => startMatchSkipObs(matchData);
    return;
  }

  if (result.error) {
    showError(result.error);
    return;
  }

  window.close();
}

async function startMatchSkipObs(matchData) {
  hideError();
  document.getElementById('skip-video-btn').hidden = true;

  const btn = document.getElementById('start-btn');
  btn.disabled = true;
  btn.textContent = 'Starting…';

  const result = await msg({ type: 'START_MATCH_SKIP_OBS', matchData });

  btn.disabled = false;
  btn.textContent = '▶ Start Match';

  if (result.error) {
    showError(result.error);
    return;
  }

  window.close();
}

function showActiveScreen(matchState) {
  document.getElementById('setup-screen').hidden = true;
  document.getElementById('active-screen').hidden = false;

  const m = matchState.matchData;
  const teams = (m.team1 && m.team2) ? `${m.team1} v ${m.team2}\n` : '';
  document.getElementById('active-meta').textContent =
    `${teams}${m.umpire1} & ${m.umpire2}\n${m.competition || ''} ${m.venue ? '· ' + m.venue : ''}`.trim();

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
