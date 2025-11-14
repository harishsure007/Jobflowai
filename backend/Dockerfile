# 1) Use a lightweight Python image
FROM python:3.11-slim

# 2) Set work directory inside container
WORKDIR /app

# 3) Install system dependencies (optional, but safe)
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 4) Copy requirements and install
COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

# 5) Copy the rest of your backend code
COPY . .

# 6) App Runner will route traffic to this port
ENV PORT=8080

# 7) Start your Flask app
CMD ["python", "app.py"]
