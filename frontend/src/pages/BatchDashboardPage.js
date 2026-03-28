import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { 
  FileText, 
  ArrowLeft, 
  Loader2, 
  Users,
  TrendingUp,
  BarChart3,
  Search,
  Filter,
  Eye,
  Briefcase
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";
import authUtils from "@/utils/authUtils";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const BatchDashboardPage = () => {
  const navigate = useNavigate();
  const { batchId } = useParams();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ resumes: [], stats: null, job_description: null });
  const [searchQuery, setSearchQuery] = useState("");
  const [scoreFilter, setScoreFilter] = useState("all");
  const [sortBy, setSortBy] = useState("score-desc");

  useEffect(() => {
    const fetchBatchData = async () => {
      try {
        const response = await axios.get(`${API}/dashboard/batch/${batchId}`);
        setData(response.data);
      } catch (error) {
        console.error("Error fetching batch dashboard:", error);
        toast.error("Failed to load batch data");
        navigate("/dashboard");
      } finally {
        setLoading(false);
      }
    };

    fetchBatchData();
  }, [batchId, navigate]);

  // Filter and sort resumes
  const filteredResumes = data.resumes
    .filter(resume => {
      const matchesSearch = 
        resume.filename?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        resume.candidate_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        resume.email?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesScore = 
        scoreFilter === "all" ||
        (scoreFilter === "excellent" && resume.ats_score >= 80) ||
        (scoreFilter === "good" && resume.ats_score >= 60 && resume.ats_score < 80) ||
        (scoreFilter === "moderate" && resume.ats_score >= 40 && resume.ats_score < 60) ||
        (scoreFilter === "low" && resume.ats_score < 40);
      
      return matchesSearch && matchesScore;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "score-desc": return b.ats_score - a.ats_score;
        case "score-asc": return a.ats_score - b.ats_score;
        case "name-asc": return (a.candidate_name || "").localeCompare(b.candidate_name || "");
        case "name-desc": return (b.candidate_name || "").localeCompare(a.candidate_name || "");
        default: return 0;
      }
    });

  const getScoreColor = (score) => {
    if (score >= 80) return "text-[#1A4D2E] bg-[#D9F99D]";
    if (score >= 60) return "text-green-700 bg-green-100";
    if (score >= 40) return "text-amber-700 bg-amber-100";
    return "text-red-700 bg-red-100";
  };

  // Chart data
  const pieData = data.stats ? [
    { name: "Excellent (80%+)", value: data.stats.score_distribution.excellent, color: "#1A4D2E" },
    { name: "Good (60-79%)", value: data.stats.score_distribution.good, color: "#22c55e" },
    { name: "Moderate (40-59%)", value: data.stats.score_distribution.moderate, color: "#eab308" },
    { name: "Low (<40%)", value: data.stats.score_distribution.low, color: "#ef4444" }
  ].filter(item => item.value > 0) : [];

  const barData = filteredResumes.slice(0, 10).map((resume, index) => ({
    name: resume.candidate_name || `Candidate ${index + 1}`,
    score: resume.ats_score
  }));

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-[#1A4D2E] animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading batch data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => navigate("/dashboard")}
              data-testid="back-btn"
              className="hover:bg-[#F0FDF4]"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-[#1A4D2E] flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-xl text-[#1A4D2E] font-['Outfit']">TalentLens</span>
            </div>
          </div>
          <Button 
            onClick={() => navigate("/bulk")}
            data-testid="new-batch-btn"
            className="bg-[#1A4D2E] hover:bg-[#14532D] text-white"
          >
            New Batch Upload
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Page Title */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-[#1A4D2E] flex items-center justify-center">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-[#1A1A1A] font-['Outfit']">
                Batch Results
              </h1>
              {data.job_description?.title && (
                <p className="text-gray-600 flex items-center gap-2">
                  <Briefcase className="w-4 h-4" />
                  {data.job_description.title}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        {data.stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#F0FDF4] flex items-center justify-center">
                    <FileText className="w-6 h-6 text-[#1A4D2E]" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-[#1A1A1A] font-['Outfit']">
                      {data.stats.total_resumes}
                    </p>
                    <p className="text-sm text-gray-500">Total Resumes</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#D9F99D] flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-[#1A4D2E]" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-[#1A4D2E] font-['Outfit']">
                      {data.stats.average_score}%
                    </p>
                    <p className="text-sm text-gray-500">Average Score</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                    <Users className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-green-700 font-['Outfit']">
                      {data.stats.top_candidates}
                    </p>
                    <p className="text-sm text-gray-500">Top Candidates</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                    <BarChart3 className="w-6 h-6 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-amber-700 font-['Outfit']">
                      {data.stats.score_distribution.excellent}
                    </p>
                    <p className="text-sm text-gray-500">Excellent (80%+)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* JD Skills */}
        {data.job_description?.required_skills?.length > 0 && (
          <Card className="border-0 shadow-sm mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-['Outfit']">
                Required Skills ({data.job_description.required_skills.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {data.job_description.required_skills.map((skill, index) => (
                  <Badge key={index} className="bg-[#1A4D2E] text-white px-3 py-1">
                    {skill}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Charts Row */}
        {data.resumes.length > 0 && (
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* Score Distribution Pie Chart */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-['Outfit']">Score Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Top Candidates Bar Chart */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-['Outfit']">Top Candidates</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={barData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                    <XAxis type="number" domain={[0, 100]} />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      width={100} 
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => value.length > 12 ? value.slice(0, 12) + '...' : value}
                    />
                    <Tooltip />
                    <Bar dataKey="score" fill="#1A4D2E" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        <Card className="border-0 shadow-sm mb-6">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search by name, email, or filename..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 border-gray-200 focus:border-[#1A4D2E] focus:ring-[#1A4D2E]/20"
                  data-testid="search-input"
                />
              </div>
              <Select value={scoreFilter} onValueChange={setScoreFilter}>
                <SelectTrigger className="w-full md:w-[180px]" data-testid="score-filter">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Filter by score" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Scores</SelectItem>
                  <SelectItem value="excellent">Excellent (80%+)</SelectItem>
                  <SelectItem value="good">Good (60-79%)</SelectItem>
                  <SelectItem value="moderate">Moderate (40-59%)</SelectItem>
                  <SelectItem value="low">Low (&lt;40%)</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-full md:w-[180px]" data-testid="sort-select">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="score-desc">Score: High to Low</SelectItem>
                  <SelectItem value="score-asc">Score: Low to High</SelectItem>
                  <SelectItem value="name-asc">Name: A to Z</SelectItem>
                  <SelectItem value="name-desc">Name: Z to A</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Candidates Table */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-['Outfit']">
              Candidates ({filteredResumes.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-16">Rank</th>
                    <th>Candidate</th>
                    <th>File</th>
                    <th className="w-24">Score</th>
                    <th>Matched Skills</th>
                    <th>Missing Skills</th>
                    <th className="w-16">View</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResumes.map((resume, index) => (
                    <tr 
                      key={resume.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/results/${resume.id}`)}
                      data-testid={`candidate-row-${index}`}
                    >
                      <td className="font-bold text-[#1A4D2E]">
                        #{index + 1}
                      </td>
                      <td>
                        <div>
                          <p className="font-medium text-gray-800">
                            {resume.candidate_name || "Unknown"}
                          </p>
                          {resume.email && (
                            <p className="text-xs text-gray-500">{resume.email}</p>
                          )}
                        </div>
                      </td>
                      <td className="text-sm text-gray-600 max-w-[150px] truncate">
                        {resume.filename}
                      </td>
                      <td>
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold ${getScoreColor(resume.ats_score)}`}>
                          {resume.ats_score}%
                        </span>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {resume.matched_skills?.slice(0, 3).map((skill, i) => (
                            <Badge key={i} variant="outline" className="text-xs border-green-200 text-green-700">
                              {skill}
                            </Badge>
                          ))}
                          {resume.matched_skills?.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{resume.matched_skills.length - 3}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {resume.missing_skills?.slice(0, 3).map((skill, i) => (
                            <Badge key={i} variant="outline" className="text-xs border-amber-200 text-amber-700">
                              {skill}
                            </Badge>
                          ))}
                          {resume.missing_skills?.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{resume.missing_skills.length - 3}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/results/${resume.id}`);
                          }}
                          className="h-8 w-8"
                          data-testid={`view-resume-${index}`}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default BatchDashboardPage;
