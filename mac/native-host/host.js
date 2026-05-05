/**
 * mac/native-host/host.js
 * Chrome Native Messaging host for Umpire Coder (macOS).
 * Chrome launches this process, sends one JSON message, and waits for one response.
 *
 * Protocol: each message = 4-byte LE uint32 length + UTF-8 JSON body.
 */

import { execFileSync, spawn } from 'child_process';
import { appendFileSync, existsSync, mkdirSync, statSync, unlinkSync, writeFileSync } from 'fs';
import net from 'net';
import { dirname, join, resolve } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// UC_POST_DIR is set by host.sh when running from ~/.umpire-coder (macOS).
// Falls back to the repo-relative path for development / Windows use.
const POST_DIR = process.env.UC_POST_DIR || join(__dirname, '..', '..', 'post-processing');

// Use the same Node binary that is running this script so post-processing
// scripts work even when Chrome's PATH doesn't include node.
const NODE = process.execPath;

// Debug log — UC_LOG is set by host.sh; falls back alongside host.js.
const LOG = process.env.UC_LOG || join(__dirname, 'debug.log');
function dbg(msg) {
  const line = new Date().toISOString() + '  ' + msg + '\n';
  process.stderr.write(line);
  try { appendFileSync(LOG, line); } catch {}
}

function slugPart(str) {
  return (str || '').trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function matchSlug(meta) {
  const date      = meta.date || 'unknown-date';
  const officials = meta.officials
    ? meta.officials.filter(o => o.name).map((o, i) => slugPart(o.name) || `Official${i + 1}`)
    : [meta.umpire1, meta.umpire2].filter(Boolean).map(slugPart);
  const offSlugs  = officials.length > 0 ? officials.join('_') : 'Unknown';
  const t1    = slugPart(meta.team1);
  const t2    = slugPart(meta.team2);
  const teams = (t1 && t2) ? `${t1}_v_${t2}_` : '';
  return `${date}_${teams}${offSlugs}`;
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

  // -g = open without bringing OBS to the foreground, so Chrome popup stays open.
  spawn('open', ['-g', obsPath], { detached: true, stdio: 'ignore' }).unref();
  await waitForPort(port, 20_000);
  // Minimize OBS to dock now that its WebSocket is ready.
  try {
    execFileSync('osascript', ['-e', 'tell application "OBS" to set miniaturized of window 1 to true'], { encoding: 'utf8', timeout: 3_000 });
  } catch { /* non-fatal */ }
}

// ── Video readiness check ─────────────────────────────────────────────────────

/**
 * OBS writes the moov atom (QuickTime index) at the END of .mov files when
 * recording stops. StopRecord responds before the file is fully flushed, so
 * we poll until the file size has been stable for several consecutive checks.
 * Without this, ffmpeg errors with "moov atom not found".
 */
async function waitForVideoReady(filePath, maxWaitMs = 30_000) {
  const CHECK_INTERVAL = 1_000; // ms between size checks
  const STABLE_NEEDED  = 3;     // consecutive equal-size checks needed
  const deadline       = Date.now() + maxWaitMs;

  let lastSize    = -1;
  let stableCount = 0;

  dbg(`waitForVideoReady: polling ${filePath}`);

  while (Date.now() < deadline) {
    try {
      const { size } = statSync(filePath);
      if (size > 0 && size === lastSize) {
        stableCount++;
        dbg(`waitForVideoReady: stable check ${stableCount}/${STABLE_NEEDED} (${size} bytes)`);
        if (stableCount >= STABLE_NEEDED) {
          dbg('waitForVideoReady: file is ready');
          return;
        }
      } else {
        if (size !== lastSize) dbg(`waitForVideoReady: size changed to ${size}`);
        lastSize    = size;
        stableCount = 0;
      }
    } catch (err) {
      dbg('waitForVideoReady: stat error — ' + err.message);
    }
    await new Promise(r => setTimeout(r, CHECK_INTERVAL));
  }

  dbg('waitForVideoReady: timed out — proceeding anyway');
}

// Wait until a file's size stops changing — OBS finalises MP4 after stop,
// so clip_cutter must not run until the moov atom has been written.
async function waitForFileReady(filePath, stabiliseMs = 2000, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastSize = -1;
  let stableFor = 0;
  while (Date.now() < deadline) {
    try {
      const { size } = statSync(filePath);
      if (size === lastSize) {
        stableFor += 500;
        if (stableFor >= stabiliseMs) return;
      } else {
        stableFor = 0;
        lastSize = size;
      }
    } catch { /* file not yet visible — keep waiting */ }
    await new Promise(r => setTimeout(r, 500));
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  dbg('host started, node=' + NODE);

  let msg;
  try {
    msg = await readMessage();
  } catch (err) {
    dbg('readMessage failed: ' + err.message);
    sendMessage({ success: false, error: 'Failed to read message: ' + err.message });
    process.exit(1);
  }

  dbg('received message type=' + (msg.type || '(none)'));

  if (msg.type === 'LAUNCH_OBS') {
    try {
      await launchObs(msg.obsPort || 4455, msg.obsExePath || '');
      dbg('LAUNCH_OBS success');
      sendMessage({ success: true });
    } catch (err) {
      dbg('LAUNCH_OBS error: ' + err.message);
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

  if (msg.type === 'GIT_PULL') {
    try {
      // UC_REPO_DIR is set by host.sh when running from ~/.umpire-coder.
      // Falls back to two levels up (mac/native-host → mac → repo root) for dev use.
      const repoDir = process.env.UC_REPO_DIR || join(__dirname, '..', '..');

      // /bin/sh is always present on macOS regardless of Chrome's restricted PATH.
      // The shell finds git via the user's full PATH (Homebrew, Xcode CLI tools, etc.).
      const stdout = execFileSync('/bin/sh', ['-c', 'git pull'], {
        cwd: repoDir, encoding: 'utf8', timeout: 30_000,
      });
      const upToDate = stdout.includes('Already up to date');
      dbg('GIT_PULL success upToDate=' + upToDate);

      // When running from the deployed location (~/.umpire-coder) and there were
      // updates, sync the changed files from the repo into ~/.umpire-coder so the
      // running host picks them up on next invocation.
      if (!upToDate && process.env.UC_REPO_DIR) {
        const ucDir = dirname(__dirname); // ~/.umpire-coder
        const syncCmd = [
          `cp "${repoDir}/mac/native-host/host.js" "${ucDir}/native-host/host.js"`,
          `cp "${repoDir}/post-processing/clip_cutter.js" "${ucDir}/post-processing/clip_cutter.js"`,
          `cp "${repoDir}/post-processing/report_generator.js" "${ucDir}/post-processing/report_generator.js"`,
          `cp "${repoDir}/post-processing/package.json" "${ucDir}/post-processing/package.json"`,
          `cd "${ucDir}/post-processing" && npm install --silent`,
        ].join(' && ');
        try {
          execFileSync('/bin/sh', ['-c', syncCmd], { encoding: 'utf8', timeout: 60_000 });
          dbg('GIT_PULL sync to ~/.umpire-coder complete');
        } catch (syncErr) {
          dbg('GIT_PULL sync error (non-fatal): ' + syncErr.message);
        }
      }

      sendMessage({ success: true, upToDate });
    } catch (err) {
      const detail = (err.stdout || err.stderr || '').toString().trim() || err.message;
      dbg('GIT_PULL error: ' + detail);
      sendMessage({ success: false, error: detail });
    }
    return;
  }

  // Unknown named message type — don't fall through to match processing
  if (msg.type) {
    sendMessage({ success: false, error: `Unknown message type: ${msg.type}` });
    return;
  }

  const { jsonData, jsonFilename, videoPath, clipOutputDir } = msg;

  // Default to ~/Movies/umpire-clips on macOS — ~/Documents is TCC-protected
  // and Chrome's subprocess cannot write there. ~/Movies is not protected.
  const baseDir = clipOutputDir || join(
    process.env.HOME || '.',
    'Movies', 'umpire-clips'
  );

  // Compute the per-match subfolder from the JSON content
  let matchDir = join(baseDir, 'match');
  try {
    const log = JSON.parse(jsonData);
    matchDir = join(baseDir, matchSlug(log.match || {}));
  } catch { /* keep default */ }

  try { mkdirSync(matchDir, { recursive: true }); }
  catch (err) {
    const hint = err.code === 'EPERM' || err.code === 'EACCES'
      ? ' macOS blocks access to Downloads, Documents and Desktop from Chrome\'s background process. Choose a different folder such as Movies or your home directory.'
      : '';
    sendMessage({ success: false, error: 'Cannot create output dir: ' + err.message + hint });
    process.exit(1);
  }

  const jsonPath = join(matchDir, jsonFilename);
  try { writeFileSync(jsonPath, jsonData, 'utf8'); }
  catch (err) {
    const hint = err.code === 'EPERM' || err.code === 'EACCES'
      ? ' macOS blocks access to Downloads, Documents and Desktop from Chrome\'s background process. Choose a different folder such as Movies or your home directory.'
      : '';
    sendMessage({ success: false, error: 'Cannot save JSON: ' + err.message + hint });
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
    // OBS writes the moov atom at the end of .mov files after stopping.
    // Wait until the file size has stabilised before handing it to ffmpeg.
    await waitForVideoReady(videoPath);

    try {
      const out = execFileSync(
        NODE,
        ['clip_cutter.js', '--json', jsonPath, '--video', videoPath, '--out', matchDir],
        { cwd: POST_DIR, encoding: 'utf8', timeout: 600_000 }
      );
      results.push({ type: 'clips', success: true, message: out.trim() });
      // Retry on EBUSY — OBS may still hold the file briefly after clip cutting finishes.
      try {
        const target = resolve(videoPath);
        let deleted = false;
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            unlinkSync(target);
            deleted = true;
            break;
          } catch (e) {
            if (e.code === 'EBUSY' && attempt < 4) {
              await new Promise(r => setTimeout(r, 2000));
            } else {
              throw e;
            }
          }
        }
        if (deleted) results.push({ type: 'cleanup', success: true, message: 'Original recording deleted.' });
      } catch (err) {
        results.push({ type: 'cleanup', success: false, error: `Could not delete recording: ${err.message}` });
      }
    } catch (err) {
      // clip_cutter.js logs per-clip errors to stdout (console.log), so check
      // stdout first for a useful message, then stderr, then the generic message.
      const fromStdout = err.stdout ? err.stdout.toString().trim().split('\n').filter(Boolean).pop() : '';
      const fromStderr = err.stderr ? err.stderr.toString().trim().split('\n').filter(Boolean).pop() : '';
      const detail = fromStdout || fromStderr || err.message;
      dbg('clip_cutter failed — stdout: ' + (err.stdout || '').toString().trim());
      dbg('clip_cutter failed — stderr: ' + (err.stderr || '').toString().trim());
      results.push({ type: 'clips', success: false, error: detail });
    }
  } else {
    results.push({ type: 'clips', success: false, error: 'No OBS recording path — clips skipped.' });
  }

  sendMessage({ success: true, results, outDir: matchDir });
}

main().catch(err => {
  dbg('unhandled error: ' + err.message);
  sendMessage({ success: false, error: err.message });
  process.exit(1);
});
