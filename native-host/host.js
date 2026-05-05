/**
 * native-host/host.js
 * Chrome Native Messaging host for Umpire Coder.
 * Chrome launches this process, sends one JSON message, and waits for one response.
 *
 * Protocol: each message = 4-byte LE uint32 length + UTF-8 JSON body.
 */

import { execFileSync, spawn } from 'child_process';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import net from 'net';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const POST_DIR  = join(__dirname, '..', 'post-processing');

// Use the same Node binary running this script so post-processing works
// even when Chrome's PATH doesn't include node.
const NODE = process.execPath;

function slugPart(str) {
  return (str || '').trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function matchSlug(meta) {
  const date = meta.date || 'unknown-date';
  const ump1 = slugPart(meta.umpire1) || 'Umpire1';
  const ump2 = slugPart(meta.umpire2) || 'Umpire2';
  const t1   = slugPart(meta.team1);
  const t2   = slugPart(meta.team2);
  const teams = (t1 && t2) ? `${t1}_v_${t2}_` : '';
  return `${date}_${teams}${ump1}_${ump2}`;
}

// ── Native messaging I/O ──────────────────────────────────────────────────────

function readMessage() {
  return new Promise((resolve, reject) => {
    let header = null;

    const tryRead = () => {
      if (!header) {
        header = process.stdin.read(4);
        if (!header) return;
      }
      const len  = header.readUInt32LE(0);
      const body = process.stdin.read(len);
      if (!body) return;

      cleanup();
      try { resolve(JSON.parse(body.toString('utf8'))); }
      catch (e) { reject(e); }
    };

    const onEnd = () => reject(new Error('stdin closed before message received'));
    const cleanup = () => {
      process.stdin.removeListener('readable', tryRead);
      process.stdin.removeListener('error', reject);
      process.stdin.removeListener('end', onEnd);
    };

    process.stdin.on('readable', tryRead);
    process.stdin.on('error', reject);
    process.stdin.on('end', onEnd);
    tryRead();
  });
}

function sendMessage(obj) {
  const body   = Buffer.from(JSON.stringify(obj), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([header, body]));
}

// ── Path pickers ─────────────────────────────────────────────────────────────

function pickPathWindows(kind, prompt, filter) {
  const isFolder = kind === 'folder';
  const script = isFolder
    ? [
        'Add-Type -AssemblyName System.Windows.Forms',
        `$d = New-Object System.Windows.Forms.FolderBrowserDialog`,
        `$d.Description = '${prompt}'`,
        `$d.ShowNewFolderButton = $true`,
        `if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }`,
      ].join('; ')
    : [
        'Add-Type -AssemblyName System.Windows.Forms',
        `$d = New-Object System.Windows.Forms.OpenFileDialog`,
        `$d.Title = '${prompt}'`,
        `$d.Filter = '${filter || 'All files (*.*)|*.*'}'`,
        `if ($d.ShowDialog() -eq 'OK') { $d.FileName }`,
      ].join('; ');

  return execFileSync('powershell', ['-Sta', '-NonInteractive', '-Command', script], {
    encoding: 'utf8', timeout: 120_000,
  }).trim();
}

function pickPathMac(kind, prompt) {
  const isFolder = kind === 'folder';
  const script = isFolder
    ? `POSIX path of (choose folder with prompt "${prompt}")`
    : `POSIX path of (choose file with prompt "${prompt}" default location "/Applications")`;
  return execFileSync('osascript', ['-e', script], {
    encoding: 'utf8', timeout: 120_000,
  }).trim();
}

function pickPath(kind, prompt, filter) {
  try {
    const raw = process.platform === 'win32'
      ? pickPathWindows(kind, prompt, filter)
      : pickPathMac(kind, prompt);
    return raw || null;
  } catch (err) {
    if (/cancel/i.test(err.message) || /1$/.test(String(err.status))) return null;
    throw err;
  }
}

// ── OBS launch ────────────────────────────────────────────────────────────────

const OBS_PATH = {
  win32:  'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe',
  darwin: '/Applications/OBS.app',
};

function waitForPort(port, timeoutMs = 20_000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const attempt = () => {
      const sock = net.createConnection({ port, host: '127.0.0.1' });
      sock.once('connect', () => { sock.destroy(); resolve(); });
      sock.once('error', () => {
        sock.destroy();
        if (Date.now() >= deadline) {
          reject(new Error('OBS did not become ready within 20 seconds'));
        } else {
          setTimeout(attempt, 500);
        }
      });
    };
    attempt();
  });
}

async function launchObs(port, customPath) {
  // If OBS is already running the port will already be open — nothing to do.
  try { await waitForPort(port, 1_000); return; } catch { /* not running yet */ }

  const obsPath = customPath || OBS_PATH[process.platform];
  if (!obsPath || !existsSync(obsPath)) {
    const hint = customPath
      ? `Check the OBS Path setting in Umpire Coder Settings.`
      : `Make sure OBS is installed in the default location, or set a custom path in Umpire Coder Settings.`;
    throw new Error(`OBS not found at: ${obsPath || '(no path set)'}. ${hint}`);
  }

  if (process.platform === 'darwin') {
    spawn('open', [obsPath], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn(obsPath, [], { detached: true, stdio: 'ignore', cwd: dirname(obsPath) }).unref();
  }

  await waitForPort(port, 20_000);

  if (process.platform === 'win32') minimizeObsWindow();
}

function minimizeObsWindow() {
  try {
    execFileSync('powershell', ['-NonInteractive', '-Command', `
$p = Get-Process obs64 -ErrorAction SilentlyContinue | Sort-Object StartTime -Descending | Select-Object -First 1
if ($p -and $p.MainWindowHandle -ne 0) {
  Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class ObsHelper { [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow); }'
  [ObsHelper]::ShowWindow($p.MainWindowHandle, 6)
}
    `], { encoding: 'utf8', timeout: 5_000 });
  } catch { /* non-fatal — window minimize is best-effort */ }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  let msg;
  try {
    msg = await readMessage();
  } catch (err) {
    sendMessage({ success: false, error: 'Failed to read message: ' + err.message });
    process.exit(1);
  }

  if (msg.type === 'LAUNCH_OBS') {
    try {
      await launchObs(msg.obsPort || 4455, msg.obsExePath || '');
      sendMessage({ success: true });
    } catch (err) {
      sendMessage({ success: false, error: err.message });
    }
    return;
  }

  if (msg.type === 'PICK_PATH') {
    try {
      const path = pickPath(msg.kind, msg.prompt || 'Select', msg.filter);
      sendMessage({ success: true, path });
    } catch (err) {
      sendMessage({ success: false, error: err.message });
    }
    return;
  }

  if (msg.type === 'OPEN_FOLDER') {
    try {
      const target = msg.path || '.';
      if (process.platform === 'win32') {
        spawn('explorer.exe', [target], { detached: true, stdio: 'ignore' }).unref();
      } else {
        spawn('open', [target], { detached: true, stdio: 'ignore' }).unref();
      }
      sendMessage({ success: true });
    } catch (err) {
      sendMessage({ success: false, error: err.message });
    }
    return;
  }

  if (msg.type === 'GIT_PULL') {
    const repoDir = join(__dirname, '..');
    const gitCandidates = ['git', 'C:\\Program Files\\Git\\cmd\\git.exe'];
    let lastErr = null;
    for (const gitBin of gitCandidates) {
      try {
        const stdout = execFileSync(gitBin, ['pull'], {
          cwd: repoDir, encoding: 'utf8', timeout: 30_000,
        });
        const upToDate = stdout.includes('Already up to date');
        sendMessage({ success: true, upToDate });
        return;
      } catch (err) {
        if (err.code === 'ENOENT') { lastErr = err; continue; }
        const detail = (err.stderr || '').toString().trim() || err.message;
        sendMessage({ success: false, error: detail });
        return;
      }
    }
    sendMessage({ success: false, error: 'git not found. Install Git for Windows and try again.' });
    return;
  }


  const { jsonData, jsonFilename, videoPath, clipOutputDir } = msg;

  const baseDir = clipOutputDir || join(
    process.env.USERPROFILE || process.env.HOME || '.',
    'Documents', 'umpire-clips'
  );

  // Compute the per-match subfolder from the JSON content
  let matchDir = join(baseDir, 'match');
  try {
    const log = JSON.parse(jsonData);
    matchDir = join(baseDir, matchSlug(log.match || {}));
  } catch { /* keep default */ }

  try { mkdirSync(matchDir, { recursive: true }); }
  catch (err) {
    sendMessage({ success: false, error: 'Cannot create output dir: ' + err.message });
    process.exit(1);
  }

  // Save the JSON log inside the match folder
  const jsonPath = join(matchDir, jsonFilename);
  try { writeFileSync(jsonPath, jsonData, 'utf8'); }
  catch (err) {
    sendMessage({ success: false, error: 'Cannot save JSON: ' + err.message });
    process.exit(1);
  }

  const results = [];

  // ── PDF report (always) ───────────────────────────────────────────────────
  try {
    const out = execFileSync(NODE, ['report_generator.js', '--json', jsonPath, '--out', matchDir], {
      cwd: POST_DIR, encoding: 'utf8', timeout: 30_000,
    });
    results.push({ type: 'report', success: true, message: out.trim() });
  } catch (err) {
    results.push({ type: 'report', success: false, error: err.message });
  }

  // ── Clip cutting (only if OBS returned a recording path) ─────────────────
  if (videoPath) {
    try {
      const out = execFileSync(
        NODE,
        ['clip_cutter.js', '--json', jsonPath, '--video', videoPath, '--out', matchDir],
        { cwd: POST_DIR, encoding: 'utf8', timeout: 600_000 }
      );
      results.push({ type: 'clips', success: true, message: out.trim() });
      // Delete the original recording now that all clips are cut.
      // Normalize the path — OBS on Windows often returns forward-slash paths.
      try {
        unlinkSync(resolve(videoPath));
        results.push({ type: 'cleanup', success: true, message: 'Original recording deleted.' });
      } catch (err) {
        results.push({ type: 'cleanup', success: false, error: `Could not delete recording: ${err.message}` });
      }
    } catch (err) {
      const detail = err.stderr ? err.stderr.toString().trim().split('\n').pop() : err.message;
      results.push({ type: 'clips', success: false, error: detail });
    }
  } else {
    results.push({ type: 'clips', success: false, error: 'No OBS recording path — clips skipped.' });
  }

  sendMessage({ success: true, results, outDir: matchDir });
}

main().catch(err => {
  sendMessage({ success: false, error: err.message });
  process.exit(1);
});
