FROM python:3.11-bullseye

WORKDIR /app

# Install system dependencies (needed for spaCy)
RUN apt-get update && apt-get install -y \
    build-essential \
    gcc \
    g++ \
    python3-dev \
    libffi-dev \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip
RUN pip install --upgrade pip setuptools wheel

# Copy requirements
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Download spaCy model
RUN python -m spacy download en_core_web_sm

# Copy project
COPY . .

# Run FastAPI
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port $PORT"]
