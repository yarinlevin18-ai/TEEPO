// Convert TEEPO_SPEC.md to DOCX with RTL Hebrew formatting.
// Usage: node scripts/md-to-docx.js <input.md> <output.docx>

const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  AlignmentType, LevelFormat, PageBreak,
} = require('docx');

// ─────────────────────────────────────────────────────────────
// Inline parser: **bold**, *italic*, `code`
// Returns array of TextRun-options objects { text, bold?, italics?, code? }
// ─────────────────────────────────────────────────────────────
function parseInline(text) {
  const out = [];
  let i = 0;
  let buf = '';
  const flush = (extra = {}) => {
    if (buf) out.push({ text: buf, ...extra });
    buf = '';
  };
  while (i < text.length) {
    const two = text.slice(i, i + 2);
    const one = text[i];
    if (two === '**') {
      flush();
      const end = text.indexOf('**', i + 2);
      if (end === -1) { buf += '**'; i += 2; continue; }
      out.push({ text: text.slice(i + 2, end), bold: true });
      i = end + 2;
      continue;
    }
    if (one === '`') {
      flush();
      const end = text.indexOf('`', i + 1);
      if (end === -1) { buf += '`'; i += 1; continue; }
      out.push({ text: text.slice(i + 1, end), code: true });
      i = end + 1;
      continue;
    }
    if (one === '*' && text[i + 1] && text[i + 1] !== ' ' && text[i + 1] !== '*') {
      flush();
      const end = text.indexOf('*', i + 1);
      if (end === -1) { buf += '*'; i += 1; continue; }
      out.push({ text: text.slice(i + 1, end), italics: true });
      i = end + 1;
      continue;
    }
    buf += one;
    i += 1;
  }
  flush();
  return out.length ? out : [{ text: '' }];
}

function runsFromInline(text, baseOpts = {}) {
  return parseInline(text).map((r) => {
    const opts = {
      text: r.text,
      rightToLeft: true,
      font: r.code ? 'Consolas' : (baseOpts.font || 'David'),
      size: baseOpts.size || 22,
      ...baseOpts,
    };
    if (r.bold) opts.bold = true;
    if (r.italics) opts.italics = true;
    if (r.code) { opts.font = 'Consolas'; opts.size = 20; }
    return new TextRun(opts);
  });
}

// ─────────────────────────────────────────────────────────────
// Block parser: lines → blocks
// Block types: heading, paragraph, ul, ol, table, code, hr, blank
// ─────────────────────────────────────────────────────────────
function parseBlocks(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Code fence
    if (/^```/.test(line)) {
      const lang = line.replace(/^```/, '').trim();
      const body = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1; // skip closing fence
      blocks.push({ type: 'code', lang, text: body.join('\n') });
      continue;
    }

    // Horizontal rule
    if (/^---+\s*$/.test(line)) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    // Headings
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      blocks.push({ type: 'heading', level: h[1].length, text: h[2].trim() });
      i += 1;
      continue;
    }

    // Table
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const rows = [];
      const header = splitTableRow(line);
      rows.push(header);
      i += 2; // skip header + separator
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        rows.push(splitTableRow(lines[i]));
        i += 1;
      }
      blocks.push({ type: 'table', rows });
      continue;
    }

    // Blank
    if (/^\s*$/.test(line)) {
      blocks.push({ type: 'blank' });
      i += 1;
      continue;
    }

    // Unordered list (- or *)
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i += 1;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    // Ordered list (1. , 2. , …)
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    // Paragraph — accumulate until blank / structural line
    const para = [line];
    i += 1;
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^#{1,6}\s+/.test(lines[i]) &&
      !/^---+\s*$/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^\s*\|/.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: 'paragraph', text: para.join(' ') });
  }
  return blocks;
}

function splitTableRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

// ─────────────────────────────────────────────────────────────
// Blocks → docx elements
// ─────────────────────────────────────────────────────────────
const HEADING_MAP = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

function makeParagraph(runs, opts = {}) {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    spacing: { after: 120, line: 360 },
    ...opts,
    children: runs,
  });
}

function blocksToElements(blocks) {
  const out = [];
  for (const b of blocks) {
    if (b.type === 'blank') continue;

    if (b.type === 'hr') {
      out.push(new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.CENTER,
        border: { bottom: { color: '999999', space: 1, style: BorderStyle.SINGLE, size: 6 } },
        spacing: { before: 120, after: 120 },
        children: [new TextRun({ text: '' })],
      }));
      continue;
    }

    if (b.type === 'heading') {
      const sizes = { 1: 40, 2: 32, 3: 26, 4: 24, 5: 22, 6: 22 };
      const size = sizes[b.level] || 22;
      out.push(makeParagraph(
        runsFromInline(b.text, { size, bold: true }),
        {
          heading: HEADING_MAP[b.level],
          spacing: { before: b.level === 1 ? 360 : 240, after: 120 },
        },
      ));
      continue;
    }

    if (b.type === 'paragraph') {
      out.push(makeParagraph(runsFromInline(b.text)));
      continue;
    }

    if (b.type === 'ul') {
      for (const item of b.items) {
        out.push(makeParagraph(runsFromInline(item), {
          numbering: { reference: 'bullets', level: 0 },
        }));
      }
      continue;
    }

    if (b.type === 'ol') {
      for (const item of b.items) {
        out.push(makeParagraph(runsFromInline(item), {
          numbering: { reference: 'numbers', level: 0 },
        }));
      }
      continue;
    }

    if (b.type === 'code') {
      const codeLines = b.text.split('\n');
      for (const cl of codeLines) {
        out.push(new Paragraph({
          bidirectional: false,
          alignment: AlignmentType.LEFT,
          spacing: { after: 40, line: 260 },
          shading: { type: ShadingType.CLEAR, fill: 'F3F4F6' },
          children: [new TextRun({ text: cl || ' ', font: 'Consolas', size: 20 })],
        }));
      }
      // small spacer
      out.push(new Paragraph({ children: [new TextRun({ text: '' })], spacing: { after: 80 } }));
      continue;
    }

    if (b.type === 'table') {
      out.push(buildTable(b.rows));
      // spacer after table
      out.push(new Paragraph({ children: [new TextRun({ text: '' })], spacing: { after: 120 } }));
      continue;
    }
  }
  return out;
}

function buildTable(rows) {
  const colCount = Math.max(...rows.map((r) => r.length));
  const tableWidth = 9360; // 6.5 inches DXA
  const colWidth = Math.floor(tableWidth / colCount);
  const columnWidths = new Array(colCount).fill(colWidth);

  const border = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' };
  const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };

  const tableRows = rows.map((cells, rowIdx) => {
    const isHeader = rowIdx === 0;
    const paddedCells = [...cells];
    while (paddedCells.length < colCount) paddedCells.push('');

    return new TableRow({
      tableHeader: isHeader,
      children: paddedCells.map((cellText) => new TableCell({
        width: { size: colWidth, type: WidthType.DXA },
        shading: isHeader ? { type: ShadingType.CLEAR, fill: 'EDEBFB' } : undefined,
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [makeParagraph(
          runsFromInline(cellText, isHeader ? { bold: true, size: 22 } : { size: 22 }),
          { spacing: { after: 0, line: 300 } },
        )],
      })),
    });
  });

  return new Table({
    width: { size: tableWidth, type: WidthType.DXA },
    columnWidths,
    visuallyRightToLeft: true,
    borders,
    rows: tableRows,
  });
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────
const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error('Usage: node md-to-docx.js <input.md> <output.docx>');
  process.exit(1);
}

const md = fs.readFileSync(inPath, 'utf8');
const blocks = parseBlocks(md);
const elements = blocksToElements(blocks);

const doc = new Document({
  creator: 'TEEPO',
  title: 'TEEPO — מסמך אפיון מוצר',
  description: 'TEEPO product spec (Hebrew, RTL)',
  styles: {
    default: {
      document: { run: { font: 'David', size: 22 } },
    },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 40, bold: true, font: 'David', color: '2E1A6B' },
        paragraph: { spacing: { before: 360, after: 180 }, outlineLevel: 0, alignment: AlignmentType.RIGHT, bidirectional: true } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 32, bold: true, font: 'David', color: '4C3DB8' },
        paragraph: { spacing: { before: 280, after: 140 }, outlineLevel: 1, alignment: AlignmentType.RIGHT, bidirectional: true } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, font: 'David', color: '6B5BE5' },
        paragraph: { spacing: { before: 220, after: 120 }, outlineLevel: 2, alignment: AlignmentType.RIGHT, bidirectional: true } },
      { id: 'Heading4', name: 'Heading 4', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, font: 'David' },
        paragraph: { spacing: { before: 180, after: 100 }, outlineLevel: 3, alignment: AlignmentType.RIGHT, bidirectional: true } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bullets',
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.RIGHT,
            style: { paragraph: { indent: { start: 720, hanging: 360 }, bidirectional: true } } },
        ],
      },
      { reference: 'numbers',
        levels: [
          { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.RIGHT,
            style: { paragraph: { indent: { start: 720, hanging: 360 }, bidirectional: true } } },
        ],
      },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 }, // A4
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
      bidi: true,
    },
    children: elements,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outPath, buf);
  console.log(`OK: wrote ${outPath} (${buf.length} bytes, ${blocks.length} blocks, ${elements.length} elements)`);
}).catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
