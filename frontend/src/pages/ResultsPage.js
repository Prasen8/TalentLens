import { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import {
  FileText, ArrowLeft, Loader2, CheckCircle2, AlertCircle,
  Mail, Phone, User, Briefcase, GraduationCap, Clock,
  Download, Gauge, TrendingUp, Award, Target, Zap,
  ShieldAlert, Lightbulb, Star, Info,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ─────────────────────────────────────────────────────────────────────────────
//  isDimensionReal — decides whether a score bar should be shown.
//
//  Experience: new backend returns null when nothing detected at all.
//              Any non-null value is a real computed score (could be from
//              explicit years, date ranges, graduation year, or title heuristic).
//              Old records (no jd_has_exp_req flag): hide exactly-80 fake defaults.
//
//  Education:  ALWAYS shown — new backend now computes real tier scores
//              (PhD=100, Masters=85, Bachelors=70, Diploma=50) even without
//              a JD requirement. Returns null only when nothing detected at all.
//
//  Seniority:  Only shown when JD explicitly mentions a seniority level.
// ─────────────────────────────────────────────────────────────────────────────
const isDimensionReal = (key, sb) => {
  const val = sb[key];
  if (val === null || val === undefined) return false;

  switch (key) {
    case "experience_score":
      // New records: backend already returns null when nothing detected
      if ("jd_has_exp_req" in sb) return true; // null already filtered above
      // Old records: 80 was the legacy fake default
      return val !== 80;

    case "education_score":
      // Education is always real now — backend computes genuine tier scores.
      // null already filtered above; any number here is a real score.
      return true;

    case "title_score":
      if ("jd_has_seniority" in sb) return sb.jd_has_seniority === true;
      return val !== 80;

    default:
      return true;
  }
};

// Experience detection method → human-readable label
const EXP_METHOD_LABEL = {
  "explicit":         "stated directly",
  "date_ranges":      "from date ranges",
  "year_span":        "from year span",
  "graduation_year":  "estimated from graduation",
  "seniority_title":  "estimated from job title",
  "not_detected":     null,
};

// Education tier → label
const EDU_TIER_LABEL = {
  4: "PhD / Doctorate",
  3: "Master's / MBA",
  2: "Bachelor's",
  1: "Diploma / Certification",
  0: "High School",
  "-1": null,
};

const ATS_DIMENSIONS = [
  { label: "Skills Match",    key: "skills_score",    weight: "45%", color: "#1A4D2E", bg: "#D1FAE5", alwaysShow: true  },
  { label: "Experience",      key: "experience_score", weight: "25%", color: "#1D4ED8", bg: "#DBEAFE", alwaysShow: false },
  { label: "Education",       key: "education_score",  weight: "10%", color: "#6D28D9", bg: "#EDE9FE", alwaysShow: false },
  { label: "Seniority Fit",   key: "title_score",      weight: "10%", color: "#B45309", bg: "#FEF3C7", alwaysShow: false },
  { label: "Keyword Density", key: "keyword_score",    weight: "10%", color: "#0E7490", bg: "#E0F2FE", alwaysShow: true  },
];

// Fit dimension label → ATS score key mapping
const FIT_TO_ATS_KEY = {
  "Experience":    "experience_score",
  "Education":     "education_score",
  "Seniority Fit": "title_score",
};

const getFitColors = (score) => {
  if (score >= 85) return { text: "#065F46", bg: "#D1FAE5", border: "#6EE7B7", accent: "#10B981" };
  if (score >= 70) return { text: "#78350F", bg: "#FEF9C3", border: "#FDE047", accent: "#F59E0B" };
  if (score >= 55) return { text: "#4C1D95", bg: "#EDE9FE", border: "#C4B5FD", accent: "#7C3AED" };
  if (score >= 40) return { text: "#92400E", bg: "#FEF3C7", border: "#FCD34D", accent: "#D97706" };
  return { text: "#991B1B", bg: "#FEE2E2", border: "#FCA5A5", accent: "#DC2626" };
};

const getScoreConfig = (score) => {
  if (score >= 90) return { label: "Perfect Match",  ring: "#F59E0B", track: "rgba(245,158,11,0.15)",  badge: "#FEF3C7", badgeText: "#92400E" };
  if (score >= 70) return { label: "Good Match",     ring: "#10B981", track: "rgba(16,185,129,0.15)",  badge: "#D1FAE5", badgeText: "#065F46" };
  if (score >= 40) return { label: "Moderate Match", ring: "#F97316", track: "rgba(249,115,22,0.15)",  badge: "#FFEDD5", badgeText: "#9A3412" };
  return               { label: "Low Match",      ring: "#EF4444", track: "rgba(239,68,68,0.15)",   badge: "#FEE2E2", badgeText: "#991B1B" };
};

const severityStyle = {
  Critical: "bg-red-100 text-red-700 border border-red-200",
  High:     "bg-orange-100 text-orange-700 border border-orange-200",
  Medium:   "bg-amber-100 text-amber-700 border border-amber-200",
  Low:      "bg-green-100 text-green-700 border border-green-200",
};
const priorityStyle = {
  High:   "bg-red-100 text-red-700",
  Medium: "bg-amber-100 text-amber-700",
  Low:    "bg-blue-100 text-blue-700",
};

// ─────────────────────────────────────────────────────────────────────────────
//  SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

const ScoreRing = ({ score, size = 96, strokeWidth = 8, color, track = "#e5e7eb", children }) => {
  const half   = size / 2;
  const r      = half - strokeWidth / 2 - 3;
  const circ   = 2 * Math.PI * r;
  const offset = circ - (Math.min(Math.max(score ?? 0, 0), 100) / 100) * circ;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
        style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
        <circle cx={half} cy={half} r={r} fill="none" stroke={track} strokeWidth={strokeWidth} />
        <circle cx={half} cy={half} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", zIndex: 10 }}>
        {children}
      </div>
    </div>
  );
};

const Bar = ({ value, color, height = 6 }) => (
  <div className="rounded-full overflow-hidden bg-gray-100" style={{ height }}>
    <div className="h-full rounded-full transition-all duration-700"
      style={{ width: `${Math.min(value ?? 0, 100)}%`, backgroundColor: color }} />
  </div>
);

const SectionHeader = ({ icon: Icon, title, accent = "#1A4D2E" }) => (
  <div className="flex items-center gap-3 mb-5">
    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
      style={{ background: accent + "18" }}>
      <Icon className="w-4 h-4" style={{ color: accent }} />
    </div>
    <h2 className="text-base font-bold text-gray-800 tracking-tight">{title}</h2>
    <div className="flex-1 h-px bg-gray-100" />
  </div>
);

const Panel = ({ children, className = "" }) => (
  <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden ${className}`}>
    {children}
  </div>
);

/** Shown in place of a score bar when the JD had no requirement for that dimension */
const NARow = ({ label }) => (
  <div className="flex items-center justify-between py-1.5">
    <span className="text-sm font-semibold text-gray-400">{label}</span>
    <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-400 border border-gray-200">
      <Info className="w-3 h-3" /> Not specified in JD
    </span>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
const ResultsPage = () => {
  const navigate = useNavigate();
  const { resumeId } = useParams();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [resume, setResume]   = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/resume/${resumeId}`);
        setResume(res.data);
      } catch {
        toast.error("Failed to load resume details");
        navigate("/dashboard");
      } finally { setLoading(false); }
    })();
  }, [resumeId, navigate]);

  const handleDownloadReport = async () => {
    try {
      const res = await axios.get(`${API}/resume/${resumeId}/report`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a   = Object.assign(document.createElement("a"), { href: url, download: `${resume.candidate_name || "resume"}_report.pdf` });
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success("Report downloaded");
    } catch { toast.error("Failed to download report"); }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#F5F6FA] flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-10 h-10 text-[#1A4D2E] animate-spin mx-auto mb-3" />
        <p className="text-gray-500 text-sm">Loading candidate profile…</p>
      </div>
    </div>
  );
  if (!resume) return null;

  const sc        = getScoreConfig(resume.ats_score);
  const fitColors = resume.candidate_fit ? getFitColors(resume.candidate_fit.fit_score) : null;
  const sb        = resume.score_breakdown || {};

  // Count how many conditional dimensions are real vs fake
  const conditionalDims = ATS_DIMENSIONS.filter(d => !d.alwaysShow);
  const naCount         = conditionalDims.filter(d => !isDimensionReal(d.key, sb)).length;
  const realCount       = ATS_DIMENSIONS.length - naCount;

  // Fit dimensions: filter out entries whose matching ATS dimension is fake
  const filteredFitDims = resume.candidate_fit?.fit_dimensions
    ? Object.entries(resume.candidate_fit.fit_dimensions).filter(([dim]) => {
        const atsKey = FIT_TO_ATS_KEY[dim];
        return atsKey ? isDimensionReal(atsKey, sb) : true;
      })
    : [];
  const skippedFitDims = resume.candidate_fit?.fit_dimensions
    ? Object.keys(resume.candidate_fit.fit_dimensions).filter(dim => {
        const atsKey = FIT_TO_ATS_KEY[dim];
        return atsKey && !isDimensionReal(atsKey, sb);
      })
    : [];

  return (
    <div className="min-h-screen bg-[#F5F6FA]" style={{ fontFamily: "'DM Sans','Inter',sans-serif" }}>

      {/* ── Nav ── */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(searchParams.get("from") === "advanced" ? "/dashboard/advanced" : -1)}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors">
              <ArrowLeft className="w-4 h-4 text-gray-600" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#1A4D2E] flex items-center justify-center">
                <FileText className="w-4 h-4 text-white" />
              </div>

              {/* Logo + Name */}
              <div className="flex items-center gap-2"></div>
              <img
                src="/talentlens-logo.png"
                alt="TalentLens Logo"
                className="w-10 h-10 object-contain rounded-xl"
                />
                
              <span className="font-bold text-[#1A4D2E] text-lg tracking-tight">TalentLens</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleDownloadReport}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1A4D2E] text-white text-sm font-medium hover:bg-[#14532D] transition-colors">
              <Download className="w-4 h-4" /> Download PDF Report
            </button>
            <button onClick={() => navigate("/dashboard")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors">
              Dashboard
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">

        {/* ── Hero ── */}
        <div className="bg-[#1A4D2E] rounded-2xl p-8 mb-7 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-72 h-72 rounded-full bg-white/5 -translate-y-1/3 translate-x-1/4 pointer-events-none" />
          <div className="relative flex flex-col sm:flex-row sm:items-center gap-6">
            <div className="w-16 h-16 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
              <User className="w-8 h-8 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white/60 text-xs uppercase tracking-widest font-semibold mb-1">Candidate Profile</p>
              <h1 className="text-2xl font-bold text-white truncate">{resume.candidate_name || "Unknown Candidate"}</h1>
              <div className="flex flex-wrap items-center gap-4 mt-2">
                {resume.email     && <span className="flex items-center gap-1.5 text-white/70 text-sm"><Mail      className="w-3.5 h-3.5"/>{resume.email}</span>}
                {resume.phone     && <span className="flex items-center gap-1.5 text-white/70 text-sm"><Phone     className="w-3.5 h-3.5"/>{resume.phone}</span>}
                {resume.job_title && <span className="flex items-center gap-1.5 text-white/70 text-sm"><Briefcase className="w-3.5 h-3.5"/>{resume.job_title}</span>}
              </div>
            </div>
            {/* Score card */}
            <div className="shrink-0">
              <div className="bg-white rounded-2xl shadow-xl overflow-hidden" style={{ minWidth: 148 }}>
                <div className="h-1.5" style={{ background: sc.ring }} />
                <div className="px-5 py-4 flex flex-col items-center gap-1">
                  <p className="font-black tabular-nums leading-none"
                    style={{ fontSize: "clamp(1.9rem,3.5vw,2.5rem)", color: sc.ring, letterSpacing: "-0.03em" }}>
                    {resume.ats_score}%
                  </p>
                  <div style={{ margin: "4px 0" }}>
                    <ScoreRing score={resume.ats_score} size={52} strokeWidth={5} color={sc.ring} track={sc.track} />
                  </div>
                  <span className="text-xs font-bold px-3 py-1 rounded-full"
                    style={{ background: sc.badge, color: sc.badgeText }}>{sc.label}</span>
                  <span className="text-gray-400 text-xs font-medium mt-0.5">ATS Score</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-3 gap-4 mb-7">
          {[
            { label: "Skills Matched",  value: resume.matched_skills?.length  || 0, color: "#059669", bg: "#D1FAE5", icon: CheckCircle2 },
            { label: "Skills Missing",  value: resume.missing_skills?.length  || 0, color: "#D97706", bg: "#FEF3C7", icon: AlertCircle  },
            { label: "Total Extracted", value: resume.extracted_skills?.length || 0, color: "#1A4D2E", bg: "#D1FAE5", icon: Star         },
          ].map(({ label, value, color, bg, icon: Icon }) => (
            <Panel key={label}>
              <div className="p-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg }}>
                  <Icon className="w-5 h-5" style={{ color }} />
                </div>
                <div>
                  <p className="text-2xl font-black" style={{ color }}>{value}</p>
                  <p className="text-xs text-gray-500 font-medium">{label}</p>
                </div>
              </div>
            </Panel>
          ))}
        </div>

        <div className="grid lg:grid-cols-5 gap-6">

          {/* ════ LEFT (3/5) ════ */}
          <div className="lg:col-span-3 space-y-6">

            {/* ── ATS Score Breakdown ── */}
            <Panel>
              <div className="p-6">
                <SectionHeader icon={Target} title="ATS Score Breakdown" accent="#1A4D2E" />

                {/* Overall ring */}
                <div className="flex items-center gap-5 p-4 rounded-xl bg-gray-50 mb-5">
                  <ScoreRing score={resume.ats_score} size={80} strokeWidth={7} color={sc.ring} track={sc.track}>
                    <span className="font-black tabular-nums"
                      style={{ fontSize: "0.95rem", color: sc.ring, letterSpacing: "-0.02em", lineHeight: 1 }}>
                      {resume.ats_score}%
                    </span>
                  </ScoreRing>
                  <div className="flex-1">
                    <p className="font-bold text-gray-800">Overall ATS Match</p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {naCount > 0
                        ? `Scored on ${realCount} applicable dimensions — ${naCount} not specified in JD`
                        : "Composite of all 5 weighted dimensions"}
                    </p>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {(sb.required_years ?? 0) > 0 && (
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">Req: {sb.required_years}+ yrs</span>
                      )}
                      {(sb.resume_years ?? 0) > 0 && (
                        <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">Has: ~{sb.resume_years} yrs</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* All 5 dimensions — real ones get a bar, fake ones get NARow */}
                <div className="space-y-4">
                  {ATS_DIMENSIONS.map(({ label, key, weight, color, bg, alwaysShow }) => {
                    const isReal = alwaysShow || isDimensionReal(key, sb);
                    if (!isReal) return <NARow key={key} label={label} />;
                    const val          = Math.round(sb[key] ?? 0);
                    const contribution = Math.round(val * parseFloat(weight) / 100);

                    // Sub-labels for experience and education
                    let subLabel = null;
                    if (key === "experience_score") {
                      const method = EXP_METHOD_LABEL[sb.exp_detection_method];
                      const yrs    = sb.resume_years ?? 0;
                      if (yrs > 0 && method) subLabel = `~${yrs} yr${yrs !== 1 ? "s" : ""} · ${method}`;
                      else if (yrs > 0)      subLabel = `~${yrs} yr${yrs !== 1 ? "s" : ""}`;
                      else if (method)       subLabel = method;
                    }
                    if (key === "education_score") {
                      const tier = sb.resume_edu_tier;
                      const lbl  = EDU_TIER_LABEL[tier];
                      const hasReq = sb.jd_has_edu_req;
                      subLabel = lbl
                        ? (hasReq ? `Candidate: ${lbl}` : lbl)
                        : null;
                    }

                    return (
                      <div key={key}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-gray-700">{label}</span>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: bg, color }}>{weight}</span>
                            {subLabel && (
                              <span className="text-xs text-gray-400 font-medium italic">{subLabel}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400 font-medium">+{contribution}pts</span>
                            <span className="text-sm font-black" style={{ color }}>{val}%</span>
                          </div>
                        </div>
                        <Bar value={val} color={color} height={7} />
                      </div>
                    );
                  })}
                </div>
              </div>
            </Panel>

            {/* ── Candidate Fit Score ── */}
            {resume.candidate_fit && fitColors && (
              <Panel>
                <div className="p-6">
                  <SectionHeader icon={Gauge} title="Candidate Fit Score" accent={fitColors.accent} />

                  <div className="flex items-center gap-5 p-5 rounded-xl border mb-6"
                    style={{ background: fitColors.bg, borderColor: fitColors.border }}>
                    <ScoreRing score={resume.candidate_fit.fit_score} size={92} strokeWidth={8}
                      color={fitColors.accent} track={fitColors.accent + "25"}>
                      <span className="font-black tabular-nums"
                        style={{ fontSize: "1.1rem", color: fitColors.text, letterSpacing: "-0.02em", lineHeight: 1 }}>
                        {resume.candidate_fit.fit_score}%
                      </span>
                    </ScoreRing>
                    <div className="flex-1 min-w-0">
                      <p className="text-lg font-black" style={{ color: fitColors.text }}>
                        {resume.candidate_fit.fit_label}
                      </p>
                      <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                        {resume.candidate_fit.hire_recommendation}
                      </p>
                      <div className="mt-2 flex items-center gap-2 text-xs text-gray-400 font-medium">
                        <span>ATS 40%</span><span>·</span><span>Strength 35%</span><span>·</span><span>Quality 25%</span>
                      </div>
                    </div>
                  </div>

                  {/* ── Fit dimensions — only REAL scores shown ── */}
                  {filteredFitDims.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
                        Multi-Dimensional Fit Breakdown
                      </p>
                      <div className="space-y-3">
                        {filteredFitDims.map(([dim, val]) => (
                          <div key={dim}>
                            <div className="flex justify-between items-center mb-1.5">
                              <span className="text-sm font-semibold text-gray-700">{dim}</span>
                              <span className="text-sm font-black" style={{ color: fitColors.accent }}>{Math.round(val)}%</span>
                            </div>
                            <Bar value={val} color={fitColors.accent} height={6} />
                          </div>
                        ))}

                        {/* Skipped dimensions notice */}
                        {skippedFitDims.length > 0 && (
                          <div className="mt-2 px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-100 flex items-start gap-2">
                            <Info className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                            <p className="text-xs text-gray-400 leading-relaxed">
                              <span className="font-semibold text-gray-500">Not evaluated: </span>
                              {skippedFitDims.join(", ")} — the JD had no requirements for these dimensions.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </Panel>
            )}

            {/* ── Analysis Feedback ── */}
            <Panel>
              <div className="p-6">
                <SectionHeader icon={FileText} title="Analysis Feedback" accent="#1A4D2E" />
                <div className="space-y-2.5">
                  {resume.feedback?.map((item, i) => {
                    const isGood = /✅|💪|👍|🗓️|🎓|🏅/.test(item);
                    const isWarn = /📚|🎯|🔑|💡/.test(item);
                    return (
                      <div key={i} className={`flex items-start gap-3 p-3.5 rounded-xl text-sm leading-relaxed ${
                        isGood ? "bg-green-50 text-green-800" : isWarn ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-800"
                      }`}>
                        <span className="shrink-0 w-5 h-5 rounded-full text-center text-xs font-bold leading-5 bg-white/60 text-gray-600">{i + 1}</span>
                        <span>{item}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Panel>

            {/* ── Skills Analysis ── */}
            <Panel>
              <div className="p-6">
                <SectionHeader icon={Zap} title="Skills Analysis" accent="#1A4D2E" />
                <div className="space-y-5">
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-bold text-gray-700">
                        Matched Skills
                        <span className="ml-2 text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                          {resume.matched_skills?.length || 0}
                        </span>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {resume.matched_skills?.length > 0
                        ? resume.matched_skills.map((s, i) => (
                            <span key={i} className="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-200">{s}</span>
                          ))
                        : <p className="text-sm text-gray-400">No matching skills found</p>}
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      <span className="text-sm font-bold text-gray-700">
                        Missing Skills
                        <span className="ml-2 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                          {resume.missing_skills?.length || 0}
                        </span>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {resume.missing_skills?.length > 0
                        ? resume.missing_skills.map((s, i) => (
                            <span key={i} className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">{s}</span>
                          ))
                        : <p className="text-sm text-green-600 font-semibold">All required skills present! 🎉</p>}
                    </div>
                  </div>
                </div>
              </div>
            </Panel>

            {/* ── Strength Analysis ── */}
            {resume.strength_analysis && (
              <Panel>
                <div className="p-6">
                  <SectionHeader icon={TrendingUp} title="Resume Strength Analysis" accent="#059669" />
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-green-50 border border-green-100 mb-5">
                    <ScoreRing score={resume.strength_analysis.strength_score} size={80} strokeWidth={7}
                      color="#059669" track="rgba(5,150,105,0.15)">
                      <span className="font-black text-green-700 tabular-nums"
                        style={{ fontSize: "0.95rem", letterSpacing: "-0.02em", lineHeight: 1 }}>
                        {resume.strength_analysis.strength_score}%
                      </span>
                    </ScoreRing>
                    <div>
                      <p className="font-bold text-green-800 text-lg">{resume.strength_analysis.strength_label}</p>
                      <p className="text-sm text-green-600 mt-0.5">Overall resume strength rating</p>
                    </div>
                  </div>
                  {resume.strength_analysis.category_scores && (
                    <div className="space-y-3 mb-5">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Category Breakdown</p>
                      {Object.entries(resume.strength_analysis.category_scores).map(([cat, score]) => (
                        <div key={cat}>
                          <div className="flex justify-between mb-1.5">
                            <span className="text-sm font-medium text-gray-700">{cat}</span>
                            <span className="text-sm font-bold text-green-700">{Math.round(score)}%</span>
                          </div>
                          <Bar value={score} color="#059669" height={5} />
                        </div>
                      ))}
                    </div>
                  )}
                  {resume.strength_analysis.strengths?.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Key Strengths</p>
                      <div className="space-y-2">
                        {resume.strength_analysis.strengths.map((s, i) => (
                          <div key={i} className="flex items-start gap-2.5 p-3 rounded-lg bg-green-50/50">
                            <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                            <p className="text-sm text-gray-700 leading-relaxed">{s}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Panel>
            )}

            {/* ── Weakness Analysis ── */}
            {resume.weakness_analysis && (
              <Panel>
                <div className="p-6">
                  <SectionHeader icon={ShieldAlert} title="Weakness Detection" accent="#DC2626" />
                  <div className="flex items-center gap-3 mb-5">
                    <span className={`text-sm font-bold px-3 py-1 rounded-full ${severityStyle[resume.weakness_analysis.severity] || severityStyle.Low}`}>
                      {resume.weakness_analysis.severity} Severity
                    </span>
                    <span className="text-sm text-gray-500">
                      {resume.weakness_analysis.total_issues} issue{resume.weakness_analysis.total_issues !== 1 ? "s" : ""} detected
                    </span>
                  </div>
                  {resume.weakness_analysis.red_flags?.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-bold text-red-600 uppercase tracking-wider mb-2">⚠ Red Flags</p>
                      <div className="space-y-2">
                        {resume.weakness_analysis.red_flags.map((f, i) => (
                          <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-100">
                            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                            <p className="text-sm text-red-700 leading-relaxed">{f}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {resume.weakness_analysis.weaknesses?.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2">Weaknesses</p>
                      <div className="space-y-2">
                        {resume.weakness_analysis.weaknesses.map((w, i) => (
                          <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-100">
                            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-sm text-amber-800 leading-relaxed">{w}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {resume.weakness_analysis.improvement_areas?.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2">Improvement Areas</p>
                      <div className="space-y-2">
                        {resume.weakness_analysis.improvement_areas.map((a, i) => (
                          <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-100">
                            <Lightbulb className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                            <p className="text-sm text-blue-800 leading-relaxed">{a}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Panel>
            )}

            {/* ── ATS Suggestions ── */}
            {resume.ats_suggestions?.length > 0 && (
              <Panel>
                <div className="p-6">
                  <SectionHeader icon={Lightbulb} title="ATS Improvement Suggestions" accent="#D97706" />
                  <div className="space-y-3">
                    {resume.ats_suggestions.map((sug, i) => (
                      <div key={i} className="p-4 rounded-xl border border-gray-100 bg-gray-50 hover:border-amber-200 hover:bg-amber-50/30 transition-colors">
                        <div className="flex items-start justify-between gap-3 mb-1.5">
                          <p className="text-sm font-bold text-gray-800">{sug.title}</p>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${priorityStyle[sug.priority] || priorityStyle.Low}`}>
                            {sug.priority}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mb-2 font-medium">{sug.category}</p>
                        <p className="text-sm text-gray-600 leading-relaxed">{sug.detail}</p>
                        {sug.impact && <p className="text-xs font-semibold text-green-600 mt-2">↑ {sug.impact}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              </Panel>
            )}
          </div>

          {/* ════ RIGHT (2/5) ════ */}
          <div className="lg:col-span-2 space-y-5">

            {resume.top3_roles?.length > 0 && (
              <Panel>
                <div className="p-5">
                  <SectionHeader icon={Award} title="Top Role Matches" accent="#7C3AED" />
                  <div className="space-y-4">
                    {resume.top3_roles.map((r, i) => (
                      <div key={i} className="p-3.5 rounded-xl border border-gray-100 bg-gray-50">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-bold text-gray-800">{["🥇","🥈","🥉"][i]} {r.role}</span>
                          <span className="text-sm font-black text-violet-700">{r.match_score}%</span>
                        </div>
                        <Bar value={r.match_score} color="#7C3AED" height={5} />
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-xs text-gray-400">{r.confidence_label}</span>
                          <span className="text-xs text-gray-400">ATS: {r.ats_score}%</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{r.fit_summary}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </Panel>
            )}

            <Panel>
              <div className="p-5">
                <SectionHeader icon={Zap} title="All Resume Skills" accent="#1A4D2E" />
                <div className="flex flex-wrap gap-1.5">
                  {resume.extracted_skills?.length > 0
                    ? resume.extracted_skills.map((s, i) => (
                        <span key={i} className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">{s}</span>
                      ))
                    : <p className="text-sm text-gray-400">No skills extracted</p>}
                </div>
              </div>
            </Panel>

            {resume.jd_skills?.length > 0 && (
              <Panel>
                <div className="p-5">
                  <SectionHeader icon={Target} title="Required by JD" accent="#1D4ED8" />
                  <div className="flex flex-wrap gap-1.5">
                    {resume.jd_skills.map((s, i) => {
                      const matched = resume.matched_skills?.map(x => x.toLowerCase()).includes(s.toLowerCase());
                      return (
                        <span key={i} className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                          matched ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"
                        }`}>{matched ? "✓" : "✗"} {s}</span>
                      );
                    })}
                  </div>
                </div>
              </Panel>
            )}

            {resume.experience_keywords?.length > 0 && (
              <Panel>
                <div className="p-5">
                  <SectionHeader icon={Clock} title="Experience Signals" accent="#1D4ED8" />
                  <div className="flex flex-wrap gap-1.5">
                    {resume.experience_keywords.map((k, i) => (
                      <span key={i} className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">{k}</span>
                    ))}
                  </div>
                </div>
              </Panel>
            )}

            {resume.education_keywords?.length > 0 && (
              <Panel>
                <div className="p-5">
                  <SectionHeader icon={GraduationCap} title="Education Signals" accent="#6D28D9" />
                  <div className="flex flex-wrap gap-1.5">
                    {resume.education_keywords.map((k, i) => (
                      <span key={i} className="px-2.5 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-100">{k}</span>
                    ))}
                  </div>
                </div>
              </Panel>
            )}

            <Panel>
              <div className="p-5 space-y-2.5 text-sm">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Scan Info</p>
                {[
                  ["Analysis Type", (resume.analysis_type || "single").replace("_", " ")],
                  ["Scan Mode",     resume.scan_mode || "manual"],
                  ["File",          resume.filename],
                  ["Date",          resume.created_at ? new Date(resume.created_at).toLocaleDateString("en-GB",{ day:"2-digit",month:"short",year:"numeric"}) : "N/A"],
                  ...(resume.batch_id ? [["Batch ID", resume.batch_id.slice(0,8)+"…"]] : []),
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-gray-500">{label}</span>
                    <span className="font-semibold text-gray-700 capitalize truncate max-w-[160px] text-right">{value}</span>
                  </div>
                ))}
              </div>
            </Panel>

            <div className="space-y-2.5">
              <button onClick={handleDownloadReport}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#1A4D2E] text-white text-sm font-bold hover:bg-[#14532D] transition-colors">
                <Download className="w-4 h-4" /> Download PDF Report
              </button>
              <button onClick={() => navigate("/single")}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-[#1A4D2E] text-[#1A4D2E] text-sm font-semibold hover:bg-green-50 transition-colors">
                Analyze Another Resume
              </button>
              <button onClick={() => navigate("/dashboard")}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors">
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ResultsPage;