import { NextResponse } from "next/server";
import { getProjects, addProject } from "../../../lib/db";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const projects = await getProjects();
    return NextResponse.json({ projects });
  } catch (error) {
    console.error("Failed to fetch projects:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { project } = await request.json();
    if (!project) {
      return NextResponse.json({ message: "Project name is required" }, { status: 400 });
    }
    const projects = await addProject(project);
    return NextResponse.json({ success: true, projects });
  } catch (error) {
    console.error("Failed to add project:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
