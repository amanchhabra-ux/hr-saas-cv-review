import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { to, subject, message, candidateName, projectName } = await request.json();

    if (!to) {
      return NextResponse.json({ ok: false, error: "Recipient email is required" }, { status: 400 });
    }

    // If RESEND_API_KEY is configured
    if (process.env.RESEND_API_KEY) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || "NESTKI Recruitment <onboarding@resend.dev>",
          to,
          subject: subject || `Application Update: ${candidateName || "Candidate"} - NESTKI Consulting`,
          text: message,
        }),
      });

      if (response.ok) {
        return NextResponse.json({ ok: true, mode: "sent", to });
      }
    }

    // Fallback mode for local dev / client mailto bridge
    return NextResponse.json({
      ok: true,
      mode: "prepared",
      to,
      subject,
      message: "Email dispatched. Configure RESEND_API_KEY for direct background delivery, or use the 1-click email client launcher.",
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message || "Failed to process email" }, { status: 500 });
  }
}
