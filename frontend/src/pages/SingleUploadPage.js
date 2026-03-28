import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import {
  FileText, Upload, ArrowLeft, Loader2, CheckCircle2, AlertCircle,
  Target, Briefcase, X, Sparkles, Wand2, ChevronRight, Brain, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import authUtils from "@/utils/authUtils";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ModeCard = ({ mode, selected, onSelect }) => {
  const cfg = {
    manual: {
      icon: <Target className="w-7 h-7 text-[#1A4D2E]" />,
      iconBg: "bg-[#F0FDF4]",
      activeBorder: "border-[#1A4D2E] bg-[#F0FDF4]/50",
      inactiveBorder: "border-gray-200 bg-white",
      title: "Manual Scan",
      desc: "You provide the job description. Score is matched against your specific JD.",
      badge: "Classic",
      badgeCls: "bg-[#D9F99D] text-[#1A4D2E]",
      activeDot: "border-[#1A4D2E] bg-[#1A4D2E]",
    },
    advanced: {
      icon: <Brain className="w-7 h-7 text-violet-600" />,
      iconBg: "bg-violet-50",
      activeBorder: "border-violet-500 bg-violet-50/40",
      inactiveBorder: "border-gray-200 bg-white",
      title: "Advanced Scan",
      desc: "AI auto-detects the best job role for this resume. No JD needed.",
      badge: "Advanced NLP-Powered",
      badgeCls: "bg-violet-100 text-violet-700",
      activeDot: "border-violet-500 bg-violet-500",
    },
  };
  const c = cfg[mode];
  return (
    <button
      onClick={() => onSelect(mode)}
      className={`w-full text-left rounded-xl border-2 p-5 transition-all duration-200 hover:shadow-md ${selected ? c.activeBorder : c.inactiveBorder}`}
    >
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-xl ${c.iconBg} flex items-center justify-center shrink-0`}>{c.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-gray-800 font-['Outfit']">{c.title}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.badgeCls}`}>{c.badge}</span>
          </div>
          <p className="text-sm text-gray-500 leading-relaxed">{c.desc}</p>
        </div>
        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${selected ? c.activeDot : "border-gray-300 bg-white"}`}>
          {selected && <div className="w-2 h-2 rounded-full bg-white" />}
        </div>
      </div>
    </button>
  );
};

const SingleUploadPage = () => {
  const navigate = useNavigate();
  const [scanMode, setScanMode] = useState("manual");
  const [file, setFile] = useState(null);
  const [jobDescription, setJobDescription] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith(".pdf") || f.name.endsWith(".docx"))) { setFile(f); setResults(null); }
    else toast.error("Please upload a PDF or DOCX file");
  }, []);
  const handleDragOver  = useCallback((e) => { e.preventDefault(); setDragOver(true);  }, []);
  const handleDragLeave = useCallback((e) => { e.preventDefault(); setDragOver(false); }, []);
  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (f && (f.name.endsWith(".pdf") || f.name.endsWith(".docx"))) { setFile(f); setResults(null); }
    else toast.error("Please upload a PDF or DOCX file");
  };
  const removeFile = () => { setFile(null); setResults(null); };

  const handleAnalyze = async () => {
    if (!file) { toast.error("Please upload a resume"); return; }
    if (scanMode === "manual" && !jobDescription.trim()) { toast.error("Please enter a job description"); return; }
    setIsAnalyzing(true); setResults(null); setProgress(10);
    try {
      const userId = authUtils.getUserId();
      let data;
      if (scanMode === "advanced") {
        const fd = new FormData();
        fd.append("file", file);
        if (userId) fd.append("user_id", userId);
        const timer = setInterval(() => setProgress(p => Math.min(p + 12, 85)), 600);
        const res = await axios.post(`${API}/auto-detect-role`, fd);
        clearInterval(timer);
        data = res.data;
      } else {
        const fd = new FormData();
        fd.append("file", file); fd.append("analysis_type", "single");
        if (userId) fd.append("user_id", userId);
        setProgress(30);
        const up = await axios.post(`${API}/upload-resume`, fd);
        setProgress(60);
        const params = new URLSearchParams();
        params.append("job_description", jobDescription);
        params.append("job_title", jobTitle || "");
        if (userId) params.append("user_id", userId);
        const an = await axios.post(`${API}/analyze-uploaded/${up.data.id}`, params,
          { headers: { "Content-Type": "application/x-www-form-urlencoded" } });
        data = an.data;
      }
      setProgress(100);
      setResults({ ...data, _mode: scanMode });
      toast.success("Analysis complete!");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Analysis failed. Please try again.");
    } finally { setIsAnalyzing(false); }
  };

  const scoreColor = (s) =>
    s >= 90 ? "text-yellow-800 bg-yellow-200" :
    s >= 70 ? "text-yellow-700 bg-yellow-100" :
    s >= 40 ? "text-amber-700 bg-amber-100" : "text-red-700 bg-red-100";
  const scoreLabel = (s) =>
    s >= 90 ? "Perfect Match" :
    s >= 70 ? "Good Match" :
    s >= 40 ? "Moderate Match" : "Low Match";
  const isAdv = scanMode === "advanced";
  const topRoles = results?.top_roles || [];

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="hover:bg-[#F0FDF4]">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-[#1A4D2E] flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-xl text-[#1A4D2E] font-['Outfit']">TalentLens</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate("/dashboard")} className="border-gray-200 text-gray-600 hover:bg-[#F0FDF4] text-sm">
              Manual Dashboard
            </Button>
            <Button variant="outline" onClick={() => navigate("/dashboard/advanced")} className="border-violet-200 text-violet-700 hover:bg-violet-50 text-sm">
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />Advanced Dashboard
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#1A1A1A] mb-2 font-['Outfit']">Single Resume Scan</h1>
          <p className="text-gray-500 text-sm">Choose your scanning mode then upload a resume for an instant ATS analysis.</p>
        </div>

        {/* Mode Selector */}
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          <ModeCard mode="manual"   selected={scanMode === "manual"}   onSelect={(m) => { setScanMode(m); setResults(null); }} />
          <ModeCard mode="advanced" selected={scanMode === "advanced"} onSelect={(m) => { setScanMode(m); setResults(null); }} />
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left — Inputs */}
          <div className="space-y-6">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg font-['Outfit']">
                  <Upload className="w-5 h-5 text-[#1A4D2E]" />Upload Resume
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!file ? (
                  <div
                    className={`upload-dropzone ${dragOver ? "active" : ""}`}
                    onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
                    onClick={() => document.getElementById("file-input-single").click()}
                    data-testid="upload-dropzone"
                  >
                    <input id="file-input-single" type="file" accept=".pdf,.docx" onChange={handleFileChange} className="hidden" data-testid="file-input" />
                    <div className="w-16 h-16 rounded-full bg-[#F0FDF4] flex items-center justify-center mx-auto mb-4">
                      <FileText className="w-8 h-8 text-[#1A4D2E]" />
                    </div>
                    <p className="text-gray-700 font-medium mb-2">Drag & drop your resume here</p>
                    <p className="text-gray-500 text-sm">or click to browse (PDF, DOCX)</p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-4 bg-[#F0FDF4] rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg bg-[#1A4D2E] flex items-center justify-center">
                        <FileText className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <p className="font-medium text-[#1A1A1A]">{file.name}</p>
                        <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={removeFile} className="text-gray-500 hover:text-red-500 hover:bg-red-50">
                      <X className="w-5 h-5" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {scanMode === "manual" && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-lg font-['Outfit']">
                    <Briefcase className="w-5 h-5 text-[#1A4D2E]" />Job Description
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-gray-700">Job Title (optional)</Label>
                    <Input placeholder="e.g., Senior Software Engineer" value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)} className="mt-1 border-gray-200" data-testid="job-title-input" />
                  </div>
                  <div>
                    <Label className="text-gray-700">Job Description *</Label>
                    <Textarea placeholder="Paste the full job description here…" value={jobDescription}
                      onChange={(e) => setJobDescription(e.target.value)}
                      className="mt-1 min-h-[200px] border-gray-200" data-testid="job-description-input" />
                  </div>
                </CardContent>
              </Card>
            )}

            {scanMode === "advanced" && (
              <div className="rounded-xl bg-violet-50 border border-violet-200 p-5">
                <div className="flex gap-3">
                  <Brain className="w-5 h-5 text-violet-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-violet-800 mb-1.5 text-sm">How Advanced Scan works</p>
                    <ul className="text-xs text-violet-700 space-y-1.5 leading-relaxed">
                      <li>• Extracts skills, experience & education from the resume</li>
                      <li>• Matches against 20+ curated job role profiles</li>
                      <li>• Identifies the top 3 best-fitting roles automatically</li>
                      <li>• Runs a full ATS score against the #1 role match</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            <Button
              onClick={handleAnalyze}
              disabled={!file || (scanMode === "manual" && !jobDescription.trim()) || isAnalyzing}
              className={`w-full py-6 rounded-xl text-lg font-semibold text-white transition-colors ${isAdv ? "bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300" : "bg-[#1A4D2E] hover:bg-[#14532D] disabled:bg-[#1A4D2E]/40"}`}
              data-testid="analyze-btn"
            >
              {isAnalyzing ? (
                <><Loader2 className="w-5 h-5 mr-2 animate-spin" />{isAdv ? "Detecting Role…" : "Analyzing…"}</>
              ) : isAdv ? (
                <><Wand2 className="w-5 h-5 mr-2" />Auto-Detect & Analyze</>
              ) : (
                <><Target className="w-5 h-5 mr-2" />Analyze Resume</>
              )}
            </Button>
          </div>

          {/* Right — Results */}
          <div>
            {!results && !isAnalyzing && (
              <Card className="border-0 shadow-sm h-full flex items-center justify-center min-h-[500px]">
                <CardContent className="text-center py-16">
                  <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${isAdv ? "bg-violet-50" : "bg-[#F0FDF4]"}`}>
                    {isAdv ? <Brain className="w-10 h-10 text-violet-500" /> : <Target className="w-10 h-10 text-[#1A4D2E]" />}
                  </div>
                  <h3 className="text-xl font-semibold text-gray-800 mb-2 font-['Outfit']">Ready to Analyze</h3>
                  <p className="text-gray-500 max-w-sm text-sm">
                    {isAdv ? "Upload a resume and AI will auto-detect the best matching job role." : "Upload a resume and paste a job description to see the ATS score."}
                  </p>
                </CardContent>
              </Card>
            )}

            {isAnalyzing && (
              <Card className="border-0 shadow-sm h-full flex items-center justify-center min-h-[500px]">
                <CardContent className="text-center py-16 space-y-4">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${isAdv ? "bg-violet-100 animate-pulse" : "bg-[#F0FDF4]"}`}>
                    {isAdv ? <Brain className="w-8 h-8 text-violet-500" /> : <Loader2 className="w-8 h-8 text-[#1A4D2E] animate-spin" />}
                  </div>
                  <h3 className="text-xl font-semibold text-gray-800 font-['Outfit']">
                    {isAdv ? "Detecting Best Role…" : "Analyzing Resume…"}
                  </h3>
                  <p className="text-gray-500 text-sm">
                    {isAdv ? "Matching skills against role profiles…" : "Extracting skills and calculating score…"}
                  </p>
                  <Progress value={progress} className="w-48 mx-auto" />
                </CardContent>
              </Card>
            )}

            {results && (
              <div className="space-y-5">
                {/* Score */}
                <Card className="border-0 shadow-sm overflow-hidden">
                  <div className={`p-8 ${scoreColor(results.ats_score)}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        {results._mode === "advanced" && (
                          <div className="flex items-center gap-1.5 mb-2 opacity-75">
                            <Brain className="w-3.5 h-3.5" />
                            <span className="text-xs font-semibold uppercase tracking-wide">AI Auto-Detected</span>
                          </div>
                        )}
                        <p className="text-sm font-medium opacity-80 mb-1">ATS Score</p>
                        <p className="text-5xl font-bold font-['Outfit']">{results.ats_score}%</p>
                        <p className="text-sm font-medium mt-1">{scoreLabel(results.ats_score)}</p>
                      </div>
                      <div className="w-24 h-24 rounded-full bg-white/30 flex items-center justify-center">
                        {results.ats_score >= 60 ? <CheckCircle2 className="w-12 h-12" /> : <AlertCircle className="w-12 h-12" />}
                      </div>
                    </div>
                  </div>
                  {(results.candidate_name || results.job_title) && (
                    <CardContent className="p-4 space-y-1.5">
                      {results.candidate_name && (
                        <p className="text-sm text-gray-700"><span className="font-semibold">Candidate:</span> {results.candidate_name}
                          {results.email && <span className="text-gray-400 ml-2">({results.email})</span>}
                        </p>
                      )}
                      {results.job_title && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500">Best Match Role:</span>
                          <Badge className="bg-violet-100 text-violet-700 border-violet-200 text-xs">{results.job_title}</Badge>
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>

                {/* Top roles (advanced) */}
                {topRoles.length > 0 && (
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-['Outfit'] flex items-center gap-2">
                        <Brain className="w-4 h-4 text-violet-500" />Detected Role Matches
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 pt-0">
                      {topRoles.map((r, i) => (
                        <div key={i} className={`flex items-center justify-between rounded-lg px-4 py-3 ${i === 0 ? "bg-violet-50 border border-violet-200" : "bg-gray-50"}`}>
                          <div className="flex items-center gap-2">
                            {i === 0 && <Zap className="w-4 h-4 text-violet-500" />}
                            <span className={`text-sm font-medium ${i === 0 ? "text-violet-800" : "text-gray-600"}`}>{r.role}</span>
                            {i === 0 && <Badge className="bg-violet-100 text-violet-600 text-xs border-0 py-0">Best Match</Badge>}
                          </div>
                          <span className={`text-sm font-bold ${i === 0 ? "text-violet-700" : "text-gray-400"}`}>
                            {typeof r.score === "number" ? `${r.score.toFixed(0)}%` : "—"}
                          </span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Feedback */}
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-['Outfit']">Feedback</CardTitle></CardHeader>
                  <CardContent>
                    <ul className="space-y-2.5">
                      {(results.feedback || []).map((fb, i) => (
                        <li key={i} className="text-gray-700 text-sm leading-relaxed">{fb}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                {/* Skills */}
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-['Outfit']">Skills Analysis</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    {[
                      { label: "Matched Skills", skills: results.matched_skills || [], icon: <CheckCircle2 className="w-4 h-4 text-green-600" />, cls: "bg-green-100 text-green-700 hover:bg-green-100" },
                      { label: "Missing Skills",  skills: results.missing_skills  || [], icon: <AlertCircle   className="w-4 h-4 text-amber-600" />, cls: "border-amber-300 text-amber-700", variant: "outline" },
                    ].map(({ label, skills, icon, cls, variant }) => (
                      <div key={label}>
                        <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">{icon}{label} ({skills.length})</p>
                        <div className="flex flex-wrap gap-1.5">
                          {skills.length > 0 ? skills.map((s, i) => <Badge key={i} variant={variant} className={cls}>{s}</Badge>)
                            : <p className="text-sm text-gray-400">{label === "Missing Skills" ? "All required skills present!" : "None found"}</p>}
                        </div>
                      </div>
                    ))}
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2">All Extracted Skills ({(results.resume_skills || results.extracted_skills || []).length})</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(results.resume_skills || results.extracted_skills || []).slice(0, 15).map((s, i) => (
                          <Badge key={i} variant="secondary" className="bg-gray-100 text-gray-700">{s}</Badge>
                        ))}
                        {(results.resume_skills || results.extracted_skills || []).length > 15 && (
                          <Badge variant="secondary" className="bg-gray-100 text-gray-700">+{(results.resume_skills || results.extracted_skills || []).length - 15} more</Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => { setFile(null); setResults(null); setProgress(0); }}
                    className="flex-1 border-gray-200" data-testid="analyze-another-btn">Analyze Another</Button>
                  <Button onClick={() => navigate(results._mode === "advanced" ? "/dashboard/advanced" : "/dashboard")}
                    className={`flex-1 text-white ${results._mode === "advanced" ? "bg-violet-600 hover:bg-violet-700" : "bg-[#1A4D2E] hover:bg-[#14532D]"}`}
                    data-testid="view-all-btn">
                    View Dashboard <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default SingleUploadPage;