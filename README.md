# 🚀 TalentLens – NLP-Powered Advanced Automated Applicant Tracking System for Resume Analysis and Candidate Ranking.

## 📌 Overview

**TalentLens** is a full-stack, NLP-powered Applicant Tracking System (ATS) designed to automate resume screening, candidate ranking, and recruiter workflows. The system leverages advanced Natural Language Processing (NLP) techniques to analyze resumes beyond simple keyword matching, providing accurate, explainable, and scalable hiring insights.

---

## 🎯 Key Features

* 📄 Resume Parsing (PDF & DOCX)
* 🧠 NLP-Based Skill Extraction (280+ skills + synonyms)
* 🔍 Named Entity Recognition (NER) using spaCy
* 📊 Multi-dimensional ATS Scoring System
* 🤖 Automatic Job Role Detection (Top-3 predictions)
* 📈 Interactive Analytics Dashboard
* 📑 PDF Report Generation
* 📧 Email Automation for Recruiters
* ⚡ Manual + Advanced Screening Modes

---

## 🏗️ System Architecture

### 🔹 3-Tier Architecture

1. **Frontend (Presentation Layer)**

   * React.js (Vite)
   * Handles UI, dashboards, file uploads

2. **Backend (Application Layer)**

   * FastAPI (Python)
   * Handles NLP processing, scoring, APIs

3. **Database (Data Layer)**

   * MongoDB
   * Stores resumes, analysis, job descriptions

---

## ⚙️ Tech Stack

### 🔹 Frontend

* React.js
* Tailwind CSS
* Axios
* Recharts / Chart.js

### 🔹 Backend

* FastAPI
* Python 3.11+
* Pydantic
* Uvicorn

### 🔹 NLP & Processing

* spaCy (NER)
* Regex
* TF-IDF concepts
* Cosine Similarity

### 🔹 Database

* MongoDB (Motor - async driver)

### 🔹 Deployment

* Backend: Render
* Frontend: Vercel

---

## 📂 Project Structure

```
TalentLens/
│
├── backend/
│   ├── main.py                # FastAPI app entry point
│   ├── api/
│   │   └── routes.py         # API endpoints
│   ├── models/
│   │   └── schemas.py        # Pydantic models
│   ├── services/
│   │   ├── nlp_utils.py      # NLP processing functions
│   │   ├── scoring.py        # ATS scoring logic
│   │   ├── role_detection.py # Role prediction logic
│   │   ├── report.py         # PDF generation
│   │   └── email_service.py  # Email automation
│   ├── database/
│   │   └── db.py             # MongoDB connection
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   └── App.jsx
│   ├── index.html
│   └── package.json
│
├── .env
├── README.md
└── docker-compose.yml (optional)
```

---

## 🔄 Workflow

1. User uploads resume (PDF/DOCX)
2. Backend extracts text
3. NLP pipeline processes data:

   * Contact extraction (regex)
   * Skill extraction (keywords + synonyms)
   * NER (spaCy)
   * Semantic similarity
4. ATS score is calculated
5. Role detection (Advanced mode)
6. Results stored in MongoDB
7. Dashboard visualizes insights
8. PDF report + email automation available

---

## 🧠 NLP Pipeline Details

* **Text Extraction** → PyPDF2 / python-docx
* **Tokenization & Cleaning**
* **Skill Extraction** → 280+ keyword dictionary
* **Synonym Resolution** → JS → JavaScript
* **NER** → spaCy (ORG, PRODUCT)
* **Semantic Matching** → Cosine Similarity

---

## 📊 ATS Scoring Algorithm

| Parameter   | Weight |
| ----------- | ------ |
| Skills      | 45%    |
| Experience  | 25%    |
| Education   | 10%    |
| Title Match | 10%    |
| Keywords    | 10%    |

### Formula:

```
ATS Score = (Skill × 0.45) + (Experience × 0.25) + (Education × 0.10) + (Title × 0.10) + (Keywords × 0.10)
```

---

## 🚀 Setup & Installation

### 🔹 Backend Setup

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

### 🔹 Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

---

## 🌐 Deployment Guide

### 🔹 Backend (Render)

1. Push backend code to GitHub
2. Create new Web Service on Render
3. Set:

   * Build Command: `pip install -r requirements.txt`
   * Start Command: `uvicorn main:app --host 0.0.0.0 --port 10000`
4. Add environment variables (.env)

---

### 🔹 Frontend (Vercel)

1. Push frontend to GitHub
2. Import project in Vercel
3. Set build:

   * Framework: Vite / React
4. Add API base URL

---

## 🔐 Environment Variables

```
MONGO_URI=your_mongodb_uri
EMAIL_USER=your_email
EMAIL_PASS=your_password
SECRET_KEY=your_secret_key
```

---

## 📈 Future Enhancements

* OCR for scanned resumes
* Integration with job portals
* AI-based resume improvement suggestions
* Real-time collaboration for recruiters

---

## 👨‍💻 Contributors

* Prasen Nimje
* Mahesh Khumkar
* Nishant Chaudhari

---

## 📬 Contact

📧 [prasennimje100@gmail.com](mailto:prasennimje100@gmail.com)
🔗 LinkedIn: https://www.linkedin.com/in/prasen-nimje

---

## ⭐ If you like this project, give it a star!

