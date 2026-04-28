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
      date:        val('date'),
      competition: val('competition'),
      venue:       val('venue'),
    };

    if (!matchData.umpire1 || !matchData.umpire2) {
      showError('Both umpire names are required.');
      return;
    }

    await attemptStart(matchData);
  });
});

// ── Start flow ────────────────────────────────────────────────────────────────

async function attemptStart(matchData) {
  hideError();
  showScreen('loading-screen');

  const result = await msg({ type: 'START_MATCH', matchData });

  if (result.obsError) {
    showObsError(result.errorMessage, matchData);
    return;
  }
  if (result.error) {
    showScreen('setup-screen');
    showError(result.error);
    return;
  }

  window.close();
}

function showObsError(errorMessage, matchData) {
  document.getElementById('obs-error-msg').textContent = errorMessage;
  showScreen('obs-error-screen');

  document.getElementById('retry-btn').onclick = () => attemptStart(matchData);

  document.getElementById('skip-video-btn').onclick = async () => {
    showScreen('loading-screen');
    document.getElementById('loading-msg').textContent = 'Starting without video…';
    const result = await msg({ type: 'START_MATCH_SKIP_OBS', matchData });
    if (result.error) {
      showScreen('setup-screen');
      showError(result.error);
    } else {
      window.close();
    }
  };

  document.getElementById('cancel-start-btn').onclick = () => {
    showScreen('setup-screen');
  };
}

function showScreen(id) {
  for (const s of ['setup-screen', 'loading-screen', 'obs-error-screen', 'active-screen']) {
    document.getElementById(s).hidden = s !== id;
  }
}

function showActiveScreen(matchState) {
  showScreen('active-screen');

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
