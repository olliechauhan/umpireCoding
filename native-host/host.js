/**
 * native-host/host.js
 * Chrome Native Messaging host for Umpire Coder.
 * Chrome launches this process, sends one JSON message, and waits for one response.
 *
 * Protocol: each message = 4-byte LE uint32 length + UTF-8 JSON body.
 */

import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const POST_DIR   = join(__dirname, '..', 'post-processing');

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

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  let msg;
  try {
    msg = await readMessage();
  } catch (err) {
    sendMessage({ success: false, error: 'Failed to read message: ' + err.message });
    process.exit(1);
  }

  const { jsonData, jsonFilename, videoPath, clipOutputDir } = msg;

  const outDir = clipOutputDir || join(
    process.env.USERPROFILE || process.env.HOME || '.',
    'Documents', 'umpire-clips'
  );

  try { mkdirSync(outDir, { recursive: true }); }
  catch (err) {
    sendMessage({ success: false, error: 'Cannot create output dir: ' + err.message });
    process.exit(1);
  }

  // Save the JSON log to the output directory
  const jsonPath = join(outDir, jsonFilename);
  try { writeFileSync(jsonPath, jsonData, 'utf8'); }
  catch (err) {
    sendMessage({ success: false, error: 'Cannot save JSON: ' + err.message });
    process.exit(1);
  }

  const results = [];

  // ── PDF report (always) ───────────────────────────────────────────────────
  try {
    const out = execFileSync('node', ['report_generator.js', '--json', jsonPath, '--out', outDir], {
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
        'node',
        ['clip_cutter.js', '--json', jsonPath, '--video', videoPath, '--out', outDir],
        { cwd: POST_DIR, encoding: 'utf8', timeout: 600_000 }
      );
      results.push({ type: 'clips', success: true, message: out.trim() });
    } catch (err) {
      const detail = err.stderr ? err.stderr.toString().trim().split('\n').pop() : err.message;
      results.push({ type: 'clips', success: false, error: detail });
    }
  } else {
    results.push({ type: 'clips', success: false, error: 'No OBS recording path — clips skipped.' });
  }

  sendMessage({ success: true, results, outDir });
}

main().catch(err => {
  sendMessage({ success: false, error: err.message });
  process.exit(1);
});
