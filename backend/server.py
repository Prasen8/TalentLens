from fastapi import FastAPI, APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import base64
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone
import aiofiles
import tempfile
import re
import bcrypt

# NLP imports
import spacy
from PyPDF2 import PdfReader
from docx import Document
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.graphics.shapes import Drawing, Wedge
from reportlab.graphics import renderPDF
from io import BytesIO
import textwrap
import uuid
import tempfile
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Dict, Optional

# Email Automation (built-in smtplib — no extra packages needed)
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]


# Load spaCy model
try:
    nlp = spacy.load("en_core_web_sm")
except OSError:
    from spacy.cli import download
    download("en_core_web_sm")
    nlp = spacy.load("en_core_web_sm")

# Create the main app
app = FastAPI(title="TalentLens AI API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://talent-lens-psi.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.responses import JSONResponse

@app.options("/{rest_of_path:path}")
async def preflight_handler(rest_of_path: str):
    return JSONResponse(content={"message": "OK"})


api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== PYDANTIC MODELS ====================

class ResumeAnalysis(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    filename: str
    candidate_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    extracted_skills: List[str] = []
    experience_keywords: List[str] = []
    education_keywords: List[str] = []
    job_title: Optional[str] = None
    ats_score: float = 0.0
    matched_skills: List[str] = []
    missing_skills: List[str] = []
    feedback: List[str] = []
    job_description_id: Optional[str] = None
    analysis_type: str = "single"
    batch_id: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class JobDescription(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str
    required_skills: List[str] = []
    preferred_skills: List[str] = []
    experience_level: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class AnalyzeRequest(BaseModel):
    resume_text: str
    job_description: str
    job_title: Optional[str] = None

class BulkAnalyzeRequest(BaseModel):
    job_description: str
    job_title: Optional[str] = None

class DashboardStats(BaseModel):
    total_resumes: int
    average_score: float
    top_candidates: int
    score_distribution: Dict[str, int]

# ── NEW: Email shortlist request model ────────────────────────────────────
class ShortlistEmailRequest(BaseModel):
    resume_ids: List[str]
    user_id: Optional[str] = None
    # email_type selects built-in template when body_template is None:
    #   "thanks_scanning"  - thank-you after AI resume scan
    #   "shortlist"        - candidate shortlisted (default)
    #   "interview_invite" - interview invitation
    #   "next_round"       - moved to next round
    #   "rejection"        - polite rejection
    email_type: Optional[str] = "shortlist"
    subject: Optional[str] = None           # auto-set per email_type if None
    body_template: Optional[str] = None     # custom body overrides email_type
    attach_report: bool = True
    email_overrides: Optional[Dict[str, str]] = {}  # resume_id → corrected email address

# ==================== AUTH MODELS ====================

class UserRegister(BaseModel):
    username: str
    email: str
    password: str
    class Config:
        min_length = 1

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    created_at: str

class LoginResponse(BaseModel):
    success: bool
    token: str
    user: UserResponse
    message: str

# ==================== NLP UTILITY FUNCTIONS ====================

# ── Skill keyword database (with category tags for weighting) ──────────────
SKILL_KEYWORDS: Dict[str, str] = {

    # Programming Languages → "lang"
    "python": "lang", "java": "lang", "javascript": "lang", "typescript": "lang",
    "c++": "lang", "c#": "lang", "ruby": "lang", "go": "lang", "golang": "lang",
    "rust": "lang", "php": "lang", "swift": "lang", "kotlin": "lang", "scala": "lang",
    "r": "lang", "matlab": "lang", "perl": "lang", "bash": "lang", "shell": "lang",

    # Web Technologies → "web"
    "html": "web", "css": "web", "react": "web", "angular": "web", "vue": "web",
    "nodejs": "web", "node.js": "web", "express": "web", "django": "web",
    "flask": "web", "fastapi": "web", "spring": "web", "springboot": "web",
    "asp.net": "web", "rails": "web", "laravel": "web", "nextjs": "web",
    "next.js": "web", "nuxt": "web", "gatsby": "web", "svelte": "web",
    "jquery": "web", "bootstrap": "web", "tailwind": "web", "sass": "web", "less": "web",

    # Databases → "db"
    "sql": "db", "mysql": "db", "postgresql": "db", "mongodb": "db", "redis": "db",
    "elasticsearch": "db", "cassandra": "db", "oracle": "db", "sqlite": "db",
    "dynamodb": "db", "firebase": "db", "neo4j": "db", "graphql": "db", "nosql": "db",

    # Cloud & DevOps → "cloud"
    "aws": "cloud", "azure": "cloud", "gcp": "cloud", "google cloud": "cloud",
    "docker": "cloud", "kubernetes": "cloud", "k8s": "cloud", "jenkins": "cloud",
    "ci/cd": "cloud", "terraform": "cloud", "ansible": "cloud", "puppet": "cloud",
    "chef": "cloud", "linux": "cloud", "unix": "cloud", "git": "cloud",
    "github": "cloud", "gitlab": "cloud", "bitbucket": "cloud", "nginx": "cloud",
    "apache": "cloud", "serverless": "cloud", "lambda": "cloud", "cloudformation": "cloud",

    # Data Science & AI → "ai"
    "machine learning": "ai", "ml": "ai", "deep learning": "ai", "tensorflow": "ai",
    "pytorch": "ai", "keras": "ai", "scikit-learn": "ai", "pandas": "ai",
    "numpy": "ai", "scipy": "ai", "nlp": "ai", "natural language processing": "ai",
    "computer vision": "ai", "ai": "ai", "artificial intelligence": "ai",
    "data analysis": "ai", "data science": "ai", "statistics": "ai",
    "neural networks": "ai", "regression": "ai", "classification": "ai",
    "clustering": "ai", "llm": "ai", "gpt": "ai",
    
    # Modern AI / LLM / ML Stack
    "transformers": "ai",
    "huggingface": "ai",
    "hugging face": "ai",
    "langchain": "ai",
    "llamaindex": "ai",
    "openai": "ai",
    "prompt engineering": "ai",
    "fine tuning": "ai",
    "rag": "ai",
    "retrieval augmented generation": "ai",
    "vector database": "ai",
    "vector db": "ai",
    "faiss": "ai",
    "pinecone": "ai",
    "weaviate": "ai",
    "chroma": "ai",

    # MLOps & Data Engineering
    "mlops": "ai",
    "model deployment": "ai",
    "model serving": "ai",
    "airflow": "ai",
    "spark": "ai",
    "pyspark": "ai",
    "hadoop": "ai",
    "data pipeline": "ai",
    "feature engineering": "ai",
    "model training": "ai",

    # Mobile Development → "mobile"
    "android": "mobile", "ios": "mobile", "react native": "mobile",
    "flutter": "mobile", "xamarin": "mobile", "cordova": "mobile", "ionic": "mobile",

    # Tools & Methodologies → "tools"
    "agile": "tools", "scrum": "tools", "kanban": "tools", "jira": "tools",
    "confluence": "tools", "trello": "tools", "asana": "tools", "figma": "tools",
    "sketch": "tools", "adobe": "tools", "photoshop": "tools", "illustrator": "tools",
    "xd": "tools", "ui/ux": "tools", "ux": "tools",

    # Soft Skills → "soft"
    "leadership": "soft", "communication": "soft", "teamwork": "soft",
    "problem solving": "soft", "analytical": "soft", "project management": "soft",
    "time management": "soft", "presentation": "soft", "negotiation": "soft",
    "collaboration": "soft", "critical thinking": "soft", "adaptability": "soft",

    # Business & Finance → "biz"
    "excel": "biz", "powerpoint": "biz", "word": "biz", "office": "biz",
    "sap": "biz", "salesforce": "biz", "crm": "biz", "erp": "biz",
    "financial analysis": "biz", "budgeting": "biz", "forecasting": "biz",
    "accounting": "biz", "marketing": "biz",

    # Security → "sec"
    "cybersecurity": "sec", "security": "sec", "penetration testing": "sec",
    "ethical hacking": "sec", "soc": "sec", "encryption": "sec",
    "authentication": "sec", "authorization": "sec", "oauth": "sec",
    "jwt": "sec", "ssl": "sec", "tls": "sec",

    # Testing → "test"
    "testing": "test", "unit testing": "test", "integration testing": "test",
    "selenium": "test", "cypress": "test", "jest": "test", "pytest": "test",
    "junit": "test", "qa": "test", "quality assurance": "test",
    "automation testing": "test", "tdd": "test", "bdd": "test",
}


CATEGORY_WEIGHTS: Dict[str, float] = {
    "lang": 1.5, "web": 1.4, "db": 1.3, "cloud": 1.3,
    "ai": 1.4, "mobile": 1.3, "sec": 1.3, "test": 1.2,
    "tools": 1.1, "biz": 1.0, "soft": 0.8,
}

SENIORITY_TIERS = {
    "intern": 0,
    "junior": 1, "entry": 1, "fresher": 1, "graduate": 1,
    "mid": 2, "associate": 2,
    "senior": 3, "sr": 3, "staff": 3, "lead": 3,
    "principal": 4, "architect": 4,
    "manager": 5, "director": 5, "vp": 5, "head": 5,
    "chief": 6, "cto": 6, "ceo": 6,
}

# Education tier uses substring matching (not word-boundary) so abbreviations
# like "ph.d", "b.tech", "b.e" are detected even when surrounded by punctuation.
# Tier meanings: 4=PhD, 3=Masters/MBA, 2=Bachelors, 1=Diploma/Cert, 0=High-school, -1=nothing
EDUCATION_TIER_KEYWORDS: List[tuple] = [
    # ── PhD / Doctorate (tier 4) ───────────────────────────────────────────
    ("ph.d", 4), ("phd", 4), ("doctorate", 4), ("doctoral", 4), ("d.phil", 4),
    # ── Masters (tier 3) ──────────────────────────────────────────────────
    ("master of science", 3), ("master of technology", 3), ("master of business", 3),
    ("master of engineering", 3), ("master of arts", 3), ("master of computer", 3),
    ("master", 3), ("mba", 3), ("m.tech", 3), ("mtech", 3), ("m.sc", 3), ("msc", 3),
    ("m.e.", 3), (" me ", 3), ("m.s.", 3), (" ms ", 3), ("postgraduate", 3),
    ("post-graduate", 3), ("post graduate", 3), ("pg diploma", 3),
    # ── Bachelors (tier 2) ────────────────────────────────────────────────
    ("bachelor of technology", 2), ("bachelor of engineering", 2), ("bachelor of science", 2),
    ("bachelor of arts", 2), ("bachelor of commerce", 2), ("bachelor of computer", 2),
    ("bachelor", 2), ("b.tech", 2), ("btech", 2), ("b.e.", 2), (" be ", 2), ("b.e ", 2),
    ("b.sc", 2), ("bsc", 2), ("b.s.", 2), (" bs ", 2), ("b.a.", 2), (" ba ", 2),
    ("b.com", 2), ("bcom", 2), ("undergraduate", 2), ("ug degree", 2),
    ("engineering degree", 2), ("4-year degree", 2), ("four year degree", 2),
    # ── Diploma / Certification (tier 1) ─────────────────────────────────
    ("diploma", 1), ("certification", 1), ("certificate course", 1), ("certified", 1),
    ("associate degree", 1), ("associate's degree", 1), ("bootcamp", 1), ("boot camp", 1),
    ("professional certificate", 1), ("online course", 1), ("itil", 1), ("pmp", 1),
    ("aws certified", 1), ("google certified", 1), ("microsoft certified", 1),
    # ── High school / Below (tier 0) ─────────────────────────────────────
    ("12th grade", 0), ("12th standard", 0), ("12th pass", 0), ("class 12", 0),
    ("10th grade", 0), ("10th standard", 0), ("10th pass", 0), ("class 10", 0),
    ("high school", 0), ("secondary school", 0), ("higher secondary", 0),
    ("hsc", 0), ("ssc", 0), ("matriculation", 0), ("matric", 0), ("ged", 0),
]

EXPERIENCE_KEYWORDS = {
    "years", "year", "experience", "experienced", "senior", "junior", "mid-level",
    "entry-level", "lead", "manager", "director", "vp", "chief", "head", "principal",
    "staff", "intern", "internship", "fresher", "graduate", "professional"
}

EDUCATION_KEYWORDS = {
    "bachelor", "master", "phd", "doctorate", "degree", "diploma", "certification",
    "certified", "university", "college", "institute", "school", "bs", "ba", "ms",
    "ma", "mba", "btech", "mtech", "be", "me", "bsc", "msc", "engineering",
    "computer science", "information technology", "it", "data science", "business"
}

SCORE_WEIGHTS = {
    "skills": 0.45, "experience": 0.25, "education": 0.10,
    "title": 0.10, "keywords": 0.10,
}

# ─────────────────────────────────────────────────────────────────────────────
#  NEW: Advanced Skill Extraction — Synonym Dictionary + Reverse Map
#
#  Maps canonical skill name → list of known synonyms/aliases.
#  The reverse map (_SYNONYM_REVERSE) is auto-built at startup and used by
#  extract_skills_advanced() to resolve any alias back to its canonical form.
# ─────────────────────────────────────────────────────────────────────────────

SKILL_SYNONYMS: Dict[str, List[str]] = {
    "javascript":               ["js", "ecmascript", "es6", "es2015", "es6+"],
    "typescript":               ["ts"],
    "machine learning":         ["ml"],
    "deep learning":            ["dl"],
    "artificial intelligence":  ["ai", "artificial-intelligence"],
    "nodejs":                   ["node.js", "node", "node js"],
    "react":                    ["reactjs", "react.js"],
    "python":                   ["py"],
    "kubernetes":               ["k8s"],
    "postgresql":               ["postgres", "psql"],
    "mongodb":                  ["mongo"],
    "elasticsearch":            ["elastic", "elastic search"],
    "natural language processing": ["nlp"],
    "next.js":                  ["nextjs", "next js"],
    "vue":                      ["vuejs", "vue.js"],
    "angular":                  ["angularjs"],
    "scikit-learn":             ["sklearn"],
    "tensorflow":               ["tf"],
    "pytorch":                  ["torch"],
    "graphql":                  ["graph ql"],
    "ci/cd":                    ["cicd", "continuous integration", "continuous deployment"],
    "docker":                   ["containerization", "containers"],
    "aws":                      ["amazon web services"],
    "gcp":                      ["google cloud platform", "google cloud"],
    "azure":                    ["microsoft azure"],
}

# Auto-build reverse map: synonym → canonical skill key in SKILL_KEYWORDS
_SYNONYM_REVERSE: Dict[str, str] = {}
for _canonical, _synonyms in SKILL_SYNONYMS.items():
    for _syn in _synonyms:
        _SYNONYM_REVERSE[_syn.lower()] = _canonical


# ─────────────────────────────────────────────────────────────────────────────
#  NEW: Semantic Matching — sentence-transformers with graceful fallback
#
#  Uses all-MiniLM-L6-v2 when available; falls back to token-overlap scoring
#  if the library is not installed. This keeps the server bootable without
#  the heavy ML dependency while still benefiting when it IS installed.
# ─────────────────────────────────────────────────────────────────────────────

_semantic_model = None
_semantic_available = False

def _load_semantic_model():
    """Lazy-load sentence-transformers model once on first use."""
    global _semantic_model, _semantic_available
    if _semantic_available or _semantic_model is not None:
        return _semantic_available
    try:
        from sentence_transformers import SentenceTransformer
        from sklearn.metrics.pairwise import cosine_similarity as _cos_sim
        _semantic_model = SentenceTransformer("all-MiniLM-L6-v2")
        _semantic_available = True
        logger.info("✅ [Semantic] sentence-transformers loaded (all-MiniLM-L6-v2)")
    except ImportError:
        _semantic_available = False
        logger.warning("⚠️  [Semantic] sentence-transformers not installed — using token-overlap fallback")
    return _semantic_available


def semantic_skill_match(resume_text: str, jd_skills: List[str]) -> Dict[str, float]:
    """
    NEW: Semantic Matching
    Compute semantic similarity between the resume text and each JD skill.
    Returns {skill_name: similarity_score (0–1)}.

    • If sentence-transformers is installed: uses cosine similarity of embeddings.
    • Otherwise: falls back to token-overlap ratio (still useful for multi-word skills).
    """
    if not jd_skills:
        return {}

    if _load_semantic_model():
        try:
            from sklearn.metrics.pairwise import cosine_similarity as _cos_sim
            import numpy as np
            # Encode resume once; encode all skills in a batch
            resume_embedding  = _semantic_model.encode([resume_text[:2000]])   # cap length
            skills_embeddings = _semantic_model.encode(jd_skills)
            sims = _cos_sim(resume_embedding, skills_embeddings)[0]
            return {skill: float(round(sim, 4)) for skill, sim in zip(jd_skills, sims)}
        except Exception as e:
            logger.warning(f"[Semantic] model inference failed: {e} — using fallback")

    # Token-overlap fallback
    resume_tokens = set(re.findall(r'\b[a-z]{2,}\b', resume_text.lower()))
    scores: Dict[str, float] = {}
    for skill in jd_skills:
        skill_tokens = set(re.findall(r'\b[a-z]{2,}\b', skill.lower()))
        if not skill_tokens:
            scores[skill] = 0.0
        else:
            overlap = len(resume_tokens & skill_tokens)
            scores[skill] = min(1.0, round(overlap / len(skill_tokens), 4))
    return scores


# ─────────────────────────────────────────────────────────────────────────────
#  NEW: JD Intelligence — Must-have vs Good-to-have skill classification
#
#  Scans each line of the JD for signal words and classifies extracted skills
#  into must_have (default) and good_to_have buckets.
# ─────────────────────────────────────────────────────────────────────────────

_JD_MUST_MARKERS    = re.compile(
    r'\b(must|required|mandatory|essential|critical|necessary|need|needs|require|requires|expected)\b',
    re.IGNORECASE
)
_JD_GOOD_MARKERS    = re.compile(
    r'\b(preferred|prefer|nice\s+to\s+have|optional|bonus|advantage|advantageous|desirable|plus|ideally|beneficial|added\s+advantage)\b',
    re.IGNORECASE
)


def extract_jd_intelligence(jd_text: str) -> Dict[str, List[str]]:
    """
    NEW: JD Intelligence
    Parse the job description line-by-line and classify each detected skill as:
      • must_have     — line contains must/required/mandatory signals (or no signal → default)
      • good_to_have  — line contains preferred/nice-to-have/optional signals

    Returns:
        {
            "must_have":     ["Python", "Docker", ...],
            "good_to_have":  ["Kubernetes", "React", ...]
        }

    Falls back to treating all skills as must_have when no signal words found.
    """
    must_have: List[str]    = []
    good_to_have: List[str] = []

    for line in jd_text.split('\n'):
        line_stripped = line.strip()
        if not line_stripped:
            continue
        line_lower = line_stripped.lower()

        # Collect all skills (canonical + synonym) found in this line
        skills_in_line: List[str] = []
        for skill in SKILL_KEYWORDS:
            pattern = r'\b' + re.escape(skill) + r'\b'
            if re.search(pattern, line_lower):
                display = skill.title() if len(skill) > 3 else skill.upper()
                if display not in skills_in_line:
                    skills_in_line.append(display)
        for syn, canonical in _SYNONYM_REVERSE.items():
            if canonical in SKILL_KEYWORDS:
                pattern = r'\b' + re.escape(syn) + r'\b'
                if re.search(pattern, line_lower):
                    display = canonical.title() if len(canonical) > 3 else canonical.upper()
                    if display not in skills_in_line:
                        skills_in_line.append(display)

        if not skills_in_line:
            continue

        if _JD_GOOD_MARKERS.search(line_lower):
            good_to_have.extend(skills_in_line)
        else:
            # Default bucket — must_have (covers explicit markers + unmarked lines)
            must_have.extend(skills_in_line)

    # Deduplicate preserving order; ensure good_to_have items are not also in must_have
    seen_must: set = set()
    must_dedup: List[str] = []
    for s in must_have:
        if s not in seen_must:
            seen_must.add(s)
            must_dedup.append(s)

    good_dedup: List[str] = []
    seen_good: set = set()
    for s in good_to_have:
        if s not in seen_must and s not in seen_good:
            seen_good.add(s)
            good_dedup.append(s)

    # Fallback: if nothing was classified, extract all skills from full JD as must_have
    if not must_dedup and not good_dedup:
        jd_lower = jd_text.lower()
        for skill in SKILL_KEYWORDS:
            pattern = r'\b' + re.escape(skill) + r'\b'
            if re.search(pattern, jd_lower):
                display = skill.title() if len(skill) > 3 else skill.upper()
                if display not in must_dedup:
                    must_dedup.append(display)

    return {"must_have": must_dedup, "good_to_have": good_dedup}


# ─────────────────────────────────────────────────────────────────────────────
#  TEXT EXTRACTION
# ─────────────────────────────────────────────────────────────────────────────

def extract_text_from_pdf(file_path: str) -> str:
    try:
        reader = PdfReader(file_path)
        text = ""
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
        return text.strip()
    except Exception as e:
        logger.error(f"Error extracting PDF text: {e}")
        return ""


def extract_text_from_docx(file_path: str) -> str:
    try:
        doc = Document(file_path)
        text = "\n".join([para.text for para in doc.paragraphs])
        return text.strip()
    except Exception as e:
        logger.error(f"Error extracting DOCX text: {e}")
        return ""


# ─────────────────────────────────────────────────────────────────────────────
#  CONTACT EXTRACTION
# ─────────────────────────────────────────────────────────────────────────────

def extract_contact_info(text: str) -> Dict[str, Optional[str]]:
    result = {"name": None, "email": None, "phone": None}
    email_pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
    emails = re.findall(email_pattern, text)
    if emails:
        result["email"] = emails[0]
    phone_pattern = r'(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}'
    phones = re.findall(phone_pattern, text)
    if phones:
        result["phone"] = phones[0]
    lines = text.split('\n')
    for line in lines[:5]:
        line = line.strip()
        if line and len(line) < 50 and not re.search(r'[@\d]', line):
            words = line.split()
            if 1 <= len(words) <= 4:
                if all(word.replace('.', '').replace('-', '').isalpha() for word in words):
                    result["name"] = line
                    break
    return result


# ─────────────────────────────────────────────────────────────────────────────
#  SKILL EXTRACTION
# ─────────────────────────────────────────────────────────────────────────────

def extract_skills_nlp(text: str) -> List[str]:
    text_lower = text.lower()
    found_skills: set = set()
    for skill in SKILL_KEYWORDS:
        pattern = r'\b' + re.escape(skill) + r'\b'
        if re.search(pattern, text_lower):
            found_skills.add(skill.title() if len(skill) > 3 else skill.upper())
    doc = nlp(text)
    for ent in doc.ents:
        if ent.label_ in ["ORG", "PRODUCT"]:
            ent_lower = ent.text.lower()
            if ent_lower in SKILL_KEYWORDS:
                found_skills.add(ent.text)
    return sorted(list(found_skills))


def extract_skills_with_categories(text: str) -> Dict[str, str]:
    text_lower = text.lower()
    found: Dict[str, str] = {}
    for skill, cat in SKILL_KEYWORDS.items():
        pattern = r'\b' + re.escape(skill) + r'\b'
        if re.search(pattern, text_lower):
            display = skill.title() if len(skill) > 3 else skill.upper()
            found[display] = cat
    return found


# NEW: Advanced Skill Extraction
def extract_skills_advanced(text: str) -> List[str]:
    """
    NEW: Advanced Skill Extraction
    Extends extract_skills_nlp() by also matching skill synonyms/aliases and
    normalising them to their canonical SKILL_KEYWORDS form.

    Examples of what this catches that extract_skills_nlp() misses:
      "JS" → Javascript, "ReactJS" → React, "k8s" → Kubernetes,
      "Postgres" → Postgresql, "ML" → Machine Learning, "DL" → Deep Learning

    Output format is identical to extract_skills_nlp() — sorted display names.
    """
    text_lower = text.lower()
    found: set = set()

    # Step 1: Match canonical skills from SKILL_KEYWORDS (same as extract_skills_nlp)
    for skill in SKILL_KEYWORDS:
        pattern = r'\b' + re.escape(skill) + r'\b'
        if re.search(pattern, text_lower):
            found.add(skill)

    # Step 2: Match synonyms → resolve to canonical skill key
    for syn, canonical in _SYNONYM_REVERSE.items():
        if canonical in SKILL_KEYWORDS:
            pattern = r'\b' + re.escape(syn) + r'\b'
            if re.search(pattern, text_lower):
                found.add(canonical)

    # Step 3: spaCy NER pass (same as extract_skills_nlp)
    doc = nlp(text)
    for ent in doc.ents:
        if ent.label_ in ["ORG", "PRODUCT"]:
            ent_lower = ent.text.lower()
            if ent_lower in SKILL_KEYWORDS:
                found.add(ent_lower)
            elif ent_lower in _SYNONYM_REVERSE and _SYNONYM_REVERSE[ent_lower] in SKILL_KEYWORDS:
                found.add(_SYNONYM_REVERSE[ent_lower])

    # Normalize to display format (same as extract_skills_nlp)
    return sorted([s.title() if len(s) > 3 else s.upper() for s in found])


def extract_experience_keywords(text: str) -> List[str]:
    text_lower = text.lower()
    found_keywords: set = set()
    for keyword in EXPERIENCE_KEYWORDS:
        if keyword in text_lower:
            found_keywords.add(keyword.title())
    years_pattern = r'(\d+)\+?\s*(?:years?|yrs?)\s*(?:of)?\s*(?:experience)?'
    matches = re.findall(years_pattern, text_lower)
    for match in matches:
        found_keywords.add(f"{match}+ Years")
    return sorted(list(found_keywords))


def extract_education_keywords(text: str) -> List[str]:
    text_lower = text.lower()
    found_keywords: set = set()
    for keyword in EDUCATION_KEYWORDS:
        pattern = r'\b' + re.escape(keyword) + r'\b'
        if re.search(pattern, text_lower):
            found_keywords.add(keyword.title())
    return sorted(list(found_keywords))


def extract_required_skills_from_jd(job_description: str) -> List[str]:
    return extract_skills_advanced(job_description)  # NEW: Advanced Skill Extraction


# ─────────────────────────────────────────────────────────────────────────────
#  HELPER FUNCTIONS
# ─────────────────────────────────────────────────────────────────────────────

_MONTH_MAP: Dict[str, int] = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
    "january": 1, "february": 2, "march": 3, "april": 4, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
}


def _extract_experience_smart(text: str) -> Dict:
    """
    Multi-strategy experience extractor.
    Returns dict: years (int), method (str), confidence (str), signals (list).

    Strategy priority (highest wins):
      1. Explicit "N years" mention           → confidence: high
      2. Date-range pairs (YYYY-YYYY / Mon YYYY - Mon YYYY) → high
      3. Year-span (earliest to latest year found)          → medium
      4. Graduation year → today heuristic                  → low
      5. Seniority title keyword heuristic                  → low
      6. Nothing detected                                    → 0 / none
    """
    from datetime import datetime
    now = datetime.now()
    text_lower = text.lower()
    padded = " " + text_lower + " "   # pad so substring checks don't need \b
    signals: List[str] = []

    # ── Strategy 1: Explicit "N years" ──────────────────────────────────
    explicit_patterns = [
        r'(\d+)\+?\s*(?:years?|yrs?)\s*(?:of\s+)?(?:experience|exp|work)',
        r'(?:over|more than|approximately|about|around|nearly)\s+(\d+)\s*(?:years?|yrs?)',
        r'experience\s+(?:of\s+)?(\d+)\+?\s*(?:years?|yrs?)',
        r'(\d+)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:professional|industry|work|relevant)',
        r'(\d+)\+?\s*(?:years?|yrs?)\s+experience',
    ]
    explicit_years: List[int] = []
    for pat in explicit_patterns:
        for m in re.finditer(pat, text_lower):
            explicit_years.append(int(m.group(1)))
            signals.append(f"explicit: {m.group(0).strip()}")
    if explicit_years:
        return {"years": max(explicit_years), "method": "explicit",
                "confidence": "high", "signals": signals}

    # ── Strategy 2: Date range pairs ────────────────────────────────────
    ranges: List[tuple] = []

    # YYYY – YYYY  or  YYYY-YYYY
    for m in re.finditer(
        r'\b((?:19|20)\d{2})\s*[-–—to]+\s*((?:19|20)\d{2}|present|now|current|till\s*date|till\s*now)\b',
        text_lower
    ):
        sy = int(m.group(1))
        ey_raw = m.group(2).strip()
        ey = now.year if re.search(r'present|now|current|till', ey_raw) else int(ey_raw)
        if 1970 <= sy <= now.year and sy <= ey <= now.year + 1:
            ranges.append((sy * 12 + 1, ey * 12 + 12))
            signals.append(f"year_range: {sy}–{ey}")

    # Month YYYY – Month YYYY  |  Month YYYY – Present
    month_names = '|'.join(_MONTH_MAP.keys())
    for m in re.finditer(
        rf'({month_names})\.?\s*((?:19|20)\d{{2}})\s*[-–—to]+\s*'
        rf'(?:({month_names})\.?\s*((?:19|20)\d{{2}})|present|now|current|till\s*date)',
        text_lower
    ):
        sm = _MONTH_MAP[m.group(1)]
        sy = int(m.group(2))
        if m.group(3):
            em = _MONTH_MAP[m.group(3)]
            ey = int(m.group(4))
        else:
            em = now.month
            ey = now.year
        if 1970 <= sy <= now.year and sy * 12 + sm <= ey * 12 + em:
            ranges.append((sy * 12 + sm, ey * 12 + em))
            signals.append(f"month_range: {m.group(0).strip()}")

    if ranges:
        ranges.sort()
        merged: List[list] = []
        for s, e in ranges:
            if merged and s <= merged[-1][1]:
                merged[-1][1] = max(merged[-1][1], e)
            else:
                merged.append([s, e])
        total_months = sum(e - s for s, e in merged)
        years = max(1, round(total_months / 12))
        return {"years": years, "months": total_months, "method": "date_ranges",
                "confidence": "high", "signals": signals}

    # ── Strategy 3: Year-span heuristic (multiple years found in text) ──
    all_years = [int(y) for y in re.findall(r'\b((?:19|20)\d{2})\b', text_lower)
                 if 1985 <= int(y) <= now.year]
    if len(all_years) >= 2:
        span = max(all_years) - min(all_years)
        if span >= 1:
            signals.append(f"year_span: {min(all_years)}–{max(all_years)}")
            return {"years": span, "method": "year_span",
                    "confidence": "medium", "signals": signals}

    # ── Strategy 4: Graduation year → today ─────────────────────────────
    grad_match = re.search(
        r'(?:b\.?tech|b\.?e\.?|b\.?sc?|m\.?tech|mba|bachelor|master|degree|'
        r'graduated|graduation|batch|class\s+of|passed\s+out|'
        r'engineering|computer\s+science)\D{0,20}((?:19|20)\d{2})',
        text_lower
    )
    if grad_match:
        grad_year = int(grad_match.group(1))
        if 1990 <= grad_year <= now.year:
            approx = max(0, now.year - grad_year - 1)
            signals.append(f"graduation_year: {grad_year}")
            return {"years": approx, "method": "graduation_year",
                    "confidence": "low", "signals": signals}

    # ── Strategy 5: Seniority title heuristic ───────────────────────────
    seniority_exp = [
        (r'\b(?:chief\s+technology|cto|ceo|chief\s+executive)\b', 15),
        (r'\b(?:vice\s+president|vp\s+of|svp|evp)\b', 12),
        (r'\b(?:director|head\s+of\s+engineering|engineering\s+director)\b', 10),
        (r'\b(?:principal\s+engineer|staff\s+engineer|engineering\s+manager)\b', 8),
        (r'\b(?:senior|sr\.?)\s+(?:software|developer|engineer|architect)\b', 5),
        (r'\b(?:tech\s+lead|technical\s+lead|team\s+lead)\b', 4),
        (r'\b(?:mid[\-\s]level|associate\s+engineer)\b', 2),
        (r'\b(?:junior|jr\.?|entry[\-\s]level|fresher|trainee|intern)\b', 0),
    ]
    for pat, est_years in seniority_exp:
        if re.search(pat, text_lower):
            signals.append(f"seniority: {pat} → ~{est_years}yr")
            return {"years": est_years, "method": "seniority_title",
                    "confidence": "low", "signals": signals}

    return {"years": 0, "method": "not_detected", "confidence": "none", "signals": []}


def _extract_max_years(text: str) -> int:
    """Legacy wrapper — returns integer years for backward compatibility."""
    return _extract_experience_smart(text)["years"]


def _extract_required_years(jd_text: str) -> int:
    """Extract the minimum years required from a JD. Returns 0 if not specified."""
    text_lower = jd_text.lower()
    # Prefer explicit requirement phrases
    explicit = re.findall(
        r'(?:minimum|at\s+least|minimum\s+of|requires?|need|must\s+have)[\s\w]{0,10}?'
        r'(\d+)\+?\s*(?:years?|yrs?)\s*(?:of\s+)?(?:experience|exp)',
        text_lower
    )
    if explicit:
        return int(explicit[0])
    # Fall back to any years mention in the JD
    all_years = re.findall(r'(\d+)\+?\s*(?:years?|yrs?)', text_lower)
    return max((int(y) for y in all_years), default=0)


def _detect_seniority(text: str) -> int:
    text_lower = text.lower()
    best = -1
    for kw, tier in SENIORITY_TIERS.items():
        pattern = r'\b' + re.escape(kw) + r'\b'
        if re.search(pattern, text_lower):
            best = max(best, tier)
    return max(best, 0)


def _detect_education_tier(text: str) -> int:
    """
    Returns the highest education tier found in text.
    Uses substring matching (not word-boundary) so abbreviations
    like 'ph.d', 'b.tech', 'b.e.' are reliably detected.
    Returns -1 if nothing at all was found.
    """
    padded = " " + text.lower() + " "   # pad so prefix/suffix don't block matches
    best = -1
    for kw, tier in EDUCATION_TIER_KEYWORDS:
        if kw in padded:
            best = max(best, tier)
    return best


# ─────────────────────────────────────────────────────────────────────────────
#  CORE ATS SCORING
#
#  FIX: experience_score, education_score, title_score now return None when
#  the JD has no requirement for that dimension, instead of a fake 80.0.
#  The composite score excludes None dimensions and redistributes their weight
#  to skills + keywords so the final score is still meaningful.
# ─────────────────────────────────────────────────────────────────────────────

def calculate_ats_score(
    resume_skills: List[str],
    jd_skills: List[str],
    resume_text: str = "",
    jd_text: str = "",
    job_title: str = "",
) -> tuple:
    if not jd_skills and not jd_text:
        return 0.0, [], [], {}

    resume_lower = resume_text.lower()
    jd_lower = (jd_text + " " + " ".join(jd_skills)).lower()

    jd_skill_cats: Dict[str, str] = {}
    resume_skill_cats: Dict[str, str] = {}

    for sk in jd_skills:
        sk_lower = sk.lower()
        cat = SKILL_KEYWORDS.get(sk_lower, "tools")
        jd_skill_cats[sk_lower] = cat

    for sk in resume_skills:
        sk_lower = sk.lower()
        cat = SKILL_KEYWORDS.get(sk_lower, "tools")
        resume_skill_cats[sk_lower] = cat

    jd_set = set(jd_skill_cats.keys())
    resume_set = set(resume_skill_cats.keys())

    matched_raw = jd_set & resume_set
    missing_raw = jd_set - resume_set

    jd_total_weight = sum(CATEGORY_WEIGHTS.get(jd_skill_cats[sk], 1.0) for sk in jd_set)
    matched_weight = sum(CATEGORY_WEIGHTS.get(jd_skill_cats[sk], 1.0) for sk in matched_raw)

    partial_credit = 0.0
    for sk in missing_raw:
        variants = [sk, sk.replace(".", ""), sk.replace("-", ""), sk.replace(" ", "")]
        for v in variants:
            if v and re.search(r'\b' + re.escape(v) + r'\b', resume_lower):
                partial_credit += CATEGORY_WEIGHTS.get(jd_skill_cats.get(sk, "tools"), 1.0) * 0.5
                break

    # NEW: Semantic Matching — add semantic bonus for skills not directly matched
    # but semantically similar to resume content (similarity > 0.5 threshold).
    # Capped so it can never exceed what a full direct match would give.
    semantic_bonus = 0.0
    still_missing_after_partial = {
        sk for sk in missing_raw
        if not any(
            re.search(r'\b' + re.escape(v) + r'\b', resume_lower)
            for v in [sk, sk.replace(".", ""), sk.replace("-", ""), sk.replace(" ", "")]
            if v
        )
    }
    if still_missing_after_partial and jd_total_weight > 0:
        missing_display_list = [sk.title() if len(sk) > 3 else sk.upper()
                                 for sk in still_missing_after_partial]
        sem_scores = semantic_skill_match(resume_text, missing_display_list)
        for sk, disp in zip(still_missing_after_partial, missing_display_list):
            sim = sem_scores.get(disp, 0.0)
            if sim > 0.5:
                # Give proportional partial credit scaled by similarity (max 0.4 weight)
                weight = CATEGORY_WEIGHTS.get(jd_skill_cats.get(sk, "tools"), 1.0)
                semantic_bonus += weight * (sim - 0.5) * 0.8   # up to 0.4 * weight

    skill_score_raw = (matched_weight + partial_credit + semantic_bonus) / max(jd_total_weight, 1)
    skill_score = min(skill_score_raw * 100, 100.0)

    # NEW: JD Intelligence — weight must-have skills at 70%, good-to-have at 30%
    # Only applied when the JD has classifiable signal words; otherwise uses existing logic.
    jd_intel = extract_jd_intelligence(jd_text) if jd_text else {"must_have": [], "good_to_have": []}
    has_jd_classification = bool(jd_intel["must_have"] or jd_intel["good_to_have"])

    if has_jd_classification and (jd_intel["must_have"] or jd_intel["good_to_have"]):
        must_lower  = {s.lower() for s in jd_intel["must_have"]}
        good_lower  = {s.lower() for s in jd_intel["good_to_have"]}

        must_matched = sum(
            CATEGORY_WEIGHTS.get(jd_skill_cats.get(sk, "tools"), 1.0)
            for sk in matched_raw if sk in must_lower
        )
        good_matched = sum(
            CATEGORY_WEIGHTS.get(jd_skill_cats.get(sk, "tools"), 1.0)
            for sk in matched_raw if sk in good_lower
        )
        must_total = sum(
            CATEGORY_WEIGHTS.get(jd_skill_cats.get(sk, "tools"), 1.0)
            for sk in jd_set if sk in must_lower
        )
        good_total = sum(
            CATEGORY_WEIGHTS.get(jd_skill_cats.get(sk, "tools"), 1.0)
            for sk in jd_set if sk in good_lower
        )

        # Weighted blend: 70% must-have + 30% good-to-have
        must_score = (must_matched / max(must_total, 1)) * 100 if must_total > 0 else skill_score
        good_score = (good_matched / max(good_total, 1)) * 100 if good_total > 0 else skill_score
        jd_intel_score = must_score * 0.70 + good_score * 0.30

        # Blend with base skill_score (60/40) so existing logic isn't discarded
        skill_score = min(skill_score * 0.40 + jd_intel_score * 0.60, 100.0)

    # ── Experience score ─────────────────────────────────────────────────
    # Always try to detect resume years using multi-strategy extractor.
    # Score is only computed (non-None) when the JD has an explicit requirement
    # OR when the resume itself states years — so the bar always reflects reality.
    required_years = _extract_required_years(jd_lower)
    exp_result     = _extract_experience_smart(resume_lower)
    resume_years   = exp_result["years"]
    exp_confidence = exp_result["confidence"]   # "high" | "medium" | "low" | "none"
    jd_has_exp_req = required_years > 0

    if jd_has_exp_req:
        # JD stated a requirement — score against it
        if resume_years == 0 and exp_confidence == "none":
            exp_score: Optional[float] = 35.0   # no evidence of any experience
        elif resume_years == 0:
            exp_score = 45.0                     # detected via heuristic but years unclear
        else:
            ratio = resume_years / required_years
            if ratio >= 1.0:
                exp_score = min(100.0, 80.0 + (ratio - 1.0) * 10)
            else:
                exp_score = ratio * 80.0
        exp_score = round(exp_score, 1)
    elif resume_years > 0:
        # JD has no requirement but resume shows real experience — show it meaningfully
        # Map years → a descriptive score (not penalised, just informational)
        if resume_years >= 10:
            exp_score = 95.0
        elif resume_years >= 7:
            exp_score = 85.0
        elif resume_years >= 5:
            exp_score = 75.0
        elif resume_years >= 3:
            exp_score = 65.0
        elif resume_years >= 1:
            exp_score = 50.0
        else:
            exp_score = 35.0
        exp_score = round(exp_score, 1)
    else:
        # JD has no requirement AND resume shows no detectable experience
        exp_score = None

    # ── Education score ──────────────────────────────────────────────────
    # Education is ALWAYS shown when the resume mentions any education keyword
    # because every candidate has some level of education.
    # Score is compared against JD requirement when present, otherwise shown
    # as an absolute tier score so it's never a fake "80".
    jd_edu_tier     = _detect_education_tier(jd_lower)
    resume_edu_tier = _detect_education_tier(resume_lower)
    jd_has_edu_req  = jd_edu_tier > 0      # JD explicitly mentioned an edu requirement

    if resume_edu_tier < 0:
        # Truly no education detected in the resume at all
        if jd_has_edu_req:
            edu_score: Optional[float] = 20.0   # requirement present, nothing found
        else:
            edu_score = None                     # nothing on either side — skip
    elif jd_has_edu_req:
        # JD has a requirement — compare directly
        if resume_edu_tier >= jd_edu_tier:
            edu_score = 100.0
        else:
            edu_score = round((resume_edu_tier / jd_edu_tier) * 80.0, 1)
    else:
        # JD has NO requirement but resume has education — show absolute tier score
        # Tier 4 (PhD)=100, 3 (Masters)=85, 2 (Bachelors)=70, 1 (Diploma)=50, 0=30
        tier_to_score = {4: 100.0, 3: 85.0, 2: 70.0, 1: 50.0, 0: 30.0}
        edu_score = tier_to_score.get(resume_edu_tier, 50.0)

    # ── Seniority / title score: only compute when JD specifies seniority ──
    jd_seniority = _detect_seniority((job_title + " " + jd_lower))
    resume_seniority = _detect_seniority(resume_lower)
    jd_has_seniority = jd_seniority > 0

    if jd_has_seniority:
        diff = resume_seniority - jd_seniority
        if diff == 0:
            title_score: Optional[float] = 100.0
        elif diff > 0:
            title_score = max(70.0, 100.0 - diff * 8)
        else:
            title_score = max(0.0, 100.0 + diff * 20)
        title_score = round(title_score, 1)
    else:
        # No seniority requirement detectable in JD
        title_score = None

    # ── Keyword score (always computed) ──
    jd_words = set(re.findall(r'\b[a-z]{3,}\b', jd_lower))
    stop_words = {
        "the", "and", "for", "are", "with", "this", "that", "will", "have",
        "from", "they", "been", "has", "had", "not", "but", "you", "your",
        "our", "their", "its", "who", "what", "when", "where", "how", "all",
        "any", "can", "was", "were", "also", "into", "over", "than", "then",
        "each", "both", "more", "work", "able", "well", "good", "strong",
        "must", "should", "would", "could", "may", "use", "using", "used",
    }
    meaningful_jd_words = jd_words - stop_words
    if meaningful_jd_words:
        present_count = sum(
            1 for w in meaningful_jd_words
            if re.search(r'\b' + re.escape(w) + r'\b', resume_lower)
        )
        keyword_score = round((present_count / len(meaningful_jd_words)) * 100, 1)
    else:
        keyword_score = 60.0

    # ── Composite score ──
    # Only include dimensions that have real values (not None).
    # Redistribute freed weight proportionally to skills + keywords.
    active_weights = {"skills": 0.45, "keywords": 0.10}
    active_scores  = {"skills": skill_score, "keywords": keyword_score}
    freed_weight   = 0.0

    if exp_score is not None:
        active_weights["experience"] = 0.25
        active_scores["experience"]  = exp_score
    else:
        freed_weight += 0.25

    if edu_score is not None:
        active_weights["education"] = 0.10
        active_scores["education"]  = edu_score
    else:
        freed_weight += 0.10

    if title_score is not None:
        active_weights["title"] = 0.10
        active_scores["title"]  = title_score
    else:
        freed_weight += 0.10

    # Redistribute freed weight proportionally between skills and keywords
    if freed_weight > 0:
        base = active_weights["skills"] + active_weights["keywords"]
        active_weights["skills"]   += freed_weight * (active_weights["skills"]   / base)
        active_weights["keywords"] += freed_weight * (active_weights["keywords"] / base)

    composite = sum(active_scores[k] * active_weights[k] for k in active_scores)

    if skill_score < 20:
        composite = min(composite, 35.0)

    final_score = round(min(composite, 100.0), 1)

    def _display(sk: str) -> str:
        return sk.title() if len(sk) > 3 else sk.upper()

    matched_display = sorted([_display(sk) for sk in matched_raw])
    missing_display = sorted([_display(sk) for sk in missing_raw])

    score_breakdown = {
        "skills_score":      round(skill_score, 1),
        "experience_score":  exp_score,       # None only when no exp detected anywhere
        "education_score":   edu_score,       # None only when nothing on either side
        "title_score":       title_score,     # None when no seniority in JD
        "keyword_score":     round(keyword_score, 1),
        "required_years":    required_years,
        "resume_years":      resume_years,
        "exp_detection_method":  exp_result.get("method", "not_detected"),
        "exp_confidence":        exp_confidence,
        "resume_edu_tier":   resume_edu_tier,
        "jd_edu_tier":       jd_edu_tier,
        "jd_seniority":      jd_seniority,
        "resume_seniority":  resume_seniority,
        # Flags for frontend to know which dimensions are real
        "jd_has_exp_req":    jd_has_exp_req,
        "jd_has_edu_req":    jd_has_edu_req,
        "jd_has_seniority":  jd_has_seniority,
        # NEW: JD Intelligence classification
        "jd_must_have":      jd_intel.get("must_have", []),
        "jd_good_to_have":   jd_intel.get("good_to_have", []),
        "jd_intel_active":   has_jd_classification,
    }

    return final_score, matched_display, missing_display, score_breakdown


# ─────────────────────────────────────────────────────────────────────────────
#  ★ RESUME STRENGTH ANALYSIS
# ─────────────────────────────────────────────────────────────────────────────

def analyze_resume_strengths(
    resume_text: str,
    resume_skills: List[str],
    matched_skills: List[str],
    score_breakdown: Dict,
    ats_score: float,
) -> Dict:
    strengths = []
    category_scores = {}

    tech_skills = [s for s in resume_skills
                   if SKILL_KEYWORDS.get(s.lower(), "") in ("lang", "web", "db", "cloud", "ai", "mobile", "sec", "test")]
    tech_score = min(100, len(tech_skills) * 8)
    category_scores["Technical Depth"] = round(tech_score)
    if tech_score >= 70:
        strengths.append(f"Strong technical portfolio with {len(tech_skills)} technical skills across multiple domains.")
    elif tech_score >= 40:
        strengths.append(f"Solid technical foundation with {len(tech_skills)} core technical skills.")

    cats_present = set(SKILL_KEYWORDS.get(s.lower(), "") for s in resume_skills if SKILL_KEYWORDS.get(s.lower()))
    diversity_score = min(100, len(cats_present) * 14)
    category_scores["Skill Diversity"] = round(diversity_score)
    if diversity_score >= 70:
        strengths.append(f"Excellent skill diversity spanning {len(cats_present)} different technology domains.")
    elif diversity_score >= 40:
        strengths.append(f"Good range of skills covering {len(cats_present)} technology areas.")

    resume_years = _extract_max_years(resume_text.lower())
    exp_score = min(100, resume_years * 12)
    category_scores["Experience"] = round(exp_score)
    if resume_years >= 5:
        strengths.append(f"Strong experience level with {resume_years}+ years of professional background.")
    elif resume_years >= 2:
        strengths.append(f"Solid experience with {resume_years}+ years in the field.")
    elif resume_years >= 1:
        strengths.append(f"Growing professional with {resume_years}+ year(s) of experience.")

    edu_tier = _detect_education_tier(resume_text.lower())
    edu_score = edu_tier * 25
    category_scores["Education"] = round(edu_score)
    if edu_tier >= 3:
        strengths.append("Advanced academic qualification (Master's/PhD) that exceeds most job requirements.")
    elif edu_tier == 2:
        strengths.append("Bachelor's degree meets the standard requirement for most positions.")
    elif edu_tier >= 1:
        strengths.append("Holds a diploma or certification demonstrating commitment to formal learning.")

    kw_score = score_breakdown.get("keyword_score", 0) or 0
    category_scores["ATS Keywords"] = round(kw_score)
    if kw_score >= 70:
        strengths.append("Resume is well-optimised with strong ATS keyword coverage.")
    elif kw_score >= 50:
        strengths.append("Moderate ATS keyword alignment — resume passes basic ATS filters.")

    match_score = score_breakdown.get("skills_score", 0) or 0
    category_scores["Role Match"] = round(match_score)
    if match_score >= 80:
        strengths.append(f"Exceptional role match with {len(matched_skills)} matched skills for the target position.")
    elif match_score >= 60:
        strengths.append(f"Strong role alignment with {len(matched_skills)} relevant skills matching the job requirements.")

    soft_skills = [s for s in resume_skills if SKILL_KEYWORDS.get(s.lower(), "") == "soft"]
    soft_score = min(100, len(soft_skills) * 20)
    category_scores["Soft Skills"] = round(soft_score)
    if soft_skills:
        strengths.append(f"Soft skills present: {', '.join(soft_skills[:4])} — shows well-rounded profile.")

    raw_strength = (
        category_scores.get("Technical Depth", 0) * 0.25 +
        category_scores.get("Skill Diversity", 0) * 0.15 +
        category_scores.get("Experience", 0) * 0.20 +
        category_scores.get("Education", 0) * 0.10 +
        category_scores.get("ATS Keywords", 0) * 0.10 +
        category_scores.get("Role Match", 0) * 0.15 +
        category_scores.get("Soft Skills", 0) * 0.05
    )

    strength_label = (
        "Exceptional" if raw_strength >= 80 else
        "Strong" if raw_strength >= 65 else
        "Moderate" if raw_strength >= 45 else
        "Needs Work"
    )

    return {
        "strength_score": round(raw_strength, 1),
        "strength_label": strength_label,
        "strengths": strengths if strengths else ["Resume shows basic qualifications for the role."],
        "category_scores": category_scores,
    }


# ─────────────────────────────────────────────────────────────────────────────
#  ★ RESUME WEAKNESS DETECTION
# ─────────────────────────────────────────────────────────────────────────────

def detect_resume_weaknesses(
    resume_text: str,
    resume_skills: List[str],
    missing_skills: List[str],
    score_breakdown: Dict,
    ats_score: float,
    job_title: str = "",
) -> Dict:
    weaknesses = []
    red_flags = []
    improvement_areas = []

    critical_missing = [s for s in missing_skills
                        if SKILL_KEYWORDS.get(s.lower(), "") in ("lang", "web", "cloud", "ai", "db")]
    if len(critical_missing) >= 5:
        red_flags.append(f"Major technical skill gaps: missing {len(critical_missing)} critical skills including {', '.join(critical_missing[:4])}.")
        improvement_areas.append("Upskill in: " + ", ".join(critical_missing[:5]))
    elif len(critical_missing) >= 2:
        weaknesses.append(f"Skill gaps in {len(critical_missing)} key technical areas: {', '.join(critical_missing[:3])}.")
        improvement_areas.append("Consider learning: " + ", ".join(critical_missing[:3]))

    # Only flag experience shortfall when meaningful
    exp_score  = score_breakdown.get("experience_score")
    req_years  = score_breakdown.get("required_years", 0)
    res_years  = score_breakdown.get("resume_years", 0)
    exp_conf   = score_breakdown.get("exp_confidence", "none")
    exp_method = score_breakdown.get("exp_detection_method", "not_detected")

    if exp_score is not None:
        if exp_score < 40 and req_years > 0:
            red_flags.append(
                f"Significant experience gap: role requires {req_years}+ years, "
                f"resume shows ~{res_years} year(s){' (estimated)' if exp_conf == 'low' else ''}."
            )
        elif exp_score < 65 and req_years > 0 and res_years < req_years:
            weaknesses.append(f"Experience below requirement: {res_years} year(s) vs {req_years}+ required.")
    elif exp_conf == "none" and req_years == 0:
        # No experience info anywhere — flag it
        weaknesses.append("No experience information detected in the resume. Add employment dates or years of experience.")

    kw_score = score_breakdown.get("keyword_score", 60) or 60
    if kw_score < 35:
        red_flags.append("Very low ATS keyword coverage — resume likely rejected by automated filters before human review.")
        improvement_areas.append("Tailor resume language to closely match job description terminology.")
    elif kw_score < 55:
        weaknesses.append("Below-average ATS keyword alignment — may struggle to pass automated screening.")
        improvement_areas.append("Incorporate more job-description keywords naturally into resume.")

    if len(resume_skills) < 5:
        red_flags.append(f"Very few skills detected ({len(resume_skills)}). Resume may be too vague or missing a skills section.")
        improvement_areas.append("Add a dedicated 'Skills' or 'Technical Proficiencies' section listing tools and technologies.")
    elif len(resume_skills) < 10:
        weaknesses.append(f"Limited skill visibility ({len(resume_skills)} skills extracted). More explicit skill listing recommended.")

    # Education weakness — use tier comparison, not arbitrary score threshold
    edu_score   = score_breakdown.get("education_score")
    resume_tier = score_breakdown.get("resume_edu_tier", -1)
    jd_tier     = score_breakdown.get("jd_edu_tier", 0)

    if edu_score is not None:
        if resume_tier < 0:
            weaknesses.append("No education qualification detected in the resume. Add your degree/certification clearly.")
            improvement_areas.append("Add an 'Education' section listing your degree, institution, and graduation year.")
        elif jd_tier > 0 and resume_tier < jd_tier:
            edu_labels = {4: "PhD", 3: "Master's/MBA", 2: "Bachelor's", 1: "Diploma/Cert"}
            weaknesses.append(
                f"Education ({edu_labels.get(resume_tier, 'below requirement')}) is below "
                f"the role requirement ({edu_labels.get(jd_tier, 'higher degree')})."
            )
            improvement_areas.append("Highlight certifications, courses, or bootcamps to compensate for formal education gaps.")

    # Only flag seniority mismatch when JD has a seniority requirement
    title_score = score_breakdown.get("title_score")
    jd_sen = score_breakdown.get("jd_seniority", 0)
    res_sen = score_breakdown.get("resume_seniority", 0)
    seniority_map = {0: "Entry", 1: "Junior", 2: "Mid-level", 3: "Senior", 4: "Principal", 5: "Manager", 6: "C-Suite"}
    if title_score is not None and title_score < 50 and jd_sen > 0 and res_sen < jd_sen:
        weaknesses.append(
            f"Seniority mismatch: candidate appears {seniority_map.get(res_sen, 'unknown')} level "
            f"for a {seniority_map.get(jd_sen, 'higher')} level role."
        )

    achievement_patterns = [r'\d+%', r'\$\d+', r'increased', r'reduced', r'improved', r'delivered', r'led \d+', r'managed \d+']
    has_achievements = any(re.search(p, resume_text.lower()) for p in achievement_patterns)
    if not has_achievements:
        weaknesses.append("No quantifiable achievements detected. Adding metrics (%, $, numbers) greatly strengthens impact.")
        improvement_areas.append("Add measurable results: 'Increased efficiency by 30%', 'Led team of 5', etc.")

    contact = extract_contact_info(resume_text)
    if not contact.get("email"):
        red_flags.append("No email address detected — critical contact information missing.")
    if not contact.get("phone"):
        weaknesses.append("Phone number not detected. Ensure contact details are clearly visible.")

    weakness_count = len(weaknesses) + len(red_flags) * 2
    weakness_score = max(0, 100 - weakness_count * 12)
    severity = (
        "Critical" if len(red_flags) >= 3 else
        "High" if len(red_flags) >= 1 else
        "Medium" if len(weaknesses) >= 3 else
        "Low"
    )

    return {
        "weakness_score": round(weakness_score),
        "severity": severity,
        "red_flags": red_flags,
        "weaknesses": weaknesses,
        "improvement_areas": improvement_areas,
        "total_issues": len(weaknesses) + len(red_flags),
    }


# ─────────────────────────────────────────────────────────────────────────────
#  ★ ATS RESUME SUGGESTIONS
# ─────────────────────────────────────────────────────────────────────────────

def generate_ats_suggestions(
    resume_text: str,
    resume_skills: List[str],
    missing_skills: List[str],
    matched_skills: List[str],
    score_breakdown: Dict,
    ats_score: float,
    job_title: str = "",
    jd_skills: List[str] = None,
) -> List[Dict]:
    suggestions = []
    jd_skills = jd_skills or []

    critical_missing = [s for s in missing_skills
                        if SKILL_KEYWORDS.get(s.lower(), "") in ("lang", "web", "cloud", "ai", "db")]
    if critical_missing:
        suggestions.append({
            "priority": "High",
            "category": "Skills",
            "title": "Add Missing Critical Skills",
            "detail": (
                f"The following {len(critical_missing)} critical skills from the job requirements are not visible in your resume: "
                f"{', '.join(critical_missing[:6])}. "
                "If you have experience with these, add them explicitly to a Skills section."
            ),
            "impact": f"+{min(25, len(critical_missing) * 4)}% ATS score potential",
        })

    kw_score = score_breakdown.get("keyword_score", 60) or 60
    if kw_score < 55:
        suggestions.append({
            "priority": "High",
            "category": "Keywords",
            "title": "Improve Keyword Alignment with Job Description",
            "detail": (
                "Your resume language does not closely mirror the job description. "
                "ATS systems rank resumes higher when they use the exact same terminology as the JD. "
                "Review the JD carefully and incorporate key phrases naturally into your experience bullets."
            ),
            "impact": f"+{round((55 - kw_score) / 3)}% ATS score potential",
        })
    elif kw_score < 70:
        suggestions.append({
            "priority": "Medium",
            "category": "Keywords",
            "title": "Fine-tune Keyword Coverage",
            "detail": (
                "Your keyword alignment is moderate. Review the job description for industry-specific terminology "
                "and ensure these terms appear naturally in your work experience descriptions."
            ),
            "impact": "+5-10% ATS score potential",
        })

    if len(resume_skills) < 10:
        suggestions.append({
            "priority": "High",
            "category": "Structure",
            "title": "Expand Your Skills Section",
            "detail": (
                f"Only {len(resume_skills)} skills were detected. Add a dedicated 'Technical Skills' or "
                "'Core Competencies' section listing all relevant tools, technologies, frameworks, and methodologies. "
                "This is one of the first sections ATS systems parse."
            ),
            "impact": "+15-20% skill match score",
        })

    achievement_patterns = [r'\d+%', r'\$\d+', r'increased', r'reduced', r'improved']
    has_achievements = any(re.search(p, resume_text.lower()) for p in achievement_patterns)
    if not has_achievements:
        suggestions.append({
            "priority": "Medium",
            "category": "Impact",
            "title": "Quantify Your Achievements",
            "detail": (
                "No measurable results were detected in your resume. "
                "Replace vague descriptions with quantified impact: "
                "'Optimised database queries reducing load time by 40%', 'Delivered project 2 weeks ahead of schedule', "
                "'Managed team of 6 engineers'. Numbers dramatically improve recruiter and ATS engagement."
            ),
            "impact": "Significantly improves human reviewer pass rate",
        })

    # Experience suggestions
    exp_score  = score_breakdown.get("experience_score")
    res_years  = score_breakdown.get("resume_years", 0)
    req_years  = score_breakdown.get("required_years", 0)
    exp_conf   = score_breakdown.get("exp_confidence", "none")
    exp_method = score_breakdown.get("exp_detection_method", "not_detected")

    if res_years == 0 and exp_conf == "none":
        suggestions.append({
            "priority": "High",
            "category": "Experience",
            "title": "Add Clear Employment Dates or Years of Experience",
            "detail": (
                "No experience information was detected in your resume. "
                "ATS systems scan for employment date ranges (e.g. 'Jan 2020 – Present') "
                "or explicit years ('5+ years of experience'). "
                "Add both to your professional summary and each job entry."
            ),
            "impact": "+10-20% experience score",
        })
    elif exp_conf in ("low", "medium") and exp_method != "explicit":
        suggestions.append({
            "priority": "Medium",
            "category": "Experience",
            "title": "Make Your Experience Duration Explicit",
            "detail": (
                f"Your experience was estimated (~{res_years} year(s)) via {exp_method.replace('_',' ')}, "
                "not from a direct statement. "
                "Add a line in your summary like '5+ years of software development experience' "
                "and ensure every job entry has clear start/end dates (MM/YYYY format)."
            ),
            "impact": "Improves ATS confidence in experience parsing",
        })
    elif exp_score is not None and req_years > 0 and res_years < req_years:
        suggestions.append({
            "priority": "Medium",
            "category": "Experience",
            "title": "Bridge the Experience Gap",
            "detail": (
                f"The role requires {req_years}+ years; your resume shows ~{res_years} year(s). "
                "Emphasise quality and impact over quantity. "
                "Include freelance, open-source, internship, or project-based work to supplement formal employment."
            ),
            "impact": "Improves overall candidacy narrative",
        })

    contact = extract_contact_info(resume_text)
    missing_contact = []
    if not contact.get("email"):
        missing_contact.append("email")
    if not contact.get("phone"):
        missing_contact.append("phone number")
    if missing_contact:
        suggestions.append({
            "priority": "High",
            "category": "Contact Info",
            "title": f"Add Missing Contact Details: {', '.join(missing_contact).title()}",
            "detail": (
                f"Your resume is missing: {', '.join(missing_contact)}. "
                "Ensure your full name, professional email, phone number, LinkedIn URL, "
                "and location (City, Country) appear prominently at the top of the resume."
            ),
            "impact": "Critical — ensures recruiters can reach you",
        })

    if job_title and job_title.lower() not in resume_text.lower():
        suggestions.append({
            "priority": "Medium",
            "category": "Targeting",
            "title": f"Include Target Job Title: '{job_title}'",
            "detail": (
                f"The exact job title '{job_title}' does not appear in your resume. "
                "Add it to your professional summary or headline. "
                "ATS systems often do exact-match searches on job titles."
            ),
            "impact": "+5-8% title alignment score",
        })

    suggestions.append({
        "priority": "Low",
        "category": "Format",
        "title": "Use a Clean, ATS-Friendly Format",
        "detail": (
            "Ensure your resume avoids: tables, text boxes, headers/footers, images, and multi-column layouts. "
            "These can confuse ATS parsers. Use a single-column format with clear section headers "
            "(EXPERIENCE, EDUCATION, SKILLS). Save as PDF (unless the job posting specifically requests .docx)."
        ),
        "impact": "Ensures full parsing accuracy by ATS systems",
    })

    summary_patterns = [r'summary', r'objective', r'profile', r'about me', r'overview']
    has_summary = any(re.search(p, resume_text.lower()) for p in summary_patterns)
    if not has_summary:
        suggestions.append({
            "priority": "Medium",
            "category": "Structure",
            "title": "Add a Professional Summary",
            "detail": (
                "No professional summary or objective was detected. "
                "A 3-4 sentence summary at the top of your resume is prime real estate for ATS keywords "
                "and immediately communicates your value proposition to human reviewers. "
                f"Include your years of experience, key skills, and target role ({job_title or 'your target role'})."
            ),
            "impact": "Improves ATS ranking and recruiter engagement",
        })

    priority_order = {"High": 0, "Medium": 1, "Low": 2}
    suggestions.sort(key=lambda x: priority_order.get(x["priority"], 3))

    return suggestions


# ─────────────────────────────────────────────────────────────────────────────
#  ★ CANDIDATE FIT SCORE
# ─────────────────────────────────────────────────────────────────────────────

def calculate_candidate_fit_score(
    ats_score: float,
    strength_analysis: Dict,
    weakness_analysis: Dict,
    score_breakdown: Dict,
) -> Dict:
    ats_weight      = 0.40
    strength_weight = 0.35
    weakness_weight = 0.25

    strength_score = strength_analysis.get("strength_score", 50)
    weakness_score = weakness_analysis.get("weakness_score", 50)

    fit_score = round(
        ats_score * ats_weight +
        strength_score * strength_weight +
        weakness_score * weakness_weight,
        1
    )

    fit_label = (
        "Exceptional Fit" if fit_score >= 85 else
        "Strong Fit"      if fit_score >= 70 else
        "Good Fit"        if fit_score >= 55 else
        "Partial Fit"     if fit_score >= 40 else
        "Poor Fit"
    )

    hire_recommendation = (
        "Fast-track for interview — top-tier candidate"    if fit_score >= 85 else
        "Recommend for interview — strong overall profile" if fit_score >= 70 else
        "Consider for interview — good potential"          if fit_score >= 55 else
        "Review carefully — notable gaps present"          if fit_score >= 40 else
        "Not recommended — significant profile mismatch"
    )

    fit_dimensions: Dict[str, float] = {
        "ATS Score":       round(ats_score, 1),
        "Resume Strength": round(strength_score, 1),
        "Profile Quality": round(weakness_score, 1),
    }

    # Only include experience/education/seniority when JD had those requirements
    exp_score   = score_breakdown.get("experience_score")
    edu_score   = score_breakdown.get("education_score")
    title_score = score_breakdown.get("title_score")

    if exp_score is not None:
        fit_dimensions["Experience"] = round(exp_score, 1)
    if edu_score is not None:
        fit_dimensions["Education"] = round(edu_score, 1)
    if title_score is not None:
        fit_dimensions["Seniority Fit"] = round(title_score, 1)

    return {
        "fit_score": fit_score,
        "fit_label": fit_label,
        "hire_recommendation": hire_recommendation,
        "fit_dimensions": fit_dimensions,
    }


# ─────────────────────────────────────────────────────────────────────────────
#  ★ TOP 3 ROLE DETECTION
# ─────────────────────────────────────────────────────────────────────────────

ROLE_PROFILES_ADVANCED = {
    "Software Engineer":         ["python","java","javascript","typescript","react","nodejs","django","fastapi","docker","kubernetes","git","sql","postgresql","mongodb"],
    "Data Scientist":            ["python","machine learning","deep learning","tensorflow","pytorch","pandas","numpy","scikit-learn","data analysis","data science","statistics","nlp","llm"],
    "DevOps Engineer":           ["docker","kubernetes","aws","azure","gcp","terraform","ansible","jenkins","ci/cd","linux","bash","git","cloudformation","nginx"],
    "Frontend Developer":        ["react","angular","vue","nextjs","html","css","javascript","typescript","tailwind","sass","figma","ui/ux"],
    "Backend Developer":         ["python","java","go","nodejs","django","fastapi","spring","express","postgresql","mongodb","redis","sql","docker","git"],
    "Full Stack Developer":      ["react","nodejs","python","javascript","typescript","html","css","mongodb","postgresql","docker","git","fastapi","django"],
    "Mobile Developer":          ["android","ios","react native","flutter","swift","kotlin","java","xamarin","figma"],
    "Machine Learning Engineer": ["python","machine learning","deep learning","tensorflow","pytorch","keras","scikit-learn","mlops","docker","kubernetes","aws","data science"],
    "Cloud Architect":           ["aws","azure","gcp","kubernetes","terraform","cloudformation","serverless","docker","ci/cd","linux"],
    "Cybersecurity Analyst":     ["cybersecurity","penetration testing","ethical hacking","security","soc","encryption","authentication","oauth","jwt","ssl","linux","python"],
    "Database Administrator":    ["sql","postgresql","mysql","mongodb","oracle","redis","dynamodb","elasticsearch"],
    "QA Engineer":               ["testing","selenium","cypress","jest","pytest","junit","automation testing","tdd","bdd","qa","python","javascript"],
    "Product Manager":           ["agile","scrum","jira","confluence","project management","analytical","presentation","leadership"],
    "UI/UX Designer":            ["figma","sketch","adobe","xd","ui/ux","css","html"],
    "Business Analyst":          ["excel","sql","agile","jira","analytical","project management","sap","crm"],
    "Data Engineer":             ["python","sql","aws","gcp","docker","postgresql","mongodb","git"],
}

def detect_top3_roles(resume_skills: List[str], resume_text: str = "") -> List[Dict]:
    resume_lower = set(s.lower() for s in resume_skills)
    text_lower = resume_text.lower()

    role_scores = []
    for role, role_skills in ROLE_PROFILES_ADVANCED.items():
        role_set = set(role_skills)
        matched = resume_lower & role_set
        text_matched = set()
        for sk in role_set - matched:
            variants = [sk, sk.replace(".", ""), sk.replace("-", ""), sk.replace(" ", "")]
            for v in variants:
                if v and re.search(r'\b' + re.escape(v) + r'\b', text_lower):
                    text_matched.add(sk)
                    break
        all_matched = matched | text_matched
        missing = role_set - all_matched

        total_weight = sum(CATEGORY_WEIGHTS.get(SKILL_KEYWORDS.get(sk, "tools"), 1.0) for sk in role_set)
        matched_weight = sum(CATEGORY_WEIGHTS.get(SKILL_KEYWORDS.get(sk, "tools"), 1.0) for sk in all_matched)
        score = round((matched_weight / max(total_weight, 1)) * 100, 1)
        coverage_pct = round((len(all_matched) / max(len(role_set), 1)) * 100, 1)

        jd_skills_display = [s.title() if len(s) > 3 else s.upper() for s in role_set]
        ats_sc, matched_disp, missing_disp, sb = calculate_ats_score(
            resume_skills, jd_skills_display,
            resume_text=resume_text,
            jd_text=" ".join(role_skills),
            job_title=role,
        )

        confidence_label = (
            "Excellent Match" if score >= 70 else
            "Good Match"      if score >= 50 else
            "Moderate Match"  if score >= 30 else
            "Low Match"
        )

        if score >= 70:
            fit_summary = f"Strong natural fit — {len(all_matched)} of {len(role_set)} role skills present."
        elif score >= 50:
            fit_summary = f"Good alignment — {len(all_matched)}/{len(role_set)} skills matched with some gaps."
        elif score >= 30:
            fit_summary = f"Partial overlap — {len(all_matched)}/{len(role_set)} skills, needs upskilling in {len(missing)} areas."
        else:
            fit_summary = f"Low overlap — only {len(all_matched)}/{len(role_set)} skills matched. Significant gaps."

        role_scores.append({
            "role":               role,
            "match_score":        score,
            "ats_score":          ats_sc,
            "confidence_label":   confidence_label,
            "skill_coverage_pct": coverage_pct,
            "matched_skills":     sorted([s.title() if len(s) > 3 else s.upper() for s in all_matched]),
            "missing_skills":     sorted([s.title() if len(s) > 3 else s.upper() for s in missing])[:6],
            "total_role_skills":  len(role_set),
            "fit_summary":        fit_summary,
            "score_breakdown":    sb,
        })

    role_scores.sort(key=lambda x: x["match_score"], reverse=True)
    return role_scores[:3]


# ─────────────────────────────────────────────────────────────────────────────
#  FEEDBACK GENERATOR
#
#  FIX: only emit experience/education/seniority feedback lines when those
#  dimensions have real scores (not None).
# ─────────────────────────────────────────────────────────────────────────────

def generate_feedback(
    ats_score: float,
    matched_skills: List[str],
    missing_skills: List[str],
    resume_skills: List[str],
    score_breakdown: Optional[Dict] = None,
    job_title: str = "",
) -> List[str]:
    feedback: List[str] = []
    sb = score_breakdown or {}

    if ats_score >= 90:
        feedback.append("✅ Perfect match! This candidate is exceptionally well-aligned with all key job requirements and should be fast-tracked for interview.")
    elif ats_score >= 70:
        feedback.append("✅ Good match. This candidate meets the core requirements and is a solid interview candidate.")
    elif ats_score >= 55:
        feedback.append("👍 Moderate match. The candidate covers the majority of requirements; a few skill gaps remain.")
    elif ats_score >= 40:
        feedback.append("⚠️ Moderate match. The candidate shows relevant experience but has notable gaps in required skills.")
    elif ats_score >= 25:
        feedback.append("⚠️ Weak match. Significant skill or experience gaps exist — consider only if the pipeline is thin.")
    else:
        feedback.append("❌ Poor match. This candidate does not meet the minimum technical requirements for this role.")

    skills_score = sb.get("skills_score", 0) or 0
    if skills_score >= 80:
        feedback.append(f"💪 Excellent technical coverage ({int(skills_score)}% skill match). Strong skills: {', '.join(matched_skills[:6])}{'...' if len(matched_skills) > 6 else ''}.")
    elif skills_score >= 55:
        feedback.append(f"🔧 Good technical base ({int(skills_score)}% skill match). Key strengths: {', '.join(matched_skills[:4])}.")
        if missing_skills:
            feedback.append(f"📚 Skills to bridge: {', '.join(missing_skills[:5])}{'...' if len(missing_skills) > 5 else ''}.")
    else:
        feedback.append(f"📚 Low skill coverage ({int(skills_score)}%). Critical gaps: {', '.join(missing_skills[:6])}{'...' if len(missing_skills) > 6 else ''}. These are likely must-haves for this role.")

    # ── Experience feedback ──────────────────────────────────────────────
    req_yrs    = sb.get("required_years", 0)
    resume_yrs = sb.get("resume_years", 0)
    exp_score  = sb.get("experience_score")       # may be None
    exp_method = sb.get("exp_detection_method", "not_detected")
    exp_conf   = sb.get("exp_confidence", "none")

    if exp_score is not None:
        if req_yrs > 0:
            # JD had a requirement — show gap/match
            if resume_yrs >= req_yrs:
                feedback.append(f"🗓️ Experience: {resume_yrs} year(s) found — meets the {req_yrs}+ year(s) requirement.")
            elif resume_yrs > 0:
                src = "" if exp_conf == "high" else f" (detected via {exp_method})"
                feedback.append(f"🗓️ Experience gap: Resume shows ~{resume_yrs} year(s){src}; role requires {req_yrs}+ year(s).")
            else:
                feedback.append(f"🗓️ No explicit experience found on resume; role requires {req_yrs}+ year(s).")
        elif resume_yrs > 0:
            # No JD req but we found real experience
            src = f" (via {exp_method})" if exp_conf != "high" else ""
            feedback.append(f"🗓️ Candidate has ~{resume_yrs} year(s) of relevant experience{src}.")

    # ── Education feedback ───────────────────────────────────────────────
    edu_score   = sb.get("education_score")       # may be None
    resume_tier = sb.get("resume_edu_tier", -1)
    jd_tier     = sb.get("jd_edu_tier", 0)
    edu_labels  = {4: "PhD/Doctorate", 3: "Master's/MBA", 2: "Bachelor's", 1: "Diploma/Certification", 0: "High-school level", -1: "Not mentioned"}

    if edu_score is not None:
        resume_edu_label = edu_labels.get(resume_tier, "Unknown")
        if jd_tier > 0:
            jd_edu_label = edu_labels.get(jd_tier, "Unknown")
            if resume_tier >= jd_tier:
                feedback.append(f"🎓 Education ({resume_edu_label}) meets or exceeds the requirement ({jd_edu_label}).")
            elif resume_tier >= 0:
                feedback.append(f"🎓 Education ({resume_edu_label}) is below the requirement ({jd_edu_label}).")
            else:
                feedback.append(f"🎓 No education qualification detected; role requires {jd_edu_label}.")
        else:
            # No JD requirement — report what the resume has
            if resume_tier >= 2:
                feedback.append(f"🎓 Education: {resume_edu_label} — meets standard industry requirements.")
            elif resume_tier >= 0:
                feedback.append(f"🎓 Education: {resume_edu_label} detected on resume.")

    # ── Seniority feedback: only when JD had a seniority requirement ──
    title_score = sb.get("title_score")  # may be None
    jd_sen = sb.get("jd_seniority", 0)
    resume_sen = sb.get("resume_seniority", 0)
    seniority_map = {0: "Entry", 1: "Junior", 2: "Mid-level", 3: "Senior", 4: "Principal/Architect", 5: "Manager/Director", 6: "C-Suite"}

    if title_score is not None and jd_sen > 0:
        jd_label = seniority_map.get(jd_sen, str(jd_sen))
        res_label = seniority_map.get(resume_sen, "Unspecified")
        if title_score >= 90:
            feedback.append(f"🏅 Seniority alignment: Candidate level ({res_label}) matches the role ({jd_label if job_title == '' else job_title}).")
        elif resume_sen > jd_sen:
            feedback.append(f"🏅 Candidate appears over-qualified ({res_label} for a {jd_label} role).")
        else:
            feedback.append(f"🏅 Candidate seniority ({res_label}) is below the target level ({jd_label}).")

    kw_score = sb.get("keyword_score", 60) or 60
    if kw_score >= 70:
        feedback.append("🔑 Resume language closely mirrors the job description — good ATS keyword alignment.")
    elif kw_score >= 45:
        feedback.append("🔑 Resume partially mirrors JD language. Candidate could improve ATS compatibility by tailoring wording.")
    else:
        feedback.append("🔑 Resume language diverges significantly from the JD. Candidate should tailor the resume for better ATS pass-through.")

    if len(resume_skills) < 6:
        feedback.append("💡 Tip: Very few skills detected on the resume. Candidate should list specific tools and technologies explicitly.")

    if missing_skills and ats_score < 70:
        top_missing = missing_skills[:4]
        feedback.append(f"🎯 Priority skill gaps to address: {', '.join(top_missing)}.")

    return feedback


# ─────────────────────────────────────────────────────────────────────────────
#  PDF REPORT BUILDER
# ─────────────────────────────────────────────────────────────────────────────

def _build_pdf_report(resume: dict) -> bytes:
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.units import inch
    from reportlab.lib import colors as rl_colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
        Image as RLImage
    )
    from reportlab.pdfgen import canvas as rl_canvas
    from io import BytesIO

    # ── TalentLens cropped logo — base64 embedded (whitespace trimmed) ──────
    _LOGO_B64 = "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gvnP/QiDGMOWD7Vnnn6W++67j76+PmbPnktPTw9z5syhWCzS0dGRBPtTDA4OsnnzZtavX49lSfSkUikxY8YMLrroIm3ukU5JtGzx4sXMmDGDw4cP47pSh7R7927++Z//mZtuuokZM3qZNbOPfD5PFEUcO3aMLZs3YZomb3nrlVrv1dpywE6qufl8XjrOxk067fQeegLTsgijmCuuuIIT/YOMjIyQyeUJQp+77rqL/v7jrF69mpkzZ+pecaVSifHxcYaHh9mwYQNxHPPRj36UbDadoA5SV3n22Wfz5je/mQcffFCbQmzatInvfe97nHfeeaxatUo74aom7seOHWPnzp0cOnSAD37wg7R3FJOAuGkUUqlUdDCq9JuqYm4Y0lRHB56xTIpVIqb+SKpU00RD0V5bE7hTTX+FQEVRxL3334fjOCxevJC+vr7ENVO29/DDiG07dvPAAw8wPj5Oe3s7+XyemTNnMn/+fNLp9CsSS7kvEokrFov6towSh9M4DoljkygKmJwcl8kbIYiIQjGH41ogIkxLJPojuX3f93UArxLAtra2xEW26aHX1dVFe3u7TsDC0Ofw4cM8+ujjLF++fNocvP/++3n++ee1E61t27p9jO/72IFMtg1DcjJKpZJOnoNAtsNRmtBWra3UxsaachdHEbFQVECh20Oo9hUTExPs2LGD008/nZRrMzY2weT4GLPnzknQ/Jju7m6uvvpqbr/9Dm3CMjg4yD//8z9zxRVXsGbNmkQDJtGRaq3K8ePHue2226jVatx043s4/fTTAXSSAug+jQplymazLXRk2S7LNIUuymzZsoXbbruNEydOMDk5SV9fHyMjI7zvfe8jnU7rliTqOr1ebU+dh3pdosymYesAWpl2eV6odaMqYQ3DkHPOOYc5c+Zw/Phxnfjs37+f3bt3s2LFCl3IcV2XM888k927d+trEgQB9913H11dXSxZsoR0Os3x48d59NFHefDBBykUCsycOZMtW7brooNKLFWrFsVAUJRKVXTO5/MaySY+ucAjtDGYiiXiONaGURLVj7At6Qat6NeqtVEQBHr9Vc6rV111FVu2bNFJtRCCkZER7rvvPv7XR35RU4DVZ1Ti39oa6NWG6i2qikqu6+qkebrbtHy/KoC0tkPZtWsXjz32GKeffjqu6zI8PMzmzZv5/ve/T1tbG3PnzuXll1/WWvZWE7NKVfYs9b2Qhx9+mFqtxsKFC5k/fz69vb2kUinGxsYIw5hnnnmGH/3oR3pe1utVLrzwQmbPnp2sQc041XEc2tra9JoShiHbt2/n6aefZunSpWQyGQYH+4miiIWL5mO6JrZtcfrpp3P++efz9NNPa/T7ueeeIwxDrrnmGlasOEPS7CMTP/CJQoNNmzaxdetmRkZGuObaq1i1ahXQTL6r1ap2Zlb3RKFQkEmwoRh4qmgl74PNmzfzwx/+kG3bduD7PjNnzuTYsWPcdON7yGZd6chuvIFYws9gYnnKcdKTOibGNixNCW14HinDllc1isGPSTkmIZDGQJhpvvBnf8Gff+nz/Medd5Aq5AiUGU7LtiORmOEkVFillYug6fp5yqgheUlQ1lTKQTmneZ4naaa2LV+jiKhchlQKAQR+QBhG1AIPR5i47QXqgc/zu7aycfs2Znd2cfGq87jy0rVccObZzGjrxI1jjEi00HATYQogYgNbLTz69MlgUD0wTdsiIsaPAvkew0jeIT9nGYamsLae8yiSJjha/J5kq6pNCnHTdQ9DYApDImlRjDBNSclNAgi10BpJ5bu1uh/oPnuxDujUthHNyp/6fkVBVkcbIogR+FFEaBpYpsNUVGfdxo08tu5pHnrqcY6PjtIQEZnudjxDUKpV5Lm0bZxMltgP8PxA9p90ZU+tIPQTTlnz5EZCopSRkPPm9cbrUUWNGMLRSZYtXsJv/cqvsnTWfDLYxGEsJ6ItjaFsBCExURRiGZZMMpN2Oh7QQGC7WXYd38ff/tM/8uCTj+MUstQIqdYqYEkjn9D35UQPQvACsC3iWgW3LY9XqiMsi2x7Ow8++SSTv/5r/Nvf/yNzemcQxTEu052SUT/Hr55YvxYT4edlqEqrarRdqVSYnJxkZGSzbtegetNJLY/sgSYDpBymaVKpyJ5xq1ev5oYbbsCxHd37MiZm4YKF3HzzzXzzm9/k2LFj+L5PsVhg+/btHDx4kEIhx4y+PqIowPMCjh49zMTEBBdddBGXXf5mXFcmqMqBsNFokHLTmAkC6rRU71EonmEQR5FEJhIE6aqrrmDX7t088MBDxGGAY8oK+MMPP8zTTz9Ne3u7vofjONZV4rGxMc4999wEiQp1ciZbHNhcffXVPP7449PQ0GeeeYYXXniBrq4uHRQqTY+iuZmm4Oabb04CU4lyBEkxUQYVhg5+ZSW6mSwrxE25+oZhSL1eR1EsDcMgm01PMxtqdZg8WdOoxnTGRcizzz7LwYMHARkQd3Z2agfsiYkp9r28n1KpRHd3d6Kd9VizZg3LlkkzDC+pujddYUNAogJSj9T8zlbqXRRFuuoPcq1VveuEkG1QgjDQxxeG4bRgXO1vW1uBWs0nnbbxvIje3m4uuuhCbr/9jqQBu2xE/w//8I/MnTsby3IYHx+lXK4yMHCC7u5eFiyYz5Yt23AcaTIi3Ugle0VVp9TcVOY0YegnZiItrrxy+dfn2UDIymKCfqtrXSjksA2ZZAcNj+NHDvNP//RPWJbBnNmzGR8fJ5dJ8+nf+YwsViQ9+K699m0899x69uzZo01Otm3bxt69e7ntttvo6elJKL1VrfubmBzTdGmFpkgDFIHnBdowxPPq2oFWxgwSETL1sUld2aFDh9izZw+5XI5Zs2ZRKpV47rnnWLt2LYsWLdJrinIxfb2h5qzSZ0tbfUMbkkBTw6n0btJ4yaS7u5sZM2Zw5MgRisUik5OTTE5O8uKLL3LmmWcmBnmyxc2aNWt4/PHHtROx67rs27ePL3zhCyxatIiRkRGq1aqmOl966aUMDAwQhgGm6SSFkrw+JnU91TxWczqKJH3fdaUbeixaxEkJYh1FEUFD3iuWMDDiKKEQNxNQNUqlktaRKpq2LIBEpNOuTvA+8IEPsGvXLkZGRnRLpPXr13PFW9/M7NmzdSsOhQyq/X29xFKdL5VEKsdrUJpK+b5GQ2oOFyyYx7x583RLnWw2y4kTJ/i7v/sHurs7yeeLDA0NMDg4TCaT4uqrr6VYzLNr1x6ECOR9l2jTAVKuTCr7+/t57LHHOH68n1mzZmBZDoYBxWK71vUfO3ZMFzbK5TJtbW1cccUVen9TKVebBnV0dFAsFnUbnXw+y86d2+nvl9vP54u8/PJuLrjwfD6+9OPJPR/hOCZve9u1HDp0iCNHDuE4KVzX5plnnmHHjm2kUilmzpyJ41pMTEww0D+kUV/Hcbj0sjfpdT2XzaFM8JqGd/KapNOpBK2X64wqBMRJsWFkZIS9e/fS3d1NGIaMjY2xadMmLrvsMhbk5rVcwZ/zAOcnGD9ziaWQTM5phiBqlVB/twWoboAGAmGnmtfSkJPRFLI1hY1MdGY7eX77wx+laLr8xw9ux8i41OKA2DZpEBLbJrGIiYIIM5b0T8e1EaZJ1W8knaAFul+leqAl9AxNmxXSrTMSERgCQy2KCSVI7qMJnq9puCLhLAXEBKFHRIxIuQhhcqQyyf4H7+HOxx9h5elncN6ZK7nyksuZP3M2s9q6sIEwABcDm6SKHjWpR1GCvgpDEKsAD5lEWoZDFEey0ovUCSmUs7XsooIOIQwwp2uQaH2vId/nKGesWF6fOKHPmYlbom0mmoko1vSx1oAsSNw0DaSQXH5OLqh+vYrtpog8T/4uMU+IfR9hGMSWRV1AiCAwTY6PDPDcixt59OkneWHrZvrHRrCyKYKsS2xAJQxk6xjV+DYKiUMDERsIUyS0GnTiLlli00ighAaEcUyYmCc1EexTz+9X0EVbYlEnhIW98/jzT/4OF529Gjv5x1rYIG07SQvWmCARnZvC1PMojg3CCMrEYJjsHTjCX/zD3/HQU09iF7L4lkGAdLtEmMlDy8GvekRegCVsjFjgmQ6Nukw44zDELLRhByHPb9/CL//Ob/Olv/wb5vX2grAIGw3yrgsI4loNoZzrWpLL1iQz4hSy1Hj668+DAVAYwq5de9ixYxe+H9JoSBqhaqWh6KlN1z6JGnieR6NeZebMPi6//HKuu+46Uk7SZkNd5yhGGIILLzifWrXM7bffzuHDR7FMQTYjXSgPHjzMwMAQU1MTOE6KOJZIXU/vDGwnJQtnoaQyHjt8BBHFOJZJQxi4lk0mlcYUBr7nJ0Y7MuAMwkDrplQC/Z5334hlmjz66KNMTY7T0d5FPluQlf+JElJrJh02FeWRSGBgEgUxRIK069Coh6QSCu/ihYv41G/+Ft/+9rfZvHkzmUyGfD5PvVqj//gJGo3GtEBaVbIt22BifJzZs2YQxgGGEJi21JOVS5PUaxUK+TylqRod7UX9fcrh0TJMojDEMk2qlRLHjh7GMk2mJscJg4iO9mIyf+Pm+p3o+01hJdc+nNZaRSFJQRBw//33c+jAQepJMj81UWLgxKBOvBU1sq2tQL1ew3Udrr76St72trdpOlYcy96542MjTE6MJYhgCHFELpvWCKCif6oAtdFoMDExQSYlUS6v3iCbzmAgCH35Gdu08D0ZVJvC4MSx46Rcm2qlRBh4tLcVsEyILQPfC3CTObD28ksZGhzk/vvvp6OzG8tyiKKYl1/eRxRJN18hDDKZHDfffAtB4LN37wEqlTJCGKRSGVw3JalkSS9S13U5evgI5dKkbhMRhT6uY+ElwawKakEWVdU67SfztFKpkM1mWXPhap584gnqXg03CZxLUxN4Xp3BgRNEUcSKFSsIAsVWkpKZvp5OPvbLH+P2229n48aNlCZLGoGdmpiiPFUmCAJ8X1LJ0+k0lmGTTWfYv+9lzjzjdNIph0ajkbRwgGqlRD3RfdVqVRzbxLYMojBOEA+5ECqqtJ7bSRuq1kINTHckfm0pgkLQ/OTclGg0arhugSiK8fw66YwLcYylPBdaX5Pn3poLV7N92xbqtQrEIZYpWP/8s1zypotYvHhpci1g0YLFXH/dDdx22214nk9HWyehH1Et19i+dYc+Btu2ufyyy3nL2rfygx9+H9MAQ8QYpqCvt5sw8DAdR/7eABD0nziG79WxzDS1apm+3m4sUyTGTyEhYGE0iyRBwMjwICKWa0ylLM3MCvlscq4Fni/7nDYaNeo1WdBKuQ7VSom2Yh7barZ3cV2XuXNm8d5b3sNXv/pVxsdG6OnpYWx0mG984xt8/OMfp1Ao6BYkgHbHPtU1ao1/RkeGcB25fnhRQGdHN+mUI735koQ3iiJSrq3P4Q3XX0cYeDz66ONJouiSz7clBk1V6vUalmVzxhkreP/7P8Dtt3+PWq1OLieP33FS5HJ5fD/GMgRRbPD4o08wcGIQ13YJ/YjJ8VGEgLGRCT0XbdPGcCV1eOnSpdx883s4a8UK+bxBxqNhFGCYNlHoc/VVV7B92xYCX1Kw87kMjXqVA/v3EkXQaNTIpNL6WUccYgiDhQvm8asf/xVuu+07vPTSFqIowLYs6rUK1UqJgf7jyXE0exyr+6o0OSUNDo3meliv1hgeGpBFnDjE9+q0FfN4Denk3HxeSeOoSqWiXcXb2toIQ6mdDgJPsl2iCNN67YLB/6TxM5dYwvSA/FRBpohf6c46PXiVdEXTtLEQ2LG0nFnSNZPf/pWPM7Onl3/79v9HVK8S2RJV8/wAK5cj8CpEWBiWQd3z5APbMrHTaQwz0eqFgU4qT95fgPAUzkOn0muePOLkOAzTIvQ8IhHhpFOk0ikq1RrPbH2JDVu38N277mTZ/IWsPmsVa84+l1VnrKA3XyBCOs5m046mnxqJVWyY9GZTgazSZ1kK6aTZc46Tqp4nJ35hYsffmvDHipMEzXYpyTBat5cgmoZhNJHO5PdBEBBEIW4qRRiFBHGcFAgSqqUQ2KkMjSQIxDSpN+qEcUQqLStkDWDUr/Hi9m088fRTbHjpRfYfPcx4pQSOhZugdhGx3O+WAsG0a6GOSch+mZF45Xt0gSE5gRHTHYJPHnpanIxqtPzVQPAHv/07rD7rbMwEkaxHIWknhUGkAynbsiCGwEs0ZmkHyzGZ9KUOdO9oP3/6+b/i6fXPUejtYrxSwmsE4DoI1yL2PIJyCWybbC5L1PDxa56klgfJHLBtMEwmq1Vs1yHd3cmG7Vv5rT/8LF/8879icfcsbNfBi0LsOJkjQZD0mJ1eHDo5uZTH+vM5VIX2tNNO45ZbbmHnzp0cPnyY/v5+fN/X/fFANYE3NJXRsgzWXn4la9as4ZxzzsFxHK0xUwGKYRiUSiUymQxXXXUVPT09PPjgg9pV0bQcjYQEQS5BJsKEKiZ0lb7RCBkdnWR4eFgbK9RqFbKZFKVSSbeuaB3KUKHVuXHGjBl84AO3Mnv2TJ566in27ZP6HtUvEZqGISpxWr16NWvXrqWzs1O/x3VNbYyQz6e59NKLKBaLPPzww2zatEnvp0pOFY3S9yVFcsGCBcxfMDdx62t+d71eZ2BggEZDUir7+48n6GSgEw9lYKMDj+QzSmcjzUqc5Lq99kJ+MjqhEmuAmTNnsnz5ciYmJhgeHtYurepzykAmCALOPPNMrrvuOs4991zdyFz19FMouBCCcrmM67q0t7czMTHGvHlz9Brfeg76+/unuawWCgXdG7TVZES6s0pH3Gq1qo1EZGsWodcgZWyTyWQ444wzeNe7JGVw00tbGB0d08hEvV5hcrLG0qVLueCCC7jmmmt49tlnqdVqlMuVRNfkUy6XaW/PIZKwRM1JhVwqxDCXy0wzNmkdKtBWDpLqup599tl85CO/yG233aaRnTAMtQY5m81q5LZ1LgoBq1atoKenh0cffZTHH3+cqakpXdhQ7zcME9OUn585cybz5s1hzpw5LduTye/ExIQ2UFLJczar+mcKfQyqyGRZFmeeeSbz58/n4MGD+L5PoVBgxYoVrzCrUSyI19O5KydTpYutVCqkUik6OtqZnBwH5r7m51etWsWsWbPYt2+fnjcHDx7kxRdfZP78+ViWQxBAW1uOt7/97QgheOyxxxgYGKBarU5z9W1ra+PCCy/k+uuvJ5PJsG/fPiYmxmhra6O7u3uadlStk7t379Ytl1TrHOmU6qOcgFtbikRRlFyzGrVKlcOVg4nbsnTGVRp1kDHQ/v37EULodkqWZemkQukDVbFo5cqVXHDBBTz99NNMTExgmiYbN27k0Ucf5ZprrqG7u1sfq0oIX09rqebXxIRM4Nrb2/Xab5rmtGKKuv9WrlwJQKHQxrPPrWdqqkS1WtOGScVikfPPX8373/9+UimbVEoyFSYnp5JzJFFd25YgieMYrFx5Nv39A+zbt087qCqjGyGkw7RpmixevJhLLrmENWvWcPnlF0vWlNcMAtW5zeVyLFmyhLe//e2sW7eOvXv3atp7qSQLkKqAGASBpukqt+Ply0/jwx/+ME8//TS7du1i586d+vqptjuKjt/R0cGcOXOYOXMmS5cuxbZtfN/XzwrFhBgdHcU0zcS8KK31w2quqURe0YcXLlzIsWPHKJVK9PX1cc455zBjxgyNbrai0/+Th4ii6OcOtxVC9SyMsB2Huu/hBT6pdJYAmIg87nrwPv7q777EpFcjsASBbdAIA7AM2XQ+ebhKHUQkVbmJRZY4ReI1ffx0p9S25U0SBwEYBrZlYwoh+0KGMXgBRhTjCpPe9k5WLlvOxReuYfU55zJ/1mxSgJNoVCJfVvVtw9IIoG3KpCQKQxncm2Yrb5aQiPAVuY9o0VPG+nfNI06oR3GMlXDSVTKofo6TG89MEg9VYRWtdNpTjDiSFejIEFiWqduuhMkfH5jwS2zZupXnXtjAY888w8jEBJNTU8SGwEy7YJt4YYAXh4RxS1J50hBJtRqS5BKIFcTW5Nc0T0OSeE77Z9Hk55+87dcbbgAXLlnOn3z6s5w+dzEQkMdCRCFOQvEihtjzEMnDxg8jIlPgxxAZgmf2bOOv/u4LvLRtKyJlM1UtYeYyZIpZSqMjkHJxMhkiz9eGVkHDAy/ASaWkg24cQaOBmckQNgKIIgr5NqaGRnAMk0vOu4A/+8M/5LSZC0gjIAxwhTlNb6nO4bRr2fL3n1tKrBCa/hYEsqBz4sQJ9u7dS39/v3b6VEGz0tDNmzePnp4e5s2dnWjlXjlB6/W6DiDVUA/Mw4cP89JLL9E/MMThw5L66rou8+fPZ8GCBcyZM4fly5drvZkKQl9++WXq9TrFYlGaFoS+1oap97UGuq0PTuXeqExGpOPnQQYHBzl+/Djj4+OEYUgmk6Grq4uOjg7OOussenp6KBSkCYvs5WlN+zkIlHGClVB5j7Jjxw6OHDnCsWPHtAapr6+PRYsWsXDhQmbPnk17e7sO0FtHGMrebcqBUxly9PX1TUvCPM+blky/8MIL2uCjVpPJUWtT9VefAtO3pQIU5Uw7PDysj2V4eFhToQ3DYNGiRSxYsIAlS5Zol9dWQxuFSJbLZd0rULWUWbhwoW7X0prUq2u4detW3b4hiiLmzJlDZ2en/rwqcKjX559/nlwup6v4CxYs0AYtattqv6IoYmJiis1btrFz504OHjyoWzrMmTOHlStXsny5RLQGBkZ4+eWXtc7YdV3mzZsng0jHSui96IKMoo9blqVphq3ntfW8nLxfk5OTZDIZbNtm8+bNbN68mRMnTmhTop6eHmbOnMmsWbM455xzCBLFg3zkRziOkVx/qTk9fPgwAwMDOsBU/UN7e3vp7Oxk6bLFFIt5PU9a97FalZTZcrlMJpPRicv8+fO1Q646TvW5IAhYv34927Zto1KpcNppp3HxxRdPcwBWxdpXo2O3jtZ2I0NDQzqAVvPn9VqWxHGs550yoRofH6dQKFAsFslkMlSrdQAymRRhGHP48GF27NjBvn37tInOokWLOP/881m8eLE28Nq2bRvptIvv+wRBwLJly/R8Vk6utVqNnTt36r9PTU0xe/ZsFi5cOO1eVowGlRBt3bpVF5KU4cwZZ5yh10F13sbGxjh06JBObgCWLFmiTaMUBV1d37GxsYTCK+dsuVzWiY3siyiLXK0shtca5XJZa1gVs+W0006bdk+3OgWrn6XZ2DgHDh5mz549Woc6f/58Tj/9dNrb2+nt7cT35fPoxIkTdHZ2aibJokXzaDRC4lD1wpT7MzAwwvHjxxkYGGBwcDBp9VEklUpRKBSYP38+s2bN0s6xpqXopKYukqn1RI3NmzezadMmRkZGCIKAbDar75/ly5cza9YsAF1AaG294nkeQ0NDHDp0iKNHjzI4OEi5XNbF13nz5jF79myWLVuWOLcmvWnjZk/aMAw5dOiQfpZOTU0xZ84cvR6pIpMy8UmlUkxMTLB9+3a2bt1KtVpl4cKFXHTRRfT19U2Tcr1hYPhznFiCdDazLAuEIAI8Ymqhj2U61IEnXnyO3/3jP2S0KtGsqtfAzqWpNTzFWQTbwbFNvFodgpBMNttsSKy+0BAnBcw/3SmN/BAnqVx7QSDNY4Qg5TiyQX0QIiLp1BrUG8ReQMZx6enqpq+jk1+44kpWn7OKM5ecgYkgIsROVJN+6OEmrqIKRTWEJHQlynfiJHmDRFup0M6E9qsriOo9rccbxURBmJgGCZmIq8q5otDSvAkhsdBOtJgAcYg03TDADyIwDW3a5BHTIKROyEStzK69L/PYM0/x/IsbOXLsKFOlCh1d3TQaDRq+lzjBSrpqLASG1XRQbV6vk2iYorkA6uvakkC2mnRM03sm7/9pEksrAqvS4KzFy/jLP/1Tls9aRIqYDCbCa2CYNjQ8cB0qUyUy7UU8oBx6WKbDgxuf4Utf/Vee3/QCmUIeO5NiqlLCTDn4BBimSdSoguNIDrXnYdgOxWwGv+FRHptE2C6W7eJXq7IXKybUaohUhnw6Q9zwqE+VuXjVOXzxz/+KJd2zJcYQBrimpa9j6/h5oLf+pEMpfk8VP6ieXipRUEmQasshhMC2DO0o2YokqeBRWeyrBEB+l0i274MwqdVqOmk9VaKV1MiIImVIIRto+75POmmIrXq5KVpla/ClEjulQ1IPY7mvUo4gAwKhf6fqTOqRYxiC2v/f3p/HS5LVdd74+yyx5HJv1a21q3ql6WYXmm5oQPZtEEGU7Zlxw1EfHVEZGcURhEFERhFxXFARfZzRcXv9cNRneBzFBVkb6G6WZlHW7qa7eqm96t7cYjvn/P6IjMzIvLeW7mpo6P6+6xWVeTMjI06ciIw8n/PdJvPSI00/FEVBmiaz/mvaeqpjaP9db9/N+qfJeNhkcGwsrk1fNq6GTb+GEJhMJrNMgO1jXkxgdGqagXtbUDQWjuX12hkwlxMltddrrpn2TH57m8sCrznu5rppXyttK2wzYdAWi22yLJtZ/RorX12io1wY7DVW0yiKFqZVm/PeHE5ZBqxVs/knpersvnWt1vr6mc/fzeNEm78bq23j5tsMFtvH3NC4HgIzQdHu03YCncY9vblWptVgZs47RVHHGrbSCeD9JuceUMysaMvfzaav2han5rga4d+0o3m/3f+NG31TPqgRTI1revu3+Uw010VbiLf7+XQ0x+Ocm3136r4yU+vTiJWpi6n3tCak5m1rSs80u6qqeYkLYGbhb1ss221sf7ea71DjaQDzWrjLmVmbOOr2Y9vCvXwNtamqambdbvqpiYVs+rGxILbFVPv+cjbCspk8XD6X7e94851t9tvURU2ShLLyOBdmVvc6idnm66Io5q9XFdT1JOs0DuNxLeg6nWjhPtt8f6dfG5ph3ex7MX2tyeDcCPzmvtXkHWiXOGq+d1rrWf81/d1MtDTH3JTVadNYCtvXw/J5bAQi0KqrPL+3twX68j1zeb9NbGYtpNXsGjjb78/9gfuksKyqYnpR6XmmNGph4oAJDoVhQMkth+7kdW/8eT72qU/SXV3heD6C7T3KKocsB6XRcVK7d3qP1Wb2Y9SInUZYtox+d9sao8J8PwCVd3VSXKVqt9yyhChGA1abOiGB87iqwqBIjKHaGLB3bScX7D+fBz3wMq569JVcfeVVXLj7AupeqX2gNbVLcXD1r7/Vtdtslmfz5DqtRA8LGWCbEUPL6jgbCbZviKo1qGxuTn6a5CfMXXKVUjOh6kMdhzcr4zI9byfKCccG61x3wyf4x/e/l/d++EMcP3kM0pio38NEltI7XFHPVGpra1EZfC3OtUZZQyirefMacd3sG/BazwMBW17NMyHZ+sos/0g0wtI3fdQ+t1ud66W/NbCjv8Lg8DG+6YGX8atv/EUetv9iVrDkJ9bprWyr25Rn0ImpjOZkKHHK8o/XfoBXv/EN3H74ELsvvpAjR4+gIs3q9lXW10+CDujI1GnAjx2GJGH/Bfu58PwL2H/+eQxOrvOpT36aIwcOokxK3EnJi6JueWQhK8FYYmWIgiLkJd/86Mfw3970S1y8Yy+KQChLVmx0ZrfvLX5bTxeb+o1E7YpVn/6qcrMf1fbAyvv5D1tzCTWPeZ7PXB6XBWXzmSa7XTOoblyAer0eVTUfgGgN43Fd3HtlpY/3YXb/aqyEDU09v2VRO882GTYJnPpY5vvb2NhgZWUV5/yCy73W8+Nc7Kv6uLOsmA6a7UyINIPSWsCaad+UM0vFPMnMvD3zgf9my83yYLpNI7baAq+Ju2wnG2sPYE59/ucJztoCptl2EyfXnL9m/83nlFIzd+k6UY1ecEFrttMeXDcD8caS0lwz7cF4kzSmcX9tt7FZpxmwtsVaI8obkdbuS1gc/Ndiw0+PTU23OS82b62mLN1sUmU61pudt7qOXjmbAGiun2VLcrtvG1HWiOVGULZjE5s+atqtlJoNMNuD4PY1uXhO68mSqqpI03j2N7SF49bXeHN+G8HY9FVzjpv6nc222i54y5aQ5r1m/WZA3p7cOduJj/Zgurl+yrJcOM9b0dx/GpELLJyrhqKo+7+pJ1hVbnbdNuWQ8nz+3Htm7y3fc5q2NUK6/XfbEtj+TFukNOKj+R7V5V3CgidAQ3MsjaWx7Y7ZvA8sCJzGOtpYv2pX23nJkbtyftrH2yQPakRW87vQHE9zH2m3o856ms2SEzW78z7M3m9+d+oSMfXzJlHTqWgEZnPtL99/5/1RX5uncwndSow1x92OY23T3AOac9hcx+0+boSo937h/tj29miXOGomB5prqtlH831o3+vb95h2m5vPNPebs0mgdV/nPikslWrEjpndgKuqIi8quv0uFTD2JUZHjHEMy5zf+b138D///E8prGJgHaQRdpo1M4wn9YA6jimyfHaxNcIyGDUvdxHOXVhGSoPztUgKHmUMNo7Q1sx+GGeztVO1FqZlO0yAlSQlHw0psxxCIEKzfXUbD7/8wTz08gfx2CuuZO/OXVy4bz971naRYtBM4zC9p2PsQvybYn5jVEpN0zGzSTg1v6qNa2bzYxhCwDEXn03pEjfvsnpzQIHDYhiUGevDASc31vnyTTdxzbUf4cPXXcuNB26hUAGbxiSrfUJkGIyH9VRbJ0FHEb7y87YpFp+ztMOWsFShrksajGmpQDUXldPPteMoGzfZWaIaqBM3bdE/c+PnopWzfe4BqiyjEycUJwc85Yqr+O+/9lusoNmZ9MAFqvEE2+viNKy7DEzKH/7tX/Czb/oFVCdBdTqUQFXmNG7cKlJEkaHIRpjY4kPJQy57II94xMPYvroy+zE/fMdhrr/mk9z6r5+D/iq206XKM1S3R/AOCoeKE2I0kYcwKbj6m67g137pLVy0Yy8xkBCwS3G2p6ItMO8rwrIeiNQD+V5vcZDW/pFvi8q2EGtEVNsi07D8g7zVAK8pOdD+8Z9/3s0Ktms9txw0hbHrQeBmS1EzGGpEb1sQNQLsdILL+/ngrhE0jYWh16tj7JoB5rKVqz6uev9t62tTfqB5zfu6fXXmxvmPfjMYbVuFmrZUVTXL6NhYApvjXe77ep9nzrzZHqy2rSbLlt3l7QIz17G2q+lynzdsNfhZ7HO/5YC7GaS2hUs7CdLyJEbzejMQax/f8vU4Ty4y/0z7PNZeRIZimiBoLiTmE5RbZepsLKTtdi5beduCvj2QbPpvUTyG2flot78esEIUWZSa11Ztf4/K0k2tc+2+nj+vY/30TBg03412X7aFYjtzbzNB0hbSk8lk5rKXZdlMNC+7Q7bF6elY8G5gXgql3TenoxFWzf7bsYd1vGa3Jbbnn2sLlxCgLOdlZpp9pmk8u26beMLGM2KrdjQTC02ZjbYobixhzbWxvI1m4qSdIKmxui5PTLUTcDXx5Y2Qbqz+SqnZfWb5c41VdCuvgGXyPJ/W153fh9vfs2VPiLagb9rX9HUIkGXN/aO5/vz0O754LTe/BY3Yb+6ns/FuCLPfpnkfNtesbXmY+IX7X3OOmm001zGwIAKb41i+Htuu/MuTDc0+mnPX9F9blDY1QZtrobnHNud9eRK1va22NbwRoY3oHY/Hs+teKXXa5Ez3N+6jwlItxiI1A3ZXZ25qLGDjqiCyMRM8JZ73vv99/LfffztfOHI7w8kA262TOgxHQ5TW9Hr9Op6pZbEMajqbCPeYsAxlVafEjizKaErnqFxFU7sSY+rSKvUv33QUZrBRRGwteZ7Nsvx1Ox1CUTFc34Cpy2wxzuinHXZtX2P/eft44EWX8JAHPYgHXXY5+/fsZmfapxPFM9cmo+oaks0tZXYzYzp7znzAXKlApdRMNDY03eGACqioKKo6Nmw4HnP8+HHuOHgnx0+e4GOf/Qw333Yrt9xyC4PBgKIsqYInThPSfo/SVUzKOntu0KquyznNDuvyDNXrEuqRbL1nrdtTbfOWnY2wDE186SnOqVaLZWsWlPIpLoLmR3dJ79ZJbjxJJ2UyGmELRy8ornjAg/iDX/8t9vZWUZWrM/faiOOTIS6x/N6f/QlvefvbiFbqxETEMVVWEHVTytEGRDGdNGJy9DCdHatMTp7gwY98KFc96ptY27FCltVZ46LYsJqucvvNR/jABz7MkcNHMN0OLoS6lZ0uaI3VEdVgSCftYgpHvj7k3zztGfzym36R7XHCLp0Qtyy9p2OrzLHf6MKyKKrZYLkRbfPB7XxgBVu7y7YHVs0AtLFQNgPIZtDRHiw1P3pKmZlFqO1i2x60NzGMtWtjMrPSNIKz+aGvLTRzt6XmR7MRZu2B0txKNj+WerBw6r5atg5NJrUwbGbBa2GiqKq5lSvLiqlFbJ56v72dxgLV7L/d9kZANqKxGaQ097RGODX91QgD3zqoMw3c232xlWtiW9TMwgRYnOlux/a0t9l2m1weKDcuZ8DC55o42CaZzlYWmsYa0mY0Gs3i/drWsua6XHaJbLKYtgfQm92kw6Zz0kwAbCW+thL2y+7LbUHVCMUmXGX5mBq3zKYPmu9R2/WtmXhY7pOmPEd7MNmedGlbt07lktoWhO3jzPN8wbq2KHT9gpWu/fl2UiOYD8JPR3M9LA+mm344U4xlc4zL18Bc5IUFa3U9EN88adTca9qulkVRTV2ON/ff8kTJsqhqX6NtS15z7QOz73xzfz3d97PJwtzUCG17b51qYqLZd7NPY8xCOMPpro12/zbXX1EUs9jOpg+addrCq9lX0y9tYdR2Cx2NRtOSRItCr+nb5hw2x9CeYGzOc7P9tmBs9lWHMcxdTduW3PbkT7sPlt1Q25NfzXd1+ZreysMEWLj3DAaDmdvyssVy+d7bZjk2vrFSnmpCsTnO5jslwvI+LCzbdYhcWREnCbMsngpGeUGSxExcBdqgVR2H+ZXjh3jr//N2/s8//yPHjh5h+57dFN6RVyUmjinKuoD8givf0sV5rsIyjWPKvKB0VV3/0Rp8U0ey2VdT7Kp5Tak6m2dVQjetXTmrqi5rojRRnNTZTcuKjo3xZYUrSnxR4itXiyutSdDs7PfZvW2NCy+8kAc84AE84KI6GHrPnj1sW6kLhEfGYLWZx5JMXexc8EycY5xlZFlGXhYURcFwPKrrzQ0GHD1+jENH6+QVBw8fYjAYMJ5M6iyBZU66ukKlmY0WG5eSsizJinqAXboKOw3Az8uC4D3K2jqGsiqnNWta52XuIzddWp3eEpe1Bfr0wrJtnQxatZRh82Lz2bsjLMG5nM7KKmE0wRSO8sSAxzzs4fz+b/4252/bQ8Cj0GQEXvuWN/AHf/an7LhgH4WCYT4BbevMrEWG7SS1q/RkSJzEVMWY7dv6PP3pT2bfebsZD0+SpLVVIcvHRCYmDqvcccch3vvBD3Hs+Al0r4svK7ARKAPeo+MuIS+JgqKjLflowjdf9Vh+882/wiXdNZJpJzSC/XTfh+VESt/owrL5sWpijZYHWo1rWFsMNW51zUxy8yO87F62bMVsi8xF1yI2uTfNXV0X3Zgasda4+MHibLHWeiFGrT0QaAbqzWBo2RrX/grU8zrzJCNNwo5GrDRtqgeXi5au9m2uTeNSvJUbYjMobNeEa4RIM1ho4n3aFrn2YKNxp2sPss7Gla2x4rZjAdsCqz0TXvdNWHitLbCatravg3acUjuWsN3+4XBIv99fGDy247wa61e7PW3rzrK1dXkWv+mHdnvb+2jeax9b0x/NsTTXVdsi1Dw2EwBtF7h2vF17sNgMMBvrRyMGGnG4VWKftuWnLQ7b224PuJcFQVtULr/XFr5N/7WFSfvabFto2gPxdvvaMc3t/mi+c80AuMnWezra+1++ftp9cSrabvDN+WvaMhd983tevU2m/eBn3/tahMRMJo2LcH2/MmbRAtQM2hsxs3xdNt/rZoAfRdHMsLAcX9z83bZMNRbX5rNbXZ/Nddj02XK4wrJ78bJFuT05cDbnpy1uGuHYZD5tn3tg00RF+9rdKslPw7LFdyvL+anWa9ZpX6uNsGq74bfPTXOttkVh039bWRvbbWrcVZfd25v+bN8bmj5qHpv+a8ekwmKCoeXJiGayrH2Om9+6JjSgEfLt72kzQXZ/5z4pLJdd6jYPVOcxkb55hFmm0Qz4p4++j998x+9w3Q2foLt9DdWJGRYZLtLoJKlLjmiFiiK0C7iigBAwS7Pbd5U6xnLe4C0tOo2FdNNRTTWNDq3MOtPthcW/tVLT1RRmanlUqhZQLisWrI1t108VqJPzaF2Ly2mK/MjY+Qygm1tD8qlVsqjqLG+V9yijUWb6o2vqwbCa/gg7DeOqxCm9WHam+QFfakt7ENgIQ6f9kvA/RWe3aXeoag8S5pGls1k+pucjNJmCVZ3kxui6r/MKKoeJ4/qmlWcQRSSdlHx9HeJk4Vg2CUtVZ2RN0i6mcpCXlKMRVz3yCn7h597AZfsfyNCPeNWrX8Pf/8O72X3JxeSuYmMyqrMaN3VEpxGqyoMKFSZ4FBUPe+iDeMLjrsIaz2i8QRQrqirDRgarDD5L6HRWuOmWW7jm+o9x5MiROtWbtbW4LEElKTgIWcG23irDE+so53nuU5/Ob7z+jfSVod/pURQ5/bhTZyQuSyIbbRLc9zVhKQj3b+7+71/N2SWg+erxjd5+4f7NuV6/54pc//d37p/CcrYCCwIT6ue5dzgNB48f5ff/5I/4o794JxtVTry2Qkgso+EAOmktJPKiFmpxjFG17/amCvB3lS2EZRul1JaD70aYeB0WxdTyKW71i1JqmhV2LlibmbDZdlvPdUv4zoRR8/npOjaoWaKbZs++JZDL6axT0NMZq6k7cV0rUuG2uiKXZ/lCvf8t+6LJytr4/DcfOVuxGdrJhxaFZYA6S62vaz1GSVInB5qMwTvQltgmFOMJKLBT17PCVRACOrL4apr04hTCEqtwRUFkI8q8ILWWUFb4quQxV17JD37/D/CH//OP+NB730935w6UNowmI/pra4yzfGrZ1jPXaRM8hAodPDpUPOVJT+CyB16MViVFOcJacH5a6LcK9NKdjIYZykYcOnacD3/seg7fcQjSTi0wg6n7qCwBi7UxqYmgcuQn1nn2Yx7P2375Lexe2UWgIsFiAFcWxFsk9lmePBFhKQjfyHyjC7Nv9PYL929EWAr3LvdPYXmaz8DURqWgAHLgPZ/4MG/9nbdxwxe/wCiUrOzZybjIcVP3SxXqepGo2p++EU53u/24LV9XLSHXPqblr/HybeVsXC9gbjkKZ+qw5pJptuvDgvAzYe7yg55bQ+t9qFm5j5mgCK3Ph4AKZia65oL/9G6ls337WkjNRBqLonZBZJ5KXLaEZVscNyIYpWrR1vgbKgXGoI3Bak2KYbw+wMYRWTZBJzFxkpBtrBOtrs6SJjQsC0ymLidxYimmLlBaa8oTJyBJWN22nY0TJ4h6XZIkYXj0OFhLZ3Ubk8EAWu4etYtvbVnV1MLywZdfypWPfjhpoiiKCf1eQuUyqqqkk6a4ShOwGBtRBrj5wG1c/8lPcezOIxCngAEbQ+mJOx2K4QSKkv72HQyPHadXeJ7z1KfyC69/A/u37SVCEUJJoix2miZ4wRp9HxOW59r+cy3Ncm/vX7h/I9efINx7yPdPuLcRYbn0uSZ5jlKKEFtOZBNUmnB4ss5v/4//zrv+4e84cPQQOo3RcVzHPtLEkiicq1CnSbN8Vu04g7BssqouC8pTHWcjLJdvGJsEaOOSeFfuTFOR23ZJVWEeGD6PQ2mJR2Omgqz5wKyh4MFUCtMIy2m7XJMVaYv9L/wZIPJ+Uzykb7lbnlFcBj0Xps3228+nQlipqc9+kxzAB2JjyUdjdu/ezfr6OlEnJa9KqvGI1b172Th5oo5/bLEsLLUxlJMJulPHUgTvUUYRqookqd1pVadTx9YMh5CkddzIcEK8slJnqFuYeJi67KpaWAZf8ugrHsEjHn45vW5MkY0glCSJRQFF6UmTLpO8oEJh4w63Hridj3/iUxw+eBSddFE2wg0nqLhDknSmyWUiUm3Q44z8xEme9sQn8yu/9Gb293cRo7GACp4YfVqrpQjLb+z9C/dv5PoThHsP+f4J9zb3C2HZcKYEIrN1pgIiL3JskjDxjqANJYG/+9B7+O9//md8+bZbOHTsGKaTYLtdcldRBU+UxNPaf+fS/kXJ13aVPN1x6NZ67VhEt2Tt20pgLlg1T+PK2yT5gcXkBQvZ8Yw+u5vTVvvxAVu2alpyCmE590+dvzY9BOv9Josn3HPC0iiN0RpV+ToxlDb0khRNHXR//vkX8oUbv0wcx8SdlGE+qYWtntaf84sTB3rpvMZpxGSwUVtB49oiHkLAVyX4wLa1NdYPH4Y0rQWujojShGIwREURs+re7UOaxltqPN7lRAae8qQn8IiHXsb6yWNEJrC60uH48eOsbFuta+2ZCKUMPhjiqMNtdxzm2us+zp23H6pjRpM+eZGjlK33P8nBQ0cpbOUoJxlPuvrx/Mabf4Xzu7sJoUBXnn40rQvbbt996Mfs3v5hv7f3L9y/ketPEO495Psn3Nvc74XlVl+iJo10FEUEYJTlpGkyK5VxPB/zJ3/5Tv7kL/+CG++8jWilj0oixq7EVWU9uD+n9p9eWJ6JJsPp7Hi2cIWdWWeXjj+EMLOInlVbW8JyobF6Gryq5/Gb7RTX0MqX03KDJQSMNwsWxzrB0vLJnG5gC4ulPk2MQfud2bEvH247xlIvCcsAsbEUG0NiE9FLUrKTAxJt+bbnfivf9T3fzeGT67z1bb/O5z7/ebxRdHs9TBqzfuwo8fZtdbxli7awDAqCDnUM59RtFD/NxBY8Lsvq17Vi+67dDMcjqsEIs7pauxiPJ3UmYeainFlvB1AVcRxRbJxgdccqj/6mh/LQh1xGpALDjeN0eymFq1PaG23r+oHBYm1CnjmOHV/n2o9+nNtuPUB3bRdeabLjJ6HbAROBCujSsdbrceLIUcKk4MXf8nze9NrXs6u/jT4xhrre6tl+H7/RuLd/2O/t/Qv3b+T6E4R7D/n+Cfc29ythuRm/pfWuHtIrhhsD0jimm3Qo8hznAmkvZeJr7fHp277C/3jnn/FXf/9ujm0cR6+tknQ7s+Kvdxt194KvZ4erlpxkZ8KtvY+lvxfwp7fuhlbZk6XEP1qpuZnQh8U4ymbXW4nMdpxle+dtN9lNDanPU1PSQod6105NteEZLLynvoEuCcuWdVR5iLShoy3VcELs4AmPfgzf9eKX8uTHPYGOjRgDH/7yZ3nDL7yRO48cJk4Tjh0/xvbz9nDy6JFahLX31mqfV9RJcdIEgoOigqrEakNnmvo6spbBcEjhXd02G89S4ppOgptMMKElLNW0/1Sory2tUFSE0QbpaodnP+3J7D9vDxsnj3Levl2cOHmU1dU+Ze4pi4qV7jaKzJFnFdu27+LwoWO894Mf5rbbD2KSFIdCxxHaRFTFhNjGVNkE64GsJPWK5zzl6fzia3+OvatrdJQ9pbA8/Xn5xuDe/mG/t/cv3L9R53gBnTHG/6vOuX4B7u32C/dnzv37d64tkOv//s79WlguWwahHoyXeBSKCIsOAXxAaV1/X1wgRIpBUVHGmgLFx7/wGf70r/8X/3zNBzi8foK018ctxfaF2T43t2Ozjpq3q21ZXH7cdDyzjZxCWG7ZCSxZ/abxeKejXbOrbW2cPdY1idrtXWzOvNbapsK3uFO4py5vpF5Ms52WsKw0i9u4Cy7RAKHpv5aVUlFnuzUBoqAoRyMeeskD+c4XvoRve9Zz2Le6RgAq78m1RgPvu+E6fu7N/5WvHLydtb27OXz8KEm/R1l5vFoUlLDotgtAkaGjmEgrivEE5QORNSg0lXfYJEZFlklR1+3UNsZPRqANqp0gaQthST4hXemSDU+y0u/yrGc8jQsv2M/G+lH6KzHj4TpGWTpxiqsCRlmMScgmJTbqcOzEBh/80Ic5cOchdNzBO18LXO8xscUNR3Q6PTom4uSdh1kxMS987vN59U/8JBft2IsFTKD+fm3q/62f35VzeG9ybwu7e3v/wv0bEZb3dvuF+zMiLIV7m/uksDwXtqqnt5zBsqhKbBTjgIkrsSaiIPCeD/4z73zXu3j/DR9j6Eu0NajIkodAiSeYqRmtrgQMaDAWM639GJyH4AjBoXTLCojGE2YWQKPqGMZwyjuAXxSgpznFWyVRqTd7DpdFaD1uYRlti8mwZYbQcPr9z5LoLG6z3pUieA+6lUCpEcpKoXTt6Bucr5PihDoZkp5uw2tFpRU4B0phbUyiFKp06KJAlY6L9+zjec/+N7zo+S/gQedfjJkepqaW1NoFKgKV0fy/H/on3vyO3+aLdx7A9rtMyoIoTilGIzAxnU6HyXAEUUTUSSmH63WtSPxM0EIrblb5BVddR9j0Q7D5nM6iSqf9UWJii9FQFBk6wHn79vLwhz+UB116McONw6x0Y7yvCJWbFUuvqoo07VKWjqS7woHbj3DtdR/nwO2HQMe1K2xTKyZQl0sZDOl1erhxDlnBi573At7yxjeh8oqdSQcL+Ka+patA6wUX3rBc9X5KO554+ZhFGAmCIAiCIHztEWG5BafKWDlfoX6hCp6qqtDWYJTBBcd6kfOuD72PP//ff80HP/JhVBrRW9tBHhy5r1DWUNUZcFC+zvRJVYsYY+rBvnPl1LrUWPXmyXLa7TuVsFy2xJ6q3MipXRE3i5W7xPJ274KwrFf3rRjKLR6n5WAWXtdNCRY1tYia+faWhGXwvo5ZpBaYOtRiXQOFd0S9Htl4TGQj+lHE8PhJyo0BVzz4YTzriU/mxd/27Zy/ey+7u/2506wPaA3GBVQVwBoGxZg8Nbz7+g/zS7/163zxtgN01lYZrG8Q91cgaIqyqAXZVEVGcUSZZRD8pnnzLWMSw5mF5cwCPn1DqYB39eSFMQbnavF44UXnc9klF/HgS/czXD9KEhmiyDAeD0nSiE6nw2AwwMYpRRno9tc4cvQk733fNdx54A5Md5WgDL7yUJRToemJjaUbJZSjCSEr+PbnfCu/9PqfZ0eUUmY529Kkdt3Ni3pSJUk2CcvZqW+hEWEpCIIgCILw9YIIyy04G2HpvMMDRpupC2SF1hqPZgLcPjrOP3/g/bzzr/+Sj33qU+hOTLLaZyMb410FcYSJEpRSsyyr3tdC1ViFC2EhAU/bdTRMk4ouC82mrV75JVfQLdxIT3v853ZJLH98UxIlpU5bWzOEcFphqVCbXIPnwrJuf9NfdS7UtulP1TUd4xhjDFVVEdy0Q52DsgIs21dWyUcTJoePsmfPebzoec/jxc97AQ+/7HL6WJr0TKGsMCpgrUXVFVAhQJHnmDQhp66F+lcffDe//Lbf5LbjR+hsW+X4sSMkO3aSDzawq9vrciVFhUljXFGyVZHjrT2EN/fjmYSl1uCqCqXrcilVVRCKgqTfZ8/OVR535SNY29YhiWOqqgRVYYxqZdrVVC4Qpz2Ujjlw60E+ecNnueW22wiFBxNP9xPRiRNGG8O6zmWvT7Y+JAqKH/qe7+OnfvwV7Ig6+LJgJYqp8oIojvFhHvvcPo9nKq+zXGJGEARBEARB+NohwnILziQsw1TcVMHXWVR1HdTn8YzLHBUlNLlJT5Rj/upv3sU7/9+/5gs334iziqTXJfN1eRJPoPKAd2AMNo6pmGYNDWEuAqcJbzQQ/DzxTbtpahpjGPRphOUZrIn1dk5/SZxOFE63cJfjvM68zdbWt3CPXKyjWQvLdlmR9jmMkoRyPIIsq+NR0xQ7TYxD5bGTksnxdfbt3c+3P/e5fMfzv42HXPpAthPXrpvB1fGOaGJTu9Z672euyiEEjLV1/UoV0CZmjONd738Pb33727jxztuJtvcZHTnC2oMv58Sdh0Ep4u4KxcZJiLeug3pPCcvgK2wUoZTCOYefTooopcAX7Nu1ymOvfBT7959H8BVaK5zP8WVFmqZUwaMwTLISHcX0utu48+ARrr3+Y3zlizcS9dcIQVGNRmAT4iimyAoSY+klKaPj66zEKS953rfxky//cc7ftoNsMmZbpzu9vluiejphsFVssQhLQRAEQRCErx9EWG7BmYRlXhYkcQLUMW7OOaypxUAASgJlVdXxkCbCAyddxt+/55/4q795F5/+0uc5OR5S4ums9OtamVVB6Rw6tnU5iibhSktYouoyHDMxMXMj1bN2B+VrYblwAKcRlqc49tNnhb1nL5mFUiLTp8vWqYX1zyAsl4VkE6valDPBGKgqTBTRTTsE5xkPh/iiwGJ43OUP5xnf/CSe+bRncOnFF9MjIpq2qcwzVpKUWX6gaXudK1A+oCJLU8XUqrrsxzgvsElMBvzv9/8j/+Wtb+ZYNaGMLEU2xqz0cXlRZ1BdWSUrJqdQkUvHzOK5OKWgXFohhNrCGoLDe49SavZ3VWQYSnatrfKoRz2SSy+5CO8LlIbIaCbZiCRJKAtHp9MjoMiygqTT48iRY1x37ce56cZbQcXYOKIqK9ARNoqo8hKrNF0TUY0yQlbwspf+W177kz/NjqRLNsnoJTFRK+GTUqcWloIgCIIgCMLXDyIst+BMwrJ0FcYY9DT20QNlVdaWKqWIbe0o6QPk3uEVKG1wwBjPNR+/ln943z/zd+/5R247cgjbS4k6KUErnFZUenPtyVo41VYl31h0Zuu0ZZhfeoRNvqmnOM6ztTKei7DcJBDa9S/bSX9Og1KndoX1s6wus5VhmpynsSoq50mimAjNaDjErw/Ytns3z3rWs3jOU5/O0x59NdvjLsm0oqcPARM8qTZ1vtsQ8FUtyrTWGN3sp25HgWaUjdie9lABXF5hUsugdITI8Pef+Cg//tr/zIkyp/QlxBEYQ6/TZ7SxAZH+qgrLKIoo8hx8hYljtNa1Ky6eyCgsgfFog127dnHFox7OpZdeTCeJKKsMX5V474miiDiOKUtHObVkBq84emydf37PBzl4651E21aJ4pTxyXWwcR07WXkSE6ErT1QF/CTnO7/jRfzsq/4zO5MeFrABzDSr7alqqorAFARBEARB+PpChOUWnElYNi6ERVVijJnF10E92PdFWVta7NSlUYELHq8UOYGAJsNz86EDvP+j1/C3//QPfPyznyavSjorq+TB4/TcMqeUmblYNk3zsxISzLOEKgCP9szKTcBcfJwpRq051nZWzq04J4vlTECeziR6OnslcxG39JpimrjIMFWdzQ4VxoNyHl15UhNRjiYkyvDQB17OM5/yNJ765CfzoEsvY0XFxNSbqLwjmopJ5yq0D/WEQn2W5/vWTaYZR+kDlTEYDFU2oZt0IMBkMKCzbYUMGAGfvPnzfMf3fTehGxP1OmRVST4YYvp9nHdn05PT5LmbheVWZXTaRJGlLArwHmUt2oBzDkLAaEWsFSo4xqMRO3Zt5+rHXMWFF+wDVZFGliLPSNOYMs+pqoper0cIgaIoSJMeh+7c4P3XfJTbbrwJs2073iiCh6jboxxOAE036aALRzXOYFLwvS/5t7z+1T9LRxt6aKKWsDyt9VwtPrb7QRAEQRAEQfjaIcJyC84kLP00q+jcwDZ3MfSVq0sn+DBLFIP3ENUiswoOpzROKSrAAQNyPvOlz/FX7/rf/P17/omNIsdPY968ApTBE3BNBlBTlxtxtIRlrZ8geLT3mLZ36V3IChsUOMUmi+Cm8iWny9p6qsd5g7bu+Jn10jQduzWnEJb1o58XiAx1LKxVmshRlwypPGtpj295xrN44XOfzyMufzC9uEMEs4Q8jYuxVar2QIZ5yRalCFVRTxpMd9kkwqlLnWqK4AgOUhvhKweVQ8d1QpvSezKjKJTimn/5JK949au49chBervWyPFUztfZdc7GInc3hSXBEzXtKQpQ9d8hBKoshwBpJya4iny0wfYdO3jKk5/AAy69iI31Y6z2uoyGA5IkIokMk9GYKIpI0ojRMCeJtnP05AZ/9+5/4ujxo5AkkBeobdsJeYVNulTDMdZEpBh8VpAGzbc/7/n84mteTx9NTF0KxkxdYc8kLkVYCoIgCIIg3LuIsNyCU5fhOMvPT2sQbk6UUwuGQCAYRVWvWQsKPAV1vcv3XfdR3vV//oaPfezjDMYjJmUBVpN2u3hTJw3KfYXXBpTC+7r+H9bUIiaEuiYmzDLOhhCmZTgUxhi893hf13JkmplWaw1a4aZJidr1H+e1I8Pi81N2wnLGo6Xtac1MtTWxj817IdR1PgMQRfO/lYIowk5LZISqghDQNprXWixL4jjCFSURmlA58vUNOnGH5z2rrj35xKuupoMhVWZmnWz0qJqJlM1lUFgu48L8mmi/My+DMY99rT9QH2/QMA4erzR/9b5/4A2/9hYOnDhCf+9O1gcDTJTgigIdx8RxTLZ+EuKYuN+j2NiY1rlkdn3NvH5D05bTWzzn8ahbnz8zdY21CoxVlGVOv5dy1aO/icc/7jEcvPMAvTTBu4LgSjpJCspTFTnWprjSEnf6fOXW2/ngtR/h4G23QxRDp1f3SVnX4ozjlGIwZiXpUAzHWBT//qX/jv/yE/+J2Hm6UQeFx6CpyoJYW5TWm647EZaCIAiCIAj3PiIst+BchSX4hcQuc5Gp5y8oCFrhlaIi4AmUQEVAUcdjbrgJ1153Pf/fu/+Wf/nC5zkx3ODIieOk/S5ZcJg4AhtR1gU1cAR8UWCMnlnYtNa1JXXaGGMM5WQCRte1NBvh6f1c/EURTRbaWbmHxvLqpxa1LTsoLD7OOlQtPm/20+yzEataTwXy1IW4eR9QWs8SF4XK1X83rsIh1CI5BKIA8dQ6ubZtO1c96gr+zdOfyeMf81j2bN+FDYEYXS8KLFO96KfnqF0ccZmWsGxEZVtQNoZZOzvveiZ6aqubmq1Uec96nhP3Orzro+/nDb/6Zr586HZWdu9gMBiSdvsUVYkvClQco6zBV01Sp9YOuaeF5bQUjHMobbCRoSzGaBU4f/9eLrv0Iq541CNYP3mUJNLE1pCNh3TSmE4Ss7ExpNddYzCcYJIuB48e5YMf/giH7jyI6q0QXKjrW5YebWIoPVFQJNpSZTm2dHz3C76DX371GxhmG6ylq2jAlQVpFJONxnQ6nYUWL7vDirAUBEEQBEH42iPCcgvONDA9k8BsXBHV1GN0Jiyb2MEQ6rg8xcxqVwvDeimCowy1gJumi8EBH/jUdfz5X7yT6z/1SYb5hNxVlArK4NHWoCNL6Wrrpfd+nm01TBugdZ0Rdebf2TSueZy+OC5A6bnQm22DxedtwdiyOuqkFoa+LRzb60/dhI0xszIXIdTZdb1zs9IreA9FAShMkmCUpizrzKK6Eb0+4KYxrSsrK+xe2c5D9l7A05/wzTzjaU/jgt3nY6n1YpPJVVFbKZu/Q2BekWNhRqB9Trf+e1bSZPpoAO2nFmul8Xq+jpm5dCqK8Zi43yUHxtR1Lt/827/BTQfvZHVtjZPHT9Lfscbw5Ami1RUq5whlUbuV+iVX1yWBGcLZCsutCXVAL9oYjFFUVUkoxpjI0O+lPP2pT2Tnjm3004iqzMAXaBXQBLS2BG/wKJK0Rxngy1+5hY/dcAMH7zxcd4ZTdTKfqEsnTphsjAiVY1t/hXx9wK60w/Of9Wze9JqfJ0LjQ0GqIiIUwTvsUrSwCEtBEARBEIR7HxGWW3BPCMt2QXe9LCw373GueFQtIhutUxGovMNoi6MuW6JNxGe/9Dmuue6jXPux6/nXL32B9cGAoBRl8NhOUtcaVAoTR3XWT+8oqgof/KKwbJSVbtxdFcrrqeZVCy60jQisqmpmzWyv0ywEt2i9nD2nFpRRRHCutsC5uj2qJTKrPCdJEuzUZTc4P+3DAK62TLqyQqPYtrLCvr3n8fCHP5ynPPFJPPaRj+RBK3uxzb6n51O3xJcx8xPYbtr8bMw/t9W53sr9tUED2jUqVc9iVmfv+Tq5k45j8DAoM0InpkTzt9f+M2/6b7/Kl24/QH/HDgZHj7Lvsgdy520HQEG8ukoxHtUW5YUGzY/t1C07O8JMgtfbUUrVFVq9g1Ci8Wzf1ufxV1/JAy7aj6aC4KmKMQTHan+FySQnjmOKMlABxsbceschrvvEDdz5lVuxq2sYE5EPMlCWyEa4oq6lGaMIgxFhMuHHfvhH+ImX/xhdHROj0d6T6ggdNrspt8WlCEtBEARBEISvPSIsz4K7MlCtXR89TU7LWfWLdgKSxh20cY2EBaFXlgUueJIkqWMogYkratdBoGRuBHXALUdv418//zk+/enP8sWbbuTzt9zMscE66+vrVK7CWEucpsRpgo4skyyrd60V6Hr7IYQ6G2nlsDaZJ4KZupk2zxshOXNDnf7dvB9CQEfz95RSs5IRjbhzzs22r1uCVQfAB5LIUhYZRZZTFAWuKLHasGP7dta2becBF17EJRddzNVXPYarHn0l+7btRVHLoQjoAKEswYdZkhpg0Y235R5cnzM19YRVZxSWCyd7CUWYZ+Rtnd5a8ExjLlG4oiBMhf9oem5zKv7x2mv4mbf8EkdGQ0IIjPMJKzvWmBQ51WSM6fU2Z41dtlieKXnPpuNYmvDwLGS6BTUV44HgC3w2ZNfeXTzuqiu47IGX4MsJoapIUoOrCmJrGI1G2KgD2lA6SNI+B+44xAev+TCHDh/H2rQWl+NaXMadlCLLoaxIAnSM4eShI/zQv/8BXvPKn2JnvA1fZfRtWltGl422Z+2mLgiCIAiCIHw1EGF5FpyLsJz/P0dP49hUUHV44fL2DeA9rqrdWk1kZzGUtaCs4zIbKVGHCAZccIyKjEPr69xy5x186Utf4ss33ciBAwe47c47OHT0CBujId1ej7wqKaoSp8BEFh3ZWaKfWVZWmIk+YJbwx1q7ZabZ5rXSFZv6L4RQi7/ATGw2CYKcc7NkQyoErAt00pg9u3Zz8YUXctEFF3LpxZfw4MsfxAMuvIi9u/cQoYmxdeIdwIV6G5G1JNM+JtSxo8G5WuQ2bsBTK6pvLLVaoaaJlMLUZndWBEVbz9TnsVF5W4i7acylUorheESv26vPXfBopRlPxuhOl3f/6yd4+at/msFoSO4qbBzhtSLqpmQbG5AmS9ud7nLWrHMUloF5cqUQYGr9VjpAqDDaU44HnLd3D4+56pE88OIL0CpQlhmaiuArjFZoY3EuUFWGKE0pCsWdhw/zwQ9cy9HbbseubscmKdn6ADpdojjFlQWR8xhX4YuK7OgJfuoVr+QVP/wj7IpWwZck2rbcihdOhyAIgiAIgnAvIcLyLLirrnXLWSo3D/PnFjzV2v5MZBpgavUKri5lUVvaGgUxzYrauGROy59opesYTWpLZiMXRlXFkWNHuePIIU6ur3PLHbdx4uRJDh45zOETx1jf2GBjOGBjY4NhNqEAMldSlmUd8ziLjZwm3GmJs4XYyyZ7bGwWXou0IbYRsbUYUz/X1DGWaRSzurrKeXv3sn//fnavrfGQB1zGjtUVztu7l907dtJV6fRYatEXT6uGKgAfsKj6/emLZfAoVfeX9x6r9Uxozjp6ugSl5gmMmLry6iWFsqRYNovJZr36Ba8BfMsFev7BoGCY5SSdLnmVY1B0bEyVF0Q2ZuIrjkaWT955I9/9su9FxxHaGgaTMW4yIt61k6JcFO6bQkLPVlieyjV7mm24mVCYuTfjUQTiSOFdTjkasW/fTh7/2Ks4b88OXFXSTS2T8TqrKz2qylMWFTaqn1eVptNf4eiRdd77wQ9x2823Em3bTphmfVVxShiPQUEnjglZQRI0k+PrvOrlr+DHfvCH6ZmInk1EWAqCIAiCIHydIcLyLLg7wrL9CEvZQ0NdH7Epb6GWVnJlgYmnmVHdNJENzF05g8I5h2llT/WhFl156Yg7MVWj+aYbr2o/z3r/QAXkvsIFT+kdG8MBx44d49j6SdaLjI3BgBMnTjAcDqmqamat9N5TFMXMRbaxUrZjLuM0npU1SZKEfq/Han+Ffr9PJ07Yt28f3bRDr9ejkySzJD4xEREagydG13lefImCOraO2jJrPER6ai1ssrmq+nnwHh9rSjyG2jKqAe8cIQSsXrRaLpdSccHXmXTbIuUUwnKTqJy+eCZhWSpF6R1WW7yrSE1Ub2tSQBpzTMMGjo9++mO86rWv4Y7jR1jZuUYWHKVrxchuEpR1D6kzXbA+zFxzt1pTKVNnCYZ57K2flnsxAaqyTtwbHKHMOW/PDp7w+Mdx0QXnM9g4ykrHMhqukyQpsU2YTHIim2CjlNFogtIxx05s8A///H7Wh0Ns3KUYDFEr2wjOYbXCFyV+krO9t8L42En8OOf1P/1qXvEDP0KCwhJqa/XdEJjL7zefn9cBPf3nBUEQBEEQhM2IsPwasdVg9ZRVLc7ijDRJSrZ6nKefWcRvkXRm2bYVTvH6QvvO0Da3xd7btrG2A+lW29JL7qhq4b3pa21D6dLu/JIh7nT9vNhvd59TiZKtRM9W6yyspxVDV+GN5Y/+5i/4xbf/FsfzEfQSiqrCmBhXlvUJrSpsv4dX4Acj6HfBlYC/m8etp5ZMPWtvLVR9va5y4CviJCK4ijIboW3EAy6+iIc//KFccsE+xhuH6XYiQuXwlSOKonpywjm6vRWyrKDTXeFLN93KNdd+nCOHjoJNaxdspesJlMqRdnpkgyHbun2qcUbsFa98+Y/xw9/7/axgUDiMCyRG16VKogRcRYiihSQ+7eNcLhEzPWKJ2RQEQRAEQThH7L3dgPsLdzVO866st9lCGrYUbKZJmLNFfGQbv1zOYokzlas40/ubTW139fNLWzuDmDvT5+4JEXGqbZzthMJCqYzS07eWY+MBL3v+SylU4E2/8VaUjvDaUw3WiVa3U+YVnW3bmIwnMJnQ2Xcek9HglG3cSoxvJS4V1PGpijoR0ex8+OmLhiIvsTYi6W8nn2R85cAdmChFa83F+3exfvwQSRTTTTtk4xFRbOikHQaDE8RJh9Fog4sv2k+SpLz/Q9dx8NbbUb1VbGRRylCMRuTTGOONPCO1hvWNEb/xjt+l3+/znS98CR0UHWPJipw0SU47G7J8nMs5s079oiAIgiAIgnA2iMXyfshWiXfuSc5cJ/GeFZb3NRQKHzyV1pTAAM+f/M1f8Ma3/gq5hXR1hY2Tx6fiMgM0ttulOjlA9TuEqtwyzvLsBLeeZa+dra5rP+MmKZCNLdV4CEqT9lJ85SjGY9Juj33n7eCxVzyMbb2UJLbgHFoFlAp4V063q9E6Joo7uGD4yoE7+PgnPs2BW2+fxncacKCiiMRGVHmJqjypjdCVZ3u3x2te+VO86Fu+FesdKzphMtpgpdufbl/NLJZbWYyb8i+NB7VYLAVBEARBEM4dsVjeDzl3i+PpEeF4bgQFk6IgSVK8L0iU5ruf/0JC4fnl3/kNNo6v01vbzmg4gsgQdXuUWQbWErIMrDnzTk5Jo7CaDMGeZROecw7iFB08ZeEwWhN1OlSV58Ctd0CV8+hHPox9e/cSlEehKIsc7x0r/T5ZXmKMYTTYABXxgIsvJIoivPfcfvNXsL01glK48YRMZSTdPkF7JnnBtl6f48MNXvfGN9DtJLzgqc/hyHjAzt4qo8mYXieFsLWohPo1PXWHXQ6jlfqXgiAIgiAIdx+xWAqbOFeLpgjHu09QTEvJaIpsQiftUJRVXX8U+J0//0Pe+ntvZxIrMhXQ3RRflpDnkPbA+akYPHNm2GUhNf97Hl8JfpYld/Z2kWH7fRIbkec5VVFiI41RFl9lmFCyc0efKx71KC656HzKPEMFRydNqKoCFcAFTxQl+ACuUtgk5Y47D3L9dZ/kllvvRNu67mq2sQE2odPtMtnYwJqIftrBTXL6NuGNr/lZXvjs52FwdIgoi4xunCwKy/Zxqnmca1tCt9cXa6UgCIIgCMJdRyyWgvB1Rl6VJDahl3ao8oJOFANwcn3Aj3/nv8emKW95x2+RDdbBWihLSFMoS1Rs68og58QZRGmSUFUVoap3ZIwheHA4jLKg4I47j+H9ZwC45MILMdrXolIZqrIkigxKKXxVolBoKvbsXOXqxz6a4XDMsdsPQrybdHWVbDSkcHWSosRGTMqS1bVVhic2ePXPv4Eoinje055DBiRxWmcOXm5zK0NyIyB1S1yGpfcEQRAEQRCEu4ZYLIVNnGuMpHD3qS1pispXpNrWgqh0eO9QSUyhYAT8zv/6Y37rD/+ADV9QGUU5GRFv30GxsQFxfJY7qx8Wy6f42R9zA+ZizGUUx7XrrXOoKCIyti4/U9UlXSIDiop8MmLv7t087uor2X/ebkJZECeWPBvR6/XIxiPKsmTbtjUq7xiPx3Q7K9xxx0ne+8FrOHLLAej3atHcKL+qAhOz2ukR8hKdV3RtzOt/+tW86DkvwFDRxxDRiptcKvmybLXcKtOwIAiCIAiCcNc4RYV04f5MCOG0i/DVJpBoS5HluKIAY9BRjM8rogAp8PKXfC8/9R9+jKQMlCc26G/fQTFYP3tReQ6Ukwk6ikj7fYwxFEVBWZYoZYiihNIHAhYTdTh4xyE+/JHrOXTkOP3VNcajjDjpMh6PiaKElZUVxuMhVTmh30uoyozdu7bz1Kc8kdXz94IviWMLOIgUpAm2GzNxJRNXYvodNrIxb3nbr/MP176fgKVC4WiVnZmKSUEQBEEQBOGrh1gsBeHrDNVYDcPSvE9QoMBpyAhkKH7nz/4Hv/GHv89Jl+ESW5cGCRptDN45UAqbxFRZBkUO/T5MXVjvrsWymY9Smz6vAY8rS6IkQhtFkQ0Jec7evbu46sor+KaHP5gTRw6RJhHB1/U2k8hQFBlVVZF2VxmNHf2V7Xzp5q/wgQ9/hJPHj0OnAyaC0oFNIM9Ju6tU44yVuEsxHLNr+xq/9Lqf41uufhIxHoNCOU+iLaGqwAdUFAHhlPVEBUEQBEEQhLuHWCwF4esIFai1XSvMcSaCpkKoHOd0Uags50e/6/v5mR/9j6RO0dMRnSSBssCXFYSAMYYqywGIt6/V8Zin5VxvCZqok1JWjrwoMVEHFcUcP7HBF790E5/5ly+wbW0XWV7iA0RRwiibYIxh27ZtFNmYlX7KeDxg3949PPEJj2dt7x7Ic5QK6DTGxgaMoQoep2BUZBBbDp48xmt/4Q28/xMfwaGpAGUsToGKLCqOpuVZBEEQBEEQhHsasVgKwtcRKgChsRrqBcvaLHNpCKDr9ybUyx+/+y953Vv+K4XRRHGCR5NNxhBH0yw1Htvt1JZLvWwJnW5/1oZ6/zOL3nJW2FNaLOvPGBtTZmMAosjiqxKXDYmTmB1rqzz1SY9nbfsKaazrjLE4bKTRwROCwmNBabRJyJ3nS7d8hes/eQMnDx9H9XqE3IOJiKKUSBuqSQ4hEJkIP5rw4H3n86bXvJbHXfEYlHckQRMrQ6wN4+GITq+7cHyz45CssIIgCIIgCHcbsVgKwtcxTYIZT1vo6Tr20kEoSxLgZd/yYt74kz/DijdkG0Os1vS6PSgrjNLYOKbaGNSusmfk3G4LZZ6DsWAiKh8ISmM7KzgUR46e4IPXXMuRoydAx2gbgTaUhWNSlGA0RZGhNGT5EB8KLr/0Uq6+8tHs2LObMB5j05gospTjIeP1dVRs0XHExJUkKz2+eOtXeNXPvZZP3/R5rE6ZuBKv67jLTr93TscmCIIgCIIgbI0IS0H4OmLm8qoB5VHBo6mXxiJYlSUmjvE40ijClxkp8H8//9/ysy9/BTu62xieGBDrmEjHuMIR22S6UTN93GJZiOlcej201z0VLf9dVceDhhBAG5Sx2KiDjmLuOHiEj17/SW49cBtmWssyKE2n26coS5JOzGQyAOWwBlQoufzSS/nmqx/L7j27cXmGrwq6/RUwirIsCVbjq5LMV9h+h5P5mO/7kR/iEzd/liTuMconZL6cCXSxSgqCIAiCINyziLAUhK8zglqqkBEWE8t4DU4BxlCUBb0oJQHCaMiPvOR7+Ikffjnb+iucOHSYyFqMh2KSgbHoZTfYTTs/91tClCTgqEuD2AiUoSxK8rIiirtEaYc7Dh7kuo/dwM1fuRUTdYiTlKryWBvjQ0XaibFW46sC5Soi5Tl/7x6e/IQnsHN1G279JFoFtu/YgQ+evChQnRTTS3FWMygzjg3Wedn//QN8/IufwiYJWhtKX21ZpbPdv5LERxAEQRAE4a4jwlIQvo4ICqrpMk0COxOWCk9QHm0jxlVOHiqiKMZVJcYHtiV9rPN8/4u/k5d99/ewd98+fOWwxlDlBdqYM+675iwtlcrXy1K2Ia+a92y93RDquFAPznmiKCGJO9xxx0FuuOFTHDp0hLx0ZHmOMpo8z0mSCIWnzDOs0bgyRznHAy68gKc/+Umcd9HFDI8eY2NwEhMZUJ4QHKMTJxi7AtvroJKI3FX86E+8go9/5gYUmsJVdRvP6SwJgiAIgiAIy4iwFIRvMDyexCZopQkEYhuB8+A9UVB0gFd/7w/xomc/h7hyaO+Ik4g0jfFFKytq2yzavLSFi2g7uU17Wab5rMsyMHFd2qMKBO+xSReTxORFgfMQtCHudDhyYoOP3/AZjp4c0Nu2k41RRhSnDAYDALrdLkWRYbSi108Ybpxgz+41nv30p7Jn/278eITWYIypLaVpQtRJGWUTiC2Z8tx+4iivesPr+MfrPoSJUsqmzuUp+lfcZAVBEARBEO46IiwF4esIFcCgMWhU0IRWrGOYvmZRWAIxCsPUImg0WIXW0M0KdgGv/aH/wPe84NtItaLIRozHA4gN+ApFoJOkUDk0BqsjyAq63e60JR61aWFxCfM2zhdAR+ACofKo6T/nHN57lDUUriIYS6ks46ziwOFjfPrzN3PzwRN0t+2mcHVG2KJ0VN7R6SRUVcZoeIL+aoQiY+/eFZ7ylMex/+J9lKN1XFlAcCgURZFTKUUVRxRphNm1nc8ePMDrf+NX+fCXP8MYqFCMypKAoqhK0IrKFaDFD1YQBEEQBOHuIMJSEL7OWLYILieb2cpy2F4njWL8cERfG37+P72al3zr84i8pxsndOKYKIkIVcVkMEDbOu7SWkuyssr46LFlI+aW+zy1xVJP3XbnZUgW0QQfKCtPFHfpru2i8IYv3Xwrn/vizRw6tkHaXWU0KQnKEMcxg8GAyhV0ezGT8QZKe06cPMp5e9Z40jc/jv0X7gdfgHcEX5J0OnV22eDIfcXIOcrI8pmbv8Sr3/jzfOCGa8mhdiMGiqrCe4+NIrxzd/l8CYIgCIIgCCIsBeE+RVDgfEXa79GxKQmG1/zHn+T7vuOlMJhQrg9RpSNKIsChE4PHkZ04RggB2+/PtnOmZZlFsbmFn+2UKEkIVUWe50DtxuonE2655RY+dcOnObG+Qdrpo3XEcFwQpx063T6uJfqiKEJrzb7z9vLNj7+aBz/ocjQVVBllXoDzaK0xUYQn0F9Zob99G5/78hf5rd99O9f/66dm7rBJJ0VpzXg8PmMcqiAIgiAIgrA1IiwF4T6GikwtmnxF8AWrOub1P/EqXvqc55MUgWo4ITEWtKYaj9GRhV6Xoihqi53yp5CEZ8NyMp/po5pHNCqlULa2mo6HExSGeGUbZen44o038YlPfpr1wQhtEpTSoC0hKFwViGwCeNLYkmdjsvEG+/ft4corHsYlF1+AjSNUcKAUYSouXVUyyiao2BL1Onzouo/y27//Dg6cOMTIFYAmr0qstXf7qAVBEARBEO7viLAUhPsQQdXRkcNigtaaJGi2YdmlO7zpJ1/Ny779JfSwTE4OiDsdiCKqfIJNLODxZVmLylbJkzMtm2IvdagXFVrP1XQJFJMJ1lriTh3PWRUFwSu0shA0X/7SV7j++k9w9Pg63d42sknJYJQRJenMUprnOXFs0CawsX6MHWurPPqRD+XC/bvxvsJYS3AB5wImSQgqsD4aMXYVnR3beN9Hr+H3//gPKXVgVE4w1hLHsbjCCoIgCIIg3E1EWArCfYzcl3TiDr5ytWWycKTAWtThZ370P/K9L/6/6ClLsT6kEydQVlTjWojGs+Q9nC5Q8uxQy3lXp38bg/e+dr2NYtCGsihwzpOmXTyGW289xPUfu4FbDtxB2lmh2+mTlw7vATTGKEIIBFeRRBqjPf1ewmUPvIRQVlg1dYOtKrQxRJ0OWEPa66LTGNNN+ZO/+Ave95FrIIqm6YkC6kx1PgVBEARBEIQtkVGUINzHSHTEcLhBaiN8UWKCRwXoAHs7fV798lfwXS94ITvilPLkBt1uh06vgzJQlNkmMXlXYizrOEt/iqUmiiK895RlWYtLa1HaEIKiKgNR1MHYhJtuuoXrrv8kh44ercVn5fBoPGDjlKLM6qQ+3RSNw5UZ5+3ZzcpKD+ccxhhwjnI4osxzQjYhxzPIM0JiyXD82m+/jUE1YVCO8RjkligIgiAIgnD3kFGUINzH8N6x1l9lMhqjo6iuJ+mnhUt8YKdNef1PvIrvesGL6DiFG2WEsiLgQJ9rEcdGQJ46SrMsS7TWRFEEgHMBpQxKKVzw5EWFV5a4s8LBQ0f50DXXctsdh+iv7sD5QFCa0WhEJ+3R7/dZXz/BeDxkZaVHFBvW1taohkPKLEcnCSpNsWlalxTB46ymIKDTmM/ffDP/44//BBPFFKECJUUsBUEQBEEQ7g4iLAXhPoQKECtQwdHpdCBMIyEV4CFSCuM8a1he8x9+nH//wpcSl55qPCG2FlyJQpHESa0NixJtTJ0t1buzdo2trZphaalfV0bjCVQu4IOqE+0wjddUhqA0SlucB1dUHDp2gn/9wpc5cNud9FbWyIqSOO3gUeRFRRynxHFKVVWEEBhOxsSr2wnez2Imq7KEJKndZ4NjUhVURhGv9Pjj/9+fc+DQnShlKL3b0horCIIgCIIgnB5JgygI9yFUu8rHVCAFNX1d1WGPMZqiqEg9vObHXwmR4Y/++p0URUWv32d04iSVUkTWopOEfDIBAkm/T55np93/uYqyAAQfKCpHnHZIkoTxeJ0v33QLURSRJAl79u5iMh4yGmVEWpEkCVoryjKncoEir3CutpwapQGFC2Eusq0B5ykJTFyJKnNu+OxnuHTvBRhtOJ21VRAEQRAEQdgasVgKwn2YxkroNdSWy4DLM5LIspYm9JTmdT/6n3jZi15CGI1xwwmrq9uxQVGuD6jygiiOQWmqqoKyugt7X84Xe3ZESYL3gbwoCdqgowQ3ybnxllv52A2f4djxdYxNWVndgTIJQUVo02EwLPjiF25kkmc470BplNIYpcAHCBrQtburUlQqUAbPuMj5+/e+h41yRKAdDSoIgiAIgiCcLWKxFIT7CY3l0qZpozHpakvuC37m5a8khMAf/+X/Iq9GRGkHn3YoJxmm3yOOY4rhCJL4DHvR1NLs7psulVIoYwhVwcQ7TGSJVreTlyVf+OKNrK8PeNjDHsKll1yCsSlZXnL02DE+97kv8ulP/QskvWlTNErV2WObVtXGyADBE7RBWYM3ig9ffy13HDnEyv4OHZlvEwRBEARBuMso7734fQnCfQgV/NwNduH1qWBSivFgQHd1BQdkOCoUDsWbfve/8bt/9qdMQmDvvvPYGA6YZBPifo8imxD3ehRlMd9omEtIFabiVSnCplIjZ08oPVGagvKUeQ7BY2NLCA6XFyiriLShk6TEicWXFePxmLIsQVsqbQGN8qq2VjqF9x5vFBhdN9SVoDSJMsR5SXb0JH/6e/+dZ139JPoorNwVBUEQBEEQ7hIyNS8I9zG8Bq8WQy3b9sM8y+iurpBVJQEwPtBBY13B637kJ3n5D/4QvU6HQ3cexGqDNhbnHBhTi7c2pzJMhnO4tRiDc662NFoLWlOVDu80UaeLNglFBRvjnPHYUVSaoBKU6WBsCsaCqa2V+IAKAaMUBoVWCpQGE4H3tRXTWLCGL934ZYzcEgVBEARBEO4WMooShPsQQYGjXmCq+5oyksGD8sSdlEE+QduIYT7GKE0UAt0S+ihe8X0v5zv/7b9jtd+nyHI6SQLOo1CEZWF52sboxWXzClsuNrH4UFHlOT4ElI3AWIJSOA8oQxSnKCyj4YTBcIIPGojJ86pO0hPmJkeNwiiNRhGcr98zpo6z9B4fAr2VVT79uX+hwEmMpSAIgiAIwt1AhKUg3Ec5VYZWDyRJwigb0U+6WKUJzmOjBJcVrAI/84M/xrc/699gXEWZTXBVQRQZlLWbtWCzv9btZDltj2Kambb12HKiXfhUVZagNUQRhEBwDpRCa00I4H2grCq0jeitbqfTW6GoPKV3xN0euFpYegJOUdfm1AoNKB/A+bpcpzGgFSWeqJNy4803M8hG59TngiAIgiAI91dEWArCfQgVwKAxaFTQtdhT8yXUdjssim1pF00twtQ09jBNIvrAmnO86ZU/xTMf+zjCOGO126UYDogiA1mG0ZrEJuigCVUgoAnGTo2Foc7COl3UNFGQCnphIdRZW8O0dmX9OG190PWiLFpZlFcEr2bWT6UsLlRM8jF5maGtQltF6YpalKJBK4JRlNpTKQd4IgWGgK9KMIrgCmw35eR4SNCG0WRMIEzrXUqgpSAIgiAIwtkiwlIQ7mM0Qq6hKTnSWDDnQm/zegAqL9huYnaaLr/6C2/iiVddhRuOiExEMR7T37aKy3Ly0QhfVaTdPlpbGAzorq6igkYHFpZ22xaYuci2b0Was701tY9tk4V2air1el5CRIV6y7N2KEUZPEErsrIgaHXW+xYEQRAEQRDmyAhKEIQFTBIRgIqSlTjl7W/9dR520aUkFezorjBc3wCjSFa6xL2UbDzAFxl6ZYXJxhCokwe1l4atBOCy+DxXNonXFgv7DwG0JoSAUoqyLNFabomCIAiCIAh3BxlFCYIwIyjwKDJXkBKxqjqs6pg/fccf8OjLH8rxm26lF6d005T86FGKIofIQlGQxsk0aY6fibf246liPr8WhJbArcuhQF0rRc2EZWwskTb3XiMFQRAEQRC+gRFhKQjCAkWoiEyMwhMDu6Iue5I+73jrr/Pkxz+RyckNVOWh1wNXoa1G97tMxkP0tJZlYIvHpWWZe9JyqU6xE6/Atd/QapY6aPv27cRxfM80QBAEQRAE4X6GCEtBEBYwyqCAcpKhvScKYEvPxas7+YPf/B2e+fgnMTp6nE6cknR6+I0BcRQRyqqudzklLD1+rTidK+wWa9f1Lp3n/P37SaPkq9UsQRAEQRCE+zQiLAVBWMCXJQbodbpopSknExKlsMBakvK2X/4Vnv74J1IcP0kYT1CRJRuP6qyyvXTT9pYT7JzKLbYpS/LVYGHfS9leDYrgPReefwEp0VepBYIgCIIgCPdtRFgKgjBDBehEMaGqCM5T5Tlxp4M1FldWdFXErniF3/2VX+MFT30WfmPMtqRLgkYbyLJsy21+Ldt/Vuupxj+3LsCiXWD39h13IR+tIAiCIAiC0EbGUIIgzFAB8A6rahdRG8cEAl4FoshiAOtK9kV9fuk1r+NFz3wO2ZHjWB9QIRBFBo0C7+ulwXkIAWPtzDTZTqjzVTmOJZrWBOew1kJZEkcxvijpRDEPv/zBdSkSauGp1L2YbUgQBEEQBOEbDBGWgiAs4pkFRjbuo40oM0DfRJjgOb+/xptf9wZe/C3PR+UVqbaUwyGuyEjiBMoKQqDb6aCNAe9xk8m9dFBzTBSBDxBFFBsD+kmHfTt3c/H5FxDx1XPHFQRBEARBuC8jwlIQhFPSiMpaZwY0gVCUdJWmA6wqw2v/00/ywud8C7H3rK1uJ9YWSkecpHTTDqPBAL+xgY5jTKdz6rSwXy22UIrOOag8UZQwOHGSK7/pUVy8cy/B+3u0pqYgCIIgCML9BRGWgiAsMg00bCfYUc3LfnrTCFCMMrYlHS5Y3c1/fsUr+dYnP4Ps2DpRUATnCM4z3hiAD8Rra+gArizvlUNawPlaa5Ylayur5BtDnvP0ZxIDFJVYLAVBEARBEO4GIiwFQZgxc33VEJQHPBqPCR499YfVxgLQ6aYoIAL2rWznv/7Ma/iOZz0bP85xeUlqI8gLIhvRTTtUgwFa3bu3HBXqJdEWXGD96HEec8WVfPNjrsYCqYm+psmGBEEQBEEQ7iuIsBQEYUZQUCkogaYipQ6tZDgBCLXCHI1HAGT5mD4Re6NVfuX1v8CLn/8CQlkxGgzZvmMnVVGyfvwERBFxHH+tD2lG+2YXKocxlnw04mXf/T3s7q5SZQ602CsFQRAEQRDuDiIsBUGY4YECqKbP6yyxzTJ9YgxHTxwj7fUIwErSxRDw4zE7dcrPvOqnef5zvxWrNVVRkkQRVhu6vT7ZYPC1PaAtdKIOUJYlaZLwzGc+i2c89Wm1q69aCCgVBEEQBEEQ7gIiLAVBWEAvPS5TlAU7d+ysnxc5riqxKLppBxUC59k+v/y6N/DcpzyN8fHjdexi5ZgMR6goqjdyBsOgV4tL2GrhLDRgawU/fUFrDc6zknR4+ff/ALviVSIgiurXxRdWEARBEAThriPCUhCEGRqI0CRoTJPFR2nQ00VpoiiCEFAE0jgmMpYQajFmFJhQsZeYX/0vP88zrn4Cw8NH2dbpkFpDKHPqMEtXu9Qq8Erjq0BwoJUFPCg/q3c5NSfOF6PrR1VXnaxz1daLD3WaIa0tRum65EmWA2Ajg59mfVVFwSt/8Id4yuVXkgIqOEJZQiS3REEQBEEQhLuDjKIEQZihApjpopZqWTZLe922cS+o+oayoiyqKthmY97xa7/OlQ/7Jo4euI1IG9K0QxiNakuitTAVpHGaYKylLIrpxs66xbN2NG3xrqLKM1yeo4wl6vYwQeGyghjN+MgRXvGDP8y3P/PZxARiPLEyqMgwjywVBEEQBEEQ7goiLAVBuMdQAUYbQ/o2po+lqyz/8x3/D1c98gpGR4/TUYY47dbWUB9q19N8QjHaoHQVaa+LYipu/bS8ydKy8HoAg8KgsFMjZ7zSBV9g+z1WV1cpNwYwKVi1CfnRk/y7F7yY//CdL2N/uhOoiNC1wFUgAZaCIAiCIAh3D+W9l5GUIAj3GAqF84FgFMNQUSjF7SeP8oJ/91JuO3KQ3p5dFHic0ihrsNbiCFRFBUWJSaIFa+mm7StVu976gFIK3dzBfKBSAV9NMNu34U6sQ1bQX13DD8es2IQnPOpK/ut/eT0Xr+3F+4JEWyI02WRCp5Pgqgptoq9ZXwmCIAiCINxXEIulIAj3GGqaUccEhfbQV5YUxc5enz96++/xkEseSHFiQOygozU+z8iHQ0LliNOYuNeZbastKsMWC1rV7rlazRL8eAL0e7iqBKXobVsj9RBGGU+54rH81i/+Mg9c20sK9LDEQRMqR5Ik9Xal3IggCIIgCMLdQiyWgiDcY6gAxTgn7qaEAKV3EBlKYBgqPvPlL/Dqn/85bj10JycnQ+KVHibtMMkzyrKAyGKMmW1vZoxUtdurV7Xra5MsSCs126/3Hhc8uAKiiJUoZXj4KKtE/Nj3/gA//n3fz+5OH19UxNqCBl8U6MiC0RRVjrEReiszqSAIgiAIgnBaRFgKgnCPoQKg6logZVYQdWN8gJErUTbCA186fDvvfNdf87//7v9w8MQxVBJTBIcPgbjXYVSWC4Ky3jC1ylS1q22DDrVrLCHgvSc4T6SgOHkSHTRPeOSVfO8LX8q3Pu3p7E1XsH7qplHWT4J3qMiCVuRlgY1idJBboiAIgiAIwl1FhKUgCPcoCoUrCrSNURqcD/ip2+q4KjA2Jgf+5Stf5F3v/lv+8f3v5ZY7bqMMgRAZQhrh6pokp4yxhGkm2GmMZQiB4DzKVcSV52EPuIznPfs5PPeZz+by3eeTANoHoqBQCtw4x3QTUJBnGUknJQBZnpHGydesrwRBEARBEO4riLAUBOEepRGD81IkikBtfQxA7h1KGxywXo354s03cs1HP8J7P/ghPvOFz+E7McMyp6oqjDF0Oh2MtTjnKMsSAGMMCsjznHI0xsQxl1x0MQ+68BKe+qireOpjr+bhD3wIGijKnNhYUm1QHvRS5lfxfBUEQRAEQTh3RFgKgnCPUSfQmaMB1VJujcDMfe36qo3FA4NyzG133M7tRw9z/b98ltsPHuSmm27ijjvuYH04wHuPUgqlFNZaOp0Ou3fsZO/evew/bx+XXnopj3rkI3nEJZez4jx9ExEAF0Jdm3OalMdXHmMXlaSSO6AgCIIgCMI5I8JSEIR7jKDAtf5WNOKy9ZqqLZildwQFSplZplcPVMDIFZwcbDAcDsmyjLIsKaoS5xxWG3q9Hnt27mLH9h3EKEoCIXhSZegHoHKUVQlaYyKL0hpPk1E2zNpGq32nK3EiCIIgCIIgnB4RloIg3GM0Fstpnh0AzPQO0wg37z1aa1AK5x2lqwghoMy0puU0+yvTeMhmO82NqvnbeQg4lFMoHYiMwQJkZb1WZOuVFRSuxAPWRpuEpQmbrZYiLgVBEARBEO4aIiwFQbhHaYsytSQqoU60433tMGusBTV3ni2KijiKoU70Sgge50HpgFYGpSDPS7SByESoJltsCPjSE3AYGzd7gqYu5TS+07XiK9uWVBGWgiAIgiAI54YIS0EQ7lHOGLM4LQ/SEHB1VtfpYpWt19G6tc5cjNabUOhGfTa3sOlnnKsICoLzeAJmagmdbWu671O1U0SlIAiCIAjCXUeEpSAI9xiqCZZs+8IuCbXSFVhrZ2VDqmmmVxtFC+uFEKh8HbGptUYrvfC+mq6j2q8o6nhLVG2RpM5J68oKFTRWa1jaznL7RFgKgiAIgiDcdURYCoJwj3E2whJdWx9DCGitZwKTECjKss7+anT93vTDHiB4quCJtSUwt3Bq6myxhEAVPN4YylChAqQ6QgPBe3TQtRV0+ZYnwlIQBEEQBOGcEWEpCMI9ylYupucq1oKqt9s8nmldTx1D2W7P6T4nYlIQBEEQBOHcEGEpCIIgCIIgCIIgnBP6zKsIgiAIgiAIgiAIwqkRYSkIgiAIgiAIgiCcEyIsBUEQBEEQBEEQhHNChKUgCIIgCIIgCIJwToiwFARBEARBEARBEM4JEZaCIAiCIAiCIAjCOSHCUhAEQRAEQRAEQTgn/v/50WVhxjEczwAAAABJRU5ErkJggg=="
    _logo_raw = __import__('base64').b64decode(_LOGO_B64)

    FOREST     = rl_colors.HexColor('#1A4D2E')
    FOREST_DK  = rl_colors.HexColor('#14532D')
    LIME       = rl_colors.HexColor('#D9F99D')
    LIME_LT    = rl_colors.HexColor('#ECFCCB')
    GOLD_BG    = rl_colors.HexColor('#FEF9C3')
    GOLD_DK    = rl_colors.HexColor('#854D0E')
    GOLD_MID   = rl_colors.HexColor('#FDE047')
    RED_BG     = rl_colors.HexColor('#FEE2E2')
    RED_TXT    = rl_colors.HexColor('#DC2626')
    AMBER_BG   = rl_colors.HexColor('#FEF3C7')
    AMBER_TXT  = rl_colors.HexColor('#D97706')
    BLUE_BG    = rl_colors.HexColor('#DBEAFE')
    BLUE_TXT   = rl_colors.HexColor('#1D4ED8')
    GREY_BG    = rl_colors.HexColor('#F8F9FA')
    GREY_RULE  = rl_colors.HexColor('#E5E7EB')
    GREY_TXT   = rl_colors.HexColor('#6B7280')
    WHITE      = rl_colors.white
    NEAR_BLACK = rl_colors.HexColor('#1F2937')

    PW, PH = letter
    LM = RM = 0.65 * inch
    TM = BM = 0.55 * inch
    CW = PW - LM - RM
    LC = CW * 0.54
    RC = CW * 0.44
    G  = CW - LC - RC

    class _NC(rl_canvas.Canvas):
        def __init__(self, *a, **kw):
            super().__init__(*a, **kw)
            self._pages = []
        def showPage(self):
            self._pages.append(dict(self.__dict__))
            self._startPage()
        def save(self):
            n = len(self._pages)
            for state in self._pages:
                self.__dict__.update(state)
                self.setStrokeColor(GREY_RULE)
                self.setLineWidth(0.4)
                self.line(LM, BM - 6, PW - RM, BM - 6)
                self.setFillColor(GREY_TXT)
                self.setFont("Helvetica", 6.5)
                self.drawCentredString(
                    PW / 2, BM - 17,
                    f"Candidate Evaluation Report — Confidential | Generated by TalentLens  |  Page {self._pageNumber} of {n}"
                )
                super().showPage()
            super().save()

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        leftMargin=LM, rightMargin=RM,
        topMargin=0.30 * inch,
        bottomMargin=BM + 0.28 * inch,
    )

    base_styles = getSampleStyleSheet()
    def S(name, **kw):
        return ParagraphStyle(name, parent=base_styles['Normal'], **kw)

    sTitle = S('T',  fontName='Helvetica-Bold', fontSize=20, textColor=WHITE,      leading=25)
    sSub   = S('Su', fontName='Helvetica',      fontSize=8.5,textColor=LIME,       leading=12)
    sGen   = S('Gn', fontName='Helvetica',      fontSize=7,  textColor=GREY_TXT,   leading=10)
    sHdr   = S('Hd', fontName='Helvetica-Bold', fontSize=7.5,textColor=FOREST,     leading=10)
    sBody  = S('Bd', fontName='Helvetica',      fontSize=8.5,textColor=NEAR_BLACK, leading=12)
    sBold  = S('Bl', fontName='Helvetica-Bold', fontSize=8.5,textColor=NEAR_BLACK, leading=12)
    sSmall = S('Sm', fontName='Helvetica',      fontSize=7.5,textColor=GREY_TXT,   leading=11)
    sLink  = S('Lk', fontName='Helvetica',      fontSize=8.5,textColor=BLUE_TXT,   leading=12)
    sFB    = S('Fb', fontName='Helvetica',      fontSize=8,  textColor=NEAR_BLACK, leading=12)

    def _bar(score, fill_col, width, h=4):
        filled = max(2, int((score / 100) * width))
        empty  = max(0, int(width) - filled)
        cells, widths = [], []
        def _cell(w, bg):
            t = Table([[""]], colWidths=[w], rowHeights=[h])
            t.setStyle(TableStyle([
                ("BACKGROUND",    (0,0),(-1,-1), bg),
                ("TOPPADDING",    (0,0),(-1,-1), 0), ("BOTTOMPADDING",(0,0),(-1,-1), 0),
                ("LEFTPADDING",   (0,0),(-1,-1), 0), ("RIGHTPADDING",  (0,0),(-1,-1), 0),
            ]))
            return t
        if filled: cells.append(_cell(filled, fill_col)); widths.append(filled)
        if empty:  cells.append(_cell(empty,  GREY_RULE)); widths.append(empty)
        bar = Table([cells], colWidths=widths)
        bar.setStyle(TableStyle([
            ("TOPPADDING",    (0,0),(-1,-1), 0), ("BOTTOMPADDING",(0,0),(-1,-1), 0),
            ("LEFTPADDING",   (0,0),(-1,-1), 0), ("RIGHTPADDING",  (0,0),(-1,-1), 0),
        ]))
        return bar

    def two_col(L, R):
        def _w(items, w):
            t = Table([[i] for i in items], colWidths=[w])
            t.setStyle(TableStyle([
                ("TOPPADDING",    (0,0),(-1,-1), 1), ("BOTTOMPADDING",(0,0),(-1,-1), 1),
                ("LEFTPADDING",   (0,0),(-1,-1), 0), ("RIGHTPADDING",  (0,0),(-1,-1), 0),
                ("VALIGN",        (0,0),(-1,-1), "TOP"),
            ]))
            return t
        outer = Table([[_w(L, LC), _w(R, RC)]], colWidths=[LC + G / 2, RC + G / 2])
        outer.setStyle(TableStyle([
            ("VALIGN",        (0,0),(-1,-1), "TOP"),
            ("TOPPADDING",    (0,0),(-1,-1), 0), ("BOTTOMPADDING",(0,0),(-1,-1), 0),
            ("LEFTPADDING",   (0,0),(-1,-1), 0), ("RIGHTPADDING",  (0,0),(-1,-1), 0),
        ]))
        return outer

    def rule_hdr(label):
        accent = Table([[""]], colWidths=[4], rowHeights=[12])
        accent.setStyle(TableStyle([
            ("BACKGROUND",    (0,0),(-1,-1), FOREST),
            ("TOPPADDING",    (0,0),(-1,-1), 0), ("BOTTOMPADDING",(0,0),(-1,-1), 0),
            ("LEFTPADDING",   (0,0),(-1,-1), 0), ("RIGHTPADDING",  (0,0),(-1,-1), 0),
        ]))
        row = Table([[accent, Paragraph(f"<b>{label}</b>", sHdr)]], colWidths=[7, CW - 7])
        row.setStyle(TableStyle([
            ("TOPPADDING",    (0,0),(-1,-1), 0), ("BOTTOMPADDING",(0,0),(-1,-1), 0),
            ("LEFTPADDING",   (0,0),(-1,-1), 0), ("RIGHTPADDING",  (0,0),(-1,-1), 4),
            ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
        ]))
        return [
            HRFlowable(width=CW, thickness=0.4, color=GREY_RULE, spaceBefore=8, spaceAfter=3),
            row,
            Spacer(1, 4),
        ]

    # ── Resume data ────────────────────────────────────────────────────────────
    name   = resume.get("candidate_name") or "Unknown Candidate"
    role   = resume.get("job_title")      or "Position Not Specified"
    gen_at = datetime.now().strftime("%d %b %Y, %I:%M %p")
    score  = float(resume.get("ats_score", 0))

    if score >= 90:   sc, sb_col, sl = rl_colors.HexColor('#854D0E'), rl_colors.HexColor('#FEF9C3'), "Perfect Match"
    elif score >= 70: sc, sb_col, sl = rl_colors.HexColor('#713F12'), rl_colors.HexColor('#FEF08A'), "Good Match"
    elif score >= 40: sc, sb_col, sl = AMBER_TXT,                      AMBER_BG,                    "Moderate Match"
    else:             sc, sb_col, sl = RED_TXT,                        RED_BG,                      "Low Match"

    story = []

    # ═══════════════════════════════════════════════════════════════════════════
    #  SECTION 1 — Professional banner header
    #  Dark-green full-width bar: cropped logo on LEFT, report label on RIGHT
    # ═══════════════════════════════════════════════════════════════════════════
    try:
        _LOGO_ASPECT = 918 / 345          # cropped image pixel dimensions
        _BAR_H       = 0.70 * inch        # banner bar height
        _LOGO_H      = _BAR_H - 14        # 7 pt top + 7 pt bottom padding
        _LOGO_W      = _LOGO_H * _LOGO_ASPECT
        _LEFT_COL    = _LOGO_W + 16       # logo + left margin
        _RIGHT_COL   = CW - _LEFT_COL

        _logo_img = RLImage(BytesIO(_logo_raw), width=_LOGO_W, height=_LOGO_H)

        _banner = Table(
            [[
                _logo_img,
                Paragraph(
                    "Resume Screening Report",
                    S("_brt", fontName="Helvetica-Bold", fontSize=10,
                      textColor=LIME_LT, alignment=2, leading=13)
                )
            ]],
            colWidths=[_LEFT_COL, _RIGHT_COL],
            rowHeights=[_BAR_H],
        )
        _banner.setStyle(TableStyle([
            ("BACKGROUND",    (0,0),(-1,-1), FOREST),
            ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
            ("TOPPADDING",    (0,0),(-1,-1), 7),
            ("BOTTOMPADDING", (0,0),(-1,-1), 7),
            ("LEFTPADDING",   (0,0),(0,0),   8),
            ("RIGHTPADDING",  (0,0),(0,0),   0),
            ("LEFTPADDING",   (1,0),(1,0),   6),
            ("RIGHTPADDING",  (1,0),(1,0),  12),
        ]))
        story.append(_banner)
        story.append(Spacer(1, 8))
    except Exception as _be:
        logger.warning(f"[PDF] Banner error: {_be}")

    # ═══════════════════════════════════════════════════════════════════════════
    #  SECTION 2 — Candidate + ATS score hero card
    # ═══════════════════════════════════════════════════════════════════════════
    hero_L = Table([
        [Paragraph(name, sTitle)],
        [Paragraph(f"{role}  •  {resume.get('analysis_type','single').title()} Screening", sSub)],
        [Paragraph(f"Report Generated: {gen_at}", sGen)],
    ], colWidths=[LC + 8])
    hero_L.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), FOREST),
        ("TOPPADDING",    (0,0),(-1,-1), 4),  ("BOTTOMPADDING",(0,0),(-1,-1), 4),
        ("LEFTPADDING",   (0,0),(-1,-1), 16), ("RIGHTPADDING",  (0,0),(-1,-1), 8),
    ]))

    hero_R = Table([
        [Paragraph(f"{score:.0f}%",
                   S("SN", fontName="Helvetica-Bold", fontSize=34,
                     textColor=sc, alignment=1, leading=40))],
        [Paragraph(f"<b>{sl}</b>",
                   S("SL", fontName="Helvetica-Bold", fontSize=9,
                     textColor=sc, alignment=1, leading=12))],
        [Paragraph("ATS Match Score",
                   S("SA", fontName="Helvetica", fontSize=7,
                     textColor=GREY_TXT, alignment=1, leading=9))],
    ], colWidths=[RC - 8])
    hero_R.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), sb_col),
        ("TOPPADDING",    (0,0),(-1,-1), 10), ("BOTTOMPADDING",(0,0),(-1,-1), 10),
        ("LEFTPADDING",   (0,0),(-1,-1), 6),  ("RIGHTPADDING",  (0,0),(-1,-1), 6),
        ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
    ]))

    hero = Table([[hero_L, hero_R]], colWidths=[LC + 8, RC - 8])
    hero.setStyle(TableStyle([
        ("LEFTPADDING",   (0,0),(-1,-1), 0), ("RIGHTPADDING",  (0,0),(-1,-1), 0),
        ("TOPPADDING",    (0,0),(-1,-1), 0), ("BOTTOMPADDING",(0,0),(-1,-1), 0),
        ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
    ]))
    story.append(hero)
    story.append(Spacer(1, 8))

    sb_data = resume.get("score_breakdown", {}) or {}

    # ── Score breakdown bar: only show dimensions with real scores ────────────
    all_dims = [
        ("Skills\n45%",     sb_data.get("skills_score",     0) or 0,  FOREST,                              True),
        ("Experience\n25%", sb_data.get("experience_score", None),     BLUE_TXT,                            sb_data.get("jd_has_exp_req", False)),
        ("Education\n10%",  sb_data.get("education_score",  None),     rl_colors.HexColor("#7C3AED"),        sb_data.get("jd_has_edu_req", False)),
        ("Seniority\n10%",  sb_data.get("title_score",      None),     AMBER_TXT,                           sb_data.get("jd_has_seniority", False)),
        ("Keywords\n10%",   sb_data.get("keyword_score",    0) or 0,   rl_colors.HexColor("#0891B2"),        True),
    ]
    dims = [(label, val, col) for label, val, col, show in all_dims if show and val is not None]

    col_w = CW / max(len(dims), 1)
    dim_cells = []
    for label, val, col in dims:
        bar = _bar(val, col, col_w - 16, h=4)
        cell = Table([
            [Paragraph(f"<b>{val:.0f}%</b>",
                       S("dv", fontName="Helvetica-Bold", fontSize=10,
                         textColor=col, alignment=1, leading=13))],
            [bar],
            [Paragraph(label, S("dl", fontName="Helvetica", fontSize=6.5,
                                textColor=GREY_TXT, alignment=1, leading=8))],
        ], colWidths=[col_w - 10])
        cell.setStyle(TableStyle([
            ("BACKGROUND",    (0,0),(-1,-1), GREY_BG),
            ("TOPPADDING",    (0,0),(-1,-1), 7),  ("BOTTOMPADDING",(0,0),(-1,-1), 7),
            ("LEFTPADDING",   (0,0),(-1,-1), 3),  ("RIGHTPADDING",  (0,0),(-1,-1), 3),
            ("ALIGN",         (0,1),(0,1), "CENTER"),
        ]))
        dim_cells.append(cell)

    if dim_cells:
        dim_t = Table([dim_cells], colWidths=[col_w] * len(dim_cells))
        dim_t.setStyle(TableStyle([
            ("LEFTPADDING",   (0,0),(-1,-1), 2), ("RIGHTPADDING",  (0,0),(-1,-1), 2),
            ("TOPPADDING",    (0,0),(-1,-1), 0), ("BOTTOMPADDING",(0,0),(-1,-1), 0),
            ("VALIGN",        (0,0),(-1,-1), "TOP"),
        ]))
        story.append(dim_t)
    story.append(Spacer(1, 8))

    story += rule_hdr("CANDIDATE INFORMATION")

    email   = resume.get("email")  or "Not provided"
    phone   = resume.get("phone")  or "Not provided"
    raw_txt = resume.get("resume_text", "") or ""
    # ── LinkedIn: robust extraction that handles PDF text-extraction artifacts ──
    # PDFs often break "prasen-nimje" into "prasen nimje" or "prasen\nnimje"
    # Strategy: extract clean URL token first; if it has no hyphen/dot, scan
    # ahead for up to 3 more name-like fragments and rejoin with hyphens.
    _LI_COMMON = {
        'for','at','email','phone','the','and','or','in','on','to','a','is','are',
        'was','contact','profile','view','see','visit','my','me','linkedin','github',
        'twitter','resume','cv','page','link','url','http','https','www','mobile',
    }
    def _li_name_fragment(w):
        return (bool(w) and w.lower() not in _LI_COMMON
                and len(w) >= 2 and bool(re.match(r'^[a-zA-Z][\w\.\-]*$', w)))

    def _extract_linkedin(txt):
        lm = re.search(
            r'(?:https?://)?(?:www\.)?linkedin\.com/in/([\w\.\-]+)(?:/|[?#]\S*)?',
            txt, re.I
        )
        if not lm:
            return None
        uname   = lm.group(1).strip('-')
        end_pos = lm.end()
        if '-' in uname or '.' in uname:   # already complete (has separator)
            return uname
        # Single token — scan ahead for broken PDF fragments
        parts = [uname]
        remaining = txt[end_pos:]
        pos = 0
        for _ in range(3):
            ahead = re.match(r'^[\s\n]+([\w\.\-]+)', remaining[pos:])
            if not ahead:
                break
            word = ahead.group(1)
            if _li_name_fragment(word):
                parts.append(word)
                pos += ahead.end()
            else:
                break
        return '-'.join(parts)

    _li_username = _extract_linkedin(raw_txt)
    gh_m = re.search(r'(?:https?://)?(?:www\.)?github\.com/([\w\-]+)(?:/[\w\.\-]*)?', raw_txt, re.I)
    pt_m = re.search(r'((?:https?://)?(?:[\w\-]+\.(?:io|dev|me|co|app)/[\w\-/]*))', raw_txt, re.I)
    linkedin  = f"https://www.linkedin.com/in/{_li_username}" if _li_username else None
    github    = f"https://github.com/{gh_m.group(1)}" if gh_m else None
    portfolio = pt_m.group(1) if pt_m and not _li_username and not gh_m else None

    def info_tbl(rows, lw, rw):
        data = [[Paragraph(f"<b>{r[0]}</b>", sBold),
                 Paragraph(str(r[1]), sLink if r[2] else sBody)]
                for r in rows]
        t = Table(data, colWidths=[lw, rw])
        t.setStyle(TableStyle([
            ("TOPPADDING",    (0,0),(-1,-1), 3.5), ("BOTTOMPADDING",(0,0),(-1,-1), 3.5),
            ("LEFTPADDING",   (0,0),(-1,-1), 0),   ("RIGHTPADDING",  (0,0),(-1,-1), 4),
            ("ROWBACKGROUNDS",(0,0),(-1,-1), [WHITE, GREY_BG]),
            ("LINEBELOW",     (0,0),(-1,-1), 0.25, GREY_RULE),
        ]))
        return t

    L_info = [("Full Name", name, False), ("Email", email, True),
              ("Phone", phone, False), ("Role Applied", role, False)]
    if linkedin:  L_info.append(("LinkedIn",  linkedin,  True))
    if github:    L_info.append(("GitHub",    github,    True))
    if portfolio: L_info.append(("Portfolio", portfolio, True))

    R_info = [
        ("Screening", resume.get("analysis_type", "single").title(), False),
        ("Uploaded",  (resume.get("created_at", "")[:10] if resume.get("created_at") else "N/A"), False),
        ("Report",    gen_at, False),
    ]

    LW = 0.9 * inch
    story.append(two_col(
        [info_tbl(L_info, LW, LC - LW - 4)],
        [info_tbl(R_info, LW, RC - LW - 4)],
    ))
    story.append(Spacer(1, 6))

    story += rule_hdr("SKILLS ANALYSIS")

    matched = resume.get("matched_skills", [])
    missing = resume.get("missing_skills", [])

    def skill_block(skills, bg, txt, hdr, emp, w):
        rows = [[Paragraph(f"<b>{hdr} ({len(skills)})</b>",
                           S("skh", fontName="Helvetica-Bold", fontSize=8,
                             textColor=txt, leading=11))]]
        if skills:
            for i in range(0, len(skills), 2):
                pair = skills[i:i+2]
                cells_p = [Paragraph(f"• {s}", S("sk", fontName="Helvetica",
                                                   fontSize=7.5, textColor=txt, leading=11))
                           for s in pair]
                while len(cells_p) < 2:
                    cells_p.append(Paragraph("", sSmall))
                rows.append(cells_p)
            t = Table(rows, colWidths=[(w / 2 - 8), (w / 2 - 8)])
        else:
            rows.append([Paragraph(emp, sSmall)])
            t = Table(rows, colWidths=[w - 16])
        t.setStyle(TableStyle([
            ("BACKGROUND",    (0,0),(-1,-1), bg),
            ("TOPPADDING",    (0,0),(-1,-1), 6), ("BOTTOMPADDING",(0,0),(-1,-1), 6),
            ("LEFTPADDING",   (0,0),(-1,-1), 8), ("RIGHTPADDING",  (0,0),(-1,-1), 8),
            ("SPAN",          (0,0),(-1,0)),
        ]))
        return t

    story.append(two_col(
        [skill_block(matched, LIME_LT, FOREST,  "Matched Skills", "No matched skills",         LC)],
        [skill_block(missing, RED_BG,  RED_TXT, "Missing Skills", "No gaps — perfect match!",  RC)],
    ))
    story.append(Spacer(1, 5))

    all_sk = resume.get("extracted_skills", [])
    if all_sk:
        story.append(Paragraph("<b>All Extracted Skills</b>", sBold))
        story.append(Spacer(1, 3))
        N = 8
        for i in range(0, len(all_sk), N):
            grp = all_sk[i:i+N]
            while len(grp) < N:
                grp.append("")
            ct = Table(
                [[Paragraph(sk, S("ck", fontName="Helvetica", fontSize=7,
                                  textColor=FOREST, leading=9, alignment=1))
                  for sk in grp]],
                colWidths=[CW / N] * N,
            )
            ct.setStyle(TableStyle([
                ("BACKGROUND",    (0,0),(-1,-1), LIME_LT),
                ("TOPPADDING",    (0,0),(-1,-1), 3), ("BOTTOMPADDING",(0,0),(-1,-1), 3),
                ("LEFTPADDING",   (0,0),(-1,-1), 2), ("RIGHTPADDING",  (0,0),(-1,-1), 2),
                ("GRID",          (0,0),(-1,-1), 0.3, WHITE),
            ]))
            story.append(ct)
    story.append(Spacer(1, 6))

    story += rule_hdr("JOB DESCRIPTION MATCH")

    jd_list = resume.get("jd_skills", [])
    exp_kw  = resume.get("experience_keywords", [])
    edu_kw  = resume.get("education_keywords", [])

    L_jd = []
    if jd_list:
        jdb = Table(
            [[Paragraph("  •  ".join(jd_list),
                        S("jd", fontName="Helvetica", fontSize=7.5,
                          textColor=BLUE_TXT, leading=12))]],
            colWidths=[LC],
        )
        jdb.setStyle(TableStyle([
            ("BACKGROUND",    (0,0),(-1,-1), BLUE_BG),
            ("TOPPADDING",    (0,0),(-1,-1), 7), ("BOTTOMPADDING",(0,0),(-1,-1), 7),
            ("LEFTPADDING",   (0,0),(-1,-1), 8), ("RIGHTPADDING",  (0,0),(-1,-1), 8),
        ]))
        L_jd = [Paragraph("<b>Required Skills</b>", sBold), Spacer(1, 3), jdb]
    else:
        L_jd = [Paragraph("No JD skills extracted.", sSmall)]

    R_jd = []
    for label, kws, bg, txt in [
        ("Experience", exp_kw, AMBER_BG, AMBER_TXT),
        ("Education",  edu_kw, BLUE_BG,  BLUE_TXT),
    ]:
        if kws:
            b = Table(
                [[Paragraph(f"<b>{label}:</b>  {', '.join(kws)}",
                            S("kw", fontName="Helvetica", fontSize=7.5,
                              textColor=txt, leading=11))]],
                colWidths=[RC],
            )
            b.setStyle(TableStyle([
                ("BACKGROUND",    (0,0),(-1,-1), bg),
                ("TOPPADDING",    (0,0),(-1,-1), 6), ("BOTTOMPADDING",(0,0),(-1,-1), 6),
                ("LEFTPADDING",   (0,0),(-1,-1), 8), ("RIGHTPADDING",  (0,0),(-1,-1), 8),
            ]))
            R_jd += [b, Spacer(1, 5)]

    if R_jd:
        story.append(two_col(L_jd, R_jd))
    else:
        for item in L_jd:
            story.append(item)
    story.append(Spacer(1, 6))

    story += rule_hdr("FEEDBACK & RECOMMENDATIONS")

    for i, fb in enumerate(resume.get("feedback", [])):
        is_pos  = any(x in fb for x in ["✅", "💪", "👍", "🗓️", "🎓", "🏅"])
        is_warn = any(x in fb for x in ["📚", "🎯", "🔑", "💡"])
        rbg = LIME_LT  if is_pos  else AMBER_BG if is_warn else RED_BG
        nc  = FOREST   if is_pos  else AMBER_TXT if is_warn else RED_TXT
        row = Table([
            [Paragraph(f"<b>{i+1:02d}</b>",
                       S("fn", fontName="Helvetica-Bold", fontSize=8,
                         textColor=nc, alignment=1, leading=11)),
             Paragraph(fb, sFB)]
        ], colWidths=[0.28 * inch, CW - 0.28 * inch])
        row.setStyle(TableStyle([
            ("BACKGROUND",    (0,0),(-1,-1), rbg),
            ("TOPPADDING",    (0,0),(-1,-1), 6),  ("BOTTOMPADDING",(0,0),(-1,-1), 6),
            ("LEFTPADDING",   (0,0),(0,-1),  8),
            ("LEFTPADDING",   (1,0),(1,-1),  6),
            ("RIGHTPADDING",  (0,0),(-1,-1), 8),
            ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
            ("LINEBELOW",     (0,0),(-1,-1), 0.3, WHITE),
        ]))
        story.append(row)
    story.append(Spacer(1, 8))

    story += rule_hdr("HIRING RECOMMENDATION")

    if score >= 90:
        vt, vs, vbg, vfg = "STRONGLY RECOMMENDED", "Perfect match — fast-track for interview.", rl_colors.HexColor("#FEF9C3"), rl_colors.HexColor("#854D0E")
    elif score >= 70:
        vt, vs, vbg, vfg = "RECOMMENDED", "Good match — solid interview candidate.", rl_colors.HexColor("#FEF08A"), rl_colors.HexColor("#713F12")
    elif score >= 40:
        vt, vs, vbg, vfg = "CONSIDER WITH CAUTION", "Moderate match — notable skill gaps exist.", AMBER_BG, AMBER_TXT
    else:
        vt, vs, vbg, vfg = "NOT RECOMMENDED", "Significant gaps — does not meet requirements.", RED_BG, RED_TXT

    verd = Table([
        [Paragraph(f"<b>{vt}</b>",
                   S("vti", fontName="Helvetica-Bold", fontSize=14,
                     textColor=vfg, alignment=1, leading=18))],
        [Paragraph(vs,
                   S("vsu", fontName="Helvetica", fontSize=8.5,
                     textColor=NEAR_BLACK, alignment=1, leading=12))],
    ], colWidths=[CW])
    verd.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), vbg),
        ("TOPPADDING",    (0,0),(-1,-1), 13), ("BOTTOMPADDING",(0,0),(-1,-1), 13),
        ("LEFTPADDING",   (0,0),(-1,-1), 16), ("RIGHTPADDING",  (0,0),(-1,-1), 16),
    ]))
    story.append(verd)

    doc.build(story, canvasmaker=_NC)
    return buf.getvalue()


# ==================== AUTH UTILITY FUNCTIONS ====================

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def verify_password(password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed_password.encode('utf-8'))

def generate_token() -> str:
    return f"token_{uuid.uuid4().hex}"


# ==================== API ENDPOINTS ====================

@api_router.get("/")
async def root():
    return {"message": "TalentLens AI API is running", "version": "1.0.0"}


# ==================== AUTH ENDPOINTS ====================

@api_router.post("/auth/signup")
async def signup(
    username: str = Form(...),
    email: str = Form(...),
    password: str = Form(...)
):
    try:
        existing_user = await db.users.find_one({"email": email})
        if existing_user:
            raise HTTPException(status_code=400, detail="Email already registered")
        user_id = str(uuid.uuid4())
        user_data = {
            "id": user_id, "username": username, "email": email,
            "password_hash": hash_password(password),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(user_data)
        token = generate_token()
        return {
            "success": True, "token": token,
            "user": {"id": user_id, "username": username, "email": email, "created_at": user_data["created_at"]},
            "message": "User registered successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during signup: {e}")
        raise HTTPException(status_code=500, detail=f"Registration error: {str(e)}")


@api_router.post("/auth/login")
async def login(email: str = Form(...), password: str = Form(...)):
    try:
        user = await db.users.find_one({"email": email})
        if not user:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        if not verify_password(password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        token = generate_token()
        return {
            "success": True, "token": token,
            "user": {"id": user["id"], "username": user["username"], "email": user["email"], "created_at": user["created_at"]},
            "message": "Login successful"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during login: {e}")
        raise HTTPException(status_code=500, detail=f"Login error: {str(e)}")


@api_router.post("/auth/verify")
async def verify_token(token: str = Form(...)):
    try:
        if not token:
            raise HTTPException(status_code=401, detail="Invalid token")
        return {"valid": True, "message": "Token is valid"}
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid token")


# ==================== RESUME ENDPOINTS ====================

@api_router.post("/upload-resume")
async def upload_resume(
    file: UploadFile = File(...),
    user_id: Optional[str] = Form(default=None),
    analysis_type: str = Form(default="single"),
    batch_id: Optional[str] = Form(default=None)
):
    filename = file.filename.lower()
    if not (filename.endswith('.pdf') or filename.endswith('.docx')):
        raise HTTPException(status_code=400, detail="Invalid file type. Only PDF and DOCX files are supported.")
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(filename).suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
        text = extract_text_from_pdf(tmp_path) if filename.endswith('.pdf') else extract_text_from_docx(tmp_path)
        os.unlink(tmp_path)
        if not text:
            raise HTTPException(status_code=400, detail="Could not extract text from the uploaded file.")
        contact_info = extract_contact_info(text)
        skills = extract_skills_advanced(text)  # NEW: Advanced Skill Extraction
        experience = extract_experience_keywords(text)
        education = extract_education_keywords(text)
        resume_id = str(uuid.uuid4())
        resume_data = {
            "id": resume_id, "user_id": user_id, "filename": file.filename,
            "candidate_name": contact_info["name"], "email": contact_info["email"], "phone": contact_info["phone"],
            "extracted_skills": skills, "experience_keywords": experience, "education_keywords": education,
            "resume_text": text, "analysis_type": analysis_type, "batch_id": batch_id,
            "file_bytes": base64.b64encode(content).decode("utf-8"),
            "file_mime": "application/pdf" if filename.endswith(".pdf") else "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.resumes.insert_one(resume_data)
        return {
            "id": resume_id, "filename": file.filename,
            "candidate_name": contact_info["name"], "email": contact_info["email"], "phone": contact_info["phone"],
            "extracted_skills": skills, "experience_keywords": experience, "education_keywords": education,
            "text_preview": text[:500] + "..." if len(text) > 500 else text
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing resume: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")


@api_router.post("/analyze")
async def analyze_resume(request: AnalyzeRequest):
    try:
        resume_skills = extract_skills_advanced(request.resume_text)  # NEW: Advanced Skill Extraction
        jd_skills = extract_required_skills_from_jd(request.job_description)
        ats_score, matched_skills, missing_skills, score_breakdown = calculate_ats_score(
            resume_skills, jd_skills, resume_text=request.resume_text,
            jd_text=request.job_description, job_title=request.job_title or "",
        )
        feedback = generate_feedback(ats_score, matched_skills, missing_skills, resume_skills,
                                     score_breakdown=score_breakdown, job_title=request.job_title or "")
        contact_info = extract_contact_info(request.resume_text)
        experience = extract_experience_keywords(request.resume_text)
        education = extract_education_keywords(request.resume_text)
        return {
            "ats_score": ats_score, "matched_skills": matched_skills, "missing_skills": missing_skills,
            "resume_skills": resume_skills, "jd_skills": jd_skills, "feedback": feedback,
            "score_breakdown": score_breakdown, "candidate_name": contact_info["name"],
            "email": contact_info["email"], "phone": contact_info["phone"],
            "experience_keywords": experience, "education_keywords": education
        }
    except Exception as e:
        logger.error(f"Error analyzing resume: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis error: {str(e)}")


@api_router.post("/analyze-uploaded/{resume_id}")
async def analyze_uploaded_resume(
    resume_id: str,
    job_description: str = Form(...),
    job_title: Optional[str] = Form(default=None),
    user_id: Optional[str] = Form(default=None)
):
    resume = await db.resumes.find_one({"id": resume_id}, {"_id": 0})
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    if user_id and resume.get("user_id") and resume.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    try:
        resume_text = resume.get("resume_text", "")
        resume_skills = resume.get("extracted_skills", [])
        jd_skills = extract_required_skills_from_jd(job_description)
        ats_score, matched_skills, missing_skills, score_breakdown = calculate_ats_score(
            resume_skills, jd_skills, resume_text=resume_text,
            jd_text=job_description, job_title=job_title or "",
        )
        feedback = generate_feedback(ats_score, matched_skills, missing_skills, resume_skills,
                                     score_breakdown=score_breakdown, job_title=job_title or "")
        analysis_data = {
            "ats_score": ats_score, "matched_skills": matched_skills, "missing_skills": missing_skills,
            "jd_skills": jd_skills, "feedback": feedback, "score_breakdown": score_breakdown,
            "job_title": job_title, "scan_mode": "manual", "analyzed_at": datetime.now(timezone.utc).isoformat()
        }
        await db.resumes.update_one({"id": resume_id}, {"$set": analysis_data})
        return {
            "id": resume_id, "filename": resume.get("filename"),
            "candidate_name": resume.get("candidate_name"), "email": resume.get("email"),
            "ats_score": ats_score, "matched_skills": matched_skills, "missing_skills": missing_skills,
            "resume_skills": resume_skills, "jd_skills": jd_skills, "feedback": feedback,
            "score_breakdown": score_breakdown, "job_title": job_title
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis error: {str(e)}")


@api_router.post("/bulk-upload")
async def bulk_upload_resumes(
    files: List[UploadFile] = File(...),
    job_description: str = Form(...),
    job_title: Optional[str] = Form(default=None),
    user_id: Optional[str] = Form(default=None)
):
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")
    batch_id = str(uuid.uuid4())
    jd_skills = extract_required_skills_from_jd(job_description)
    results = []
    errors = []
    jd_data = {
        "id": batch_id, "user_id": user_id, "title": job_title or "Untitled Position",
        "description": job_description, "required_skills": jd_skills,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.job_descriptions.insert_one(jd_data)
    for file in files:
        filename = file.filename.lower()
        if not (filename.endswith('.pdf') or filename.endswith('.docx')):
            errors.append({"filename": file.filename, "error": "Invalid file type"})
            continue
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=Path(filename).suffix) as tmp:
                content = await file.read()
                tmp.write(content)
                tmp_path = tmp.name
            text = extract_text_from_pdf(tmp_path) if filename.endswith('.pdf') else extract_text_from_docx(tmp_path)
            os.unlink(tmp_path)
            if not text:
                errors.append({"filename": file.filename, "error": "Could not extract text"})
                continue
            contact_info = extract_contact_info(text)
            resume_skills = extract_skills_advanced(text)  # NEW: Advanced Skill Extraction
            experience = extract_experience_keywords(text)
            education = extract_education_keywords(text)
            ats_score, matched_skills, missing_skills, score_breakdown = calculate_ats_score(
                resume_skills, jd_skills, resume_text=text, jd_text=job_description, job_title=job_title or "")
            feedback = generate_feedback(ats_score, matched_skills, missing_skills, resume_skills,
                                         score_breakdown=score_breakdown, job_title=job_title or "")
            resume_id = str(uuid.uuid4())
            resume_data = {
                "id": resume_id, "user_id": user_id, "filename": file.filename,
                "candidate_name": contact_info["name"], "email": contact_info["email"], "phone": contact_info["phone"],
                "extracted_skills": resume_skills, "experience_keywords": experience, "education_keywords": education,
                "resume_text": text, "ats_score": ats_score, "matched_skills": matched_skills,
                "missing_skills": missing_skills, "jd_skills": jd_skills, "feedback": feedback,
                "score_breakdown": score_breakdown, "job_title": job_title,
                "analysis_type": "bulk", "scan_mode": "manual", "batch_id": batch_id,
                "file_bytes": base64.b64encode(content).decode("utf-8"),
                "file_mime": "application/pdf" if file.filename.lower().endswith(".pdf") else "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.resumes.insert_one(resume_data)
            results.append({
                "id": resume_id, "filename": file.filename, "candidate_name": contact_info["name"],
                "email": contact_info["email"], "ats_score": ats_score,
                "matched_skills": matched_skills, "missing_skills": missing_skills, "feedback": feedback
            })
        except Exception as e:
            errors.append({"filename": file.filename, "error": str(e)})
    results.sort(key=lambda x: x["ats_score"], reverse=True)
    return {
        "batch_id": batch_id, "job_title": job_title, "total_uploaded": len(files),
        "successful": len(results), "failed": len(errors),
        "results": results, "errors": errors, "jd_skills": jd_skills
    }


# ==================== DASHBOARD ENDPOINTS ====================

@api_router.get("/dashboard")
async def get_dashboard(
    user_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    scan_mode: Optional[str] = None
):
    try:
        query: Dict[str, Any] = {"ats_score": {"$exists": True}}
        if user_id:
            query["user_id"] = user_id
        if scan_mode == "advanced":
            query["scan_mode"] = "advanced"
        elif scan_mode == "manual":
            query["scan_mode"] = "manual"
        if date_from or date_to:
            date_q: Dict[str, Any] = {}
            if date_from:
                date_q["$gte"] = date_from
            if date_to:
                date_q["$lte"] = date_to + "T23:59:59Z" if "T" not in date_to else date_to
            query["created_at"] = date_q
        resumes = await db.resumes.find(query, {"_id": 0, "resume_text": 0}).sort("ats_score", -1).to_list(1000)
        if not resumes:
            return {"resumes": [], "stats": {"total_resumes": 0, "average_score": 0, "top_candidates": 0,
                                              "score_distribution": {"excellent": 0, "good": 0, "moderate": 0, "low": 0}}}
        scores = [r["ats_score"] for r in resumes]
        avg_score = sum(scores) / len(scores) if scores else 0
        distribution = {
            "excellent": len([s for s in scores if s >= 80]),
            "good": len([s for s in scores if 60 <= s < 80]),
            "moderate": len([s for s in scores if 40 <= s < 60]),
            "low": len([s for s in scores if s < 40])
        }
        return {
            "resumes": resumes,
            "stats": {
                "total_resumes": len(resumes), "average_score": round(avg_score, 1),
                "top_candidates": len([s for s in scores if s >= 70]),
                "score_distribution": distribution
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching dashboard: {str(e)}")


@api_router.get("/dashboard/batch/{batch_id}")
async def get_batch_dashboard(batch_id: str, user_id: Optional[str] = None):
    try:
        if user_id:
            jd = await db.job_descriptions.find_one({"id": batch_id}, {"_id": 0})
            if jd and jd.get("user_id") and jd.get("user_id") != user_id:
                raise HTTPException(status_code=403, detail="Access denied")
        resumes = await db.resumes.find({"batch_id": batch_id}, {"_id": 0, "resume_text": 0}).sort("ats_score", -1).to_list(1000)
        if not resumes:
            raise HTTPException(status_code=404, detail="Batch not found")
        scores = [r.get("ats_score", 0) for r in resumes]
        avg_score = sum(scores) / len(scores) if scores else 0
        distribution = {
            "excellent": len([s for s in scores if s >= 80]),
            "good": len([s for s in scores if 60 <= s < 80]),
            "moderate": len([s for s in scores if 40 <= s < 60]),
            "low": len([s for s in scores if s < 40])
        }
        jd = await db.job_descriptions.find_one({"id": batch_id}, {"_id": 0})
        return {
            "batch_id": batch_id, "job_description": jd, "resumes": resumes,
            "stats": {
                "total_resumes": len(resumes), "average_score": round(avg_score, 1),
                "top_candidates": len([s for s in scores if s >= 70]),
                "score_distribution": distribution
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@api_router.get("/batches")
async def get_batches(user_id: Optional[str] = None):
    try:
        query = {}
        if user_id:
            query["user_id"] = user_id
        batches = await db.job_descriptions.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
        for batch in batches:
            count = await db.resumes.count_documents({"batch_id": batch["id"]})
            batch["resume_count"] = count
        return {"batches": batches}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


# ==================== RESUME DETAIL ENDPOINTS ====================

@api_router.get("/resume/{resume_id}")
async def get_resume(resume_id: str, user_id: Optional[str] = None):
    resume = await db.resumes.find_one({"id": resume_id}, {"_id": 0})
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    if user_id and resume.get("user_id") and resume.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    if "resume_text" in resume:
        resume["text_preview"] = resume["resume_text"][:1000] + "..." if len(resume.get("resume_text", "")) > 1000 else resume.get("resume_text", "")
        del resume["resume_text"]
    return resume


@api_router.get("/resume/{resume_id}/file")
async def get_resume_file(resume_id: str, user_id: Optional[str] = None):
    resume = await db.resumes.find_one({"id": resume_id}, {"_id": 0, "user_id": 1, "file_bytes": 1, "file_mime": 1, "filename": 1})
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    if user_id and resume.get("user_id") and resume.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    if not resume.get("file_bytes"):
        raise HTTPException(status_code=404, detail="Original file not available for this resume (uploaded before file storage was added)")
    file_bytes = base64.b64decode(resume["file_bytes"])
    mime = resume.get("file_mime", "application/octet-stream")
    filename = resume.get("filename", "resume")
    return StreamingResponse(
        iter([file_bytes]),
        media_type=mime,
        headers={"Content-Disposition": f'inline; filename="{filename}"'}
    )


@api_router.delete("/resume/{resume_id}")
async def delete_resume(resume_id: str, user_id: Optional[str] = None):
    resume = await db.resumes.find_one({"id": resume_id}, {"_id": 0, "user_id": 1})
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    if user_id and resume.get("user_id") and resume.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    result = await db.resumes.delete_one({"id": resume_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Resume not found")
    return {"message": "Resume deleted successfully", "id": resume_id}


@api_router.get("/resume/{resume_id}/report")
async def get_resume_report(resume_id: str, user_id: Optional[str] = None):
    try:
        resume = await db.resumes.find_one({"id": resume_id}, {"_id": 0})
        if not resume:
            raise HTTPException(status_code=404, detail="Resume not found")
        if user_id and resume.get("user_id") and resume.get("user_id") != user_id:
            raise HTTPException(status_code=403, detail="Access denied")
        pdf_bytes = _build_pdf_report(resume)
        safe_name = re.sub(r'[^\w\s-]', '', resume.get("candidate_name") or "Candidate")
        safe_name = safe_name.strip().replace(' ', '_') or "Candidate"
        filename = f"{safe_name}_resume_report.pdf"
        return StreamingResponse(
            iter([pdf_bytes]), media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating report: {str(e)}")


@api_router.get("/resume/{resume_id}/advanced-analysis")
async def get_advanced_analysis(resume_id: str, user_id: Optional[str] = None):
    resume = await db.resumes.find_one({"id": resume_id}, {"_id": 0})
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    if user_id and resume.get("user_id") and resume.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    resume_text = resume.get("resume_text", "")
    resume_skills = resume.get("extracted_skills", [])
    matched_skills = resume.get("matched_skills", [])
    missing_skills = resume.get("missing_skills", [])
    score_breakdown = resume.get("score_breakdown", {})
    ats_score = resume.get("ats_score", 0)
    job_title = resume.get("job_title", "")
    jd_skills = resume.get("jd_skills", [])

    top3_roles = detect_top3_roles(resume_skills, resume_text)
    strength = analyze_resume_strengths(resume_text, resume_skills, matched_skills, score_breakdown, ats_score)
    weakness = detect_resume_weaknesses(resume_text, resume_skills, missing_skills, score_breakdown, ats_score, job_title)
    suggestions = generate_ats_suggestions(resume_text, resume_skills, missing_skills, matched_skills,
                                            score_breakdown, ats_score, job_title, jd_skills)
    fit = calculate_candidate_fit_score(ats_score, strength, weakness, score_breakdown)

    return {
        "resume_id": resume_id,
        "candidate_name": resume.get("candidate_name"),
        "ats_score": ats_score,
        "top3_roles": top3_roles,
        "candidate_fit": fit,
        "strength_analysis": strength,
        "weakness_analysis": weakness,
        "ats_suggestions": suggestions,
    }


@api_router.post("/send-shortlist-emails")
async def send_shortlist_emails(request: ShortlistEmailRequest):
    results = []

    for resume_id in request.resume_ids:
        resume = await db.resumes.find_one({"id": resume_id}, {"_id": 0})
        if not resume:
            results.append({"resume_id": resume_id, "status": "error", "message": "Resume not found"})
            continue

        if request.user_id and resume.get("user_id") and resume.get("user_id") != request.user_id:
            results.append({"resume_id": resume_id, "status": "error", "message": "Access denied"})
            continue

        candidate_email = (request.email_overrides or {}).get(resume_id) or resume.get("email")
        if not candidate_email or not candidate_email.strip():
            results.append({
                "resume_id": resume_id,
                "status": "skipped",
                "message": f"No email address on file for {resume.get('candidate_name', 'candidate')}"
            })
            continue

        candidate_name = resume.get("candidate_name") or "Candidate"
        job_title = resume.get("job_title") or "the position"
        ats_score = resume.get("ats_score", 0)

        # ── Email type → subject + body ──────────────────────────────────────
        email_type = (request.email_type or "shortlist").lower().strip()

        # Auto subject per type (only if caller didn't supply one)
        _default_subjects = {
            "thanks_scanning":  "Thank You for Using TalentLens AI – Resume Scan Complete",
            "shortlist":        "Congratulations! You've Been Shortlisted",
            "interview_invite": "Interview Invitation – Next Step in Your Application",
            "next_round":       "Great News! You've Advanced to the Next Round",
            "rejection":        "Update on Your Application – TalentLens AI",
        }
        auto_subject = _default_subjects.get(email_type, _default_subjects["shortlist"])

        if request.body_template:
            # Caller provided a fully custom template — just fill placeholders
            body = (
                request.body_template
                .replace("{name}", candidate_name)
                .replace("{job_title}", job_title)
                .replace("{score}", str(ats_score))
                .replace("{email_type}", email_type)
            )
        elif email_type == "thanks_scanning":
            body = f"""Dear {candidate_name},

Thank you for using <b>TalentLens AI</b> to scan your resume!

We have successfully analysed your profile for the role of <b>{job_title}</b>.

Here is a quick summary of your results:
• <b>ATS Match Score:</b> {ats_score}%
• Your resume has been reviewed against the job requirements using our advanced AI screening engine.

<b>What this means for you:</b>
Your resume has been evaluated for keyword alignment, skill match, experience relevance, and overall ATS compatibility. {'Your score of ' + str(ats_score) + '% indicates a strong profile match — well done!' if ats_score >= 70 else 'There is room to strengthen your profile — consider updating your resume based on the detailed report attached.'}

{'📎 We have attached your full AI analysis report to this email for your reference.' if True else ''}

We hope TalentLens AI has given you valuable insights to improve your job application journey.

Warm regards,
TalentLens AI Team
"""
        elif email_type == "shortlist":
            body = f"""Dear {candidate_name},

Congratulations! 🎉

We are pleased to inform you that after carefully reviewing your application for the role of <b>{job_title}</b>, you have been <b>shortlisted</b> for the next stage of our selection process.

Your profile achieved an impressive ATS match score of <b>{ats_score}%</b>, reflecting strong alignment with our requirements.

Our recruitment team will be in touch shortly with further details regarding the next steps.

We look forward to speaking with you.

Best regards,
TalentLens AI Recruitment Team
"""
        elif email_type == "interview_invite":
            body = f"""Dear {candidate_name},

We are delighted to invite you for an <b>interview</b> for the role of <b>{job_title}</b>!

Your profile stood out during our screening process with an ATS score of <b>{ats_score}%</b>, and we would love to learn more about you.

Our team will follow up shortly with the interview schedule, format (in-person / video / phone), and any preparation materials.

Please feel free to reply to this email if you have any questions in the meantime.

We look forward to meeting you!

Best regards,
TalentLens AI Recruitment Team
"""
        elif email_type == "next_round":
            body = f"""Dear {candidate_name},

Great news! 🚀

We are thrilled to inform you that you have successfully advanced to the <b>next round</b> of the selection process for the role of <b>{job_title}</b>.

Your performance so far has been impressive, and we are excited to continue the process with you.

Our team will reach out very soon with details about the upcoming round. Please keep an eye on your inbox.

Congratulations on making it this far — keep up the great work!

Best regards,
TalentLens AI Recruitment Team
"""
        elif email_type == "rejection":
            body = f"""Dear {candidate_name},

Thank you for taking the time to apply for the role of <b>{job_title}</b> and for your interest in our organisation.

After careful consideration of all applications, we regret to inform you that we will not be moving forward with your application at this time. This was a difficult decision given the strong pool of candidates we received.

We want to encourage you — your ATS score of <b>{ats_score}%</b> demonstrates genuine skills and potential. We encourage you to keep refining your profile and to apply again for future opportunities that match your background.

We wish you all the very best in your job search.

Kind regards,
TalentLens AI Recruitment Team
"""
        else:
            # Fallback — shortlist template
            body = f"""Dear {candidate_name},

We are pleased to inform you that your application for <b>{job_title}</b> has been reviewed.

ATS Score: <b>{ats_score}%</b>

Our team will be in touch with further details.

Best regards,
TalentLens AI Recruitment Team
"""

        mail_username  = os.environ.get("MAIL_USERNAME", "").strip()
        mail_password  = os.environ.get("MAIL_PASSWORD", "").strip()
        mail_from      = os.environ.get("MAIL_FROM", mail_username).strip()
        mail_server    = os.environ.get("MAIL_SERVER", "smtp.gmail.com").strip()
        mail_port      = int(os.environ.get("MAIL_PORT", 587))
        mail_from_name = os.environ.get("MAIL_FROM_NAME", "TalentLens AI").strip()

        pdf_bytes = None
        pdf_filename = None
        if request.attach_report:
            try:
                pdf_bytes = _build_pdf_report(resume)
                safe_name = re.sub(r"[^\w\s-]", "", candidate_name).strip().replace(" ", "_") or "Candidate"
                pdf_filename = f"{safe_name}_TalentLens_Report.pdf"
            except Exception as pdf_err:
                logger.warning(f"[EMAIL] Could not generate PDF for {candidate_name}: {pdf_err}")
                pdf_bytes = None

        if mail_username and mail_password:
            try:
                mime_msg = MIMEMultipart("mixed")
                mime_msg["Subject"] = request.subject or auto_subject
                mime_msg["From"]    = f"{mail_from_name} <{mail_from}>"
                mime_msg["To"]      = candidate_email

                alt_part = MIMEMultipart("alternative")
                plain = re.sub(r"<[^>]+>", "", body).strip()
                alt_part.attach(MIMEText(plain, "plain", "utf-8"))

                # Colour theme per email type
                _theme = {
                    "thanks_scanning":  {"bg": "#f0fdf4", "grad1": "#16a34a", "grad2": "#15803d", "accent": "#dcfce7", "txt": "#14532d"},
                    "shortlist":        {"bg": "#f5f3ff", "grad1": "#7C3AED", "grad2": "#6D28D9", "accent": "#ede9fe", "txt": "#4c1d95"},
                    "interview_invite": {"bg": "#eff6ff", "grad1": "#2563eb", "grad2": "#1d4ed8", "accent": "#dbeafe", "txt": "#1e3a8a"},
                    "next_round":       {"bg": "#fff7ed", "grad1": "#ea580c", "grad2": "#c2410c", "accent": "#fed7aa", "txt": "#7c2d12"},
                    "rejection":        {"bg": "#f9fafb", "grad1": "#4b5563", "grad2": "#374151", "accent": "#e5e7eb", "txt": "#1f2937"},
                }.get(email_type, {"bg": "#f5f3ff", "grad1": "#7C3AED", "grad2": "#6D28D9", "accent": "#ede9fe", "txt": "#4c1d95"})

                _labels = {
                    "thanks_scanning":  ("TalentLens AI", "Resume Scan Complete"),
                    "shortlist":        ("TalentLens AI", "Shortlist Notification"),
                    "interview_invite": ("TalentLens AI", "Interview Invitation"),
                    "next_round":       ("TalentLens AI", "Next Round Advancement"),
                    "rejection":        ("TalentLens AI", "Application Update"),
                }.get(email_type, ("TalentLens AI", "Recruitment Update"))

                _badge_icons = {
                    "thanks_scanning": "🔍", "shortlist": "🎉",
                    "interview_invite": "📅", "next_round": "🚀", "rejection": "📋",
                }
                _badge_icon = _badge_icons.get(email_type, "✉️")

                html_body = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body {{ font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.75;
          margin: 0; padding: 0; background: {_theme['bg']}; }}
  .container {{ max-width: 600px; margin: 30px auto; background: #ffffff;
                border-radius: 14px; overflow: hidden;
                box-shadow: 0 4px 28px rgba(0,0,0,0.10); }}
  .header {{ background: linear-gradient(135deg, {_theme['grad1']}, {_theme['grad2']});
             padding: 28px 32px; }}
  .header-top {{ display: flex; align-items: center; gap: 12px; }}
  .header h1 {{ color: #ffffff; margin: 0; font-size: 22px; letter-spacing: -0.3px; }}
  .header p  {{ color: rgba(255,255,255,0.85); margin: 5px 0 0; font-size: 13px; }}
  .badge {{ display: inline-flex; align-items: center; gap: 6px;
            background: rgba(255,255,255,0.18); color: #fff;
            font-size: 12px; font-weight: 600; padding: 4px 12px;
            border-radius: 999px; margin-top: 10px; }}
  .score-row {{ background: {_theme['accent']}; border-radius: 10px;
                padding: 14px 20px; margin: 0 32px 0; text-align: center; }}
  .score-row .score-num {{ font-size: 36px; font-weight: 800;
                           color: {_theme['grad1']}; line-height: 1; }}
  .score-row .score-lbl {{ font-size: 12px; color: {_theme['txt']}; margin-top: 4px; }}
  .body {{ padding: 28px 32px; white-space: pre-wrap; color: #374151; line-height: 1.8; }}
  .divider {{ border: none; border-top: 1px solid {_theme['accent']}; margin: 0 32px; }}
  .attachment-note {{ margin: 0 32px 24px; background: {_theme['accent']};
                      border-radius: 8px; padding: 10px 16px;
                      font-size: 12px; color: {_theme['txt']}; }}
  .footer {{ background: {_theme['bg']}; padding: 16px 32px; text-align: center;
             font-size: 11px; color: #9ca3af;
             border-top: 1px solid {_theme['accent']}; }}
</style></head>
<body>
  <div class="container">
    <div class="header">
      <h1>{_labels[0]}</h1>
      <p>{_labels[1]}</p>
      <div class="badge">{_badge_icon} {_labels[1]}</div>
    </div>
    <div class="score-row">
      <div class="score-num">{ats_score}%</div>
      <div class="score-lbl">ATS Match Score</div>
    </div>
    <hr class="divider">
    <div class="body">{body}</div>
    {'<div class="attachment-note">📎 Your detailed AI analysis report is attached to this email.</div>' if pdf_bytes else ''}
    <div class="footer">
      This email was sent via <strong>TalentLens AI</strong> · Powered by advanced resume intelligence<br>
      © {datetime.now().year} TalentLens AI. All rights reserved.
    </div>
  </div>
</body></html>"""


                alt_part.attach(MIMEText(html_body, "html", "utf-8"))
                mime_msg.attach(alt_part)

                if pdf_bytes:
                    attachment = MIMEBase("application", "pdf")
                    attachment.set_payload(pdf_bytes)
                    encoders.encode_base64(attachment)
                    attachment.add_header(
                        "Content-Disposition",
                        f'attachment; filename="{pdf_filename}"'
                    )
                    mime_msg.attach(attachment)

                if mail_port == 465:
                    ctx = ssl.create_default_context()
                    with smtplib.SMTP_SSL(mail_server, mail_port, context=ctx, timeout=15) as server:
                        server.login(mail_username, mail_password)
                        server.sendmail(mail_from, [candidate_email], mime_msg.as_string())
                else:
                    with smtplib.SMTP(mail_server, mail_port, timeout=15) as server:
                        server.ehlo()
                        server.starttls(context=ssl.create_default_context())
                        server.ehlo()
                        server.login(mail_username, mail_password)
                        server.sendmail(mail_from, [candidate_email], mime_msg.as_string())

                status = "sent"
                msg    = f"Email sent to {candidate_email}" + (" (with PDF report)" if pdf_bytes else "")

            except smtplib.SMTPAuthenticationError:
                status = "error"
                msg    = "SMTP authentication failed. For Gmail use an App Password, not your account password."
            except smtplib.SMTPRecipientsRefused:
                status = "error"
                msg    = f"Recipient address refused by server: {candidate_email}"
            except smtplib.SMTPException as e:
                status = "error"
                msg    = f"SMTP error: {str(e)}"
            except Exception as e:
                status = "error"
                msg    = f"Unexpected error: {str(e)}"
        else:
            status = "demo"
            msg    = (
                "Demo mode: email was NOT sent. "
                "Add MAIL_USERNAME, MAIL_PASSWORD to your .env file to enable real sending."
            )

        await db.resumes.update_one(
            {"id": resume_id},
            {"$set": {
                "shortlist_email_sent":    status == "sent",
                "shortlist_email_sent_at": datetime.now(timezone.utc).isoformat(),
                "shortlist_email_status":  status,
                "shortlist_email_type":    email_type,
                "shortlist_email_message": msg,
            }}
        )

        results.append({
            "resume_id":      resume_id,
            "candidate_name": candidate_name,
            "email":          candidate_email,
            "status":         status,
            "message":        msg,
        })

    total_sent = len([r for r in results if r["status"] == "sent"])
    return {
        "total_requested": len(request.resume_ids),
        "total_sent":      total_sent,
        "total_demo":      len([r for r in results if r["status"] == "demo"]),
        "total_skipped":   len([r for r in results if r["status"] == "skipped"]),
        "total_errors":    len([r for r in results if r["status"] == "error"]),
        "results":         results,
        "demo_mode":       not bool(os.environ.get("MAIL_USERNAME", "").strip()),
    }


# ─────────────────────────────────────────────────────────────────────────────
#  ADVANCED SCAN ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

ROLE_PROFILES: Dict[str, Dict] = {
    "Software Engineer": {
        "skills": ["python","javascript","java","react","nodejs","sql","git","docker","aws","typescript"],
        "keywords": ["software","engineer","developer","programming","code","backend","frontend","fullstack"],
    },
    "Data Scientist": {
        "skills": ["python","machine learning","pandas","numpy","tensorflow","pytorch","sql","statistics","scikit-learn","data science"],
        "keywords": ["data","scientist","machine learning","model","analysis","prediction","dataset","feature"],
    },
    "DevOps Engineer": {
        "skills": ["docker","kubernetes","aws","azure","gcp","terraform","jenkins","linux","ci/cd","ansible"],
        "keywords": ["devops","infrastructure","deployment","pipeline","cloud","automation","sre","reliability"],
    },
    "Data Analyst": {
        "skills": ["sql","excel","python","tableau","power bi","data analysis","statistics","pandas","reporting"],
        "keywords": ["analyst","analysis","dashboard","report","insights","metrics","visualization","bi"],
    },
    "Frontend Developer": {
        "skills": ["react","javascript","typescript","html","css","vue","angular","tailwind","nextjs","figma"],
        "keywords": ["frontend","ui","interface","web","component","design","responsive","browser"],
    },
    "Backend Developer": {
        "skills": ["python","java","nodejs","sql","postgresql","mongodb","redis","docker","fastapi","django"],
        "keywords": ["backend","api","server","database","microservice","rest","graphql","endpoint"],
    },
    "Machine Learning Engineer": {
        "skills": ["python","tensorflow","pytorch","machine learning","deep learning","nlp","kubernetes","aws","mlops","scikit-learn"],
        "keywords": ["ml","model","training","inference","deployment","neural","pipeline","mlops"],
    },
    "Mobile Developer": {
        "skills": ["react native","flutter","android","ios","swift","kotlin","javascript","firebase","typescript"],
        "keywords": ["mobile","app","android","ios","native","flutter","cross-platform"],
    },
    "Cybersecurity Engineer": {
        "skills": ["cybersecurity","python","linux","penetration testing","security","authentication","encryption","aws","soc","jwt"],
        "keywords": ["security","cyber","threat","vulnerability","compliance","firewall","audit","intrusion"],
    },
    "Cloud Architect": {
        "skills": ["aws","azure","gcp","terraform","kubernetes","docker","serverless","lambda","cloudformation","linux"],
        "keywords": ["cloud","architecture","scalability","infrastructure","migration","multi-cloud","saas","paas"],
    },
    "UI/UX Designer": {
        "skills": ["figma","sketch","adobe","xd","ui/ux","html","css","javascript","prototyping","user research"],
        "keywords": ["design","ux","ui","wireframe","prototype","usability","interaction","visual"],
    },
    "Product Manager": {
        "skills": ["agile","scrum","jira","excel","data analysis","salesforce","presentation","project management"],
        "keywords": ["product","roadmap","strategy","stakeholder","requirement","delivery","kpi","backlog"],
    },
    "QA Engineer": {
        "skills": ["testing","selenium","cypress","jest","pytest","qa","automation testing","sql","python","jira"],
        "keywords": ["quality","test","automation","bug","regression","validation","qa","assurance"],
    },
    "Business Analyst": {
        "skills": ["excel","sql","power bi","tableau","project management","agile","jira","salesforce","erp","crm"],
        "keywords": ["business","analyst","requirement","process","stakeholder","workflow","gap","documentation"],
    },
}

def _detect_best_role(resume_text: str, resume_skills: List[str]) -> Dict:
    text_lower = resume_text.lower()
    resume_skill_lower = {s.lower() for s in resume_skills}
    best_role = None
    best_score = -1
    best_details = {}
    for role, profile in ROLE_PROFILES.items():
        role_skills = set(profile["skills"])
        matched = resume_skill_lower & role_skills
        skill_ratio = len(matched) / max(len(role_skills), 1)
        kw_hits = sum(1 for kw in profile["keywords"] if kw in text_lower)
        kw_ratio = kw_hits / max(len(profile["keywords"]), 1)
        combined = (skill_ratio * 0.70) + (kw_ratio * 0.30)
        if combined > best_score:
            best_score = combined
            best_role = role
            best_details = {"matched_skills": list(matched), "skill_ratio": skill_ratio, "kw_ratio": kw_ratio}
    confidence = round(best_score * 100, 1)
    role_profile = ROLE_PROFILES[best_role]
    synthetic_jd = (
        f"We are looking for a {best_role}. "
        f"Required skills: {', '.join(role_profile['skills'])}. "
        f"Key responsibilities involve: {', '.join(role_profile['keywords'])}."
    )
    jd_skills = [s.title() if len(s) > 3 else s.upper() for s in role_profile["skills"]]
    ats_score, matched_sk, missing_sk, score_breakdown = calculate_ats_score(
        resume_skills, jd_skills, resume_text=resume_text,
        jd_text=synthetic_jd, job_title=best_role,
    )
    return {
        "detected_role": best_role, "confidence": confidence,
        "synthetic_jd": synthetic_jd, "jd_skills": jd_skills,
        "ats_score": ats_score, "matched_skills": matched_sk,
        "missing_skills": missing_sk, "score_breakdown": score_breakdown,
    }


def _run_full_advanced_analysis(resume_text: str, resume_skills: List[str], detection: Dict, job_title: str) -> Dict:
    matched_skills = detection["matched_skills"]
    missing_skills = detection["missing_skills"]
    score_breakdown = detection["score_breakdown"]
    ats_score = detection["ats_score"]
    jd_skills = detection["jd_skills"]

    top3_roles = detect_top3_roles(resume_skills, resume_text)
    strength = analyze_resume_strengths(resume_text, resume_skills, matched_skills, score_breakdown, ats_score)
    weakness = detect_resume_weaknesses(resume_text, resume_skills, missing_skills, score_breakdown, ats_score, job_title)
    suggestions = generate_ats_suggestions(
        resume_text, resume_skills, missing_skills, matched_skills,
        score_breakdown, ats_score, job_title, jd_skills
    )
    fit = calculate_candidate_fit_score(ats_score, strength, weakness, score_breakdown)

    return {
        "top3_roles": top3_roles,
        "strength_analysis": strength,
        "weakness_analysis": weakness,
        "ats_suggestions": suggestions,
        "candidate_fit": fit,
    }


@api_router.post("/advanced-scan")
@api_router.post("/single-advanced-scan")
@api_router.post("/auto-detect-role")
async def advanced_single_scan(
    file: UploadFile = File(...),
    user_id: Optional[str] = Form(default=None),
):
    filename = file.filename.lower()
    if not (filename.endswith(".pdf") or filename.endswith(".docx")):
        raise HTTPException(status_code=400, detail="Only PDF and DOCX files are supported.")
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(filename).suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
        text = extract_text_from_pdf(tmp_path) if filename.endswith(".pdf") else extract_text_from_docx(tmp_path)
        os.unlink(tmp_path)
        if not text:
            raise HTTPException(status_code=400, detail="Could not extract text from file.")

        contact_info = extract_contact_info(text)
        resume_skills = extract_skills_advanced(text)  # NEW: Advanced Skill Extraction
        experience_kw = extract_experience_keywords(text)
        education_kw  = extract_education_keywords(text)
        detection = _detect_best_role(text, resume_skills)
        feedback = generate_feedback(
            detection["ats_score"], detection["matched_skills"], detection["missing_skills"],
            resume_skills, score_breakdown=detection["score_breakdown"], job_title=detection["detected_role"],
        )

        advanced = _run_full_advanced_analysis(text, resume_skills, detection, detection["detected_role"])

        resume_id = str(uuid.uuid4())
        resume_data = {
            "id": resume_id, "user_id": user_id, "filename": file.filename,
            "candidate_name": contact_info["name"], "email": contact_info["email"], "phone": contact_info["phone"],
            "extracted_skills": resume_skills, "experience_keywords": experience_kw, "education_keywords": education_kw,
            "resume_text": text, "ats_score": detection["ats_score"],
            "matched_skills": detection["matched_skills"], "missing_skills": detection["missing_skills"],
            "jd_skills": detection["jd_skills"], "feedback": feedback, "score_breakdown": detection["score_breakdown"],
            "job_title": detection["detected_role"], "detected_role": detection["detected_role"],
            "role_confidence": detection["confidence"],
            "top3_roles": advanced["top3_roles"],
            "candidate_fit": advanced["candidate_fit"],
            "strength_analysis": advanced["strength_analysis"],
            "weakness_analysis": advanced["weakness_analysis"],
            "ats_suggestions": advanced["ats_suggestions"],
            "analysis_type": "advanced_single", "scan_mode": "advanced",
            "file_bytes": base64.b64encode(content).decode("utf-8"),
            "file_mime": "application/pdf" if file.filename.lower().endswith(".pdf") else "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.resumes.insert_one(resume_data)

        return {
            "id": resume_id, "filename": file.filename,
            "candidate_name": contact_info["name"], "email": contact_info["email"], "phone": contact_info["phone"],
            "detected_role": detection["detected_role"], "role_confidence": detection["confidence"],
            "best_role": detection["detected_role"],
            "detected_roles": advanced["top3_roles"],
            "scan_mode": "advanced",
            "ats_score": detection["ats_score"], "matched_skills": detection["matched_skills"],
            "missing_skills": detection["missing_skills"], "resume_skills": resume_skills,
            "jd_skills": detection["jd_skills"], "feedback": feedback, "score_breakdown": detection["score_breakdown"],
            "experience_keywords": experience_kw, "education_keywords": education_kw,
            **advanced,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Advanced scan error: {e}")
        raise HTTPException(status_code=500, detail=f"Advanced scan error: {str(e)}")


@api_router.post("/advanced-bulk-scan")
@api_router.post("/bulk-advanced-scan")
async def advanced_bulk_scan(
    files: List[UploadFile] = File(...),
    user_id: Optional[str] = Form(default=None),
):
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")
    batch_id = str(uuid.uuid4())
    results = []
    errors = []
    batch_meta = {
        "id": batch_id, "user_id": user_id, "title": "Advanced Bulk Scan",
        "description": "Auto-detected roles", "required_skills": [],
        "scan_mode": "advanced", "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.job_descriptions.insert_one(batch_meta)

    for file in files:
        filename = file.filename.lower()
        if not (filename.endswith(".pdf") or filename.endswith(".docx")):
            errors.append({"filename": file.filename, "error": "Invalid file type"})
            continue
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=Path(filename).suffix) as tmp:
                content = await file.read()
                tmp.write(content)
                tmp_path = tmp.name
            text = extract_text_from_pdf(tmp_path) if filename.endswith(".pdf") else extract_text_from_docx(tmp_path)
            os.unlink(tmp_path)
            if not text:
                errors.append({"filename": file.filename, "error": "Could not extract text"})
                continue

            contact_info = extract_contact_info(text)
            resume_skills = extract_skills_advanced(text)  # NEW: Advanced Skill Extraction
            experience_kw = extract_experience_keywords(text)
            education_kw  = extract_education_keywords(text)
            detection = _detect_best_role(text, resume_skills)
            feedback = generate_feedback(
                detection["ats_score"], detection["matched_skills"], detection["missing_skills"],
                resume_skills, score_breakdown=detection["score_breakdown"], job_title=detection["detected_role"],
            )

            advanced = _run_full_advanced_analysis(text, resume_skills, detection, detection["detected_role"])

            resume_id = str(uuid.uuid4())
            resume_data = {
                "id": resume_id, "user_id": user_id, "filename": file.filename,
                "candidate_name": contact_info["name"], "email": contact_info["email"], "phone": contact_info["phone"],
                "extracted_skills": resume_skills, "experience_keywords": experience_kw, "education_keywords": education_kw,
                "resume_text": text, "ats_score": detection["ats_score"],
                "matched_skills": detection["matched_skills"], "missing_skills": detection["missing_skills"],
                "jd_skills": detection["jd_skills"], "feedback": feedback, "score_breakdown": detection["score_breakdown"],
                "job_title": detection["detected_role"], "detected_role": detection["detected_role"],
                "role_confidence": detection["confidence"],
                "top3_roles": advanced["top3_roles"],
                "candidate_fit": advanced["candidate_fit"],
                "strength_analysis": advanced["strength_analysis"],
                "weakness_analysis": advanced["weakness_analysis"],
                "ats_suggestions": advanced["ats_suggestions"],
                "analysis_type": "advanced_bulk", "scan_mode": "advanced",
                "batch_id": batch_id,
                "file_bytes": base64.b64encode(content).decode("utf-8"),
                "file_mime": "application/pdf" if file.filename.lower().endswith(".pdf") else "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.resumes.insert_one(resume_data)

            results.append({
                "id": resume_id, "filename": file.filename,
                "candidate_name": contact_info["name"], "email": contact_info["email"],
                "detected_role": detection["detected_role"], "role_confidence": detection["confidence"],
                "ats_score": detection["ats_score"], "matched_skills": detection["matched_skills"],
                "missing_skills": detection["missing_skills"], "feedback": feedback,
                "candidate_fit": advanced["candidate_fit"],
                "strength_analysis": advanced["strength_analysis"],
            })
        except Exception as e:
            logger.error(f"Advanced bulk error on {file.filename}: {e}")
            errors.append({"filename": file.filename, "error": str(e)})

    results.sort(key=lambda x: x["ats_score"], reverse=True)
    return {
        "batch_id": batch_id, "scan_mode": "advanced",
        "total_uploaded": len(files), "successful": len(results), "failed": len(errors),
        "results": results, "errors": errors,
    }


@api_router.get("/dashboard/advanced")
async def get_advanced_dashboard(
    user_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    try:
        query: Dict[str, Any] = {"ats_score": {"$exists": True}, "scan_mode": "advanced"}
        if user_id:
            query["user_id"] = user_id
        if date_from:
            query.setdefault("created_at", {})["$gte"] = date_from
        if date_to:
            query.setdefault("created_at", {})["$lte"] = date_to + "T23:59:59Z"
        resumes = await db.resumes.find(query, {"_id": 0, "resume_text": 0}).sort("created_at", -1).to_list(1000)
        if not resumes:
            return {"resumes": [], "stats": {"total_resumes": 0, "average_score": 0, "top_candidates": 0,
                                               "score_distribution": {"excellent": 0, "good": 0, "moderate": 0, "low": 0}}}
        scores = [r["ats_score"] for r in resumes]
        return {
            "resumes": resumes,
            "stats": {
                "total_resumes": len(resumes), "average_score": round(sum(scores)/len(scores), 1),
                "top_candidates": len([s for s in scores if s >= 70]),
                "score_distribution": {
                    "excellent": len([s for s in scores if s >= 80]),
                    "good":      len([s for s in scores if 60 <= s < 80]),
                    "moderate":  len([s for s in scores if 40 <= s < 60]),
                    "low":       len([s for s in scores if s < 40]),
                },
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3002", "http://127.0.0.1:3000", "http://127.0.0.1:3002"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_check():
    mail_user = os.environ.get("MAIL_USERNAME", "").strip()
    mail_pass = os.environ.get("MAIL_PASSWORD", "").strip()
    mail_from = os.environ.get("MAIL_FROM", mail_user).strip()
    mail_server = os.environ.get("MAIL_SERVER", "smtp.gmail.com").strip()
    mail_port = os.environ.get("MAIL_PORT", "587")

    if mail_user and mail_pass:
        logger.info(
            f"✅ [EMAIL] SMTP configured — server={mail_server}:{mail_port}, "
            f"from={mail_from or mail_user}. Emails will be sent for real."
        )
    else:
        logger.warning(
            "⚠️  [EMAIL] SMTP not configured — running in DEMO mode. "
            "Emails will NOT be delivered. "
            "Set MAIL_USERNAME, MAIL_PASSWORD in your .env file."
        )


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
