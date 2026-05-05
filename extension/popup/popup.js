const SPORT_DATA = {
  field_hockey: {
    name: 'Field Hockey',
    officials: ['Umpire 1', 'Umpire 2'],
    tags: ['Positioning', 'Overheads', 'Breakdown', 'Whistle Timing', 'Hitting Ball Away', 'Advantage', 'Player Management', 'Green Card', 'Yellow Card', 'Red Card', 'Presentation', 'Teamwork'],
  },
  football: {
    name: 'Football (Soccer)',
    officials: ['Referee', 'AR 1', 'AR 2'],
    tags: ['Offside Decision', 'Foul — Awarded', 'Foul — Missed', 'Advantage Played', 'Yellow Card', 'Red Card', 'Penalty Decision', 'Corner / Goal Kick', 'AR Flag', 'Positioning', 'Communication'],
  },
  rugby_union: {
    name: 'Rugby Union',
    officials: ['Referee', 'AR 1', 'AR 2'],
    tags: ['Offside at Ruck', 'Offside at Lineout', 'High Tackle', 'Ruck Infringement', 'Scrum Decision', 'Penalty Awarded', 'Yellow Card', 'Red Card', 'Try Awarded', 'Try Denied', 'Advantage Played', 'Positioning', 'Communication'],
  },
  basketball: {
    name: 'Basketball',
    officials: ['Referee 1', 'Referee 2', 'Referee 3'],
    tags: ['Foul Called', 'Foul Missed', 'Travel', 'Double Dribble', 'Out of Bounds', 'Goaltending', 'Technical Foul', 'Free Throw Administration', 'Shot Clock Violation', 'Positioning', 'Communication'],
  },
};

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('date').value = new Date().toISOString().slice(0, 10);

  const [{ matchState }, { settings }] = await Promise.all([
    msg({ type: 'GET_MATCH_STATE' }),
    msg({ type: 'GET_SETTINGS' }),
  ]);

  if (matchState?.active) {
    showActiveScreen(matchState);
    return;
  }

  // Show any error that occurred after the popup closed (e.g. OBS stole focus
  // mid-launch so the user couldn't see the inline error message).
  const { pendingObsError } = await chrome.storage.local.get('pendingObsError');
  if (pendingObsError) {
    await chrome.storage.local.remove('pendingObsError');
    showError(pendingObsError);
  }

  const sport = settings?.sport ?? 'field_hockey';
  renderOfficialsFields(sport);

  // ── Setup form ───────────────────────────────────────────────────────────────

  document.getElementById('settings-btn').addEventListener('click', openSettings);
  bindUpdateBtn();

  document.getElementById('setup-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const sportDef = SPORT_DATA[sport] ?? SPORT_DATA.field_hockey;
    const officials = sportDef.officials.map((role, i) => ({
      role,
      name: val(`official-${i}`),
    }));

    if (!officials[0]?.name) {
      showError(`${officials[0]?.role || 'First official'} name is required.`);
      return;
    }

    const matchData = {
      sport,
      officials: officials.filter(o => o.name),
      team1:       val('team1'),
      team2:       val('team2'),
      date:        val('date'),
      competition: val('competition'),
      venue:       val('venue'),
    };

    await startMatch(matchData);
  });
});

function renderOfficialsFields(sport) {
  const sportDef = SPORT_DATA[sport] ?? SPORT_DATA.field_hockey;
  const container = document.getElementById('officials-fields');
  container.innerHTML = sportDef.officials.map((role, i) => `
    <div class="field">
      <label for="official-${i}">${role}</label>
      <input type="text" id="official-${i}" placeholder="Full name" autocomplete="off">
    </div>
  `).join('');
}

// ── Start flow ────────────────────────────────────────────────────────────────

async function startMatch(matchData) {
  hideError();

  const btn = document.getElementById('start-btn');
  btn.disabled = true;
  btn.textContent = 'Launching OBS…';

  const result = await msg({ type: 'START_MATCH', matchData });

  btn.disabled = false;
  btn.textContent = '▶ Start Match';

  if (result.obsError) {
    showError(result.errorMessage);
    return;
  }

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
  const officialsStr = (m.officials || []).map(o => o.name).filter(Boolean).join(' & ')
    || `${m.umpire1 || ''} & ${m.umpire2 || ''}`.trim();
  document.getElementById('active-meta').textContent =
    `${teams}${officialsStr}\n${m.competition || ''} ${m.venue ? '· ' + m.venue : ''}`.trim();

  document.getElementById('settings-btn').addEventListener('click', openSettings);
  bindUpdateBtn();

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

// ── Update ───────────────────────────────────────────────────────────────────

function bindUpdateBtn() {
  document.getElementById('update-btn').addEventListener('click', async () => {
    const btn = document.getElementById('update-btn');
    const statusEl = document.getElementById('update-status');
    btn.disabled = true;
    btn.classList.add('spinning');
    statusEl.hidden = true;

    const result = await msg({ type: 'GIT_PULL' });

    btn.disabled = false;
    btn.classList.remove('spinning');

    if (!result.success) {
      statusEl.textContent = '✗ ' + result.error;
      statusEl.className = 'update-status error';
      statusEl.hidden = false;
      return;
    }

    if (result.upToDate) {
      statusEl.textContent = 'Already up to date.';
      statusEl.className = 'update-status success';
      statusEl.hidden = false;
      setTimeout(() => { statusEl.hidden = true; }, 3000);
    } else {
      statusEl.textContent = 'Updated! Reloading…';
      statusEl.className = 'update-status success';
      statusEl.hidden = false;
      setTimeout(() => chrome.runtime.reload(), 2000);
    }
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
