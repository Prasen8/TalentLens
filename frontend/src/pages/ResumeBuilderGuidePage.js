import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText, LogOut, Upload, LayoutDashboard, ChevronDown,
  Users, ArrowLeft, BookOpen, ChevronRight, CheckCircle,
  XCircle, Zap, Star, Award, Target, TrendingUp, Eye,
  AlignLeft, Briefcase, GraduationCap, Code, BarChart2,
  Search, Shield, Clock, Layers, Download, ExternalLink,
  Cpu, Database, Cloud, Globe, Terminal, Wrench,
  Brain, Sparkles, Wand2, ScanLine, BarChart3, Mail,
  FlaskConical, Radar, ListChecks, UserCheck, ChevronUp,
  Github, Linkedin, Twitter, ExternalLink as Link2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import authUtils from "@/utils/authUtils";
import { toast } from "sonner";

/* ─── colour tokens matching the app theme ─── */
const C = {
  forest:   "#1A4D2E",
  forestDk: "#14532D",
  forestLt: "#2D6A4F",
  lime:     "#D9F99D",
  limeDk:   "#A3E635",
  limeLt:   "#ECFCCB",
  page:     "#F8F9FA",
  card:     "#FFFFFF",
  border:   "#E5E7EB",
  muted:    "#6B7280",
  dark:     "#111827",
  violet:   "#7C3AED",
  violetLt: "#EDE9FE",
};

/* ─── Section data ─── */
const SECTIONS = [
  {
    id: "header",
    icon: <Eye className="w-5 h-5" />,
    emoji: "👤",
    title: "Header & Contact",
    priority: "Critical",
    priorityColor: "bg-red-100 text-red-700 border-red-200",
    accentColor: "#EF4444",
    accentBg: "#FEF2F2",
    description: "The very first thing a recruiter sees. Must be clean, complete and professional.",
    dos: [
      "Full name in large bold font (18–22pt)",
      "Professional email — firstname.lastname@gmail.com",
      "Phone number with country code included",
      "LinkedIn URL — customise it (linkedin.com/in/yourname)",
      "City and State only — no full home address",
      "Portfolio or GitHub link if relevant to the role",
    ],
    donts: [
      "No photo — creates unconscious bias and wastes space",
      "No age or date of birth anywhere on resume",
      "No marital status or gender",
      "No unprofessional email addresses",
    ],
    example: (
      <div className="space-y-1.5">
        <p className="font-bold text-xl text-gray-900 font-['Outfit']">Alex Johnson</p>
        <p className="text-[#1A4D2E] font-semibold text-sm">Senior Software Engineer</p>
        <p className="text-gray-500 text-xs">alex.johnson@gmail.com  •  +1 (555) 234-5678  •  San Francisco, CA</p>
        <p className="text-blue-600 text-xs">linkedin.com/in/alexjohnson  •  github.com/alexj</p>
      </div>
    ),
    atsImpact: 95,
  },
  {
    id: "summary",
    icon: <AlignLeft className="w-5 h-5" />,
    emoji: "📝",
    title: "Professional Summary",
    priority: "High",
    priorityColor: "bg-amber-100 text-amber-700 border-amber-200",
    accentColor: "#F59E0B",
    accentBg: "#FFFBEB",
    description: "Your 6-second pitch. Recruiters read this first — if it's weak, nothing else matters.",
    dos: [
      "2–4 lines maximum — tight and punchy",
      "Mention your role title and years of experience",
      "Highlight your biggest strength or technical niche",
      "Include 1–2 keywords directly from the job description",
      "Write in third-person style (avoid 'I am...')",
      "Lead with the most impressive fact about you",
    ],
    donts: [
      "No generic objective: 'Seeking a challenging position...'",
      "No clichés: 'hard-working team player', 'passionate go-getter'",
      "No first-person pronouns",
      "No irrelevant personal information",
    ],
    example: (
      <p className="text-gray-700 text-sm leading-relaxed italic">
        "Results-driven Software Engineer with 5+ years building scalable web applications using React and Node.js.
        Proven track record of reducing API response times by 62% and leading cross-functional teams of 6+.
        Passionate about clean architecture and developer experience at scale."
      </p>
    ),
    atsImpact: 80,
  },
  {
    id: "skills",
    icon: <Code className="w-5 h-5" />,
    emoji: "⚡",
    title: "Skills Section",
    priority: "Critical",
    priorityColor: "bg-red-100 text-red-700 border-red-200",
    accentColor: "#7C3AED",
    accentBg: "#F5F3FF",
    description: "The single most important section for ATS parsing. Every keyword here gets machine-matched against the JD.",
    dos: [
      "Group by category: Languages, Frameworks, Tools, Databases",
      "Match keywords exactly as they appear in the job description",
      "List hard skills — ATS cannot meaningfully parse soft skills",
      "Keep to 12–20 most relevant skills per application",
      "Put strongest, most-relevant skills first in each group",
      "Include both abbreviation and full form: JS / JavaScript",
    ],
    donts: [
      "Never rate skills with stars, bars, or percentages — it's subjective",
      "No generic soft skills like 'Microsoft Office' unless required",
      "Don't list skills you'd fail an interview question on",
      "No outdated or irrelevant technologies",
    ],
    example: (
      <div className="space-y-2 text-sm">
        {[
          { label: "Languages", skills: ["Python", "JavaScript", "TypeScript", "SQL"] },
          { label: "Frameworks", skills: ["React", "Node.js", "FastAPI", "Django"] },
          { label: "Cloud & Tools", skills: ["AWS", "Docker", "Git", "MongoDB"] },
        ].map((cat) => (
          <div key={cat.label} className="flex items-start gap-2">
            <span className="text-xs font-bold text-gray-500 w-24 shrink-0 pt-1">{cat.label}:</span>
            <div className="flex flex-wrap gap-1">
              {cat.skills.map((s) => (
                <span key={s} className="px-2 py-0.5 bg-white rounded-md text-xs font-medium text-gray-700 border border-gray-200 shadow-sm">
                  {s}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    ),
    atsImpact: 90,
  },
  {
    id: "experience",
    icon: <Briefcase className="w-5 h-5" />,
    emoji: "💼",
    title: "Work Experience",
    priority: "Critical",
    priorityColor: "bg-red-100 text-red-700 border-red-200",
    accentColor: "#1A4D2E",
    accentBg: "#F0FDF4",
    description: "The core of your resume. Every bullet should demonstrate impact, not just responsibility.",
    dos: [
      "Reverse chronological order — newest role first",
      "Start every bullet with a strong action verb (Built, Led, Reduced, Launched)",
      "Quantify everything: %, $, users served, time saved, team size",
      "3–5 focused bullets per role — quality over quantity",
      "Include company, title, location, and dates for each role",
      "Tailor bullets to match language in the job description",
    ],
    donts: [
      "Never list job duties — show outcomes and achievements instead",
      "No passive language: 'Was responsible for...'",
      "Don't go back more than 10–15 years of experience",
      "No irrelevant part-time jobs for senior roles",
    ],
    example: (
      <div className="text-sm">
        <div className="flex justify-between mb-1">
          <div>
            <p className="font-bold text-gray-900">Senior Software Engineer</p>
            <p className="text-gray-500 text-xs">TechCorp Inc. · San Francisco, CA</p>
          </div>
          <p className="text-gray-400 text-xs">Jan 2022 – Present</p>
        </div>
        <ul className="space-y-1 mt-2">
          {[
            "Reduced API response time by 62% with Redis caching, serving 2M+ daily users",
            "Led migration from monolith to microservices, cutting deploy time from 4h → 12 min",
            "Mentored 4 junior engineers, lifting team velocity by 30% in 2 quarters",
          ].map((b, i) => (
            <li key={i} className="flex gap-2 text-gray-700 text-xs">
              <span className="text-[#1A4D2E] shrink-0 mt-0.5">▸</span>{b}
            </li>
          ))}
        </ul>
      </div>
    ),
    atsImpact: 88,
  },
  {
    id: "education",
    icon: <GraduationCap className="w-5 h-5" />,
    emoji: "🎓",
    title: "Education",
    priority: "Medium",
    priorityColor: "bg-blue-100 text-blue-700 border-blue-200",
    accentColor: "#3B82F6",
    accentBg: "#EFF6FF",
    description: "Education still matters for many roles — position it strategically based on your experience level.",
    dos: [
      "Degree name, Major, University name, Graduation year",
      "Include GPA only if 3.5+ and within 3 years of graduation",
      "Add relevant coursework if you are entry-level",
      "List certifications prominently — AWS, Google, Meta, etc.",
      "For 5+ years experience, keep this section to 3 lines max",
      "Include honours, Dean's List, or scholarships if relevant",
    ],
    donts: [
      "Never include high school once you have a college degree",
      "Don't include GPA below 3.5",
      "No irrelevant online courses unless directly applicable",
      "Don't pad with every certificate you've ever earned",
    ],
    example: (
      <div className="text-sm">
        <div className="flex justify-between">
          <div>
            <p className="font-bold text-gray-900">B.S. Computer Science</p>
            <p className="text-gray-500 text-xs">UC Berkeley · 2019 · GPA: 3.8</p>
          </div>
        </div>
        <ul className="mt-2 space-y-1">
          {["Dean's List — 2017, 2018", "AWS Certified Developer – Associate (2023)", "Google Cloud Professional (2024)"].map((e, i) => (
            <li key={i} className="text-xs text-gray-600 flex gap-1.5">
              <span className="text-blue-500">•</span>{e}
            </li>
          ))}
        </ul>
      </div>
    ),
    atsImpact: 60,
  },
  {
    id: "projects",
    icon: <Layers className="w-5 h-5" />,
    emoji: "🚀",
    title: "Projects",
    priority: "Medium",
    priorityColor: "bg-blue-100 text-blue-700 border-blue-200",
    accentColor: "#14B8A6",
    accentBg: "#F0FDFA",
    description: "Projects prove you can actually build things — critical for junior roles and career changers.",
    dos: [
      "2–3 projects max — quality always beats quantity",
      "Always include a GitHub or live demo link",
      "State the full tech stack — every tool is a keyword match",
      "Show impact: active users, stars, traffic, performance metrics",
      "Personal side projects count — they show genuine passion",
      "Include the year or timeframe for each project",
    ],
    donts: [
      "No unfinished or half-built projects",
      "No tutorial clones (Todo app, weather app, etc.)",
      "Don't describe what the project does without saying why it matters",
      "No private repos with no demo link",
    ],
    example: (
      <div className="text-sm">
        <div className="flex justify-between items-start">
          <p className="font-bold text-gray-900">TalentLens AI</p>
          <a className="text-xs text-blue-600 underline">github.com/alexj/talentlens</a>
        </div>
        <p className="text-gray-500 text-xs mt-0.5">React · FastAPI · MongoDB · spaCy · ReportLab · 2024</p>
        <p className="text-gray-700 text-xs mt-1">
          AI-powered resume ATS scoring platform analyzing 500+ resumes/month with NLP skill extraction,
          multi-dimensional scoring engine, and automated PDF report generation.
        </p>
      </div>
    ),
    atsImpact: 55,
  },
];

/* ─── Team Members Data ─── */
const TEAM_MEMBERS = [
   {
id: 1,
  name: "Prasen Pramod Nimje",
  role: "Backend Lead & NLP Engineer",
  department: "Engineering",
  bio: "Backend Lead of TalentLens, responsible for designing scalable APIs and NLP pipelines for resume parsing and job-role matching. Built the core logic for manual and advanced resume analysis, integrating ML models and data processing workflows to deliver accurate role recommendations. Passionate about building end-to-end AI applications that solve real-world problems.",
  skills: ["Python", "FastAPI", "NLP", "Machine Learning", "SQL", "MongoDB", "Pandas"],
  avatar: "PN",
  avatarBg: "#1A4D2E",
  avatarText: "#D9F99D",
  accentColor: "#1D4ED8",
  accentBg: "#F0FDF4",
  badgeColor: "bg-emerald-100 text-emerald-700",
  github: "https://github.com/Prasen8",
  linkedin: "https://www.linkedin.com/in/prasen-nimje",
  linkedinColor: "#0A66C2",
  achievement: "Developed end-to-end resume analysis pipeline with role recommendation system",
    },
  {
    id: 2,
  name: "Mahesh Shridhar Khumkar",
  role: "AI/ML Engineer & NLP Specialist",
  department: "AI Research",
  bio: "Focused on building and optimizing machine learning models for TalentLens. Worked on role prediction logic and NLP-based analysis by leveraging experience in deep learning and multimodal AI systems. Skilled in model training, evaluation, and deployment using modern ML frameworks.",
  skills: ["Python", "PyTorch", "TensorFlow", "Scikit-learn", "NLP", "SQL"],
  avatar: "MK",
  avatarBg: "#7C3AED",
  avatarText: "#EDE9FE",
  accentColor: "#1D4ED8",
  accentBg: "#F5F3FF",
  badgeColor: "bg-violet-100 text-violet-700",
  github: "https://github.com/MShriK17",
  linkedin: "https://www.linkedin.com/in/mahesh-k23/",
  linkedinColor: "#0A66C2",
  achievement: "Contributed to ML model development for role prediction and NLP analysis",
  },
  {
    id: 3,
  name: "Nishant Pravin Chaudhari",
  role: "Database & Data Support",
  department: "Engineering",
  bio: "Supported data handling, preprocessing, and database management for TalentLens. Assisted in organizing datasets, performing data analysis, and ensuring smooth data flow for model training and application functionality.",
  skills: ["Python", "MySQL", "Pandas", "Data Analysis", "Machine Learning Basics"],
  avatar: "NC",
  avatarBg: "#1D4ED8",
  avatarText: "#EFF6FF",
  accentColor: "#1D4ED8",
  accentBg: "#EFF6FF",
  badgeColor: "bg-blue-100 text-blue-700",
  github: "https://github.com/Nishant-23-patil",
  linkedin: "https://www.linkedin.com/in/nishant-chaudhari-4a8698273/",
  linkedinColor: "#0A66C2",
  achievement: "Handled dataset preparation and database support for analytics",
  },
];

const TEAM_STATS = [
  { value: "3", label: "Team Members", icon: "👥" },
  { value: "450+", label: "Resumes Analysed", icon: "📄" },
  { value: "5", label: "Scoring Dimensions", icon: "⚡" },
  { value: "20+", label: "Role Profiles", icon: "🎯" },
];

/* ─── How TalentLens Works ─── */
const HOW_IT_WORKS_MANUAL = [
  {
    step: "01",
    icon: <Upload className="w-6 h-6" />,
    title: "Upload Resume",
    desc: "Upload a PDF or DOCX. TalentLens extracts text, contact info, and raw skills instantly using NLP.",
    color: "#1A4D2E", bg: "#F0FDF4",
  },
  {
    step: "02",
    icon: <AlignLeft className="w-6 h-6" />,
    title: "Paste Job Description",
    desc: "Paste the full JD. Our engine parses required skills, seniority level, years of experience, and education requirements.",
    color: "#1D4ED8", bg: "#EFF6FF",
  },
  {
    step: "03",
    icon: <Cpu className="w-6 h-6" />,
    title: "5-Dimension Scoring",
    desc: "Score computed across 5 weighted dimensions — Skills (45%), Experience (25%), Education (10%), Seniority (10%), Keyword Density (10%).",
    color: "#7C3AED", bg: "#F5F3FF",
  },
  {
    step: "04",
    icon: <BarChart2 className="w-6 h-6" />,
    title: "Review Insights",
    desc: "Get matched vs missing skills, seniority alignment, experience gap analysis, and targeted improvement feedback.",
    color: "#D97706", bg: "#FFFBEB",
  },
  {
    step: "05",
    icon: <Download className="w-6 h-6" />,
    title: "Download PDF Report",
    desc: "Download a professional hiring report with candidate name, score breakdown, skills, links, and hiring recommendation.",
    color: "#DC2626", bg: "#FEF2F2",
  },
];

const HOW_IT_WORKS_ADVANCED = [
  {
    step: "01",
    icon: <Upload className="w-6 h-6" />,
    title: "Upload Resume — No JD Needed",
    desc: "Just upload the resume. No job description required. TalentLens automatically extracts skills, experience, education, and seniority from the resume text.",
    color: "#7C3AED", bg: "#F5F3FF",
  },
  {
    step: "02",
    icon: <Radar className="w-6 h-6" />,
    title: "NLP-Powered Auto-Role Detection",
    desc: "The engine analyses your skills against 20+ role profiles (Software Engineer, Data Scientist, Product Manager, etc.) and detects the top 3 best-fit roles with confidence scores — no manual input.",
    color: "#7C3AED", bg: "#F5F3FF",
  },
  {
    step: "03",
    icon: <Cpu className="w-6 h-6" />,
    title: "5-Dimension ATS Scoring",
    desc: "The same 5-dimension scoring engine runs automatically against the detected role's JD profile — Skills (45%), Experience (25%), Education (10%), Seniority (10%), Keywords (10%).",
    color: "#7C3AED", bg: "#F5F3FF",
  },
  {
    step: "04",
    icon: <FlaskConical className="w-6 h-6" />,
    title: "Strength & Weakness Analysis",
    desc: "Deep analysis of what the candidate does well (technical depth, quantified achievements, leadership signals) and where they fall short (missing skills, sparse experience, weak formatting).",
    color: "#7C3AED", bg: "#F5F3FF",
  },
  {
    step: "05",
    icon: <UserCheck className="w-6 h-6" />,
    title: "Candidate Fit Score",
    desc: "A separate Fit Score (0–100) is computed across 4 dimensions — ATS match, strength quality, weakness penalties, and score breakdown balance — giving a holistic hire/no-hire signal.",
    color: "#7C3AED", bg: "#F5F3FF",
  },
  {
    step: "06",
    icon: <ListChecks className="w-6 h-6" />,
    title: "ATS Improvement Suggestions",
    desc: "Personalised, actionable suggestions ranked by impact: which skills to add, how to reframe experience bullets, what keywords are missing, and how to close the gap for the detected role.",
    color: "#7C3AED", bg: "#F5F3FF",
  },
  {
    step: "07",
    icon: <Mail className="w-6 h-6" />,
    title: "Email Shortlisted Candidates",
    desc: "From the Advanced Dashboard, select shortlisted candidates and send personalised shortlist, interview invite, or next-round emails — with the AI analysis PDF attached automatically.",
    color: "#7C3AED", bg: "#F5F3FF",
  },
  {
    step: "08",
    icon: <Download className="w-6 h-6" />,
    title: "Download AI Report",
    desc: "Download a full AI analysis PDF report per candidate — includes detected role, fit score, strength/weakness breakdown, top 3 role matches, ATS suggestions, and hire recommendation.",
    color: "#7C3AED", bg: "#F5F3FF",
  },
];

/* ─── Scoring dimensions ─── */
const SCORE_DIMS = [
  { label: "Skills Match", weight: 45, color: "#1A4D2E", desc: "Weighted by skill category — core tech > soft skills. Includes partial credit for variants (node.js vs nodejs)." },
  { label: "Experience", weight: 25, color: "#1D4ED8", desc: "Years in resume vs years required in JD. Over-qualified gets small bonus, under-qualified is scaled." },
  { label: "Education", weight: 10, color: "#7C3AED", desc: "Degree tier match: PhD(4) > Master(3) > Bachelor(2) > Diploma(1). Partial credit for lower degrees." },
  { label: "Seniority", weight: 10, color: "#D97706", desc: "Job title level alignment — Junior/Mid/Senior/Lead/Director/C-Suite. Over-qualified = small penalty." },
  { label: "Keyword Density", weight: 10, color: "#DC2626", desc: "How much of the JD language appears naturally in the resume. Rewards tailored resumes." },
];

/* ─── Quick format tips ─── */
const FORMAT_TIPS = [
  { icon: "📄", tip: "1–2 Pages Max", sub: "One page for <5 years exp" },
  { icon: "🔤", tip: "ATS-Safe Fonts", sub: "Calibri, Arial, Georgia, Garamond" },
  { icon: "📐", tip: "0.5–1\" Margins", sub: "Balanced whitespace matters" },
  { icon: "🚫", tip: "No Tables or Images", sub: "ATS cannot parse graphics" },
  { icon: "💾", tip: "Save as PDF", sub: "Unless .docx is specifically requested" },
  { icon: "🏷️", tip: "Tailor Every Apply", sub: "Match JD keywords per application" },
  { icon: "🔗", tip: "Live Links Only", sub: "Test all GitHub and LinkedIn links" },
  { icon: "📅", tip: "Consistent Date Format", sub: "Jan 2022 or 01/2022 — pick one" },
  { icon: "⬛", tip: "Simple Bullet Points", sub: "Round • dots, not decorative symbols" },
  { icon: "🎨", tip: "Minimal Colour", sub: "One accent colour max, no gradients" },
  { icon: "🔡", tip: "Consistent Tense", sub: "Past tense for old roles, present for current" },
  { icon: "✂️", tip: "No Objective Statement", sub: "Replace with a punchy summary instead" },
];

/* ─── Skill category weights ─── */
const SKILL_CATS = [
  { cat: "Programming Languages", weight: "1.5×", color: "#1A4D2E", examples: "Python, JavaScript, Java, TypeScript, Go, Rust" },
  { cat: "Web Frameworks", weight: "1.4×", color: "#1D4ED8", examples: "React, Node.js, FastAPI, Django, Spring, Next.js" },
  { cat: "AI / Data Science", weight: "1.4×", color: "#7C3AED", examples: "TensorFlow, PyTorch, scikit-learn, Pandas, LLM, NLP" },
  { cat: "Databases", weight: "1.3×", color: "#D97706", examples: "SQL, PostgreSQL, MongoDB, Redis, Elasticsearch" },
  { cat: "Cloud & DevOps", weight: "1.3×", color: "#0891B2", examples: "AWS, Docker, Kubernetes, Terraform, CI/CD, GCP" },
  { cat: "Security", weight: "1.3×", color: "#DC2626", examples: "OAuth, JWT, SSL/TLS, Cybersecurity, Penetration Testing" },
  { cat: "Testing", weight: "1.2×", color: "#059669", examples: "Jest, Pytest, Selenium, TDD, QA, Automation Testing" },
  { cat: "Tools & Methodologies", weight: "1.1×", color: "#9333EA", examples: "Agile, Scrum, Jira, Figma, Git, GitHub" },
  { cat: "Soft Skills", weight: "0.8×", color: "#6B7280", examples: "Leadership, Communication, Teamwork, Negotiation" },
];

/* ─── Feature cards for platform overview ─── */
const PLATFORM_FEATURES = [
  {
    icon: <FileText className="w-5 h-5" />,
    title: "Single Manual Screening",
    desc: "Upload one resume + paste a JD. Full 5-dimension ATS analysis, skills gap breakdown, feedback, and downloadable PDF report.",
    color: "#1A4D2E", bg: "#F0FDF4", badge: "Manual",
  },
  {
    icon: <Users className="w-5 h-5" />,
    title: "Bulk Manual Screening",
    desc: "Upload 50+ resumes at once against one job description. All results ranked by ATS score for instant shortlisting.",
    color: "#1D4ED8", bg: "#EFF6FF", badge: "Manual",
  },
  {
    icon: <Brain className="w-5 h-5" />,
    title: "Single Advanced Scan",
    desc: "No JD needed. AI detects the role, runs 5-dimension scoring, strength/weakness analysis, candidate fit score, and improvement suggestions.",
    color: "#7C3AED", bg: "#F5F3FF", badge: "Advanced", badgeBg: "#EDE9FE", badgeColor: "#7C3AED",
  },
  {
    icon: <Sparkles className="w-5 h-5" />,
    title: "Bulk Advanced Scan",
    desc: "Upload 50+ resumes — AI auto-detects each candidate's best-fit role, scores them all, and ranks by fit score. No JD required.",
    color: "#7C3AED", bg: "#F5F3FF", badge: "Advanced", badgeBg: "#EDE9FE", badgeColor: "#7C3AED",
  },
  {
    icon: <BarChart2 className="w-5 h-5" />,
    title: "Analytics Dashboard",
    desc: "Score distribution, top/bottom performers, skill frequency, candidate comparison — split by Manual and Advanced scans.",
    color: "#0891B2", bg: "#F0F9FF", badge: "Both Modes",
  },
  {
    icon: <Mail className="w-5 h-5" />,
    title: "Email Shortlisted Candidates",
    desc: "Send shortlist, interview invite, or rejection emails to candidates directly from the Advanced Dashboard. AI PDF report attached automatically.",
    color: "#059669", bg: "#ECFDF5", badge: "Advanced", badgeBg: "#EDE9FE", badgeColor: "#7C3AED",
  },
  {
    icon: <Download className="w-5 h-5" />,
    title: "PDF Report Download",
    desc: "Professional PDF with score breakdown, matched/missing skills, strength/weakness analysis, hire recommendation, and candidate links.",
    color: "#D97706", bg: "#FFFBEB", badge: "Both Modes",
  },
  {
    icon: <TrendingUp className="w-5 h-5" />,
    title: "Performance Tracking",
    desc: "Unified view of all screened resumes — manual and AI — with top/needs-improvement split, scan type filters, and live stats.",
    color: "#DC2626", bg: "#FEF2F2", badge: "Both Modes",
  },
  {
    icon: <Shield className="w-5 h-5" />,
    title: "User Data Isolation",
    desc: "Every user's resumes, scores, and reports are completely private and scoped to their account only.",
    color: "#6B7280", bg: "#F9FAFB", badge: "All Features",
  },
];

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════ */
const ResumeBuilderGuidePage = () => {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState(0);
  const [activeTab, setActiveTab] = useState("guide");
  const [scanMode, setScanMode] = useState("manual");
  const [scrollY, setScrollY] = useState(0);
  const heroRef = useRef(null);

  const userData = {
    username: authUtils.getUsername?.() || "User",
    email: authUtils.getCurrentUser?.()?.email || "",
  };

  useEffect(() => {
    const handler = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const handleLogout = () => {
    authUtils.logout();
    navigate("/auth");
    toast.success("Logged out successfully");
  };

  const tabs = [
    { id: "guide",      label: "Resume Sections",        icon: <BookOpen className="w-4 h-4" /> },
    { id: "scoring",    label: "How Scoring Works",       icon: <Cpu className="w-4 h-4" /> },
    { id: "format",     label: "Format Rules",            icon: <Wrench className="w-4 h-4" /> },
    { id: "howitworks", label: "How TalentLens Works",    icon: <Zap className="w-4 h-4" /> },
    { id: "team",       label: "Meet the Team",           icon: <Users className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[#F8F9FA] font-['Outfit']">

      {/* ── NAVBAR ── */}
      <header
        className="bg-white border-b border-gray-100 sticky top-0 z-50 transition-shadow"
        style={{ boxShadow: scrollY > 10 ? "0 2px 20px rgba(0,0,0,0.08)" : "none" }}
      >
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#1A4D2E] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back</span>
            </button>
            <div className="w-px h-5 bg-gray-200" />
            <div className="flex items-center gap-2">
              <img
              src="/talentlens-logo.png"
              alt="TalentLens Logo"
              className="w-9 h-9 object-contain"
              />
              <span className="font-bold text-lg text-[#1A4D2E]">TalentLens</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/dashboard")}
              className="hidden sm:flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#1A4D2E] px-3 py-2 rounded-lg hover:bg-[#F0FDF4] transition-all"
            >
              <LayoutDashboard className="w-4 h-4" />Dashboard
            </button>
            <button
              onClick={() => navigate("/performance")}
              className="hidden sm:flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#1A4D2E] px-3 py-2 rounded-lg hover:bg-[#F0FDF4] transition-all"
            >
              <TrendingUp className="w-4 h-4" />Performance
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-9 h-9 rounded-full bg-[#D9F99D] flex items-center justify-center hover:bg-[#A3E635] transition-colors">
                  <span className="text-[#1A4D2E] font-bold text-sm">
                    {userData.username.charAt(0).toUpperCase()}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <div className="px-3 py-2.5 border-b border-gray-100">
                  <p className="font-semibold text-sm text-gray-800">{userData.username}</p>
                  <p className="text-xs text-gray-400 truncate">{userData.email}</p>
                </div>
                <DropdownMenuItem onClick={() => navigate("/dashboard")} className="cursor-pointer gap-2">
                  <LayoutDashboard className="w-4 h-4 text-gray-400" /> Dashboard
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/performance")} className="cursor-pointer gap-2">
                  <TrendingUp className="w-4 h-4 text-gray-400" /> Performance
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer gap-2 text-[#1A4D2E] font-semibold bg-[#F0FDF4]">
                  <BookOpen className="w-4 h-4" /> Resume Guide
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-red-500 cursor-pointer gap-2">
                  <LogOut className="w-4 h-4" /> Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      <div
        ref={heroRef}
        className="relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${C.forest} 0%, ${C.forestLt} 50%, #166534 100%)` }}
      >
        <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full opacity-10" style={{ background: C.lime }} />
        <div className="absolute -bottom-10 -left-10 w-56 h-56 rounded-full opacity-10" style={{ background: C.lime }} />
        <div className="absolute top-1/2 left-1/3 w-2 h-2 rounded-full bg-white opacity-30" />
        <div className="absolute top-1/4 left-2/3 w-3 h-3 rounded-full" style={{ background: C.lime, opacity: 0.5 }} />

        <div className="relative max-w-7xl mx-auto px-6 py-16 md:py-24">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold mb-6 border"
              style={{ background: "rgba(217,249,157,0.15)", borderColor: "rgba(217,249,157,0.3)", color: C.lime }}>
              <BookOpen className="w-3.5 h-3.5" />
              TalentLens Complete Guide
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white leading-tight mb-4">
              Resume Builder
              <span className="block" style={{ color: C.lime }}>&amp; ATS Guide</span>
            </h1>
            <p className="text-white/70 text-lg mb-8 leading-relaxed max-w-xl">
              Everything you need to write a resume that beats ATS systems, impresses recruiters,
              and lands interviews. Learn how TalentLens Manual and Advanced scanning works too.
            </p>
            <div className="flex flex-wrap gap-3">
              {[
                { icon: <Shield className="w-3.5 h-3.5" />, label: "6 Resume Sections" },
                { icon: <Cpu className="w-3.5 h-3.5" />, label: "5-Dimension Scoring" },
                { icon: <Brain className="w-3.5 h-3.5" />, label: "Advanced Scan" },
                { icon: <Target className="w-3.5 h-3.5" />, label: "ATS Optimisation" },
              ].map((chip) => (
                <div key={chip.label}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border"
                  style={{ background: "rgba(255,255,255,0.1)", borderColor: "rgba(255,255,255,0.2)", color: "white" }}>
                  {chip.icon}{chip.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── STICKY TAB BAR ── */}
      <div className="sticky top-[65px] z-40 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-0 overflow-x-auto scrollbar-hide">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-2 px-5 py-4 text-sm font-semibold whitespace-nowrap border-b-2 transition-all"
                style={{
                  borderColor: activeTab === tab.id ? C.forest : "transparent",
                  color: activeTab === tab.id ? C.forest : "#6B7280",
                }}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-10">

        {/* ═══════════════════════════════════════
            TAB 1 — RESUME SECTIONS GUIDE
        ═══════════════════════════════════════ */}
        {activeTab === "guide" && (
          <div className="grid lg:grid-cols-12 gap-8">
            {/* Sidebar */}
            <div className="lg:col-span-3">
              <div className="sticky top-36">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 px-2">Sections</p>
                <nav className="space-y-1">
                  {SECTIONS.map((sec, i) => (
                    <button
                      key={sec.id}
                      onClick={() => setActiveSection(i)}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all"
                      style={{
                        background: activeSection === i ? sec.accentBg : "transparent",
                        borderLeft: activeSection === i ? `3px solid ${sec.accentColor}` : "3px solid transparent",
                      }}
                    >
                      <span className="text-xl shrink-0">{sec.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-800 truncate">{sec.title}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <div className="h-1 rounded-full flex-1" style={{ background: sec.accentColor, opacity: 0.3 }} />
                          <span className="text-xs" style={{ color: sec.accentColor }}>ATS: {sec.atsImpact}%</span>
                        </div>
                      </div>
                      {activeSection === i && (
                        <ChevronRight className="w-4 h-4 shrink-0" style={{ color: sec.accentColor }} />
                      )}
                    </button>
                  ))}
                </nav>

                <div className="mt-6 p-4 rounded-xl border border-gray-100 bg-white">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">ATS Impact</p>
                  <div className="space-y-2">
                    {SECTIONS.map((s) => (
                      <div key={s.id} className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-16 truncate">{s.title.split(" ")[0]}</span>
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${s.atsImpact}%`, background: s.accentColor }} />
                        </div>
                        <span className="text-xs font-bold w-7 text-right" style={{ color: s.accentColor }}>{s.atsImpact}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Main detail panel */}
            <div className="lg:col-span-9 space-y-6">
              {(() => {
                const sec = SECTIONS[activeSection];
                return (
                  <>
                    <div
                      className="rounded-2xl p-6 flex items-start justify-between gap-4"
                      style={{ background: sec.accentBg, borderLeft: `4px solid ${sec.accentColor}` }}
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm text-3xl bg-white">
                          {sec.emoji}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h2 className="text-2xl font-bold text-gray-900">{sec.title}</h2>
                            <span className={`text-xs px-3 py-1 rounded-full font-semibold border ${sec.priorityColor}`}>
                              {sec.priority}
                            </span>
                          </div>
                          <p className="text-gray-600 text-sm max-w-2xl">{sec.description}</p>
                        </div>
                      </div>
                      <div className="shrink-0 text-center bg-white rounded-xl px-4 py-3 shadow-sm">
                        <p className="text-2xl font-bold" style={{ color: sec.accentColor }}>{sec.atsImpact}%</p>
                        <p className="text-xs text-gray-400">ATS Impact</p>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                        <div className="flex items-center gap-2 mb-4">
                          <CheckCircle className="w-5 h-5 text-emerald-500" />
                          <h3 className="font-bold text-gray-800">Do's</h3>
                        </div>
                        <ul className="space-y-3">
                          {sec.dos.map((d, i) => (
                            <li key={i} className="flex items-start gap-2.5">
                              <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold text-white"
                                style={{ background: sec.accentColor }}>{i + 1}</span>
                              <p className="text-sm text-gray-700 leading-relaxed">{d}</p>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                        <div className="flex items-center gap-2 mb-4">
                          <XCircle className="w-5 h-5 text-red-400" />
                          <h3 className="font-bold text-gray-800">Don'ts</h3>
                        </div>
                        <ul className="space-y-3">
                          {sec.donts.map((d, i) => (
                            <li key={i} className="flex items-start gap-2.5">
                              <span className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                                <span className="text-red-400 text-xs font-bold">✕</span>
                              </span>
                              <p className="text-sm text-gray-700 leading-relaxed">{d}</p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                      <div className="flex items-center gap-2 mb-4">
                        <Star className="w-5 h-5" style={{ color: sec.accentColor }} />
                        <h3 className="font-bold text-gray-800">Real-World Example</h3>
                        <Badge variant="outline" className="ml-auto text-xs">Copy this format</Badge>
                      </div>
                      <div className="rounded-xl p-5 border" style={{ background: sec.accentBg, borderColor: sec.accentColor + "30" }}>
                        {sec.example}
                      </div>
                    </div>

                    <div className="flex items-center justify-between bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                      <button
                        disabled={activeSection === 0}
                        onClick={() => setActiveSection(p => p - 1)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                      >
                        <ArrowLeft className="w-4 h-4" />Previous
                      </button>
                      <div className="flex gap-1.5">
                        {SECTIONS.map((_, i) => (
                          <button key={i} onClick={() => setActiveSection(i)}
                            className="w-2 h-2 rounded-full transition-all"
                            style={{
                              background: i === activeSection ? SECTIONS[activeSection].accentColor : "#E5E7EB",
                              transform: i === activeSection ? "scale(1.3)" : "scale(1)",
                            }} />
                        ))}
                      </div>
                      <button
                        disabled={activeSection === SECTIONS.length - 1}
                        onClick={() => setActiveSection(p => p + 1)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                        style={{ color: activeSection < SECTIONS.length - 1 ? SECTIONS[activeSection + 1]?.accentColor : undefined }}
                      >
                        Next<ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════
            TAB 2 — HOW SCORING WORKS
        ═══════════════════════════════════════ */}
        {activeTab === "scoring" && (
          <div className="space-y-8 max-w-5xl">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">How TalentLens Calculates Your ATS Score</h2>
              <p className="text-gray-500 text-sm leading-relaxed max-w-2xl">
                Unlike basic ATS tools that only count matched keywords, TalentLens uses a
                multi-dimensional scoring engine across 5 aspects — giving a far more accurate hiring signal.
              </p>
            </div>

            <div className="grid md:grid-cols-1 gap-4">
              {SCORE_DIMS.map((dim) => (
                <div key={dim.label} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 text-white font-bold text-lg"
                      style={{ background: dim.color }}>
                      {dim.weight}%
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-bold text-gray-900">{dim.label}</h3>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ background: dim.color }}>
                          {dim.weight}% of total
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">{dim.desc}</p>
                      <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden w-full max-w-sm">
                        <div className="h-full rounded-full" style={{ width: `${dim.weight * 2}%`, background: dim.color }} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-4">Skill Category Weights</h3>
              <p className="text-sm text-gray-500 mb-4">
                Not all skills are equal. Core technical skills contribute more than general tools or soft skills.
              </p>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {SKILL_CATS.map((row) => (
                  <div key={row.cat}
                    className="flex items-center gap-4 px-5 py-3.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold text-white"
                      style={{ background: row.color }}>{row.weight}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-800">{row.cat}</p>
                      <p className="text-xs text-gray-400 truncate">{row.examples}</p>
                    </div>
                    <div className="shrink-0 w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full"
                        style={{ width: `${(parseFloat(row.weight) / 1.5) * 100}%`, background: row.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-4">Score Bands & Hiring Recommendations</h3>
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { range: "85–100%", label: "Exceptional", verdict: "Fast-track for interview immediately", color: "#1A4D2E", bg: "#F0FDF4" },
                  { range: "70–84%", label: "Strong", verdict: "Solid interview candidate", color: "#15803D", bg: "#DCFCE7" },
                  { range: "55–69%", label: "Good", verdict: "Worth further evaluation", color: "#D97706", bg: "#FFFBEB" },
                  { range: "40–54%", label: "Moderate", verdict: "Notable gaps — consider carefully", color: "#EA580C", bg: "#FFF7ED" },
                  { range: "25–39%", label: "Weak", verdict: "Significant gaps exist", color: "#DC2626", bg: "#FEF2F2" },
                  { range: "0–24%",  label: "Poor", verdict: "Does not meet minimum requirements", color: "#991B1B", bg: "#FEE2E2" },
                ].map((band) => (
                  <div key={band.range} className="rounded-xl p-4 border"
                    style={{ background: band.bg, borderColor: band.color + "20" }}>
                    <p className="text-xl font-bold mb-1" style={{ color: band.color }}>{band.range}</p>
                    <p className="font-semibold text-sm text-gray-800 mb-1">{band.label}</p>
                    <p className="text-xs text-gray-500">{band.verdict}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl p-6" style={{ background: `linear-gradient(135deg, ${C.forest}, ${C.forestLt})` }}>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                  <Zap className="w-5 h-5 text-[#D9F99D]" />
                </div>
                <div>
                  <h3 className="font-bold text-white mb-2">Pro Tip: Partial Credit for Skill Variants</h3>
                  <p className="text-white/70 text-sm leading-relaxed">
                    TalentLens gives 50% credit when skill variants are found — e.g. JD says "Node.js" but
                    your resume says "NodeJS". You still get 50% of that skill's weight. Minor wording
                    differences won't unfairly penalise you.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════
            TAB 3 — FORMAT RULES
        ═══════════════════════════════════════ */}
        {activeTab === "format" && (
          <div className="space-y-8 max-w-5xl">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Resume Format Rules</h2>
              <p className="text-gray-500 text-sm">
                Even a brilliant resume fails if formatted poorly. ATS systems are notoriously bad at
                parsing tables, columns, and graphics. These rules are non-negotiable.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
              {FORMAT_TIPS.map((tip, i) => (
                <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
                  <span className="text-3xl block mb-3">{tip.icon}</span>
                  <p className="font-bold text-gray-900 text-sm mb-1">{tip.tip}</p>
                  <p className="text-xs text-gray-500">{tip.sub}</p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-50 bg-gray-50">
                <h3 className="font-bold text-gray-800">File Format Guide</h3>
              </div>
              {[
                { fmt: ".PDF", icon: "📄", when: "Always — unless employer specifies otherwise", why: "Preserves formatting perfectly across all operating systems", rec: "Recommended", recColor: "#1A4D2E", recBg: "#F0FDF4" },
                { fmt: ".DOCX", icon: "📝", when: "Only when specifically requested by employer", why: "Editable — some recruiters may modify; ATS systems parse it well", rec: "When Asked", recColor: "#D97706", recBg: "#FFFBEB" },
                { fmt: ".TXT", icon: "📃", when: "Some online ATS portals only accept plain text", why: "Zero formatting loss — but you lose all visual design", rec: "Situational", recColor: "#6B7280", recBg: "#F9FAFB" },
              ].map((row) => (
                <div key={row.fmt} className="flex items-start gap-4 px-6 py-4 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                  <span className="text-2xl shrink-0">{row.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-bold text-sm text-gray-900">{row.fmt}</p>
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                        style={{ background: row.recBg, color: row.recColor }}>{row.rec}</span>
                    </div>
                    <p className="text-xs text-gray-500 mb-0.5"><strong>When:</strong> {row.when}</p>
                    <p className="text-xs text-gray-400"><strong>Why:</strong> {row.why}</p>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-4">Most Common ATS-Killer Mistakes</h3>
              <div className="space-y-3">
                {[
                  { mistake: "Using tables or multi-column layouts", impact: "ATS reads columns left-to-right, jumbling all your content into nonsense" },
                  { mistake: "Putting contact info in a header/footer", impact: "Many ATS systems skip header/footer areas — your contact info disappears" },
                  { mistake: "Using images, logos or icons", impact: "ATS cannot read images — your skills and achievements inside graphics are invisible" },
                  { mistake: "Using creative section names", impact: "'About Me' and 'My Story' confuse ATS parsers — use standard names: Experience, Education, Skills" },
                  { mistake: "Abbreviating skills inconsistently", impact: "JD says 'Machine Learning' but resume only says 'ML' — ATS may not match them" },
                  { mistake: "Saving as PNG or JPG screenshot of resume", impact: "Zero parseable text — ATS returns a blank resume. This happens more than you think" },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-4 bg-white rounded-xl p-4 border border-red-100">
                    <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                      <XCircle className="w-4 h-4 text-red-500" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-gray-900 mb-0.5">{item.mistake}</p>
                      <p className="text-xs text-gray-500">{item.impact}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════
            TAB 4 — HOW TALENTLENS WORKS
        ═══════════════════════════════════════ */}
        {activeTab === "howitworks" && (
          <div className="space-y-10 max-w-5xl">

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">How TalentLens Works End-to-End</h2>
              <p className="text-gray-500 text-sm leading-relaxed max-w-2xl">
                TalentLens has two screening modes — <strong>Manual Scan</strong> (you provide a JD) and
                <strong> Advanced Scan</strong> (no JD needed, TalentLens does everything). Choose a mode to explore.
              </p>
            </div>

            {/* ── Mode Toggle ── */}
            <div className="flex items-center gap-3 p-1.5 bg-gray-100 rounded-2xl w-fit">
              <button
                onClick={() => setScanMode("manual")}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all"
                style={scanMode === "manual"
                  ? { background: C.forest, color: "white", boxShadow: "0 2px 8px rgba(26,77,46,0.3)" }
                  : { color: "#6B7280" }}
              >
                <Target className="w-4 h-4" />
                Manual Scan
              </button>
              <button
                onClick={() => setScanMode("advanced")}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all"
                style={scanMode === "advanced"
                  ? { background: C.violet, color: "white", boxShadow: "0 2px 8px rgba(124,58,237,0.3)" }
                  : { color: "#6B7280" }}
              >
                <Brain className="w-4 h-4" />
                Advanced Scan
              </button>
            </div>

            {/* ── Manual flow ── */}
            {scanMode === "manual" && (
              <>
                <div className="flex items-center gap-3 p-4 rounded-xl border border-[#D9F99D] bg-[#F0FDF4]">
                  <Target className="w-5 h-5 text-[#1A4D2E] shrink-0" />
                  <p className="text-sm text-[#1A4D2E]">
                    <strong>Manual Scan</strong> is JD-driven screening. You provide a job description and TalentLens
                    scores how well each resume matches it using the 5-dimension engine.
                  </p>
                </div>

                <div className="relative">
                  <div className="absolute left-7 top-10 bottom-10 w-0.5 bg-gradient-to-b from-[#1A4D2E] to-[#DC2626] hidden md:block" />
                  <div className="space-y-4">
                    {HOW_IT_WORKS_MANUAL.map((step, i) => (
                      <div key={i} className="flex items-start gap-5 relative">
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 text-white shadow-md z-10"
                          style={{ background: step.color }}>
                          {step.icon}
                        </div>
                        <div className="flex-1 bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                              style={{ background: step.color }}>Step {step.step}</span>
                            <h3 className="font-bold text-gray-900">{step.title}</h3>
                          </div>
                          <p className="text-sm text-gray-600 leading-relaxed">{step.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ── Advanced flow ── */}
            {scanMode === "advanced" && (
              <>
                <div className="flex items-center gap-3 p-4 rounded-xl border bg-[#F5F3FF]"
                  style={{ borderColor: C.violet + "40" }}>
                  <Brain className="w-5 h-5 shrink-0" style={{ color: C.violet }} />
                  <p className="text-sm" style={{ color: C.violet }}>
                    <strong>Advanced Scan</strong> needs no job description. TalentLens detects the candidate's best-fit role
                    automatically, runs a full 8-stage analysis, and produces a comprehensive hiring recommendation — all hands-free.
                  </p>
                </div>

                <div className="grid sm:grid-cols-3 gap-3">
                  {[
                    { icon: "🚫", title: "No JD Required", desc: "AI detects the role from the resume itself" },
                    { icon: "🤖", title: "Auto Role Detection", desc: "Matches against 20+ role profiles with confidence scores" },
                    { icon: "📊", title: "Fit Score", desc: "Separate holistic Fit Score beyond just ATS %" },
                  ].map((chip, i) => (
                    <div key={i} className="bg-white rounded-xl p-4 border shadow-sm text-center"
                      style={{ borderColor: C.violet + "30" }}>
                      <span className="text-2xl block mb-2">{chip.icon}</span>
                      <p className="font-bold text-sm text-gray-900 mb-1">{chip.title}</p>
                      <p className="text-xs text-gray-500">{chip.desc}</p>
                    </div>
                  ))}
                </div>

                <div className="relative">
                  <div className="absolute left-7 top-10 bottom-10 w-0.5 hidden md:block"
                    style={{ background: `linear-gradient(to bottom, ${C.violet}, #6D28D9)` }} />
                  <div className="space-y-4">
                    {HOW_IT_WORKS_ADVANCED.map((step, i) => (
                      <div key={i} className="flex items-start gap-5 relative">
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 text-white shadow-md z-10"
                          style={{ background: C.violet }}>
                          {step.icon}
                        </div>
                        <div className="flex-1 bg-white rounded-2xl p-5 border shadow-sm"
                          style={{ borderColor: C.violet + "20" }}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                              style={{ background: C.violet }}>Step {step.step}</span>
                            <h3 className="font-bold text-gray-900">{step.title}</h3>
                          </div>
                          <p className="text-sm text-gray-600 leading-relaxed">{step.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-4">AI Fit Score Bands</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    The Candidate Fit Score is separate from the ATS Score — it's a holistic measure combining
                    ATS match quality, resume strengths, weakness penalties, and scoring balance.
                  </p>
                  <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {[
                      { range: "85–100", label: "Exceptional Fit", verdict: "Fast-track for interview — top-tier candidate", color: C.forest, bg: "#F0FDF4" },
                      { range: "70–84",  label: "Strong Fit",      verdict: "Recommend for interview — strong overall profile", color: "#15803D", bg: "#DCFCE7" },
                      { range: "55–69",  label: "Good Fit",        verdict: "Consider for interview — good potential", color: "#D97706", bg: "#FFFBEB" },
                      { range: "40–54",  label: "Partial Fit",     verdict: "Review carefully — notable gaps present", color: "#EA580C", bg: "#FFF7ED" },
                      { range: "25–39",  label: "Weak Fit",        verdict: "Significant gaps — likely not a match", color: "#DC2626", bg: "#FEF2F2" },
                      { range: "0–24",   label: "Poor Fit",        verdict: "Does not meet minimum requirements", color: "#991B1B", bg: "#FEE2E2" },
                    ].map((band) => (
                      <div key={band.range} className="rounded-xl p-4 border"
                        style={{ background: band.bg, borderColor: band.color + "20" }}>
                        <p className="text-xl font-bold mb-0.5" style={{ color: band.color }}>{band.range}</p>
                        <p className="font-semibold text-sm text-gray-800 mb-1">{band.label}</p>
                        <p className="text-xs text-gray-500">{band.verdict}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ── Platform Features ── */}
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">All Platform Features</h3>
              <p className="text-sm text-gray-500 mb-5">
                Full overview of everything TalentLens offers across both screening modes.
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                {PLATFORM_FEATURES.map((feat) => (
                  <div key={feat.title}
                    className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white"
                        style={{ background: feat.color }}>
                        {feat.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h4 className="font-bold text-gray-900 text-sm">{feat.title}</h4>
                          <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                            style={{
                              background: feat.badgeBg || "#F3F4F6",
                              color: feat.badgeColor || "#6B7280"
                            }}>
                            {feat.badge}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 leading-relaxed">{feat.desc}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA */}
            <div className="rounded-2xl p-8 text-center"
              style={{ background: `linear-gradient(135deg, ${C.forest}, ${C.forestLt})` }}>
              <h3 className="text-2xl font-bold text-white mb-2">Ready to Screen Resumes?</h3>
              <p className="text-white/70 text-sm mb-6 max-w-md mx-auto">
                Put the guide into practice. Use Manual scan with a JD or let Advanced scan do it all automatically.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Button
                  onClick={() => navigate("/single")}
                  className="bg-[#D9F99D] text-[#1A4D2E] hover:bg-[#A3E635] font-bold px-6"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Manual Screen
                </Button>
                <Button
                  onClick={() => navigate("/bulk")}
                  variant="outline"
                  className="border-white/30 text-white hover:bg-white/10 bg-transparent px-6"
                >
                  <Users className="w-4 h-4 mr-2" />
                  Bulk Screen
                </Button>
                <Button
                  onClick={() => navigate("/dashboard/advanced")}
                  className="font-bold px-6"
                  style={{ background: C.violet, color: "white" }}
                >
                  <Brain className="w-4 h-4 mr-2" />
                  Advanced Scan
                </Button>
              </div>
            </div>

          </div>
        )}

        {/* ═══════════════════════════════════════
            TAB 5 — MEET THE TEAM
        ═══════════════════════════════════════ */}
        {activeTab === "team" && (
          <div className="space-y-12 max-w-6xl">

            {/* ── Team Hero Banner ── */}
            <div
              className="relative rounded-3xl overflow-hidden p-8 md:p-12"
              style={{ background: `linear-gradient(135deg, ${C.forest} 0%, ${C.forestLt} 60%, #166534 100%)` }}
            >
              {/* Decorative circles */}
              <div className="absolute -top-12 -right-12 w-56 h-56 rounded-full opacity-10" style={{ background: C.lime }} />
              <div className="absolute -bottom-8 -left-8 w-40 h-40 rounded-full opacity-10" style={{ background: C.lime }} />
              <div className="absolute top-6 right-1/3 w-2 h-2 rounded-full bg-white opacity-40" />
              <div className="absolute bottom-8 right-1/4 w-3 h-3 rounded-full opacity-50" style={{ background: C.lime }} />

              <div className="relative max-w-2xl">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold mb-5 border"
                  style={{ background: "rgba(217,249,157,0.15)", borderColor: "rgba(217,249,157,0.3)", color: C.lime }}>
                  <Users className="w-3.5 h-3.5" />
                  The People Behind TalentLens
                </div>
                <h2 className="text-3xl md:text-4xl font-bold text-white leading-tight mb-4">
                  Built with passion,<br />
                  <span style={{ color: C.lime }}>shipped with purpose.</span>
                </h2>
                <p className="text-white/70 text-base leading-relaxed max-w-lg">
                  We're a small, focused team of engineers, AI researchers, and designers who believe
                  the hiring process deserves better tooling. TalentLens is what we built.
                </p>
              </div>

              {/* Stats row inside hero */}
              <div className="relative mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {TEAM_STATS.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-2xl px-4 py-4 text-center"
                    style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}
                  >
                    <p className="text-xl mb-1">{stat.icon}</p>
                    <p className="text-2xl font-bold text-white leading-none mb-1">{stat.value}</p>
                    <p className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.6)" }}>{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Team Grid ── */}
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-1 h-6 rounded-full" style={{ background: C.forest }} />
                <h3 className="text-xl font-bold text-gray-900">Core Team</h3>
                <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[#F0FDF4] text-[#1A4D2E] border border-[#D9F99D]">
                  {TEAM_MEMBERS.length} Members
                </span>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {TEAM_MEMBERS.map((member) => (
                  <div
                    key={member.id}
                    className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 overflow-hidden"
                  >
                    {/* Card top accent stripe */}
                    <div className="h-1.5 w-full" style={{ background: member.accentColor }} />

                    <div className="p-6">
                      {/* Avatar + Name + Role */}
                      <div className="flex items-start gap-4 mb-4">
                        <div
                          className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 text-lg font-bold shadow-sm"
                          style={{ background: member.avatarBg, color: member.avatarText }}
                        >
                          {member.avatar}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-gray-900 text-base leading-tight">{member.name}</h4>
                          <p className="text-sm font-semibold mt-0.5" style={{ color: member.accentColor }}>
                            {member.role}
                          </p>
                          <span className={`inline-block mt-1.5 text-xs px-2.5 py-0.5 rounded-full font-semibold ${member.badgeColor}`}>
                            {member.department}
                          </span>
                        </div>
                      </div>

                      {/* Bio */}
                      <p className="text-sm text-gray-600 leading-relaxed mb-4 line-clamp-3">
                        {member.bio}
                      </p>

                      {/* Key Achievement */}
                      <div
                        className="flex items-start gap-2 rounded-xl px-3 py-2.5 mb-4"
                        style={{ background: member.accentBg }}
                      >
                        <Award className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: member.accentColor }} />
                        <p className="text-xs font-semibold leading-snug" style={{ color: member.accentColor }}>
                          {member.achievement}
                        </p>
                      </div>

                      {/* Skills */}
                      <div className="flex flex-wrap gap-1.5 mb-5">
                        {member.skills.map((skill) => (
                          <span
                            key={skill}
                            className="text-xs px-2.5 py-1 rounded-lg font-medium bg-gray-50 text-gray-600 border border-gray-100"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>

                      {/* Social Links */}
                      <div className="flex items-center gap-2 pt-4 border-t border-gray-50">
                        <a
                          href={member.github}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-gray-400 hover:text-gray-900 transition-all"
                        >
                          <Github className="w-3.5 h-3.5" />
                          GitHub
                        </a>
                        <a
                          href={member.linkedin}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition-all hover:opacity-90"
                          style={{ background: member.accentColor }}
                        >
                          <Linkedin className="w-3.5 h-3.5" />
                          LinkedIn
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Our Values ── */}
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-1 h-6 rounded-full" style={{ background: C.violet }} />
                <h3 className="text-xl font-bold text-gray-900">What We Believe In</h3>
              </div>

              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  {
                    icon: "🎯",
                    title: "Accuracy over hype",
                    desc: "We spent weeks tuning the scoring engine to be genuinely accurate — not just impressive-looking. Every percentage point is calibrated.",
                    color: "#1A4D2E", bg: "#F0FDF4",
                  },
                  {
                    icon: "🔒",
                    title: "Privacy by design",
                    desc: "Your data never leaves your account scope. We built user isolation from day one, not as an afterthought.",
                    color: "#1D4ED8", bg: "#EFF6FF",
                  },
                  {
                    icon: "⚡",
                    title: "Speed without compromise",
                    desc: "Bulk scanning 50+ resumes should feel instant. We optimised every step of the pipeline so you're never staring at a loading bar.",
                    color: "#D97706", bg: "#FFFBEB",
                  },
                  {
                    icon: "🤖",
                    title: "AI that explains itself",
                    desc: "Every score comes with a breakdown. We believe AI tools should show their work — not just spit out a number and expect trust.",
                    color: "#7C3AED", bg: "#F5F3FF",
                  },
                  {
                    icon: "🧑‍💼",
                    title: "Built for real recruiters",
                    desc: "We interviewed hiring managers to understand what they actually need — not what product managers imagined they need.",
                    color: "#0891B2", bg: "#F0F9FF",
                  },
                  {
                    icon: "🌱",
                    title: "Constantly improving",
                    desc: "TalentLens ships updates every sprint. The role profiles, scoring weights, and NLP models are all continuously refined.",
                    color: "#059669", bg: "#ECFDF5",
                  },
                ].map((val, i) => (
                  <div
                    key={i}
                    className="rounded-2xl p-5 border hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                    style={{ background: val.bg, borderColor: val.color + "25" }}
                  >
                    <span className="text-2xl block mb-3">{val.icon}</span>
                    <h4 className="font-bold text-gray-900 text-sm mb-2">{val.title}</h4>
                    <p className="text-xs text-gray-600 leading-relaxed">{val.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Tech Stack ── */}
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-1 h-6 rounded-full" style={{ background: "#0891B2" }} />
                <h3 className="text-xl font-bold text-gray-900">How We Built It</h3>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="grid sm:grid-cols-2 md:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-gray-50">
                  {[
                    {
                      layer: "Frontend",
                      icon: <Globe className="w-5 h-5" />,
                      color: "#1D4ED8",
                      bg: "#EFF6FF",
                      stack: ["React 18", "TypeScript", "Tailwind CSS", "Shadcn UI", "Recharts"],
                    },
                    {
                      layer: "Backend",
                      icon: <Terminal className="w-5 h-5" />,
                      color: "#1A4D2E",
                      bg: "#F0FDF4",
                      stack: ["FastAPI", "Python 3.11", "spaCy NLP", "ReportLab", "PyMuPDF"],
                    },
                    {
                      layer: "Database",
                      icon: <Database className="w-5 h-5" />,
                      color: "#D97706",
                      bg: "#FFFBEB",
                      stack: ["MongoDB Atlas", "MongoDB Compass"],
                    },
                    {
                      layer: "Infrastructure",
                      icon: <Cloud className="w-5 h-5" />,
                      color: "#0891B2",
                      bg: "#F0F9FF",
                      stack: [ "Docker", "GitHub Actions"],
                    },
                  ].map((tier) => (
                    <div key={tier.layer} className="p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0"
                          style={{ background: tier.color }}
                        >
                          {tier.icon}
                        </div>
                        <p className="font-bold text-sm text-gray-900">{tier.layer}</p>
                      </div>
                      <div className="space-y-2">
                        {tier.stack.map((tech) => (
                          <div
                            key={tech}
                            className="flex items-center gap-2 text-xs font-medium text-gray-700 px-2.5 py-1.5 rounded-lg"
                            style={{ background: tier.bg }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ background: tier.color }}
                            />
                            {tech}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── CTA ── */}
            <div
              className="rounded-3xl p-8 md:p-10 text-center relative overflow-hidden"
              style={{ background: `linear-gradient(135deg, ${C.forest}, ${C.forestLt})` }}
            >
              <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-10" style={{ background: C.lime }} />
              <div className="absolute -bottom-6 -left-6 w-28 h-28 rounded-full opacity-10" style={{ background: C.lime }} />
              <div className="relative">
                <p className="text-4xl mb-4">👋</p>
                <h3 className="text-2xl font-bold text-white mb-3">Want to get in touch?</h3>
                <p className="text-white/70 text-sm mb-7 max-w-md mx-auto leading-relaxed">
                  We love hearing from recruiters, HR teams, and builders. Whether it's feedback,
                  a feature request, or a collaboration idea — we're all ears.
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  <Button
                    className="bg-[#D9F99D] text-[#1A4D2E] hover:bg-[#A3E635] font-bold px-6"
                    onClick={() => window.open(
  "https://mail.google.com/mail/?view=cm&fs=1&to=talentlens.solutions@gmail.com&su=Inquiry&body=Hello TalentLens Team,"
)}
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    Email the Team
                  </Button>
                  <Button
                    variant="outline"
                    className="border-white/30 text-white hover:bg-white/10 bg-transparent font-semibold px-6"
                    onClick={() => navigate("/performance")}
                  >
                    <LayoutDashboard className="w-4 h-4 mr-2" />
                    Back to Dashboard
                  </Button>
                </div>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
};

export default ResumeBuilderGuidePage;
