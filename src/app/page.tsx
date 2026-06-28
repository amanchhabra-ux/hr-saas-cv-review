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
  Trash2,
  Upload,
  X,
} from "lucide-react";
import React, { ChangeEvent, useMemo, useState, useEffect, useRef } from "react";

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
  fileBase64?: string;
  fileMimeType?: string;
  previewBase64?: string;
  previewMimeType?: string;
  uploaderEmail?: string;
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
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [enteredOtp, setEnteredOtp] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [authError, setAuthError] = useState("");
  const [loadingAuth, setLoadingAuth] = useState(false);

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [selectedDiscipline, setSelectedDiscipline] = useState<
    "All" | "Electrical" | "Civil" | "Mechanical" | "Planning" | "HSE"
  >("All");
  const [toast, setToast] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Load user session on start
  useEffect(() => {
    const saved = localStorage.getItem("user_email");
    if (saved) {
      setUserEmail(saved);
      fetchCandidates(saved);
    }
  }, []);

  async function fetchCandidates(email: string) {
    try {
      const res = await fetch(`/api/candidates?email=${encodeURIComponent(email)}`);
      if (res.ok) {
        const data = await res.json();
        const loaded = (data.candidates as Candidate[]).map((c) => {
          const objectUrl = c.fileBase64 
            ? base64ToObjectUrl(c.fileBase64, c.fileMimeType || "application/octet-stream")
            : "";
          const previewUrl = c.previewBase64
            ? base64ToObjectUrl(c.previewBase64, c.previewMimeType || "text/html")
            : objectUrl;
          return {
            ...c,
            objectUrl,
            previewUrl,
          };
        });
        setCandidates(loaded);
        if (loaded.length > 0) {
          setSelectedId(loaded[0].id);
        }
      }
    } catch (e) {
      console.error("Failed to load candidates", e);
    }
  }

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
          candidate.uploaderEmail || "",
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

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    setLoadingAuth(true);

    if (!otpSent) {
      try {
        const res = await fetch("/api/auth/send-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: loginEmail.trim() }),
        });
        const data = await res.json();
        if (res.ok) {
          setOtpSent(true);
          setDevOtp(data.otp || null);
          setToast("OTP sent successfully!");
        } else {
          setAuthError(data.message || "Failed to send OTP");
        }
      } catch (err) {
        setAuthError("Network error. Please try again.");
      }
    } else {
      try {
        const res = await fetch("/api/auth/verify-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: loginEmail.trim(), otp: enteredOtp.trim() }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          localStorage.setItem("user_email", data.email);
          setUserEmail(data.email);
          fetchCandidates(data.email);
          setToast("Logged in successfully!");
        } else {
          setAuthError(data.message || "Invalid or expired OTP");
        }
      } catch (err) {
        setAuthError("Network error. Please try again.");
      }
    }
    setLoadingAuth(false);
  }

  function handleLogout() {
    localStorage.removeItem("user_email");
    setUserEmail(null);
    setCandidates([]);
    setSelectedId("");
    setLoginEmail("");
    setOtpSent(false);
    setEnteredOtp("");
    setDevOtp(null);
    setToast("Logged out successfully");
  }

  async function handleDeleteCandidate(candidateId: string) {
    if (!userEmail || userEmail.toLowerCase() !== "admin@cvreview.com") return;
    if (!confirm("Are you sure you want to remove this CV?")) return;
    try {
      const res = await fetch(
        `/api/candidates/${candidateId}?email=${encodeURIComponent(userEmail)}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        setCandidates((cur) => cur.filter((c) => c.id !== candidateId));
        if (selectedId === candidateId) {
          setSelectedId("");
        }
        setToast("CV removed successfully");
      } else {
        const data = await res.json();
        setToast(data.message || "Failed to remove CV");
      }
    } catch {
      setToast("Network error removing CV");
    }
  }

  // Admin notifications: collect all reviewed CVs by non-admin users
  const adminNotifications = useMemo(() => {
    if (userEmail?.toLowerCase() !== "admin@cvreview.com") return [];
    return candidates
      .filter(
        (c) =>
          c.status !== "pending" &&
          c.reviewer &&
          c.reviewer.toLowerCase() !== "admin@cvreview.com",
      )
      .sort(
        (a, b) =>
          new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
      );
  }, [candidates, userEmail]);

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    if (!userEmail) return;
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    // Convert files to base64 strings
    const fileBase64s = await Promise.all(
      files.map((file) => {
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            const base64 = result.split(",")[1];
            resolve(base64);
          };
          reader.readAsDataURL(file);
        });
      })
    );

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

    const uploaded = files.map((file, idx) => {
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
        fileBase64: fileBase64s[idx],
        fileMimeType: file.type || "application/octet-stream",
        previewBase64: renderedFile?.base64,
        previewMimeType: renderedFile?.mimeType,
        uploaderEmail: userEmail,
      };
    });

    // Save candidates to server
    for (const candidate of uploaded) {
      await fetch("/api/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail, candidate }),
      }).catch((err) => console.error("Failed to persist candidate to server", err));
    }

    setCandidates((current) => [...uploaded, ...current]);
    setSelectedId(uploaded[0]?.id || selectedId);
    setToast(`${uploaded.length} CV${uploaded.length === 1 ? "" : "s"} uploaded for review`);
    event.target.value = "";
  }

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function updateSelected(changes: Partial<Candidate>) {
    if (!selected || !userEmail) return;
    const finalChanges = {
      ...changes,
      reviewer: userEmail,
    };
    // Update local state immediately
    setCandidates((current) =>
      current.map((candidate) =>
        candidate.id === selected.id ? { ...candidate, ...finalChanges } : candidate,
      ),
    );
    // Debounce server persistence (save after 800ms pause)
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      fetch(`/api/candidates/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: userEmail,
          changes: finalChanges,
        }),
      }).catch((err) => console.error("Failed to update candidate on server", err));
    }, 800);
  }

  async function submitAction(action: ReviewAction) {
    if (!selected || !userEmail) return;
    // Flush any pending debounced comment save
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setIsSending(true);
    const next = { ...selected, status: action, reviewer: userEmail, notified: true, comments: selected.comments };
    setCandidates((current) =>
      current.map((candidate) => (candidate.id === selected.id ? next : candidate)),
    );

    // Save status changes to server (admin sees these in their notifications panel)
    await fetch(`/api/candidates/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: userEmail,
        changes: { status: action, reviewer: userEmail, notified: true, comments: selected.comments },
      }),
    }).catch((err) => console.error("Failed to update candidate status on server", err));

    setIsSending(false);
    const actionLabels: Record<ReviewAction, string> = {
      accepted: "Accepted",
      accepted_with_comments: "Accepted with comments",
      comments_only: "Comments saved",
      rejected: "Rejected",
    };
    setToast(`${actionLabels[action]} — visible to admin`);
  }

  if (!userEmail) {
    return (
      <main className="loginContainer">
        <div className="loginCard">
          <div className="loginHeader">
            <div className="brandMark">C</div>
            <h2>CV Review Console</h2>
            <p>Access workspaces & candidate uploads</p>
          </div>
          
          {authError && <div className="authError">{authError}</div>}
          
          <form onSubmit={handleAuthSubmit} className="loginForm">
            {!otpSent ? (
              <>
                <label className="field">
                  <span>Enter your Email Address</span>
                  <div className="inputIcon">
                    <Mail size={18} />
                    <input
                      type="email"
                      required
                      placeholder="you@company.com (admin@cvreview.com for Admin)"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                    />
                  </div>
                </label>
                <button type="submit" disabled={loadingAuth} className="loginButton">
                  {loadingAuth ? "Sending OTP..." : "Get Instant OTP"}
                </button>
              </>
            ) : (
              <>
                <label className="field">
                  <span>Enter 6-digit OTP Code</span>
                  <div className="inputIcon">
                    <CheckCircle2 size={18} />
                    <input
                      type="text"
                      maxLength={6}
                      required
                      placeholder="123456"
                      value={enteredOtp}
                      onChange={(e) => setEnteredOtp(e.target.value)}
                    />
                  </div>
                </label>
                
                {devOtp && (
                  <div className="devOtpNotice">
                    <strong>[Dev Mode]</strong> Your OTP is: <code>{devOtp}</code>
                  </div>
                )}
                
                <button type="submit" disabled={loadingAuth} className="loginButton">
                  {loadingAuth ? "Verifying..." : "Verify & Login"}
                </button>
                <button 
                  type="button" 
                  onClick={() => { setOtpSent(false); setEnteredOtp(""); }} 
                  className="resendButton"
                >
                  Change Email
                </button>
              </>
            )}
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="sidebar" aria-label="Candidate queue">
        <div className="brand">
          <div className="brandMark">C</div>
          <div>
            <h1>{userEmail === "admin@cvreview.com" ? "Admin Console" : "CV Review"}</h1>
            <p>{userEmail === "admin@cvreview.com" ? "Review all user & guest uploads" : "Upload and record candidate decisions"}</p>
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
                <small>
                  {candidate.fileName} · {statusLabel[candidate.status]}
                  {userEmail === "admin@cvreview.com" && candidate.uploaderEmail && (
                    <> · by {candidate.uploaderEmail.replace("@cvreview.com", "").replace("@company.com", "")}</>
                  )}
                </small>
                <span className={`badge ${candidate.discipline.toLowerCase()}`}>
                  {candidate.discipline}
                </span>
              </span>
            </button>
          ))}
          {!filtered.length && <p className="empty">No CVs in the review queue yet.</p>}
        </div>

        <div className="sidebarFooter">
          <div className="userInfo">
            <span className="userSessionEmail" title={userEmail}>{userEmail}</span>
            {userEmail === "admin@cvreview.com" && <span className="adminRoleBadge">Admin</span>}
          </div>
          <button onClick={handleLogout} className="logoutBtn" type="button">
            Log out
          </button>
        </div>
      </section>

      <section className="workspace">
        {userEmail === "admin@cvreview.com" && (
          <>
          <div className="adminStatsGrid">
            <div className="statCard">
              <span className="statValue">{candidates.length}</span>
              <span className="statLabel">Total CVs</span>
            </div>
            <div className="statCard accepted">
              <span className="statValue">
                {candidates.filter((c) => c.status === "accepted").length}
              </span>
              <span className="statLabel">Accepted</span>
            </div>
            <div className="statCard accepted_comments">
              <span className="statValue">
                {candidates.filter((c) => c.status === "accepted_with_comments").length}
              </span>
              <span className="statLabel">With Comments</span>
            </div>
            <div className="statCard comments_only">
              <span className="statValue">
                {candidates.filter((c) => c.status === "comments_only").length}
              </span>
              <span className="statLabel">Comments Only</span>
            </div>
            <div className="statCard rejected">
              <span className="statValue">
                {candidates.filter((c) => c.status === "rejected").length}
              </span>
              <span className="statLabel">Rejected</span>
            </div>
          </div>

          {adminNotifications.length > 0 && (
            <div className="adminNotificationsPanel">
              <h3 className="notifHeader"><Bell size={16} /> User Review Activity</h3>
              <div className="notifList">
                {adminNotifications.map((n) => (
                  <div key={n.id} className={`notifItem ${n.status}`}>
                    <div className="notifTop">
                      <span className="notifReviewer">{n.reviewer}</span>
                      <span className={`notifStatus badge ${n.status}`}>
                        {statusLabel[n.status]}
                      </span>
                    </div>
                    <div className="notifCandidate">
                      CV: <strong>{n.displayName}</strong>
                    </div>
                    {n.comments && (
                      <div className="notifComments">
                        <MessageSquare size={13} /> {n.comments}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          </>
        )}

        <div className="topbar">
          <div>
            <p className="eyebrow">{userEmail === "admin@cvreview.com" ? "HR Administrator Console" : "Customer Review Console"}</p>
            <h2>{selected ? selected.displayName : "Upload CVs to begin"}</h2>
          </div>
          <div className="metric">
            <CheckCircle2 size={18} />
            {candidates.filter((candidate) => candidate.status !== "pending").length}/
            {candidates.length} reviewed
          </div>
        </div>

        {selected ? (
          <div className="verticalReviewLayout">
            {/* Top bar: status badge + Open / Download / Remove */}
            <div className="cvTopBar">
              <div className="cvTopBarLeft">
                <h3>{selected.displayName}</h3>
                <span className={`badge ${selected.status}`}>{statusLabel[selected.status]}</span>
                {selected.reviewer && selected.reviewer !== userEmail && (
                  <span className="reviewerTag">Reviewed by {selected.reviewer}</span>
                )}
              </div>
              <div className="documentToolbar" style={{ margin: 0 }}>
                <button onClick={() => openOriginal(selected)} type="button">
                  <ExternalLink size={16} /> Open
                </button>
                <button onClick={() => downloadOriginal(selected)} type="button">
                  <Download size={16} /> Download
                </button>
                {userEmail === "admin@cvreview.com" && (
                  <button
                    className="danger"
                    onClick={() => handleDeleteCandidate(selected.id)}
                    type="button"
                  >
                    <Trash2 size={16} /> Remove CV
                  </button>
                )}
              </div>
            </div>

            {/* CV preview — takes maximum available space */}
            {selected.parseWarning && (
              <p className="parseWarning">{selected.parseWarning}</p>
            )}
            <div className="cvViewerFull" aria-label="Original CV preview">
              {selected.previewUrl && (selected.previewMethod.includes("pdf") || selected.previewUrl !== selected.objectUrl) ? (
                <iframe className="pdfFrameFull" src={selected.previewUrl} title={selected.fileName} />
              ) : selected.rawText ? (
                <pre className="originalTextFull">{selected.rawText}</pre>
              ) : (
                <div className="blankState compact">
                  <FileText size={34} />
                  <h2>Preview unavailable</h2>
                  <p>Open or download the original file to review it.</p>
                </div>
              )}
            </div>

            {/* Bottom: Comments + Action buttons */}
            <div className="reviewBottomBar">
              <div className="reviewCommentsArea">
                <label className="field">
                  <span>Comments</span>
                  <textarea
                    onChange={(event) => updateSelected({ comments: event.target.value })}
                    placeholder="Add comments or decision rationale"
                    value={selected.comments}
                    rows={3}
                  />
                </label>
              </div>
              <div className="reviewActionsRow">
                <button className="actionBtn accept" onClick={() => submitAction("accepted")} type="button">
                  <Check size={17} /> Accept
                </button>
                <button className="actionBtn acceptComments" onClick={() => submitAction("accepted_with_comments")} type="button">
                  <MessageSquare size={17} /> Accept with comments
                </button>
                <button className="actionBtn commentsOnly" onClick={() => submitAction("comments_only")} type="button">
                  <MessageSquare size={17} /> Comments only
                </button>
                <button className="actionBtn danger" onClick={() => submitAction("rejected")} type="button">
                  <X size={17} /> Reject
                </button>
              </div>
              {isSending && <p className="sending">Saving review...</p>}
            </div>
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
