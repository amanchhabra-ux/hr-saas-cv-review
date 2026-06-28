import { NextResponse } from "next/server";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import { PDFParse } from "pdf-parse";

export const runtime = "nodejs";

type ParsedCv = {
  fileName: string;
  text: string;
  method: string;
  warning?: string;
};

function cleanText(text: string) {
  return text
    .replace(/\u0000/g, " ")
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hasReadableText(text: string) {
  const cleaned = cleanText(text);
  const letters = cleaned.match(/[A-Za-z]/g)?.length || 0;
  return cleaned.length > 25 && letters > 10;
}

async function extractLegacyWord(buffer: Buffer) {
  const extractor = new WordExtractor();
  const document = await extractor.extract(buffer);
  return cleanText(
    [
      document.getBody(),
      document.getHeaders(),
      document.getFootnotes(),
      document.getEndnotes(),
    ].join("\n"),
  );
}

async function extractPdfText(buffer: Buffer) {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return cleanText(result.text);
  } finally {
    await parser.destroy();
  }
}

async function extractText(file: File): Promise<ParsedCv> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const lowerName = file.name.toLowerCase();

  if (file.type === "application/pdf" || lowerName.endsWith(".pdf")) {
    const text = await extractPdfText(buffer);
    return {
      fileName: file.name,
      text,
      method: "pdf-parse",
      warning: hasReadableText(text)
        ? undefined
        : "No readable text was found. This PDF may be scanned and need OCR.",
    };
  }

  if (
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    const parsed = await mammoth.extractRawText({ buffer });
    const text = cleanText(parsed.value);
    if (hasReadableText(text)) {
      return { fileName: file.name, text, method: "mammoth-docx" };
    }

    const fallbackText = await extractLegacyWord(buffer);
    return {
      fileName: file.name,
      text: fallbackText || text,
      method: "word-extractor-fallback",
      warning: hasReadableText(fallbackText)
        ? undefined
        : "No readable text was found in this Word file.",
    };
  }

  if (lowerName.endsWith(".doc")) {
    const text = await extractLegacyWord(buffer);
    return {
      fileName: file.name,
      text,
      method: "word-extractor-doc",
      warning: hasReadableText(text)
        ? undefined
        : "No readable text was found in this legacy Word file.",
    };
  }

  const text = cleanText(buffer.toString("utf8"));
  return {
    fileName: file.name,
    text,
    method: "plain-text",
    warning: hasReadableText(text)
      ? undefined
      : "This file format did not expose readable text.",
  };
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const files = formData.getAll("files").filter((item): item is File => item instanceof File);

  if (!files.length) {
    return NextResponse.json({ message: "No CV files were uploaded." }, { status: 400 });
  }

  const parsed = await Promise.all(files.map((file) => extractText(file)));

  return NextResponse.json({ parsed });
}
