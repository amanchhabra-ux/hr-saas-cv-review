import { NextResponse } from "next/server";
import { getCandidates, getProjects } from "../../../lib/db";

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");
    
    if (!email) {
      return NextResponse.json({ message: "Unauthorized. Email is required" }, { status: 401 });
    }
    
    const candidates = await getCandidates(email);
    const projects = await getProjects();
    return NextResponse.json({ candidates, projects });
  } catch (error) {
    console.error("Failed to fetch candidates:", error);
    return NextResponse.json({ message: "Server error fetching candidates" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { email, candidate, candidates } = await request.json();
    if (!email) {
      return NextResponse.json({ message: "Email is required" }, { status: 400 });
    }
    
    if (candidates && Array.isArray(candidates)) {
      const { addCandidates } = await import('../../../lib/db');
      await addCandidates(email, candidates);
      return NextResponse.json({ success: true, count: candidates.length });
    } else if (candidate) {
      const { addCandidates } = await import('../../../lib/db');
      await addCandidates(email, [candidate]);
      return NextResponse.json({ success: true, candidate });
    }
    
    return NextResponse.json({ message: "Candidate data required" }, { status: 400 });
  } catch (error) {
    console.error("Failed to add candidate(s):", error);
    return NextResponse.json({ message: "Server error adding candidate" }, { status: 500 });
  }
}
