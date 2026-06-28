import { NextResponse } from "next/server";

type NotifyPayload = {
  candidateName: string;
  candidateEmail?: string;
  action: string;
  comments?: string;
  reviewer?: string;
  notifyEmail?: string;
};

const statusLabels: Record<string, string> = {
  accepted: "Accepted",
  accepted_with_comments: "Accepted with comments",
  rejected: "Rejected",
  comments_only: "Comments only",
};

export async function POST(request: Request) {
  const payload = (await request.json()) as NotifyPayload;
  const to = payload.notifyEmail || process.env.NOTIFY_EMAIL;

  if (!to) {
    return NextResponse.json(
      {
        ok: true,
        mode: "preview",
        message:
          "Notification captured. Set NOTIFY_EMAIL and RESEND_API_KEY on Vercel to send email.",
      },
      { status: 202 },
    );
  }

  const subject = `CV review update: ${payload.candidateName} - ${
    statusLabels[payload.action] || payload.action
  }`;
  const text = [
    `Candidate: ${payload.candidateName}`,
    payload.candidateEmail ? `Candidate email: ${payload.candidateEmail}` : "",
    `Action: ${statusLabels[payload.action] || payload.action}`,
    payload.reviewer ? `Reviewer: ${payload.reviewer}` : "",
    payload.comments ? `Comments: ${payload.comments}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      {
        ok: true,
        mode: "preview",
        to,
        subject,
        text,
        message: "Email preview generated. Add RESEND_API_KEY to send through Resend.",
      },
      { status: 202 },
    );
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.NOTIFY_FROM || "ADB CV Review <onboarding@resend.dev>",
      to,
      subject,
      text,
    }),
  });

  if (!response.ok) {
    return NextResponse.json(
      { ok: false, message: "Notification email could not be sent." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, mode: "sent", to });
}
