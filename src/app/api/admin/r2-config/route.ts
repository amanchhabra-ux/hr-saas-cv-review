import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const authHeader = request.headers.get("x-sync-key");
  if (authHeader !== "sync-r2-now-secret-987123") {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  return NextResponse.json({
    accountId: process.env.R2_ACCOUNT_ID || "",
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
    bucketName: process.env.R2_BUCKET_NAME || "",
  });
}
