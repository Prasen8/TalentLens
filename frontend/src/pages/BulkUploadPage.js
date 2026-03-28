import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import {
  FileText, Upload, ArrowLeft, Loader2, CheckCircle2, AlertCircle,
  Target, Briefcase, X, Users, TrendingUp, ArrowRight, Sparkles,
  Brain, Wand2, Zap, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import authUtils from "@/utils/authUtils";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ModeCard = ({ mode, selected, onSelect }) => {
  const cfg = {
    manual: {
      icon: <Target className="w-7 h-7 text-[#1A4D2E]" />,
      iconBg: "bg-[#F0FDF4]",
      activeBorder: "border-[#1A4D2E] bg-[#F0FDF4]/50",
      inactiveBorder: "border-gray-200 bg-white",
      title: "Manual Bulk Scan",
      desc: "Upload multiple resumes with a job description. Each resume is ranked against your specific JD.",
      badge: "Classic",
      badgeCls: "bg-[#D9F99D] text-[#1A4D2E]",
      activeDot: "border-[#1A4D2E] bg-[#1A4D2E]",
    },
    advanced: {
      icon: <Brain className="w-7 h-7 text-violet-600" />,
      iconBg: "bg-violet-50",
      activeBorder: "border-violet-500 bg-violet-50/40",
      inactiveBorder: "border-gray-200 bg-white",
      title: "Advanced Bulk Scan",
      desc: "AI auto-detects the best job role for each resume individually. No JD required.",
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

const BulkUploadPage = () => {
  const navigate = useNavigate();
  const [scanMode, setScanMode] = useState("manual");
  const [files, setFiles] = useState([]);
  const [jobDescription, setJobDescription] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith(".pdf") || f.name.endsWith(".docx"));
    if (dropped.length > 0) setFiles(prev => [...prev, ...dropped]);
    else toast.error("Please upload PDF or DOCX files");
  }, []);
  const handleDragOver  = useCallback((e) => { e.preventDefault(); setDragOver(true);  }, []);
  const handleDragLeave = useCallback((e) => { e.preventDefault(); setDragOver(false); }, []);
  const handleFileChange = (e) => {
    const sel = Array.from(e.target.files).filter(f => f.name.endsWith(".pdf") || f.name.endsWith(".docx"));
    if (sel.length > 0) setFiles(prev => [...prev, ...sel]);
    else toast.error("Please upload PDF or DOCX files");
  };
  const removeFile = (idx) => setFiles(prev => prev.filter((_, i) => i !== idx));
  const clearAllFiles = () => { setFiles([]); setResults(null); };

  const handleAnalyze = async () => {
    if (files.length === 0) { toast.error("Please upload at least one resume"); return; }
    if (scanMode === "manual" && !jobDescription.trim()) { toast.error("Please enter a job description"); return; }
    setIsAnalyzing(true); setResults(null); setProgress(0);
    try {
      const userId = authUtils.getUserId();
      const fd = new FormData();
      files.forEach(f => fd.append("files", f));
      if (userId) fd.append("user_id", userId);

      const progressTimer = setInterval(() => setProgress(p => Math.min(p + 8, 88)), 600);

      let res;
      if (scanMode === "advanced") {
        res = await axios.post(`${API}/bulk-advanced-scan`, fd);
      } else {
        fd.append("job_description", jobDescription);
        fd.append("job_title", jobTitle || "");
        res = await axios.post(`${API}/bulk-upload`, fd);
      }

      clearInterval(progressTimer);
      setProgress(100);
      setResults({ ...res.data, _mode: scanMode });
      toast.success(`Analyzed ${res.data.successful} resume${res.data.successful !== 1 ? "s" : ""}!`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Analysis failed. Please try again.");
    } finally { setIsAnalyzing(false); }
  };

  const scoreColor = (s) =>
    s >= 90 ? "text-yellow-800 bg-yellow-200" :
    s >= 70 ? "text-yellow-700 bg-yellow-100" :
    s >= 40 ? "text-amber-700 bg-amber-100" : "text-red-700 bg-red-100";
  const isAdv = scanMode === "advanced";

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

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#1A1A1A] mb-2 font-['Outfit']">Bulk Resume Scan</h1>
          <p className="text-gray-500 text-sm">Screen multiple resumes at once. Choose your scanning mode below.</p>
        </div>

        {/* Mode selector */}
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          <ModeCard mode="manual"   selected={scanMode === "manual"}   onSelect={(m) => { setScanMode(m); setResults(null); }} />
          <ModeCard mode="advanced" selected={scanMode === "advanced"} onSelect={(m) => { setScanMode(m); setResults(null); }} />
        </div>

        {!results ? (
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Left — File uploads */}
            <div className="space-y-6">
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center justify-between text-lg font-['Outfit']">
                    <div className="flex items-center gap-2">
                      <Upload className="w-5 h-5 text-[#1A4D2E]" />Upload Resumes
                    </div>
                    {files.length > 0 && (
                      <Button variant="ghost" size="sm" onClick={clearAllFiles} className="text-red-500 hover:text-red-700 hover:bg-red-50 text-xs">
                        Clear All
                      </Button>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div
                    className={`upload-dropzone ${dragOver ? "active" : ""}`}
                    onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
                    onClick={() => document.getElementById("file-input-bulk").click()}
                    data-testid="upload-dropzone"
                  >
                    <input id="file-input-bulk" type="file" accept=".pdf,.docx" multiple onChange={handleFileChange} className="hidden" data-testid="file-input" />
                    <div className="w-16 h-16 rounded-full bg-[#F0FDF4] flex items-center justify-center mx-auto mb-4">
                      <Users className="w-8 h-8 text-[#1A4D2E]" />
                    </div>
                    <p className="text-gray-700 font-medium mb-2">Drag & drop resumes here</p>
                    <p className="text-gray-500 text-sm">or click to browse · PDF & DOCX · multiple files OK</p>
                  </div>

                  {files.length > 0 && (
                    <ScrollArea className="h-[220px] pr-2">
                      <div className="space-y-2">
                        {files.map((f, i) => (
                          <div key={i} className="flex items-center justify-between p-3 bg-[#F0FDF4] rounded-lg">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-8 h-8 rounded-lg bg-[#1A4D2E] flex items-center justify-center shrink-0">
                                <FileText className="w-4 h-4 text-white" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">{f.name}</p>
                                <p className="text-xs text-gray-500">{(f.size / 1024).toFixed(1)} KB</p>
                              </div>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => removeFile(i)} className="h-7 w-7 text-gray-400 hover:text-red-500 hover:bg-red-50 shrink-0">
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                  <p className="text-xs text-gray-400 text-center">
                    {files.length === 0 ? "No files selected" : `${files.length} file${files.length > 1 ? "s" : ""} ready`}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Right — JD / Advanced info */}
            <div className="space-y-6">
              {scanMode === "manual" ? (
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-lg font-['Outfit']">
                      <Briefcase className="w-5 h-5 text-[#1A4D2E]" />Job Description
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="text-gray-700">Job Title (optional)</Label>
                      <Input placeholder="e.g., Data Scientist" value={jobTitle}
                        onChange={(e) => setJobTitle(e.target.value)} className="mt-1 border-gray-200" data-testid="job-title-input" />
                    </div>
                    <div>
                      <Label className="text-gray-700">Job Description *</Label>
                      <Textarea placeholder="Paste the full job description here…" value={jobDescription}
                        onChange={(e) => setJobDescription(e.target.value)}
                        className="mt-1 min-h-[220px] border-gray-200" data-testid="job-description-input" />
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-xl bg-violet-50 border border-violet-200 p-5">
                    <div className="flex gap-3">
                      <Brain className="w-5 h-5 text-violet-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-violet-800 mb-1.5 text-sm">How Advanced Bulk Scan works</p>
                        <ul className="text-xs text-violet-700 space-y-1.5 leading-relaxed">
                          <li>• Each resume is parsed independently</li>
                          <li>• AI matches skills against 20+ role profiles per resume</li>
                          <li>• Every resume gets its own best-fit role assigned</li>
                          <li>• Full ATS scores generated per candidate</li>
                          <li>• Results saved to the Advanced Dashboard</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                  <Card className="border-0 shadow-sm bg-gray-50">
                    <CardContent className="p-5 text-center">
                      <Brain className="w-12 h-12 text-violet-400 mx-auto mb-3" />
                      <p className="text-sm font-medium text-gray-600 mb-1">No job description needed</p>
                      <p className="text-xs text-gray-400">Just upload the resumes and let AI handle the role matching.</p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {isAnalyzing ? (
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-8 text-center space-y-4">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${isAdv ? "bg-violet-100 animate-pulse" : "bg-[#F0FDF4]"}`}>
                      {isAdv ? <Brain className="w-8 h-8 text-violet-500" /> : <Loader2 className="w-8 h-8 text-[#1A4D2E] animate-spin" />}
                    </div>
                    <h3 className="text-lg font-semibold text-gray-800 font-['Outfit']">
                      {isAdv ? "Detecting Roles…" : `Analyzing ${files.length} Resume${files.length > 1 ? "s" : ""}…`}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {isAdv ? "Matching each resume against role profiles…" : "Extracting skills and scoring candidates…"}
                    </p>
                    <Progress value={progress} className="w-full" />
                    <p className="text-xs text-gray-400">{progress}% complete</p>
                  </CardContent>
                </Card>
              ) : (
                <Button
                  onClick={handleAnalyze}
                  disabled={files.length === 0 || (scanMode === "manual" && !jobDescription.trim())}
                  className={`w-full py-6 rounded-xl text-lg font-semibold text-white transition-colors ${isAdv ? "bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300" : "bg-[#1A4D2E] hover:bg-[#14532D] disabled:bg-[#1A4D2E]/40"}`}
                  data-testid="analyze-btn"
                >
                  {isAdv ? (
                    <><Wand2 className="w-5 h-5 mr-2" />Auto-Detect & Scan {files.length > 0 ? `(${files.length})` : ""}</>
                  ) : (
                    <><Target className="w-5 h-5 mr-2" />Analyze {files.length > 0 ? `${files.length} Resume${files.length > 1 ? "s" : ""}` : "Resumes"}</>
                  )}
                </Button>
              )}
            </div>
          </div>
        ) : (
          /* ── Results ── */
          <div className="space-y-6">
            {/* Mode badge */}
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${results._mode === "advanced" ? "bg-violet-100 text-violet-700" : "bg-[#D9F99D] text-[#1A4D2E]"}`}>
              {results._mode === "advanced" ? <><Brain className="w-4 h-4" />Advanced Scan Results</> : <><Target className="w-4 h-4" />Manual Scan Results</>}
            </div>

            {/* Summary KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { icon: <FileText className="w-6 h-6 text-[#1A4D2E]" />, bg: "bg-[#F0FDF4]", value: results.successful, label: "Processed" },
                { icon: <TrendingUp className="w-6 h-6 text-[#1A4D2E]" />, bg: "bg-[#D9F99D]", value: (results.results || []).filter(r => r.ats_score >= 70).length, label: "Top Candidates" },
                { icon: <CheckCircle2 className="w-6 h-6 text-green-600" />, bg: "bg-green-100", value: `${(results.results || []).length > 0 ? (results.results || [])[0].ats_score : 0}%`, label: "Highest Score" },
                { icon: <AlertCircle className="w-6 h-6 text-amber-600" />, bg: "bg-amber-100", value: results.failed || 0, label: "Failed" },
              ].map((k, i) => (
                <Card key={i} className="border-0 shadow-sm">
                  <CardContent className="p-5 text-center">
                    <div className={`w-12 h-12 rounded-full ${k.bg} flex items-center justify-center mx-auto mb-3`}>{k.icon}</div>
                    <p className="text-3xl font-bold text-[#1A1A1A] font-['Outfit']">{k.value}</p>
                    <p className="text-sm text-gray-500 mt-1">{k.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* JD skills (manual only) */}
            {results._mode === "manual" && results.jd_skills && results.jd_skills.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-['Outfit']">Required Skills from JD ({results.jd_skills.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {results.jd_skills.map((s, i) => <Badge key={i} className="bg-[#1A4D2E] text-white">{s}</Badge>)}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Candidate Rankings */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center justify-between text-base font-['Outfit']">
                  <span>Candidate Rankings ({(results.results || []).length})</span>
                  <Button
                    variant="outline"
                    onClick={() => navigate(results._mode === "advanced" ? "/dashboard/advanced" : "/dashboard")}
                    className={`text-sm ${results._mode === "advanced" ? "border-violet-200 text-violet-700 hover:bg-violet-50" : "border-[#1A4D2E]/20 text-[#1A4D2E] hover:bg-[#F0FDF4]"}`}
                    data-testid="view-batch-dashboard-btn"
                  >
                    Full Dashboard <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th className="w-12">#</th>
                        <th>Candidate</th>
                        <th>File</th>
                        <th className="w-24">Score</th>
                        {results._mode === "advanced" && <th>Detected Role</th>}
                        <th>Matched Skills</th>
                        <th>Missing Skills</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(results.results || []).map((r, i) => (
                        <tr key={r.id} onClick={() => navigate(`/results/${r.id}`)} className="cursor-pointer hover:bg-[#F0FDF4] transition-colors" data-testid={`candidate-row-${i}`}>
                          <td className="font-medium text-gray-400">{i + 1}</td>
                          <td>
                            <div>
                              <p className="font-medium text-gray-800">{r.candidate_name || "Unknown"}</p>
                              {r.email && <p className="text-xs text-gray-500">{r.email}</p>}
                            </div>
                          </td>
                          <td className="text-sm text-gray-600 max-w-[130px] truncate">{r.filename}</td>
                          <td>
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold ${scoreColor(r.ats_score)}`}>{r.ats_score}%</span>
                          </td>
                          {results._mode === "advanced" && (
                            <td><Badge className="bg-violet-100 text-violet-700 border-violet-200 text-xs">{r.best_role || "—"}</Badge></td>
                          )}
                          <td>
                            <div className="flex flex-wrap gap-1">
                              {(r.matched_skills || []).slice(0, 3).map((s, j) => <Badge key={j} variant="outline" className="text-xs border-green-200 text-green-700">{s}</Badge>)}
                              {(r.matched_skills || []).length > 3 && <Badge variant="outline" className="text-xs">+{r.matched_skills.length - 3}</Badge>}
                            </div>
                          </td>
                          <td>
                            <div className="flex flex-wrap gap-1">
                              {(r.missing_skills || []).slice(0, 3).map((s, j) => <Badge key={j} variant="outline" className="text-xs border-amber-200 text-amber-700">{s}</Badge>)}
                              {(r.missing_skills || []).length > 3 && <Badge variant="outline" className="text-xs">+{r.missing_skills.length - 3}</Badge>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Errors */}
            {results.errors && results.errors.length > 0 && (
              <Card className="border-0 shadow-sm border-l-4 border-l-red-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-red-700 font-['Outfit']">Processing Errors ({results.errors.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1">
                    {results.errors.map((err, i) => (
                      <li key={i} className="text-sm text-red-600"><span className="font-medium">{err.filename}:</span> {err.error}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <div className="flex gap-4">
              <Button variant="outline" onClick={() => { setFiles([]); setResults(null); setProgress(0); }}
                className="flex-1 border-gray-200" data-testid="new-batch-btn">Start New Batch</Button>
              <Button
                onClick={() => navigate(results._mode === "advanced" ? "/dashboard/advanced" : "/dashboard")}
                className={`flex-1 text-white ${results._mode === "advanced" ? "bg-violet-600 hover:bg-violet-700" : "bg-[#1A4D2E] hover:bg-[#14532D]"}`}
                data-testid="go-dashboard-btn">
                Go to Dashboard <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default BulkUploadPage;