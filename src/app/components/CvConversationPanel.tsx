"use client";

import React, { useState } from "react";
import {
  MessageCircle,
  Mail,
  Send,
  Phone,
  Clock,
  Trash2,
  ExternalLink,
  CheckCheck,
  FileText,
  User,
  Sparkles,
} from "lucide-react";
import { CandidateMessage } from "../../lib/db";
import { Candidate } from "../page";
import {
  formatPhoneDisplay,
  RECRUITER_WHATSAPP_NUMBER,
  sanitizePhoneForWhatsApp,
} from "../../lib/cvParser";

interface CvConversationPanelProps {
  candidate: Candidate;
  userEmail: string;
  onSendWhatsApp: (text: string, mode: "web" | "app") => void;
  onLogMessage: (msg: Omit<CandidateMessage, "id" | "timestamp">) => void;
  onDeleteMessage?: (messageId: string) => void;
  onOpenWhatsAppModal: () => void;
  onOpenEmailModal: () => void;
}

export default function CvConversationPanel({
  candidate,
  userEmail,
  onSendWhatsApp,
  onLogMessage,
  onDeleteMessage,
  onOpenWhatsAppModal,
  onOpenEmailModal,
}: CvConversationPanelProps) {
  const [composerText, setComposerText] = useState("");
  const [composerMode, setComposerMode] = useState<"whatsapp" | "inbound" | "note">("whatsapp");

  const messages = candidate.messages || [];

  function formatTime(iso: string) {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return iso;
    }
  }

  function handleQuickTemplate(templateText: string) {
    setComposerText(templateText);
  }

  function handleSubmit() {
    if (!composerText.trim()) return;

    if (composerMode === "whatsapp") {
      onSendWhatsApp(composerText.trim(), "web");
      setComposerText("");
    } else if (composerMode === "inbound") {
      onLogMessage({
        type: "whatsapp",
        direction: "inbound",
        sender: candidate.phone || candidate.displayName,
        recipient: RECRUITER_WHATSAPP_NUMBER,
        text: composerText.trim(),
      });
      setComposerText("");
    } else {
      onLogMessage({
        type: "note",
        direction: "outbound",
        sender: userEmail || "Recruiter",
        recipient: candidate.displayName,
        text: composerText.trim(),
      });
      setComposerText("");
    }
  }

  return (
    <div className="conversationContainer">
      {/* ── Top Bar ── */}
      <div className="conversationHeader">
        <div className="conversationHeaderLeft">
          <div className="conversationAvatar">
            {candidate.displayName
              .split(" ")
              .filter(Boolean)
              .slice(0, 2)
              .map((n) => n[0]?.toUpperCase())
              .join("") || "CV"}
          </div>
          <div className="conversationCandidateTitle">
            <span className="conversationCandidateName">{candidate.displayName}</span>
            <div className="conversationContactMeta">
              {candidate.phone ? (
                <span className="conversationContactMetaItem" style={{ color: "#047857", fontWeight: 600 }}>
                  <Phone size={11} /> {formatPhoneDisplay(candidate.phone)}
                </span>
              ) : (
                <span className="conversationContactMetaItem" style={{ color: "#d97706" }}>
                  No phone in CV
                </span>
              )}
              {candidate.email && (
                <span className="conversationContactMetaItem">
                  <Mail size={11} /> {candidate.email}
                </span>
              )}
              <span className="conversationContactMetaItem">
                <FileText size={11} /> {candidate.fileName}
              </span>
            </div>
          </div>
        </div>

        <div className="conversationHeaderRight">
          {/* Linked line & Single window badge */}
          <span className="singleWindowIndicatorBadge" title="All candidate conversations share 1 dedicated WhatsApp window">
            <span className="singleWindowDot" />
            <span>Single WhatsApp Window Active</span>
          </span>

          <span className="linkedDispatchBadge" title="Recruiter dispatch line linked to candidate communications">
            <Phone size={10} /> Line: <strong>{RECRUITER_WHATSAPP_NUMBER}</strong>
          </span>

          <button
            type="button"
            className="contactChip whatsapp"
            onClick={onOpenWhatsAppModal}
            title="Open WhatsApp templates modal"
          >
            <MessageCircle size={13} />
            <span>WhatsApp Dialog</span>
          </button>

          <button
            type="button"
            className="contactChip email"
            onClick={onOpenEmailModal}
            title="Open Email templates modal"
          >
            <Mail size={13} />
            <span>Email</span>
          </button>
        </div>
      </div>

      {/* ── Messages Stream ── */}
      <div className="conversationStream">
        {messages.length === 0 ? (
          <div className="conversationEmptyState">
            <div className="conversationEmptyIcon">
              <MessageCircle size={26} />
            </div>
            <h3>No Conversation Mapped Yet</h3>
            <p>
              Send an outreach message via WhatsApp or Email, or log candidate responses below. Every communication
              is saved and mapped directly against this CV in the portal database.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                className="commModalBtn primaryWhatsapp"
                onClick={() =>
                  handleQuickTemplate(
                    `Hi ${candidate.displayName},\n\nWe reviewed your CV for the ${candidate.project || "Transmission / Substation"} project and shortlisted you. Please reply on WhatsApp or call our recruitment desk at ${RECRUITER_WHATSAPP_NUMBER}.`
                  )
                }
              >
                <Sparkles size={13} /> Load Shortlisted Template
              </button>
              <button
                type="button"
                className="commModalBtn"
                onClick={onOpenWhatsAppModal}
              >
                <MessageCircle size={13} /> Custom Dialog
              </button>
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isOutbound = msg.direction === "outbound";
            return (
              <div
                key={msg.id}
                className={`chatBubbleRow ${isOutbound ? "outbound" : "inbound"}`}
              >
                <div
                  className={`chatBubble ${isOutbound ? "outbound" : "inbound"} ${
                    msg.type === "whatsapp" ? "whatsapp" : msg.type === "email" ? "email" : "note"
                  }`}
                >
                  <div className="chatBubbleHeader">
                    <div className="chatBubbleTag">
                      {msg.type === "whatsapp" && (
                        <span className="chatBubbleTag whatsapp">
                          <MessageCircle size={11} /> WhatsApp
                        </span>
                      )}
                      {msg.type === "email" && (
                        <span className="chatBubbleTag email">
                          <Mail size={11} /> Email
                        </span>
                      )}
                      {msg.type === "note" && (
                        <span className="chatBubbleTag note">
                          <FileText size={11} /> Recruiter Note
                        </span>
                      )}
                      <span>·</span>
                      <span>
                        {isOutbound
                          ? `Outbound (via ${RECRUITER_WHATSAPP_NUMBER})`
                          : `Candidate Reply`}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 10, color: "var(--muted)" }}>
                        <Clock size={10} style={{ display: "inline", marginRight: 2 }} />
                        {formatTime(msg.timestamp)}
                      </span>
                      {onDeleteMessage && (
                        <button
                          type="button"
                          className="chatBubbleDeleteBtn"
                          onClick={() => onDeleteMessage(msg.id)}
                          title="Delete message from timeline"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>

                  {msg.subject && <div className="chatBubbleSubject">{msg.subject}</div>}

                  <div className="chatBubbleText">{msg.text}</div>

                  <div className="chatBubbleFooter">
                    <span>
                      {isOutbound
                        ? `To: ${msg.recipient || candidate.phone || "Candidate"}`
                        : `From: ${msg.sender || candidate.displayName}`}
                    </span>
                    {isOutbound && <CheckCheck size={13} style={{ color: "#047857" }} />}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Interactive Composer ── */}
      <div className="conversationComposer">
        {/* Template Pills */}
        <div className="composerTemplateBar">
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>
            Templates:
          </span>
          <button
            type="button"
            className="composerTemplateChip"
            onClick={() => {
              setComposerMode("whatsapp");
              handleQuickTemplate(
                `Dear ${candidate.displayName},\n\nWe have reviewed your CV for the ${candidate.project || "Reliance TL project"} and are pleased to inform you that you have been shortlisted.\n\nPlease connect back with us on this number (${RECRUITER_WHATSAPP_NUMBER}) with your current CTC and notice period.\n\nBest regards,\nHR Recruitment Team`
              );
            }}
          >
            Shortlisted Notice
          </button>
          <button
            type="button"
            className="composerTemplateChip"
            onClick={() => {
              setComposerMode("whatsapp");
              handleQuickTemplate(
                `Hi ${candidate.displayName},\n\nWe would like to invite you for an interview for the ${candidate.project || "Engineering"} project.\n\nPlease reply with your available time slots or call our line at ${RECRUITER_WHATSAPP_NUMBER}.\n\nBest regards,\nRecruitment Team`
              );
            }}
          >
            Interview Call
          </button>
          <button
            type="button"
            className="composerTemplateChip"
            onClick={() => {
              setComposerMode("whatsapp");
              handleQuickTemplate(
                `Dear ${candidate.displayName},\n\nFor the onboarding process of ${candidate.project || "the project"}, kindly share your degree certificates, last 3 months pay slips, and Aadhaar card on this WhatsApp line (${RECRUITER_WHATSAPP_NUMBER}).\n\nThank you,\nHR Operations`
              );
            }}
          >
            Document Request
          </button>
          <button
            type="button"
            className="composerTemplateChip"
            onClick={() => {
              setComposerMode("inbound");
              handleQuickTemplate("Candidate confirmed availability for interview on Friday at 3:00 PM.");
            }}
          >
            Candidate Confirmed
          </button>
          <button
            type="button"
            className="composerTemplateChip"
            onClick={() => {
              setComposerMode("note");
              handleQuickTemplate("Candidate is currently serving 30-day notice period with expected CTC of ₹12 LPA.");
            }}
          >
            Recruiter Note
          </button>
        </div>

        {/* Mode Toggle & Composer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="composerModeToggle">
            <button
              type="button"
              className={`composerModeBtn ${composerMode === "whatsapp" ? "active whatsapp" : ""}`}
              onClick={() => setComposerMode("whatsapp")}
            >
              <MessageCircle size={12} /> Send via WhatsApp (Single Window)
            </button>
            <button
              type="button"
              className={`composerModeBtn ${composerMode === "inbound" ? "active" : ""}`}
              onClick={() => setComposerMode("inbound")}
            >
              <User size={12} /> Log Candidate Reply
            </button>
            <button
              type="button"
              className={`composerModeBtn ${composerMode === "note" ? "active" : ""}`}
              onClick={() => setComposerMode("note")}
            >
              <FileText size={12} /> Recruiter Note
            </button>
          </div>

          <span style={{ fontSize: 11, color: "var(--muted)" }}>
            {composerText.length} characters
          </span>
        </div>

        <div className="composerTextareaRow">
          <textarea
            className="composerTextarea"
            placeholder={
              composerMode === "whatsapp"
                ? `Type message to send to ${candidate.displayName} via WhatsApp...`
                : composerMode === "inbound"
                ? `Record candidate's reply received on WhatsApp / Phone...`
                : `Add internal recruiter note mapped to this CV...`
            }
            value={composerText}
            onChange={(e) => setComposerText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleSubmit();
              }
            }}
          />

          <button
            type="button"
            className={`composerSendBtn ${
              composerMode === "whatsapp" ? "whatsapp" : composerMode === "inbound" ? "reply" : "note"
            }`}
            onClick={handleSubmit}
            disabled={!composerText.trim()}
          >
            {composerMode === "whatsapp" ? (
              <>
                <Send size={13} /> Send WhatsApp
              </>
            ) : composerMode === "inbound" ? (
              <>
                <CheckCheck size={13} /> Log Candidate Reply
              </>
            ) : (
              <>
                <FileText size={13} /> Save Note
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
