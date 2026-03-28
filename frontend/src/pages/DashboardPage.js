import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axiosInstance from "../utils/axiosInstance";
import { useUserChange } from "../hooks/useUserChange";
import { toast } from "sonner";
import {
  FileText, ArrowLeft, Loader2, Users, TrendingUp,
  Search, Filter, Download, Trash2, Eye, ChevronDown, Target,
  Award, AlertCircle, CheckCircle2, Zap, Brain, Sparkles,
  CalendarDays, X, RefreshCw
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
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from "recharts";
import authUtils from "@/utils/authUtils";

const ACCENT = "#1A4D2E";

const DashboardPage = () => {
  const navigate = useNavigate();

  const [loading, setLoading]   = useState(true);
  const [data, setData]         = useState({ resumes: [], stats: null });
  const [searchQuery, setSearchQuery]     = useState("");
  const [scoreFilter, setScoreFilter]     = useState("all");
  const [sortBy, setSortBy]               = useState("score-desc");
  const [jobTitleQuery, setJobTitleQuery] = useState("all");
  const [dateFrom, setDateFrom]           = useState("");
  const [dateTo, setDateTo]               = useState("");
  const [timeFrom, setTimeFrom]           = useState("");
  const [timeTo, setTimeTo]               = useState("");
  const [dateFilterActive, setDateFilterActive] = useState(false);

  // ── ★ NEW: Bulk select state ───────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState(new Set());

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
        `/api/dashboard?user_id=${uid}&scan_mode=manual${dp}${dt}`
      );
      setData(res.data);
    } catch {
      toast.error("Failed to load dashboard data");
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

  // ── ★ NEW: Bulk select helpers ─────────────────────────────────────────────
  const toggleSelect = (id, e) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredResumes.length && filteredResumes.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredResumes.map(r => r.id)));
    }
  };

  // ── ★ NEW: Bulk delete handler ─────────────────────────────────────────────
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

  // ── Recently uploaded helper ───────────────────────────────────────────────
  const isRecent = (r) => r.created_at && (Date.now() - new Date(r.created_at).getTime()) / 60000 <= 30;

  // ── Derived ────────────────────────────────────────────────────────
  const resumes         = data.resumes || [];
  const uniqueJobTitles = [...new Set(resumes.map(r => r.job_title).filter(Boolean))].sort();

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
      const passTitle  = jobTitleQuery === "all" || r.job_title?.toLowerCase() === jobTitleQuery.toLowerCase();
      const passRecent = sortBy === "recently-uploaded" ? isRecent(r) : true;
      return passSearch && passScore && passTitle && passRecent;
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

  // ── Charts ─────────────────────────────────────────────────────────
  const pieData = data.stats ? [
    { name: "Perfect (90%+)",    value: data.stats.score_distribution.excellent, color: "#ca8a04" },
    { name: "Good (70–89%)",     value: data.stats.score_distribution.good,      color: "#eab308" },
    { name: "Moderate (40–69%)", value: data.stats.score_distribution.moderate,  color: "#f97316" },
    { name: "Low (<40%)",        value: data.stats.score_distribution.low,        color: "#ef4444" },
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
    { range: "0–20",   count: resumes.filter(r => r.ats_score < 20).length,                     color: "#ef4444" },
    { range: "20–40",  count: resumes.filter(r => r.ats_score >= 20 && r.ats_score < 40).length, color: "#f97316" },
    { range: "40–60",  count: resumes.filter(r => r.ats_score >= 40 && r.ats_score < 60).length, color: "#eab308" },
    { range: "60–70",  count: resumes.filter(r => r.ats_score >= 60 && r.ats_score < 70).length, color: "#84cc16" },
    { range: "70–80",  count: resumes.filter(r => r.ats_score >= 70 && r.ats_score < 80).length, color: "#22c55e" },
    { range: "80–100", count: resumes.filter(r => r.ats_score >= 80).length,                     color: "#1A4D2E" },
  ];

  const jobTitleData = (() => {
    const c = {};
    resumes.forEach(r => { const t = r.job_title||"Unspecified"; c[t]=(c[t]||0)+1; });
    return Object.entries(c).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value).slice(0,6);
  })();

  const topSkillsData = (() => {
    const c = {};
    resumes.forEach(r => (r.matched_skills||[]).forEach(s => { c[s]=(c[s]||0)+1; }));
    return Object.entries(c)
      .map(([skill,count])=>({skill,count,pct:Math.round((count/Math.max(resumes.length,1))*100)}))
      .sort((a,b)=>b.count-a.count).slice(0,8);
  })();

  const funnelData = data.stats ? [
    { name: "Total Screened", value: data.stats.total_resumes,                       fill: "#93c5fd" },
    { name: "Score ≥ 40%",    value: resumes.filter(r=>r.ats_score>=40).length,      fill: "#60a5fa" },
    { name: "Score ≥ 60%",    value: resumes.filter(r=>r.ats_score>=60).length,      fill: "#3b82f6" },
    { name: "Score ≥ 80%",    value: resumes.filter(r=>r.ats_score>=80).length,      fill: "#1d4ed8" },
  ] : [];

  const uploadTypeData = (() => {
    const c = { single: 0, bulk: 0 };
    resumes.forEach(r => { c[(r.analysis_type==="bulk")?"bulk":"single"]++; });
    return [
      { name: "Single", value: c.single, color: ACCENT },
      { name: "Bulk",   value: c.bulk,   color: "#D9F99D" },
    ].filter(d => d.value > 0);
  })();

  const getScoreColor = s =>
    s >= 90 ? "text-yellow-800 bg-yellow-200" :
    s >= 70 ? "text-yellow-700 bg-yellow-100" :
    s >= 40 ? "text-amber-700 bg-amber-100" : "text-red-700 bg-red-100";

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-gray-100 shadow-lg rounded-lg px-3 py-2 text-xs">
        <p className="font-semibold text-gray-700">{label}</p>
        {payload.map((p,i) => (
          <p key={i} style={{color: p.color||p.fill}}>
            {p.name}: <span className="font-bold">{p.value}{p.name==="avg"?"%":""}</span>
          </p>
        ))}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-[#F8F9FA]">

      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/performance")}
              data-testid="back-btn" className="hover:bg-[#F0FDF4]">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2">
              <img 
                src="/talentlens-logo.png" 
                alt="TalentLens Logo" 
                className="w-10 h-10 object-contain rounded-xl"
              />
              <div>
                <span className="font-bold text-xl text-[#1A4D2E] font-['Outfit']">TalentLens</span>
                <span className="ml-2 text-xs bg-[#D9F99D] text-[#1A4D2E] px-2 py-0.5 rounded-full font-semibold">Manual</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/performance")}
              className="border-amber-200 text-amber-700 hover:bg-amber-50">
              <TrendingUp className="w-4 h-4 mr-1.5" />
              Performance
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("/dashboard/advanced")}
              className="border-violet-200 text-violet-700 hover:bg-violet-50">
              <Brain className="w-4 h-4 mr-1.5" />
              <Sparkles className="w-3 h-3 mr-1 text-amber-400" />
              Advanced Dashboard
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button data-testid="new-upload-btn" className="bg-[#1A4D2E] hover:bg-[#14532D] text-white">
                  New Upload <ChevronDown className="w-4 h-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate("/single")}>Single Upload</DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/bulk")}>Bulk Upload</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {loading ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <Loader2 className="w-12 h-12 text-[#1A4D2E] animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Loading dashboard...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Title */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-[#1A1A1A] font-['Outfit']">Manual Screening Dashboard</h1>
                <p className="text-gray-500 mt-1 text-sm">
                  {resumes.length > 0
                    ? `${resumes.length} resume${resumes.length!==1?"s":""} screened with job descriptions`
                    : "No manual scan resumes yet"}
                  {dateFilterActive && <span className="ml-2 text-[#1A4D2E] font-medium">· Date filter active</span>}
                </p>
              </div>
              {resumes.length > 0 && (
                <div className="hidden md:flex items-center gap-2 bg-white border border-gray-100 rounded-xl px-4 py-2 shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-xs text-gray-500">Live Data</span>
                </div>
              )}
            </div>

            {/* Empty State */}
            {resumes.length === 0 && (
              <Card className="border-0 shadow-sm border-dashed border-2 border-gray-200">
                <CardContent className="py-16 text-center">
                  <div className="w-16 h-16 rounded-full bg-[#F0FDF4] flex items-center justify-center mx-auto mb-4">
                    <Target className="w-8 h-8 text-[#1A4D2E]" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2 font-['Outfit']">No Manual Scans Yet</h3>
                  <p className="text-gray-500 text-sm mb-6 max-w-sm mx-auto">
                    Upload resumes with a job description to begin screening candidates.
                  </p>
                  <div className="flex gap-3 justify-center">
                    <Button onClick={() => navigate("/single")} className="bg-[#1A4D2E] hover:bg-[#14532D] text-white">Single Upload</Button>
                    <Button variant="outline" onClick={() => navigate("/bulk")} className="border-[#1A4D2E]/20 text-[#1A4D2E] hover:bg-[#F0FDF4]">Bulk Upload</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* KPI Cards */}
            {data.stats && resumes.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Total Resumes",    value: data.stats.total_resumes,                    sub: "Manual scans",      icon: <FileText className="w-5 h-5 text-[#1A4D2E]" />,  bg: "bg-[#F0FDF4]", color: "text-[#1A4D2E]" },
                  { label: "Average Score",    value: `${data.stats.average_score}%`,              sub: data.stats.average_score>=70?"Above threshold ✓":"Below threshold", icon: <TrendingUp className="w-5 h-5 text-blue-600" />, bg: "bg-blue-50", color: "text-blue-600" },
                  { label: "Top Candidates",   value: data.stats.top_candidates,                   sub: "Score ≥ 70%",       icon: <Award className="w-5 h-5 text-amber-600" />,     bg: "bg-amber-50",  color: "text-amber-600" },
                  { label: "Need Improvement", value: resumes.filter(r=>r.ats_score<60).length,    sub: "Score below 60%",   icon: <AlertCircle className="w-5 h-5 text-red-500" />, bg: "bg-red-50",    color: "text-red-500" },
                ].map((kpi,i) => (
                  <Card key={i} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-5">
                      <div className={`w-10 h-10 rounded-xl ${kpi.bg} flex items-center justify-center mb-3`}>{kpi.icon}</div>
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
                {/* Row 1: Pie + Histogram */}
                <div className="grid md:grid-cols-2 gap-6">
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2 border-b border-gray-50">
                      <CardTitle className="text-base font-['Outfit'] flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#1A4D2E]" />Score Band Distribution
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie data={pieData} cx="50%" cy="50%" innerRadius={65} outerRadius={95} paddingAngle={4} dataKey="value">
                            {pieData.map((e,i) => <Cell key={i} fill={e.color} />)}
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
                          <XAxis dataKey="range" tick={{fontSize:11}} /><YAxis allowDecimals={false} tick={{fontSize:11}} />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey="count" name="Resumes" radius={[6,6,0,0]}>
                            {histogramData.map((e,i) => <Cell key={i} fill={e.color} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>

                {/* Row 2: Top Candidates + Trend */}
                <div className="grid md:grid-cols-2 gap-6">
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2 border-b border-gray-50">
                      <CardTitle className="text-base font-['Outfit'] flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#1A4D2E]" />Top 10 Candidates by Score
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={barData} layout="vertical" barCategoryGap="15%">
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                          <XAxis type="number" domain={[0,100]} tick={{fontSize:11}} />
                          <YAxis dataKey="name" type="category" width={90} tick={{fontSize:11}} tickFormatter={v=>v.length>11?v.slice(0,11)+"…":v} />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey="score" name="Score" radius={[0,6,6,0]}>
                            {barData.map((e,i)=><Cell key={i} fill={e.score>=90?"#ca8a04":e.score>=70?"#eab308":e.score>=40?"#f97316":"#ef4444"} />)}
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
                      {trendData.length>=2 ? (
                        <ResponsiveContainer width="100%" height={280}>
                          <AreaChart data={trendData}>
                            <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%"  stopColor={ACCENT} stopOpacity={0.2} />
                              <stop offset="95%" stopColor={ACCENT} stopOpacity={0} />
                            </linearGradient></defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="batch" tick={{fontSize:11}} />
                            <YAxis domain={[0,100]} tick={{fontSize:11}} />
                            <Tooltip content={<CustomTooltip />} />
                            <Area type="monotone" dataKey="avg" name="Avg Score" stroke={ACCENT} strokeWidth={2.5} fill="url(#sg)"
                              dot={{fill:ACCENT,r:4}} activeDot={{r:6}} />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-[280px] text-gray-400 text-sm">Upload more resumes to see trend</div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Row 3: Skills + Job Title + Funnel */}
                <div className="grid md:grid-cols-3 gap-6">
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2 border-b border-gray-50">
                      <CardTitle className="text-base font-['Outfit'] flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-violet-500" />Top Matched Skills
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      {topSkillsData.length>0 ? (
                        <div className="space-y-3">
                          {topSkillsData.map((s,i)=>(
                            <div key={i} className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="font-medium text-gray-700">{s.skill}</span>
                                <span className="text-gray-400">{s.count} · {s.pct}%</span>
                              </div>
                              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{width:`${s.pct}%`,backgroundColor:["#1A4D2E","#22c55e","#3b82f6","#7c3aed","#f59e0b","#ef4444","#14b8a6","#f97316"][i%8]}} />
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
                        <span className="w-2 h-2 rounded-full bg-teal-500" />Resumes by Job Title
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      {jobTitleData.length>0 ? (
                        <ResponsiveContainer width="100%" height={230}>
                          <BarChart data={jobTitleData} layout="vertical" barCategoryGap="15%">
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                            <XAxis type="number" allowDecimals={false} tick={{fontSize:10}} />
                            <YAxis dataKey="name" type="category" width={80} tick={{fontSize:10}} tickFormatter={v=>v.length>10?v.slice(0,10)+"…":v} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="value" name="Resumes" fill="#14b8a6" radius={[0,6,6,0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : <p className="text-sm text-gray-400 text-center py-8">No data yet</p>}
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
                        {funnelData.map((item,i)=>{
                          const total=funnelData[0]?.value||1;
                          const pct=Math.round((item.value/total)*100);
                          return (
                            <div key={i} className="flex flex-col items-center">
                              <div className="flex justify-between w-full text-xs mb-0.5">
                                <span className="font-medium text-gray-700">{item.name}</span>
                                <span className="text-gray-500">{item.value} ({pct}%)</span>
                              </div>
                              <div className="w-full flex justify-center">
                                <div className="h-8 rounded-lg flex items-center justify-center"
                                  style={{width:`${100-i*8}%`,backgroundColor:item.fill}}>
                                  <span className="text-white text-xs font-bold">{pct}%</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-xs text-gray-400 mt-3 text-center">Candidates qualifying at each threshold</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Row 4: Upload Type + Quick Insights */}
                <div className="grid md:grid-cols-3 gap-6">
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2 border-b border-gray-50">
                      <CardTitle className="text-base font-['Outfit'] flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#1A4D2E]" />Upload Type Split
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-2">
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie data={uploadTypeData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={4} dataKey="value">
                            {uploadTypeData.map((e,i)=><Cell key={i} fill={e.color} />)}
                          </Pie>
                          <Tooltip content={<CustomTooltip />} /><Legend iconType="circle" iconSize={8} />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card className="border-0 shadow-sm md:col-span-2">
                    <CardHeader className="pb-2 border-b border-gray-50">
                      <CardTitle className="text-base font-['Outfit'] flex items-center gap-2">
                        <Zap className="w-4 h-4 text-amber-500" />Quick Insights
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { icon:<CheckCircle2 className="w-5 h-5 text-green-600"/>, bg:"bg-green-50", label:"Pass Rate (≥70%)",
                            value:`${resumes.length>0?Math.round((resumes.filter(r=>r.ats_score>=70).length/resumes.length)*100):0}%`,
                            sub:`${resumes.filter(r=>r.ats_score>=70).length} of ${resumes.length}` },
                          { icon:<Target className="w-5 h-5 text-[#1A4D2E]"/>, bg:"bg-[#F0FDF4]", label:"Highest Score",
                            value:resumes.length>0?`${Math.max(...resumes.map(r=>r.ats_score))}%`:"—",
                            sub:resumes.length>0?resumes.reduce((b,r)=>r.ats_score>b.ats_score?r:b).candidate_name||"Unknown":"" },
                          { icon:<AlertCircle className="w-5 h-5 text-red-500"/>, bg:"bg-red-50", label:"Lowest Score",
                            value:resumes.length>0?`${Math.min(...resumes.map(r=>r.ats_score))}%`:"—",
                            sub:resumes.length>0?resumes.reduce((w,r)=>r.ats_score<w.ats_score?r:w).candidate_name||"Unknown":"" },
                          { icon:<Users className="w-5 h-5 text-teal-600"/>, bg:"bg-teal-50", label:"Unique Job Titles",
                            value:uniqueJobTitles.length, sub:uniqueJobTitles.slice(0,2).join(", ")||"—" },
                        ].map((item,i)=>(
                          <div key={i} className={`${item.bg} rounded-xl p-4 flex items-start gap-3`}>
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

            {/* ── Filters ── */}
            {resumes.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4 space-y-3">
                  <div className="flex flex-col md:flex-row gap-3">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input placeholder="Search by name, email, or filename..."
                        value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}
                        className="pl-10 border-gray-200 focus:border-[#1A4D2E]" data-testid="search-input" />
                    </div>
                    <Select value={jobTitleQuery} onValueChange={setJobTitleQuery}>
                      <SelectTrigger className="w-full md:w-[200px]" data-testid="job-title-filter">
                        <SelectValue placeholder="Filter by job title" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Job Titles</SelectItem>
                        {uniqueJobTitles.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}
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
                        <SelectItem value="low">Low (&lt;40%)</SelectItem>
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
                    <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#1A4D2E] animate-pulse inline-block" />
                      <span className="text-xs font-medium text-[#1A4D2E]">
                        Showing {filteredResumes.length} resume{filteredResumes.length !== 1 ? "s" : ""} uploaded in the last 30 minutes
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ── Table ── */}
            {resumes.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3 border-b border-gray-50">
                  {/* ── ★ NEW: Header row with select-all + bulk delete ── */}
                  <div className="flex items-center justify-between mb-2">
                    <CardTitle className="flex items-center gap-2 text-base font-['Outfit']">
                      <Target className="w-4 h-4 text-[#1A4D2E]" />
                      Manual Scan Candidates
                      <span className="text-gray-400 font-normal text-sm">({filteredResumes.length})</span>
                      {selectedIds.size > 0 && (
                        <Badge className="text-xs text-white bg-[#1A4D2E]">{selectedIds.size} selected</Badge>
                      )}
                    </CardTitle>
                    {filteredResumes.length > 0 && (
                      <span className="text-xs font-normal text-gray-400">
                        Avg: {Math.round(filteredResumes.reduce((s,r)=>s+r.ats_score,0)/filteredResumes.length)}%
                      </span>
                    )}
                  </div>
                  {/* ── ★ NEW: Quick-select action bar ── */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-500 font-medium mr-1">Quick select:</span>
                    <button
                      onClick={toggleSelectAll}
                      className="text-xs px-2.5 py-1 rounded-lg border border-gray-300 text-gray-600 bg-gray-50 hover:bg-gray-100 font-semibold transition-colors"
                    >
                      {selectedIds.size === filteredResumes.length && filteredResumes.length > 0 ? "☐ Deselect All" : "☑ Select All"}
                    </button>
                    <button
                      onClick={() => {
                        const ids = filteredResumes.filter(r => r.ats_score >= 70).map(r => r.id);
                        setSelectedIds(new Set(ids));
                        if (ids.length === 0) toast.info("No candidates with score ≥70% in current view");
                      }}
                      className="text-xs px-2.5 py-1 rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 font-semibold transition-colors"
                    >
                      ✓ Top Candidates (≥70%)
                      <span className="ml-1 text-green-600">({filteredResumes.filter(r => r.ats_score >= 70).length})</span>
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
                          onClick={handleBulkDelete}
                          className="text-xs px-3 py-1 rounded-lg text-white font-semibold bg-red-500 hover:bg-red-600 transition-colors flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3 inline" />
                          Delete {selectedIds.size} selected
                        </button>
                      </>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {filteredResumes.length===0 ? (
                    <div className="text-center py-12">
                      <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 text-sm">
                        {sortBy === "recently-uploaded"
                          ? "No resumes uploaded in the last 30 minutes."
                          : "No resumes match your filters."}
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="data-table">
                        <thead>
                          <tr>
                            {/* ── ★ NEW: checkbox column ── */}
                            <th className="w-10">
                              <input
                                type="checkbox"
                                checked={selectedIds.size === filteredResumes.length && filteredResumes.length > 0}
                                onChange={toggleSelectAll}
                                className="w-4 h-4 accent-[#1A4D2E] cursor-pointer"
                              />
                            </th>
                            <th className="w-12">#</th><th>Candidate</th><th>File</th>
                            <th className="w-24">Score</th><th>Type</th>
                            <th>Matched Skills</th><th>Uploaded</th><th className="w-28">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredResumes.map((resume, index) => (
                            <tr
                              key={resume.id}
                              className={`hover:bg-gray-50 transition-colors ${selectedIds.has(resume.id) ? "bg-green-50/60" : ""}`}
                            >
                              {/* ── ★ NEW: row checkbox ── */}
                              <td onClick={e => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(resume.id)}
                                  onChange={e => toggleSelect(resume.id, e)}
                                  className="w-4 h-4 accent-[#1A4D2E] cursor-pointer"
                                />
                              </td>
                              <td className="font-medium text-gray-400">{index+1}</td>
                              <td>
                                <div className="flex items-center gap-2">
                                  <div>
                                    <p className="font-medium text-gray-800">{resume.candidate_name||"Unknown"}</p>
                                    {resume.email && <p className="text-xs text-gray-500">{resume.email}</p>}
                                  </div>
                                  {isRecent(resume) && (
                                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 shrink-0">
                                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />New
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="text-sm text-gray-500 max-w-[150px] truncate">{resume.filename}</td>
                              <td>
                                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold ${getScoreColor(resume.ats_score)}`}>
                                  {resume.ats_score}%
                                </span>
                              </td>
                              <td>
                                <Badge variant="outline" className="text-xs capitalize">{resume.analysis_type||"single"}</Badge>
                              </td>
                              <td>
                                <div className="flex flex-wrap gap-1 max-w-[200px]">
                                  {resume.matched_skills?.slice(0,3).map((skill,i)=>(
                                    <Badge key={i} variant="outline" className="text-xs border-green-200 text-green-700">{skill}</Badge>
                                  ))}
                                  {(resume.matched_skills?.length||0)>3 && (
                                    <Badge variant="outline" className="text-xs">+{resume.matched_skills.length-3}</Badge>
                                  )}
                                </div>
                              </td>
                              <td className="text-xs text-gray-500 whitespace-nowrap">
                                {resume.created_at ? (
                                  <span>
                                    {new Date(resume.created_at).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}
                                    <br/>
                                    <span className="text-gray-400">{new Date(resume.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>
                                  </span>
                                ) : "—"}
                              </td>
                              <td>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost" size="icon"
                                    onClick={() => navigate(`/results/${resume.id}`)}
                                    className="h-8 w-8 text-[#1A4D2E] hover:bg-[#F0FDF4]"
                                    title="View details"
                                    data-testid={`view-resume-${index}`}
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={e=>handleDownloadReport(resume.id,resume.candidate_name,e)}
                                    className="h-8 w-8 text-blue-500 hover:text-blue-700 hover:bg-blue-50" title="Download PDF" data-testid={`download-report-${index}`}><Download className="w-4 h-4" /></Button>
                                  <Button variant="ghost" size="icon" onClick={e=>handleDelete(resume.id,e)}
                                    className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" title="Delete" data-testid={`delete-resume-${index}`}><Trash2 className="w-4 h-4" /></Button>
                                </div>
                              </td>
                            </tr>
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

      {/* ── ★ NEW: Floating bulk action bar ── */}
      {selectedIds.size > 0 && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl border border-green-200"
          style={{ background: "white", boxShadow: "0 8px 32px rgba(26,77,46,0.18)" }}
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold bg-[#1A4D2E]">
              {selectedIds.size}
            </div>
            <span className="text-sm font-semibold text-gray-700">
              resume{selectedIds.size !== 1 ? "s" : ""} selected
            </span>
          </div>
          <div className="w-px h-6 bg-gray-200" />
          <button
            onClick={handleBulkDelete}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-bold bg-red-500 hover:bg-red-600 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete Selected
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

export default DashboardPage;