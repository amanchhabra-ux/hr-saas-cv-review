import { unstable_noStore as noStore } from 'next/cache';
import { promises as fs } from "fs";
import path from "path";
import {
  TataCvData,
  parseTataCv,
  extractCandidateName,
  extractCandidatePhone,
  extractCandidateQualification,
  QualificationBroadType,
} from "./cvParser";
import { isR2Configured, getFromR2, uploadToR2 } from "./r2";

const DATA_DIR = process.env.VERCEL ? "/tmp" : path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const USE_BLOB = Boolean(process.env.VERCEL && process.env.BLOB_READ_WRITE_TOKEN);

export interface CandidateMessage {
  id: string;
  type: "whatsapp" | "email" | "note";
  direction: "outbound" | "inbound";
  sender: string;
  recipient: string;
  subject?: string;
  text: string;
  timestamp: string;
}

export interface DbCandidate {
  id: string;
  fileName: string;
  uploadedAt: string;
  displayName: string;
  email: string;
  phone?: string;
  messages?: CandidateMessage[];
  fileType: string;
  objectUrl: string;
  previewUrl: string;
  previewMethod: string;
  rawText: string;
  parseMethod: string;
  parseWarning: string;
  status: string;
  comments: string;
  reviewer: string;
  notified: boolean;
  discipline: string;
  project: string;
  fileBase64?: string;
  fileMimeType?: string;
  previewBase64?: string;
  previewMimeType?: string;
  uploaderEmail?: string;
  tataData?: TataCvData;
  qualification?: string;
  qualificationType?: QualificationBroadType | string;
  qualifications?: string[];
  qualificationRank?: number;
  qualificationDetail?: string;
}

interface DbData {
  candidates: DbCandidate[];
  projects?: string[];
  users?: Record<string, DbCandidate[]>;
}

const otpRegistry: Record<string, { otp: string; expires: number }> = {};
let cachedBlobUrl: string | null = null;

async function ensureDb() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.mkdir(path.join(DATA_DIR, 'files'), { recursive: true });
    await fs.mkdir(path.join(DATA_DIR, 'previews'), { recursive: true });
    try {
      await fs.access(DB_FILE);
    } catch {
      await fs.writeFile(DB_FILE, JSON.stringify({ candidates: [], projects: ["Reliance TL project"] }, null, 2), "utf8");
    }
  } catch (e) {
    console.error("Failed to initialize database:", e);
  }
}

export async function readDb(): Promise<DbData> {
  noStore();
  await ensureDb();
  
  if (isR2Configured()) {
    try {
      const r2Res = await getFromR2("db.json");
      if (r2Res) {
        const content = r2Res.data.toString("utf8");
        const parsed = JSON.parse(content) as DbData;
        return migrateDb(parsed);
      }
    } catch (e) {
      console.warn("Could not read from Cloudflare R2, falling back:", e);
    }
  }

  if (USE_BLOB) {
    try {
      const { get } = await import('@vercel/blob');
      const res = await get('db.json', { access: 'public', token: process.env.BLOB_READ_WRITE_TOKEN });
      if (res && res.stream) {
        const chunks = [];
        for await (const chunk of res.stream as any) {
          chunks.push(chunk as Uint8Array);
        }
        const content = Buffer.concat(chunks).toString("utf8");
        const parsed = JSON.parse(content) as DbData;
        return migrateDb(parsed);
      }
    } catch (e) {
      console.warn("Could not read from Vercel Blob, falling back to local file:", e);
    }
  }
  
  try {
    const content = await fs.readFile(DB_FILE, "utf8");
    const parsed = JSON.parse(content) as DbData;
    return migrateDb(parsed);
  } catch {
    return { candidates: [], projects: ["Reliance TL project"] };
  }
}

function migrateDb(parsed: DbData): DbData {
  if (!parsed.candidates) {
    parsed.candidates = [];
  }
  if (!parsed.projects || parsed.projects.length === 0) {
    parsed.projects = ["Reliance TL project"];
  }
  
  // Automatically migrate legacy users object
  if (parsed.users) {
    const allCandidates: DbCandidate[] = [];
    const seenIds = new Set<string>();
    for (const email of Object.keys(parsed.users)) {
      const list = parsed.users[email] || [];
      for (const candidate of list) {
        if (!seenIds.has(candidate.id)) {
          seenIds.add(candidate.id);
          if (!candidate.uploaderEmail) {
            candidate.uploaderEmail = email;
          }
          allCandidates.push(candidate);
        }
      }
    }
    parsed.candidates = [...parsed.candidates, ...allCandidates];
    delete parsed.users;
  }

  // Ensure all candidates have clean names, valid project property, and tataData populated
  parsed.candidates.forEach((c) => {
    if (c.project === undefined) {
      c.project = "";
    }
    const currentName = c.displayName?.trim() || "";
    const needsFix =
      !currentName ||
      currentName.toLowerCase() === "objective" ||
      currentName.toLowerCase().startsWith("name-") ||
      currentName.toLowerCase().startsWith("name:") ||
      currentName === c.fileName;
    if (needsFix) {
      const fixedName = extractCandidateName(c.fileName, c.rawText);
      if (fixedName) {
        c.displayName = fixedName;
        if (c.tataData) {
          c.tataData.nameOfStaff = fixedName;
        }
      }
    }
    if (!c.phone && c.rawText) {
      c.phone = extractCandidatePhone(c.rawText);
    }
    if (!c.messages) {
      c.messages = [];
    }
    if (!c.tataData && c.rawText) {
      try {
        c.tataData = parseTataCv(c.rawText, c.displayName);
      } catch (e) {
        console.error(`parseTataCv failed for candidate ${c.id}:`, e);
      }
    }
    if (!c.qualification) {
      try {
        const qInfo = extractCandidateQualification(c.rawText, c.tataData?.education, c.fileName);
        c.qualification = qInfo.qualification;
        c.qualificationType = qInfo.qualificationType;
        c.qualifications = qInfo.qualifications;
        c.qualificationRank = qInfo.qualificationRank;
        c.qualificationDetail = qInfo.qualificationDetail;
      } catch (e) {
        console.error(`extractCandidateQualification failed for candidate ${c.id}:`, e);
      }
    }
  });

  return parsed;
}

export async function writeDb(data: DbData): Promise<void> {
  await ensureDb();
  
  const payload = {
    candidates: data.candidates.map((c) => {
      const copy = { ...c };
      delete copy.fileBase64;
      delete copy.previewBase64;
      return copy;
    }),
    projects: data.projects || ["Reliance TL project"],
  };
  
  const jsonContent = JSON.stringify(payload, null, 2);
  
  // Always write to local file
  await fs.writeFile(DB_FILE, jsonContent, "utf8");

  // If Cloudflare R2 configured, sync to R2
  if (isR2Configured()) {
    try {
      await uploadToR2("db.json", jsonContent, "application/json");
    } catch (e) {
      console.warn("Failed to write db.json to Cloudflare R2:", e);
    }
  }

  // If on Vercel with Blob, sync in background
  if (USE_BLOB) {
    try {
      const { put } = await import('@vercel/blob');
      const res = await put('db.json', jsonContent, {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
      });
      cachedBlobUrl = res.url;
    } catch (e) {
      console.warn("Failed to write to Vercel Blob:", e);
    }
  }
}

export async function getCandidates(userEmail: string): Promise<DbCandidate[]> {
  const db = await readDb();
  return [...db.candidates].sort(
    (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
  );
}

export async function getProjects(): Promise<string[]> {
  const db = await readDb();
  return db.projects || ["Reliance TL project"];
}

export async function addProject(project: string): Promise<string[]> {
  const db = await readDb();
  if (!db.projects) {
    db.projects = ["Reliance TL project"];
  }
  const cleanProject = project.trim();
  if (cleanProject && !db.projects.includes(cleanProject)) {
    db.projects.push(cleanProject);
    await writeDb(db);
  }
  return db.projects;
}

export async function removeProject(project: string): Promise<string[]> {
  const db = await readDb();
  if (!db.projects) return [];
  const cleanProject = project.trim();
  db.projects = db.projects.filter(p => p !== cleanProject);
  await writeDb(db);
  return db.projects;
}

export async function saveCandidates(userEmail: string, candidates: DbCandidate[]): Promise<void> {
  const db = await readDb();
  db.candidates = candidates;
  await writeDb(db);
}

export async function addCandidates(userEmail: string, newCandidates: DbCandidate[]): Promise<void> {
  const db = await readDb();
  
  for (const candidate of newCandidates) {
    const { fileBase64, fileMimeType, previewBase64, previewMimeType } = candidate;
    
    const newCand = { 
      ...candidate, 
      uploaderEmail: userEmail,
      project: candidate.project || "",
    };
    delete newCand.fileBase64;
    delete newCand.previewBase64;
    
    if (fileBase64) {
      try {
        const fileBuffer = Buffer.from(fileBase64, 'base64');
        const fileDir = path.join(DATA_DIR, 'files');
        await fs.mkdir(fileDir, { recursive: true });
        await fs.writeFile(path.join(fileDir, candidate.id), fileBuffer);

        if (isR2Configured()) {
          try {
            await uploadToR2(`candidates/${candidate.id}/file`, fileBuffer, fileMimeType || 'application/octet-stream');
          } catch (r2Err) {
            console.warn("Cloudflare R2 file put warning:", r2Err);
          }
        }

        if (USE_BLOB) {
          try {
            const { put } = await import('@vercel/blob');
            await put(`candidates/${candidate.id}/file`, fileBuffer, {
              access: 'public',
              addRandomSuffix: false,
              allowOverwrite: true,
              contentType: fileMimeType || 'application/octet-stream',
            });
          } catch (blobErr) {
            console.warn("Vercel Blob file put warning:", blobErr);
          }
        }
      } catch (err) {
        console.error(`Failed to save file for ${candidate.id}:`, err);
      }
    }
    
    if (previewBase64) {
      try {
        const previewBuffer = Buffer.from(previewBase64, 'base64');
        const previewDir = path.join(DATA_DIR, 'previews');
        await fs.mkdir(previewDir, { recursive: true });
        await fs.writeFile(path.join(previewDir, candidate.id), previewBuffer);

        if (isR2Configured()) {
          try {
            await uploadToR2(`candidates/${candidate.id}/preview`, previewBuffer, previewMimeType || 'text/html');
          } catch (r2Err) {
            console.warn("Cloudflare R2 preview put warning:", r2Err);
          }
        }

        if (USE_BLOB) {
          try {
            const { put } = await import('@vercel/blob');
            await put(`candidates/${candidate.id}/preview`, previewBuffer, {
              access: 'public',
              addRandomSuffix: false,
              allowOverwrite: true,
              contentType: previewMimeType || 'text/html',
            });
          } catch (blobErr) {
            console.warn("Vercel Blob preview put warning:", blobErr);
          }
        }
      } catch (err) {
        console.error(`Failed to save preview for ${candidate.id}:`, err);
      }
    }
    
    db.candidates.unshift(newCand);
  }
  
  await writeDb(db);
}

export async function updateCandidate(
  userEmail: string,
  candidateId: string,
  changes: Partial<DbCandidate>,
): Promise<DbCandidate | null> {
  const db = await readDb();
  let updated: DbCandidate | null = null;
  
  const index = db.candidates.findIndex((c) => c.id === candidateId);
  if (index !== -1) {
    updated = { ...db.candidates[index], ...changes };
    db.candidates[index] = updated;
    await writeDb(db);
  }
  
  return updated;
}

export async function deleteCandidate(candidateId: string): Promise<boolean> {
  const db = await readDb();
  const index = db.candidates.findIndex((c) => c.id === candidateId);
  if (index === -1) return false;
  
  db.candidates.splice(index, 1);
  await writeDb(db);
  
  // Local deletion
  try {
    await fs.unlink(path.join(DATA_DIR, 'files', candidateId)).catch(() => {});
    await fs.unlink(path.join(DATA_DIR, 'previews', candidateId)).catch(() => {});
  } catch {}

  // Blob deletion if on Vercel
  if (USE_BLOB) {
    try {
      const { list, del } = await import('@vercel/blob');
      const fileBlobs = await list({ prefix: `candidates/${candidateId}/` });
      const urls = fileBlobs.blobs.map(b => b.url);
      if (urls.length > 0) {
        await del(urls);
      }
    } catch (e) {
      console.warn("Failed to delete Vercel Blobs:", e);
    }
  }
  
  return true;
}

export async function deleteAllCandidates(): Promise<boolean> {
  const db = await readDb();
  if (db.candidates.length === 0) return true;
  
  db.candidates = [];
  await writeDb(db);
  
  try {
    await fs.rm(path.join(DATA_DIR, 'files'), { recursive: true, force: true }).catch(() => {});
    await fs.rm(path.join(DATA_DIR, 'previews'), { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(path.join(DATA_DIR, 'files'), { recursive: true });
    await fs.mkdir(path.join(DATA_DIR, 'previews'), { recursive: true });
  } catch {}

  if (USE_BLOB) {
    try {
      const { list, del } = await import('@vercel/blob');
      const fileBlobs = await list({ prefix: `candidates/` });
      const urls = fileBlobs.blobs.map(b => b.url);
      
      const chunkSize = 500;
      for (let i = 0; i < urls.length; i += chunkSize) {
        const chunk = urls.slice(i, i + chunkSize);
        if (chunk.length > 0) {
          await del(chunk);
        }
      }
    } catch (e) {
      console.warn("Failed to bulk delete Vercel Blobs:", e);
    }
  }
  
  return true;
}

export async function getCandidateFile(candidateId: string): Promise<{ data: Buffer; mimeType: string } | null> {
  // 1. Try local filesystem
  try {
    const filePath = path.join(DATA_DIR, 'files', candidateId);
    const data = await fs.readFile(filePath);
    const db = await readDb();
    const candidate = db.candidates.find(c => c.id === candidateId);
    return {
      data,
      mimeType: candidate?.fileMimeType || 'application/octet-stream',
    };
  } catch (localErr) {
    // 2. Try Cloudflare R2 if configured
    if (isR2Configured()) {
      try {
        const r2Res = await getFromR2(`candidates/${candidateId}/file`);
        if (r2Res) {
          const db = await readDb();
          const candidate = db.candidates.find(c => c.id === candidateId);
          return {
            data: r2Res.data,
            mimeType: candidate?.fileMimeType || r2Res.contentType || 'application/octet-stream',
          };
        }
      } catch (e) {
        console.warn("Failed to read candidate file from Cloudflare R2:", e);
      }
    }

    // 3. Try Vercel Blob if on Vercel
    if (USE_BLOB) {
      try {
        const { list, get } = await import('@vercel/blob');
        const prefix = `candidates/${candidateId}/file`;
        const { blobs } = await list({ prefix });
        if (blobs[0]) {
          const res = await get(blobs[0].url, { access: 'public', token: process.env.BLOB_READ_WRITE_TOKEN });
          if (res && res.stream) {
            const chunks = [];
            for await (const chunk of res.stream as any) {
              chunks.push(chunk as Uint8Array);
            }
            const db = await readDb();
            const candidate = db.candidates.find(c => c.id === candidateId);
            return {
              data: Buffer.concat(chunks),
              mimeType: candidate?.fileMimeType || 'application/octet-stream',
            };
          }
        }
      } catch (e) {
        console.warn("Failed to read candidate file from Vercel Blob:", e);
      }
    }
    return null;
  }
}

export async function getCandidatePreview(candidateId: string): Promise<{ data: Buffer; mimeType: string } | null> {
  // 1. Try local filesystem preview
  try {
    const filePath = path.join(DATA_DIR, 'previews', candidateId);
    const data = await fs.readFile(filePath);
    const db = await readDb();
    const candidate = db.candidates.find(c => c.id === candidateId);
    return {
      data,
      mimeType: candidate?.previewMimeType || 'text/html',
    };
  } catch (localErr) {
    // 2. Try Cloudflare R2 if configured
    if (isR2Configured()) {
      try {
        const r2Res = await getFromR2(`candidates/${candidateId}/preview`);
        if (r2Res) {
          const db = await readDb();
          const candidate = db.candidates.find(c => c.id === candidateId);
          return {
            data: r2Res.data,
            mimeType: candidate?.previewMimeType || r2Res.contentType || 'text/html',
          };
        }
      } catch (e) {
        console.warn("Failed to read candidate preview from Cloudflare R2:", e);
      }
    }

    // 3. Try Vercel Blob preview if on Vercel
    if (USE_BLOB) {
      try {
        const { list, get } = await import('@vercel/blob');
        const prefix = `candidates/${candidateId}/preview`;
        const { blobs } = await list({ prefix });
        if (blobs[0]) {
          const res = await get(blobs[0].url, { access: 'public', token: process.env.BLOB_READ_WRITE_TOKEN });
          if (res && res.stream) {
            const chunks = [];
            for await (const chunk of res.stream as any) {
              chunks.push(chunk as Uint8Array);
            }
            const db = await readDb();
            const candidate = db.candidates.find(c => c.id === candidateId);
            return {
              data: Buffer.concat(chunks),
              mimeType: candidate?.previewMimeType || 'text/html',
            };
          }
        }
      } catch (e) {
        console.warn("Failed to read candidate preview from Vercel Blob:", e);
      }
    }

    // 4. Fallback: if preview missing but file exists and is PDF, serve original file as preview
    try {
      const fileRes = await getCandidateFile(candidateId);
      if (fileRes && (fileRes.mimeType.includes("pdf") || fileRes.mimeType.includes("text"))) {
        return fileRes;
      }
    } catch {}

    // 5. Ultimate Fallback: generate high-fidelity HTML preview from candidate structured data
    try {
      const db = await readDb();
      const candidate = db.candidates.find(c => c.id === candidateId);
      if (candidate) {
        return {
          data: generateCandidateHtmlPreview(candidate),
          mimeType: 'text/html; charset=utf-8',
        };
      }
    } catch (genErr) {
      console.warn("Failed to generate fallback HTML preview for candidate:", genErr);
    }

    return null;
  }
}

function escapeHtml(str: string): string {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function generateCandidateHtmlPreview(candidate: DbCandidate): Buffer {
  const tata = candidate.tataData;
  const name = escapeHtml(candidate.displayName || candidate.fileName || "Candidate CV");
  const email = escapeHtml(candidate.email || "Not specified");
  const phone = escapeHtml(candidate.phone || "Not specified");
  const qualification = escapeHtml(candidate.qualification || candidate.qualificationType || "");
  const project = escapeHtml(candidate.project || "");
  const fileName = escapeHtml(candidate.fileName || "");
  const rawText = escapeHtml(candidate.rawText || "No raw text available for this candidate.");

  let tataSections = "";
  if (tata) {
    const details = [
      tata.proposedPosition ? { label: "Proposed Position", val: tata.proposedPosition } : null,
      tata.dob ? { label: "Date of Birth", val: tata.dob } : null,
      tata.nationality ? { label: "Nationality", val: tata.nationality } : null,
      tata.membership ? { label: "Memberships", val: tata.membership } : null,
      tata.otherTraining ? { label: "Training", val: tata.otherTraining } : null,
      tata.countries ? { label: "Countries Worked", val: tata.countries } : null,
    ].filter(Boolean) as Array<{ label: string; val: string }>;

    if (details.length > 0) {
      tataSections += `
        <div class="section">
          <h3>Candidate Profile Details</h3>
          <div class="grid">
            ${details.map(d => `
              <div class="info-item">
                <span class="label">${escapeHtml(d.label)}:</span>
                <span class="value">${escapeHtml(d.val)}</span>
              </div>
            `).join("")}
          </div>
        </div>
      `;
    }

    if (tata.education) {
      tataSections += `
        <div class="section">
          <h3>Education &amp; Qualifications</h3>
          <div class="raw-text-container" style="background:#fff;border-left:3px solid #2563eb;">
            ${escapeHtml(tata.education)}
          </div>
        </div>
      `;
    }

    if (tata.languages) {
      const langs = [];
      if (tata.languages.english?.speaking) langs.push(`English (Speaking: ${tata.languages.english.speaking})`);
      if (tata.languages.hindi?.speaking) langs.push(`Hindi (Speaking: ${tata.languages.hindi.speaking})`);
      if (tata.languages.others) {
        for (const o of tata.languages.others) {
          if (o.name) langs.push(o.name);
        }
      }
      if (langs.length > 0) {
        tataSections += `
          <div class="section">
            <h3>Languages</h3>
            <div class="skills-wrap">
              ${langs.map(l => `<span class="skill-tag">${escapeHtml(l)}</span>`).join("")}
            </div>
          </div>
        `;
      }
    }

    if (tata.employmentRecord && tata.employmentRecord.length > 0) {
      tataSections += `
        <div class="section">
          <h3>Work Experience</h3>
          ${tata.employmentRecord.map(rec => `
            <div class="exp-item">
              <div class="exp-header">
                <strong>${escapeHtml(rec.employer || "Employer")}</strong>
                <span class="exp-period">${escapeHtml(rec.period || "")}</span>
              </div>
              ${(rec.projects || []).map(p => `
                <div style="margin-top:6px;font-size:13px;">
                  <div style="font-weight:600;color:#1e293b;">${escapeHtml(p.projectName || p.positionHeld || "")}</div>
                  ${p.client ? `<div style="color:#64748b;font-size:12px;">Client: ${escapeHtml(p.client)} ${p.location ? `| Location: ${escapeHtml(p.location)}` : ""}</div>` : ""}
                  ${p.responsibilities ? `<p class="exp-desc">${escapeHtml(p.responsibilities)}</p>` : ""}
                </div>
              `).join("")}
            </div>
          `).join("")}
        </div>
      `;
    }
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name} - CV Preview</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 32px 16px;
      background: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      line-height: 1.6;
    }
    .cv-document {
      max-width: 820px;
      margin: 0 auto;
      background: #ffffff;
      padding: 44px;
      border-radius: 8px;
      box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.08), 0 2px 6px -1px rgba(0, 0, 0, 0.04);
      border: 1px solid #e2e8f0;
    }
    .cv-header {
      border-bottom: 2px solid #2563eb;
      padding-bottom: 20px;
      margin-bottom: 24px;
    }
    .cv-title-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 12px;
    }
    .cv-name {
      margin: 0;
      font-size: 24px;
      font-weight: 700;
      color: #0f172a;
      letter-spacing: -0.02em;
    }
    .badge-group {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      background: #eff6ff;
      color: #1d4ed8;
      border: 1px solid #bfdbfe;
    }
    .badge-project {
      background: #ecfdf5;
      color: #047857;
      border-color: #a7f3d0;
    }
    .contact-row {
      display: flex;
      flex-wrap: wrap;
      gap: 18px;
      margin-top: 12px;
      font-size: 13px;
      color: #475569;
    }
    .contact-item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .section {
      margin-bottom: 24px;
    }
    .section h3 {
      font-size: 15px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #1e293b;
      margin: 0 0 10px 0;
      padding-bottom: 6px;
      border-bottom: 1px solid #e2e8f0;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 10px;
    }
    .info-item {
      font-size: 13px;
    }
    .info-item .label {
      color: #64748b;
      font-weight: 500;
    }
    .info-item .value {
      color: #0f172a;
      font-weight: 600;
      margin-left: 4px;
    }
    .table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      margin-top: 8px;
    }
    .table th, .table td {
      padding: 9px 12px;
      text-align: left;
      border-bottom: 1px solid #e2e8f0;
    }
    .table th {
      background: #f8fafc;
      font-weight: 600;
      color: #475569;
    }
    .exp-item {
      margin-bottom: 14px;
      padding-left: 12px;
      border-left: 2px solid #cbd5e1;
    }
    .exp-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 14px;
    }
    .exp-company {
      color: #2563eb;
      font-weight: 600;
    }
    .exp-period {
      color: #64748b;
      font-size: 12px;
    }
    .exp-desc {
      margin: 4px 0 0 0;
      font-size: 13px;
      color: #334155;
    }
    .skills-wrap {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .skill-tag {
      background: #f1f5f9;
      color: #334155;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      border: 1px solid #e2e8f0;
    }
    .raw-text-container {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 16px;
      font-size: 13px;
      line-height: 1.65;
      color: #334155;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: inherit;
    }
    .file-source-note {
      margin-top: 24px;
      padding-top: 14px;
      border-top: 1px dashed #cbd5e1;
      font-size: 11px;
      color: #94a3b8;
      display: flex;
      justify-content: space-between;
    }
    @media print {
      body { background: white; padding: 0; }
      .cv-document { box-shadow: none; border: none; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="cv-document">
    <div class="cv-header">
      <div class="cv-title-row">
        <h1 class="cv-name">${name}</h1>
        <div class="badge-group">
          ${qualification ? `<span class="badge">${qualification}</span>` : ""}
          ${project ? `<span class="badge badge-project">${project}</span>` : ""}
        </div>
      </div>
      <div class="contact-row">
        ${email !== "Not specified" ? `<div class="contact-item">✉️ ${email}</div>` : ""}
        ${phone !== "Not specified" ? `<div class="contact-item">📞 ${phone}</div>` : ""}
        ${fileName ? `<div class="contact-item">📄 ${fileName}</div>` : ""}
      </div>
    </div>

    ${tataSections}

    <div class="section">
      <h3>Full Resume Content</h3>
      <div class="raw-text-container">${rawText}</div>
    </div>

    <div class="file-source-note">
      <span>Candidate ID: ${escapeHtml(candidate.id)}</span>
      <span>Document: ${fileName || "Uploaded Resume"}</span>
    </div>
  </div>
</body>
</html>`;

  return Buffer.from(html, "utf8");
}

export function storeOtp(email: string, otp: string): void {
  otpRegistry[email.toLowerCase()] = {
    otp,
    expires: Date.now() + 5 * 60 * 1000,
  };
}

export function verifyOtp(email: string, otp: string): boolean {
  const entry = otpRegistry[email.toLowerCase()];
  if (!entry) return false;
  if (entry.expires < Date.now()) {
    delete otpRegistry[email.toLowerCase()];
    return false;
  }
  if (entry.otp === otp) {
    delete otpRegistry[email.toLowerCase()];
    return true;
  }
  return false;
}
