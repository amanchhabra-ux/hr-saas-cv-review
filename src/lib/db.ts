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
}

interface DbData {
  users: Record<string, DbCandidate[]>;
}

const otpRegistry: Record<string, { otp: string; expires: number }> = {};

async function ensureDb() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
      await fs.access(DB_FILE);
    } catch {
      await fs.writeFile(DB_FILE, JSON.stringify({ users: {} }, null, 2), "utf8");
    }
  } catch (e) {
    console.error("Failed to initialize database:", e);
  }
}

export async function readDb(): Promise<DbData> {
  await ensureDb();
  try {
    const content = await fs.readFile(DB_FILE, "utf8");
    return JSON.parse(content) as DbData;
  } catch {
    return { users: {} };
  }
}

export async function writeDb(data: DbData): Promise<void> {
  await ensureDb();
  await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2), "utf8");
}

export async function getCandidates(userEmail: string): Promise<DbCandidate[]> {
  const db = await readDb();
  return db.users[userEmail.toLowerCase()] || [];
}

export async function saveCandidates(userEmail: string, candidates: DbCandidate[]): Promise<void> {
  const db = await readDb();
  db.users[userEmail.toLowerCase()] = candidates;
  await writeDb(db);
}

export async function addCandidate(userEmail: string, candidate: DbCandidate): Promise<void> {
  const candidates = await getCandidates(userEmail);
  candidates.unshift(candidate);
  await saveCandidates(userEmail, candidates);
}

export async function updateCandidate(
  userEmail: string,
  candidateId: string,
  changes: Partial<DbCandidate>,
): Promise<DbCandidate | null> {
  const db = await readDb();
  const lowerEmail = userEmail.toLowerCase();
  const isAdmin = lowerEmail === "admin@cvreview.com";
  
  let updated: DbCandidate | null = null;
  
  if (isAdmin) {
    for (const email of Object.keys(db.users)) {
      const list = db.users[email];
      const index = list.findIndex((c) => c.id === candidateId);
      if (index !== -1) {
        updated = { ...list[index], ...changes };
        list[index] = updated;
        db.users[email] = list;
        break;
      }
    }
  } else {
    const list = db.users[lowerEmail] || [];
    const index = list.findIndex((c) => c.id === candidateId);
    if (index !== -1) {
      updated = { ...list[index], ...changes };
      list[index] = updated;
      db.users[lowerEmail] = list;
    }
  }
  
  if (updated) {
    await writeDb(db);
  }
  return updated;
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
