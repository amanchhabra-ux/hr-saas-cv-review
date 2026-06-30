export interface TataCvData {
  proposedPosition: string;
  nameOfFirm: string;
  nameOfStaff: string;
  dob: string;
  nationality: string;
  education: string;
  membership: string;
  otherTraining: string;
  countries: string;
  languages: {
    english: { reading: string; speaking: string; writing: string };
    hindi: { reading: string; speaking: string; writing: string };
    others: Array<{ name: string; reading: string; speaking: string; writing: string }>;
  };
  employmentRecordRaw: string;
  employmentRecord: Array<{
    id: string;
    period: string;
    employer: string;
    projects: Array<{
      id: string;
      projectName: string;
      location: string;
      client: string;
      features: string;
      positionHeld: string;
      responsibilities: string;
    }>;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants & helpers
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_RE =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

/** Matches "Month YYYY – Month YYYY / Present / Till Date / Till Now" */
const PERIOD_FULL_RE = new RegExp(
  `${MONTH_RE}\\.?\\s+(?:19|20)\\d{2}\\s*[–\\-]\\s*(?:${MONTH_RE}\\.?\\s+(?:19|20)\\d{2}|present|till\\s+(?:date|now)|current|date)`,
  "gi"
);

/** Matches standalone year ranges: "2018 – 2021 / Present" */
const PERIOD_YEAR_RE =
  /\b(?:19|20)\d{2}\s*[-–]\s*(?:(?:19|20)\d{2}|present|till\s+(?:date|now)|current)\b/gi;

/** Matches "(N years M months)" style duration from LinkedIn exports */
const DURATION_RE =
  /\((?:\d+\s+years?\s*)?(?:\d+\s+months?)?\)/gi;

const SECTION_HEADS = [
  "professional experience",
  "experience",
  "employment",
  "work experience",
  "education",
  "academic",
  "qualification",
  "personal details",
  "personal information",
  "core competencies",
  "professional summary",
  "summary",
  "objective",
  "declaration",
  "membership",
  "professional membership",
  "training",
  "certification",
  "languages",
  "key skills",
  "skills",
  "technical qualification",
  "academic qualifications",
  "roles",
  "computer skills",
  "strengths",
];

function isSectionHead(line: string) {
  const l = line.toLowerCase().trim();
  return SECTION_HEADS.some((h) => {
    // exact match or "h" is prefix (e.g. "professional experience" matches "professional experience (2022)")
    return l === h || l.startsWith(h + " ") || l.startsWith(h + ":");
  });
}

/** Remove leading bullets / numbering */
function cleanBullet(line: string) {
  return line.replace(/^[\s\u2022\u25aa\u25cf\u2023\u2043\u2219\-\*]+\s*/, "").trim();
}

/** Try to extract a period from a line; returns {before, period, after} or null */
function extractPeriod(line: string): { before: string; period: string; after: string } | null {
  PERIOD_FULL_RE.lastIndex = 0;
  let m = PERIOD_FULL_RE.exec(line);
  if (m) {
    return {
      before: line.slice(0, m.index).trim(),
      period: m[0].trim(),
      after: line.slice(m.index + m[0].length).trim(),
    };
  }
  PERIOD_YEAR_RE.lastIndex = 0;
  m = PERIOD_YEAR_RE.exec(line);
  if (m) {
    return {
      before: line.slice(0, m.index).trim(),
      period: m[0].trim(),
      after: line.slice(m.index + m[0].length).trim(),
    };
  }
  return null;
}

/** Remove "(5 years 6 months)" style duration annotations from a string */
function stripDuration(s: string) {
  return s.replace(DURATION_RE, "").trim();
}

/** Generate a deterministic-enough ID without crypto (works server & client) */
function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main parser
// ─────────────────────────────────────────────────────────────────────────────

export function parseTataCv(rawText: string, defaultName = ""): TataCvData {
  if (!rawText) {
    return emptyTataData(defaultName);
  }

  // ── Normalise ──────────────────────────────────────────────────────────────
  const text = rawText
    .replace(/[\u2013\u2014\u2212]/g, "-") // translate en-dash, em-dash, minus to normal ASCII hyphen
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u024F]/g, " ") // strip non-printable & emoji
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")       // collapse spaces/tabs
    .replace(/\n{3,}/g, "\n\n");   // collapse blank lines

  const rawLines = text.split("\n").map((l) => l.trim());
  const lines = rawLines.filter((l) => l.length > 0);
  const lower = text.toLowerCase();

  // ── 1. Name ───────────────────────────────────────────────────────────────
  let nameOfStaff = "";

  // a) Explicit "Name:" field  (common in PDFs)
  //    Stop at newline so we don't bleed into "Father's Name" etc.
  const nameFieldM = text.match(
    /(?:^|\n)\s*(?:^name|full\s+name|candidate(?:'s)?\s+name)\s*:\s*([A-Za-z][A-Za-z .]{2,45}?)(?:\s*\n|$)/im
  );
  if (nameFieldM) nameOfStaff = nameFieldM[1].trim();

  // b) First ALL-CAPS line in first 8 lines (ignores "TOP SKILLS", "CONTACT" etc.)
  if (!nameOfStaff) {
    const skipWords = /^(contact|top\s+skills|skills|summary|experience|education|objective|profile|languages|page\s+\d)/i;
    for (const l of lines.slice(0, 8)) {
      if (/^[A-Z][A-Z\s.]{3,44}$/.test(l) && !skipWords.test(l)) {
        nameOfStaff = l; break;
      }
    }
  }

  // c) Fall back to defaultName (strip file extension)
  if (!nameOfStaff && defaultName) {
    nameOfStaff = defaultName.replace(/\.(pdf|docx?|rtf|txt|odt)$/i, "").trim();
  }

  // ── 2. Proposed Position ──────────────────────────────────────────────────
  let proposedPosition = "";

  const posM = text.match(
    /position\s+(?:applied\s+for|for\s+this\s+project|applied)\s*:?\s*([^\n]{3,80})/i
  );
  if (posM) {
    proposedPosition = posM[1].trim().replace(/\.$/, "");
  }

  // If not found, look for a designation / role line near the name
  if (!proposedPosition) {
    const nameIdx = lines.findIndex((l) => l === nameOfStaff);
    const searchFrom = nameIdx !== -1 ? nameIdx + 1 : 0;
    for (const l of lines.slice(searchFrom, searchFrom + 6)) {
      if (
        l.length < 100 &&
        /\b(engineer|manager|officer|supervisor|consultant|specialist|director|executive|deputy|senior|junior|general\s+manager|site|design)\b/i.test(l) &&
        !isSectionHead(l)
      ) {
        proposedPosition = l.replace(/[|•·]/g, "").replace(/\s+/g, " ").trim();
        break;
      }
    }
  }

  // ── 3. Date of Birth ──────────────────────────────────────────────────────
  let dob = "";
  const dobM = text.match(
    /(?:date\s+of\s+birth|dob|birth\s*date|born)\s*:?\s*([^\n]{4,30})/i
  );
  if (dobM) {
    dob = dobM[1].trim().replace(/[.,;]+$/, "");
  } else {
    // bare date pattern dd Month YYYY
    const dateM = text.match(/\b(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(?:19|20)\d{2})\b/i);
    if (dateM) dob = dateM[1];
  }

  // ── 4. Nationality ────────────────────────────────────────────────────────
  let nationality = "";
  const natM = text.match(/(?:nationality|citizenship)\s*:?\s*([^\n]{2,30})/i);
  if (natM) {
    nationality = natM[1].trim().replace(/[.,;]+$/, "");
  } else if (/\bindian\b/i.test(text)) {
    nationality = "Indian";
  }

  // ── 5. Countries ──────────────────────────────────────────────────────────
  let countries = "";
  const cntM = text.match(/countries?\s+(?:of\s+)?(?:work\s+)?experience\s*:?\s*([^\n]+)/i);
  if (cntM) {
    countries = cntM[1].trim();
  } else if (nationality) {
    // Derive from nationality
    const natLower = nationality.toLowerCase();
    if (natLower.includes("indian")) countries = "India";
    else countries = nationality;
  }

  // ── 6. Education ──────────────────────────────────────────────────────────
  let education = "";
  const EDU_HEADS = /^(?:education|academic\s+qualifications?|qualifications?|scholastic)/i;
  const eduStart = lines.findIndex((l) => EDU_HEADS.test(l));
  if (eduStart !== -1) {
    const eduLines: string[] = [];
    for (let i = eduStart + 1; i < lines.length && i < eduStart + 30; i++) {
      if (isSectionHead(lines[i]) && i > eduStart + 1) break;
      const cleaned = cleanBullet(lines[i]);
      if (cleaned) eduLines.push(cleaned);
    }
    education = eduLines.join("\n").trim();
  }

  // ── 7. Technical / Other Training ────────────────────────────────────────
  let otherTraining = "";
  const TRAIN_HEADS = /^(?:technical\s+qualifications?|other\s+training|training|certifications?|courses?)/i;
  const trainStart = lines.findIndex((l) => TRAIN_HEADS.test(l));
  if (trainStart !== -1) {
    const trainLines: string[] = [];
    for (let i = trainStart + 1; i < lines.length && i < trainStart + 20; i++) {
      if (isSectionHead(lines[i]) && i > trainStart + 1) break;
      const cleaned = cleanBullet(lines[i]);
      if (cleaned) trainLines.push(cleaned);
    }
    otherTraining = trainLines.join("\n").trim();
  }

  // ── 8. Membership ─────────────────────────────────────────────────────────
  let membership = "";
  const MEM_HEADS = /^(?:membership|professional\s+(?:membership|society|affiliations?)|associations?)/i;
  const memStart = lines.findIndex((l) => MEM_HEADS.test(l));
  if (memStart !== -1) {
    const memLines: string[] = [];
    for (let i = memStart + 1; i < lines.length && i < memStart + 15; i++) {
      if (isSectionHead(lines[i]) && i > memStart + 1) break;
      const cleaned = cleanBullet(lines[i]);
      if (cleaned) memLines.push(cleaned);
    }
    membership = memLines.join("\n").trim();
  }

  // ── 9. Languages ──────────────────────────────────────────────────────────
  const english = { reading: "", speaking: "", writing: "" };
  const hindi = { reading: "", speaking: "", writing: "" };
  const others: TataCvData["languages"]["others"] = [];

  // Detect languages mentioned (LinkedIn format: "English (Native or Bilingual)")
  if (/\benglish\b/i.test(text)) {
    english.reading = "Excellent"; english.speaking = "Excellent"; english.writing = "Excellent";
  }
  if (/\bhindi\b/i.test(text)) {
    hindi.reading = "Good"; hindi.speaking = "Good"; hindi.writing = "Good";
  }
  const extraLangs = [
    "Marathi", "Bengali", "Telugu", "Tamil", "Kannada", "Malayalam",
    "Gujarati", "Punjabi", "Urdu", "Odia", "French", "German", "Spanish",
  ];
  for (const lang of extraLangs) {
    if (new RegExp(`\\b${lang}\\b`, "i").test(text)) {
      others.push({ name: lang, reading: "Good", speaking: "Good", writing: "Good" });
    }
  }

  // ── 10. Employment Record ─────────────────────────────────────────────────
  const EXP_HEADS =
    /^(?:\d+[\s.)]*)?(?:professional\s+experience|experience|employment(?:\s+record)?|work\s+experience|work\s+history|employment\s+history|career\s+history)/i;
  const END_HEADS =
    /^(?:\d+[\s.)]*)?(?:education|academic|qualification|personal\s+(?:details|information)|declaration|membership|training|key\s+skills|skills|computer\s+skills|strengths|roles?\s*&?\s*responsibilities?)/i;

  const expStart = lines.findIndex((l) => EXP_HEADS.test(l));
  const expEndIdx = lines.findIndex((l, i) => i > expStart + 1 && END_HEADS.test(l));
  const expLines = expStart !== -1
    ? lines.slice(expStart + 1, expEndIdx !== -1 ? expEndIdx : lines.length)
    : lines; // If no section header, try whole doc

  let employmentRecord = parseEmploymentBlocks(expLines, text);

  // Fallback: If no structured employment blocks were found but an Experience section exists,
  // dump the entire section text into a generic employment block.
  if (employmentRecord.length === 0 && expStart !== -1 && expLines.length > 0) {
    employmentRecord = [{
      id: uid(),
      period: "Not specified",
      employer: "Experience Section",
      projects: [
        {
          id: uid(),
          projectName: "",
          location: "",
          client: "",
          features: "",
          positionHeld: "",
          responsibilities: expLines.join("\n").trim(),
        }
      ]
    }];
  }

  // ── 11. Assemble ──────────────────────────────────────────────────────────
  return {
    proposedPosition,
    nameOfFirm: "TATA Consulting Engineers Limited",
    nameOfStaff,
    dob,
    nationality,
    education,
    membership,
    otherTraining,
    countries,
    languages: { english, hindi, others },
    employmentRecordRaw: expLines.join("\n").trim(),
    employmentRecord,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Employment block parser  — handles both DOCX & LinkedIn-style PDF
// ─────────────────────────────────────────────────────────────────────────────

// Detect LinkedIn-style PDF: company → title → period (title is above period, company above title)
function isLinkedInStyle(expLines: string[]): boolean {
  // In LinkedIn exports, periods tend to appear BELOW the job title (not inline)
  let periodsAbove = 0;
  let periodsBelow = 0;
  for (let i = 0; i < expLines.length; i++) {
    const hit = extractPeriod(expLines[i]);
    if (hit) {
      if (hit.before.trim().length < 8) {
        const prev = expLines[i - 1] || "";
        if (/\b(engineer|manager|officer|consultant|director|executive|supervisor|developer|analyst|senior|junior|lead|civil|electrical|deputy)/i.test(prev)) {
          periodsBelow++;
        } else {
          periodsAbove++;
        }
      } else {
        periodsAbove++;
      }
    }
  }
  return periodsBelow > periodsAbove;
}

function parseEmploymentBlocks(
  expLines: string[],
  fullText?: string
): TataCvData["employmentRecord"] {
  // ── Pass 1: segment by period ────────────────────────────────────────────
  interface Block {
    period: string;
    employer: string;
    position: string;
    bodyLines: string[];
  }

  const blocks: Block[] = [];
  let cur: Block | null = null;
  let prevNonPeriodLine = "";
  let prevPrevNonPeriodLine = "";

  const linkedIn = isLinkedInStyle(expLines);

  // Pre-process: split lines that contain TWO date ranges separated by "&"
  // e.g. "CompanyAug 2008 – Jul 2011 & Sep 2011 – Sep 2015 | Location"
  // → ["CompanyAug 2008 – Jul 2011", "CompanyAug Sep 2011 – Sep 2015 | Location"]
  const processedLines: string[] = [];
  for (const line of expLines) {
    const DOUBLE_PERIOD_RE = new RegExp(
      `(${MONTH_RE}\.?\\s+(?:19|20)\\d{2}\\s*[–\\-]\\s*${MONTH_RE}\.?\\s+(?:19|20)\\d{2})\\s*[&]\\s*(${MONTH_RE}\.?\\s+(?:19|20)\\d{2}\\s*[–\\-]\\s*(?:${MONTH_RE}\.?\\s+(?:19|20)\\d{2}|present|till\\s+(?:date|now)|current))`,
      "i"
    );
    const dp = DOUBLE_PERIOD_RE.exec(line);
    if (dp) {
      // First period: everything up to & (including first period)
      processedLines.push(line.slice(0, dp.index + dp[1].length).trim());
      // Second period: everything from second period onwards
      processedLines.push(line.slice(dp.index + dp[1].length).replace(/^\s*[&]\s*/, "").trim());
    } else {
      processedLines.push(line);
    }
  }

  for (let i = 0; i < processedLines.length; i++) {
    const line = processedLines[i];
    const hit = extractPeriod(line);

    if (hit) {
      // Flush current block
      if (cur) blocks.push(cur);

      let employer: string;
      let position: string;

      if (linkedIn) {
        // LinkedIn layout: company is 2 lines above period, title is 1 line above
        employer = prevPrevNonPeriodLine.replace(DURATION_RE, "").trim();
        position = prevNonPeriodLine.replace(DURATION_RE, "").trim();
        // Validate: if employer looks like a title and position looks like a company, swap
        const employerLooksLikeTitle = /\b(engineer|manager|officer|consultant|director|executive|supervisor|deputy|senior|junior|civil|electrical|lead)\b/i.test(employer);
        const positionLooksLikeCompany = /\b(ltd|limited|pvt|private|inc|corp|company|construction|infra|projects|associates|engineers|consultant|energy|development)\b/i.test(position);
        if (employerLooksLikeTitle && positionLooksLikeCompany) {
          [employer, position] = [position, employer];
        }
      } else {
        // DOCX layout: employer is concatenated before period on same line, or on previous line
        employer = (hit.before || prevNonPeriodLine || "").replace(DURATION_RE, "").trim();
        position = hit.before ? prevNonPeriodLine : prevPrevNonPeriodLine;
      }

      // Never use a section heading or a period-containing line as position/employer
      if (isSectionHead(position) || extractPeriod(position)) position = "";
      if (isSectionHead(employer) || extractPeriod(employer)) employer = "";
      if (position === employer) position = "";

      // Location hint after period (e.g. "| Bhuj, Gujarat" or "(5 years 4 months)")
      const afterClean = hit.after
        .replace(/^[|,;\s]+/, "")
        .replace(DURATION_RE, "")
        .trim();

      cur = {
        period: hit.period,
        employer,
        position,
        bodyLines: afterClean ? [afterClean] : [],
      };
    } else if (cur) {
      cur.bodyLines.push(line);
      prevPrevNonPeriodLine = prevNonPeriodLine;
      prevNonPeriodLine = line;
    } else {
      prevPrevNonPeriodLine = prevNonPeriodLine;
      prevNonPeriodLine = line;
    }
  }
  if (cur) blocks.push(cur);

  // ── Pass 2: also handle LinkedIn PDF style where period is BELOW company ──
  // LinkedIn layout:
  //   Company Name
  //   Job Title
  //   Month YYYY – Month YYYY (N years M months)
  //   Location
  //   Description…
  //
  // The pass-1 above already handles it because the period line comes after,
  // so prevNonPeriodLine = job title, prevPrevNonPeriodLine = company name.
  // We just need to fix: when hit.before == "", employer comes from prevNonPeriodLine
  // and position from prevPrevNonPeriodLine.
  // That's already done above ✓

  // ── Pass 3: extract projects from each block ──────────────────────────────
  const result: TataCvData["employmentRecord"] = [];

  for (const block of blocks) {
    if (!block.employer) continue;

    const projects = extractProjects(block);
    result.push({
      id: uid(),
      period: block.period,
      employer: block.employer,
      projects,
    });
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Project extractor from a single employment block
// ─────────────────────────────────────────────────────────────────────────────

function extractProjects(
  block: { period: string; employer: string; position: string; bodyLines: string[] }
): TataCvData["employmentRecord"][0]["projects"] {
  const bodyLines = block.bodyLines;
  const projects: TataCvData["employmentRecord"][0]["projects"] = [];

  const createEmptyProject = () => ({
    id: uid(),
    projectName: "",
    location: "",
    client: "",
    features: "",
    positionHeld: block.position,
    responsibilities: "",
  });

  let currentProject = createEmptyProject();
  const responsibilitiesLines: string[] = [];

  const flushProject = () => {
    currentProject.responsibilities = responsibilitiesLines.join("\n").trim();
    if (!currentProject.projectName && projects.length === 0) {
      currentProject.projectName = block.employer;
    }
    if (!currentProject.location) currentProject.location = "India";
    projects.push(currentProject);
    
    currentProject = createEmptyProject();
    responsibilitiesLines.length = 0;
  };

  const clientRe = /^(?:-|\*|\u2022)?\s*(?:Client(?: Name)?)\s*[:\-]\s*(.+)$/i;
  const projectRe = /^(?:-|\*|\u2022)?\s*(?:Project(?: Name)?|Name of Project|Project Title)\s*[:\-]\s*(.+)$/i;
  const locationRe = /^(?:-|\*|\u2022)?\s*(?:Location|Site)\s*[:\-]\s*(.+)$/i;
  const featuresRe = /^(?:-|\*|\u2022)?\s*(?:Major Features|Features|Key Features|Scope)\s*[:\-]\s*(.+)$/i;
  const roleRe = /^(?:-|\*|\u2022)?\s*(?:Role|Position(?: Held)?|Profile|Designation)\s*[:\-]\s*(.+)$/i;
  const respHeaderRe = /^(?:-|\*|\u2022)?\s*(?:Responsibilities|Duties|Description of Duties)\s*[:\-]?\s*$/i;

  const matchRegex = (line: string, regex: RegExp) => {
    const m = line.match(regex);
    return m ? m[1].trim() : null;
  };

  for (let i = 0; i < bodyLines.length; i++) {
    const rawLine = bodyLines[i];
    const l = rawLine.trim();
    
    if (!l) {
      responsibilitiesLines.push(rawLine);
      continue;
    }

    const inlineMatch = l.match(/^(?:-|\*|\u2022)?\s*project\s*:\s*(.+?)\s*client\s*:\s*(.+)$/i);
    if (inlineMatch) {
      if (currentProject.projectName || currentProject.client) flushProject();
      currentProject.projectName = inlineMatch[1].trim();
      currentProject.client = inlineMatch[2].trim();
      continue;
    }

    const p = matchRegex(l, projectRe);
    if (p) {
      if (currentProject.projectName || currentProject.client) flushProject();
      currentProject.projectName = p;
      continue;
    }

    const c = matchRegex(l, clientRe);
    if (c) { 
      if (currentProject.client && currentProject.projectName) flushProject();
      currentProject.client = c; 
      continue; 
    }

    const loc = matchRegex(l, locationRe);
    if (loc) { currentProject.location = loc; continue; }

    const f = matchRegex(l, featuresRe);
    if (f) { currentProject.features = f; continue; }

    const r = matchRegex(l, roleRe);
    if (r) { currentProject.positionHeld = r; continue; }

    if (respHeaderRe.test(l)) continue;

    if (i === 0 && l.length > 2 && l.length < 60 && !/^[a-z]/.test(l) && !l.includes(":") && !l.includes("-")) {
      currentProject.location = l;
      continue;
    }

    responsibilitiesLines.push(rawLine);
  }

  flushProject();
  
  return projects;
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty template
// ─────────────────────────────────────────────────────────────────────────────

function emptyTataData(name: string): TataCvData {
  return {
    proposedPosition: "",
    nameOfFirm: "TATA Consulting Engineers Limited",
    nameOfStaff: name,
    dob: "",
    nationality: "",
    education: "",
    membership: "",
    otherTraining: "",
    countries: "",
    languages: {
      english: { reading: "", speaking: "", writing: "" },
      hindi: { reading: "", speaking: "", writing: "" },
      others: [],
    },
    employmentRecordRaw: "",
    employmentRecord: [
      {
        id: uid(),
        period: "",
        employer: "",
        projects: [
          {
            id: uid(),
            projectName: "",
            location: "",
            client: "",
            features: "",
            positionHeld: "",
            responsibilities: "",
          },
        ],
      },
    ],
  };
}
