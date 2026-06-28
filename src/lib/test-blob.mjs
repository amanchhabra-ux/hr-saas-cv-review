import { get, list } from '@vercel/blob';
import dotenv from 'dotenv';
import path from 'path';

// Load env.local
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function check() {
  const targetId = "eb63e1ec-b03c-4d60-b48a-21dd1b0f6f1a";
  const blobs = await list();
  const found = blobs.blobs.find(b => b.pathname.includes(targetId) && b.pathname.includes("preview"));
  if (found) {
    console.log("Found in list:", found.pathname, "URL:", found.url);
    try {
      const res = await get(found.url, { access: 'private', token: process.env.BLOB_READ_WRITE_TOKEN });
      console.log("Result:", res ? `Success` : "null");
    } catch (e) {
      console.error("Failed:", e.message);
    }
  } else {
    console.log("Not found in listing!");
  }
}

check();
