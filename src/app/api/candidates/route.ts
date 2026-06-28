import { NextResponse } from "next/server";
import { getCandidates, addCandidate, readDb } from "../../../lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");
    
    if (!email) {
      return NextResponse.json({ message: "Unauthorized. Email is required" }, { status: 401 });
    }
    
    const lowerEmail = email.toLowerCase();
    const isAdmin = lowerEmail === "admin@cvreview.com";
    
    if (isAdmin) {
      const db = await readDb();
      const allCandidates = Object.values(db.users).flat();
      allCandidates.sort(
        (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
      );
      return NextResponse.json({ candidates: allCandidates });
    } else {
      const db = await readDb();
      const userCandidates = db.users[lowerEmail] || [];
      const adminCandidates = db.users["admin@cvreview.com"] || [];
      const combined = [...userCandidates, ...adminCandidates];
      combined.sort(
        (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
      );
      return NextResponse.json({ candidates: combined });
    }
  } catch (error) {
    console.error("Failed to fetch candidates:", error);
    return NextResponse.json({ message: "Server error fetching candidates" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { email, candidate } = await request.json();
    if (!email || !candidate) {
      return NextResponse.json({ message: "Email and candidate data are required" }, { status: 400 });
    }
    
    await addCandidate(email, candidate);
    return NextResponse.json({ success: true, candidate });
  } catch (error) {
    console.error("Failed to add candidate:", error);
    return NextResponse.json({ message: "Server error adding candidate" }, { status: 500 });
  }
}
