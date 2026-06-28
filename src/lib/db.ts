import { unstable_noStore as noStore } from 'next/cache';
import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = process.env.VERCEL ? "/tmp" : path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

export interface DbCandidate {
  id: string;
  fileName: string;
  uploadedAt: string;
  displayName: string;
  email: string;
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
  noStore(); // Completely disable Next.js aggressive fetch data caching for this entire execution path
  await ensureDb();
  
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { get } = await import('@vercel/blob');
      const res = await get('db.json', { access: 'private', token: process.env.BLOB_READ_WRITE_TOKEN });
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
      console.error("Failed to read from Vercel Blob:", e);
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

  // Ensure all candidates have a project property
  parsed.candidates.forEach((c) => {
    if (c.project === undefined) {
      c.project = "";
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
  
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { put } = await import('@vercel/blob');
      const res = await put('db.json', jsonContent, {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
      });
      cachedBlobUrl = res.url;
      return;
    } catch (e) {
      console.error("Failed to write to Vercel Blob:", e);
    }
  }
  
  await fs.writeFile(DB_FILE, jsonContent, "utf8");
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
      const fileBuffer = Buffer.from(fileBase64, 'base64');
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        const { put } = await import('@vercel/blob');
        await put(`candidates/${candidate.id}/file`, fileBuffer, {
          access: 'private',
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: fileMimeType || 'application/octet-stream',
        });
      } else {
        const fileDir = path.join(DATA_DIR, 'files');
        await fs.mkdir(fileDir, { recursive: true });
        await fs.writeFile(path.join(fileDir, candidate.id), fileBuffer);
      }
    }
    
    if (previewBase64) {
      const previewBuffer = Buffer.from(previewBase64, 'base64');
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        const { put } = await import('@vercel/blob');
        await put(`candidates/${candidate.id}/preview`, previewBuffer, {
          access: 'private',
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: previewMimeType || 'text/html',
        });
      } else {
        const previewDir = path.join(DATA_DIR, 'previews');
        await fs.mkdir(previewDir, { recursive: true });
        await fs.writeFile(path.join(previewDir, candidate.id), previewBuffer);
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
  
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { list, del } = await import('@vercel/blob');
      const fileBlobs = await list({ prefix: `candidates/${candidateId}/` });
      const urls = fileBlobs.blobs.map(b => b.url);
      if (urls.length > 0) {
        await del(urls);
      }
    } catch (e) {
      console.error("Failed to delete Vercel Blobs:", e);
    }
  } else {
    try {
      await fs.unlink(path.join(DATA_DIR, 'files', candidateId)).catch(() => {});
      await fs.unlink(path.join(DATA_DIR, 'previews', candidateId)).catch(() => {});
    } catch {}
  }
  
  return true;
}

export async function getCandidateFile(candidateId: string): Promise<{ data: Buffer; mimeType: string } | null> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { list, get } = await import('@vercel/blob');
      const prefix = `candidates/${candidateId}/file`;
      const { blobs } = await list({ prefix });
      if (blobs[0]) {
        const res = await get(blobs[0].url, { access: 'private', token: process.env.BLOB_READ_WRITE_TOKEN });
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
      console.error("Failed to read candidate file from Vercel Blob:", e);
    }
  }
  
  try {
    const db = await readDb();
    const candidate = db.candidates.find(c => c.id === candidateId);
    const filePath = path.join(DATA_DIR, 'files', candidateId);
    const data = await fs.readFile(filePath);
    return {
      data,
      mimeType: candidate?.fileMimeType || 'application/octet-stream',
    };
  } catch {
    return null;
  }
}

export async function getCandidatePreview(candidateId: string): Promise<{ data: Buffer; mimeType: string } | null> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { list, get } = await import('@vercel/blob');
      const prefix = `candidates/${candidateId}/preview`;
      const { blobs } = await list({ prefix });
      if (blobs[0]) {
        const res = await get(blobs[0].url, { access: 'private', token: process.env.BLOB_READ_WRITE_TOKEN });
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
      console.error("Failed to read candidate preview from Vercel Blob:", e);
    }
  }
  
  try {
    const db = await readDb();
    const candidate = db.candidates.find(c => c.id === candidateId);
    const filePath = path.join(DATA_DIR, 'previews', candidateId);
    const data = await fs.readFile(filePath);
    return {
      data,
      mimeType: candidate?.previewMimeType || 'text/html',
    };
  } catch {
    return null;
  }
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
