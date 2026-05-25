/**
 * Converts TEEPO_SPEC.md → TEEPO_SPEC.docx with Hebrew RTL formatting.
 * Parses: H1/H2/H3 headings, tables, bullet/numbered lists, code blocks,
 * horizontal rules, bold inline, and paragraphs.
 */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  LevelFormat, PageOrientation,
} = require('docx');

const MD_PATH = path.join(__dirname, 'TEEPO_SPEC.md');
const OUT_PATH = path.join(__dirname, 'TEEPO_SPEC.docx');

const md = fs.readFileSync(MD_PATH, 'utf8');
const lines = md.split(/\r?\n/);

// ---------- Inline parser: **bold** → TextRun[] with RTL ----------
function parseInline(text, baseOpts = {}) {
  const runs = [];
  const re = /\*\*([^*]+)\*\*/g;
  let lastIdx = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) {
      runs.push(new TextRun({
        text: text.slice(lastIdx, m.index),
        rightToLeft: true,
        font: 'Arial',
        ...baseOpts,
      }));
    }
    runs.push(new TextRun({
      text: m[1],
      bold: true,
      rightToLeft: true,
      font: 'Arial',
      ...baseOpts,
    }));
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) {
    runs.push(new TextRun({
      text: text.slice(lastIdx),
      rightToLeft: true,
      font: 'Arial',
      ...baseOpts,
    }));
  }
  if (runs.length === 0) {
    runs.push(new TextRun({ text: '', rightToLeft: true, font: 'Arial', ...baseOpts }));
  }
  return runs;
}

// ---------- Block-level parser ----------
const children = [];
let i = 0;

function flushParagraph(textLines, heading) {
  const text = textLines.join(' ').trim();
  if (!text) return;
  children.push(new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    heading,
    spacing: { after: 120 },
    children: parseInline(text),
  }));
}

function makeHeading(level, text) {
  const map = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3 };
  const sizes = { 1: 40, 2: 32, 3: 26 };
  children.push(new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    heading: map[level] || HeadingLevel.HEADING_3,
    spacing: { before: 280, after: 160 },
    children: parseInline(text, { bold: true, size: sizes[level] || 24 }),
  }));
}

function isTableSep(line) {
  // e.g. |---|---| or | :---: | ---: |
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function splitTableRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map(c => c.trim());
}

function parseTable(startIdx) {
  // Expect: header | sep | body rows...
  const header = splitTableRow(lines[startIdx]);
  const cols = header.length;
  let j = startIdx + 1;
  if (j >= lines.length || !isTableSep(lines[j])) return null;
  j++;
  const body = [];
  while (j < lines.length && /\|/.test(lines[j]) && lines[j].trim() !== '') {
    const row = splitTableRow(lines[j]);
    while (row.length < cols) row.push('');
    body.push(row.slice(0, cols));
    j++;
  }

  const tableWidth = 9360; // US Letter, 1" margins
  const colWidth = Math.floor(tableWidth / cols);
  const columnWidths = Array(cols).fill(colWidth);
  // adjust last col to sum exactly
  columnWidths[cols - 1] = tableWidth - colWidth * (cols - 1);

  const border = { style: BorderStyle.SINGLE, size: 4, color: '999999' };
  const borders = { top: border, bottom: border, left: border, right: border };

  const mkCell = (text, isHeader) => new TableCell({
    borders,
    width: { size: colWidth, type: WidthType.DXA },
    shading: isHeader ? { fill: 'D5E8F0', type: ShadingType.CLEAR, color: 'auto' } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.RIGHT,
      children: parseInline(text, isHeader ? { bold: true } : {}),
    })],
  });

  const rows = [
    new TableRow({ tableHeader: true, children: header.map(c => mkCell(c, true)) }),
    ...body.map(r => new TableRow({ children: r.map(c => mkCell(c, false)) })),
  ];

  const tbl = new Table({
    width: { size: tableWidth, type: WidthType.DXA },
    columnWidths,
    visuallyRightToLeft: true,
    rows,
  });

  children.push(tbl);
  // A trailing empty paragraph keeps Word happy after a table.
  children.push(new Paragraph({ bidirectional: true, children: [new TextRun({ text: '', rightToLeft: true })] }));
  return j;
}

// Main loop
let paragraphBuffer = [];
let inCodeBlock = false;
let codeBuffer = [];

function flushCode() {
  if (codeBuffer.length === 0) return;
  for (const line of codeBuffer) {
    children.push(new Paragraph({
      bidirectional: false,
      alignment: AlignmentType.LEFT,
      spacing: { after: 40 },
      shading: { fill: 'F2F2F2', type: ShadingType.CLEAR, color: 'auto' },
      children: [new TextRun({ text: line || ' ', font: 'Consolas', size: 20 })],
    }));
  }
  codeBuffer = [];
}

function flushPara() {
  if (paragraphBuffer.length === 0) return;
  flushParagraph(paragraphBuffer);
  paragraphBuffer = [];
}

while (i < lines.length) {
  const line = lines[i];

  // Code fences
  if (/^\s*```/.test(line)) {
    if (inCodeBlock) {
      flushCode();
      inCodeBlock = false;
    } else {
      flushPara();
      inCodeBlock = true;
    }
    i++;
    continue;
  }
  if (inCodeBlock) {
    codeBuffer.push(line);
    i++;
    continue;
  }

  // Blank line → paragraph boundary
  if (line.trim() === '') {
    flushPara();
    i++;
    continue;
  }

  // Horizontal rule
  if (/^---+\s*$/.test(line.trim())) {
    flushPara();
    children.push(new Paragraph({
      bidirectional: true,
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '2E75B6', space: 1 } },
      spacing: { before: 120, after: 120 },
      children: [new TextRun({ text: '', rightToLeft: true })],
    }));
    i++;
    continue;
  }

  // Heading
  const h = line.match(/^(#{1,6})\s+(.*)$/);
  if (h) {
    flushPara();
    makeHeading(Math.min(h[1].length, 3), h[2].trim());
    i++;
    continue;
  }

  // Table
  if (/^\s*\|/.test(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
    flushPara();
    const nextIdx = parseTable(i);
    if (nextIdx) { i = nextIdx; continue; }
  }

  // Bullet list
  const bullet = line.match(/^\s*[-*]\s+(.*)$/);
  if (bullet) {
    flushPara();
    children.push(new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.RIGHT,
      numbering: { reference: 'bullets', level: 0 },
      children: parseInline(bullet[1]),
    }));
    i++;
    continue;
  }

  // Numbered list
  const numbered = line.match(/^\s*\d+\.\s+(.*)$/);
  if (numbered) {
    flushPara();
    children.push(new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.RIGHT,
      numbering: { reference: 'numbers', level: 0 },
      children: parseInline(numbered[1]),
    }));
    i++;
    continue;
  }

  // Default: part of a paragraph
  paragraphBuffer.push(line.trim());
  i++;
}
flushPara();
if (inCodeBlock) flushCode();

// ---------- Document assembly ----------
const doc = new Document({
  creator: 'TEEPO',
  title: 'TEEPO Product Spec',
  styles: {
    default: { document: { run: { font: 'Arial', size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 40, bold: true, font: 'Arial', color: '1F3864' },
        paragraph: { spacing: { before: 320, after: 200 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 32, bold: true, font: 'Arial', color: '2E75B6' },
        paragraph: { spacing: { before: 260, after: 160 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, font: 'Arial', color: '365F91' },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bullets',
        levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.RIGHT,
          style: { paragraph: { indent: { start: 720, hanging: 360 } } } }] },
      { reference: 'numbers',
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.RIGHT,
          style: { paragraph: { indent: { start: 720, hanging: 360 } } } }] },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 }, // US Letter
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    children,
  }],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(OUT_PATH, buf);
  console.log(`Wrote ${OUT_PATH} (${buf.length} bytes, ${children.length} blocks)`);
}).catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
