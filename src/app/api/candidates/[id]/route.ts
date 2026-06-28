import { NextResponse } from "next/server";
import { updateCandidate } from "../../../../lib/db";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { email, changes } = await request.json();
    
    if (!email || !id || !changes) {
      return NextResponse.json({ message: "Email, candidate ID, and changes are required" }, { status: 400 });
    }
    
    const candidate = await updateCandidate(email, id, changes);
    if (!candidate) {
      return NextResponse.json({ message: "Candidate not found" }, { status: 404 });
    }
    
    return NextResponse.json({ success: true, candidate });
  } catch (error) {
    console.error("Failed to update candidate:", error);
    return NextResponse.json({ message: "Server error updating candidate" }, { status: 500 });
  }
}
