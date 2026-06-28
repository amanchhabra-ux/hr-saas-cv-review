import { execFile } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import { NextResponse } from "next/server";
import mammoth from "mammoth";

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

async function renderWithTextutil(inputPath: string, outputPath: string) {
  await execFileAsync(
    "/usr/bin/textutil",
    ["-convert", "html", "-output", outputPath, inputPath],
    { timeout: 30000 },
  );
  return readFile(outputPath, "utf8");
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
    table { border-collapse: collapse; width: 100%; margin-top: 1em; margin-bottom: 1em; }
    th, td { border: 1px solid #e5e7eb; padding: 10px; text-align: left; vertical-align: top; }
    th { background-color: #f9fafb; font-weight: 600; color: #374151; }
    ul, ol { margin-top: 0; margin-bottom: 1.25em; padding-left: 20px; }
    li { margin-bottom: 0.5em; }
    a { color: #2563eb; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  ${bodyContent}
</body>
</html>`;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "No CV file was uploaded." }, { status: 400 });
  }

  const extension = getExtension(file.name);

  if (extension === ".pdf") {
    const buffer = Buffer.from(await file.arrayBuffer());
    return NextResponse.json({
      fileName: file.name,
      mimeType: "application/pdf",
      base64: buffer.toString("base64"),
      method: "original-pdf",
    });
  }

  if (![".doc", ".docx", ".rtf", ".odt"].includes(extension)) {
    return NextResponse.json({
      fileName: file.name,
      mimeType: mimeFor(file.name),
      base64: "",
      method: "not-renderable",
      warning: "This file type cannot be rendered as-is in the browser.",
    });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // 1. Try rendering .docx with Mammoth first (pure-JS, very fast)
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
      console.warn("Mammoth conversion failed, falling back to textutil", e);
    }
  }

  // 2. Try rendering with textutil (macOS fallback)
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "cv-render-"));
  const inputPath = path.join(tempDir, file.name.replace(/[^\w .()-]/g, "_"));

  try {
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
  } catch (error) {
    console.error("Textutil conversion failed:", error);
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
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}
