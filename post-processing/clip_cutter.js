#!/usr/bin/env node
/**
 * clip_cutter.js — Cut video clips from an Umpire Coder event log
 *
 * Usage:
 *   node clip_cutter.js --json <path/to/events.json> --video <path/to/recording.mp4>
 *
 * Each event produces a 45-second clip centred around the tagged moment:
 *   start = max(0, timestamp_elapsed_seconds - 30)
 *   duration = 45 seconds
 *
 * Clips are saved to:
 *   <clip-output-dir>/<Date>_<Competition>_clips/<UmpireName>_<TagType>_<HH-MM-SS>.mp4
 *
 * Requires ffmpeg on PATH.
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { basename, join, resolve } from 'path';

// ── CLI args ──────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : null;
  };
  const jsonPath  = get('--json');
  const videoPath = get('--video');
  const outDir    = get('--out');   // optional override; defaults to same dir as video

  if (!jsonPath || !videoPath) {
    console.error('Usage: node clip_cutter.js --json <events.json> --video <recording.mp4> [--out <output-dir>]');
    process.exit(1);
  }
  return { jsonPath: resolve(jsonPath), videoPath: resolve(videoPath), outDir };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function elapsedToSecs(elapsed) {
  if (!elapsed || typeof elapsed !== 'string') return 0;
  const parts = elapsed.split(':').map(Number);
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    const [m, s] = parts;
    return m * 60 + s;
  }
  return 0;
}

function sanitise(str) {
  return (str || 'unknown')
    .replace(/[^a-zA-Z0-9_\- ]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 40);
}

function secsToHHMMSS(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return [h, m, s].map(v => String(v).padStart(2, '0')).join('-');
}

function folderName(meta) {
  const date   = (meta.date || 'unknown-date').replace(/\//g, '-');
  const comp   = sanitise(meta.competition || 'match');
  return `${date}_${comp}_clips`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const CLIP_PRE  = 30; // seconds before the event
const CLIP_DUR  = 45; // total clip duration

function main() {
  const { jsonPath, videoPath, outDir } = parseArgs();

  if (!existsSync(jsonPath))  { console.error(`JSON not found: ${jsonPath}`);  process.exit(1); }
  if (!existsSync(videoPath)) { console.error(`Video not found: ${videoPath}`); process.exit(1); }

  // Check ffmpeg
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
  } catch {
    console.error('ffmpeg not found on PATH. Install it from https://ffmpeg.org/download.html');
    process.exit(1);
  }

  const raw    = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const meta   = raw.match || {};
  const events = raw.events || [];

  if (events.length === 0) {
    console.log('No events found in JSON — nothing to cut.');
    return;
  }

  // Resolve output directory
  const baseDir = outDir
    ? resolve(outDir)
    : resolve(videoPath, '..'); // same folder as the video by default

  const clipsDir = join(baseDir, folderName(meta));
  mkdirSync(clipsDir, { recursive: true });
  console.log(`Output folder: ${clipsDir}\n`);

  let ok = 0;
  let fail = 0;

  for (let i = 0; i < events.length; i++) {
    const ev   = events[i];
    const idx  = String(i + 1).padStart(3, '0');

    // Use the delay-adjusted timestamp so clips align with the recording
    const elapsed = ev.timestamp_elapsed || ev.timestamp_elapsed_live || '00:00:00';
    const evSecs  = elapsedToSecs(elapsed);
    const start   = Math.max(0, evSecs - CLIP_PRE);

    const umpire  = sanitise(ev.umpire);
    const tag     = sanitise(ev.tag);
    const ts      = secsToHHMMSS(evSecs);
    const filename = `${idx}_${umpire}_${tag}_${ts}.mp4`;
    const outPath  = join(clipsDir, filename);

    // Skip if already exists (re-run safety)
    if (existsSync(outPath)) {
      console.log(`[${idx}] SKIP (exists): ${filename}`);
      ok++;
      continue;
    }

    const cmd = [
      'ffmpeg',
      '-ss', String(start),
      '-i', `"${videoPath}"`,
      '-t', String(CLIP_DUR),
      '-c', 'copy',
      '-avoid_negative_ts', 'make_zero',
      '-y',
      `"${outPath}"`,
    ].join(' ');

    process.stdout.write(`[${idx}] Cutting ${filename} … `);
    try {
      execSync(cmd, { stdio: 'pipe' });
      console.log('done');
      ok++;
    } catch (err) {
      const stderr = err.stderr ? err.stderr.toString().split('\n').pop() : err.message;
      console.log(`FAILED — ${stderr}`);
      fail++;
    }
  }

  console.log(`\n${ok} clip(s) written, ${fail} failed → ${clipsDir}`);
  if (fail > 0) process.exit(1);
}

main();
