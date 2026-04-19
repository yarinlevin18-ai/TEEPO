/**
 * Convert TEEPO_SPEC.md (Hebrew, RTL) to a DOCX.
 *
 * Handles: H1/H2/H3, paragraphs, bullet lists (- / *), numbered lists (1.),
 * tables (|...|), horizontal rules (---), inline **bold** and *italic* and
 * `code`. Everything is emitted RTL with right-aligned text.
 */

const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, LevelFormat, Table, TableRow, TableCell,
  WidthType, BorderStyle, ShadingType, PageOrientation,
} = require('docx');

const INPUT = 'C:\\dev\\smartdesk\\docs\\TEEPO_SPEC.md';
const OUTPUT = 'C:\\dev\\smartdesk\\docs\\TEEPO_SPEC.docx';

const FONT = 'David';

// ── Inline formatting ────────────────────────────────────────
function parseInline(text) {
  // Splits on **bold**, *italic*, `code` — preserves order.
  const runs = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      runs.push(new TextRun({ text: text.slice(last, m.index), font: FONT, rtl: true }));
    }
    const tok = m[0];
    if (tok.startsWith('**')) {
      runs.push(new TextRun({ text: tok.slice(2, -2), font: FONT, rtl: true, bold: true }));
    } else if (tok.startsWith('`')) {
      runs.push(new TextRun({ text: tok.slice(1, -1), font: 'Consolas', rtl: true }));
    } else if (tok.startsWith('*')) {
      runs.push(new TextRun({ text: tok.slice(1, -1), font: FONT, rtl: true, italics: true }));
    }
    last = m.index + tok.length;
  }
  if (last < text.length) {
    runs.push(new TextRun({ text: text.slice(last), font: FONT, rtl: true }));
  }
  return runs.length ? runs : [new TextRun({ text, font: FONT, rtl: true })];
}

// ── Paragraph factory (RTL + right aligned) ──────────────────
function p(text, opts = {}) {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    spacing: { after: 120 },
    ...opts,
    children: parseInline(text),
  });
}

function heading(text, level) {
  const sizeMap = { 1: 36, 2: 28, 3: 22 };
  const levelMap = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
  };
  return new Paragraph({
    heading: levelMap[level],
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    spacing: { before: 240, after: 160 },
    children: [new TextRun({ text, font: FONT, rtl: true, bold: true, size: sizeMap[level] })],
  });
}

function bullet(text) {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    numbering: { reference: 'bullets', level: 0 },
    spacing: { after: 80 },
    children: parseInline(text),
  });
}

function numbered(text) {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    numbering: { reference: 'numbers', level: 0 },
    spacing: { after: 80 },
    children: parseInline(text),
  });
}

function hr() {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999', space: 1 } },
    children: [new TextRun({ text: '' })],
  });
}

// ── Table from markdown ──────────────────────────────────────
function buildTable(rows) {
  // rows: array of arrays of cell strings. First row is header.
  // Table width = content width of A4 landscape-ish, use 9000 DXA.
  const TOTAL = 9000;
  const cols = rows[0].length;
  const colW = Math.floor(TOTAL / cols);
  const colWidths = new Array(cols).fill(colW);
  // Adjust last to fix rounding
  colWidths[cols - 1] = TOTAL - colW * (cols - 1);

  const border = { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' };
  const borders = { top: border, bottom: border, left: border, right: border };

  const trs = rows.map((cells, rIdx) => {
    const isHeader = rIdx === 0;
    return new TableRow({
      tableHeader: isHeader,
      children: cells.map((cellText, cIdx) => new TableCell({
        borders,
        width: { size: colWidths[cIdx], type: WidthType.DXA },
        shading: isHeader
          ? { fill: 'E8EEF7', type: ShadingType.CLEAR }
          : undefined,
        margins: { top: 80, bottom: 80, left: 100, right: 100 },
        children: [new Paragraph({
          bidirectional: true,
          alignment: AlignmentType.RIGHT,
          children: isHeader
            ? [new TextRun({ text: cellText.trim(), font: FONT, rtl: true, bold: true })]
            : parseInline(cellText.trim()),
        })],
      })),
    });
  });

  return new Table({
    width: { size: TOTAL, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: trs,
  });
}

// ── Markdown parser (line-based, minimal) ────────────────────
function parse(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let i = 0;
  const numberedListRe = /^(\s*)(\d+)\.\s+(.*)$/;
  const bulletRe = /^(\s*)[-*]\s+(.*)$/;
  const tableRowRe = /^\s*\|(.+)\|\s*$/;
  const tableSepRe = /^\s*\|?\s*:?-{2,}:?(\s*\|\s*:?-{2,}:?)+\s*\|?\s*$/;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (/^\s*$/.test(line)) { i++; continue; }

    // Horizontal rule
    if (/^\s*---+\s*$/.test(line) || /^\s*\*\*\*+\s*$/.test(line)) {
      out.push(hr()); i++; continue;
    }

    // Headings
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const lvl = Math.min(h[1].length, 3);
      out.push(heading(h[2].trim(), lvl));
      i++; continue;
    }

    // Table: header row + separator + body rows
    if (tableRowRe.test(line) && i + 1 < lines.length && tableSepRe.test(lines[i + 1])) {
      const rows = [];
      const parseRow = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
      rows.push(parseRow(line));
      i += 2; // skip header + separator
      while (i < lines.length && tableRowRe.test(lines[i])) {
        rows.push(parseRow(lines[i]));
        i++;
      }
      out.push(buildTable(rows));
      out.push(new Paragraph({ children: [new TextRun({ text: '' })] }));
      continue;
    }

    // Bullet list
    if (bulletRe.test(line)) {
      while (i < lines.length && bulletRe.test(lines[i])) {
        const m = lines[i].match(bulletRe);
        out.push(bullet(m[2].trim()));
        i++;
      }
      continue;
    }

    // Numbered list
    if (numberedListRe.test(line)) {
      while (i < lines.length && numberedListRe.test(lines[i])) {
        const m = lines[i].match(numberedListRe);
        out.push(numbered(m[3].trim()));
        i++;
      }
      continue;
    }

    // Paragraph — collect consecutive non-blank, non-special lines
    const buf = [line];
    i++;
    while (i < lines.length
      && !/^\s*$/.test(lines[i])
      && !/^#{1,6}\s/.test(lines[i])
      && !/^\s*---+\s*$/.test(lines[i])
      && !bulletRe.test(lines[i])
      && !numberedListRe.test(lines[i])
      && !tableRowRe.test(lines[i])
    ) {
      buf.push(lines[i]); i++;
    }
    out.push(p(buf.join(' ').trim()));
  }
  return out;
}

// ── Build document ───────────────────────────────────────────
const md = fs.readFileSync(INPUT, 'utf8');
const children = parse(md);

const doc = new Document({
  creator: 'TEEPO',
  title: 'TEEPO – מסמך אפיון מוצר',
  styles: {
    default: {
      document: { run: { font: FONT, size: 22 } }, // 11pt
    },
  },
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: '\u2022',
          alignment: AlignmentType.RIGHT,
          style: { paragraph: { indent: { start: 720, hanging: 360 } } },
        }],
      },
      {
        reference: 'numbers',
        levels: [{
          level: 0,
          format: LevelFormat.DECIMAL,
          text: '%1.',
          alignment: AlignmentType.RIGHT,
          style: { paragraph: { indent: { start: 720, hanging: 360 } } },
        }],
      },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 }, // A4
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
      // RTL page direction
      bidi: true,
    },
    children,
  }],
});

Packer.toBuffer(doc).then(buf => {
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, buf);
  console.log('Wrote', OUTPUT, '(' + buf.length + ' bytes,', children.length, 'blocks)');
});
