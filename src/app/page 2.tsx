"use client";

import {
  Bell,
  Check,
  CheckCircle2,
  Download,
  FileText,
  Mail,
  MessageSquare,
  Printer,
  Search,
  Upload,
  X,
} from "lucide-react";
import { ChangeEvent, useMemo, useState } from "react";

type ReviewAction =
  | "accepted"
  | "accepted_with_comments"
  | "rejected"
  | "comments_only";

type Candidate = {
  id: string;
  fileName: string;
  uploadedAt: string;
  name: string;
  proposedPosition: string;
  firmName: string;
  dateOfBirth: string;
  nationality: string;
  email: string;
  phone: string;
  location: string;
  skills: string[];
  experience: string;
  education: string;
  degreeClassification: string;
  professionalMemberships: string;
  otherTraining: string;
  workCountries: string;
  languages: Array<{
    language: string;
    reading: string;
    speaking: string;
    writing: string;
  }>;
  employmentRecord: string;
  tceFormattedCv: string;
  rawText: string;
  parseMethod: string;
  parseWarning: string;
  status: "pending" | ReviewAction;
  comments: string;
  reviewer: string;
  notified: boolean;
};

const sampleSkills = [
  "React",
  "Node",
  "Python",
  "Java",
  "SQL",
  "Excel",
  "Payroll",
  "Recruiting",
  "HRIS",
  "AWS",
  "Salesforce",
  "Communication",
];

const degreePatterns = [
  { label: "Doctorate", pattern: /\b(ph\.?d|doctorate)\b/i },
  { label: "Postgraduate", pattern: /\b(m\.?tech|m\.?e\.?|m\.?sc|mba|mca|masters?|post graduate|pgdm)\b/i },
  { label: "Graduate Engineering", pattern: /\b(b\.?tech|b\.?e\.?|bachelor of engineering|bachelor of technology)\b/i },
  { label: "Graduate", pattern: /\b(b\.?sc|b\.?com|b\.?a\.?|bba|bca|bachelor)\b/i },
  { label: "Diploma", pattern: /\b(diploma|polytechnic|iti)\b/i },
];

const statusLabel: Record<Candidate["status"], string> = {
  pending: "Pending review",
  accepted: "Accepted",
  accepted_with_comments: "Accepted with comments",
  rejected: "Rejected",
  comments_only: "Comments only",
};

function findValue(text: string, labels: string[]) {
  for (const label of labels) {
    const match = text.match(new RegExp(`${label}\\s*[:\\-]?\\s*(.+)`, "i"));
    if (match?.[1]) return match[1].split(/\r?\n/)[0].trim();
  }
  return "";
}

function classifyDegree(text: string) {
  return degreePatterns.find((degree) => degree.pattern.test(text))?.label || "Degree not detected";
}

function buildTceFormat(candidate: Omit<Candidate, "tceFormattedCv">) {
  const languageRows = candidate.languages
    .map(
      (language) =>
        `${language.language}: Reading - ${language.reading}; Speaking - ${language.speaking}; Writing - ${language.writing}`,
    )
    .join("\n");

  return [
    "CURRICULUM VITAE (CV)",
    `PROPOSED POSITION FOR THIS PROJECT: ${candidate.proposedPosition}`,
    "",
    `1. NAME OF THE FIRM: ${candidate.firmName}`,
    `2. NAME OF STAFF: ${candidate.name}`,
    `3. DATE OF BIRTH: ${candidate.dateOfBirth}`,
    `4. NATIONALITY: ${candidate.nationality}`,
    `5. EDUCATION: ${candidate.education}`,
    `   DEGREE CLASSIFICATION: ${candidate.degreeClassification}`,
    `6. MEMBERSHIP OF PROFESSIONAL SOCIETIES: ${candidate.professionalMemberships}`,
    `7. OTHER TRAINING: ${candidate.otherTraining}`,
    `8. COUNTRIES OF WORK EXPERIENCE: ${candidate.workCountries}`,
    "9. LANGUAGES & DEGREE OF PROFICIENCY",
    languageRows,
    "",
    "10. EMPLOYMENT RECORD",
    candidate.employmentRecord,
    "",
    "11. Certification",
    "I, the undersigned, certify that to the best of my knowledge and belief, this biodata correctly describes myself, my qualifications, and my experience. I understand that any wilful misstatement described herein may lead to my disqualification of dismissal, if engaged.",
    "",
    "SIGNATURE:",
    `NAME: ${candidate.name}`,
    "DATE:",
    `PLACE: ${candidate.location}`,
  ].join("\n");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildDocumentBody(candidate: Candidate) {
  const languageRows = candidate.languages
    .map(
      (language) => `
        <tr>
          <td>${escapeHtml(language.language)}</td>
          <td>${escapeHtml(language.reading)}</td>
          <td>${escapeHtml(language.speaking)}</td>
          <td>${escapeHtml(language.writing)}</td>
        </tr>`,
    )
    .join("");

  return `
      <h1>CURRICULUM VITAE (CV)</h1>
      <h2>PROPOSED POSITION FOR THIS PROJECT: ${escapeHtml(candidate.proposedPosition)}</h2>
      <div class="field"><span class="number">1.</span><span class="label">Name of the Firm</span><span>${escapeHtml(candidate.firmName)}</span></div>
      <div class="field"><span class="number">2.</span><span class="label">Name of Staff</span><span>${escapeHtml(candidate.name)}</span></div>
      <div class="field"><span class="number">3.</span><span class="label">Date of Birth</span><span>${escapeHtml(candidate.dateOfBirth)}</span></div>
      <div class="field"><span class="number">4.</span><span class="label">Nationality</span><span>${escapeHtml(candidate.nationality)}</span></div>
      <div class="field"><span class="number">5.</span><span class="label">Education</span><span>${escapeHtml(candidate.education)}<br/><strong>Degree classification:</strong> ${escapeHtml(candidate.degreeClassification)}</span></div>
      <div class="field"><span class="number">6.</span><span class="label">Membership of Professional Societies</span><span>${escapeHtml(candidate.professionalMemberships)}</span></div>
      <div class="field"><span class="number">7.</span><span class="label">Other Training</span><span>${escapeHtml(candidate.otherTraining)}</span></div>
      <div class="field"><span class="number">8.</span><span class="label">Countries of Work Experience</span><span>${escapeHtml(candidate.workCountries)}</span></div>
      <p class="sectionTitle">9. Languages &amp; Degree of Proficiency</p>
      <table>
        <thead><tr><th>Language</th><th>Reading</th><th>Speaking</th><th>Writing</th></tr></thead>
        <tbody>${languageRows}</tbody>
      </table>
      <p class="sectionTitle">10. Employment Record</p>
      <table>
        <tbody>
          <tr><th style="width: 28%">Period / Employer</th><td class="employment">${escapeHtml(candidate.employmentRecord)}</td></tr>
        </tbody>
      </table>
      <p class="sectionTitle">11. Certification</p>
      <p class="certification">I, the undersigned, certify that to the best of my knowledge and belief, this biodata correctly describes myself, my qualifications, and my experience. I understand that any wilful misstatement described herein may lead to my disqualification of dismissal, if engaged.</p>
      <div class="signature">
        <span>SIGNATURE:</span>
        <span>NAME: ${escapeHtml(candidate.name)}</span>
        <span>DATE:</span>
        <span>PLACE: ${escapeHtml(candidate.location)}</span>
      </div>
    `;
}

function buildDocumentHtml(candidate: Candidate) {
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(candidate.name)} - TCE CV</title>
      <style>
        @page { size: A4; margin: 18mm; }
        body { color: #111827; font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.35; margin: 0; }
        h1 { font-size: 16pt; margin: 0 0 8pt; text-align: center; text-decoration: underline; }
        h2 { font-size: 11pt; margin: 0 0 14pt; text-align: center; }
        table { border-collapse: collapse; margin: 8pt 0 12pt; table-layout: fixed; width: 100%; }
        th, td { border: 1px solid #111827; padding: 6pt; vertical-align: top; }
        th { background: #eef2f7; font-weight: 700; text-align: left; }
        .field { display: grid; grid-template-columns: 28pt 1fr 2.2fr; margin: 0 0 8pt; }
        .number { font-weight: 700; }
        .label { font-weight: 700; text-transform: uppercase; }
        .sectionTitle { font-weight: 700; margin-top: 10pt; text-transform: uppercase; }
        .employment { white-space: pre-wrap; }
        .certification { margin-top: 12pt; text-align: justify; }
        .signature { display: grid; gap: 6pt; margin-top: 24pt; width: 48%; }
      </style>
    </head>
    <body>${buildDocumentBody(candidate)}</body>
  </html>`;
}

function downloadWordDocument(candidate: Candidate) {
  const blob = new Blob([buildDocumentHtml(candidate)], {
    type: "application/msword;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${candidate.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-tce-cv.doc`;
  link.click();
  URL.revokeObjectURL(url);
}

function printDocument(candidate: Candidate) {
  const printWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!printWindow) return;
  printWindow.document.write(buildDocumentHtml(candidate));
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function normalizeCv(
  fileName: string,
  text: string,
  parseMethod = "browser-fallback",
  parseWarning = "",
): Candidate {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
  const phone = text.match(/(\+?\d[\d\s().-]{8,}\d)/)?.[0] || "";
  const skillMatches = sampleSkills.filter((skill) =>
    new RegExp(`\\b${skill}\\b`, "i").test(text),
  );
  const name =
    findValue(text, ["name of staff", "candidate name", "name"]) ||
    lines.find((line) => !line.includes("@") && !/\d{4,}/.test(line)) ||
    fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
  const dateOfBirth =
    findValue(text, ["date of birth", "dob", "birth date"]) ||
    text.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/)?.[0] ||
    "Not specified";
  const nationality = findValue(text, ["nationality"]) || "Not specified";
  const location =
    lines.find((line) => /location|city|based in|address/i.test(line))?.replace(/^(location|city|address):\s*/i, "") ||
    "Not specified";
  const experience =
    lines.find((line) => /experience|years|worked|employment/i.test(line)) ||
    "To be confirmed during screening";
  const education =
    lines.find((line) => /education|degree|university|college|bachelor|master/i.test(line)) ||
    "Not specified";
  const degreeClassification = classifyDegree(`${education}\n${text}`);
  const proposedPosition =
    findValue(text, ["proposed position", "position applied", "role", "designation"]) ||
    "To be mapped by recruiter";
  const languages = [
    {
      language: "English",
      reading: /\benglish\b/i.test(text) ? "Good" : "To be confirmed",
      speaking: /\benglish\b/i.test(text) ? "Good" : "To be confirmed",
      writing: /\benglish\b/i.test(text) ? "Good" : "To be confirmed",
    },
    {
      language: "Hindi",
      reading: /\bhindi\b/i.test(text) ? "Good" : "To be confirmed",
      speaking: /\bhindi\b/i.test(text) ? "Good" : "To be confirmed",
      writing: /\bhindi\b/i.test(text) ? "Good" : "To be confirmed",
    },
    {
      language: "Marathi/Telugu etc.",
      reading: "To be confirmed",
      speaking: "To be confirmed",
      writing: "To be confirmed",
    },
  ];
  const employmentRecord = [
    `Period: ${experience}`,
    "Employer: To be confirmed from CV",
    "Positions held and Description of Duties",
    `Name of Project: ${findValue(text, ["project", "project name"]) || "Not specified"}`,
    `Location: ${location}`,
    "Client: Not specified",
    "Major Features Of the project: Not specified",
    `Position Held: ${proposedPosition}`,
    "Responsibilities: To be reviewed from uploaded CV",
  ].join("\n");

  const candidateWithoutFormat: Omit<Candidate, "tceFormattedCv"> = {
    id: crypto.randomUUID(),
    fileName,
    uploadedAt: new Date().toISOString(),
    name,
    proposedPosition,
    firmName: findValue(text, ["name of the firm", "firm", "current company", "company"]) || "TATA Consulting Engineers Limited",
    dateOfBirth,
    nationality,
    email,
    phone,
    location,
    skills: skillMatches.length ? skillMatches : ["Screening required"],
    experience,
    education,
    degreeClassification,
    professionalMemberships:
      findValue(text, ["membership of professional societies", "professional memberships", "memberships"]) ||
      "Not specified",
    otherTraining:
      findValue(text, ["other training", "training", "certifications", "certification"]) ||
      "Not specified",
    workCountries:
      findValue(text, ["countries of work experience", "work countries", "country experience"]) ||
      (/\bindia\b/i.test(text) ? "India" : "Not specified"),
    languages,
    employmentRecord,
    rawText: text,
    parseMethod,
    parseWarning,
    status: "pending",
    comments: "",
    reviewer: "",
    notified: false,
  };

  return {
    ...candidateWithoutFormat,
    tceFormattedCv: buildTceFormat(candidateWithoutFormat),
  };
}

export default function Home() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [notifyEmail, setNotifyEmail] = useState("");
  const [toast, setToast] = useState("");
  const [isSending, setIsSending] = useState(false);

  const filtered = useMemo(
    () =>
      candidates.filter((candidate) =>
        [
          candidate.name,
          candidate.email,
          candidate.fileName,
          candidate.status,
          candidate.degreeClassification,
          candidate.education,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [candidates, query],
  );
  const selected = candidates.find((candidate) => candidate.id === selectedId) || candidates[0];

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));

    let uploaded: Candidate[];
    try {
      const response = await fetch("/api/parse-cv", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("CV parsing failed");
      const data = (await response.json()) as {
        parsed: Array<{ fileName: string; text: string; method?: string; warning?: string }>;
      };
      uploaded = data.parsed.map((file) =>
        normalizeCv(file.fileName, file.text || file.fileName, file.method, file.warning),
      );
    } catch {
      uploaded = await Promise.all(
        files.map(async (file) => {
          const text = await file.text().catch(() => "");
          return normalizeCv(
            file.name,
            text || file.name,
            "browser-fallback",
            text ? "" : "Browser fallback could not read this file.",
          );
        }),
      );
    }
    setCandidates((current) => [...uploaded, ...current]);
    setSelectedId(uploaded[0]?.id || selectedId);
    setToast(`${uploaded.length} CV${uploaded.length === 1 ? "" : "s"} converted to TCE format`);
    event.target.value = "";
  }

  function updateSelected(changes: Partial<Candidate>) {
    if (!selected) return;
    setCandidates((current) =>
      current.map((candidate) =>
        candidate.id === selected.id ? { ...candidate, ...changes } : candidate,
      ),
    );
  }

  async function submitAction(action: ReviewAction) {
    if (!selected) return;
    setIsSending(true);
    const next = { ...selected, status: action, notified: true };
    setCandidates((current) =>
      current.map((candidate) => (candidate.id === selected.id ? next : candidate)),
    );

    const response = await fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidateName: next.name,
        candidateEmail: next.email,
        action,
        comments: next.comments,
        reviewer: next.reviewer,
        notifyEmail,
      }),
    });
    const result = await response.json();
    setIsSending(false);
    setToast(result.mode === "sent" ? "Notification email sent" : result.message);
  }

  return (
    <main className="shell">
      <section className="sidebar" aria-label="Candidate queue">
        <div className="brand">
          <div className="brandMark">A</div>
          <div>
            <h1>TCE CV Review</h1>
            <p>Candidate intake, TCE formatting, and decisions</p>
          </div>
        </div>

        <label className="uploadBox">
          <Upload size={22} />
          <span>Upload CV files</span>
          <small>PDF, DOC, DOCX, TXT, or readable CV files</small>
          <input
            accept=".pdf,.doc,.docx,.txt,.rtf,.md"
            multiple
            onChange={handleUpload}
            type="file"
          />
        </label>

        <label className="field">
          <span>Notification email</span>
          <div className="inputIcon">
            <Mail size={16} />
            <input
              autoComplete="email"
              onBlur={(event) => setNotifyEmail(event.target.value.trim())}
              onChange={(event) => setNotifyEmail(event.target.value)}
              placeholder="client@example.com"
              type="email"
              value={notifyEmail}
            />
          </div>
        </label>

        <div className="search">
          <Search size={16} />
          <input
            aria-label="Search candidates"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search queue"
            value={query}
          />
        </div>

        <div className="queue">
          {filtered.map((candidate) => (
            <button
              className={`candidateRow ${selected?.id === candidate.id ? "active" : ""}`}
              key={candidate.id}
              onClick={() => setSelectedId(candidate.id)}
            >
              <FileText size={18} />
              <span>
                <strong>{candidate.name}</strong>
                <small>{candidate.degreeClassification} · {statusLabel[candidate.status]}</small>
              </span>
            </button>
          ))}
          {!filtered.length && <p className="empty">No CVs in the review queue yet.</p>}
        </div>
      </section>

      <section className="workspace">
        <div className="topbar">
          <div>
            <p className="eyebrow">Customer Review Console</p>
            <h2>{selected ? selected.name : "Upload CVs to begin"}</h2>
          </div>
          <div className="metric">
            <CheckCircle2 size={18} />
            {candidates.filter((candidate) => candidate.status !== "pending").length}/
            {candidates.length} reviewed
          </div>
        </div>

        {selected ? (
          <div className="reviewGrid">
            <article className="panel adb">
              <div className="panelHeader">
                <h3>TCE Format CV</h3>
                <span className={`badge ${selected.status}`}>{statusLabel[selected.status]}</span>
              </div>
              <dl className="profile">
                <div>
                  <dt>Candidate</dt>
                  <dd>{selected.name}</dd>
                </div>
                <div>
                  <dt>Proposed position</dt>
                  <dd>{selected.proposedPosition}</dd>
                </div>
                <div>
                  <dt>Degree classification</dt>
                  <dd>{selected.degreeClassification}</dd>
                </div>
                <div>
                  <dt>Firm</dt>
                  <dd>{selected.firmName}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{selected.email || "Not detected"}</dd>
                </div>
                <div>
                  <dt>Phone</dt>
                  <dd>{selected.phone || "Not detected"}</dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>{selected.location}</dd>
                </div>
                <div>
                  <dt>Experience</dt>
                  <dd>{selected.experience}</dd>
                </div>
                <div>
                  <dt>Education</dt>
                  <dd>{selected.education}</dd>
                </div>
                <div>
                  <dt>Reader</dt>
                  <dd>{selected.parseMethod}</dd>
                </div>
              </dl>
              {selected.parseWarning && (
                <p className="parseWarning">{selected.parseWarning}</p>
              )}
              <div className="skills">
                {selected.skills.map((skill) => (
                  <span key={skill}>{skill}</span>
                ))}
              </div>
              <div className="documentToolbar">
                <button onClick={() => downloadWordDocument(selected)} type="button">
                  <Download size={16} /> Word
                </button>
                <button onClick={() => printDocument(selected)} type="button">
                  <Printer size={16} /> PDF
                </button>
              </div>
              <div className="documentViewport" aria-label="Converted TCE CV document preview">
                <div
                  className="documentPage"
                  dangerouslySetInnerHTML={{ __html: buildDocumentBody(selected) }}
                />
              </div>
            </article>

            <aside className="panel decision">
              <div className="panelHeader">
                <h3>Customer Action</h3>
                {selected.notified && (
                  <span className="notified">
                    <Bell size={14} /> Notified
                  </span>
                )}
              </div>
              <label className="field">
                <span>Reviewer name</span>
                <input
                  onChange={(event) => updateSelected({ reviewer: event.target.value })}
                  placeholder="Customer reviewer"
                  value={selected.reviewer}
                />
              </label>
              <label className="field">
                <span>Comments</span>
                <textarea
                  onChange={(event) => updateSelected({ comments: event.target.value })}
                  placeholder="Add customer comments or rejection reason"
                  value={selected.comments}
                />
              </label>
              <div className="actions">
                <button onClick={() => submitAction("accepted")} type="button">
                  <Check size={17} /> Accept
                </button>
                <button onClick={() => submitAction("accepted_with_comments")} type="button">
                  <MessageSquare size={17} /> Accept with comments
                </button>
                <button onClick={() => submitAction("comments_only")} type="button">
                  <MessageSquare size={17} /> Comments only
                </button>
                <button className="danger" onClick={() => submitAction("rejected")} type="button">
                  <X size={17} /> Reject
                </button>
              </div>
              {isSending && <p className="sending">Sending notification...</p>}
            </aside>
          </div>
        ) : (
          <div className="blankState">
            <FileText size={42} />
            <h2>Upload CVs and review them in one place</h2>
            <p>Each upload is converted into the attached TCE CV format and classified by degree.</p>
          </div>
        )}
      </section>

      {toast && (
        <button className="toast" onClick={() => setToast("")} type="button">
          {toast}
        </button>
      )}
    </main>
  );
}
