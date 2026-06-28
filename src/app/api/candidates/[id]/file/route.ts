import { NextResponse } from "next/server";
import { getCandidateFile } from "../../../../../lib/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const fileData = await getCandidateFile(id);
    if (!fileData) {
      return new Response("File not found", { status: 404 });
    }
    
    return new Response(new Uint8Array(fileData.data), {
      headers: {
        "Content-Type": fileData.mimeType,
        "Content-Disposition": "inline",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Failed to stream candidate file:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
