"use client";

import {
  Bell,
  Check,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Mail,
  MessageSquare,
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
  displayName: string;
  email: string;
  fileType: string;
  objectUrl: string;
  previewUrl: string;
  previewMethod: string;
  rawText: string;
  parseMethod: string;
  parseWarning: string;
  status: "pending" | ReviewAction;
  comments: string;
  reviewer: string;
  notified: boolean;
  discipline: "Electrical" | "Civil" | "Mechanical" | "Planning" | "HSE" | "General";
};

const statusLabel: Record<Candidate["status"], string> = {
  pending: "Pending review",
  accepted: "Accepted",
  accepted_with_comments: "Accepted with comments",
  rejected: "Rejected",
  comments_only: "Comments only",
};

function getDisplayName(fileName: string, text: string) {
  const ignoredKeywords = new Set([
    "curriculum vitae",
    "curriculum",
    "vitae",
    "cv",
    "resume",
    "bio-data",
    "biodata",
    "profile",
    "summary",
    "contact",
    "personal",
    "details",
    "info",
    "information",
    "about me",
    "experience",
    "education",
    "skills",
    "page",
    "candidate",
    "applicant",
    "phone",
    "email",
    "mobile",
    "address",
  ]);

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  // Scan the first 15 lines of text
  for (const line of lines.slice(0, 15)) {
    // Basic checks
    if (line.includes("@")) continue;
    if (/\d{4,}/.test(line)) continue;
    if (line.length < 3 || line.length > 40) continue;

    // Check against ignored keywords
    const lower = line.toLowerCase();
    const words = lower.split(/[^a-z]+/);
    const hasIgnoredKeyword = words.some((word) => ignoredKeywords.has(word));
    if (hasIgnoredKeyword) continue;

    // A candidate's name should typically contain only letters, spaces, dots, or hyphens
    if (/^[a-zA-Z.\s-]+$/.test(line)) {
      // Clean extra spaces and return
      return line.replace(/\s+/g, " ");
    }
  }

  // Fallback to cleaned filename
  return fileName
    .replace(/\.[^.]+$/, "") // remove extension
    .replace(/[_-]+/g, " ") // replace underscores/hyphens with spaces
    .replace(/\s*cv\s*/gi, " ") // remove "cv" / "CV" case insensitively
    .replace(/\s*resume\s*/gi, " ") // remove "resume" case insensitively
    .replace(/\s+/g, " ") // collapse spaces
    .trim();
}

function getEmail(text: string) {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
}

function detectDiscipline(fileName: string, text: string): Candidate["discipline"] {
  const fileAndText = `${fileName} ${text}`.toLowerCase();
  
  if (/\b(electrical|electricity|electrician|electronics|power\s+systems|telecom|scada)\b/.test(fileAndText)) {
    return "Electrical";
  }
  if (/\b(civil|structural|concrete|geotechnical|construction\s+engineering|foundation|steel\s+structures)\b/.test(fileAndText)) {
    return "Civil";
  }
  if (/\b(mechanical|mechnical|hvac|piping|thermodynamics|automotive|rotary|static\s+equipment|plumbing)\b/.test(fileAndText)) {
    return "Mechanical";
  }
  if (/\b(planning|planner|scheduler|scheduling|primavera|msp|project\s+control|delay\s+analysis)\b/.test(fileAndText)) {
    return "Planning";
  }
  if (/\b(hse|safety\s+officer|health\s+safety|environment|environmental|safety\s+engineer|osha|nebosh|hazard|risk\s+assessment)\b/.test(fileAndText)) {
    return "HSE";
  }
  
  return "General";
}

function downloadOriginal(candidate: Candidate) {
  const link = document.createElement("a");
  link.href = candidate.objectUrl;
  link.download = candidate.fileName;
  link.click();
}

function openOriginal(candidate: Candidate) {
  window.open(candidate.objectUrl, "_blank", "noopener,noreferrer");
}

function base64ToObjectUrl(base64: string, mimeType: string) {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

export default function Home() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [selectedDiscipline, setSelectedDiscipline] = useState<
    "All" | "Electrical" | "Civil" | "Mechanical" | "Planning" | "HSE"
  >("All");
  const [notifyEmail, setNotifyEmail] = useState("");
  const [toast, setToast] = useState("");
  const [isSending, setIsSending] = useState(false);

  const filtered = useMemo(
    () =>
      candidates.filter((candidate) => {
        const matchesSearch = [
          candidate.displayName,
          candidate.email,
          candidate.fileName,
          candidate.fileType,
          candidate.status,
          candidate.discipline,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase());

        const matchesDiscipline =
          selectedDiscipline === "All" || candidate.discipline === selectedDiscipline;

        return matchesSearch && matchesDiscipline;
      }),
    [candidates, query, selectedDiscipline],
  );
  const selected = candidates.find((candidate) => candidate.id === selectedId) || candidates[0];

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));

    let parsed: Array<{ fileName: string; text: string; method?: string; warning?: string }> = [];
    let rendered: Array<{
      fileName: string;
      base64: string;
      mimeType: string;
      method?: string;
      warning?: string;
    }> = [];
    try {
      const [parseResponse, renderResults] = await Promise.all([
        fetch("/api/parse-cv", {
          method: "POST",
          body: formData,
        }),
        Promise.all(
          files.map(async (file) => {
            const singleFileData = new FormData();
            singleFileData.append("file", file);
            const response = await fetch("/api/render-cv", {
              method: "POST",
              body: singleFileData,
            });
            return response.json();
          }),
        ),
      ]);
      if (!parseResponse.ok) throw new Error("CV parsing failed");
      const data = (await parseResponse.json()) as {
        parsed: Array<{ fileName: string; text: string; method?: string; warning?: string }>;
      };
      parsed = data.parsed;
      rendered = renderResults as typeof rendered;
    } catch {
      parsed = await Promise.all(
        files.map(async (file) => ({
          fileName: file.name,
          text: await file.text().catch(() => ""),
          method: "browser-fallback",
          warning: "The server reader could not parse this CV.",
        })),
      );
      rendered = [];
    }

    const uploaded = files.map((file) => {
      const parsedFile = parsed.find((item) => item.fileName === file.name);
      const renderedFile = rendered.find(
        (item) =>
          item.fileName === file.name ||
          item.fileName === `${file.name.replace(/\.[^.]+$/, "")}.pdf` ||
          item.fileName === `${file.name.replace(/\.[^.]+$/, "")}.html`,
      );
      const text = parsedFile?.text || "";
      const originalUrl = URL.createObjectURL(file);
      const previewUrl = renderedFile?.base64
        ? base64ToObjectUrl(renderedFile.base64, renderedFile.mimeType)
        : originalUrl;
      return {
        id: crypto.randomUUID(),
        fileName: file.name,
        uploadedAt: new Date().toISOString(),
        displayName: getDisplayName(file.name, text),
        email: getEmail(text),
        fileType: file.type || file.name.split(".").pop()?.toUpperCase() || "Unknown",
        objectUrl: originalUrl,
        previewUrl,
        previewMethod: renderedFile?.method || "original-file",
        rawText: text,
        parseMethod: parsedFile?.method || "original-file",
        parseWarning: renderedFile?.warning || parsedFile?.warning || "",
        status: "pending" as const,
        comments: "",
        reviewer: "",
        notified: false,
        discipline: detectDiscipline(file.name, text),
      };
    });

    setCandidates((current) => [...uploaded, ...current]);
    setSelectedId(uploaded[0]?.id || selectedId);
    setToast(`${uploaded.length} CV${uploaded.length === 1 ? "" : "s"} uploaded for review`);
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
        candidateName: next.displayName,
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
          <div className="brandMark">C</div>
          <div>
            <h1>CV Review</h1>
            <p>Upload, view original CVs, and record decisions</p>
          </div>
        </div>

        <label className="uploadBox">
          <Upload size={22} />
          <span>Upload CV files</span>
          <small>PDF, DOC, DOCX, TXT, RTF, or MD</small>
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

        <div className="disciplineFilters" aria-label="Discipline filters">
          {(["All", "Electrical", "Civil", "Mechanical", "Planning", "HSE"] as const).map((discipline) => (
            <button
              key={discipline}
              onClick={() => setSelectedDiscipline(discipline)}
              className={`filterPill ${selectedDiscipline === discipline ? "active" : ""}`}
              type="button"
            >
              {discipline}
            </button>
          ))}
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
                <strong>{candidate.displayName}</strong>
                <small>{candidate.fileName} · {statusLabel[candidate.status]}</small>
                <span className={`badge ${candidate.discipline.toLowerCase()}`}>
                  {candidate.discipline}
                </span>
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
            <h2>{selected ? selected.displayName : "Upload CVs to begin"}</h2>
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
                <h3>Original CV</h3>
                <span className={`badge ${selected.status}`}>{statusLabel[selected.status]}</span>
              </div>
              {selected.parseWarning && (
                <p className="parseWarning">{selected.parseWarning}</p>
              )}
              <div className="cvViewer" aria-label="Original CV preview">
                {selected.previewUrl && (selected.previewMethod.includes("pdf") || selected.previewUrl !== selected.objectUrl) ? (
                  <iframe className="pdfFrame" src={selected.previewUrl} title={selected.fileName} />
                ) : selected.rawText ? (
                  <pre className="originalText">{selected.rawText}</pre>
                ) : (
                  <div className="blankState compact">
                    <FileText size={34} />
                    <h2>Preview unavailable</h2>
                    <p>Open or download the original file to review it.</p>
                  </div>
                )}
              </div>
              <div className="documentToolbar" style={{ marginTop: "16px" }}>
                <button onClick={() => openOriginal(selected)} type="button">
                  <ExternalLink size={16} /> Open
                </button>
                <button onClick={() => downloadOriginal(selected)} type="button">
                  <Download size={16} /> Download
                </button>
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
            <p>Each upload is displayed as the original CV without converting it into another format.</p>
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
