import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

// Load .env.local and .env
const envLocalPath = path.join(process.cwd(), ".env.local");
const envPath = path.join(process.cwd(), ".env");

if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const accountId = process.env.R2_ACCOUNT_ID?.trim();
const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
const bucketName = process.env.R2_BUCKET_NAME?.trim();

if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
  console.error("\n❌ Cloudflare R2 credentials not found or incomplete in .env.local!");
  console.error("Please ensure the following environment variables are set in .env.local:");
  console.error("  R2_ACCOUNT_ID        = " + (accountId ? "✓ (Set)" : "✗ Missing"));
  console.error("  R2_ACCESS_KEY_ID     = " + (accessKeyId ? "✓ (Set)" : "✗ Missing"));
  console.error("  R2_SECRET_ACCESS_KEY = " + (secretAccessKey ? "✓ (Set)" : "✗ Missing"));
  console.error("  R2_BUCKET_NAME       = " + (bucketName ? `✓ (${bucketName})` : "✗ Missing"));
  console.error("\nAfter adding them to .env.local, re-run: npm run sync:r2\n");
  process.exit(1);
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

async function uploadFile(key, buffer, contentType) {
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });
  await client.send(command);
}

async function runConcurrency(items, limit, fn) {
  const results = [];
  const executing = [];
  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item));
    results.push(p);
    if (limit <= items.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(results);
}

async function main() {
  console.log("🚀 Starting Cloudflare R2 Sync...");
  console.log(`📦 Target Bucket: ${bucketName}`);
  console.log(`🔑 Account ID:    ${accountId.slice(0, 6)}...${accountId.slice(-4)}`);

  const dataDir = path.join(process.cwd(), "data");
  const dbFile = path.join(dataDir, "db.json");
  const filesDir = path.join(dataDir, "files");
  const previewsDir = path.join(dataDir, "previews");

  // 1. Upload db.json
  if (fs.existsSync(dbFile)) {
    console.log("\n📄 Uploading db.json to R2...");
    const dbContent = fs.readFileSync(dbFile);
    await uploadFile("db.json", dbContent, "application/json");
    console.log("✅ db.json uploaded successfully!");
  } else {
    console.warn("⚠️ data/db.json not found, skipping db.json upload.");
  }

  // Load candidate mime types mapping from db.json if available
  let mimeMap = {};
  if (fs.existsSync(dbFile)) {
    try {
      const db = JSON.parse(fs.readFileSync(dbFile, "utf8"));
      if (Array.isArray(db.candidates)) {
        for (const c of db.candidates) {
          mimeMap[c.id] = {
            fileMimeType: c.fileMimeType || "application/octet-stream",
            previewMimeType: c.previewMimeType || "text/html",
          };
        }
      }
    } catch {}
  }

  // 2. Upload candidate files
  if (fs.existsSync(filesDir)) {
    const fileEntries = fs.readdirSync(filesDir).filter((f) => !f.startsWith("."));
    console.log(`\n📁 Uploading ${fileEntries.length} candidate files to R2...`);
    let completed = 0;
    await runConcurrency(fileEntries, 25, async (candidateId) => {
      try {
        const filePath = path.join(filesDir, candidateId);
        const buffer = fs.readFileSync(filePath);
        const mime = mimeMap[candidateId]?.fileMimeType || "application/octet-stream";
        await uploadFile(`candidates/${candidateId}/file`, buffer, mime);
        completed++;
        if (completed % 100 === 0 || completed === fileEntries.length) {
          console.log(`   [Files] ${completed} / ${fileEntries.length} uploaded...`);
        }
      } catch (err) {
        console.error(`   ❌ Failed to upload file for ${candidateId}:`, err.message);
      }
    });
    console.log(`✅ All ${completed} candidate files synced to R2!`);
  }

  // 3. Upload candidate previews
  if (fs.existsSync(previewsDir)) {
    const previewEntries = fs.readdirSync(previewsDir).filter((f) => !f.startsWith("."));
    console.log(`\n👁️  Uploading ${previewEntries.length} candidate previews to R2...`);
    let completed = 0;
    await runConcurrency(previewEntries, 25, async (candidateId) => {
      try {
        const previewPath = path.join(previewsDir, candidateId);
        const buffer = fs.readFileSync(previewPath);
        const mime = mimeMap[candidateId]?.previewMimeType || "text/html";
        await uploadFile(`candidates/${candidateId}/preview`, buffer, mime);
        completed++;
        if (completed % 100 === 0 || completed === previewEntries.length) {
          console.log(`   [Previews] ${completed} / ${previewEntries.length} uploaded...`);
        }
      } catch (err) {
        console.error(`   ❌ Failed to upload preview for ${candidateId}:`, err.message);
      }
    });
    console.log(`✅ All ${completed} candidate previews synced to R2!`);
  }

  console.log("\n🎉 Cloudflare R2 Sync Complete! All files, previews, and database are now live in R2.\n");
}

main().catch((err) => {
  console.error("\n❌ Sync failed with unexpected error:", err);
  process.exit(1);
});
