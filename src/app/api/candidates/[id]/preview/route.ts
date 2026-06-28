import { NextResponse } from "next/server";
import { getCandidatePreview } from "../../../../../lib/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const previewData = await getCandidatePreview(id);
    if (!previewData) {
      return new Response("Preview not found", { status: 404 });
    }
    
    return new Response(new Uint8Array(previewData.data), {
      headers: {
        "Content-Type": previewData.mimeType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Failed to stream candidate preview:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
