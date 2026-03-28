import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import axiosInstance from "../utils/axiosInstance";
import { useUserChange } from "../hooks/useUserChange";
import { toast } from "sonner";
import {
  FileText, LogOut, Upload, LayoutDashboard, ChevronDown, ChevronRight,
  TrendingUp, TrendingDown, BarChart3, Users, Award, Star,
  BookOpen, Brain, Target, Zap, SortAsc, Layers, Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import authUtils from "@/utils/authUtils";

// ── Constants ─────────────────────────────────────────────────────────────────
const RECENT_MINUTES = 30; // "recently uploaded" window

const SORT_OPTIONS = [
  { key: "score_desc",   label: "Score: High to Low" },
  { key: "score_asc",    label: "Score: Low to High" },
  { key: "name_asc",     label: "Name: A to Z"       },
  { key: "name_desc",    label: "Name: Z to A"        },
  { key: "newest",       label: "Newest First"        },
  { key: "oldest",       label: "Oldest First"        },
  { key: "recent",       label: "Recently Uploaded"   },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const isRecent = (resume) => {
  if (!resume.created_at) return false;
  const diff = (Date.now() - new Date(resume.created_at).getTime()) / 60000;
  return diff <= RECENT_MINUTES;
};

const sortResumes = (list, sortKey) => {
  const arr = [...list];
  switch (sortKey) {
    case "score_desc": return arr.sort((a, b) => b.ats_score - a.ats_score);
    case "score_asc":  return arr.sort((a, b) => a.ats_score - b.ats_score);
    case "name_asc":   return arr.sort((a, b) => (a.candidate_name || "").localeCompare(b.candidate_name || ""));
    case "name_desc":  return arr.sort((a, b) => (b.candidate_name || "").localeCompare(a.candidate_name || ""));
    case "newest":     return arr.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    case "oldest":     return arr.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    case "recent":     return arr.filter(isRecent).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    default:           return arr;
  }
};

const getScoreLabel = (score) => {
  if (score >= 90) return { label: "Perfect Match", color: "bg-yellow-200 text-yellow-800" };
  if (score >= 70) return { label: "Good Match",    color: "bg-yellow-100 text-yellow-700" };
  if (score >= 40) return { label: "Moderate",      color: "bg-amber-100 text-amber-700"  };
  return               { label: "Low",              color: "bg-red-100 text-red-700"      };
};

// ── Scan type badge ───────────────────────────────────────────────────────────
const ScanBadge = ({ resume }) =>
  resume.scan_mode === "advanced" ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-100 text-violet-700 shrink-0">
      <Brain className="w-3 h-3" />Advanced
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-[#D9F99D] text-[#1A4D2E] shrink-0">
      <Target className="w-3 h-3" />Manual
    </span>
  );

// ── Recent upload dot ─────────────────────────────────────────────────────────
const RecentDot = ({ resume }) =>
  isRecent(resume) ? (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-600 shrink-0">
      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse inline-block" />
      New
    </span>
  ) : null;

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
const PerformanceResultsPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading]     = useState(true);
  const [userData, setUserData]   = useState({
    username: authUtils.getUsername(),
    email: authUtils.getCurrentUser()?.email || ""
  });

  const [allResumes, setAllResumes]   = useState([]);
  const [batches, setBatches]         = useState([]);   // [{id, title, created_at, resume_count}]

  // Filter / sort state
  const [scanTab,     setScanTab]     = useState("all");        // "all" | "manual" | "advanced"
  const [batchFilter, setBatchFilter] = useState("all");        // "all" | "latest" | <batch_id>
  const [sortKey,     setSortKey]     = useState("score_desc"); // SORT_OPTIONS keys

  // ── Fetch resumes + batches in parallel ───────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const userId = authUtils.getUserId();
      const [resumeRes, batchRes] = await Promise.all([
        axiosInstance.get(`/api/dashboard?user_id=${userId}`),
        axiosInstance.get(`/api/batches?user_id=${userId}`),
      ]);
      setAllResumes(resumeRes.data.resumes || []);
      setBatches(batchRes.data.batches || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load performance data");
    } finally {
      setLoading(false);
    }
  }, []);

  const resetState = useCallback(() => {
    setAllResumes([]); setBatches([]);
  }, []);

  const handleUserChange = useCallback((userId) => {
    if (userId) {
      setUserData({ username: authUtils.getUsername(), email: authUtils.getCurrentUser()?.email || "" });
      resetState(); fetchData();
    }
  }, [fetchData, resetState]);

  useUserChange(handleUserChange);

  useEffect(() => {
    const cur = localStorage.getItem("sessionId");
    const ref = { current: cur };
    const check = () => {
      const s = localStorage.getItem("sessionId");
      if (s && s !== ref.current) { ref.current = s; resetState(); fetchData(); }
    };
    check();
    const iv = setInterval(check, 200);
    return () => clearInterval(iv);
  }, [fetchData, resetState]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const logout = () => { setUserData({ username: "User", email: "" }); resetState(); };
    window.addEventListener("userLoggedOut", logout);
    return () => window.removeEventListener("userLoggedOut", logout);
  }, [resetState]);

  const handleLogout = () => { authUtils.logout(); navigate("/auth"); toast.success("Logged out"); };

  const getGreeting = () => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  };

  // ── Derived data pipeline: scan → batch → sort ────────────────────────────
  const manualResumes   = useMemo(() => allResumes.filter(r => r.scan_mode !== "advanced"), [allResumes]);
  const advancedResumes = useMemo(() => allResumes.filter(r => r.scan_mode === "advanced"), [allResumes]);

  // "latest" = resumes with no batch_id (single uploads) OR the most recently created batch
  const latestBatchId = useMemo(() => {
    if (!batches.length) return null;
    return batches[0]?.id; // already sorted newest first from API
  }, [batches]);

  const afterScanFilter = useMemo(() => {
    switch (scanTab) {
      case "manual":   return manualResumes;
      case "advanced": return advancedResumes;
      default:         return allResumes;
    }
  }, [scanTab, allResumes, manualResumes, advancedResumes]);

  const afterBatchFilter = useMemo(() => {
    if (batchFilter === "all")    return afterScanFilter;
    if (batchFilter === "latest") return afterScanFilter.filter(r => r.batch_id === latestBatchId || !r.batch_id);
    return afterScanFilter.filter(r => r.batch_id === batchFilter);
  }, [batchFilter, afterScanFilter, latestBatchId]);

  const visibleResumes = useMemo(() => sortResumes(afterBatchFilter, sortKey), [afterBatchFilter, sortKey]);

  // For "Recently Uploaded" sort — only show the recent ones
  const isRecentFilter  = sortKey === "recent";
  const recentCount     = useMemo(() => afterBatchFilter.filter(isRecent).length, [afterBatchFilter]);

  const topResumes = useMemo(() =>
    isRecentFilter
      ? visibleResumes
      : visibleResumes.filter(r => r.ats_score >= 70),
    [visibleResumes, isRecentFilter]
  );
  const lowResumes = useMemo(() =>
    isRecentFilter
      ? []
      : visibleResumes.filter(r => r.ats_score < 70),
    [visibleResumes, isRecentFilter]
  );

  // Stats always from full afterBatchFilter (not sorted subset)
  const visibleStats = afterBatchFilter.length > 0 ? {
    total:   afterBatchFilter.length,
    avg:     Math.round(afterBatchFilter.reduce((s, r) => s + r.ats_score, 0) / afterBatchFilter.length),
    top:     afterBatchFilter.filter(r => r.ats_score >= 70).length,
    perfect: afterBatchFilter.filter(r => r.ats_score >= 90).length,
  } : null;

  // Batch label helper
  const batchLabel = (b, idx) => b.title && b.title !== "Advanced Bulk Scan"
    ? `Batch ${idx + 1} — ${b.title.length > 22 ? b.title.slice(0, 22) + "…" : b.title}`
    : `Batch ${idx + 1}`;

  const activeSortLabel = SORT_OPTIONS.find(o => o.key === sortKey)?.label ?? "Sort";
  const activeBatchLabel = batchFilter === "all"    ? "All Batches"
                         : batchFilter === "latest" ? "Latest Upload"
                         : (() => {
                             const idx = batches.findIndex(b => b.id === batchFilter);
                             return idx >= 0 ? batchLabel(batches[idx], idx) : "Batch";
                           })();

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-[#1A4D2E] flex items-center justify-center mx-auto animate-pulse">
          <FileText className="w-8 h-8 text-white" />
        </div>
        <p className="text-gray-500 font-medium">Loading your dashboard...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8F9FA]">

      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          
          {/* Logo + Name */}
          <div className="flex items-center gap-2">
          <img 
            src="/talentlens-logo.png" 
            alt="TalentLens Logo" 
            className="w-10 h-10 object-contain rounded-xl"
          />
          
          <span className="font-bold text-xl text-[#1A4D2E] font-['Outfit']">TalentLens</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate("/dashboard")}
              className="border-gray-200 text-gray-600 hover:text-[#1A4D2E] hover:bg-[#F0FDF4]">
              <LayoutDashboard className="w-4 h-4 mr-2" />Manual Dashboard
            </Button>
            <Button variant="outline" onClick={() => navigate("/dashboard/advanced")}
              className="border-violet-200 text-violet-700 hover:bg-violet-50">
              <Brain className="w-4 h-4 mr-2" /> Advanced Dashboard
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="bg-[#1A4D2E] hover:bg-[#14532D] text-white">
                  <Upload className="w-4 h-4 mr-2" />Upload<ChevronDown className="w-4 h-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => navigate("/single")} className="cursor-pointer">
                  <FileText className="w-4 h-4 mr-2" />Single Screening
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/bulk")} className="cursor-pointer">
                  <Users className="w-4 h-4 mr-2" />Bulk Screening
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-10 h-10 rounded-full bg-[#D9F99D] border-0 hover:bg-[#ecfccb] p-0">
                  <span className="text-[#1A4D2E] font-bold text-sm">{userData.username.charAt(0).toUpperCase()}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-3 py-2.5 border-b border-gray-100">
                  <p className="font-semibold text-sm text-gray-800">{userData.username}</p>
                  <p className="text-xs text-gray-500 truncate">{userData.email}</p>
                </div>
                <div className="p-1.5 border-b border-gray-100">
                  <DropdownMenuItem onClick={() => navigate("/resume-guide")}
                    className="cursor-pointer rounded-lg flex items-center gap-2.5 px-2.5 py-2 group"
                    style={{ background: "#F0FDF4" }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#1A4D2E" }}>
                      <BookOpen className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-[#1A4D2E]">Resume Builder Guide</p>
                      <p className="text-xs text-gray-400 font-normal">Tips, ATS rules & scoring</p>
                    </div>
                    <ChevronRight className="w-3 h-3 text-gray-300 group-hover:text-[#1A4D2E] transition-colors" />
                  </DropdownMenuItem>
                </div>
                <div className="p-1">
                  <DropdownMenuItem onClick={handleLogout} className="text-red-600 cursor-pointer rounded-lg px-2.5 py-2">
                    <LogOut className="w-4 h-4 mr-2" />Logout
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        {/* ── Welcome Banner ── */}
        <div className="bg-gradient-to-r from-[#1A4D2E] to-[#2D6A4F] rounded-2xl p-6 text-white flex items-center justify-between">
          <div>
            <p className="text-[#D9F99D] text-sm font-medium mb-1">{getGreeting()},</p>
            <h1 className="text-2xl font-bold font-['Outfit'] mb-1">{userData.username} 👋</h1>
            <p className="text-white/70 text-sm">
              {allResumes.length > 0 ? (
                <>
                  <span className="text-[#D9F99D] font-semibold">{allResumes.length}</span> total resumes ·{" "}
                  <span className="text-[#D9F99D] font-semibold">{manualResumes.length}</span> manual ·{" "}
                  <span className="font-semibold text-violet-300">{advancedResumes.length}</span> AI advanced
                </>
              ) : "Upload your first resume to get started."}
            </p>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <Button onClick={() => navigate("/single")} variant="outline"
              className="border-white/30 text-white hover:bg-white/10 bg-transparent">
              Single Upload
            </Button>
            <Button onClick={() => navigate("/bulk")} className="bg-[#D9F99D] text-[#1A4D2E] hover:bg-[#ecfccb] font-semibold">
              Bulk Upload
            </Button>
          </div>
        </div>

        {/* ── Scan Type Tabs ── */}
        <div className="flex items-center gap-3 flex-wrap">
          {[
            { id: "all",      icon: <Zap className="w-4 h-4" />,    label: "All Resumes",  count: allResumes.length,      activeStyle: "border-gray-800 bg-gray-800 text-white", countStyle: "bg-white/20 text-white", defaultCount: "bg-gray-100 text-gray-700" },
            { id: "manual",   icon: <Target className="w-4 h-4" />, label: "Manual Scans", count: manualResumes.length,   activeStyle: "border-[#1A4D2E] bg-[#1A4D2E] text-white", countStyle: "bg-white/20 text-white", defaultCount: "bg-[#D9F99D] text-[#1A4D2E]" },
            { id: "advanced", icon: <Brain className="w-4 h-4" />,  label: "Advanced",  count: advancedResumes.length, activeStyle: "border-violet-700 bg-violet-700 text-white", countStyle: "bg-white/20 text-white", defaultCount: "bg-violet-100 text-violet-700" },
          ].map(tab => (
            <button key={tab.id} onClick={() => { setScanTab(tab.id); setBatchFilter("all"); }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 font-semibold text-sm transition-all ${
                scanTab === tab.id ? tab.activeStyle : "border-gray-200 bg-white text-gray-600 hover:border-gray-400"
              }`}>
              {tab.icon}{tab.label}
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                scanTab === tab.id ? tab.countStyle : tab.defaultCount
              }`}>{tab.count}</span>
            </button>
          ))}
        </div>

        {/* ── Filter + Sort Bar ── */}
        <div className="flex items-center gap-3 flex-wrap">

          {/* Batch Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 font-semibold text-sm transition-all bg-white ${
                batchFilter !== "all"
                  ? "border-[#1A4D2E] text-[#1A4D2E]"
                  : "border-gray-200 text-gray-600 hover:border-gray-400"
              }`}>
                <Layers className="w-4 h-4" />
                {activeBatchLabel}
                <ChevronDown className="w-3.5 h-3.5 ml-0.5 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <div className="px-3 py-1.5 text-xs font-bold text-gray-400 uppercase tracking-wide">Filter by Batch</div>
              <DropdownMenuSeparator />

              {/* All Batches */}
              <DropdownMenuItem
                onClick={() => setBatchFilter("all")}
                className={`cursor-pointer gap-2 ${batchFilter === "all" ? "bg-[#F0FDF4] text-[#1A4D2E] font-semibold" : ""}`}>
                <Zap className="w-4 h-4" />All Batches
                <span className="ml-auto text-xs text-gray-400">{afterScanFilter.length}</span>
              </DropdownMenuItem>

              {/* Latest Upload */}
              <DropdownMenuItem
                onClick={() => setBatchFilter("latest")}
                className={`cursor-pointer gap-2 ${batchFilter === "latest" ? "bg-[#F0FDF4] text-[#1A4D2E] font-semibold" : ""}`}>
                <Clock className="w-4 h-4" />Latest Upload
                <span className="ml-auto text-xs text-gray-400">
                  {afterScanFilter.filter(r => r.batch_id === latestBatchId || !r.batch_id).length}
                </span>
              </DropdownMenuItem>

              {/* Individual Batches */}
              {batches.length > 0 && <DropdownMenuSeparator />}
              {batches.map((b, idx) => (
                <DropdownMenuItem key={b.id}
                  onClick={() => setBatchFilter(b.id)}
                  className={`cursor-pointer gap-2 ${batchFilter === b.id ? "bg-[#F0FDF4] text-[#1A4D2E] font-semibold" : ""}`}>
                  <div className="w-5 h-5 rounded-md bg-[#1A4D2E] flex items-center justify-center shrink-0">
                    <span className="text-white text-xs font-bold">{idx + 1}</span>
                  </div>
                  <span className="truncate flex-1">{batchLabel(b, idx)}</span>
                  <span className="ml-auto text-xs text-gray-400 shrink-0">{b.resume_count ?? 0}</span>
                </DropdownMenuItem>
              ))}

              {batches.length === 0 && (
                <div className="px-3 py-2 text-xs text-gray-400 italic">No batches yet</div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Sort */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 font-semibold text-sm transition-all bg-white ${
                sortKey !== "score_desc"
                  ? "border-[#1A4D2E] text-[#1A4D2E]"
                  : "border-gray-200 text-gray-600 hover:border-gray-400"
              }`}>
                {sortKey === "recent"
                  ? <Clock className="w-4 h-4 text-blue-500" />
                  : <SortAsc className="w-4 h-4" />}
                {activeSortLabel}
                <ChevronDown className="w-3.5 h-3.5 ml-0.5 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <div className="px-3 py-1.5 text-xs font-bold text-gray-400 uppercase tracking-wide">Sort By</div>
              <DropdownMenuSeparator />

              {/* Regular sort options */}
              {SORT_OPTIONS.filter(o => o.key !== "recent").map(opt => (
                <DropdownMenuItem key={opt.key}
                  onClick={() => setSortKey(opt.key)}
                  className={`cursor-pointer ${sortKey === opt.key ? "bg-[#F0FDF4] text-[#1A4D2E] font-semibold" : ""}`}>
                  {opt.label}
                  {sortKey === opt.key && <span className="ml-auto text-xs">✓</span>}
                </DropdownMenuItem>
              ))}

              {/* Recently Uploaded — separated */}
              <DropdownMenuSeparator />
              <div className="px-3 py-1.5 text-xs font-bold text-gray-400 uppercase tracking-wide">Special</div>
              <DropdownMenuItem
                onClick={() => setSortKey("recent")}
                className={`cursor-pointer gap-2 ${sortKey === "recent" ? "bg-blue-50 text-blue-700 font-semibold" : ""}`}>
                <Clock className="w-4 h-4 text-blue-500" />
                Recently Uploaded
                {recentCount > 0 && (
                  <span className="ml-auto text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 font-bold">
                    {recentCount}
                  </span>
                )}
                {sortKey === "recent" && recentCount === 0 && <span className="ml-auto text-xs">✓</span>}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Active filter summary */}
          <span className="text-xs text-gray-400">
            {isRecentFilter
              ? recentCount > 0
                ? `${recentCount} resume${recentCount !== 1 ? "s" : ""} uploaded in the last ${RECENT_MINUTES} min`
                : `No resumes uploaded in the last ${RECENT_MINUTES} min`
              : visibleResumes.length > 0
              ? `Showing ${visibleResumes.length} resume${visibleResumes.length !== 1 ? "s" : ""}`
              : ""}
          </span>

          {/* Clear filters */}
          {(batchFilter !== "all" || sortKey !== "score_desc") && (
            <button
              onClick={() => { setBatchFilter("all"); setSortKey("score_desc"); }}
              className="ml-auto text-xs text-gray-400 hover:text-red-500 font-medium underline underline-offset-2 transition-colors">
              Clear filters
            </button>
          )}
        </div>

        {/* ── Recently Uploaded banner (when that sort is active) ── */}
        {isRecentFilter && (
          <div className={`flex items-center gap-3 px-5 py-3 rounded-xl border ${
            recentCount > 0
              ? "bg-blue-50 border-blue-200"
              : "bg-gray-50 border-gray-200"
          }`}>
            <Clock className={`w-5 h-5 shrink-0 ${recentCount > 0 ? "text-blue-500" : "text-gray-400"}`} />
            <div>
              {recentCount > 0 ? (
                <p className="text-sm font-semibold text-blue-700">
                  {recentCount} resume{recentCount !== 1 ? "s" : ""} uploaded in the last {RECENT_MINUTES} minutes
                </p>
              ) : (
                <p className="text-sm font-semibold text-gray-500">No new uploads in the last {RECENT_MINUTES} minutes</p>
              )}
              <p className="text-xs text-gray-400 mt-0.5">
                Resumes uploaded more than {RECENT_MINUTES} min ago are hidden in this view.
              </p>
            </div>
          </div>
        )}

        {/* ── KPI Stats ── */}
        {visibleStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Resumes Analyzed", value: visibleStats.total,   icon: <FileText className="w-5 h-5 text-[#1A4D2E]" />, bg: "#F0FDF4", color: "text-[#1A4D2E]" },
              { label: "Average Score",    value: `${visibleStats.avg}%`, icon: <BarChart3 className="w-5 h-5 text-blue-600" />, bg: "#EFF6FF", color: "text-blue-600" },
              { label: "Score 70%+",       value: visibleStats.top,     icon: <Star className="w-5 h-5 text-[#1A4D2E]" />,    bg: "#D9F99D", color: "text-[#1A4D2E]" },
              { label: "Perfect (90%+)",   value: visibleStats.perfect, icon: <Award className="w-5 h-5 text-amber-600" />,   bg: "#FFFBEB", color: "text-amber-600" },
            ].map((kpi, i) => (
              <Card key={i} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: kpi.bg }}>
                      {kpi.icon}
                    </div>
                  </div>
                  <p className={`text-3xl font-bold font-['Outfit'] ${kpi.color}`}>{kpi.value}</p>
                  <p className="text-sm text-gray-500 mt-1">{kpi.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ── Resume Lists ── */}
        {visibleResumes.length > 0 ? (
          <>
            {/* When "Recently Uploaded" is active — single flat list */}
            {isRecentFilter ? (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3 border-b border-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Clock className="w-4 h-4 text-blue-500" />
                      </div>
                      <CardTitle className="font-['Outfit'] text-base">Recently Uploaded</CardTitle>
                    </div>
                    <Badge className="bg-blue-100 text-blue-700 font-semibold text-xs">
                      Last {RECENT_MINUTES} min · {visibleResumes.length}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="space-y-2 max-h-[32rem] overflow-y-auto pr-1">
                    {visibleResumes.map((resume, index) => {
                      const scoreInfo = getScoreLabel(resume.ats_score);
                      return (
                        <div key={resume.id}
                          className="flex items-center justify-between p-3 rounded-xl hover:bg-blue-50 transition-all cursor-pointer group border border-transparent hover:border-blue-200"
                          onClick={() => navigate(`/results/${resume.id}`)}>
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-xs shrink-0">
                              {index + 1}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-gray-800 text-sm truncate group-hover:text-blue-600">
                                {resume.candidate_name || "Unknown"}
                              </p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <ScanBadge resume={resume} />
                                <RecentDot resume={resume} />
                                <p className="text-xs text-gray-400 truncate">{resume.email || resume.filename}</p>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${scoreInfo.color}`}>
                              {scoreInfo.label}
                            </span>
                            <span className="font-bold text-sm text-gray-700 w-10 text-right">{resume.ats_score}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ) : (
              /* Normal Top / Low split */
              <div className="grid md:grid-cols-2 gap-6">

                {/* Top Performers */}
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-3 border-b border-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-[#D9F99D] flex items-center justify-center">
                          <TrendingUp className="w-4 h-4 text-[#1A4D2E]" />
                        </div>
                        <CardTitle className="font-['Outfit'] text-base">Top Performers</CardTitle>
                      </div>
                      <Badge className="bg-[#D9F99D] text-[#1A4D2E] font-semibold text-xs">
                        Score ≥ 70% · {topResumes.length}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4">
                    {topResumes.length > 0 ? (
                      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                        {topResumes.map((resume, index) => {
                          const scoreInfo = getScoreLabel(resume.ats_score);
                          return (
                            <div key={resume.id}
                              className="flex items-center justify-between p-3 rounded-xl hover:bg-[#F0FDF4] transition-all cursor-pointer group border border-transparent hover:border-[#D9F99D]"
                              onClick={() => navigate(`/results/${resume.id}`)}>
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className="w-7 h-7 rounded-full bg-[#1A4D2E] flex items-center justify-center text-white font-bold text-xs shrink-0">
                                  {index + 1}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold text-gray-800 text-sm truncate group-hover:text-[#1A4D2E]">
                                    {resume.candidate_name || "Unknown"}
                                  </p>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <ScanBadge resume={resume} />
                                    <RecentDot resume={resume} />
                                    <p className="text-xs text-gray-400 truncate">{resume.email || resume.filename}</p>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0 ml-2">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${scoreInfo.color}`}>
                                  {scoreInfo.label}
                                </span>
                                <span className="font-bold text-sm text-[#1A4D2E] w-10 text-right">{resume.ats_score}%</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-10">
                        <TrendingUp className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                        <p className="text-sm text-gray-500">No top performers in this view</p>
                        <p className="text-xs text-gray-400 mt-1">Resumes scoring 70%+ appear here</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Needs Improvement */}
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-3 border-b border-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                          <TrendingDown className="w-4 h-4 text-red-500" />
                        </div>
                        <CardTitle className="font-['Outfit'] text-base">Needs Improvement</CardTitle>
                      </div>
                      <Badge className="bg-red-100 text-red-600 font-semibold text-xs">
                        Score &lt; 70% · {lowResumes.length}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4">
                    {lowResumes.length > 0 ? (
                      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                        {lowResumes.map((resume, index) => {
                          const scoreInfo = getScoreLabel(resume.ats_score);
                          return (
                            <div key={resume.id}
                              className="flex items-center justify-between p-3 rounded-xl hover:bg-red-50 transition-all cursor-pointer group border border-transparent hover:border-red-200"
                              onClick={() => navigate(`/results/${resume.id}`)}>
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className="w-7 h-7 rounded-full bg-red-400 flex items-center justify-center text-white font-bold text-xs shrink-0">
                                  {index + 1}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold text-gray-800 text-sm truncate group-hover:text-red-600">
                                    {resume.candidate_name || "Unknown"}
                                  </p>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <ScanBadge resume={resume} />
                                    <RecentDot resume={resume} />
                                    <p className="text-xs text-gray-400 truncate">{resume.email || resume.filename}</p>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0 ml-2">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${scoreInfo.color}`}>
                                  {scoreInfo.label}
                                </span>
                                <span className="font-bold text-sm text-red-500 w-10 text-right">{resume.ats_score}%</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-10">
                        <Award className="w-10 h-10 text-green-400 mx-auto mb-3" />
                        <p className="text-sm text-gray-500">All resumes performing well!</p>
                        <p className="text-xs text-gray-400 mt-1">Resumes below 70% appear here</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        ) : (
          /* Empty state */
          <Card className="border-2 border-dashed border-gray-200 shadow-none bg-white">
            <CardContent className="py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[#F0FDF4] flex items-center justify-center mx-auto mb-4">
                <Upload className="w-8 h-8 text-[#1A4D2E]" />
              </div>
              <h3 className="text-lg font-bold text-gray-800 font-['Outfit'] mb-2">
                {isRecentFilter          ? "No Recent Uploads"       :
                 batchFilter !== "all"   ? "No Resumes in This Batch" :
                 scanTab === "advanced"  ? "No Advanced Scans Yet" :
                 scanTab === "manual"    ? "No Manual Scans Yet"      :
                 "No Resumes Yet"}
              </h3>
              <p className="text-gray-500 text-sm mb-6 max-w-sm mx-auto">
                {isRecentFilter
                  ? `No resumes were uploaded in the last ${RECENT_MINUTES} minutes. Try a different filter.`
                  : batchFilter !== "all"
                  ? "This batch has no resumes matching the current scan type filter."
                  : "Upload your first resume to start seeing performance analytics."}
              </p>
              <div className="flex items-center justify-center gap-3">
                {(batchFilter !== "all" || isRecentFilter) ? (
                  <Button onClick={() => { setBatchFilter("all"); setSortKey("score_desc"); }}
                    variant="outline" className="border-[#1A4D2E]/20 text-[#1A4D2E] hover:bg-[#F0FDF4]">
                    Clear Filters
                  </Button>
                ) : (
                  <>
                    <Button onClick={() => navigate("/single")} variant="outline"
                      className="border-[#1A4D2E]/20 text-[#1A4D2E] hover:bg-[#F0FDF4]">
                      Single Upload
                    </Button>
                    <Button onClick={() => navigate("/bulk")} className="bg-[#1A4D2E] hover:bg-[#14532D] text-white">
                      Bulk Upload
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Resume Builder Guide CTA ── */}
        <div className="rounded-2xl p-6 flex items-center justify-between cursor-pointer group transition-all hover:shadow-md"
          style={{ background: "linear-gradient(135deg, #1A4D2E 0%, #2D6A4F 100%)" }}
          onClick={() => navigate("/resume-guide")}>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(217,249,157,0.15)", border: "1px solid rgba(217,249,157,0.3)" }}>
              <BookOpen className="w-7 h-7" style={{ color: "#D9F99D" }} />
            </div>
            <div>
              <p className="font-bold text-white text-lg font-['Outfit']">Resume Builder Guide</p>
              <p className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.6)" }}>
                Section-by-section tips · ATS rules · Scoring breakdown · Common myths
              </p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm shrink-0 transition-all group-hover:translate-x-1"
            style={{ background: "#D9F99D", color: "#1A4D2E" }}>
            Open Guide<ChevronRight className="w-4 h-4" />
          </div>
        </div>

      </main>
    </div>
  );
};

export default PerformanceResultsPage;