import { useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { 
  FileText, 
  Users, 
  BarChart3, 
  Sparkles, 
  ArrowRight, 
  Upload, 
  Target,
  CheckCircle2,
  Building2,
  User,
  Star,
  TrendingUp,
  Award,
  Zap,
  Mail,
  Phone,
  MapPin,
  Linkedin,
  Twitter,
  Github,
  Instagram
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// Component for animating count-up numbers
const CountUpNumber = ({ value, suffix = "" }) => {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (value === "24/7") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;

          const numericValue = parseInt(value.replace(/\D/g, ""));
          const duration = 2000;
          const steps = 60;
          const stepValue = numericValue / steps;
          let currentStep = 0;

          const interval = setInterval(() => {
            currentStep++;
            const currentCount = Math.floor(stepValue * currentStep);
            setCount(currentCount);

            if (currentStep >= steps) {
              setCount(numericValue);
              clearInterval(interval);
            }
          }, duration / steps);
        }
      },
      { threshold: 0.5 }
    );

    const node = ref.current;
    if (node) observer.observe(node);

    return () => {
      if (node) observer.unobserve(node);
    };
  }, [value]);

  if (value === "24/7") {
    return <span ref={ref}>{value}</span>;
  }

  return <span ref={ref}>{count}{suffix}</span>;
};

// Mock Resume Card Component
const MockResumeCard = ({ name, score, rank, skills = [] }) => {
  return (
    <div className="bg-white rounded-lg p-4 shadow-lg border-l-4 border-[#1A4D2E] hover:shadow-xl transition-all duration-300">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#F0FDF4] flex items-center justify-center text-[#1A4D2E] font-bold">
            {name.charAt(0)}
          </div>
          <div>
            <h4 className="font-semibold text-sm text-gray-900">{name}</h4>
            <p className="text-xs text-gray-500">Software Engineer</p>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-[#D9F99D] px-2 py-1 rounded-full">
          <Star className="w-3 h-3 text-[#1A4D2E] fill-[#1A4D2E]" />
          <span className="text-xs font-bold text-[#1A4D2E]">#{rank}</span>
        </div>
      </div>
      
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-600">ATS Score</span>
          <span className="text-sm font-bold text-[#1A4D2E]">{score}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-gradient-to-r from-[#1A4D2E] to-[#D9F99D] h-2 rounded-full transition-all duration-1000"
            style={{ width: `${score}%` }}
          ></div>
        </div>
      </div>
      
      <div className="flex flex-wrap gap-1">
        {skills.map((skill, idx) => (
          <span key={idx} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
            {skill}
          </span>
        ))}
      </div>
    </div>
  );
};

// ATS Score Dashboard Component
const ATSDashboard = () => {
  return (
    <div className="bg-white rounded-xl shadow-2xl p-6 border border-gray-100">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-[#1A4D2E]" />
          Resume Analysis
        </h3>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          Live Analysis
        </div>
      </div>
      
      <div className="space-y-3 mb-6">
        <MockResumeCard 
          name="Rohan Sharma" 
          score={94} 
          rank={1} 
          skills={["React", "Python", "AWS"]}
        />
        <MockResumeCard 
          name="Priya Singh" 
          score={88} 
          rank={2} 
          skills={["Node.js", "Docker", "SQL"]}
        />
        <MockResumeCard 
          name="Amit Kumar" 
          score={82} 
          rank={3} 
          skills={["Java", "Spring", "Git"]}
        />
      </div>
      
      <div className="grid grid-cols-3 gap-3 pt-4 border-t border-gray-100">
        <div className="text-center">
          <div className="text-2xl font-bold text-[#1A4D2E]">15</div>
          <div className="text-xs text-gray-500">Analyzed</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-[#1A4D2E]">88%</div>
          <div className="text-xs text-gray-500">Avg Score</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-[#1A4D2E]">5</div>
          <div className="text-xs text-gray-500">Top Match</div>
        </div>
      </div>
    </div>
  );
};

// Skills Matching Visual
const SkillsMatchVisual = () => {
  const jobSkills = ["React", "Node.js", "Python", "AWS", "Docker"];
  const candidateSkills = ["React", "Node.js", "Python", "MongoDB"];
  
  return (
    <div className="bg-white rounded-xl shadow-2xl p-6 border border-gray-100">
      <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
        <Target className="w-5 h-5 text-[#1A4D2E]" />
        Skill Matching
      </h3>
      
      <div className="space-y-4">
        <div>
          <div className="text-xs text-gray-500 mb-2 flex items-center gap-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            Job Requirements
          </div>
          <div className="flex flex-wrap gap-2">
            {jobSkills.map((skill, idx) => (
              <span 
                key={idx} 
                className={`text-xs px-3 py-1 rounded-full font-medium ${
                  candidateSkills.includes(skill) 
                    ? 'bg-[#D9F99D] text-[#1A4D2E] border-2 border-[#1A4D2E]' 
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {skill}
                {candidateSkills.includes(skill) && (
                  <CheckCircle2 className="w-3 h-3 inline ml-1" />
                )}
              </span>
            ))}
          </div>
        </div>
        
        <div className="h-px bg-gray-200"></div>
        
        <div>
          <div className="text-xs text-gray-500 mb-2 flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            Candidate Skills
          </div>
          <div className="flex flex-wrap gap-2">
            {candidateSkills.map((skill, idx) => (
              <span 
                key={idx} 
                className="text-xs bg-[#F0FDF4] text-[#1A4D2E] px-3 py-1 rounded-full font-medium"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
        
        <div className="bg-[#F0FDF4] rounded-lg p-3 mt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[#1A4D2E]">Match Rate</span>
            <span className="text-2xl font-bold text-[#1A4D2E]">75%</span>
          </div>
          <div className="w-full bg-white rounded-full h-2 mt-2">
            <div className="bg-gradient-to-r from-[#1A4D2E] to-[#D9F99D] h-2 rounded-full w-3/4"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

const LandingPage = () => {
  const navigate = useNavigate();

  const features = [
    {
      icon: <Target className="w-6 h-6" />,
      title: "Precision Matching",
      description: "Advanced NLP algorithms extract and match skills with pinpoint accuracy."
    },
    {
      icon: <BarChart3 className="w-6 h-6" />,
      title: "Visual Analytics",
      description: "Interactive dashboards to visualize candidate scores and distributions."
    },
    {
      icon: <Sparkles className="w-6 h-6" />,
      title: "Smart Feedback",
      description: "Actionable insights to help candidates improve their applications."
    },
    {
      icon: <Users className="w-6 h-6" />,
      title: "Bulk Processing",
      description: "Screen hundreds of resumes simultaneously for enterprise needs."
    }
  ];

  const featureCardStyle = `
    @keyframes glow-pulse {
      0%, 100% {
        box-shadow: 0 0 20px rgba(26, 77, 46, 0.3), 0 4px 6px rgba(0, 0, 0, 0.1);
      }
      50% {
        box-shadow: 0 0 30px rgba(26, 77, 46, 0.6), 0 4px 12px rgba(0, 0, 0, 0.15);
      }
    }
    
    @keyframes icon-float {
      0%, 100% {
        transform: translateY(0px);
      }
      50% {
        transform: translateY(-8px);
      }
    }

    @keyframes shimmer {
      0% {
        background-position: -1000px 0;
      }
      100% {
        background-position: 1000px 0;
      }
    }

    @keyframes fade-in-up {
      from {
        opacity: 0;
        transform: translateY(30px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes gradient-rotate {
      0% {
        background-position: 0% 50%;
      }
      50% {
        background-position: 100% 50%;
      }
      100% {
        background-position: 0% 50%;
      }
    }

    @keyframes float-slow {
      0%, 100% {
        transform: translateY(0px);
      }
      50% {
        transform: translateY(-20px);
      }
    }

    .section-title {
      position: relative;
      display: inline-block;
    }

    .section-title::after {
      content: '';
      position: absolute;
      bottom: -8px;
      left: 50%;
      transform: translateX(-50%);
      width: 80px;
      height: 4px;
      background: linear-gradient(90deg, #1A4D2E, #D9F99D, #1A4D2E);
      background-size: 200% auto;
      border-radius: 2px;
      animation: gradient-rotate 3s linear infinite;
    }

    .feature-card {
      transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      overflow: hidden;
    }

    .feature-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(
        90deg,
        transparent,
        rgba(217, 249, 157, 0.3),
        transparent
      );
      transition: left 0.6s;
    }

    .feature-card:hover::before {
      left: 100%;
    }
    
    .feature-card:hover {
      animation: glow-pulse 2s ease-in-out;
      transform: translateY(-12px) scale(1.02);
      background: linear-gradient(135deg, #F0FDF4 0%, #F8F9FA 100%);
      box-shadow: 0 20px 40px rgba(26, 77, 46, 0.2);
    }
    
    .feature-card:hover .feature-icon {
      animation: icon-float 1.5s ease-in-out infinite;
      background-color: #D9F99D !important;
      transform: scale(1.1);
    }

    .step-number {
      position: relative;
      transition: all 0.3s ease;
    }

    .step-number::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 100%;
      height: 100%;
      background: rgba(217, 249, 157, 0.3);
      border-radius: 50%;
      opacity: 0;
      transition: all 0.3s ease;
    }

    .step-card:hover .step-number::before {
      width: 120%;
      height: 120%;
      opacity: 1;
    }

    .step-card:hover .step-number {
      transform: scale(1.1);
      box-shadow: 0 8px 20px rgba(26, 77, 46, 0.3);
    }

    .step-card {
      transition: all 0.3s ease;
    }

    .step-card:hover {
      transform: translateY(-8px);
    }

    .step-card:hover h3 {
      color: #1A4D2E;
    }

    .cta-button-primary {
      position: relative;
      overflow: hidden;
      transition: all 0.3s ease;
    }

    .cta-button-primary::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 0;
      height: 0;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.3);
      transform: translate(-50%, -50%);
      transition: width 0.6s, height 0.6s;
    }

    .cta-button-primary:hover::before {
      width: 300px;
      height: 300px;
    }

    .cta-button-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 30px rgba(217, 249, 157, 0.5);
    }

    .cta-button-secondary {
      position: relative;
      transition: all 0.3s ease;
    }

    .cta-button-secondary:hover {
      transform: translateY(-2px);
      background: rgba(255, 255, 255, 0.15);
      border-color: rgba(255, 255, 255, 0.6);
    }

    .animated-bg {
      position: relative;
      overflow: hidden;
    }

    .animated-bg::before {
      content: '';
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: radial-gradient(
        circle,
        rgba(217, 249, 157, 0.1) 0%,
        transparent 70%
      );
      animation: float-slow 15s ease-in-out infinite;
    }

    .feature-card {
      animation: fade-in-up 0.6s ease-out backwards;
    }

    .feature-card:nth-child(1) { animation-delay: 0.1s; }
    .feature-card:nth-child(2) { animation-delay: 0.2s; }
    .feature-card:nth-child(3) { animation-delay: 0.3s; }
    .feature-card:nth-child(4) { animation-delay: 0.4s; }

    .section-subtitle {
      animation: fade-in-up 0.8s ease-out 0.2s backwards;
    }

    .demo-float {
      animation: float-slow 6s ease-in-out infinite;
    }
  `;

  const stats = [
    { value: "85%", label: "Accuracy Rate" },
    { value: "8x", label: "Faster Screening" },
    { value: "500+", label: "Skills Tracked" },
    { value: "24/7", label: "Available" }
  ];

  return (
    <div className="min-h-screen bg-white">
      <style>{featureCardStyle}</style>
      
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-lg border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img 
              src="/talentlens-logo.png" 
              alt="TalentLens Logo" 
              className="w-10 h-10 object-contain rounded-xl"
            />
            <span className="font-bold text-xl text-[#1A4D2E] font-['Outfit']">TalentLens</span>
          </div>
          <div className="flex items-center gap-4">
            <Button 
              onClick={() => navigate("/auth")}
              data-testid="nav-get-started-btn"
              className="bg-[#1A4D2E] text-white hover:bg-[#14532D] rounded-full px-6"
            >
              Get Started
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section with Live Demo */}
      <section className="hero-section pt-32 pb-20 px-6 bg-gradient-to-br from-white via-[#F0FDF4] to-white">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left side - Text content */}
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 bg-[#D9F99D] text-[#1A4D2E] px-4 py-2 rounded-full text-sm font-semibold mb-6">
                <Sparkles className="w-4 h-4" />
                Advanced NLP-Powered Resume Analysis
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-[#1A1A1A] mb-6 font-['Outfit'] leading-tight">
                Find Your Perfect
                <span className="text-[#1A4D2E]"> Candidates</span>
                <br />in Seconds
              </h1>
              <p className="text-lg text-gray-600 mb-10">
                Transform your hiring process with intelligent resume screening. 
                Get instant ATS scores, skill matching, and actionable feedback.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <Button 
                  onClick={() => navigate("/auth")}
                  className="bg-[#1A4D2E] text-white hover:bg-[#14532D] rounded-full px-8 py-6 text-lg font-semibold"
                >
                  <Zap className="w-5 h-5 mr-2" />
                  Start Screening
                </Button>
              </div>
            </div>

            {/* Right side - Live Dashboard Demo */}
            <div className="demo-float">
              <ATSDashboard />
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 px-6 bg-[#1A4D2E]">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => {
              const suffix = stat.value.replace(/\d/g, "");
              return (
                <div key={index} className="text-center">
                  <div className="text-4xl font-bold text-[#D9F99D] mb-2 font-['Outfit']">
                    <CountUpNumber value={stat.value} suffix={suffix} />
                  </div>
                  <div className="text-white/80 text-sm">{stat.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features Section with Skill Matching Visual */}
      <section className="py-20 px-6 bg-[#F8F9FA] animated-bg">
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-12">
            <h2 className="section-title text-3xl font-bold text-[#1A1A1A] mb-4 font-['Outfit']">
              Why TalentLens?
            </h2>
            <p className="section-subtitle text-gray-600 max-w-2xl mx-auto">
              Our intelligent screening system helps you identify the best candidates faster.
            </p>
          </div>

          {/* Skills Matching Visual Demo */}
          <div className="max-w-2xl mx-auto mb-16 demo-float">
            <SkillsMatchVisual />
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <Card 
                key={index} 
                className="feature-card bg-white border-0 shadow-sm hover:shadow-lg transition-all duration-300"
              >
                <CardContent className="p-6">
                  <div className="feature-icon w-12 h-12 rounded-xl bg-[#F0FDF4] flex items-center justify-center mb-4 text-[#1A4D2E] transition-all duration-300">
                    {feature.icon}
                  </div>
                  <h3 className="font-bold text-lg mb-2 text-[#1A1A1A] font-['Outfit']">{feature.title}</h3>
                  <p className="text-gray-600 text-sm">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="section-title text-3xl font-bold text-[#1A1A1A] mb-4 font-['Outfit']">
              How It Works
            </h2>
          </div>
          
          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-3 gap-8">
              {[
                { 
                  step: "01", 
                  title: "Upload", 
                  desc: "Upload resumes (PDF/DOCX) and job description",
                  icon: <Upload className="w-6 h-6" />
                },
                { 
                  step: "02", 
                  title: "Analyze", 
                  desc: "Our Intelligent Screening System extracts skills and matches against requirements",
                  icon: <Target className="w-6 h-6" />
                },
                { 
                  step: "03", 
                  title: "Review", 
                  desc: "Get ATS scores, rankings, and actionable feedback",
                  icon: <Award className="w-6 h-6" />
                }
              ].map((item, index) => (
                <div key={index} className="step-card text-center relative">
                  <div className="step-number w-16 h-16 rounded-full bg-[#1A4D2E] text-white flex items-center justify-center text-2xl font-bold mx-auto mb-4 font-['Outfit']">
                    {item.step}
                  </div>
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#F0FDF4] text-[#1A4D2E] mb-3">
                    {item.icon}
                  </div>
                  <h3 className="font-bold text-lg mb-2 font-['Outfit'] transition-colors duration-300">{item.title}</h3>
                  <p className="text-gray-600 text-sm">{item.desc}</p>
                  {index < 2 && (
                    <div className="hidden md:block absolute top-8 left-[60%] w-[80%] h-[2px] bg-gray-200"></div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Mode Selection Cards */}
      <section className="py-20 px-6 bg-gradient-to-br from-[#F0FDF4] to-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="section-title text-3xl font-bold text-[#1A1A1A] mb-4 font-['Outfit']">
              Choose Your Mode
            </h2>
            <p className="section-subtitle text-gray-600 max-w-2xl mx-auto">
              Whether you're hiring for a team or optimizing your own resume, we've got you covered.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Corporate/Bulk Mode */}
            <Card 
              className="group cursor-pointer border-2 border-gray-100 hover:border-[#D9F99D] transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
              onClick={() => navigate("/auth")}
              data-testid="bulk-upload-card"
            >
              <CardContent className="p-8 text-left">
              <div className="w-14 h-14 rounded-2xl bg-[#F0FDF4] flex items-center justify-center mb-5 group-hover:bg-[#D9F99D] transition-colors">
              <FileText className="w-7 h-7 text-[#1A4D2E]" />
              </div>

                <h3 className="text-xl font-bold text-[#1A1A1A] mb-2 font-['Outfit']">
                  Bulk Screening
                </h3>
                <p className="text-gray-600 mb-4 text-sm">
                  Upload multiple resumes at once and rank candidates against your job requirements.
                </p>
                <div className="flex items-center gap-2 text-[#1A4D2E] font-medium text-sm group-hover:gap-3 transition-all">
                  <span>Bulk Upload</span>
                  <ArrowRight className="w-4 h-4" />
                </div>
              </CardContent>
            </Card>

            {/* Individual Mode */}
            <Card 
              className="group cursor-pointer border-2 border-gray-100 hover:border-[#D9F99D] transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
              onClick={() => navigate("/auth")}
              data-testid="single-upload-card"
            >
              <CardContent className="p-8 text-left">
                <div className="w-14 h-14 rounded-2xl bg-[#F0FDF4] flex items-center justify-center mb-5 group-hover:bg-[#D9F99D] transition-colors">
                  <User className="w-7 h-7 text-[#1A4D2E]" />
                </div>
                <h3 className="text-xl font-bold text-[#1A1A1A] mb-2 font-['Outfit']">
                  Individual Check
                </h3>
                <p className="text-gray-600 mb-4 text-sm">
                  Check your resume against any job description and get instant ATS score & feedback.
                </p>
                <div className="flex items-center gap-2 text-[#1A4D2E] font-medium text-sm group-hover:gap-3 transition-all">
                  <span>Check Now</span>
                  <ArrowRight className="w-4 h-4" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Professional Footer */}
<footer className="bg-[#0A0A0A] text-white pt-16 pb-8 px-6">
  <div className="max-w-7xl mx-auto">
    
    {/* Top Footer Grid */}
    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
      
      {/* Company Info */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <img 
            src="/talentlens-logo.png" 
            alt="TalentLens Logo" 
            className="w-12 h-12 object-contain rounded-xl"
          />
          <span className="font-bold text-xl text-white font-['Outfit']">
            TalentLens AI
          </span>
        </div>
        <p className="text-sm text-gray-400 leading-relaxed mb-4">
          Advanced NLP-powered resume screening platform for resume analysis, candidate ranking, and intelligent skill matching to help recruiters identify top talent faster.
        </p>

        {/* Social Media */}
        <div className="flex gap-4 mt-4">
          <a href="https://www.linkedin.com/in/prasen-nimje/" target="_blank" rel="noopener noreferrer" className="hover:text-[#D9F99D] transition-colors">
            <Linkedin className="w-5 h-5" />
          </a>
         <a
          href="https://x.com/Prasen_08"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-[#D9F99D] transition-colors"
            >
          <Twitter className="w-5 h-5" />
          </a>
          <a href="https://github.com/Prasen8" target="_blank" rel="noopener noreferrer" className="hover:text-[#D9F99D] transition-colors">
            <Github className="w-5 h-5" />
          </a>
        </div>
      </div>

      <div>
      
      </div>  
      <div>
      
      </div>
      {/* Contact Info */}
      <div>
        <h4 className="font-semibold text-white mb-4">Contact Us</h4>
        <div className="space-y-3 text-sm text-gray-400">
          <div className="flex items-center gap-3">
            <Mail className="w-4 h-4 text-[#D9F99D]" />
            <span>talentlens.solutions@gmail.com</span>
          </div>
          <div className="flex items-center gap-3">
            <Phone className="w-4 h-4 text-[#D9F99D]" />
            <span>+91 8421587121</span>
          </div>
          <div className="flex items-start gap-3">
            <MapPin className="w-4 h-4 text-[#D9F99D] mt-1" />
            <span>
              BNCOE, Pusad, Maharashtra <br />
              India
            </span>
          </div>
        </div>
      </div>



    </div>
    {/* Divider */}
    <div className="border-t border-gray-800 pt-6 flex flex-col md:flex-row items-center justify-between text-sm text-gray-500">
      <p>© 2026 TalentLens AI. All rights reserved.</p>

      <div className="flex gap-6 mt-4 md:mt-0">
        <a href="#" className="hover:text-[#D9F99D] transition">Privacy Policy</a>
        <a href="#" className="hover:text-[#D9F99D] transition">Terms of Service</a>
        <a href="#" className="hover:text-[#D9F99D] transition">Cookies</a>
      </div>
    </div>

  </div>
</footer>
    </div>
  );
};
export default LandingPage;