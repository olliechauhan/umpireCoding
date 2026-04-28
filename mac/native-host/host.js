/**
 * mac/native-host/host.js
 * Chrome Native Messaging host for Umpire Coder (macOS).
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
// post-processing/ is two levels up: mac/native-host/ -> mac/ -> repo root
const POST_DIR = join(__dirname, '..', '..', 'post-processing');

// Use the same Node binary that is running this script so post-processing
// scripts work even when Chrome's PATH doesn't include node.
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

// ── Path pickers ──────────────────────────────────────────────────────────────

function pickPath(kind, prompt) {
  const isFolder = kind === 'folder';
  const script = isFolder
    ? `POSIX path of (choose folder with prompt "${prompt}")`
    : `POSIX path of (choose file with prompt "${prompt}" default location "/Applications")`;
  try {
    const raw = execFileSync('osascript', ['-e', script], {
      encoding: 'utf8', timeout: 120_000,
    }).trim();
    return raw || null;
  } catch (err) {
    if (/cancel/i.test(err.message) || /1$/.test(String(err.status))) return null;
    throw err;
  }
}

// ── OBS launch ────────────────────────────────────────────────────────────────

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

  const obsPath = customPath || '/Applications/OBS.app';
  if (!existsSync(obsPath)) {
    const hint = customPath
      ? 'Check the OBS Path setting in Umpire Coder Settings.'
      : 'Make sure OBS is installed in /Applications, or set a custom path in Umpire Coder Settings.';
    throw new Error(`OBS not found at: ${obsPath}. ${hint}`);
  }

  spawn('open', [obsPath], { detached: true, stdio: 'ignore' }).unref();
  await waitForPort(port, 20_000);
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
      const path = pickPath(msg.kind, msg.prompt || 'Select');
      sendMessage({ success: true, path });
    } catch (err) {
      sendMessage({ success: false, error: err.message });
    }
    return;
  }

  if (msg.type === 'OPEN_FOLDER') {
    try {
      spawn('open', [msg.path || '.'], { detached: true, stdio: 'ignore' }).unref();
      sendMessage({ success: true });
    } catch (err) {
      sendMessage({ success: false, error: err.message });
    }
    return;
  }

  const { jsonData, jsonFilename, videoPath, clipOutputDir } = msg;

  const baseDir = clipOutputDir || join(
    process.env.HOME || '.',
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
