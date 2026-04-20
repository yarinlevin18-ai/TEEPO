/**
 * Convert TEEPO_SPEC.md → TEEPO_SPEC.docx with full RTL Hebrew support.
 * Preserves H1/H2/H3, bullet + numbered lists, tables, bold, inline code.
 */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  LevelFormat, PageOrientation, PageBreak,
} = require('docx');

const INPUT  = path.join(__dirname, 'TEEPO_SPEC.md');
const OUTPUT = path.join(__dirname, 'TEEPO_SPEC.docx');

const raw = fs.readFileSync(INPUT, 'utf8');
const lines = raw.split(/\r?\n/);

/* ---------------- inline formatting → TextRun[] ---------------- */
// Supports **bold**, `code`, and plain text. Every run is RTL.
function inlineRuns(text, baseOpts = {}) {
  const runs = [];
  // Tokenize: match **...**, `...`, or run of other chars
  const re = /(\*\*[^*]+\*\*)|(`[^`]+`)|([^*`]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) {
      runs.push(new TextRun({
        text: m[1].slice(2, -2),
        bold: true,
        rightToLeft: true,
        font: 'Arial',
        ...baseOpts,
      }));
    } else if (m[2]) {
      runs.push(new TextRun({
        text: m[2].slice(1, -1),
        font: 'Consolas',
        rightToLeft: true,
        ...baseOpts,
      }));
    } else if (m[3]) {
      runs.push(new TextRun({
        text: m[3],
        rightToLeft: true,
        font: 'Arial',
        ...baseOpts,
      }));
    }
  }
  if (runs.length === 0) {
    runs.push(new TextRun({ text, rightToLeft: true, font: 'Arial', ...baseOpts }));
  }
  return runs;
}

/* ---------------- helpers ---------------- */
function rtlPara(children, opts = {}) {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    ...opts,
    children,
  });
}

function heading(text, level) {
  const sizes = { 1: 40, 2: 32, 3: 28 };
  const headingLevels = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
  };
  return new Paragraph({
    heading: headingLevels[level],
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    spacing: { before: level === 1 ? 360 : 240, after: 160 },
    children: [new TextRun({
      text,
      bold: true,
      size: sizes[level],
      rightToLeft: true,
      font: 'Arial',
    })],
  });
}

function bulletPara(text) {
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    children: inlineRuns(text),
  });
}

function numberedPara(text) {
  return new Paragraph({
    numbering: { reference: 'numbers', level: 0 },
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    children: inlineRuns(text),
  });
}

function hr() {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999', space: 1 },
    },
    spacing: { before: 120, after: 240 },
    children: [new TextRun({ text: '', rightToLeft: true })],
  });
}

function codeBlockParas(codeLines) {
  // Render each code line as its own paragraph in a shaded monospace block.
  return codeLines.map((ln, idx) => new Paragraph({
    bidirectional: false,
    alignment: AlignmentType.LEFT,
    shading: { type: ShadingType.CLEAR, fill: 'F2F2F2' },
    spacing: { before: idx === 0 ? 120 : 0, after: idx === codeLines.length - 1 ? 120 : 0 },
    children: [new TextRun({
      text: ln || ' ',
      font: 'Consolas',
      size: 20,
    })],
  }));
}

/* ---------------- table builder ----------------
   We treat the first row as header. Hebrew RTL tables in Word: with
   `bidirectional: true` on paragraphs + `visuallyRightToLeft: true` on the
   table, Word presents the first logical column on the right (expected
   behavior for a Hebrew reader).                                            */
const CONTENT_WIDTH_DXA = 9360; // US Letter w/ 1-inch margins

function buildTable(headerCells, bodyRows) {
  const colCount = headerCells.length;
  const colWidth = Math.floor(CONTENT_WIDTH_DXA / colCount);
  const columnWidths = Array(colCount).fill(colWidth);
  // Fix rounding to sum exactly
  columnWidths[columnWidths.length - 1] = CONTENT_WIDTH_DXA - colWidth * (colCount - 1);

  const border = { style: BorderStyle.SINGLE, size: 6, color: 'BFBFBF' };
  const borders = { top: border, bottom: border, left: border, right: border };

  const makeCell = (text, opts = {}) => new TableCell({
    borders,
    width: { size: columnWidths[opts.colIdx] || colWidth, type: WidthType.DXA },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    shading: opts.header ? { type: ShadingType.CLEAR, fill: 'E8EAF6' } : undefined,
    children: [new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.RIGHT,
      children: inlineRuns(text, opts.header ? { bold: true } : {}),
    })],
  });

  const headerRow = new TableRow({
    tableHeader: true,
    children: headerCells.map((t, i) => makeCell(t, { header: true, colIdx: i })),
  });
  const rows = [headerRow, ...bodyRows.map(r => new TableRow({
    children: r.map((t, i) => makeCell(t, { colIdx: i })),
  }))];

  return new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    columnWidths,
    visuallyRightToLeft: true,
    rows,
  });
}

/* ---------------- parser ---------------- */
const children = [];
let i = 0;
const paraBuffer = [];

function flushParaBuffer() {
  if (paraBuffer.length === 0) return;
  const text = paraBuffer.join(' ').trim();
  paraBuffer.length = 0;
  if (!text) return;
  children.push(rtlPara(inlineRuns(text), { spacing: { after: 120 } }));
}

function isTableSeparator(line) {
  return /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(line);
}

function splitTableRow(line) {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map(c => c.trim());
}

while (i < lines.length) {
  const line = lines[i];

  // Blank line → paragraph break
  if (/^\s*$/.test(line)) {
    flushParaBuffer();
    i++; continue;
  }

  // Heading
  const hMatch = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
  if (hMatch) {
    flushParaBuffer();
    const level = Math.min(hMatch[1].length, 3);
    children.push(heading(hMatch[2], level));
    i++; continue;
  }

  // Horizontal rule
  if (/^---+\s*$/.test(line)) {
    flushParaBuffer();
    children.push(hr());
    i++; continue;
  }

  // Code fence
  if (/^```/.test(line)) {
    flushParaBuffer();
    i++;
    const codeLines = [];
    while (i < lines.length && !/^```/.test(lines[i])) {
      codeLines.push(lines[i]);
      i++;
    }
    if (i < lines.length) i++; // skip closing fence
    codeBlockParas(codeLines).forEach(p => children.push(p));
    continue;
  }

  // Table: header line followed by separator
  if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
    flushParaBuffer();
    const header = splitTableRow(line);
    i += 2; // skip header + separator
    const body = [];
    while (i < lines.length && lines[i].includes('|') && !/^\s*$/.test(lines[i])) {
      body.push(splitTableRow(lines[i]));
      i++;
    }
    // Normalize body rows to header column count
    const normalized = body.map(r => {
      if (r.length < header.length) return [...r, ...Array(header.length - r.length).fill('')];
      if (r.length > header.length) return r.slice(0, header.length);
      return r;
    });
    children.push(buildTable(header, normalized));
    // Add a small spacer after table
    children.push(rtlPara([new TextRun({ text: '', rightToLeft: true })], { spacing: { after: 80 } }));
    continue;
  }

  // Bullet list item
  const bMatch = /^\s*[-*•]\s+(.+)$/.exec(line);
  if (bMatch) {
    flushParaBuffer();
    children.push(bulletPara(bMatch[1]));
    i++; continue;
  }

  // Numbered list item
  const nMatch = /^\s*\d+[.)]\s+(.+)$/.exec(line);
  if (nMatch) {
    flushParaBuffer();
    children.push(numberedPara(nMatch[1]));
    i++; continue;
  }

  // Regular paragraph line (may wrap across multiple lines)
  paraBuffer.push(line.trim());
  i++;
}
flushParaBuffer();

/* ---------------- build document ---------------- */
const doc = new Document({
  creator: 'TEEPO',
  title: 'TEEPO — מסמך אפיון מוצר',
  styles: {
    default: {
      document: {
        run: { font: 'Arial', size: 24, rightToLeft: true },
        paragraph: {
          bidirectional: true,
          alignment: AlignmentType.RIGHT,
        },
      },
    },
    paragraphStyles: [
      {
        id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal',
        quickFormat: true,
        run: { size: 40, bold: true, font: 'Arial', rightToLeft: true },
        paragraph: {
          bidirectional: true, alignment: AlignmentType.RIGHT,
          spacing: { before: 360, after: 200 },
          outlineLevel: 0,
        },
      },
      {
        id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal',
        quickFormat: true,
        run: { size: 32, bold: true, font: 'Arial', rightToLeft: true },
        paragraph: {
          bidirectional: true, alignment: AlignmentType.RIGHT,
          spacing: { before: 280, after: 160 },
          outlineLevel: 1,
        },
      },
      {
        id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal',
        quickFormat: true,
        run: { size: 28, bold: true, font: 'Arial', rightToLeft: true },
        paragraph: {
          bidirectional: true, alignment: AlignmentType.RIGHT,
          spacing: { before: 220, after: 140 },
          outlineLevel: 2,
        },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: '•',
          alignment: AlignmentType.RIGHT,
          style: { paragraph: { indent: { right: 720, hanging: 360 } } },
        }],
      },
      {
        reference: 'numbers',
        levels: [{
          level: 0, format: LevelFormat.DECIMAL, text: '%1.',
          alignment: AlignmentType.RIGHT,
          style: { paragraph: { indent: { right: 720, hanging: 360 } } },
        }],
      },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },            // US Letter
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
      bidi: true, // RTL section
    },
    children,
  }],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(OUTPUT, buf);
  console.log(`Wrote ${OUTPUT} (${buf.length} bytes, ${children.length} block elements)`);
}).catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
