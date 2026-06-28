import { get } from '@vercel/blob';
import dotenv from 'dotenv';
import path from 'path';

// Load env.local
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function testFetchDb() {
  try {
    const res = await get('db.json', { access: 'private', token: process.env.BLOB_READ_WRITE_TOKEN });
    if (res && res.stream) {
      const chunks = [];
      for await (const chunk of res.stream) {
        chunks.push(chunk);
      }
      const content = Buffer.concat(chunks).toString("utf8");
      const parsed = JSON.parse(content);
      console.log("Fetch success! Candidates count:", parsed.candidates?.length);
    } else {
      console.log("Stream not found in res.");
    }
  } catch (e) {
    console.log("get() failed:", e.message);
  }
}

testFetchDb();
