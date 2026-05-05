#!/usr/bin/env node
/**
 * report_generator.js — Generate a PDF report from an Umpire Coder event log.
 *
 * Usage:
 *   node report_generator.js --json <path/to/events.json> [--out <output-dir>]
 *
 * Requires: npm install   (installs pdfkit)
 */

import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'fs';
import { resolve, join } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const PDFDocument = require('pdfkit');

// ── CLI ───────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const get  = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
  const jsonPath = get('--json');
  if (!jsonPath) {
    console.error('Usage: node report_generator.js --json <events.json> [--out <output-dir>]');
    process.exit(1);
  }
  return { jsonPath: resolve(jsonPath), outDir: get('--out') };
}

// ── Colour palette — matches the extension UI ─────────────────────────────────

const C = {
  headerBg: '#0a0c14',   // extension dark background
  brand:    '#4f7cff',   // extension primary blue
  accent:   '#2dce89',   // extension green
  danger:   '#e94560',   // extension red
  text:     '#111827',
  muted:    '#6b7280',
  border:   '#d1d5db',
  rowEven:  '#f0f4ff',   // light blue tint
  rowOdd:   '#ffffff',
  white:    '#ffffff',
  subtext:  '#8fa8d8',
};

// Per-official accent colours
const UMPIRE_COLOR = ['#4f7cff', '#2dce89', '#f59e0b'];

const MARGIN    = 50;
const PAGE_W    = 595.28;  // A4 portrait
const CONTENT_W = PAGE_W - MARGIN * 2;

// ── Utilities ─────────────────────────────────────────────────────────────────

function countBy(events, key) {
  return events.reduce((acc, ev) => {
    const v = ev[key] || 'Unknown';
    acc[v] = (acc[v] || 0) + 1;
    return acc;
  }, {});
}

function elapsedToSecs(ts) {
  const p = (ts || '00:00:00').split(':').map(Number);
  return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
}

function secsToHMS(n) {
  const pad = v => String(Math.floor(v)).padStart(2, '0');
  return `${pad(n / 3600)}:${pad((n % 3600) / 60)}:${pad(n % 60)}`;
}

function slugPart(str) {
  return (str || '').trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function matchSlug(meta) {
  const date  = meta.date || 'unknown-date';
  const ump1  = slugPart(meta.umpire1) || 'Umpire1';
  const ump2  = slugPart(meta.umpire2) || 'Umpire2';
  const t1    = slugPart(meta.team1);
  const t2    = slugPart(meta.team2);
  const teams = (t1 && t2) ? `${t1}_v_${t2}_` : '';
  return `${date}_${teams}${ump1}_${ump2}`;
}

function reportFilename(meta) {
  return `${matchSlug(meta)}_report.pdf`;
}

// ── Draw hexagon (mimics the ⬡ logo icon from the extension) ─────────────────

function hexagon(doc, cx, cy, r, color, lw) {
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (i === 0) doc.moveTo(x, y); else doc.lineTo(x, y);
  }
  doc.closePath().strokeColor(color).lineWidth(lw).stroke();
}

// ── SECTION: Header ───────────────────────────────────────────────────────────

function drawHeader(doc, meta) {
  doc.rect(0, 0, PAGE_W, 90).fillColor(C.headerBg).fill();
  doc.rect(0, 87, PAGE_W, 3).fillColor(C.brand).fill();

  // Nested hexagon logo (like the ⬡ icon used in the extension)
  hexagon(doc, MARGIN + 20, 45, 18, C.brand, 2.5);
  hexagon(doc, MARGIN + 20, 45, 10, C.brand, 1.5);

  const tx = MARGIN + 50;
  doc.fillColor(C.brand).font('Helvetica-Bold').fontSize(8)
     .text('UMPIRE CODER', tx, 22, { characterSpacing: 1.5 });
  doc.fillColor(C.white).font('Helvetica-Bold').fontSize(19)
     .text('Umpire Performance Report', tx, 34);

  const sub = [meta.competition, meta.venue, meta.date].filter(Boolean).join('  ·  ');
  if (sub) doc.fillColor(C.subtext).font('Helvetica').fontSize(9).text(sub, tx, 62);
}

// ── SECTION: Match details ────────────────────────────────────────────────────

function drawMatchDetails(doc, meta, events, officials, y) {
  doc.fillColor(C.brand).font('Helvetica-Bold').fontSize(13).text('Match Details', MARGIN, y);
  y += 18;

  const officialRows = officials.length > 0
    ? officials.map(o => [o.role, o.name || '—'])
    : [['Officials', '—']];

  const rows = [
    ...officialRows,
    ['Date',         meta.date        || '—'],
    ['Competition',  meta.competition || '—'],
    ['Venue',        meta.venue       || '—'],
    ['Total events', String(events.length)],
  ];

  for (const [label, value] of rows) {
    doc.fillColor(C.muted).font('Helvetica').fontSize(10)
       .text(label + ':', MARGIN, y, { width: 120 });
    doc.fillColor(C.text).font('Helvetica-Bold').fontSize(10)
       .text(value, MARGIN + 125, y, { width: CONTENT_W - 125 });
    y += 16;
  }

  y += 10;
  doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor(C.border).lineWidth(0.5).stroke();
  y += 16;
  return y;
}

// ── SECTION: Match timeline ───────────────────────────────────────────────────

function drawTimeline(doc, umpires, events, y) {
  doc.fillColor(C.brand).font('Helvetica-Bold').fontSize(13).text('Match Timeline', MARGIN, y);
  y += 18;

  if (events.length === 0) {
    doc.fillColor(C.muted).font('Helvetica').fontSize(10).text('No events recorded.', MARGIN, y);
    return y + 20;
  }

  const LABEL_W   = 72;
  const TRACK_H   = 20;
  const TRACK_GAP = 10;
  const TRACK_X   = MARGIN + LABEL_W;
  const TRACK_W   = PAGE_W - MARGIN - TRACK_X - (MARGIN / 2);

  const maxSecs = Math.max(...events.map(e => elapsedToSecs(e.timestamp_elapsed)), 60);

  for (const [idx, umpire] of umpires.entries()) {
    const color     = UMPIRE_COLOR[idx] || C.brand;
    const umpireEvs = events.filter(e => e.umpire === umpire);
    const trackY    = y + idx * (TRACK_H + TRACK_GAP);

    doc.fillColor(color).font('Helvetica-Bold').fontSize(9)
       .text(umpire, MARGIN, trackY + 6, { width: LABEL_W - 6, lineBreak: false });

    doc.roundedRect(TRACK_X, trackY, TRACK_W, TRACK_H, 4).fillColor('#e4eaf8').fill();

    for (const ev of umpireEvs) {
      const secs = elapsedToSecs(ev.timestamp_elapsed);
      const x    = TRACK_X + (secs / maxSecs) * TRACK_W;
      doc.circle(x, trackY + TRACK_H / 2, 4).fillColor(color).fill();
    }
  }

  const axisY = y + umpires.length * (TRACK_H + TRACK_GAP) + 2;
  for (let i = 0; i <= 5; i++) {
    const x    = TRACK_X + (i / 5) * TRACK_W;
    const secs = Math.round((i / 5) * maxSecs);
    doc.moveTo(x, axisY).lineTo(x, axisY + 4).strokeColor(C.muted).lineWidth(0.5).stroke();
    doc.fillColor(C.muted).font('Helvetica').fontSize(7)
       .text(secsToHMS(secs), x - 18, axisY + 5, { width: 36, align: 'center' });
  }

  y = axisY + 22;
  doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor(C.border).lineWidth(0.5).stroke();
  y += 16;
  return y;
}

// ── SECTION: Summary (two columns) ───────────────────────────────────────────

function drawSummary(doc, umpires, events, allTags, y) {
  doc.fillColor(C.brand).font('Helvetica-Bold').fontSize(13).text('Summary', MARGIN, y);
  y += 20;

  const COL_GAP = 16;
  const COL_W   = (CONTENT_W - COL_GAP) / 2;
  const COUNT_W = 16;
  const BAR_MAX = 80;
  const TAG_W   = COL_W - BAR_MAX - COUNT_W - 16;

  const maxCount = Math.max(
    ...umpires.flatMap(u => allTags.map(t => events.filter(e => e.umpire === u && e.tag === t).length)),
    1
  );

  const startY  = y;
  let   colMaxY = y;

  for (const [idx, umpire] of umpires.entries()) {
    const color     = UMPIRE_COLOR[idx] || C.brand;
    const colX      = MARGIN + idx * (COL_W + COL_GAP);
    let   colY      = startY;

    const umpireEvs = events.filter(e => e.umpire === umpire);
    const tagCounts = countBy(umpireEvs, 'tag');
    const total     = umpireEvs.length;

    doc.rect(colX, colY, COL_W, 24).fillColor(color).fill();
    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(11)
       .text(umpire, colX + 8, colY + 6, { width: COL_W - 70, lineBreak: false });
    doc.fillColor(C.white).font('Helvetica').fontSize(9)
       .text(`${total} event${total !== 1 ? 's' : ''}`, colX + COL_W - 62, colY + 8, { width: 54, align: 'right' });
    colY += 30;

    if (Object.keys(tagCounts).length === 0) {
      doc.fillColor(C.muted).font('Helvetica').fontSize(9).text('No events', colX + 4, colY);
      colY += 14;
    } else {
      for (const tag of allTags) {
        const count = tagCounts[tag] || 0;
        if (count === 0) continue;

        const rowBg = (colY % 32 < 16) ? '#f8f9ff' : C.rowOdd;
        doc.rect(colX, colY, COL_W, 15).fillColor(rowBg).fill();

        doc.fillColor(C.text).font('Helvetica').fontSize(9)
           .text(tag, colX + 4, colY + 2, { width: TAG_W, lineBreak: false });

        const barW = Math.max(3, Math.round((count / maxCount) * BAR_MAX));
        doc.rect(colX + TAG_W + 8, colY + 4, barW, 7).fillColor(color).fill();

        doc.fillColor(color).font('Helvetica-Bold').fontSize(9)
           .text(String(count), colX + COL_W - COUNT_W - 2, colY + 2, { width: COUNT_W, align: 'right' });

        colY += 15;
      }
    }

    colMaxY = Math.max(colMaxY, colY);
  }

  y = colMaxY + 10;
  doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor(C.border).lineWidth(0.5).stroke();
  y += 16;
  return y;
}

// ── SECTION: Event table ──────────────────────────────────────────────────────

function drawEventTable(doc, umpires, events, y) {
  doc.fillColor(C.brand).font('Helvetica-Bold').fontSize(13).text('All Events', MARGIN, y);
  y += 20;

  const cols = { num: 30, time: 68, live: 68, umpire: 110, tag: 105, notes: 114 };
  const ROW_H    = 16;
  const HEADER_H = 18;

  function tableHeader(yPos) {
    doc.rect(MARGIN, yPos, CONTENT_W, HEADER_H).fillColor(C.headerBg).fill();
    let x = MARGIN + 4;
    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(9);
    doc.text('#',         x, yPos + 4, { width: cols.num    - 4 }); x += cols.num;
    doc.text('Rec. Time', x, yPos + 4, { width: cols.time   - 4 }); x += cols.time;
    doc.text('Live Time', x, yPos + 4, { width: cols.live   - 4 }); x += cols.live;
    doc.text('Umpire',    x, yPos + 4, { width: cols.umpire - 4 }); x += cols.umpire;
    doc.text('Tag',       x, yPos + 4, { width: cols.tag    - 4 }); x += cols.tag;
    doc.text('Notes',     x, yPos + 4, { width: cols.notes  - 4 });
    return yPos + HEADER_H;
  }

  y = tableHeader(y);

  for (let i = 0; i < events.length; i++) {
    if (y + ROW_H > doc.page.height - 50) {
      doc.addPage();
      y = MARGIN;
      y = tableHeader(y);
    }

    const ev          = events[i];
    const umpireColor = UMPIRE_COLOR[umpires.indexOf(ev.umpire)] || C.brand;
    doc.rect(MARGIN, y, CONTENT_W, ROW_H).fillColor(i % 2 === 0 ? C.rowEven : C.rowOdd).fill();

    let x = MARGIN + 4;
    doc.fillColor(C.muted).font('Helvetica').fontSize(8)
       .text(String(i + 1), x, y + 4, { width: cols.num - 4 }); x += cols.num;
    doc.fillColor(C.text).font('Helvetica-Bold').fontSize(8)
       .text(ev.timestamp_elapsed      || '—', x, y + 4, { width: cols.time   - 4 }); x += cols.time;
    doc.fillColor(C.muted).font('Helvetica').fontSize(8)
       .text(ev.timestamp_elapsed_live || '—', x, y + 4, { width: cols.live   - 4 }); x += cols.live;
    doc.fillColor(umpireColor).font('Helvetica-Bold').fontSize(8)
       .text(ev.umpire  || '—', x, y + 4, { width: cols.umpire - 4 }); x += cols.umpire;
    doc.fillColor(C.text).font('Helvetica-Bold').fontSize(8)
       .text(ev.tag     || '—', x, y + 4, { width: cols.tag    - 4 }); x += cols.tag;
    doc.fillColor(C.muted).font('Helvetica').fontSize(8)
       .text(ev.notes   || '',  x, y + 4, { width: cols.notes  - 4 });
    y += ROW_H;
  }

  return y;
}

// ── SECTION: Footer ───────────────────────────────────────────────────────────

function drawFooter(doc, events) {
  const fy = doc.page.height - 36;
  doc.moveTo(MARGIN, fy - 4).lineTo(PAGE_W - MARGIN, fy - 4)
     .strokeColor(C.border).lineWidth(0.5).stroke();
  doc.fillColor(C.muted).font('Helvetica').fontSize(8)
     .text(
       `Umpire Coder  ·  ${new Date().toISOString().slice(0, 10)}  ·  ${events.length} event(s)`,
       MARGIN, fy, { width: CONTENT_W, align: 'center' }
     );
}

// ── Compose ───────────────────────────────────────────────────────────────────

function writePDF(doc, meta, events) {
  // Support new officials array and old umpire1/umpire2 format
  const officials = meta.officials
    ? meta.officials.filter(o => o.name)
    : [meta.umpire1, meta.umpire2].filter(Boolean).map((name, i) => ({ role: `Umpire ${i + 1}`, name }));

  const officialNames = officials.map(o => o.name);
  const allTags = [...new Set(events.map(e => e.tag).filter(Boolean))].sort();

  drawHeader(doc, meta);

  let y = 110;
  y = drawMatchDetails(doc, meta, events, officials, y);
  y = drawTimeline(doc, officialNames, events, y);
  y = drawSummary(doc, officialNames, events, allTags, y);
  drawEventTable(doc, officialNames, events, y);
  drawFooter(doc, events);
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const { jsonPath, outDir } = parseArgs();

  if (!existsSync(jsonPath)) {
    console.error(`JSON not found: ${jsonPath}`);
    process.exit(1);
  }

  const raw    = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const meta   = raw.match  || {};
  const events = raw.events || [];

  const baseDir = outDir ? resolve(outDir) : join(resolve(jsonPath, '..'), matchSlug(meta));
  mkdirSync(baseDir, { recursive: true });

  const pdfPath = join(baseDir, reportFilename(meta));
  const doc     = new PDFDocument({ autoFirstPage: true, size: 'A4', margin: MARGIN });
  const stream  = createWriteStream(pdfPath);

  doc.pipe(stream);
  writePDF(doc, meta, events);
  doc.end();

  stream.on('finish', () => console.log(`Report written → ${pdfPath}`));
  stream.on('error',  err => { console.error('Failed to write PDF:', err.message); process.exit(1); });
}

main();
