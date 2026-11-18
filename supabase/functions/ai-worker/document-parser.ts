import * as pdfjsModule from "npm:pdfjs-dist@4.10.38/legacy/build/pdf.mjs";
import * as mammothModule from "npm:mammoth@1.9.0";

export type ExtractedPage = {
  pageNumber: number | null;
  text: string;
};

export type ExtractedDocument = {
  mimeType: string;
  pages: ExtractedPage[];
  text: string;
  pageCount: number | null;
  parserVersion: string;
};

type PdfPage = {
  getTextContent(): Promise<{ items: Array<{ str?: string; transform?: number[] }> }>;
};

type PdfDocument = {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
  destroy(): Promise<void>;
};

type PdfJsApi = {
  getDocument(options: { data: Uint8Array; useSystemFonts?: boolean; isEvalSupported?: boolean }): {
    promise: Promise<PdfDocument>;
  };
};

type MammothApi = {
  extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: unknown[] }>;
};

const pdfjs = pdfjsModule as unknown as PdfJsApi;
const mammoth = mammothModule as unknown as MammothApi;

function normalizeExtractedText(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\u0000/g, "")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function guessMimeType(fileName: string, declaredMimeType = ""): string {
  if (declaredMimeType && declaredMimeType !== "application/octet-stream") {
    return declaredMimeType.toLowerCase();
  }
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".txt") || lower.endsWith(".md")) return "text/plain";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
  return "application/octet-stream";
}

function linesFromPdfItems(items: Array<{ str?: string; transform?: number[] }>): string {
  const positioned = items
    .filter((item) => typeof item.str === "string" && item.str.trim().length > 0)
    .map((item) => ({
      text: item.str!.trim(),
      y: Number(item.transform?.[5] ?? 0),
      x: Number(item.transform?.[4] ?? 0),
    }))
    .sort((a, b) => Math.abs(a.y - b.y) > 2 ? b.y - a.y : a.x - b.x);

  const rows: Array<{ y: number; items: Array<{ x: number; text: string }> }> = [];
  for (const item of positioned) {
    let row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= 2.5);
    if (!row) {
      row = { y: item.y, items: [] };
      rows.push(row);
    }
    row.items.push({ x: item.x, text: item.text });
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => row.items.sort((a, b) => a.x - b.x).map((item) => item.text).join(" "))
    .join("\n");
}

async function extractPdf(bytes: Uint8Array): Promise<ExtractedPage[]> {
  const document = await pdfjs.getDocument({
    data: bytes,
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;
  const pages: ExtractedPage[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push({
        pageNumber,
        text: normalizeExtractedText(linesFromPdfItems(content.items)),
      });
    }
  } finally {
    await document.destroy();
  }
  return pages;
}

function extractPlainText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export async function extractCurriculumDocument(
  fileName: string,
  declaredMimeType: string,
  bytes: Uint8Array,
): Promise<ExtractedDocument> {
  if (bytes.byteLength === 0) throw new Error("EMPTY_SOURCE_FILE");

  const mimeType = guessMimeType(fileName, declaredMimeType);
  let pages: ExtractedPage[];

  if (mimeType === "application/pdf") {
    pages = await extractPdf(bytes);
  } else if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    fileName.toLowerCase().endsWith(".docx")
  ) {
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    pages = [{ pageNumber: null, text: normalizeExtractedText(result.value) }];
  } else if (
    mimeType.startsWith("text/") ||
    ["application/json", "application/xml", "application/xhtml+xml"].includes(mimeType)
  ) {
    pages = [{ pageNumber: null, text: normalizeExtractedText(extractPlainText(bytes)) }];
  } else {
    throw new Error(`UNSUPPORTED_DOCUMENT_TYPE:${mimeType}`);
  }

  const text = pages.map((page) => page.text).filter(Boolean).join("\n\n");
  if (text.replace(/\s/g, "").length < 80) {
    throw new Error("NO_EXTRACTABLE_TEXT: The document may be scanned or image-only. OCR is not enabled.");
  }

  return {
    mimeType,
    pages,
    text,
    pageCount: mimeType === "application/pdf" ? pages.length : null,
    parserVersion: "myschool-document-parser/1.0.0",
  };
}

export type CurriculumChunk = {
  chunkIndex: number;
  pageStart: number | null;
  pageEnd: number | null;
  chapterTitle: string | null;
  sectionTitle: string | null;
  contentText: string;
  tokenCount: number;
};

function isHeading(line: string): boolean {
  const value = line.trim();
  if (value.length < 3 || value.length > 120) return false;
  return /^(الفصل|الوحدة|الدرس|الباب|الموضوع|Chapter|Unit|Lesson|Section)\b/i.test(value)
    || /^\d+(?:\.\d+){0,3}[.)]?\s+\S/.test(value);
}

export function chunkCurriculumPages(
  pages: ExtractedPage[],
  maxCharacters = 4200,
): CurriculumChunk[] {
  if (!Number.isInteger(maxCharacters) || maxCharacters < 500 || maxCharacters > 12_000) {
    throw new Error("maxCharacters must be between 500 and 12000");
  }

  const chunks: CurriculumChunk[] = [];
  let currentParts: string[] = [];
  let currentLength = 0;
  let currentPageStart: number | null = null;
  let currentPageEnd: number | null = null;
  let chapterTitle: string | null = null;
  let sectionTitle: string | null = null;

  const flush = () => {
    const contentText = normalizeExtractedText(currentParts.join("\n\n"));
    if (contentText.length >= 80) {
      chunks.push({
        chunkIndex: chunks.length,
        pageStart: currentPageStart,
        pageEnd: currentPageEnd,
        chapterTitle,
        sectionTitle,
        contentText,
        tokenCount: Math.ceil(contentText.length / 4),
      });
    }
    currentParts = [];
    currentLength = 0;
    currentPageStart = null;
    currentPageEnd = null;
  };

  for (const page of pages) {
    const paragraphs = page.text
      .split(/\n{1,}/)
      .map((value) => value.trim())
      .filter(Boolean);

    for (const paragraph of paragraphs) {
      if (isHeading(paragraph)) {
        if (currentLength >= maxCharacters * 0.45) flush();
        chapterTitle = paragraph;
        sectionTitle = paragraph;
      }

      const pieces = paragraph.length > maxCharacters
        ? paragraph.match(new RegExp(`.{1,${maxCharacters}}(?:\\\\s|$)`, "gu")) ?? [paragraph]
        : [paragraph];

      for (const piece of pieces) {
        if (currentLength > 0 && currentLength + piece.length > maxCharacters) flush();
        if (currentPageStart === null && page.pageNumber !== null) currentPageStart = page.pageNumber;
        if (page.pageNumber !== null) currentPageEnd = page.pageNumber;
        currentParts.push(piece);
        currentLength += piece.length;
      }
    }
  }
  flush();
  return chunks;
}
