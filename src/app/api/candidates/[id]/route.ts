import { NextResponse } from "next/server";
import { updateCandidate, deleteCandidate } from "../../../../lib/db";

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

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");
    
    // Only admin can delete candidates
    if (!email || email.toLowerCase() !== "admin@cvreview.com") {
      return NextResponse.json({ message: "Only admin can delete candidates" }, { status: 403 });
    }
    
    const deleted = await deleteCandidate(id);
    if (!deleted) {
      return NextResponse.json({ message: "Candidate not found" }, { status: 404 });
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete candidate:", error);
    return NextResponse.json({ message: "Server error deleting candidate" }, { status: 500 });
  }
}
