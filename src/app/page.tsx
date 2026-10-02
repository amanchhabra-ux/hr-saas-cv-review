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
  Printer,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  Upload,
  X,
  FileDown,
  Table,
  FileCode,
  Pencil,
  Phone,
  Send,
  Copy,
  MessageCircle,
  ChevronUp,
  ChevronDown,
  GraduationCap,
  ArrowUpDown,
  Award,
} from "lucide-react";
import React, { ChangeEvent, useMemo, useState, useEffect, useRef } from "react";
import {
  TataCvData,
  parseTataCv,
  extractCandidateName,
  extractCandidatePhone,
  formatPhoneDisplay,
  sanitizePhoneForWhatsApp,
  RECRUITER_WHATSAPP_NUMBER,
  RECRUITER_WHATSAPP_CLEAN,
  extractCandidateQualification,
  QualificationBroadType,
} from "../lib/cvParser";
import { CandidateMessage } from "../lib/db";
import TataCvPreview from "./components/TataCvPreview";

type ReviewAction =
  | "accepted"
  | "accepted_with_comments"
  | "rejected"
  | "comments_only";

export type Candidate = {
  id: string;
  fileName: string;
  uploadedAt: string;
  displayName: string;
  email: string;
  phone?: string;
  messages?: CandidateMessage[];
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
  discipline: string;
  project?: string;
  fileBase64?: string;
  fileMimeType?: string;
  previewBase64?: string;
  previewMimeType?: string;
  uploaderEmail?: string;
  tataData?: TataCvData;
  industry?: string;
  qualification?: string;
  qualificationType?: QualificationBroadType | string;
  qualifications?: string[];
  qualificationRank?: number;
  qualificationDetail?: string;
};

const statusLabel: Record<Candidate["status"], string> = {
  pending: "Pending review",
  accepted: "Accepted",
  accepted_with_comments: "Accepted with comments",
  rejected: "Rejected",
  comments_only: "Comments only",
};

function getDisplayName(fileName: string, text: string) {
  return extractCandidateName(fileName, text);
}

function getShortQualLabel(qual?: string): string {
  if (!qual) return "Other";
  if (qual === "Degree (B.Sc/Other)") return "Degree";
  if (qual === "10+2 / Intermediate") return "10+2";
  return qual;
}

function getEmail(text: string) {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
}

function getInitials(name: string): string {
  if (!name) return "CV";
  const clean = name.replace(/[^a-zA-Z\s]/g, "").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "CV";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getAvatarColor(name: string): { bg: string; text: string; border: string } {
  const colors = [
    { bg: "linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)", text: "#4338ca", border: "#a5b4fc" }, // indigo
    { bg: "linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)", text: "#1d4ed8", border: "#93c5fd" }, // blue
    { bg: "linear-gradient(135deg, #ccfbf1 0%, #99f6e4 100%)", text: "#0f766e", border: "#5eead4" }, // teal
    { bg: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)", text: "#b45309", border: "#fcd34d" }, // amber
    { bg: "linear-gradient(135deg, #fae8ff 0%, #f5d0fe 100%)", text: "#86198f", border: "#f0abfc" }, // fuchsia
    { bg: "linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)", text: "#0369a1", border: "#7dd3fc" }, // sky
    { bg: "linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)", text: "#15803d", border: "#86efac" }, // emerald
    { bg: "linear-gradient(135deg, #ffedd5 0%, #fed7aa 100%)", text: "#c2410c", border: "#fdba74" }, // orange
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}

function getMatchSnippet(text: string, query: string): string | null {
  if (!text || !query.trim()) return null;
  const rawQuery = query.trim().toLowerCase();
  
  const terms: string[] = [];
  const quotedRegex = /"([^"]+)"/g;
  let match: RegExpExecArray | null;
  let remaining = rawQuery;
  while ((match = quotedRegex.exec(rawQuery)) !== null) {
    if (match[1]?.trim()) {
      terms.push(match[1].trim());
    }
    remaining = remaining.replace(match[0], " ");
  }
  remaining.split(/\s+/).filter(Boolean).forEach((t) => terms.push(t));
  if (terms.length === 0) return null;

  const lower = text.toLowerCase();
  let firstIdx = -1;
  let matchedTerm = "";
  for (const term of terms) {
    const idx = lower.indexOf(term);
    if (idx !== -1 && (firstIdx === -1 || idx < firstIdx)) {
      firstIdx = idx;
      matchedTerm = term;
    }
  }

  if (firstIdx === -1) return null;

  const start = Math.max(0, firstIdx - 35);
  const end = Math.min(text.length, firstIdx + matchedTerm.length + 55);
  let snippet = text.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";
  return snippet;
}

function countKeywordMatches(text: string, query: string): number {
  if (!text || !query.trim()) return 0;
  const rawQuery = query.trim().toLowerCase();
  const terms: string[] = [];
  const quotedRegex = /"([^"]+)"/g;
  let match: RegExpExecArray | null;
  let remaining = rawQuery;
  while ((match = quotedRegex.exec(rawQuery)) !== null) {
    if (match[1]?.trim()) terms.push(match[1].trim());
    remaining = remaining.replace(match[0], " ");
  }
  remaining.split(/\s+/).filter(Boolean).forEach((t) => terms.push(t));
  if (terms.length === 0) return 0;

  const lower = text.toLowerCase();
  let count = 0;
  for (const term of terms) {
    let pos = 0;
    while ((pos = lower.indexOf(term, pos)) !== -1) {
      count++;
      pos += term.length;
    }
  }
  return count;
}

function highlightTextWithKeywords(
  text: string,
  query: string,
  activeMatchIndex = -1
): React.ReactNode {
  if (!text) return "";
  if (!query.trim()) return text;

  const rawQuery = query.trim().toLowerCase();
  const terms: string[] = [];
  const quotedRegex = /"([^"]+)"/g;
  let match: RegExpExecArray | null;
  let remaining = rawQuery;
  while ((match = quotedRegex.exec(rawQuery)) !== null) {
    if (match[1]?.trim()) {
      terms.push(match[1].trim());
    }
    remaining = remaining.replace(match[0], " ");
  }
  remaining.split(/\s+/).filter(Boolean).forEach((t) => terms.push(t));
  if (terms.length === 0) return text;

  // Sort descending by length so longer phrases match first
  terms.sort((a, b) => b.length - a.length);

  const escapedTerms = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`(${escapedTerms.join("|")})`, "gi");

  const parts = text.split(regex);
  let matchCounter = 0;

  return parts.map((part, i) => {
    const isMatch = terms.some((t) => t.toLowerCase() === part.toLowerCase());
    if (isMatch) {
      const currentMatchIdx = matchCounter++;
      const isActive = currentMatchIdx === activeMatchIndex;
      return (
        <mark
          key={i}
          id={`cv-match-${currentMatchIdx}`}
          className={`cvKeywordHighlight ${isActive ? "activeMatch" : ""}`}
        >
          {part}
        </mark>
      );
    }
    return part;
  });
}

function getWhatsAppTemplateText(
  type: "shortlisted" | "interview" | "documents" | "custom",
  name: string,
  project: string,
): string {
  const candidateName = name || "Candidate";
  const proj = project || "our ongoing project";
  switch (type) {
    case "shortlisted":
      return `Hello ${candidateName},\n\nGreetings from NESTKI Consulting!\n\nWe have reviewed your CV for the ${proj} role and are pleased to inform you that your profile has been shortlisted by our technical review team.\n\nCould you please let us know your availability for a brief discussion regarding the project scope?\n\nYou can connect with our recruitment desk directly on this WhatsApp line (${RECRUITER_WHATSAPP_NUMBER}).\n\nBest regards,\nRecruitment Desk\nNESTKI Consulting\nWhatsApp: ${RECRUITER_WHATSAPP_NUMBER}`;
    case "interview":
      return `Hello ${candidateName},\n\nThis is regarding your candidature for ${proj} with NESTKI Consulting.\n\nWe would like to invite you for an interview/technical discussion with our client panel. Kindly confirm your availability for this week and share 2 preferred time slots.\n\nLooking forward to your response.\n\nRecruitment Team\nNESTKI Consulting\nContact / WhatsApp: ${RECRUITER_WHATSAPP_NUMBER}`;
    case "documents":
      return `Hello ${candidateName},\n\nThank you for sharing your CV for ${proj} with NESTKI Consulting.\n\nTo complete your submission dossier, please share:\n1. Educational & Experience Certificates\n2. Current CTC & Expected CTC\n3. Notice Period / Joining Time\n\nYou can reply directly to this WhatsApp message or call us at ${RECRUITER_WHATSAPP_NUMBER}.\n\nBest regards,\nNESTKI Consulting`;
    case "custom":
      return `Hello ${candidateName},\n\nThis is NESTKI Consulting recruitment desk regarding your CV for ${proj}.\n\nPlease let us know if you are open to exploring this role.\n\nContact / WhatsApp: ${RECRUITER_WHATSAPP_NUMBER}`;
  }
}

function getEmailTemplateContent(
  type: "shortlisted" | "interview" | "documents" | "custom",
  name: string,
  project: string,
): { subject: string; body: string } {
  const candidateName = name || "Candidate";
  const proj = project || "our project";
  switch (type) {
    case "shortlisted":
      return {
        subject: `Profile Shortlisted: ${proj} - NESTKI Consulting`,
        body: `Dear ${candidateName},\n\nGreetings from NESTKI Consulting.\n\nWe have reviewed your CV for the ${proj} position and are pleased to inform you that your profile has been shortlisted by our review panel.\n\nWe would like to connect with you to discuss the role details and next steps. Please let us know your preferred time for a telephone or virtual discussion.\n\nFor any immediate queries, you can reach our recruitment desk directly on WhatsApp or phone at ${RECRUITER_WHATSAPP_NUMBER}.\n\nBest regards,\nRecruitment Team\nNESTKI Consulting\nContact / WhatsApp: ${RECRUITER_WHATSAPP_NUMBER}`,
      };
    case "interview":
      return {
        subject: `Interview Invitation: ${proj} - NESTKI Consulting`,
        body: `Dear ${candidateName},\n\nThank you for your interest in NESTKI Consulting.\n\nWe would like to schedule your technical interview for the ${proj} role. Kindly confirm your availability for this week along with 2-3 suitable time slots.\n\nYou can reply to this email or coordinate directly with our team on WhatsApp at ${RECRUITER_WHATSAPP_NUMBER}.\n\nSincerely,\nRecruitment Team\nNESTKI Consulting\nContact / WhatsApp: ${RECRUITER_WHATSAPP_NUMBER}`,
      };
    case "documents":
      return {
        subject: `Document & Information Request - NESTKI Consulting`,
        body: `Dear ${candidateName},\n\nIn reference to your application for ${proj}, please provide the following details and documentation to complete your candidate dossier:\n\n1. Educational and Technical Qualification Certificates\n2. Current CTC, Expected CTC, and Notice Period\n3. Proof of Work Experience\n\nYou may reply to this email with the documents attached, or message our recruitment desk on WhatsApp at ${RECRUITER_WHATSAPP_NUMBER}.\n\nRegards,\nRecruitment Team\nNESTKI Consulting\nPhone / WhatsApp: ${RECRUITER_WHATSAPP_NUMBER}`,
      };
    case "custom":
      return {
        subject: `Regarding your CV: ${proj} - NESTKI Consulting`,
        body: `Dear ${candidateName},\n\nThank you for submitting your CV for ${proj} with NESTKI Consulting.\n\nPlease feel free to contact us with any questions or updates regarding your availability.\n\nBest regards,\nRecruitment Team\nNESTKI Consulting\nPhone / WhatsApp: ${RECRUITER_WHATSAPP_NUMBER}`,
      };
  }
}

const PRESET_TAGS = [
  "Electrical",
  "Civil",
  "HSE",
  "Planning and reporting",
  "Billing",
  "MIS documentation",
  "Project controller",
  "Project manager",
  "Drone Services",
  "Contracts and Procurement",
  "Qa/QC Engineer",
  "Telecom",
  "Surveyor",
  "others"
];

function detectDiscipline(fileName: string, text: string): string {
  const fileAndText = `${fileName} ${text}`.toLowerCase();
  
  if (/\b(electrical|electricity|electrician|electronics|power\s+systems|telecom|scada)\b/.test(fileAndText)) {
    return "Electrical";
  }
  if (/\b(civil|structural|concrete|geotechnical|construction\s+engineering|foundation|steel\s+structures)\b/.test(fileAndText)) {
    return "Civil";
  }
  if (/\b(hse|safety\s+officer|health\s+safety|environment|environmental|safety\s+engineer|osha|nebosh|hazard|risk\s+assessment)\b/.test(fileAndText)) {
    return "HSE";
  }
  if (/\b(planning|planner|scheduler|scheduling|primavera|msp|project\s+control|delay\s+analysis)\b/.test(fileAndText)) {
    return "Planning and reporting";
  }
  if (/\b(billing|invoice|rate|cost|payment)\b/.test(fileAndText)) {
    return "Billing";
  }
  if (/\b(mis|report|dashboard|data\s+analyst|documentation)\b/.test(fileAndText)) {
    return "MIS documentation";
  }
  if (/\b(controller|coordinator)\b/.test(fileAndText)) {
    return "Project controller";
  }
  if (/\b(manager|lead|director|pm)\b/.test(fileAndText)) {
    return "Project manager";
  }
  if (/\b(drone|uav|pilot|aerial)\b/.test(fileAndText)) {
    return "Drone Services";
  }
  if (/\b(procurement|contract|purchasing|buyer|sourcing)\b/.test(fileAndText)) {
    return "Contracts and Procurement";
  }
  if (/\b(qa|qc|quality|testing|inspection)\b/.test(fileAndText)) {
    return "Qa/QC Engineer";
  }
  if (/\b(telecom|telecommunication|network|cisco|wireless)\b/.test(fileAndText)) {
    return "Telecom";
  }
  if (/\b(surveyor|survey|geodetic|gis|mapping)\b/.test(fileAndText)) {
    return "Surveyor";
  }
  
  return "others";
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
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "accepted" | "rejected">("all");
  
  const [projects, setProjects] = useState<string[]>(["Reliance TL project"]);
  const [selectedProjectFilter, setSelectedProjectFilter] = useState("All");
  const [selectedDiscipline, setSelectedDiscipline] = useState("All");
  const [customTagInput, setCustomTagInput] = useState("");
  const [showTagEditor, setShowTagEditor] = useState(false);

  const [sortOption, setSortOption] = useState<
    | "default"
    | "qual_highest"
    | "degree_first"
    | "diploma_first"
    | "pg_first"
    | "iti_first"
    | "name_asc"
  >("default");
  const [qualificationFilter, setQualificationFilter] = useState<
    "All" | "Degree" | "Diploma" | "Post Graduate" | "ITI" | "Other"
  >("All");
  const [showQualEditor, setShowQualEditor] = useState(false);
  
  const [showProjectEditor, setShowProjectEditor] = useState(false);
  const [customProjectInput, setCustomProjectInput] = useState("");
  
  const [toast, setToast] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [viewMode, setViewMode] = useState<"preview" | "text" | "tata">("preview");

  const WHATSAPP_WINDOW_TARGET = "HR_SAAS_WHATSAPP_PORTAL_WINDOW";

  const DEFAULT_INDUSTRIES = ["Transmission", "Substation", "Distribution", "Hydro", "Solar", "Wind"];
  const [industries, setIndustries] = useState<string[]>(DEFAULT_INDUSTRIES);
  const [selectedIndustry, setSelectedIndustry] = useState("All");
  const [customIndustryInput, setCustomIndustryInput] = useState("");
  const [showIndustryEditor, setShowIndustryEditor] = useState(false);

  const [localBlobUrl, setLocalBlobUrl] = useState<string | null>(null);
  const [isBlobLoading, setIsBlobLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
    percent: number;
    statusText: string;
  } | null>(null);

  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [whatsAppPhone, setWhatsAppPhone] = useState("");
  const [whatsAppMessage, setWhatsAppMessage] = useState("");
  const [whatsAppTemplate, setWhatsAppTemplate] = useState<"shortlisted" | "interview" | "documents" | "custom">("shortlisted");
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailTemplate, setEmailTemplate] = useState<"shortlisted" | "interview" | "documents" | "custom">("shortlisted");
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Always reset viewMode to preview so CV loads automatically
  useEffect(() => {
    setViewMode("preview");
    setActiveMatchIndex(0);
  }, [selectedId]);

  useEffect(() => {
    setActiveMatchIndex(0);
  }, [query]);

  // Generate object URL for preview to bypass Acrobat extension network interception
  const selectedCandidate = candidates.find((c) => c.id === selectedId);
  const selectedPreviewUrl = selectedCandidate?.previewUrl;
  const selectedPreviewBase64 = selectedCandidate?.previewBase64;
  const selectedPreviewMime = selectedCandidate?.previewMimeType;
  const selectedFileMime = selectedCandidate?.fileMimeType;
  const selectedFileName = selectedCandidate?.fileName;

  const matchedKeywordsCount = useMemo(() => {
    if (!selectedCandidate?.rawText || !query.trim()) return 0;
    return countKeywordMatches(selectedCandidate.rawText, query);
  }, [selectedCandidate?.rawText, query]);

  const iframeSrc = useMemo(() => {
    const base = localBlobUrl || selectedPreviewUrl;
    if (!base) return "";
    if (!query.trim()) return base;
    const isPdf =
      base.includes(".pdf") ||
      (selectedFileName && selectedFileName.toLowerCase().endsWith(".pdf")) ||
      selectedPreviewMime?.includes("application/pdf") ||
      selectedFileMime?.includes("application/pdf");

    if (isPdf) {
      const sep = base.includes("#") ? "&" : "#";
      return `${base}${sep}search=${encodeURIComponent(query.trim())}`;
    }
    return base;
  }, [localBlobUrl, selectedPreviewUrl, selectedFileName, selectedPreviewMime, selectedFileMime, query]);

  function handleNavigateMatch(direction: "next" | "prev") {
    if (matchedKeywordsCount === 0) return;
    let nextIdx = direction === "next" ? activeMatchIndex + 1 : activeMatchIndex - 1;
    if (nextIdx >= matchedKeywordsCount) nextIdx = 0;
    if (nextIdx < 0) nextIdx = matchedKeywordsCount - 1;
    setActiveMatchIndex(nextIdx);

    if (viewMode === "preview") {
      setViewMode("text");
    }

    setTimeout(() => {
      const el = document.getElementById(`cv-match-${nextIdx}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 60);
  }

  function highlightIframeContent() {
    try {
      const iframe = iframeRef.current;
      if (!iframe || !iframe.contentDocument || !query.trim()) return;
      const doc = iframe.contentDocument;

      const terms = query
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 1);
      if (terms.length === 0) return;

      const escapedTerms = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      const regex = new RegExp(`(${escapedTerms.join("|")})`, "gi");

      let styleTag = doc.getElementById("cv-highlight-styles") as HTMLStyleElement;
      if (!styleTag) {
        styleTag = doc.createElement("style");
        styleTag.id = "cv-highlight-styles";
        styleTag.innerHTML = `
          mark.cvKeywordHighlight {
            background-color: #fef08a !important;
            color: #854d0e !important;
            font-weight: 700 !important;
            padding: 1px 4px !important;
            border-radius: 3px !important;
            border: 1px solid #facc15 !important;
            box-shadow: 0 0 4px rgba(250, 204, 21, 0.45) !important;
          }
        `;
        doc.head.appendChild(styleTag);
      }

      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
      const textNodes: Text[] = [];
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (node.parentElement?.tagName !== "SCRIPT" && node.parentElement?.tagName !== "STYLE") {
          textNodes.push(node as Text);
        }
      }

      for (const textNode of textNodes) {
        const val = textNode.nodeValue;
        if (val && regex.test(val)) {
          const span = doc.createElement("span");
          span.innerHTML = val.replace(
            regex,
            '<mark class="cvKeywordHighlight">$1</mark>'
          );
          textNode.parentNode?.replaceChild(span, textNode);
        }
      }
    } catch {}
  }

  useEffect(() => {
    if (iframeRef.current) {
      highlightIframeContent();
    }
  }, [query, selectedId, localBlobUrl]);

  useEffect(() => {
    let active = true;

    // Fast path: if previewBase64 is directly available in memory, generate blob URL instantly
    if (selectedPreviewBase64) {
      const isPdf =
        (selectedFileName && selectedFileName.toLowerCase().endsWith(".pdf")) ||
        selectedPreviewMime?.includes("application/pdf");
      const finalMime = isPdf ? "application/pdf" : selectedPreviewMime || "text/html;charset=utf-8";
      try {
        const bytes = Uint8Array.from(atob(selectedPreviewBase64), (char) => char.charCodeAt(0));
        const blob = new Blob([bytes], { type: finalMime });
        const url = URL.createObjectURL(blob);
        setLocalBlobUrl(url);
        setIsBlobLoading(false);
        return () => {
          URL.revokeObjectURL(url);
        };
      } catch (err) {
        console.warn("Could not create blob from previewBase64, will fetch URL:", err);
      }
    }

    if (selectedPreviewUrl) {
      setIsBlobLoading(true);
      setLocalBlobUrl(null);
      fetch(selectedPreviewUrl)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load preview`);
          const contentType = res.headers.get("content-type");
          return res.arrayBuffer().then((buffer) => ({ buffer, contentType }));
        })
        .then(({ buffer, contentType }) => {
          if (active) {
            const isPdf =
              selectedPreviewUrl.includes(".pdf") ||
              (selectedFileName && selectedFileName.toLowerCase().endsWith(".pdf")) ||
              contentType?.includes("application/pdf") ||
              selectedPreviewMime?.includes("application/pdf");
            const finalMime = isPdf
              ? "application/pdf"
              : contentType || selectedPreviewMime || "text/html;charset=utf-8";
            const blob = new Blob([buffer], { type: finalMime });
            const url = URL.createObjectURL(blob);
            setLocalBlobUrl(url);
            setIsBlobLoading(false);
          }
        })
        .catch((err) => {
          console.warn("Failed to fetch local blob, falling back to direct URL:", err);
          if (active) {
            setLocalBlobUrl(selectedPreviewUrl);
            setIsBlobLoading(false);
          }
        });
    } else {
      setLocalBlobUrl(null);
    }
    return () => {
      active = false;
    };
  }, [selectedPreviewUrl, selectedPreviewBase64, selectedPreviewMime, selectedFileMime, selectedFileName]);

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
      const res = await fetch(`/api/candidates?email=${encodeURIComponent(email)}&_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.projects) {
          setProjects(data.projects);
        }
        const loaded = (data.candidates as Candidate[]).map((c) => {
          const hasPreview = c.previewMethod && c.previewMethod !== "original-file" && c.previewMethod !== "not-renderable" && c.previewMethod !== "render-failed";
          const currentName = c.displayName?.trim() || "";
          const needsFix =
            !currentName ||
            currentName.toLowerCase() === "objective" ||
            currentName.toLowerCase().startsWith("name-") ||
            currentName.toLowerCase().startsWith("name:") ||
            currentName === c.fileName;
          const bestName = needsFix ? extractCandidateName(c.fileName, c.rawText) : currentName;
          const qualInfo = (c.qualification && c.qualificationType)
            ? {
                qualification: c.qualification,
                qualificationType: c.qualificationType as QualificationBroadType,
                qualifications: c.qualifications || [c.qualification],
                qualificationRank: c.qualificationRank ?? 0,
                qualificationDetail: c.qualificationDetail || "",
              }
            : extractCandidateQualification(c.rawText, c.tataData?.education, c.fileName);

          return {
            ...c,
            displayName: bestName,
            phone: c.phone || (c.rawText ? extractCandidatePhone(c.rawText) : ""),
            messages: c.messages || [],
            objectUrl: `/api/candidates/${c.id}/file`,
            previewUrl: `/api/candidates/${c.id}/preview`,
            tataData: c.tataData || (c.rawText ? parseTataCv(c.rawText, bestName) : undefined),
            qualification: qualInfo.qualification,
            qualificationType: qualInfo.qualificationType,
            qualifications: qualInfo.qualifications,
            qualificationRank: qualInfo.qualificationRank,
            qualificationDetail: qualInfo.qualificationDetail,
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

  // Collect all unique tags (preset + custom) from candidates
  const allTags = useMemo(() => {
    const tagSet = new Set(PRESET_TAGS);
    candidates.forEach((c) => {
      if (c.discipline && !tagSet.has(c.discipline)) {
        tagSet.add(c.discipline);
      }
    });
    return Array.from(tagSet);
  }, [candidates]);

  const statusCounts = useMemo(() => {
    let pending = 0;
    let accepted = 0;
    let rejected = 0;
    candidates.forEach((c) => {
      if (c.status === "pending") pending++;
      else if (c.status === "accepted" || c.status === "accepted_with_comments") accepted++;
      else if (c.status === "rejected") rejected++;
    });
    return { all: candidates.length, pending, accepted, rejected };
  }, [candidates]);

  // High-performance search index covering complete CV raw text, skills, industry, and knowledge
  const candidateFullSearchIndex = useMemo(() => {
    const index = new Map<string, string>();
    for (const c of candidates) {
      const parts: string[] = [
        c.displayName || "",
        c.email || "",
        c.phone || "",
        c.fileName || "",
        c.fileType || "",
        c.discipline || "",
        c.project || "",
        c.industry || "",
        c.qualification || "",
        c.qualificationType || "",
        c.qualificationDetail || "",
        ...(c.qualifications || []),
        c.comments || "",
        c.uploaderEmail || "",
        c.rawText || "",
      ];

      if (c.tataData) {
        if (c.tataData.proposedPosition) parts.push(c.tataData.proposedPosition);
        if (c.tataData.education) parts.push(c.tataData.education);
        if (c.tataData.otherTraining) parts.push(c.tataData.otherTraining);
        if (c.tataData.membership) parts.push(c.tataData.membership);
        if (c.tataData.countries) parts.push(c.tataData.countries);
        if (c.tataData.employmentRecordRaw) parts.push(c.tataData.employmentRecordRaw);
        if (Array.isArray(c.tataData.employmentRecord)) {
          for (const emp of c.tataData.employmentRecord) {
            if (emp.employer) parts.push(emp.employer);
            if (emp.period) parts.push(emp.period);
            if (Array.isArray(emp.projects)) {
              for (const proj of emp.projects) {
                if (proj.projectName) parts.push(proj.projectName);
                if (proj.client) parts.push(proj.client);
                if (proj.location) parts.push(proj.location);
                if (proj.positionHeld) parts.push(proj.positionHeld);
                if (proj.responsibilities) parts.push(proj.responsibilities);
                if (proj.features) parts.push(proj.features);
              }
            }
          }
        }
      }

      index.set(c.id, parts.join(" ").toLowerCase());
    }
    return index;
  }, [candidates]);

  const qualificationCounts = useMemo(() => {
    let degree = 0;
    let diploma = 0;
    let pg = 0;
    let iti = 0;
    let other = 0;

    candidates.forEach((c) => {
      const quals = c.qualifications || [];
      const qType = c.qualificationType || "";

      if (qType === "Degree" || quals.some((q) => q.includes("Degree") || q.includes("B.Tech"))) {
        degree++;
      }
      if (qType === "Diploma" || quals.includes("Diploma")) {
        diploma++;
      }
      if (
        qType === "Post Graduate" ||
        quals.some((q) => q.includes("M.Tech") || q.includes("MBA") || q.includes("Ph.D"))
      ) {
        pg++;
      }
      if (qType === "ITI" || quals.includes("ITI")) {
        iti++;
      }
      if (qType === "Other" && quals.length === 0) {
        other++;
      }
    });

    return { all: candidates.length, degree, diploma, pg, iti, other };
  }, [candidates]);

  const filtered = useMemo(() => {
    const rawQuery = query.trim().toLowerCase();

    // Parse search terms and quoted exact phrases
    const terms: string[] = [];
    if (rawQuery) {
      const quotedRegex = /"([^"]+)"/g;
      let match: RegExpExecArray | null;
      let remaining = rawQuery;
      while ((match = quotedRegex.exec(rawQuery)) !== null) {
        if (match[1]?.trim()) {
          terms.push(match[1].trim());
        }
        remaining = remaining.replace(match[0], " ");
      }
      remaining.split(/\s+/).filter(Boolean).forEach((t) => terms.push(t));
    }

    const matchedList = candidates.filter((candidate) => {
      // Full CV text, skills, industry, and knowledge matching
      let matchesSearch = true;
      if (terms.length > 0) {
        const fullCvText = candidateFullSearchIndex.get(candidate.id) || "";
        // All query terms must be present in the candidate's CV/data
        matchesSearch = terms.every((term) => fullCvText.includes(term));
      }

      const matchesProject =
        selectedProjectFilter === "All" || candidate.project === selectedProjectFilter;

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "pending" && candidate.status === "pending") ||
        (statusFilter === "accepted" && (candidate.status === "accepted" || candidate.status === "accepted_with_comments")) ||
        (statusFilter === "rejected" && candidate.status === "rejected");

      let matchesQual = true;
      if (qualificationFilter === "Degree") {
        matchesQual =
          candidate.qualificationType === "Degree" ||
          (candidate.qualifications || []).some((q) => q.includes("Degree") || q.includes("B.Tech"));
      } else if (qualificationFilter === "Diploma") {
        matchesQual =
          candidate.qualificationType === "Diploma" ||
          (candidate.qualifications || []).includes("Diploma");
      } else if (qualificationFilter === "Post Graduate") {
        matchesQual =
          candidate.qualificationType === "Post Graduate" ||
          (candidate.qualifications || []).some((q) => q.includes("M.Tech") || q.includes("MBA") || q.includes("Ph.D"));
      } else if (qualificationFilter === "ITI") {
        matchesQual =
          candidate.qualificationType === "ITI" ||
          (candidate.qualifications || []).includes("ITI");
      } else if (qualificationFilter === "Other") {
        matchesQual = candidate.qualificationType === "Other" && (candidate.qualifications || []).length === 0;
      }

      return matchesSearch && matchesProject && matchesStatus && matchesQual;
    });

    // Sort based on what the CV says (Qualification sorting, Degree first, Diploma first, etc.)
    return matchedList.sort((a, b) => {
      if (sortOption === "qual_highest") {
        const rankDiff = (b.qualificationRank || 0) - (a.qualificationRank || 0);
        if (rankDiff !== 0) return rankDiff;
        return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
      }
      if (sortOption === "degree_first") {
        const aScore = (a.qualificationType === "Degree" || (a.qualifications || []).some((q) => q.includes("B.Tech") || q.includes("Degree")))
          ? 10
          : a.qualificationType === "Post Graduate"
          ? 8
          : a.qualificationType === "Diploma"
          ? 5
          : a.qualificationType === "ITI"
          ? 3
          : 0;
        const bScore = (b.qualificationType === "Degree" || (b.qualifications || []).some((q) => q.includes("B.Tech") || q.includes("Degree")))
          ? 10
          : b.qualificationType === "Post Graduate"
          ? 8
          : b.qualificationType === "Diploma"
          ? 5
          : b.qualificationType === "ITI"
          ? 3
          : 0;
        if (bScore !== aScore) return bScore - aScore;
        return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
      }
      if (sortOption === "diploma_first") {
        const aScore = ((a.qualifications || []).includes("Diploma") || a.qualificationType === "Diploma")
          ? 10
          : a.qualificationType === "ITI"
          ? 7
          : a.qualificationType === "Degree"
          ? 5
          : 0;
        const bScore = ((b.qualifications || []).includes("Diploma") || b.qualificationType === "Diploma")
          ? 10
          : b.qualificationType === "ITI"
          ? 7
          : b.qualificationType === "Degree"
          ? 5
          : 0;
        if (bScore !== aScore) return bScore - aScore;
        return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
      }
      if (sortOption === "pg_first") {
        const aScore = (a.qualificationType === "Post Graduate" || (a.qualifications || []).some((q) => q.includes("M.Tech") || q.includes("MBA") || q.includes("Ph.D")))
          ? 10
          : a.qualificationType === "Degree"
          ? 7
          : 3;
        const bScore = (b.qualificationType === "Post Graduate" || (b.qualifications || []).some((q) => q.includes("M.Tech") || q.includes("MBA") || q.includes("Ph.D")))
          ? 10
          : b.qualificationType === "Degree"
          ? 7
          : 3;
        if (bScore !== aScore) return bScore - aScore;
        return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
      }
      if (sortOption === "iti_first") {
        const aScore = ((a.qualifications || []).includes("ITI") || a.qualificationType === "ITI") ? 10 : 0;
        const bScore = ((b.qualifications || []).includes("ITI") || b.qualificationType === "ITI") ? 10 : 0;
        if (bScore !== aScore) return bScore - aScore;
        return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
      }
      if (sortOption === "name_asc") {
        return a.displayName.localeCompare(b.displayName);
      }
      // default: newest uploaded first
      return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
    });
  }, [
    candidates,
    query,
    selectedProjectFilter,
    statusFilter,
    qualificationFilter,
    sortOption,
    candidateFullSearchIndex,
  ]);
  const selected = candidates.find((candidate) => candidate.id === selectedId) || candidates[0];

  function openWhatsAppDialog(c?: Candidate) {
    const cand = c || selected;
    if (!cand) return;
    const ph = cand.phone || "";
    setWhatsAppPhone(ph);
    setWhatsAppTemplate("shortlisted");
    setWhatsAppMessage(getWhatsAppTemplateText("shortlisted", cand.displayName, cand.project || ""));
    setShowWhatsAppModal(true);
  }

  function handleWhatsAppTemplateChange(type: "shortlisted" | "interview" | "documents" | "custom") {
    setWhatsAppTemplate(type);
    if (selected) {
      setWhatsAppMessage(getWhatsAppTemplateText(type, selected.displayName, selected.project || ""));
    }
  }

  function openWhatsAppWindow(url: string) {
    // Reuses the identical single browser tab/window for all conversations
    const win = window.open(url, WHATSAPP_WINDOW_TARGET);
    if (win) {
      try {
        win.focus();
      } catch {}
    }
    return win;
  }

  function logMessageToCv(candidateId: string, msg: Omit<CandidateMessage, "id" | "timestamp">) {
    const newMsg: CandidateMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      ...msg,
    };

    setCandidates((prev) =>
      prev.map((c) => {
        if (c.id === candidateId) {
          const existing = c.messages || [];
          return {
            ...c,
            messages: [...existing, newMsg],
          };
        }
        return c;
      })
    );

    const target = candidates.find((c) => c.id === candidateId);
    const updatedMessages = [...(target?.messages || []), newMsg];
    if (userEmail) {
      fetch(`/api/candidates/${candidateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: userEmail,
          changes: { messages: updatedMessages },
        }),
      }).catch((e) => console.error("Failed to persist mapped conversation:", e));
    }
  }

  function handleDeleteMessage(candidateId: string, messageId: string) {
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.id === candidateId) {
          const filtered = (c.messages || []).filter((m) => m.id !== messageId);
          return { ...c, messages: filtered };
        }
        return c;
      })
    );
    const target = candidates.find((c) => c.id === candidateId);
    const updated = (target?.messages || []).filter((m) => m.id !== messageId);
    if (userEmail) {
      fetch(`/api/candidates/${candidateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: userEmail,
          changes: { messages: updated },
        }),
      }).catch((e) => console.error("Failed to delete conversation message:", e));
    }
  }

  function handleSendWhatsApp(mode: "web" | "app" = "web", customText?: string) {
    if (!selected) return;
    const textToSend = customText || whatsAppMessage;
    const clean = sanitizePhoneForWhatsApp(whatsAppPhone || selected.phone || "");
    if (!clean || clean.length < 10) {
      alert("Please provide a valid 10-to-15-digit candidate phone/WhatsApp number.");
      return;
    }
    if (whatsAppPhone && whatsAppPhone !== selected.phone) {
      updateSelected({ phone: whatsAppPhone });
    }
    const encoded = encodeURIComponent(textToSend);
    const url = mode === "web"
      ? `https://web.whatsapp.com/send?phone=${clean}&text=${encoded}`
      : `https://wa.me/${clean}?text=${encoded}`;
    
    // Open in single dedicated WhatsApp window
    openWhatsAppWindow(url);

    // Map conversation against candidate CV
    logMessageToCv(selected.id, {
      type: "whatsapp",
      direction: "outbound",
      sender: RECRUITER_WHATSAPP_NUMBER,
      recipient: whatsAppPhone || selected.phone || clean,
      text: textToSend,
    });

    setToast(`WhatsApp opened (Single Window) & mapped to ${selected.displayName}`);
    setShowWhatsAppModal(false);
  }

  function handleCopyWhatsApp() {
    const textToCopy = `Candidate Phone: ${whatsAppPhone}\nRecruiter Line: ${RECRUITER_WHATSAPP_NUMBER}\n\nMessage:\n${whatsAppMessage}`;
    navigator.clipboard.writeText(textToCopy);
    setToast("WhatsApp message & contact details copied to clipboard!");
  }

  function openEmailDialog(c?: Candidate) {
    const cand = c || selected;
    if (!cand) return;
    const em = cand.email || "";
    setEmailTo(em);
    setEmailTemplate("shortlisted");
    const tpl = getEmailTemplateContent("shortlisted", cand.displayName, cand.project || "");
    setEmailSubject(tpl.subject);
    setEmailBody(tpl.body);
    setShowEmailModal(true);
  }

  function handleEmailTemplateChange(type: "shortlisted" | "interview" | "documents" | "custom") {
    setEmailTemplate(type);
    if (selected) {
      const tpl = getEmailTemplateContent(type, selected.displayName, selected.project || "");
      setEmailSubject(tpl.subject);
      setEmailBody(tpl.body);
    }
  }

  function handleLaunchEmailClient() {
    if (!emailTo) {
      alert("Please provide candidate email address.");
      return;
    }
    if (emailTo !== selected?.email) {
      updateSelected({ email: emailTo });
    }
    const mailto = `mailto:${encodeURIComponent(emailTo)}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    window.location.href = mailto;

    if (selected) {
      logMessageToCv(selected.id, {
        type: "email",
        direction: "outbound",
        sender: userEmail || "recruiter",
        recipient: emailTo,
        subject: emailSubject,
        text: emailBody,
      });
    }

    setToast(`Email client launched & mapped to ${selected?.displayName || emailTo}`);
    setShowEmailModal(false);
  }

  async function handleSendEmailApi() {
    if (!emailTo) {
      alert("Please provide candidate email address.");
      return;
    }
    setIsSendingEmail(true);
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: emailTo,
          subject: emailSubject,
          message: emailBody,
          candidateName: selected?.displayName,
          projectName: selected?.project,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        if (selected) {
          logMessageToCv(selected.id, {
            type: "email",
            direction: "outbound",
            sender: userEmail || "recruiter",
            recipient: emailTo,
            subject: emailSubject,
            text: emailBody,
          });
        }
        setToast(data.message || `Email sent successfully to ${emailTo}`);
        if (emailTo !== selected?.email) {
          updateSelected({ email: emailTo });
        }
        setShowEmailModal(false);
      } else {
        setToast(data.error || "Could not dispatch email");
      }
    } catch {
      setToast("Network error dispatching email");
    }
    setIsSendingEmail(false);
  }

  function handleCopyEmail() {
    const textToCopy = `To: ${emailTo}\nSubject: ${emailSubject}\n\n${emailBody}`;
    navigator.clipboard.writeText(textToCopy);
    setToast("Email content copied to clipboard!");
  }

  async function handleCreateProject() {
    if (!customProjectInput.trim() || !userEmail) return;
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project: customProjectInput.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.projects) {
          setProjects(data.projects);
          setToast(`Project "${customProjectInput.trim()}" created successfully`);
          setCustomProjectInput("");
          setShowProjectEditor(false);
        }
      }
    } catch {
      setToast("Failed to create project");
    }
  }

  async function handleRemoveProject(project: string) {
    if (!confirm(`Are you sure you want to remove project "${project}"?`)) return;
    try {
      const res = await fetch(`/api/projects?project=${encodeURIComponent(project)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.projects) {
          setProjects(data.projects);
          setToast(`Project "${project}" removed`);
          if (selectedProjectFilter === project) {
            setSelectedProjectFilter("All");
          }
        }
      }
    } catch {
      setToast("Failed to remove project");
    }
  }

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
      } else if (res.status === 404) {
        // If backend says CV is already gone, remove it from UI anyway
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

  async function handleClearAllCandidates() {
    if (!userEmail || userEmail.toLowerCase() !== "admin@cvreview.com") return;
    if (!confirm("WARNING: Are you absolutely sure you want to permanently delete ALL CVs from the database? This action cannot be undone.")) return;
    try {
      const res = await fetch(`/api/candidates?email=${encodeURIComponent(userEmail)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setCandidates([]);
        setSelectedId("");
        setToast("All CVs have been permanently deleted");
      } else {
        const data = await res.json();
        setToast(data.message || "Failed to clear database");
      }
    } catch {
      setToast("Network error clearing database");
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

  async function processFiles(files: File[]) {
    if (!userEmail) return;
    const validFiles = files.filter((file) => {
      const ext = file.name.split(".").pop()?.toLowerCase();
      return ["pdf", "doc", "docx", "txt", "rtf", "md", "odt"].includes(ext || "");
    });

    if (validFiles.length === 0) {
      setToast("Please upload PDF, Word (.doc/.docx), TXT, or RTF files.");
      return;
    }

    const totalFiles = validFiles.length;
    const BATCH_SIZE = 4;
    let processedCount = 0;
    const newlyUploadedCandidates: Candidate[] = [];

    setUploadProgress({
      current: 0,
      total: totalFiles,
      percent: 0,
      statusText: `Starting upload for ${totalFiles} CV${totalFiles > 1 ? "s" : ""}...`,
    });

    for (let i = 0; i < totalFiles; i += BATCH_SIZE) {
      const batch = validFiles.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(totalFiles / BATCH_SIZE);

      setUploadProgress({
        current: processedCount,
        total: totalFiles,
        percent: Math.round((processedCount / totalFiles) * 100),
        statusText: `Processing batch ${batchNum} of ${totalBatches} (${processedCount}/${totalFiles})...`,
      });

      try {
        // Convert batch files to base64 strings
        const fileBase64s = await Promise.all(
          batch.map((file) => {
            return new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const result = reader.result as string;
                const base64 = result?.split(",")[1] || "";
                resolve(base64);
              };
              reader.readAsDataURL(file);
            });
          })
        );

        const formData = new FormData();
        batch.forEach((file) => formData.append("files", file));

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
              batch.map(async (file) => {
                try {
                  const singleFileData = new FormData();
                  singleFileData.append("file", file);
                  const response = await fetch("/api/render-cv", {
                    method: "POST",
                    body: singleFileData,
                  });
                  return await response.json();
                } catch {
                  return {
                    fileName: file.name,
                    mimeType: file.type || "application/octet-stream",
                    base64: "",
                    method: "render-failed",
                  };
                }
              }),
            ),
          ]);

          if (parseResponse.ok) {
            const data = (await parseResponse.json()) as {
              parsed: Array<{ fileName: string; text: string; method?: string; warning?: string }>;
            };
            parsed = data.parsed || [];
          }
          rendered = renderResults as typeof rendered;
        } catch {
          parsed = await Promise.all(
            batch.map(async (file) => ({
              fileName: file.name,
              text: await file.text().catch(() => ""),
              method: "browser-fallback",
              warning: "The server reader could not parse this CV.",
            })),
          );
          rendered = [];
        }

        const batchCandidates = batch.map((file, idx) => {
          const parsedFile = parsed.find((item) => item.fileName === file.name);
          const renderedFile = rendered.find(
            (item) =>
              item.fileName === file.name ||
              item.fileName === `${file.name.replace(/\.[^.]+$/, "")}.pdf` ||
              item.fileName === `${file.name.replace(/\.[^.]+$/, "")}.html`,
          );
          const text = parsedFile?.text || "";
          const id = crypto.randomUUID();
          const hasPreview = Boolean(
            renderedFile?.base64 &&
            renderedFile.method !== "original-file" &&
            renderedFile.method !== "not-renderable" &&
            renderedFile.method !== "render-failed"
          );

          const isPdf = file.name.toLowerCase().endsWith(".pdf");
          const qualInfo = extractCandidateQualification(text, undefined, file.name);
          return {
            id,
            fileName: file.name,
            uploadedAt: new Date().toISOString(),
            displayName: getDisplayName(file.name, text),
            email: getEmail(text),
            phone: extractCandidatePhone(text),
            fileType: file.type || file.name.split(".").pop()?.toUpperCase() || "Unknown",
            objectUrl: `/api/candidates/${id}/file`,
            previewUrl: `/api/candidates/${id}/preview`,
            previewMethod: renderedFile?.method || "original-file",
            rawText: text,
            parseMethod: parsedFile?.method || "original-file",
            parseWarning: renderedFile?.warning || parsedFile?.warning || "",
            status: "pending" as const,
            comments: "",
            reviewer: "",
            notified: false,
            discipline: detectDiscipline(file.name, text),
            project: selectedProjectFilter !== "All" ? selectedProjectFilter : (projects[0] || "Reliance TL project"),
            fileBase64: fileBase64s[idx],
            fileMimeType: file.type || "application/octet-stream",
            previewBase64: renderedFile?.base64,
            previewMimeType: renderedFile?.mimeType || (isPdf ? "application/pdf" : "text/html"),
            uploaderEmail: userEmail,
            tataData: parseTataCv(text, getDisplayName(file.name, text)),
            industry: selectedIndustry !== "All" ? selectedIndustry : "",
            qualification: qualInfo.qualification,
            qualificationType: qualInfo.qualificationType,
            qualifications: qualInfo.qualifications,
            qualificationRank: qualInfo.qualificationRank,
            qualificationDetail: qualInfo.qualificationDetail,
          };
        });

        // Save batch to server
        await fetch("/api/candidates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: userEmail, candidates: batchCandidates }),
        }).catch((err) => console.error("Failed to persist candidates batch:", err));

        // Update local state immediately so user sees new candidates right away
        setCandidates((current) => [...batchCandidates, ...current]);
        setSelectedId((current) => current || batchCandidates[0]?.id || "");
        newlyUploadedCandidates.push(...batchCandidates);
        processedCount += batch.length;

        setUploadProgress({
          current: processedCount,
          total: totalFiles,
          percent: Math.round((processedCount / totalFiles) * 100),
          statusText: `Processed ${processedCount} of ${totalFiles} CVs...`,
        });
      } catch (err) {
        console.error("Batch upload failed:", err);
        processedCount += batch.length;
      }
    }

    setUploadProgress(null);
    if (newlyUploadedCandidates.length > 0) {
      setSelectedId(newlyUploadedCandidates[0].id);
      setToast(
        `${newlyUploadedCandidates.length} CV${newlyUploadedCandidates.length === 1 ? "" : "s"} uploaded and ready for review`,
      );
    }
  }

  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    processFiles(files);
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
            <div className="brandMark">N</div>
            <h2>NESTKI CONSULTING</h2>
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
          <div className="brandMark">N</div>
          <div>
            <h1>{userEmail === "admin@cvreview.com" ? "NESTKI Admin" : "NESTKI CONSULTING"}</h1>
            <p>{userEmail === "admin@cvreview.com" ? "Review all user & guest uploads" : "Upload and record candidate decisions"}</p>
          </div>
        </div>

        <label
          className={`uploadBox ${isDragging ? "dragOver" : ""} ${uploadProgress ? "uploadingActive" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer?.files?.length) {
              processFiles(Array.from(e.dataTransfer.files));
            }
          }}
        >
          {uploadProgress ? (
            <div className="uploadProgressContainer">
              <div className="uploadProgressSpinner">
                <RefreshCw size={22} className="spinIcon" />
              </div>
              <span className="uploadProgressText">
                Uploading {uploadProgress.current}/{uploadProgress.total} ({uploadProgress.percent}%)
              </span>
              <div className="uploadProgressBarTrack">
                <div
                  className="uploadProgressBarFill"
                  style={{ width: `${uploadProgress.percent}%` }}
                />
              </div>
              <small>{uploadProgress.statusText}</small>
            </div>
          ) : (
            <>
              <Upload size={22} />
              <span>{isDragging ? "Drop CV files here" : "Upload CV files (Bulk)"}</span>
              <small>PDF, DOC, DOCX, TXT, RTF • Drag & drop supported</small>
              <input
                accept=".pdf,.doc,.docx,.txt,.rtf,.md"
                multiple
                onChange={handleUpload}
                type="file"
              />
            </>
          )}
        </label>



        <div className="search">
          <Search size={16} />
          <input
            aria-label="Search full CV, skills, industry, knowledge"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search full CV, skills, 400kV, Solar..."
            value={query}
          />
          {query && (
            <button
              type="button"
              className="clearSearchBtn"
              onClick={() => setQuery("")}
              title="Clear search"
            >
              ×
            </button>
          )}
        </div>

        {/* Project Filter Section */}
        <div className="projectFilterSection">
          <label className="field">
            <span>Filter by Project</span>
            <div className="projectFilterSelectWrapper">
              <select
                value={selectedProjectFilter}
                onChange={(e) => setSelectedProjectFilter(e.target.value)}
                className="projectSelect"
              >
                <option value="All">All Projects</option>
                <option value="">No Project</option>
                {projects.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <button 
                type="button" 
                className="addProjectBtn"
                onClick={() => setShowProjectEditor(!showProjectEditor)}
                title="Manage Projects"
              >
                +
              </button>
              {selectedProjectFilter !== "All" && selectedProjectFilter !== "" && (
                <button
                  type="button"
                  className="removeProjectBtnTop"
                  onClick={() => handleRemoveProject(selectedProjectFilter)}
                  title="Remove Selected Project"
                >
                  -
                </button>
              )}
            </div>
          </label>
          
          {showProjectEditor && (
            <div className="projectManagerBox">
              <div className="projectManagerList">
                {projects.map((p) => (
                  <div key={p} className="projectManagerItem">
                    <span>{p}</span>
                    <button type="button" className="removeProjectBtn" onClick={() => handleRemoveProject(p)} aria-label={`Remove ${p}`}>×</button>
                  </div>
                ))}
              </div>
              <div className="newProjectForm">
                <input
                  type="text"
                  placeholder="New project name..."
                  value={customProjectInput}
                  onChange={(e) => setCustomProjectInput(e.target.value)}
                />
                <div className="newProjectActions">
                  <button type="button" className="cancel" onClick={() => setShowProjectEditor(false)}>Close</button>
                  <button type="button" className="create" onClick={handleCreateProject} disabled={!customProjectInput.trim()}>Add</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Quick Status Filter Tabs */}
        <div className="queueStatusFilters">
          <button
            type="button"
            className={`filterStatusTab ${statusFilter === "all" ? "active" : ""}`}
            onClick={() => setStatusFilter("all")}
          >
            All <span className="statusCountBadge">{statusCounts.all}</span>
          </button>
          <button
            type="button"
            className={`filterStatusTab ${statusFilter === "pending" ? "active" : ""}`}
            onClick={() => setStatusFilter("pending")}
          >
            Pending <span className="statusCountBadge">{statusCounts.pending}</span>
          </button>
          <button
            type="button"
            className={`filterStatusTab ${statusFilter === "accepted" ? "active" : ""}`}
            onClick={() => setStatusFilter("accepted")}
          >
            Accepted <span className="statusCountBadge">{statusCounts.accepted}</span>
          </button>
          <button
            type="button"
            className={`filterStatusTab ${statusFilter === "rejected" ? "active" : ""}`}
            onClick={() => setStatusFilter("rejected")}
          >
            Rejected <span className="statusCountBadge">{statusCounts.rejected}</span>
          </button>
        </div>

        {/* Qualification Sort Control */}
        <div className="queueSortBar">
          <div className="sortDropdownWrapper">
            <ArrowUpDown size={13} className="sortDropdownIcon" />
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as any)}
              className="sortSelect"
              title="Sort CVs by qualification or date"
              aria-label="Sort CVs by qualification or date"
            >
              <option value="default">Sort: Newest Uploaded</option>
              <option value="qual_highest">🎓 Highest Qualification (Ph.D &gt; Masters &gt; Degree &gt; Diploma &gt; ITI)</option>
              <option value="degree_first">🎓 Degree First (B.Tech / B.E. at top)</option>
              <option value="diploma_first">📜 Diploma First (Diploma holders at top)</option>
              <option value="pg_first">🎓 M.Tech / Post Graduate First</option>
              <option value="iti_first">🛠️ ITI / Vocational First</option>
              <option value="name_asc">🔤 Candidate Name (A to Z)</option>
            </select>
          </div>
        </div>

        {/* Qualification Filter Pills */}
        <div className="qualFilterPills" role="tablist" aria-label="Filter by Qualification">
          <button
            type="button"
            className={`qualFilterPill ${qualificationFilter === "All" ? "active" : ""}`}
            onClick={() => setQualificationFilter("All")}
            title="All qualifications"
          >
            All <span className="qualPillCount">{qualificationCounts.all}</span>
          </button>
          <button
            type="button"
            className={`qualFilterPill degree ${qualificationFilter === "Degree" ? "active" : ""}`}
            onClick={() => setQualificationFilter("Degree")}
            title="Bachelor Degree holders (B.Tech, B.E., B.Sc)"
          >
            🎓 Degree <span className="qualPillCount">{qualificationCounts.degree}</span>
          </button>
          <button
            type="button"
            className={`qualFilterPill diploma ${qualificationFilter === "Diploma" ? "active" : ""}`}
            onClick={() => setQualificationFilter("Diploma")}
            title="Diploma / Polytechnic holders"
          >
            📜 Diploma <span className="qualPillCount">{qualificationCounts.diploma}</span>
          </button>
          <button
            type="button"
            className={`qualFilterPill pg ${qualificationFilter === "Post Graduate" ? "active" : ""}`}
            onClick={() => setQualificationFilter("Post Graduate")}
            title="Master degree / Post Graduate holders (M.Tech, MBA, Ph.D)"
          >
            🎓 Masters <span className="qualPillCount">{qualificationCounts.pg}</span>
          </button>
          <button
            type="button"
            className={`qualFilterPill iti ${qualificationFilter === "ITI" ? "active" : ""}`}
            onClick={() => setQualificationFilter("ITI")}
            title="ITI Trade Certificate holders"
          >
            🛠️ ITI <span className="qualPillCount">{qualificationCounts.iti}</span>
          </button>
          {qualificationCounts.other > 0 && (
            <button
              type="button"
              className={`qualFilterPill other ${qualificationFilter === "Other" ? "active" : ""}`}
              onClick={() => setQualificationFilter("Other")}
              title="Other / Unspecified qualification"
            >
              Other <span className="qualPillCount">{qualificationCounts.other}</span>
            </button>
          )}
        </div>

        <div className="queueHeader" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="sectionLabel">
            CV Queue ({filtered.length}):
            {qualificationFilter !== "All" && (
              <span className="qualActiveFilterBadge">
                {qualificationFilter}
              </span>
            )}
            {query.trim() && (
              <span className="searchMatchIndicator" title={`Matching "${query.trim()}" in complete CV`}>
                &quot;{query.trim()}&quot;
              </span>
            )}
          </span>
          {userEmail === "admin@cvreview.com" && candidates.length > 0 && (
            <button
              onClick={handleClearAllCandidates}
              className="danger"
              type="button"
              style={{ padding: '2px 8px', fontSize: '11px', fontWeight: 'bold', borderRadius: '4px', border: 'none', background: 'var(--danger)', color: '#fff', cursor: 'pointer' }}
              title="Clear all CVs from the database"
            >
              Clear All
            </button>
          )}
        </div>
        <div className="queue">
          {filtered.map((candidate) => {
            const avatarColor = getAvatarColor(candidate.displayName);
            return (
              <div
                className={`candidateRow ${selected?.id === candidate.id ? "active" : ""}`}
                key={candidate.id}
                onClick={() => setSelectedId(candidate.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedId(candidate.id);
                  }
                }}
              >
                <div
                  className="candidateAvatar"
                  style={{
                    background: avatarColor.bg,
                    color: avatarColor.text,
                    borderColor: avatarColor.border,
                  }}
                >
                  {getInitials(candidate.displayName)}
                </div>
                <div className="candidateRowInfo">
                  <div className="candidateRowTop">
                    <span className="candidateRowName" title={candidate.displayName}>
                      {candidate.displayName}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span className="fileFormatTag">
                        {candidate.fileName.split(".").pop()?.toUpperCase() || "CV"}
                      </span>
                      <button
                        type="button"
                        className="quickActionIconBtn whatsapp"
                        title={candidate.phone ? `WhatsApp ${formatPhoneDisplay(candidate.phone)} (via ${RECRUITER_WHATSAPP_NUMBER})` : `WhatsApp Candidate (via ${RECRUITER_WHATSAPP_NUMBER})`}
                        onClick={(e) => {
                          e.stopPropagation();
                          openWhatsAppDialog(candidate);
                        }}
                      >
                        <MessageCircle size={12} />
                      </button>
                      <button
                        type="button"
                        className="quickActionIconBtn email"
                        title={candidate.email ? `Email ${candidate.email}` : "Email Candidate"}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEmailDialog(candidate);
                        }}
                      >
                        <Mail size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="candidateRowMeta" title={candidate.fileName}>
                    {candidate.fileName}
                    {userEmail === "admin@cvreview.com" && candidate.uploaderEmail && (
                      <> · by {candidate.uploaderEmail.replace("@cvreview.com", "").replace("@company.com", "")}</>
                    )}
                  </div>
                  <div className="rowBadges">
                    {/* Primary Qualification Tag */}
                    <span
                      className={`badge qualBadge ${candidate.qualificationType?.toLowerCase().replace(/[^a-z0-9]/g, "") || "other"}`}
                      title={`Qualification: ${candidate.qualification || "Unspecified"}${candidate.qualificationDetail ? ` — ${candidate.qualificationDetail}` : ""}`}
                    >
                      {candidate.qualificationType === "Diploma" ? "📜 " : candidate.qualificationType === "ITI" ? "🛠️ " : "🎓 "}
                      {getShortQualLabel(candidate.qualification)}
                    </span>
                    {/* Secondary Qualification Badge if lateral Diploma */}
                    {candidate.qualifications?.includes("Diploma") && candidate.qualificationType !== "Diploma" && (
                      <span className="badge qualBadge diplomaSub" title="Candidate also holds an Engineering/Polytechnic Diploma">
                        + Diploma
                      </span>
                    )}
                    {/* Secondary Qualification Badge if ITI */}
                    {candidate.qualifications?.includes("ITI") && candidate.qualificationType !== "ITI" && (
                      <span className="badge qualBadge itiSub" title="Candidate also holds ITI Trade Certificate">
                        + ITI
                      </span>
                    )}
                    <span className="badge projectBadge" title={candidate.project || "Reliance TL project"}>
                      {candidate.project || "Reliance TL project"}
                    </span>
                    {candidate.industry && (
                      <span className="badge industryBadge" title={`Industry: ${candidate.industry}`}>
                        {candidate.industry}
                      </span>
                    )}
                    <span className={`badge ${candidate.discipline.toLowerCase().replace(/[^a-z0-9]/g, "")}`} title={`Discipline: ${candidate.discipline}`}>
                      {candidate.discipline}
                    </span>
                    {candidate.phone && (
                      <span className="badge phoneBadge" title={`WhatsApp: ${formatPhoneDisplay(candidate.phone)}`}>
                        <Phone size={8} style={{ marginRight: 2 }} /> {formatPhoneDisplay(candidate.phone)}
                      </span>
                    )}
                    {candidate.messages && candidate.messages.length > 0 && (
                      <span className="badge commCountBadge" title={`${candidate.messages.length} communication messages mapped against this CV`}>
                        <MessageCircle size={8} style={{ marginRight: 2 }} /> {candidate.messages.length}
                      </span>
                    )}
                    {(candidate.status === "accepted_with_comments" || candidate.status === "comments_only" || candidate.comments) ? (
                      <span className="badge queueCommentBubble" title={candidate.comments || "Commented"}>
                        <MessageSquare size={9} />
                      </span>
                    ) : null}
                    {candidate.status === "accepted" ? (
                      <span className="badge queueAcceptBubble" title="Accepted">
                        <CheckCircle2 size={9} />
                      </span>
                    ) : null}
                  </div>
                  {query.trim() && (
                    (() => {
                      const snippet = getMatchSnippet(candidate.rawText, query);
                      if (!snippet) return null;
                      return (
                        <div className="cvSearchSnippet" title={snippet}>
                          <span className="cvSearchSnippetBadge">Found in CV:</span> {snippet}
                        </div>
                      );
                    })()
                  )}
                </div>
              </div>
            );
          })}
          {!filtered.length && (
            <p className="empty">
              {query.trim()
                ? `No CVs match "${query.trim()}" across skills, industry, or knowledge.`
                : "No CVs match the selected filter."}
            </p>
          )}
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
                <div className="editableNameWrapper" title="Click to edit candidate name">
                  <input
                    type="text"
                    className="editableNameInput"
                    value={selected.displayName}
                    onChange={(e) => updateSelected({ displayName: e.target.value } as Partial<Candidate>)}
                    aria-label="Edit Candidate Name"
                    title="Click to edit name"
                  />
                  <Pencil size={12} style={{ color: "var(--muted)", marginLeft: "-22px", pointerEvents: "none", opacity: 0.5 }} />
                </div>
                <span className="fileFormatTag" title={`Original file: ${selected.fileName}`}>
                  {selected.fileName.split(".").pop()?.toUpperCase() || "CV"}
                </span>
                <span className={`badge ${selected.status}`}>{statusLabel[selected.status]}</span>
                {selected.reviewer && selected.reviewer !== userEmail && (
                  <span className="reviewerTag">Reviewed by {selected.reviewer}</span>
                )}
                
                {/* Project Tag Editor */}
                <div className="projectDropdownWrapper">
                  <select
                    value={selected.project || ""}
                    onChange={(e) => updateSelected({ project: e.target.value } as Partial<Candidate>)}
                    className="candidateProjectSelect"
                  >
                    <option value="">No Project</option>
                    {projects.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                {/* Qualification Tag & Editor */}
                <div className="tagEditorWrapper">
                  <button
                    className={`badge qualBadge ${selected.qualificationType?.toLowerCase().replace(/[^a-z0-9]/g, "") || "degree"} tagEditorBtn`}
                    onClick={() => setShowQualEditor(!showQualEditor)}
                    type="button"
                    title="Change or override candidate qualification tag"
                  >
                    <GraduationCap size={12} /> {selected.qualification || "Qualification"}
                  </button>
                  {showQualEditor && (
                    <div className="tagDropdown qualDropdown">
                      <div className="tagDropdownHeader" style={{ padding: '6px 10px', fontSize: '11px', fontWeight: 700, color: 'var(--muted)', borderBottom: '1px solid var(--line)' }}>
                        Select Qualification:
                      </div>
                      {[
                        { name: "B.Tech / B.E.", type: "Degree", rank: 4 },
                        { name: "Diploma", type: "Diploma", rank: 3 },
                        { name: "M.Tech / M.E.", type: "Post Graduate", rank: 5 },
                        { name: "MBA / PG", type: "Post Graduate", rank: 5 },
                        { name: "Ph.D", type: "Post Graduate", rank: 6 },
                        { name: "Degree (B.Sc/Other)", type: "Degree", rank: 4 },
                        { name: "ITI", type: "ITI", rank: 2 },
                        { name: "10+2 / Intermediate", type: "High School", rank: 1 },
                        { name: "Other", type: "Other", rank: 0 },
                      ].map((opt) => (
                        <button
                          key={opt.name}
                          className={`tagOption ${selected.qualification === opt.name ? "active" : ""}`}
                          onClick={() => {
                            updateSelected({
                              qualification: opt.name,
                              qualificationType: opt.type,
                              qualificationRank: opt.rank,
                            } as Partial<Candidate>);
                            setShowQualEditor(false);
                          }}
                          type="button"
                        >
                          {opt.type === "Diploma" ? "📜 " : opt.type === "ITI" ? "🛠️ " : "🎓 "}
                          {opt.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Sub-section Tag Editor */}
                <div className="tagEditorWrapper">
                  <button
                    className={`badge ${selected.discipline.toLowerCase().replace(/[^a-z0-9]/g, "")} tagEditorBtn`}
                    onClick={() => setShowTagEditor(!showTagEditor)}
                    type="button"
                    title="Change tag"
                  >
                    <Tag size={12} /> {selected.discipline}
                  </button>
                  {showTagEditor && (
                    <div className="tagDropdown">
                      {PRESET_TAGS.map((tag) => (
                        <button
                          key={tag}
                          className={`tagOption ${selected.discipline === tag ? "active" : ""}`}
                          onClick={() => {
                            updateSelected({ discipline: tag } as Partial<Candidate>);
                            setShowTagEditor(false);
                          }}
                          type="button"
                        >
                          {tag}
                        </button>
                      ))}
                      <div className="tagCustomInput">
                        <input
                          type="text"
                          placeholder="Custom tag..."
                          value={customTagInput}
                          onChange={(e) => setCustomTagInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && customTagInput.trim()) {
                              updateSelected({ discipline: customTagInput.trim() } as Partial<Candidate>);
                              setCustomTagInput("");
                              setShowTagEditor(false);
                            }
                          }}
                        />
                        <button
                          type="button"
                          disabled={!customTagInput.trim()}
                          onClick={() => {
                            if (customTagInput.trim()) {
                              updateSelected({ discipline: customTagInput.trim() } as Partial<Candidate>);
                              setCustomTagInput("");
                              setShowTagEditor(false);
                            }
                          }}
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Industry Tag Editor */}
                <div className="projectDropdownWrapper">
                  <select
                    value={selected.industry || ""}
                    onChange={(e) => updateSelected({ industry: e.target.value } as Partial<Candidate>)}
                    className="candidateProjectSelect"
                    title="Assign Industry"
                  >
                    <option value="">No Industry</option>
                    {industries.map((ind) => (
                      <option key={ind} value={ind}>{ind}</option>
                    ))}
                  </select>
                </div>

                {/* WhatsApp Quick Trigger */}
                <button
                  type="button"
                  className="contactChip whatsapp"
                  onClick={() => openWhatsAppDialog(selected)}
                  title={`WhatsApp candidate ${selected.phone ? `(${selected.phone})` : ""} via recruiter line ${RECRUITER_WHATSAPP_NUMBER}`}
                >
                  <MessageCircle size={13} />
                  <span>{selected.phone ? formatPhoneDisplay(selected.phone) : "WhatsApp"}</span>
                </button>

                {/* Email Quick Trigger */}
                <button
                  type="button"
                  className="contactChip email"
                  onClick={() => openEmailDialog(selected)}
                  title={`Email candidate ${selected.email ? `(${selected.email})` : ""}`}
                >
                  <Mail size={13} />
                  <span>{selected.email ? selected.email : "Email"}</span>
                </button>

                {/* Recruiter Dispatch Badge */}
                <span className="linkedDispatchBadge" title="Recruiter dispatch line linked to candidate communications">
                  <Phone size={10} /> Line: <strong>{RECRUITER_WHATSAPP_NUMBER}</strong>
                </span>

              </div>
            </div>

            {/* ── Document toolbar ── */}
            <div className="docToolbar noPrint">
              {/* Left: view-mode pill tabs */}
              <div className="viewTabs">
                <button
                  className={`viewTab${viewMode === "preview" ? " activeViewTab" : ""}`}
                  onClick={() => setViewMode("preview")}
                  type="button"
                  title="Document preview (PDF, Word, or Text)"
                >
                  <FileText size={14} /> Original Preview
                </button>
                <button
                  className={`viewTab${viewMode === "tata" ? " activeViewTab" : ""}`}
                  onClick={() => setViewMode("tata")}
                  type="button"
                  title="Structured CV breakdown with qualifications, experience and projects"
                >
                  <Table size={14} /> Structured CV
                </button>
                {selected.rawText && (
                  <button
                    className={`viewTab${viewMode === "text" ? " activeViewTab" : ""}`}
                    onClick={() => setViewMode("text")}
                    type="button"
                    title="Extracted text"
                  >
                    <FileCode size={14} /> Text
                  </button>
                )}
              </div>

              {/* Right: context-sensitive actions */}
              <div className="docActions">
                {viewMode !== "tata" && (
                  <>
                    <button onClick={() => openOriginal(selected)} type="button" className="docBtn">
                      <ExternalLink size={15} /> Open
                    </button>
                    <button onClick={() => downloadOriginal(selected)} type="button" className="docBtn">
                      <Download size={15} /> Download
                    </button>
                  </>
                )}

                {viewMode === "tata" && (
                  <>
                    <button
                      type="button"
                      className="docBtn syncBtn"
                      title="Re-parse experience section from the original CV text"
                      onClick={() => {
                        if (confirm("Re-sync experience from CV? This will overwrite the Experience field.")) {
                          const freshParsed = parseTataCv(selected.rawText, selected.displayName);
                          updateSelected({
                            tataData: {
                              ...selected.tataData!,
                              employmentRecordRaw: freshParsed.employmentRecordRaw,
                              employmentRecord: freshParsed.employmentRecord,
                            }
                          });
                        }
                      }}
                    >
                      <RefreshCw size={15} /> Sync Experience
                    </button>
                    <button
                      type="button"
                      className="docBtn wordBtn"
                      onClick={() => {
                        const element = document.querySelector('.tataContainer');
                        if (!element) return;
                        const clone = element.cloneNode(true) as HTMLElement;
                        const originalTextareas = element.querySelectorAll('textarea');
                        clone.querySelectorAll('textarea').forEach((ta, i) => {
                          const div = document.createElement('div');
                          div.innerText = (originalTextareas[i] as HTMLTextAreaElement).value;
                          div.style.whiteSpace = 'pre-wrap';
                          ta.parentNode?.replaceChild(div, ta);
                        });
                        const originalInputs = element.querySelectorAll('input');
                        clone.querySelectorAll('input').forEach((inp, i) => {
                          const span = document.createElement('span');
                          span.innerText = (originalInputs[i] as HTMLInputElement).value;
                          inp.parentNode?.replaceChild(span, inp);
                        });
                        clone.querySelectorAll('.noPrint').forEach(el => el.parentNode?.removeChild(el));
                        const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>TATA CV</title><style>body{font-family:Arial,sans-serif;font-size:11px}table{width:100%;border-collapse:collapse}td{padding:4px;border:1px solid #ccc;vertical-align:top}</style></head><body>${clone.innerHTML}</body></html>`;
                        const a = document.createElement('a');
                        a.href = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(html);
                        a.download = `${selected.displayName || 'Candidate'}_TATA_CV.doc`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                      }}
                    >
                      <FileDown size={15} /> Export Word
                    </button>
                    <button
                      type="button"
                      className="docBtn printBtn"
                      onClick={() => window.print()}
                    >
                      <Printer size={15} /> Print
                    </button>
                  </>
                )}

                {userEmail === "admin@cvreview.com" && (
                  <button
                    className="docBtn dangerBtn"
                    onClick={() => handleDeleteCandidate(selected.id)}
                    type="button"
                  >
                    <Trash2 size={15} /> Remove
                  </button>
                )}
              </div>
            </div>

            {/* CV preview — takes maximum available space */}
            {selected.parseWarning && viewMode !== "tata" && (
              <p className="parseWarning noPrint">{selected.parseWarning}</p>
            )}
            <div className="cvViewerFull" aria-label="Original CV preview">
              {query.trim() && (
                <div className="cvKeywordMatchBar noPrint">
                  <div className="cvKeywordMatchInfo">
                    <Search size={14} style={{ color: "#2563eb" }} />
                    <span>
                      Keywords in CV: <strong>&quot;{query.trim()}&quot;</strong>
                    </span>
                    {matchedKeywordsCount > 0 ? (
                      <span className="cvKeywordMatchBadge">
                        {matchedKeywordsCount} match{matchedKeywordsCount === 1 ? "" : "es"} found
                      </span>
                    ) : (
                      <span className="cvKeywordMatchBadge zero">Matched via profile/metadata</span>
                    )}
                  </div>
                  <div className="cvKeywordMatchActions">
                    {matchedKeywordsCount > 0 && (
                      <>
                        <button
                          type="button"
                          className="matchNavBtn"
                          onClick={() => handleNavigateMatch("prev")}
                          title="Previous match in CV"
                        >
                          <ChevronUp size={13} /> Prev
                        </button>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#854d0e" }}>
                          {activeMatchIndex + 1} / {matchedKeywordsCount}
                        </span>
                        <button
                          type="button"
                          className="matchNavBtn"
                          onClick={() => handleNavigateMatch("next")}
                          title="Next match in CV"
                        >
                          <ChevronDown size={13} /> Next
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className={`matchViewToggleBtn ${viewMode === "preview" ? "active" : ""}`}
                      onClick={() => setViewMode("preview")}
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      className={`matchViewToggleBtn ${viewMode === "text" ? "active" : ""}`}
                      onClick={() => setViewMode("text")}
                      title="View all highlighted occurrences directly in extracted CV text"
                    >
                      Highlighted Text ({matchedKeywordsCount})
                    </button>
                    <button
                      type="button"
                      className={`matchViewToggleBtn ${viewMode === "tata" ? "active" : ""}`}
                      onClick={() => setViewMode("tata")}
                    >
                      Structured CV
                    </button>
                  </div>
                </div>
              )}

              {viewMode === "preview" && (localBlobUrl || selected.previewUrl || selected.previewBase64) ? (
                isBlobLoading ? (
                  <div className="blankState compact">
                    <RefreshCw size={26} className="spinIcon" style={{ color: "var(--primary)" }} />
                    <p>Loading document preview...</p>
                  </div>
                ) : (
                  <iframe
                    ref={iframeRef}
                    className="pdfFrameFull"
                    src={iframeSrc}
                    title={selected.fileName}
                    onLoad={highlightIframeContent}
                  />
                )
              ) : viewMode === "text" && selected.rawText ? (
                <div style={{ padding: "24px 32px", overflowY: "auto", height: "100%", background: "#ffffff" }}>
                  <pre
                    className="originalTextFull"
                    style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: "1.7", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace", fontSize: "13.5px" }}
                  >
                    {highlightTextWithKeywords(selected.rawText, query, activeMatchIndex)}
                  </pre>
                </div>
              ) : viewMode === "tata" ? (
                <TataCvPreview candidate={selected} updateSelected={updateSelected} searchQuery={query} />
              ) : viewMode === "preview" && selected.rawText ? (
                <div style={{ padding: "30px", maxWidth: "800px", margin: "0 auto", width: "100%", overflowY: "auto", background: "#fff", height: "100%" }}>
                  <pre style={{ whiteSpace: "pre-wrap", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", fontSize: "14px", lineHeight: "1.6", color: "#1f2937" }}>
                    {highlightTextWithKeywords(selected.rawText, query, activeMatchIndex)}
                  </pre>
                </div>
              ) : (
                <div className="blankState compact">
                  <FileText size={34} />
                  <h2>Preview unavailable</h2>
                  <p>You can review the structured CV data extracted from this document.</p>
                  <button
                    type="button"
                    className="docBtn"
                    style={{ marginTop: 12, padding: "8px 16px", background: "var(--primary)", color: "#fff", borderColor: "var(--primary)" }}
                    onClick={() => setViewMode("tata")}
                  >
                    <Table size={15} /> Open Structured CV
                  </button>
                </div>
              )}
            </div>

            {selected.comments && (
              <div className="floatingCommentBubble noPrint">
                <MessageSquare size={16} style={{ marginTop: '2px', flexShrink: 0, color: 'var(--accent)' }} />
                <div>
                  <strong>Comments:</strong>
                  <p style={{ margin: '4px 0 0 0', whiteSpace: 'pre-wrap', fontSize: '13px' }}>{selected.comments}</p>
                </div>
              </div>
            )}

            {/* Bottom: Comments + Action buttons */}
            <div className="reviewBottomBar">
              <div className="reviewCommentsArea">
                <textarea
                  onChange={(event) => updateSelected({ comments: event.target.value })}
                  placeholder="Add review comments or decision rationale..."
                  value={selected.comments || ""}
                  rows={1}
                  className="compactCommentTextarea"
                />
              </div>
              <div className="reviewActionsRow">
                <button
                  className="actionBtn whatsapp"
                  onClick={() => openWhatsAppDialog(selected)}
                  type="button"
                  title={`WhatsApp ${selected.displayName} (Recruiter line: ${RECRUITER_WHATSAPP_NUMBER})`}
                >
                  <MessageCircle size={14} /> WhatsApp
                </button>
                <button
                  className="actionBtn email"
                  onClick={() => openEmailDialog(selected)}
                  type="button"
                  title={`Send Email to ${selected.displayName}`}
                >
                  <Mail size={14} /> Email
                </button>
                <button className="actionBtn accept" onClick={() => submitAction("accepted")} type="button">
                  <Check size={14} /> Accept
                </button>
                <button className="actionBtn acceptComments" onClick={() => submitAction("accepted_with_comments")} type="button">
                  <MessageSquare size={14} /> Accept with comments
                </button>
                <button className="actionBtn commentsOnly" onClick={() => submitAction("comments_only")} type="button">
                  <MessageSquare size={14} /> Comments only
                </button>
                <button className="actionBtn danger" onClick={() => submitAction("rejected")} type="button">
                  <X size={14} /> Reject
                </button>
              </div>
              {isSending && <p className="sending" style={{ fontSize: '11px', margin: 0 }}>Saving...</p>}
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

      {/* ── WhatsApp Communication Modal ── */}
      {showWhatsAppModal && selected && (
        <div className="commModalOverlay" onClick={() => setShowWhatsAppModal(false)}>
          <div className="commModalCard" onClick={(e) => e.stopPropagation()}>
            <div className="commModalHeader">
              <div className="commModalHeaderTitle">
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#25D366", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <MessageCircle size={16} />
                </div>
                <div>
                  <div style={{ lineHeight: 1.2 }}>WhatsApp Candidate</div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)", marginTop: 2 }}>
                    Recipient: <strong>{selected.displayName}</strong>
                  </div>
                </div>
              </div>
              <button type="button" className="commModalCloseBtn" onClick={() => setShowWhatsAppModal(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="commModalBody">
              <div className="commDispatchBanner">
                <span>
                  Linked Dispatch Line: <strong>{RECRUITER_WHATSAPP_NUMBER}</strong>
                </span>
                <span style={{ fontSize: 11, background: "#dcfce7", padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>
                  Official Recruiter WhatsApp
                </span>
              </div>

              <div className="commInputGroup">
                <label>Candidate WhatsApp / Phone Number</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="text"
                    className="commInput"
                    placeholder="e.g. +91 98765 43210 or 9876543210"
                    value={whatsAppPhone}
                    onChange={(e) => setWhatsAppPhone(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  {whatsAppPhone && (
                    <span style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>
                      Target: {sanitizePhoneForWhatsApp(whatsAppPhone)}
                    </span>
                  )}
                </div>
                {!selected.phone && (
                  <small style={{ color: "#d97706", fontSize: 11 }}>
                    * No phone number auto-detected from CV. Enter candidate number above to dispatch.
                  </small>
                )}
              </div>

              <div className="commInputGroup">
                <label>Message Templates</label>
                <div className="commTemplateRow">
                  <button
                    type="button"
                    className={`commTemplateBtn ${whatsAppTemplate === "shortlisted" ? "whatsappActive" : ""}`}
                    onClick={() => handleWhatsAppTemplateChange("shortlisted")}
                  >
                    Shortlisted Notice
                  </button>
                  <button
                    type="button"
                    className={`commTemplateBtn ${whatsAppTemplate === "interview" ? "whatsappActive" : ""}`}
                    onClick={() => handleWhatsAppTemplateChange("interview")}
                  >
                    Interview Call
                  </button>
                  <button
                    type="button"
                    className={`commTemplateBtn ${whatsAppTemplate === "documents" ? "whatsappActive" : ""}`}
                    onClick={() => handleWhatsAppTemplateChange("documents")}
                  >
                    Document Request
                  </button>
                  <button
                    type="button"
                    className={`commTemplateBtn ${whatsAppTemplate === "custom" ? "whatsappActive" : ""}`}
                    onClick={() => handleWhatsAppTemplateChange("custom")}
                  >
                    Custom Note
                  </button>
                </div>
              </div>

              <div className="commInputGroup">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label>WhatsApp Message Body</label>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>{whatsAppMessage.length} chars</span>
                </div>
                <textarea
                  className="commTextarea"
                  rows={7}
                  value={whatsAppMessage}
                  onChange={(e) => setWhatsAppMessage(e.target.value)}
                  placeholder="Type WhatsApp message here..."
                />
              </div>
            </div>

            <div className="commModalFooter">
              <button type="button" className="commModalBtn" onClick={handleCopyWhatsApp} title="Copy details to clipboard">
                <Copy size={14} /> Copy
              </button>
              <button
                type="button"
                className="commModalBtn primaryWhatsapp"
                onClick={() => handleSendWhatsApp("web")}
                title="Launch in WhatsApp Web"
              >
                <MessageCircle size={14} /> WhatsApp Web
              </button>
              <button
                type="button"
                className="commModalBtn primaryWhatsapp"
                style={{ background: "#059669" }}
                onClick={() => handleSendWhatsApp("app")}
                title="Open via WhatsApp Mobile / Desktop App (wa.me)"
              >
                <Send size={14} /> WhatsApp App
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Email Communication Modal ── */}
      {showEmailModal && selected && (
        <div className="commModalOverlay" onClick={() => setShowEmailModal(false)}>
          <div className="commModalCard" onClick={(e) => e.stopPropagation()}>
            <div className="commModalHeader">
              <div className="commModalHeaderTitle">
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#2563eb", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Mail size={16} />
                </div>
                <div>
                  <div style={{ lineHeight: 1.2 }}>Email Candidate</div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)", marginTop: 2 }}>
                    Recipient: <strong>{selected.displayName}</strong>
                  </div>
                </div>
              </div>
              <button type="button" className="commModalCloseBtn" onClick={() => setShowEmailModal(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="commModalBody">
              <div className="commDispatchBanner" style={{ background: "#eff6ff", borderColor: "#bfdbfe", color: "#1e40af" }}>
                <span>
                  Recruiter Line Linked: <strong>{RECRUITER_WHATSAPP_NUMBER}</strong> (included in signature)
                </span>
              </div>

              <div className="commInputGroup">
                <label>Candidate Email Address</label>
                <input
                  type="email"
                  className="commInput"
                  placeholder="candidate@example.com"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                />
                {!selected.email && (
                  <small style={{ color: "#d97706", fontSize: 11 }}>
                    * No email detected in CV. Enter recipient email above.
                  </small>
                )}
              </div>

              <div className="commInputGroup">
                <label>Subject</label>
                <input
                  type="text"
                  className="commInput"
                  placeholder="Email subject..."
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                />
              </div>

              <div className="commInputGroup">
                <label>Message Templates</label>
                <div className="commTemplateRow">
                  <button
                    type="button"
                    className={`commTemplateBtn ${emailTemplate === "shortlisted" ? "active" : ""}`}
                    onClick={() => handleEmailTemplateChange("shortlisted")}
                  >
                    Shortlisted Notice
                  </button>
                  <button
                    type="button"
                    className={`commTemplateBtn ${emailTemplate === "interview" ? "active" : ""}`}
                    onClick={() => handleEmailTemplateChange("interview")}
                  >
                    Interview Call
                  </button>
                  <button
                    type="button"
                    className={`commTemplateBtn ${emailTemplate === "documents" ? "active" : ""}`}
                    onClick={() => handleEmailTemplateChange("documents")}
                  >
                    Document Request
                  </button>
                  <button
                    type="button"
                    className={`commTemplateBtn ${emailTemplate === "custom" ? "active" : ""}`}
                    onClick={() => handleEmailTemplateChange("custom")}
                  >
                    Custom Email
                  </button>
                </div>
              </div>

              <div className="commInputGroup">
                <label>Email Body</label>
                <textarea
                  className="commTextarea"
                  rows={8}
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  placeholder="Type email body here..."
                />
              </div>
            </div>

            <div className="commModalFooter">
              <button type="button" className="commModalBtn" onClick={handleCopyEmail} title="Copy email text">
                <Copy size={14} /> Copy
              </button>
              <button
                type="button"
                className="commModalBtn"
                onClick={handleLaunchEmailClient}
                title="Open prefilled in native Mail app (Outlook, Apple Mail, Thunderbird)"
              >
                <ExternalLink size={14} /> Open in Mail App
              </button>
              <button
                type="button"
                className="commModalBtn primaryEmail"
                disabled={isSendingEmail}
                onClick={handleSendEmailApi}
                title="Send email via SMTP/Resend API"
              >
                <Send size={14} /> {isSendingEmail ? "Sending..." : "Send Email"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <button className="toast" onClick={() => setToast("")} type="button">
          {toast}
        </button>
      )}
    </main>
  );
}
