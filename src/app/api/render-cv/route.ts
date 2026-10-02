import { execFile } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import { NextResponse } from "next/server";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

function getExtension(fileName: string) {
  return path.extname(fileName).toLowerCase();
}

function mimeFor(fileName: string) {
  return fileName.toLowerCase().endsWith(".pdf")
    ? "application/pdf"
    : "application/octet-stream";
}

function escapeHtml(str: string) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function wrapHtml(bodyContent: string) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: #111827;
      padding: 40px;
      margin: 0;
      background-color: #ffffff;
      max-width: 800px;
      margin: 0 auto;
    }
    p { margin-top: 0; margin-bottom: 1.25em; }
    h1, h2, h3, h4, h5, h6 { margin-top: 1.5em; margin-bottom: 0.5em; color: #1f2937; line-height: 1.25; }
    h1 { font-size: 2em; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.3em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.3em; }
    h3 { font-size: 1.2em; border-bottom: 1px solid #f3f4f6; padding-bottom: 0.2em; }
    table { border-collapse: collapse; width: 100%; margin-top: 1em; margin-bottom: 1em; }
    th, td { border: 1px solid #e5e7eb; padding: 10px; text-align: left; vertical-align: top; }
    th { background-color: #f9fafb; font-weight: 600; color: #374151; }
    ul, ol { margin-top: 0; margin-bottom: 1.25em; padding-left: 20px; }
    li { margin-bottom: 0.5em; }
    a { color: #2563eb; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .rendered-document { white-space: normal; }
  </style>
</head>
<body>
  ${bodyContent}
</body>
</html>`;
}

function formatTextToHtml(rawText: string) {
  const lines = rawText.split(/\r?\n/);
  const body = lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '<div style="height: 10px;"></div>';
      if (/^#{1,3}\s+/.test(trimmed)) {
        const hText = trimmed.replace(/^#{1,3}\s+/, "");
        return `<h3>${escapeHtml(hText)}</h3>`;
      }
      if (
        trimmed.length < 50 &&
        /^[A-Z0-9\s/&,.-]{4,}:?$/.test(trimmed) &&
        trimmed.split(" ").length <= 6
      ) {
        return `<h3>${escapeHtml(trimmed)}</h3>`;
      }
      if (/^[-*•]\s+/.test(trimmed)) {
        return `<div style="padding-left: 20px; position: relative;"><span style="position: absolute; left: 6px;">•</span> ${escapeHtml(trimmed.replace(/^[-*•]\s+/, ""))}</div>`;
      }
      return `<p style="margin: 0 0 6px 0;">${escapeHtml(line)}</p>`;
    })
    .join("\n");
  return wrapHtml(`<div class="rendered-document">${body}</div>`);
}

async function renderWithTextutil(inputPath: string, outputPath: string) {
  await execFileAsync(
    "/usr/bin/textutil",
    ["-convert", "html", "-output", outputPath, inputPath],
    { timeout: 30000 },
  );
  return readFile(outputPath, "utf8");
}

async function renderDocWithWordExtractor(buffer: Buffer) {
  const extractor = new WordExtractor();
  const document = await extractor.extract(buffer);
  const text = [
    document.getHeaders(),
    document.getBody(),
    document.getFootnotes(),
    document.getEndnotes(),
  ]
    .filter(Boolean)
    .join("\n\n");
  return formatTextToHtml(text);
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "No CV file was uploaded." }, { status: 400 });
  }

  const extension = getExtension(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());

  // 1. PDF files
  if (extension === ".pdf") {
    return NextResponse.json({
      fileName: file.name,
      mimeType: "application/pdf",
      base64: buffer.toString("base64"),
      method: "original-pdf",
    });
  }

  // 2. Plain Text / Markdown files
  if (extension === ".txt" || extension === ".md") {
    const text = buffer.toString("utf8");
    const styledHtml = formatTextToHtml(text);
    return NextResponse.json({
      fileName: `${path.basename(file.name, extension)}.html`,
      mimeType: "text/html;charset=utf-8",
      base64: Buffer.from(styledHtml).toString("base64"),
      method: "txt-html",
    });
  }

  // 3. Supported Word & Document formats: .docx, .doc, .rtf, .odt
  if (![".doc", ".docx", ".rtf", ".odt"].includes(extension)) {
    // If unknown extension, attempt to render as plain text if it contains readable text
    const textAttempt = buffer.toString("utf8");
    const letters = textAttempt.match(/[A-Za-z]/g)?.length || 0;
    if (textAttempt.length > 20 && letters > 10) {
      const styledHtml = formatTextToHtml(textAttempt);
      return NextResponse.json({
        fileName: `${path.basename(file.name, extension)}.html`,
        mimeType: "text/html;charset=utf-8",
        base64: Buffer.from(styledHtml).toString("base64"),
        method: "txt-fallback-html",
      });
    }

    return NextResponse.json({
      fileName: file.name,
      mimeType: mimeFor(file.name),
      base64: "",
      method: "not-renderable",
      warning: "This file type cannot be rendered as-is in the browser.",
    });
  }

  // 4. Try rendering .docx with Mammoth first (pure-JS, very fast & clean)
  if (extension === ".docx") {
    try {
      const result = await mammoth.convertToHtml({ buffer });
      const styledHtml = wrapHtml(result.value);
      return NextResponse.json({
        fileName: `${path.basename(file.name, extension)}.html`,
        mimeType: "text/html;charset=utf-8",
        base64: Buffer.from(styledHtml).toString("base64"),
        method: "mammoth-html",
        warning: result.messages.length > 0 
          ? "Preview rendered with minor structural changes. Download retains the original file."
          : undefined,
      });
    } catch (e) {
      console.warn("Mammoth conversion failed, falling back to textutil/extractor", e);
    }
  }

  // 5. Try rendering with textutil (macOS native)
  let tempDir = "";
  try {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "cv-render-"));
    const inputPath = path.join(tempDir, file.name.replace(/[^\w .()-]/g, "_"));
    await writeFile(inputPath, buffer);
    const htmlPath = path.join(tempDir, `${path.basename(inputPath, extension)}.html`);
    const html = await renderWithTextutil(inputPath, htmlPath);

    return NextResponse.json({
      fileName: `${path.basename(file.name, extension)}.html`,
      mimeType: "text/html;charset=utf-8",
      base64: Buffer.from(html).toString("base64"),
      method: "textutil-html",
      warning: "Preview rendered from the original Word file. Download retains the original file.",
    });
  } catch (textutilError) {
    console.warn("Textutil conversion unavailable or failed, attempting WordExtractor fallback:", textutilError);
    
    // 6. Cross-platform fallback for .doc / .docx using WordExtractor
    try {
      const html = await renderDocWithWordExtractor(buffer);
      return NextResponse.json({
        fileName: `${path.basename(file.name, extension)}.html`,
        mimeType: "text/html;charset=utf-8",
        base64: Buffer.from(html).toString("base64"),
        method: "word-extractor-html",
        warning: "Preview rendered from document text. Download retains the original file.",
      });
    } catch (fallbackError) {
      console.error("All rendering strategies failed:", fallbackError);
      return NextResponse.json(
        {
          fileName: file.name,
          mimeType: mimeFor(file.name),
          base64: "",
          method: "render-failed",
          warning: "The CV could not be rendered without changing format. Open or download the original file.",
        },
        { status: 202 },
      );
    }
  } finally {
    if (tempDir) {
      await rm(tempDir, { force: true, recursive: true }).catch(() => {});
    }
  }
}
