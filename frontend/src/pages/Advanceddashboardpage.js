import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axiosInstance from "../utils/axiosInstance";
import { useUserChange } from "../hooks/useUserChange";
import { toast } from "sonner";
import {
  FileText, ArrowLeft, Loader2, Users, TrendingUp,
  Search, Filter, Download, Trash2, Eye, ChevronDown, Target,
  Award, AlertCircle, CheckCircle2, Zap, Brain, Sparkles,
  CalendarDays, X, RefreshCw, Wand2, Mail, Shield, Lightbulb,
  BarChart2, ChevronRight, ChevronUp, Star, AlertTriangle,
  TrendingDown, Gauge, Layers, Send, CheckCheck, Clock, XCircle,
  ScanLine
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area, RadarChart, Radar,
  PolarGrid, PolarAngleAxis,
} from "recharts";
import authUtils from "@/utils/authUtils";

// ── Theme constants ─────────────────────────────────────────────────────────
const VIOLET  = "#7C3AED";
const VIOLET2 = "#6D28D9";
const VIO_LT  = "#EDE9FE";
const TEAL    = "#0d9488";
const TEAL2   = "#0f766e";
const TEAL_LT = "#ccfbf1";

// ── Score colour helper ──────────────────────────────────────────────────────
const getScoreColor = s =>
  s >= 90 ? "text-yellow-800 bg-yellow-200" :
  s >= 70 ? "text-yellow-700 bg-yellow-100" :
  s >= 40 ? "text-amber-700 bg-amber-100"   : "text-red-700 bg-red-100";

const getFitColor = s =>
  s >= 85 ? "#16a34a" :
  s >= 70 ? "#ca8a04" :
  s >= 55 ? "#7C3AED" :
  s >= 40 ? "#f97316" : "#ef4444";

// ─────────────────────────────────────────────────────────────────────────────
//  ★ EMAIL TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────
const EMAIL_TEMPLATES = [
  {
    label: "Thanks for Scanning",
    type: "thanks",
    emailType: "thanks_scanning",
    subject: "Thank You for Using TalentLens AI – Resume Scan Complete",
    body: `Dear {name},

Thank you for trusting TalentLens AI to scan your resume! 🎉

We have successfully analysed your profile for the role of {job_title} using our advanced AI-powered screening engine.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 YOUR ATS MATCH SCORE: {score}%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Here is what our AI evaluated:
• Keyword alignment with job requirements
• Technical & soft skill match
• Experience relevance and seniority fit
• Education qualification check
• Overall ATS compatibility score

We hope TalentLens AI has given you valuable insights to strengthen your job application journey. Use the attached PDF report to understand your strengths and key areas to improve.

Good luck with your job search — we're rooting for you!

Warm regards,
TalentLens AI Team
🌐 Powered by Advanced NLP Resume Intelligence`,
  },
  {
    label: "Shortlist Notification",
    type: "positive",
    emailType: "shortlist",
    subject: "Congratulations! You've been shortlisted – {job_title}",
    body: `Dear {name},

Congratulations! 🎉

After carefully reviewing your application for the role of {job_title}, we are pleased to inform you that you have been shortlisted for the next stage of our selection process.

Your profile achieved an impressive ATS match score of {score}%, reflecting strong alignment with our requirements.

Our recruitment team will be in touch shortly with details regarding the next steps, including interview scheduling.

We look forward to speaking with you.

Best regards,
TalentLens Recruitment Team`,
  },
  {
    label: "Interview Invite",
    type: "positive",
    emailType: "interview_invite",
    subject: "Interview Invitation – {job_title} Position",
    body: `Dear {name},

We are delighted to invite you for an interview for the position of {job_title}.

Based on your application review (ATS Score: {score}%), your profile stands out as an excellent match for our requirements.

Please reply to this email with your availability for the coming week so we can schedule a convenient time.

We look forward to meeting you!

Kind regards,
TalentLens Recruitment Team`,
  },
  {
    label: "Next Round",
    type: "positive",
    emailType: "next_round",
    subject: "You've Advanced to the Next Round – {job_title}",
    body: `Dear {name},

Great news! We are pleased to inform you that you have successfully advanced to the next round of our selection process for the {job_title} role.

Your strong profile (Score: {score}%) has impressed our hiring team and we would like to proceed with a more detailed evaluation.

Further details will follow shortly. Please feel free to reach out if you have any questions.

Warm regards,
TalentLens Recruitment Team`,
  },
  {
    label: "Rejection",
    type: "rejection",
    emailType: "rejection",
    subject: "Update on Your Application – {job_title}",
    body: `Dear {name},

Thank you for taking the time to apply for the {job_title} position and for your interest in joining our team.

After carefully reviewing your application, we regret to inform you that we will not be moving forward with your candidacy at this time. This was a difficult decision, as we received many strong applications.

We encourage you to continue developing your skills and to apply for future opportunities that align with your experience and career goals.

We wish you all the best in your job search and future endeavors.

Kind regards,
TalentLens Recruitment Team`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
//  ★ EMAIL MODAL COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const EmailModal = ({ isOpen, onClose, candidates, onSend, onEmailSent }) => {
  const [subject, setSubject]           = useState(EMAIL_TEMPLATES[0].subject);
  const [bodyTemplate, setBodyTemplate] = useState(EMAIL_TEMPLATES[0].body);
  const [sending, setSending]           = useState(false);
  const [results, setResults]           = useState(null);
  const [activeTemplate, setActiveTemplate] = useState(0);
  const [previewIdx, setPreviewIdx]     = useState(0);
  const [attachReport, setAttachReport] = useState(true);
  const [editedEmails, setEditedEmails] = useState({});
  const [editingIdx, setEditingIdx]     = useState(null);

  // Reset state every time modal opens
  useEffect(() => {
    if (isOpen) {
      setResults(null);
      setSending(false);
      setSubject(EMAIL_TEMPLATES[0].subject);
      setBodyTemplate(EMAIL_TEMPLATES[0].body);
      setActiveTemplate(0);
      setPreviewIdx(0);
      setAttachReport(true);
      setEditedEmails({});
      setEditingIdx(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentTemplate = EMAIL_TEMPLATES[activeTemplate];
  const isRejection = currentTemplate?.type === "rejection";
  const isThanks    = currentTemplate?.type === "thanks";

  // Effective email for each candidate (edited override takes priority)
  const effectiveEmail = (c, i) =>
    editedEmails[i] !== undefined ? editedEmails[i] : (c.email || "");

  const validCandidates   = candidates.filter((c, i) => effectiveEmail(c, i).trim());
  const skippedCandidates = candidates.filter((c, i) => !effectiveEmail(c, i).trim());

  const applyTemplate = (idx) => {
    setActiveTemplate(idx);
    setSubject(EMAIL_TEMPLATES[idx].subject);
    setBodyTemplate(EMAIL_TEMPLATES[idx].body);
  };

  // Live preview with first candidate's data substituted
  const previewCandidateRaw = validCandidates[previewIdx] || candidates[0];
  const previewCandidateIdx = candidates.indexOf(previewCandidateRaw);
  const previewCandidate = previewCandidateRaw
    ? { ...previewCandidateRaw, email: effectiveEmail(previewCandidateRaw, previewCandidateIdx) }
    : null;
  const previewBody = bodyTemplate
    .replace(/{name}/g,      previewCandidate?.candidate_name || "Candidate")
    .replace(/{job_title}/g, previewCandidate?.job_title      || "the role")
    .replace(/{score}/g,     previewCandidate?.ats_score      || "—");
  const previewSubject = subject
    .replace(/{name}/g,      previewCandidate?.candidate_name || "Candidate")
    .replace(/{job_title}/g, previewCandidate?.job_title      || "the role")
    .replace(/{score}/g,     previewCandidate?.ats_score      || "—");

  // Button colours per type
  const getBtnStyle = () => {
    if (validCandidates.length === 0) return { background: "#9CA3AF" };
    if (isRejection) return { background: "#dc2626" };
    if (isThanks)    return { background: `linear-gradient(135deg, ${TEAL}, ${TEAL2})` };
    return { background: `linear-gradient(135deg, ${VIOLET}, ${VIOLET2})` };
  };

  const handleSend = async () => {
    setSending(true);
    try {
      const mergedCandidates = candidates.map((c, i) => ({
        ...c,
        email: effectiveEmail(c, i),
      }));
      const res = await onSend(
        subject,
        bodyTemplate,
        attachReport,
        mergedCandidates,
        currentTemplate.emailType
      );
      setResults(res);
      onEmailSent?.(res);
    } catch {
      toast.error("Failed to send emails");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* ── Modal Header ──────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: isThanks ? `linear-gradient(135deg, ${TEAL}, ${TEAL2})` : `linear-gradient(135deg, ${VIOLET}, ${VIOLET2})` }}
            >
              {isThanks ? <ScanLine className="w-5 h-5 text-white" /> : <Mail className="w-5 h-5 text-white" />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 font-['Outfit']">
                {isThanks ? "Send Scan Confirmation Emails" : "Send Shortlist Emails"}
              </h2>
              <p className="text-sm text-gray-500">
                <span className="font-semibold text-green-700">{validCandidates.length}</span> will receive email
                {skippedCandidates.length > 0 && (
                  <span className="text-amber-600 ml-1">· {skippedCandidates.length} skipped (no email)</span>
                )}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {!results ? (
          <div className="flex flex-col overflow-hidden flex-1">
            <div className="overflow-y-auto flex-1 p-6 space-y-5">

              {/* ── Template Selector ────────────────────────────────── */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                  Choose Template
                </label>
                <div className="flex gap-2 flex-wrap">
                  {EMAIL_TEMPLATES.map((t, i) => {
                    const isActive = activeTemplate === i;
                    const btnColor =
                      t.type === "rejection" ? (isActive ? "#dc2626" : null)
                      : t.type === "thanks"  ? (isActive ? TEAL    : null)
                      :                        (isActive ? VIOLET  : null);
                    const textColor =
                      t.type === "rejection" ? "text-red-600 border-red-200 hover:bg-red-50"
                      : t.type === "thanks"  ? "text-teal-700 border-teal-200 hover:bg-teal-50"
                      :                        "text-gray-600 border-gray-200 hover:border-violet-300 hover:text-violet-700";
                    return (
                      <button
                        key={i}
                        onClick={() => applyTemplate(i)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${isActive ? "text-white border-transparent" : `bg-white ${textColor}`}`}
                        style={isActive ? { background: btnColor } : {}}
                      >
                        {t.type === "rejection" ? "✕ " : t.type === "thanks" ? "🔍 " : ""}{t.label}
                      </button>
                    );
                  })}
                </div>

                {/* ── Thanks for Scanning info banner ── */}
                {isThanks && (
                  <div className="flex items-start gap-2 mt-2 px-3 py-2.5 rounded-xl border"
                    style={{ background: TEAL_LT, borderColor: "#99f6e4" }}>
                    <ScanLine className="w-4 h-4 mt-0.5 shrink-0" style={{ color: TEAL }} />
                    <div>
                      <p className="text-xs font-semibold" style={{ color: TEAL2 }}>
                        Scan Confirmation Email
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "#0f766e" }}>
                        Send a thank-you email to candidates confirming their resume was scanned by TalentLens AI.
                        Includes their ATS score, what was analysed, and an attached PDF report.
                      </p>
                    </div>
                  </div>
                )}

                {/* Rejection warning */}
                {isRejection && (
                  <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    <p className="text-xs text-red-700 font-medium">
                      Rejection template selected — candidates will receive a decline notice. Report will not be attached.
                    </p>
                  </div>
                )}
              </div>

              {/* ── Candidate Recipients ──────────────────────────────── */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                  Recipients ({candidates.length})
                  <span className="ml-2 font-normal normal-case text-gray-400">— click ✎ to edit email</span>
                </label>
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="max-h-40 overflow-y-auto divide-y divide-gray-50">
                    {candidates.map((c, i) => {
                      const email    = effectiveEmail(c, i);
                      const hasEmail = !!email.trim();
                      const isEditing = editingIdx === i;
                      const wasEdited = editedEmails[i] !== undefined;
                      return (
                        <div key={i} className={`px-3 py-2 text-sm ${!hasEmail ? "bg-amber-50" : wasEdited ? "bg-violet-50" : "bg-white"}`}>
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 bg-violet-500">
                                <Mail className="w-3 h-3 text-white" />
                              </div>
                              <span className="font-medium text-gray-800 shrink-0 text-xs">{c.candidate_name || "Unknown"}</span>
                              <input
                                autoFocus
                                type="email"
                                value={editedEmails[i] !== undefined ? editedEmails[i] : (c.email || "")}
                                onChange={e => setEditedEmails(prev => ({ ...prev, [i]: e.target.value }))}
                                onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") setEditingIdx(null); }}
                                className="flex-1 min-w-0 border border-violet-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-violet-300"
                                placeholder="Enter email address..."
                              />
                              <button
                                onClick={() => setEditingIdx(null)}
                                className="shrink-0 px-2 py-1 rounded-lg text-xs font-semibold text-white transition-colors"
                                style={{ background: VIOLET }}>
                                Done
                              </button>
                              {wasEdited && (
                                <button
                                  onClick={() => {
                                    setEditedEmails(prev => { const n = { ...prev }; delete n[i]; return n; });
                                    setEditingIdx(null);
                                  }}
                                  className="shrink-0 text-xs text-gray-400 hover:text-red-500 transition-colors px-1"
                                  title="Reset to original">
                                  ↺
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${
                                  !hasEmail ? "bg-amber-400" : wasEdited ? "bg-violet-500" : "bg-green-500"
                                }`}>
                                  {!hasEmail
                                    ? <AlertTriangle className="w-3.5 h-3.5" />
                                    : <CheckCircle2 className="w-3.5 h-3.5" />}
                                </div>
                                <span className="font-medium text-gray-800 truncate">{c.candidate_name || "Unknown"}</span>
                                <span className={`truncate hidden sm:block text-xs ${wasEdited ? "text-violet-600 font-medium" : "text-gray-400"}`}>
                                  {hasEmail ? email : <span className="text-amber-500 italic">no email — will skip</span>}
                                  {wasEdited && <span className="ml-1 text-violet-400 font-normal">(edited)</span>}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getScoreColor(c.ats_score)}`}>
                                  {c.ats_score}%
                                </span>
                                <button
                                  onClick={() => setEditingIdx(i)}
                                  className="p-1 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-violet-600"
                                  title="Edit email address">
                                  <Wand2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* ── Subject ──────────────────────────────────────────── */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                  Subject Line
                </label>
                <Input
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className="border-violet-200 focus:ring-violet-400"
                  placeholder="Email subject..."
                />
              </div>

              {/* ── Body + Live Preview side-by-side ─────────────────── */}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                    Email Body
                    <span className="text-gray-400 font-normal normal-case ml-1">
                      — use <code className="bg-gray-100 px-1 rounded">{"{name}"}</code>{" "}
                      <code className="bg-gray-100 px-1 rounded">{"{job_title}"}</code>{" "}
                      <code className="bg-gray-100 px-1 rounded">{"{score}"}</code>
                    </span>
                  </label>
                  <textarea
                    value={bodyTemplate}
                    onChange={e => setBodyTemplate(e.target.value)}
                    rows={10}
                    className="w-full border border-violet-200 rounded-xl p-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none font-mono"
                  />
                </div>

                {/* Live Preview */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Live Preview</label>
                    {validCandidates.length > 1 && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => setPreviewIdx(Math.max(0, previewIdx - 1))}
                          className="text-gray-400 hover:text-gray-600 text-xs px-1">‹</button>
                        <span className="text-xs text-gray-400">{previewIdx + 1}/{validCandidates.length}</span>
                        <button onClick={() => setPreviewIdx(Math.min(validCandidates.length - 1, previewIdx + 1))}
                          className="text-gray-400 hover:text-gray-600 text-xs px-1">›</button>
                      </div>
                    )}
                  </div>
                  <div className="border border-gray-200 rounded-xl overflow-hidden h-[calc(100%-28px)] flex flex-col">
                    <div className="bg-gray-50 px-3 py-2 border-b border-gray-200 shrink-0">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="font-semibold">To:</span>
                        <span>{previewCandidate?.email || "—"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-600 mt-0.5">
                        <span className="font-semibold">Subject:</span>
                        <span className="font-medium text-gray-800">{previewSubject}</span>
                      </div>
                    </div>
                    <div className="p-3 text-xs text-gray-700 overflow-y-auto flex-1 leading-relaxed whitespace-pre-wrap">
                      {previewBody}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Footer actions ─────────────────────────────────────── */}
            <div className="px-6 py-3 border-t border-gray-100 shrink-0 bg-gray-50 space-y-3">
              {/* Attach report toggle — hidden for rejection emails */}
              {!isRejection && (
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAttachReport(v => !v)}
                      className="relative w-10 h-5 rounded-full transition-colors shrink-0"
                      style={{ background: attachReport ? (isThanks ? TEAL : VIOLET) : "#D1D5DB" }}
                      aria-label="Toggle PDF attachment"
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${attachReport ? "translate-x-5" : ""}`} />
                    </button>
                    <span className="text-xs font-semibold text-gray-700">Attach AI Report PDF</span>
                  </div>
                  {attachReport ? (
                    <span className="text-xs font-medium flex items-center gap-1" style={{ color: isThanks ? TEAL : VIOLET }}>
                      <CheckCircle2 className="w-3.5 h-3.5" />PDF report will be attached
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">No attachment</span>
                  )}
                </div>
              )}
              <div className="flex gap-3">
                <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
                <Button
                  onClick={handleSend}
                  disabled={sending || validCandidates.length === 0}
                  className="flex-[2] text-white font-semibold"
                  style={getBtnStyle()}
                >
                  {sending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending {validCandidates.length} email{validCandidates.length !== 1 ? "s" : ""}...</>
                  ) : validCandidates.length === 0 ? (
                    <>No valid emails — cannot send</>
                  ) : isRejection ? (
                    <><XCircle className="w-4 h-4 mr-2" />Send Rejection to {validCandidates.length} Candidate{validCandidates.length !== 1 ? "s" : ""}</>
                  ) : isThanks ? (
                    <><ScanLine className="w-4 h-4 mr-2" />Send Scan Confirmation to {validCandidates.length} Candidate{validCandidates.length !== 1 ? "s" : ""}{attachReport ? " + PDF" : ""}</>
                  ) : (
                    <><Send className="w-4 h-4 mr-2" />Send to {validCandidates.length} Candidate{validCandidates.length !== 1 ? "s" : ""}{attachReport ? " + PDF" : ""}</>
                  )}
                </Button>
              </div>
            </div>
          </div>

        ) : (
          /* ── Results Screen ──────────────────────────────────────── */
          <div className="p-6 space-y-4 overflow-y-auto">
            <div className={`rounded-xl p-5 text-center ${results.total_sent === results.total_requested ? "bg-green-50 border border-green-200" : "bg-amber-50 border border-amber-200"}`}>
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3"
                style={{ background: results.total_sent === results.total_requested ? "#D1FAE5" : "#FEF3C7" }}>
                {results.total_sent === results.total_requested
                  ? <CheckCheck className="w-7 h-7 text-green-600" />
                  : <AlertTriangle className="w-7 h-7 text-amber-600" />}
              </div>
              <h3 className="text-lg font-bold text-gray-900 font-['Outfit']">
                {results.total_sent === results.total_requested ? "All Emails Sent!" : "Emails Processed"}
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                <span className="font-bold text-green-700">{results.total_sent}</span> of{" "}
                <span className="font-bold">{results.total_requested}</span> emails sent successfully
              </p>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {results.results?.map((r, i) => {
                const isOk   = r.status === "sent" || r.status === "demo";
                const isSkip = r.status === "skipped";
                return (
                  <div key={i} className={`flex items-center justify-between p-3 rounded-xl text-sm border ${
                    isOk ? "bg-green-50 border-green-200" : isSkip ? "bg-amber-50 border-amber-100" : "bg-red-50 border-red-200"
                  }`}>
                    <div className="flex items-center gap-2 min-w-0">
                      {isOk   && <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />}
                      {isSkip && <Clock        className="w-4 h-4 text-amber-500 shrink-0" />}
                      {!isOk && !isSkip && <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-800 truncate">{r.candidate_name}</p>
                        <p className="text-xs text-gray-500 truncate">{r.email || "no email"}</p>
                      </div>
                    </div>
                    <span className={`text-xs font-bold px-2 py-1 rounded-full shrink-0 ml-2 ${
                      isOk ? "bg-green-200 text-green-800" :
                      isSkip ? "bg-amber-200 text-amber-800" : "bg-red-200 text-red-800"
                    }`}>
                      {r.status === "demo" ? "Logged (Demo)" : r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                    </span>
                  </div>
                );
              })}
            </div>

            {results.results?.some(r => r.status === "demo") && (
              <div className="flex items-start gap-2 p-3 bg-violet-50 rounded-xl border border-violet-200 text-xs text-violet-800">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: VIOLET }} />
                <span>
                  <strong>Demo mode:</strong> Emails were logged but not actually sent. Add{" "}
                  <code className="bg-violet-100 px-1 rounded">MAIL_USERNAME</code>,{" "}
                  <code className="bg-violet-100 px-1 rounded">MAIL_PASSWORD</code>, and{" "}
                  <code className="bg-violet-100 px-1 rounded">MAIL_FROM</code> to your{" "}
                  <code className="bg-violet-100 px-1 rounded">.env</code> to enable real sending.
                </span>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setResults(null)} className="flex-1">Send Again</Button>
              <Button onClick={onClose} className="flex-1 text-white" style={{ background: VIOLET }}>Done</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
//  ★ ADVANCED ANALYSIS PANEL (shown when a resume row is expanded)
// ─────────────────────────────────────────────────────────────────────────────
const AdvancedAnalysisPanel = ({ resumeId, userId }) => {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("roles");

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const res = await axiosInstance.get(
          `/api/resume/${resumeId}/advanced-analysis?user_id=${userId || ""}`
        );
        setData(res.data);
      } catch {
        toast.error("Failed to load advanced analysis");
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [resumeId, userId]);

  if (loading) return (
    <div className="flex items-center justify-center py-10">
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: VIOLET }} />
    </div>
  );
  if (!data) return null;

  const tabs = [
    { id: "roles",       label: "Top 3 Roles",   icon: <Layers      className="w-3.5 h-3.5" /> },
    { id: "fit",         label: "Candidate Fit",  icon: <Gauge       className="w-3.5 h-3.5" /> },
    { id: "strength",    label: "Strengths",      icon: <Star        className="w-3.5 h-3.5" /> },
    { id: "weakness",    label: "Weaknesses",     icon: <AlertTriangle className="w-3.5 h-3.5" /> },
    { id: "suggestions", label: "ATS Tips",       icon: <Lightbulb   className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="bg-gradient-to-br from-violet-50 to-white rounded-xl border border-violet-100 p-5 mt-1">
      {/* Tabs */}
      <div className="flex gap-1 flex-wrap mb-5 bg-white rounded-xl p-1 border border-violet-100 shadow-sm">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === t.id ? "text-white shadow-sm" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
            style={activeTab === t.id ? { background: VIOLET } : {}}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: Top 3 Role Matches ────────────────────────────────── */}
      {activeTab === "roles" && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 mb-3">System-identified best-fit roles based on resume skills and profile.</p>
          {data.top3_roles?.map((role, i) => (
            <div key={i} className={`rounded-xl border p-4 ${i === 0 ? "border-violet-300 bg-violet-50" : "border-gray-200 bg-white"}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ background: i === 0 ? VIOLET : i === 1 ? "#8B5CF6" : "#A78BFA" }}>
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-bold text-gray-900 text-sm">{role.role}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{role.fit_summary}</p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className="text-xl font-bold font-['Outfit']" style={{ color: VIOLET }}>{role.match_score}%</p>
                  <Badge className="text-xs mt-0.5 border-0" style={{
                    background: role.match_score >= 70 ? "#D1FAE5" : role.match_score >= 50 ? VIO_LT : "#FEF3C7",
                    color: role.match_score >= 70 ? "#065F46" : role.match_score >= 50 ? VIOLET : "#92400E"
                  }}>
                    {role.confidence_label}
                  </Badge>
                </div>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
                <div className="h-full rounded-full transition-all" style={{
                  width: `${role.match_score}%`,
                  background: i === 0 ? `linear-gradient(90deg, ${VIOLET}, #A78BFA)` : "#C4B5FD"
                }} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="font-semibold text-green-700 mb-1">✓ Matched Skills</p>
                  <div className="flex flex-wrap gap-1">
                    {role.matched_skills?.slice(0, 5).map((s, j) => (
                      <span key={j} className="px-2 py-0.5 bg-green-100 text-green-800 rounded-full">{s}</span>
                    ))}
                    {(role.matched_skills?.length || 0) > 5 && (
                      <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded-full">+{role.matched_skills.length - 5}</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="font-semibold text-red-600 mb-1">✗ Missing Skills</p>
                  <div className="flex flex-wrap gap-1">
                    {role.missing_skills?.slice(0, 4).map((s, j) => (
                      <span key={j} className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full">{s}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-2 pt-2 border-t border-gray-100">
                <span className="text-xs text-gray-500">ATS Score: <b style={{ color: VIOLET }}>{role.ats_score}%</b></span>
                <span className="text-xs text-gray-500">Coverage: <b>{role.skill_coverage_pct}%</b> of role skills</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── TAB: Candidate Fit Score ───────────────────────────────── */}
      {activeTab === "fit" && data.candidate_fit && (
        <div className="space-y-4">
          <div className="flex items-center gap-6 p-5 rounded-xl border"
            style={{ borderColor: getFitColor(data.candidate_fit.fit_score) + "40", background: getFitColor(data.candidate_fit.fit_score) + "08" }}>
            <div className="relative w-24 h-24 shrink-0">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="40" fill="none" stroke="#e5e7eb" strokeWidth="10" />
                <circle cx="50" cy="50" r="40" fill="none"
                  stroke={getFitColor(data.candidate_fit.fit_score)}
                  strokeWidth="10"
                  strokeDasharray={`${(data.candidate_fit.fit_score / 100) * 251.3} 251.3`}
                  strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold font-['Outfit']" style={{ color: getFitColor(data.candidate_fit.fit_score) }}>
                  {data.candidate_fit.fit_score}%
                </span>
              </div>
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900 font-['Outfit']">{data.candidate_fit.fit_label}</p>
              <p className="text-sm text-gray-600 mt-1">{data.candidate_fit.hire_recommendation}</p>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Score Dimensions</p>
            <div className="space-y-2.5">
              {Object.entries(data.candidate_fit.fit_dimensions || {}).map(([dim, score], i) => (
                <div key={i}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-gray-700">{dim}</span>
                    <span style={{ color: VIOLET }} className="font-bold">{score}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{
                      width: `${score}%`, background: `linear-gradient(90deg, ${VIOLET}, #A78BFA)`
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: Strength Analysis ────────────────────────────────── */}
      {activeTab === "strength" && data.strength_analysis && (
        <div className="space-y-4">
          <div className="flex items-center gap-4 p-4 rounded-xl bg-green-50 border border-green-200">
            <div className="w-16 h-16 rounded-full flex items-center justify-center shrink-0" style={{ background: "#D1FAE5" }}>
              <span className="text-xl font-bold text-green-700">{data.strength_analysis.strength_score}%</span>
            </div>
            <div>
              <p className="font-bold text-green-800 text-base">{data.strength_analysis.strength_label}</p>
              <p className="text-sm text-green-700 mt-0.5">Overall Resume Strength</p>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Strength Categories</p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(data.strength_analysis.category_scores || {}).map(([cat, score], i) => (
                <div key={i} className="p-3 rounded-lg bg-white border border-gray-100">
                  <p className="text-xs text-gray-500 mb-1">{cat}</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-green-500" style={{ width: `${score}%` }} />
                    </div>
                    <span className="text-xs font-bold text-green-700">{score}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Key Strengths</p>
            <div className="space-y-2">
              {data.strength_analysis.strengths?.map((s, i) => (
                <div key={i} className="flex items-start gap-2 p-3 bg-green-50 rounded-lg text-sm text-green-800">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-green-600" />
                  <span>{s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: Weakness Detection ───────────────────────────────── */}
      {activeTab === "weakness" && data.weakness_analysis && (
        <div className="space-y-4">
          <div className={`flex items-center gap-4 p-4 rounded-xl border ${
            data.weakness_analysis.severity === "Critical" ? "bg-red-50 border-red-200" :
            data.weakness_analysis.severity === "High"     ? "bg-orange-50 border-orange-200" :
            data.weakness_analysis.severity === "Medium"   ? "bg-amber-50 border-amber-200" :
                                                             "bg-green-50 border-green-200"
          }`}>
            <div className={`w-14 h-14 rounded-full flex items-center justify-center shrink-0 ${
              data.weakness_analysis.severity === "Critical" ? "bg-red-100" :
              data.weakness_analysis.severity === "High"     ? "bg-orange-100" :
              data.weakness_analysis.severity === "Medium"   ? "bg-amber-100" : "bg-green-100"
            }`}>
              <AlertTriangle className={`w-7 h-7 ${
                data.weakness_analysis.severity === "Critical" ? "text-red-600" :
                data.weakness_analysis.severity === "High"     ? "text-orange-600" :
                data.weakness_analysis.severity === "Medium"   ? "text-amber-600" : "text-green-600"
              }`} />
            </div>
            <div>
              <p className="font-bold text-gray-900">{data.weakness_analysis.severity} Severity</p>
              <p className="text-sm text-gray-600">{data.weakness_analysis.total_issues} issue(s) detected</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-2xl font-bold font-['Outfit']"
                style={{ color: data.weakness_analysis.weakness_score >= 70 ? "#16a34a" : "#ef4444" }}>
                {data.weakness_analysis.weakness_score}%
              </p>
              <p className="text-xs text-gray-500">Profile quality</p>
            </div>
          </div>

          {data.weakness_analysis.red_flags?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-600 mb-2 uppercase tracking-wide flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5" />Red Flags
              </p>
              <div className="space-y-2">
                {data.weakness_analysis.red_flags.map((f, i) => (
                  <div key={i} className="flex items-start gap-2 p-3 bg-red-50 rounded-lg text-sm text-red-800 border border-red-200">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.weakness_analysis.weaknesses?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-600 mb-2 uppercase tracking-wide flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />Weaknesses
              </p>
              <div className="space-y-2">
                {data.weakness_analysis.weaknesses.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg text-sm text-amber-800 border border-amber-100">
                    <TrendingDown className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.weakness_analysis.improvement_areas?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-violet-600 mb-2 uppercase tracking-wide">Improvement Areas</p>
              <div className="space-y-1.5">
                {data.weakness_analysis.improvement_areas.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-gray-700 p-2 rounded-lg bg-violet-50">
                    <ChevronRight className="w-4 h-4 shrink-0 mt-0.5" style={{ color: VIOLET }} />
                    <span>{a}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: ATS Suggestions ─────────────────────────────────── */}
      {activeTab === "suggestions" && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 mb-1">Prioritised recommendations to improve ATS performance.</p>
          {data.ats_suggestions?.map((s, i) => (
            <div key={i} className={`p-4 rounded-xl border ${
              s.priority === "High"   ? "bg-red-50 border-red-200" :
              s.priority === "Medium" ? "bg-amber-50 border-amber-100" :
                                        "bg-gray-50 border-gray-200"
            }`}>
              <div className="flex items-start justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    s.priority === "High"   ? "bg-red-200 text-red-800" :
                    s.priority === "Medium" ? "bg-amber-200 text-amber-800" :
                                             "bg-gray-200 text-gray-700"
                  }`}>{s.priority}</span>
                  <span className="text-xs text-gray-500">{s.category}</span>
                </div>
                <span className="text-xs font-semibold" style={{ color: VIOLET }}>{s.impact}</span>
              </div>
              <p className="text-sm font-semibold text-gray-800 mb-1">{s.title}</p>
              <p className="text-xs text-gray-600 leading-relaxed">{s.detail}</p>
            </div>
          ))}
          {(!data.ats_suggestions || data.ats_suggestions.length === 0) && (
            <div className="text-center py-8">
              <CheckCheck className="w-10 h-10 mx-auto mb-2 text-green-500" />
              <p className="text-sm text-gray-500">No major suggestions — resume is well optimised!</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN DASHBOARD PAGE
// ─────────────────────────────────────────────────────────────────────────────
const AdvancedDashboardPage = () => {
  const navigate = useNavigate();

  const [loading, setLoading]   = useState(true);
  const [data, setData]         = useState({ resumes: [], stats: null });
  const [searchQuery, setSearchQuery]     = useState("");
  const [scoreFilter, setScoreFilter]     = useState("all");
  const [sortBy, setSortBy]               = useState("score-desc");
  const [roleQuery, setRoleQuery]         = useState("all");
  const [dateFrom, setDateFrom]           = useState("");
  const [dateTo, setDateTo]               = useState("");
  const [timeFrom, setTimeFrom]           = useState("");
  const [timeTo, setTimeTo]               = useState("");
  const [dateFilterActive, setDateFilterActive] = useState(false);

  const [expandedRow, setExpandedRow]     = useState(null);
  const [selectedIds, setSelectedIds]     = useState(new Set());
  const [emailModalOpen, setEmailModalOpen]     = useState(false);
  const [emailSentIds, setEmailSentIds]         = useState(new Set());
  const [singleEmailTarget, setSingleEmailTarget] = useState(null);

  const buildDateParams = () => ({
    from: dateFrom ? (timeFrom ? `${dateFrom}T${timeFrom}:00` : `${dateFrom}T00:00:00`) : "",
    to:   dateTo   ? (timeTo   ? `${dateTo}T${timeTo}:59`     : `${dateTo}T23:59:59`)   : "",
  });

  const fetchDashboard = useCallback(async (fromD = "", toD = "") => {
    setLoading(true);
    try {
      const uid = authUtils.getUserId();
      const dp  = fromD ? `&date_from=${encodeURIComponent(fromD)}` : "";
      const dt  = toD   ? `&date_to=${encodeURIComponent(toD)}`     : "";
      const res = await axiosInstance.get(
        `/api/dashboard?user_id=${uid}&scan_mode=advanced${dp}${dt}`
      );
      setData(res.data);
    } catch {
      toast.error("Failed to load advanced dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  const applyDateFilter = () => {
    const { from, to } = buildDateParams();
    setDateFilterActive(!!(dateFrom || dateTo));
    fetchDashboard(from, to);
  };
  const clearDateFilter = () => {
    setDateFrom(""); setDateTo(""); setTimeFrom(""); setTimeTo("");
    setDateFilterActive(false);
    fetchDashboard();
  };

  const handleUserChange = useCallback((uid) => {
    if (uid) { setData({ resumes: [], stats: null }); fetchDashboard(); }
  }, [fetchDashboard]);
  useUserChange(handleUserChange);

  useEffect(() => {
    const cur = localStorage.getItem("sessionId");
    const ref = { current: cur };
    const check = () => {
      const s = localStorage.getItem("sessionId");
      if (s && s !== ref.current) { ref.current = s; setData({ resumes: [], stats: null }); fetchDashboard(); }
    };
    check();
    const iv = setInterval(check, 200);
    return () => clearInterval(iv);
  }, [fetchDashboard]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  useEffect(() => {
    const logout = () => setData({ resumes: [], stats: null });
    window.addEventListener("userLoggedOut", logout);
    return () => window.removeEventListener("userLoggedOut", logout);
  }, []);

  const handleDelete = async (resumeId, e) => {
    e.stopPropagation();
    if (!window.confirm("Delete this resume?")) return;
    try {
      await axiosInstance.delete(`/api/resume/${resumeId}?user_id=${authUtils.getUserId()}`);
      toast.success("Resume deleted");
      const { from, to } = buildDateParams();
      fetchDashboard(from, to);
    } catch { toast.error("Failed to delete resume"); }
  };

  const handleDownloadReport = async (resumeId, candidateName, e) => {
    e.stopPropagation();
    try {
      const res = await axiosInstance.get(
        `/api/resume/${resumeId}/report?user_id=${authUtils.getUserId()}`,
        { responseType: "blob" }
      );
      const url  = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${candidateName || "resume"}_report.pdf`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("Report downloaded");
    } catch { toast.error("Failed to download report"); }
  };

  // Row selection helpers
  const toggleSelect = (id, e) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredResumes.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredResumes.map(r => r.id)));
    }
  };

  // Send emails (bulk – selected rows)
  const handleSendEmails = async (subject, bodyTemplate, attachReport = true, mergedCandidates = null, emailType = "shortlist") => {
    const ids = [...selectedIds];
    const emailOverrides = mergedCandidates
      ? Object.fromEntries(mergedCandidates.map(c => [c.id, c.email]))
      : {};
    const res = await axiosInstance.post("/api/send-shortlist-emails", {
      resume_ids: ids,
      user_id: authUtils.getUserId(),
      subject,
      body_template: bodyTemplate,
      attach_report: attachReport,
      email_overrides: emailOverrides,
      email_type: emailType,
    });
    const sent = res.data.total_sent || 0;
    toast.success(`${sent} email${sent !== 1 ? "s" : ""} sent${attachReport ? " with PDF report" : ""}`);
    setEmailSentIds(prev => {
      const next = new Set(prev);
      (res.data.results || []).forEach(r => {
        if (r.status === "sent" || r.status === "demo") next.add(r.resume_id);
      });
      return next;
    });
    return res.data;
  };

  // Send email to single candidate (per-row quick send)
  const handleSendSingle = async (resume, subject, bodyTemplate, attachReport = true, mergedCandidates = null, emailType = "shortlist") => {
    const overrideEmail = mergedCandidates?.[0]?.email;
    const res = await axiosInstance.post("/api/send-shortlist-emails", {
      resume_ids: [resume.id],
      user_id: authUtils.getUserId(),
      subject,
      body_template: bodyTemplate,
      attach_report: attachReport,
      email_overrides: overrideEmail ? { [resume.id]: overrideEmail } : {},
      email_type: emailType,
    });
    toast.success(`Email sent to ${resume.candidate_name}${attachReport ? " with PDF report" : ""}`);
    setEmailSentIds(prev => {
      const next = new Set(prev);
      (res.data.results || []).forEach(r => {
        if (r.status === "sent" || r.status === "demo") next.add(r.resume_id);
      });
      return next;
    });
    return res.data;
  };

  // Bulk delete selected resumes
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} selected resume${selectedIds.size !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    let deleted = 0;
    for (const id of [...selectedIds]) {
      try {
        await axiosInstance.delete(`/api/resume/${id}?user_id=${authUtils.getUserId()}`);
        deleted++;
      } catch { /* continue */ }
    }
    toast.success(`Deleted ${deleted} resume${deleted !== 1 ? "s" : ""}`);
    setSelectedIds(new Set());
    const { from, to } = buildDateParams();
    fetchDashboard(from, to);
  };

  // Quick-select helpers
  const selectShortlisted = () => {
    const ids = filteredResumes.filter(r => r.ats_score >= 70).map(r => r.id);
    setSelectedIds(new Set(ids));
    if (ids.length === 0) toast.info("No candidates with score ≥70% in current view");
  };

  // Derived
  const resumes     = data.resumes || [];
  const uniqueRoles = [...new Set(resumes.map(r => r.job_title).filter(Boolean))].sort();

  const isRecent = (r) => r.created_at && (Date.now() - new Date(r.created_at).getTime()) / 60000 <= 30;

  const filteredResumes = resumes
    .filter(r => {
      const q = searchQuery.toLowerCase();
      const passSearch = !q || r.filename?.toLowerCase().includes(q) || r.candidate_name?.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q);
      const passScore =
        scoreFilter === "all" ||
        (scoreFilter === "excellent" && r.ats_score >= 90) ||
        (scoreFilter === "good"      && r.ats_score >= 70 && r.ats_score < 90) ||
        (scoreFilter === "moderate"  && r.ats_score >= 40 && r.ats_score < 60) ||
        (scoreFilter === "low"       && r.ats_score < 40);
      const passRole   = roleQuery === "all" || r.job_title?.toLowerCase() === roleQuery.toLowerCase();
      const passRecent = sortBy === "recently-uploaded" ? isRecent(r) : true;
      return passSearch && passScore && passRole && passRecent;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "score-desc":        return b.ats_score - a.ats_score;
        case "score-asc":         return a.ats_score - b.ats_score;
        case "name-asc":          return (a.candidate_name||"").localeCompare(b.candidate_name||"");
        case "name-desc":         return (b.candidate_name||"").localeCompare(a.candidate_name||"");
        case "date-desc":         return new Date(b.created_at) - new Date(a.created_at);
        case "date-asc":          return new Date(a.created_at) - new Date(b.created_at);
        case "recently-uploaded": return new Date(b.created_at) - new Date(a.created_at);
        default: return 0;
      }
    });

  // Modal candidates: single-target overrides bulk selection
  const selectedCandidates = filteredResumes.filter(r => selectedIds.has(r.id));
  const modalCandidates = singleEmailTarget ? [singleEmailTarget] : selectedCandidates;
  const modalSendFn = singleEmailTarget
    ? (subj, body, attach, merged, emailType) => handleSendSingle(singleEmailTarget, subj, body, attach, merged, emailType)
    : (subj, body, attach, merged, emailType) => handleSendEmails(subj, body, attach, merged, emailType);

  // Charts
  const pieData = data.stats ? [
    { name: "Perfect (90%+)",    value: data.stats.score_distribution.excellent, color: "#ca8a04" },
    { name: "Good (70–89%)",     value: data.stats.score_distribution.good,      color: "#eab308" },
    { name: "Moderate (40–69%)", value: data.stats.score_distribution.moderate,  color: "#f97316" },
    { name: "Low (<40%)",        value: data.stats.score_distribution.low,       color: "#ef4444" },
  ].filter(d => d.value > 0) : [];

  const barData = [...resumes].sort((a, b) => b.ats_score - a.ats_score).slice(0, 10)
    .map((r, i) => ({ name: r.candidate_name || `Candidate ${i+1}`, score: r.ats_score }));

  const trendData = (() => {
    if (resumes.length < 2) return [];
    const sorted = [...resumes].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const size = Math.max(1, Math.ceil(sorted.length / 8));
    const chunks = [];
    for (let i = 0; i < sorted.length; i += size) {
      const c = sorted.slice(i, i + size);
      chunks.push({ batch: `Batch ${chunks.length+1}`, avg: Math.round(c.reduce((s,r)=>s+r.ats_score,0)/c.length) });
    }
    return chunks;
  })();

  const histogramData = [
    { range: "0-20",   count: resumes.filter(r => r.ats_score < 20).length,                      color: "#ef4444" },
    { range: "20-40",  count: resumes.filter(r => r.ats_score >= 20 && r.ats_score < 40).length,  color: "#f97316" },
    { range: "40-60",  count: resumes.filter(r => r.ats_score >= 40 && r.ats_score < 60).length,  color: "#eab308" },
    { range: "60-70",  count: resumes.filter(r => r.ats_score >= 60 && r.ats_score < 70).length,  color: "#a78bfa" },
    { range: "70-80",  count: resumes.filter(r => r.ats_score >= 70 && r.ats_score < 80).length,  color: "#8B5CF6" },
    { range: "80-100", count: resumes.filter(r => r.ats_score >= 80).length,                      color: VIOLET   },
  ];

  const detectedRolesData = (() => {
    const c = {};
    resumes.forEach(r => { const role = r.job_title || "Unspecified"; c[role] = (c[role] || 0) + 1; });
    return Object.entries(c).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value).slice(0, 8);
  })();

  const topSkillsData = (() => {
    const c = {};
    resumes.forEach(r => (r.matched_skills || []).forEach(s => { c[s] = (c[s] || 0) + 1; }));
    return Object.entries(c)
      .map(([skill, count]) => ({ skill, count, pct: Math.round((count / Math.max(resumes.length, 1)) * 100) }))
      .sort((a,b) => b.count - a.count).slice(0, 8);
  })();

  const funnelData = data.stats ? [
    { name: "Total Screened", value: data.stats.total_resumes,                   fill: "#c4b5fd" },
    { name: "Score 40%+",     value: resumes.filter(r=>r.ats_score>=40).length,  fill: "#a78bfa" },
    { name: "Score 60%+",     value: resumes.filter(r=>r.ats_score>=60).length,  fill: "#8B5CF6" },
    { name: "Score 80%+",     value: resumes.filter(r=>r.ats_score>=80).length,  fill: VIOLET   },
  ] : [];

  const uploadTypeData = (() => {
    const c = { single: 0, bulk: 0 };
    resumes.forEach(r => { c[(r.analysis_type === "advanced_bulk" || r.analysis_type === "bulk") ? "bulk" : "single"]++; });
    return [
      { name: "Single", value: c.single, color: VIOLET    },
      { name: "Bulk",   value: c.bulk,   color: "#C4B5FD" },
    ].filter(d => d.value > 0);
  })();

  const fitDistData = (() => {
    const counts = { "Exceptional\n(85%+)": 0, "Strong\n(70-84%)": 0, "Good\n(55-69%)": 0, "Partial\n(40-54%)": 0, "Poor\n(<40%)": 0 };
    resumes.forEach(r => {
      const s = r.candidate_fit?.fit_score || r.ats_score;
      if (s >= 85)      counts["Exceptional\n(85%+)"]++;
      else if (s >= 70) counts["Strong\n(70-84%)"]++;
      else if (s >= 55) counts["Good\n(55-69%)"]++;
      else if (s >= 40) counts["Partial\n(40-54%)"]++;
      else              counts["Poor\n(<40%)"]++;
    });
    return Object.entries(counts).map(([name, value], i) => ({
      name, value,
      fill: ["#7C3AED","#8B5CF6","#A78BFA","#f97316","#ef4444"][i]
    })).filter(d => d.value > 0);
  })();

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-gray-100 shadow-lg rounded-lg px-3 py-2 text-xs">
        <p className="font-semibold text-gray-700">{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color || p.fill }}>
            {p.name}: <span className="font-bold">{p.value}{p.name === "avg" ? "%" : ""}</span>
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F5F3FF]">

      {/* ── Email Modal ──────────────────────────────────────────────── */}
      <EmailModal
        isOpen={emailModalOpen || singleEmailTarget !== null}
        onClose={() => { setEmailModalOpen(false); setSingleEmailTarget(null); }}
        candidates={modalCandidates}
        onSend={modalSendFn}
        onEmailSent={() => {}}
      />

      {/* ── Header ───────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-violet-100 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/performance")}
              data-testid="back-btn" className="hover:bg-violet-50">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2">
              <img src="/talentlens-logo.png" alt="TalentLens Logo"
                className="w-10 h-10 object-contain rounded-xl" />
              <div>
                <span className="font-bold text-xl font-['Outfit']" style={{ color: VIOLET }}>TalentLens</span>
                <span className="ml-2 text-xs text-white px-2 py-0.5 rounded-full font-semibold" style={{ background: VIOLET }}>Advanced</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/performance")}
              className="border-amber-200 text-amber-700 hover:bg-amber-50">
              <TrendingUp className="w-4 h-4 mr-1.5" />Performance
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("/dashboard")}
              className="border-green-200 text-[#1A4D2E] hover:bg-green-50">
              <Target className="w-4 h-4 mr-1.5" />Manual Dashboard
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button data-testid="new-upload-btn" className="text-white"
                  style={{ background: `linear-gradient(135deg, ${VIOLET}, ${VIOLET2})` }}>
                  <Wand2 className="w-4 h-4 mr-2" />New Scan <ChevronDown className="w-4 h-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate("/single")}>Single Advanced Scan</DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/bulk")}>Bulk Advanced Scan</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {loading ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4" style={{ color: VIOLET }} />
              <p className="text-gray-600">Loading Advanced dashboard...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Title */}
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-3xl font-bold text-[#1A1A1A] font-['Outfit']">Advanced Dashboard</h1>
                  <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-semibold text-white" style={{ background: VIOLET }}>
                    <Sparkles className="w-3 h-3" />Advanced NLP-Powered
                  </span>
                </div>
                <p className="text-gray-500 mt-1 text-sm">
                  {resumes.length > 0
                    ? `${resumes.length} resume${resumes.length !== 1 ? "s" : ""} with auto-detected roles & deep analysis`
                    : "No advanced scan resumes yet"}
                  {dateFilterActive && <span className="ml-2 font-medium" style={{ color: VIOLET }}>· Date filter active</span>}
                </p>
              </div>
              {resumes.length > 0 && (
                <div className="hidden md:flex items-center gap-2 bg-white border border-violet-100 rounded-xl px-4 py-2 shadow-sm">
                  <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: VIOLET }} />
                  <span className="text-xs text-gray-500">Live Data</span>
                </div>
              )}
            </div>

            {/* Date Filter */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3 border-b border-gray-50">
                <CardTitle className="text-sm font-['Outfit'] flex items-center gap-2">
                  <CalendarDays className="w-4 h-4" style={{ color: VIOLET }} />
                  Filter by Upload Date &amp; Time
                  {dateFilterActive && <Badge className="text-xs ml-1 text-white" style={{ background: VIOLET }}>Active</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 items-end">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">From Date</label>
                    <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                      className="border-violet-200 text-sm h-9" data-testid="date-from" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">From Time</label>
                    <Input type="time" value={timeFrom} onChange={e => setTimeFrom(e.target.value)}
                      className="border-violet-200 text-sm h-9" data-testid="time-from" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">To Date</label>
                    <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                      className="border-violet-200 text-sm h-9" data-testid="date-to" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">To Time</label>
                    <Input type="time" value={timeTo} onChange={e => setTimeTo(e.target.value)}
                      className="border-violet-200 text-sm h-9" data-testid="time-to" />
                  </div>
                  <Button onClick={applyDateFilter} className="text-white h-9 text-sm" style={{ background: VIOLET }}>
                    <Filter className="w-3.5 h-3.5 mr-1.5" />Apply Filter
                  </Button>
                  {dateFilterActive && (
                    <Button variant="outline" onClick={clearDateFilter}
                      className="border-red-200 text-red-600 hover:bg-red-50 h-9 text-sm">
                      <X className="w-3.5 h-3.5 mr-1.5" />Clear
                    </Button>
                  )}
                </div>
                {dateFilterActive && (
                  <p className="text-xs mt-2.5 font-medium" style={{ color: VIOLET }}>
                    Showing: {dateFrom || "all"}{timeFrom ? ` ${timeFrom}` : ""} to {dateTo || "now"}{timeTo ? ` ${timeTo}` : ""}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Empty State */}
            {resumes.length === 0 && (
              <Card className="border-0 shadow-sm border-dashed border-2 border-violet-200">
                <CardContent className="py-16 text-center">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: VIO_LT }}>
                    <Brain className="w-8 h-8" style={{ color: VIOLET }} />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2 font-['Outfit']">No Advanced Scans Yet</h3>
                  <p className="text-gray-500 text-sm mb-6 max-w-sm mx-auto">
                    Run an Advanced Scan. No job description needed — AI auto-detects the best role, analyzes strengths, weaknesses, and more.
                  </p>
                  <div className="flex gap-3 justify-center">
                    <Button onClick={() => navigate("/single")} className="text-white" style={{ background: VIOLET }}>
                      <Wand2 className="w-4 h-4 mr-2" />Single Advanced Scan
                    </Button>
                    <Button variant="outline" onClick={() => navigate("/bulk")}
                      className="border-violet-200 hover:bg-violet-50" style={{ color: VIOLET }}>
                      Bulk Advanced Scan
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* KPI Cards */}
            {data.stats && resumes.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Total Advanced Scans", value: data.stats.total_resumes, sub: "Advanced scans",
                    icon: <Brain className="w-5 h-5" style={{ color: VIOLET }} />, bg: VIO_LT, color: "text-violet-700" },
                  { label: "Average Score", value: `${data.stats.average_score}%`,
                    sub: data.stats.average_score >= 70 ? "Above threshold" : "Below threshold",
                    icon: <TrendingUp className="w-5 h-5 text-blue-600" />, bg: "#EFF6FF", color: "text-blue-600" },
                  { label: "Top Candidates", value: data.stats.top_candidates, sub: "Score 70%+",
                    icon: <Award className="w-5 h-5 text-amber-600" />, bg: "#FFFBEB", color: "text-amber-600" },
                  { label: "Need Improvement", value: resumes.filter(r => r.ats_score < 60).length, sub: "Score below 60%",
                    icon: <AlertCircle className="w-5 h-5 text-red-500" />, bg: "#FEF2F2", color: "text-red-500" },
                ].map((kpi, i) => (
                  <Card key={i} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-5">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: kpi.bg }}>{kpi.icon}</div>
                      <p className={`text-3xl font-bold font-['Outfit'] ${kpi.color}`}>{kpi.value}</p>
                      <p className="text-sm text-gray-700 font-medium mt-0.5">{kpi.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{kpi.sub}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Charts */}
            {resumes.length > 0 && (
              <>
                {/* Row 1 */}
                <div className="grid md:grid-cols-2 gap-6">
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2 border-b border-gray-50">
                      <CardTitle className="text-base font-['Outfit'] flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: VIOLET }} />Score Band Distribution
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie data={pieData} cx="50%" cy="50%" innerRadius={65} outerRadius={95} paddingAngle={4} dataKey="value">
                            {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                          </Pie>
                          <Tooltip content={<CustomTooltip />} /><Legend iconType="circle" iconSize={8} />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2 border-b border-gray-50">
                      <CardTitle className="text-base font-['Outfit'] flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />Score Frequency Histogram
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={histogramData} barCategoryGap="20%">
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                          <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey="count" name="Resumes" radius={[6, 6, 0, 0]}>
                            {histogramData.map((e, i) => <Cell key={i} fill={e.color} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>

                {/* Row 2 */}
                <div className="grid md:grid-cols-2 gap-6">
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2 border-b border-gray-50">
                      <CardTitle className="text-base font-['Outfit'] flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: VIOLET }} />Top 10 Candidates by Score
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={barData} layout="vertical" barCategoryGap="15%">
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                          <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 11 }}
                            tickFormatter={v => v.length > 11 ? v.slice(0, 11) + "..." : v} />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey="score" name="Score" radius={[0, 6, 6, 0]}>
                            {barData.map((e, i) => (
                              <Cell key={i} fill={e.score >= 90 ? "#ca8a04" : e.score >= 70 ? "#eab308" : e.score >= 40 ? "#f97316" : "#ef4444"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2 border-b border-gray-50">
                      <CardTitle className="text-base font-['Outfit'] flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />Average Score Trend
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      {trendData.length >= 2 ? (
                        <ResponsiveContainer width="100%" height={280}>
                          <AreaChart data={trendData}>
                            <defs><linearGradient id="vsg" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%"  stopColor={VIOLET} stopOpacity={0.2} />
                              <stop offset="95%" stopColor={VIOLET} stopOpacity={0} />
                            </linearGradient></defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="batch" tick={{ fontSize: 11 }} />
                            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                            <Tooltip content={<CustomTooltip />} />
                            <Area type="monotone" dataKey="avg" name="Avg Score"
                              stroke={VIOLET} strokeWidth={2.5} fill="url(#vsg)"
                              dot={{ fill: VIOLET, r: 4 }} activeDot={{ r: 6 }} />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-[280px] text-gray-400 text-sm">Upload more resumes to see trend</div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Row 3 */}
                <div className="grid md:grid-cols-3 gap-6">
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2 border-b border-gray-50">
                      <CardTitle className="text-base font-['Outfit'] flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: VIOLET }} />Top Matched Skills
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      {topSkillsData.length > 0 ? (
                        <div className="space-y-3">
                          {topSkillsData.map((s, i) => (
                            <div key={i} className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="font-medium text-gray-700">{s.skill}</span>
                                <span className="text-gray-400">{s.count} · {s.pct}%</span>
                              </div>
                              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{
                                  width: `${s.pct}%`,
                                  backgroundColor: [VIOLET,"#8B5CF6","#A78BFA","#C4B5FD","#7C3AED","#6D28D9","#5B21B6","#4C1D95"][i % 8]
                                }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : <p className="text-sm text-gray-400 text-center py-8">No skill data yet</p>}
                    </CardContent>
                  </Card>

                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2 border-b border-gray-50">
                      <CardTitle className="text-base font-['Outfit'] flex items-center gap-2">
                        <Brain className="w-4 h-4" style={{ color: VIOLET }} />Detected Roles
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      {detectedRolesData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={230}>
                          <BarChart data={detectedRolesData} layout="vertical" barCategoryGap="15%">
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                            <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 10 }}
                              tickFormatter={v => v.length > 11 ? v.slice(0, 11) + "..." : v} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="value" name="Resumes" fill={VIOLET} radius={[0, 6, 6, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : <p className="text-sm text-gray-400 text-center py-8">No role data yet</p>}
                    </CardContent>
                  </Card>

                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2 border-b border-gray-50">
                      <CardTitle className="text-base font-['Outfit'] flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />Screening Funnel
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="space-y-2">
                        {funnelData.map((item, i) => {
                          const total = funnelData[0]?.value || 1;
                          const pct = Math.round((item.value / total) * 100);
                          return (
                            <div key={i} className="flex flex-col items-center">
                              <div className="flex justify-between w-full text-xs mb-0.5">
                                <span className="font-medium text-gray-700">{item.name}</span>
                                <span className="text-gray-500">{item.value} ({pct}%)</span>
                              </div>
                              <div className="w-full flex justify-center">
                                <div className="h-8 rounded-lg flex items-center justify-center"
                                  style={{ width: `${100 - i * 8}%`, backgroundColor: item.fill }}>
                                  <span className="text-white text-xs font-bold">{pct}%</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-xs text-gray-400 mt-3 text-center">Qualifying at each threshold</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Row 4 */}
                <div className="grid md:grid-cols-3 gap-6">
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2 border-b border-gray-50">
                      <CardTitle className="text-base font-['Outfit'] flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: VIOLET }} />Upload Type Split
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-2">
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie data={uploadTypeData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={4} dataKey="value">
                            {uploadTypeData.map((e, i) => <Cell key={i} fill={e.color} />)}
                          </Pie>
                          <Tooltip content={<CustomTooltip />} /><Legend iconType="circle" iconSize={8} />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2 border-b border-gray-50">
                      <CardTitle className="text-base font-['Outfit'] flex items-center gap-2">
                        <Gauge className="w-4 h-4" style={{ color: VIOLET }} />Candidate Fit Distribution
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-2">
                      {fitDistData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={180}>
                          <BarChart data={fitDistData} barCategoryGap="20%">
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                            <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="value" name="Candidates" radius={[4, 4, 0, 0]}>
                              {fitDistData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      ) : <p className="text-sm text-gray-400 text-center py-8">No fit data yet</p>}
                    </CardContent>
                  </Card>

                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2 border-b border-gray-50">
                      <CardTitle className="text-base font-['Outfit'] flex items-center gap-2">
                        <Zap className="w-4 h-4 text-amber-500" />Quick Insights
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { icon: <CheckCircle2 className="w-5 h-5 text-green-600" />, bg: "#F0FDF4", label: "Pass Rate (70%+)",
                            value: `${resumes.length > 0 ? Math.round((resumes.filter(r => r.ats_score >= 70).length / resumes.length) * 100) : 0}%`,
                            sub: `${resumes.filter(r => r.ats_score >= 70).length} of ${resumes.length}` },
                          { icon: <Brain className="w-5 h-5" style={{ color: VIOLET }} />, bg: VIO_LT, label: "Highest Score",
                            value: resumes.length > 0 ? `${Math.max(...resumes.map(r => r.ats_score))}%` : "--",
                            sub: resumes.length > 0 ? resumes.reduce((b, r) => r.ats_score > b.ats_score ? r : b).candidate_name || "Unknown" : "" },
                          { icon: <AlertCircle className="w-5 h-5 text-red-500" />, bg: "#FEF2F2", label: "Lowest Score",
                            value: resumes.length > 0 ? `${Math.min(...resumes.map(r => r.ats_score))}%` : "--",
                            sub: resumes.length > 0 ? resumes.reduce((w, r) => r.ats_score < w.ats_score ? r : w).candidate_name || "Unknown" : "" },
                          { icon: <Users className="w-5 h-5" style={{ color: VIOLET }} />, bg: VIO_LT, label: "Unique Job Roles",
                            value: uniqueRoles.length, sub: uniqueRoles.slice(0, 2).join(", ") || "--" },
                        ].map((item, i) => (
                          <div key={i} className="rounded-xl p-4 flex items-start gap-3" style={{ background: item.bg }}>
                            <div className="shrink-0 mt-0.5">{item.icon}</div>
                            <div className="min-w-0">
                              <p className="text-xs text-gray-500 font-medium">{item.label}</p>
                              <p className="text-xl font-bold text-gray-900 font-['Outfit']">{item.value}</p>
                              <p className="text-xs text-gray-400 truncate mt-0.5">{item.sub}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}

            {/* Filters */}
            {resumes.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4 space-y-3">
                  <div className="flex flex-col md:flex-row gap-3">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input placeholder="Search by name, email, or filename..."
                        value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        className="pl-10 border-violet-200" data-testid="search-input" />
                    </div>
                    <Select value={roleQuery} onValueChange={setRoleQuery}>
                      <SelectTrigger className="w-full md:w-[220px]" data-testid="role-filter">
                        <SelectValue placeholder="Filter by detected role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Detected Roles</SelectItem>
                        {uniqueRoles.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={scoreFilter} onValueChange={setScoreFilter}>
                      <SelectTrigger className="w-full md:w-[180px]" data-testid="score-filter">
                        <Filter className="w-4 h-4 mr-2" /><SelectValue placeholder="Filter by score" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Scores</SelectItem>
                        <SelectItem value="excellent">Perfect (90%+)</SelectItem>
                        <SelectItem value="good">Good (70–89%)</SelectItem>
                        <SelectItem value="moderate">Moderate (40–69%)</SelectItem>
                        <SelectItem value="low">Low (below 40%)</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={sortBy} onValueChange={setSortBy}>
                      <SelectTrigger className="w-full md:w-[200px]" data-testid="sort-select">
                        <SelectValue placeholder="Sort by" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="score-desc">Score: High to Low</SelectItem>
                        <SelectItem value="score-asc">Score: Low to High</SelectItem>
                        <SelectItem value="name-asc">Name: A to Z</SelectItem>
                        <SelectItem value="name-desc">Name: Z to A</SelectItem>
                        <SelectItem value="date-desc">Newest First</SelectItem>
                        <SelectItem value="date-asc">Oldest First</SelectItem>
                        <SelectItem value="recently-uploaded">🕐 Recently Uploaded</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {sortBy === "recently-uploaded" && (
                    <div className="flex items-center gap-2 pt-1 border-t border-violet-100">
                      <span className="w-1.5 h-1.5 rounded-full animate-pulse inline-block" style={{ background: VIOLET }} />
                      <span className="text-xs font-medium" style={{ color: VIOLET }}>
                        Showing {filteredResumes.length} resume{filteredResumes.length !== 1 ? "s" : ""} uploaded in the last 30 minutes
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ── Candidates Table ──────────────────────────────────────── */}
            {resumes.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3 border-b border-gray-100">
                  {/* Row 1: title + bulk email button */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="flex items-center gap-2 text-base font-bold font-['Outfit'] text-gray-800">
                      <Brain className="w-4 h-4" style={{ color: VIOLET }} />
                      Advanced Scan Candidates
                      <span className="text-gray-400 font-normal text-sm">({filteredResumes.length})</span>
                      {selectedIds.size > 0 && (
                        <Badge className="text-xs text-white" style={{ background: VIOLET }}>
                          {selectedIds.size} selected
                        </Badge>
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      {filteredResumes.length > 0 && (
                        <span className="text-xs text-gray-400">
                          Avg: {Math.round(filteredResumes.reduce((s, r) => s + r.ats_score, 0) / filteredResumes.length)}%
                        </span>
                      )}
                      <Button
                        size="sm"
                        onClick={() => {
                          if (selectedIds.size === 0) selectShortlisted();
                          else setEmailModalOpen(true);
                        }}
                        className="text-white text-xs h-8 font-semibold"
                        style={{ background: `linear-gradient(135deg, ${VIOLET}, ${VIOLET2})` }}
                      >
                        <Mail className="w-3.5 h-3.5 mr-1.5" />
                        {selectedIds.size > 0 ? `Send Email (${selectedIds.size})` : "Email Shortlisted"}
                      </Button>
                    </div>
                  </div>

                  {/* Row 2: quick-select action bar */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-500 font-medium mr-1">Quick select:</span>
                    <button
                      onClick={selectShortlisted}
                      className="text-xs px-2.5 py-1 rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 font-semibold transition-colors"
                    >
                      ✓ Shortlisted (≥70%)
                      <span className="ml-1 text-green-600">({filteredResumes.filter(r => r.ats_score >= 70).length})</span>
                    </button>
                    <button
                      onClick={toggleSelectAll}
                      className="text-xs px-2.5 py-1 rounded-lg border border-gray-300 text-gray-600 bg-gray-50 hover:bg-gray-100 font-semibold transition-colors"
                    >
                      {selectedIds.size === filteredResumes.length && filteredResumes.length > 0 ? "☐ Deselect All" : "☑ Select All"}
                    </button>
                    {selectedIds.size > 0 && (
                      <>
                        <button
                          onClick={() => setSelectedIds(new Set())}
                          className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                        >
                          ✕ Clear
                        </button>
                        <button
                          onClick={() => setEmailModalOpen(true)}
                          className="text-xs px-3 py-1 rounded-lg text-white font-semibold transition-all hover:opacity-90"
                          style={{ background: `linear-gradient(135deg, ${VIOLET}, ${VIOLET2})` }}
                        >
                          <Mail className="w-3 h-3 inline mr-1" />
                          Send to {selectedIds.size} selected
                        </button>
                        <button
                          onClick={handleBulkDelete}
                          className="text-xs px-3 py-1 rounded-lg text-white font-semibold transition-all hover:opacity-90 bg-red-500 hover:bg-red-600"
                        >
                          <Trash2 className="w-3 h-3 inline mr-1" />
                          Delete {selectedIds.size} selected
                        </button>
                      </>
                    )}
                    {emailSentIds.size > 0 && (
                      <span className="text-xs text-green-600 font-semibold ml-auto">
                        <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
                        {emailSentIds.size} emailed this session
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {filteredResumes.length === 0 ? (
                    <div className="text-center py-12">
                      <Brain className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 text-sm">No resumes match your filters.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="data-table w-full">
                        <thead>
                          <tr>
                            <th className="w-10">
                              <input
                                type="checkbox"
                                checked={selectedIds.size === filteredResumes.length && filteredResumes.length > 0}
                                onChange={toggleSelectAll}
                                className="w-4 h-4 accent-violet-600 cursor-pointer"
                              />
                            </th>
                            <th className="w-10">#</th>
                            <th>Candidate</th>
                            <th>File</th>
                            <th className="w-24">Score</th>
                            <th>Detected Role</th>
                            <th>Fit Score</th>
                            <th>Matched Skills</th>
                            <th>Uploaded</th>
                            <th className="w-36">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredResumes.map((resume, index) => (
                            <>
                              <tr
                                key={resume.id}
                                className={`cursor-pointer transition-colors ${
                                  expandedRow === resume.id ? "bg-violet-50" : "hover:bg-violet-50"
                                } ${selectedIds.has(resume.id) ? "bg-violet-50/60" : ""}`}
                                onClick={() => setExpandedRow(expandedRow === resume.id ? null : resume.id)}
                                data-testid={`resume-row-${index}`}
                              >
                                {/* Checkbox */}
                                <td onClick={e => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={selectedIds.has(resume.id)}
                                    onChange={e => toggleSelect(resume.id, e)}
                                    className="w-4 h-4 accent-violet-600 cursor-pointer"
                                  />
                                </td>
                                <td className="font-medium text-gray-400">{index + 1}</td>
                                <td>
                                  <p className="font-medium text-gray-800">{resume.candidate_name || "Unknown"}</p>
                                  {resume.email && <p className="text-xs text-gray-500">{resume.email}</p>}
                                </td>
                                <td className="text-sm text-gray-500 max-w-[150px] truncate">{resume.filename}</td>
                                <td>
                                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold ${getScoreColor(resume.ats_score)}`}>
                                    {resume.ats_score}%
                                  </span>
                                </td>
                                <td>
                                  <Badge className="text-xs border-0 text-white" style={{ background: VIOLET }}>
                                    {resume.job_title || "Detected"}
                                  </Badge>
                                </td>
                                <td>
                                  {resume.candidate_fit ? (
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-sm font-bold" style={{ color: getFitColor(resume.candidate_fit.fit_score) }}>
                                        {resume.candidate_fit.fit_score}%
                                      </span>
                                      <span className="text-xs text-gray-400 hidden lg:inline">
                                        {resume.candidate_fit.fit_label?.split(" ")[0]}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-gray-400">—</span>
                                  )}
                                </td>
                                <td>
                                  <div className="flex flex-wrap gap-1 max-w-[200px]">
                                    {resume.matched_skills?.slice(0, 3).map((skill, i) => (
                                      <Badge key={i} variant="outline" className="text-xs border-violet-200 text-violet-700">{skill}</Badge>
                                    ))}
                                    {(resume.matched_skills?.length || 0) > 3 && (
                                      <Badge variant="outline" className="text-xs">+{resume.matched_skills.length - 3}</Badge>
                                    )}
                                  </div>
                                </td>
                                <td className="text-xs text-gray-500 whitespace-nowrap">
                                  {resume.created_at ? (
                                    <span>
                                      {new Date(resume.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                                      <br />
                                      <span className="text-gray-400">{new Date(resume.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                                    </span>
                                  ) : "--"}
                                </td>
                                <td>
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {/* Expand toggle */}
                                    <Button variant="ghost" size="icon" className="h-8 w-8"
                                      title="Deep Analysis" style={{ color: VIOLET }}>
                                      {expandedRow === resume.id
                                        ? <ChevronUp className="w-4 h-4" />
                                        : <BarChart2 className="w-4 h-4" />}
                                    </Button>
                                    <Button variant="ghost" size="icon"
                                      onClick={e => { e.stopPropagation(); navigate(`/results/${resume.id}`); }}
                                      className="h-8 w-8" title="View" data-testid={`view-resume-${index}`}>
                                      <Eye className="w-4 h-4" />
                                    </Button>
                                    {/* Per-row Send Email button */}
                                    <Button
                                      variant="ghost" size="icon"
                                      onClick={e => { e.stopPropagation(); setSingleEmailTarget(resume); }}
                                      className={`h-8 w-8 transition-colors ${
                                        emailSentIds.has(resume.id)
                                          ? "text-green-600 hover:bg-green-50"
                                          : "hover:bg-violet-50"
                                      }`}
                                      style={emailSentIds.has(resume.id) ? {} : { color: VIOLET }}
                                      title={emailSentIds.has(resume.id) ? "Email sent (click to resend)" : "Send email"}
                                    >
                                      {emailSentIds.has(resume.id)
                                        ? <CheckCircle2 className="w-4 h-4" />
                                        : <Send className="w-4 h-4" />}
                                    </Button>
                                    <Button variant="ghost" size="icon"
                                      onClick={e => handleDownloadReport(resume.id, resume.candidate_name, e)}
                                      className="h-8 w-8 text-blue-500 hover:text-blue-700 hover:bg-blue-50" title="PDF"
                                      data-testid={`download-report-${index}`}>
                                      <Download className="w-4 h-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon"
                                      onClick={e => handleDelete(resume.id, e)}
                                      className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" title="Delete"
                                      data-testid={`delete-resume-${index}`}>
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>

                              {/* Expanded Advanced Analysis Row */}
                              {expandedRow === resume.id && (
                                <tr key={`${resume.id}-expanded`}>
                                  <td colSpan={10} className="p-0 border-b border-violet-100">
                                    <div className="px-4 pb-4">
                                      <AdvancedAnalysisPanel
                                        resumeId={resume.id}
                                        userId={authUtils.getUserId()}
                                      />
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>

      {/* ── Floating Action Bar ───────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl border border-violet-200"
          style={{ background: "white", boxShadow: "0 8px 32px rgba(109,40,217,0.18)" }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
              style={{ background: VIOLET }}>
              {selectedIds.size}
            </div>
            <span className="text-sm font-semibold text-gray-700">
              candidate{selectedIds.size !== 1 ? "s" : ""} selected
            </span>
          </div>
          <div className="w-px h-6 bg-gray-200" />
          <button
            onClick={() => setEmailModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-bold transition-all hover:opacity-90"
            style={{ background: `linear-gradient(135deg, ${VIOLET}, ${VIOLET2})` }}
          >
            <Mail className="w-4 h-4" />
            Send Email
          </button>
          <button
            onClick={handleBulkDelete}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-bold transition-all hover:opacity-90 bg-red-500 hover:bg-red-600"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-gray-500 text-sm hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />Clear
          </button>
        </div>
      )}
    </div>
  );
};

export default AdvancedDashboardPage;