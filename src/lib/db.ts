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
  fileBase64?: string;
  fileMimeType?: string;
  previewBase64?: string;
  previewMimeType?: string;
  uploaderEmail?: string;
}

interface DbData {
  candidates: DbCandidate[];
  users?: Record<string, DbCandidate[]>;
}

const otpRegistry: Record<string, { otp: string; expires: number }> = {};

async function ensureDb() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
      await fs.access(DB_FILE);
    } catch {
      await fs.writeFile(DB_FILE, JSON.stringify({ candidates: [] }, null, 2), "utf8");
    }
  } catch (e) {
    console.error("Failed to initialize database:", e);
  }
}

export async function readDb(): Promise<DbData> {
  await ensureDb();
  try {
    const content = await fs.readFile(DB_FILE, "utf8");
    const parsed = JSON.parse(content) as DbData;
    
    // Automatically migrate from legacy user-keyed object to flat candidates list
    if (!parsed.candidates) {
      parsed.candidates = [];
    }
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
      
      // Merge unique candidates
      parsed.candidates = [...parsed.candidates, ...allCandidates];
      delete parsed.users; // remove legacy key
      
      // Save migrated data
      await fs.writeFile(DB_FILE, JSON.stringify({ candidates: parsed.candidates }, null, 2), "utf8");
    }
    
    return parsed;
  } catch {
    return { candidates: [] };
  }
}

export async function writeDb(data: DbData): Promise<void> {
  await ensureDb();
  await fs.writeFile(DB_FILE, JSON.stringify({ candidates: data.candidates }, null, 2), "utf8");
}

export async function getCandidates(userEmail: string): Promise<DbCandidate[]> {
  const db = await readDb();
  // Return all candidates globally so everyone sees the exact same list
  // Sort by uploadedAt descending
  return [...db.candidates].sort(
    (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
  );
}

export async function saveCandidates(userEmail: string, candidates: DbCandidate[]): Promise<void> {
  const db = await readDb();
  db.candidates = candidates;
  await writeDb(db);
}

export async function addCandidate(userEmail: string, candidate: DbCandidate): Promise<void> {
  const db = await readDb();
  // Ensure uploaderEmail is set
  const newCand = { ...candidate, uploaderEmail: userEmail };
  db.candidates.unshift(newCand);
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
  return true;
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
