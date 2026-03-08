# JobFlowAI - Complete Project Analysis

## 📋 Project Overview

**JobFlowAI** is a full-stack AI-powered job search and career development platform that helps users find jobs, enhance resumes, prepare for interviews, and manage their professional profiles.

**Tech Stack:**
- **Backend:** FastAPI (Python) + Flask
- **Frontend:** React 19 with React Router v7
- **Database:** PostgreSQL (with SQLAlchemy ORM)
- **Authentication:** JWT (JSON Web Tokens)
- **Payments:** Stripe integration
- **AI/ML:** OpenAI API, Sentence Transformers, Hugging Face models
- **Deployment:** Docker containerization

---

## 🏗️ Project Structure

```
JobFlowAI/
├── backend/                          # Python FastAPI backend
│   ├── main.py                       # FastAPI app entry point
│   ├── app.py                        # Flask app (legacy)
│   ├── models.py                     # SQLAlchemy ORM models
│   ├─�� database.py                   # Database configuration
│   ├── config.py                     # Configuration management
│   ├── constants.py                  # App constants
│   ├── security.py                   # Security utilities
│   ├── deps.py                       # Dependency injection
│   ├── deps_paywall.py               # Payment dependencies
│   │
│   ├── routes/                       # API endpoints
│   │   ├── auth.py                   # JWT authentication
│   │   ├── auth_reset.py             # Password reset & OTP
│   │   ├── jobs.py                   # Job search endpoints
│   │   ├── jobs_debug.py             # Debug job endpoints
│   │   ├── resume.py                 # Resume management
│   │   ├── resume_routes.py          # Resume routes (Flask)
│   │   ├── resume_cover.py           # Resume & cover letter generation
│   │   ├── parse.py                  # Resume parsing
│   │   ├── enhance.py                # Resume enhancement
│   │   ├── compare.py                # Resume comparison
│   │   ├── generate.py               # Content generation
│   │   ├── feedback.py               # Interview feedback
│   │   ├── profile.py                # User profile management
│   │   ├── payments.py               # Stripe payment handling
│   │   ├── trial.py                  # Trial management
│   │   ├── news.py                   # Job news/RSS aggregator
│   │
│   ├── services/                     # Business logic
│   │   ├── job_aggregator.py         # Job search aggregation
│   │   ├── openai_client.py          # OpenAI API wrapper
│   │   ├── resume_parser.py          # Resume parsing logic
│   │   ├── normalize.py              # Text normalization
│   │   ├── providers/                # Job search providers
│   │   │   ├── jsearch.py            # JSearch API integration
│   │   │   ├── indeed.py             # Indeed integration
│   │   │   └── linkedin.py           # LinkedIn integration
│   │
│   ├── utils/                        # Utility functions
│   │   ├── emailer.py                # Email sending
│   │   ├── otp_emailer.py            # OTP email logic
│   │   ├── embeddings.py             # Text embeddings
│   │   ├── similarity.py             # Similarity calculations
│   │   ├── text_normalize.py         # Text processing
│   │   ├── users.py                  # User utilities
│   │   └── passwords.py              # Password utilities
│   │
│   ├── middleware/                   # Middleware
│   │   └── auth_middleware.py        # JWT authentication middleware
│   │
│   ├── schemas/                      # Pydantic schemas
│   │   ├── __init__.py
│   │   └── jobs.py                   # Job schemas
│   │
│   ├── migrations/                   # Alembic database migrations
│   │   └── versions/                 # Migration files
│   │
│   ├── scripts/                      # Utility scripts
│   │   └── import_resumes_jsonl_to_db.py
│   │
│   ├── tests/                        # Unit tests
│   │   ├── test_parser.py
│   │   └── test_similarity.py
│   │
│   ├── requirements.txt              # Python dependencies
│   ├── requirements.apprunner.txt    # AWS AppRunner dependencies
│   ├── .env                          # Environment variables
│   └── .gitignore
│
├── frontend/                         # React frontend
│   ├── src/
│   │   ├── pages/                    # Page components
│   │   │   ├── WelcomePage.js        # Landing page
│   │   │   ├── LoginPage.js          # Login
│   │   │   ├── SignupPage.js         # Registration
│   │   │   ├── DashboardPage.js      # Main dashboard
│   │   │   ├── BillingPage.tsx       # Stripe billing
│   │   │   ├── ForgotPassword.jsx    # Password recovery
│   │   │   ├── ResetPassword.jsx     # Password reset
│   │   │   ├── ChangePasswordPage.js # Change password
│   │   │   └── HelpPage.js           # Help/support
│   │   │
│   │   ├── DashboardPages/           # Feature pages
│   │   │   ├── JobPostingsPage.jsx   # Job listings
│   │   │   ├── ResumeMatcherPage.jsx # Resume-job matching
│   │   │   ├── EnhanceResumePage.jsx # Resume enhancement
│   │   │   ├── MyResumesPage.jsx     # Resume management
│   │   │   ├── ResumeCoverGenerator.jsx # Cover letter generation
│   │   │   ├── InterviewPrepPage.jsx # Interview preparation
│   │   │   ├── MockMate.jsx          # Mock interview
│   │   │   └── ProfilePage.jsx       # User profile
│   │   │
│   │   ├── components/               # Reusable components
│   │   │   ├── Layout.js             # Global layout
│   │   │   ├── DashboardLayout.js    # Dashboard layout
│   │   │   ├── ResumeParser.js       # Resume parser UI
│   │   │   ├── ResumeCompare.js      # Resume comparison UI
│   │   │   ├── RightJobsWidgets.jsx  # Job widgets
│   │   │   ├── Sidebar.jsx           # Navigation sidebar
│   │   │   └── billing/              # Billing components
│   │   │       ├── SubscriptionBadge.tsx
│   │   │       └── BillingActions.tsx
│   │   │
│   │   ├── api/                      # API client functions
│   │   │   ├── client.js             # Axios client setup
│   │   │   ├── auth.js               # Auth API calls
│   │   │   ├── resumeApi.js          # Resume API calls
│   │   │   ├── resumeCover.js        # Resume/cover API
│   │   │   ├── feedback.js           # Feedback API
│   │   │   └── FeedbackPage.js       # Feedback page
│   │   │
│   │   ├── lib/                      # Utilities
│   │   │   └── api.js                # API helpers
│   │   │
│   │   ├── App.js                    # Main app component
│   │   ├── App.css                   # Global styles
│   │   ├── index.js                  # React entry point
│   │   ├── index.css                 # Global CSS
│   │   ├── firebase.js               # Firebase config
│   │   └── logo.svg
│   │
│   ├── public/                       # Static assets
│   │   ├── index.html
│   │   ├── favicon.ico
│   │   ├── fonts/                    # Custom fonts
│   │   ├── images/                   # Images
│   │   └── pdf.worker.min.mjs        # PDF.js worker
│   │
│   ├── package.json                  # NPM dependencies
│   ├── tsconfig.json                 # TypeScript config
│   ├── vite.config.ts                # Vite config
│   ├── .env                          # Frontend env vars
│   ├── .env.production               # Production env
│   └── .gitignore
│
├── Dockerfile                        # Docker configuration
├── .dockerignore
├── .env.docker                       # Docker env
├── alembic.ini                       # Database migration config
├── .gitignore                        # Git ignore rules
└── README.md                         # Project documentation
```

---

## 🗄️ Database Schema

### **Users Table**
```sql
- id (PK)
- email (UNIQUE, indexed)
- password_hash
- stripe_customer_id
- subscription_status (free|trialing|active|past_due|canceled|unpaid)
- subscription_current_period_end
- plan_key (free|pro_month|pro_year)
- trial_used (boolean)
- trial_started_at
- trial_expires_at
- trial_runs_left
- created_at
- updated_at
```

### **Resumes Table**
```sql
- id (PK)
- user_id (FK → users.id, CASCADE)
- title
- content (TEXT)
- source (enhanced|uploaded|generated)
- created_at (indexed)
- updated_at (indexed)
- Composite indexes: (user_id, created_at), (user_id, updated_at)
```

### **Profiles Table**
```sql
- id (PK)
- user_id (FK → users.id, UNIQUE, CASCADE)
- full_name
- email
- phone
- location
- linkedin
- github
- portfolio
- summary
- skills (JSON array)
- experience (JSON array)
- projects (JSON array)
- education (JSON array)
- certifications (JSON array)
- extras (JSON object)
- created_at
- updated_at
```

### **Feedbacks Table**
```sql
- id (PK)
- question (TEXT)
- answer (TEXT)
- feedback (TEXT)
- created_at
- updated_at
```

---

## 🔐 Authentication & Authorization

### **JWT Authentication Flow**
1. User signs up/logs in via `/api/v1/auth/signup` or `/api/v1/auth/login`
2. Backend returns JWT token (access + refresh)
3. Frontend stores token in localStorage
4. All protected endpoints require `Authorization: Bearer <token>` header
5. AuthMiddleware validates token on each request

### **Password Reset Flow**
1. User requests OTP via `/api/v1/auth/forgot-otp`
2. OTP sent to email
3. User verifies OTP via `/api/v1/auth/verify-otp`
4. User resets password via `/api/v1/auth/reset-with-otp`

### **Trial & Subscription**
- Free users get trial access (configurable)
- Trial can be day-based or credit-based
- Stripe integration for paid subscriptions
- Paywall middleware checks subscription status

---

## 🚀 Key Features

### **1. Job Search & Aggregation**
- Aggregates jobs from multiple sources (JSearch, Indeed, LinkedIn)
- Filters by location, salary, job type
- Real-time job updates via RSS feeds
- Endpoint: `/api/v1/jobs/search`

### **2. Resume Management**
- Upload, parse, and store resumes
- Extract structured data (skills, experience, education)
- Multiple resume versions per user
- Endpoints:
  - `POST /api/v1/resume/upload` - Upload resume
  - `GET /api/v1/resume/list` - List user's resumes
  - `DELETE /api/v1/resume/{id}` - Delete resume

### **3. Resume Enhancement**
- AI-powered resume improvement suggestions
- Keyword optimization for ATS
- Formatting recommendations
- Endpoint: `POST /api/v1/enhance`

### **4. Resume-Job Matching**
- Compare resume against job descriptions
- Calculate match percentage
- Identify missing skills/keywords
- Endpoint: `POST /api/v1/compare`

### **5. Resume & Cover Letter Generation**
- Generate professional resumes from profile data
- Generate tailored cover letters
- Multiple templates
- Endpoint: `POST /api/v1/resume-cover`

### **6. Interview Preparation**
- Generate interview questions based on resume
- Provide answer suggestions
- Mock interview practice
- Endpoint: `POST /api/v1/feedback`

### **7. User Profile Management**
- Store professional information
- Skills, experience, education, certifications
- Portfolio links
- Endpoints:
  - `GET /api/v1/profile` - Get profile
  - `PUT /api/v1/profile` - Update profile

### **8. Billing & Payments**
- Stripe integration for subscriptions
- Monthly and yearly plans
- Webhook handling for payment events
- Endpoints:
  - `POST /api/v1/pay/create-checkout` - Create checkout session
  - `POST /api/v1/pay/webhook` - Stripe webhook
  - `GET /api/v1/pay/subscription` - Get subscription status

### **9. Trial Management**
- Free trial access for new users
- Trial credit system
- Trial expiration tracking
- Endpoints:
  - `GET /api/v1/trial/status` - Check trial status
  - `POST /api/v1/trial/use` - Use trial credit

---

## 📦 Key Dependencies

### **Backend (Python)**
- **FastAPI** - Web framework
- **SQLAlchemy** - ORM
- **Pydantic** - Data validation
- **OpenAI** - AI/ML API
- **Stripe** - Payment processing
- **python-jose** - JWT handling
- **bcrypt** - Password hashing
- **pdfplumber** - PDF parsing
- **sentence-transformers** - Text embeddings
- **scikit-learn** - ML utilities
- **requests** - HTTP client

### **Frontend (JavaScript/React)**
- **React 19** - UI framework
- **React Router v7** - Routing
- **Axios** - HTTP client
- **jsPDF** - PDF generation
- **pdfjs-dist** - PDF viewing
- **docx** - Word document generation
- **Lucide React** - Icons
- **Recharts** - Charts/graphs
- **React Icons** - Icon library

---

## 🔌 API Endpoints Summary

### **Authentication**
- `POST /api/v1/auth/signup` - Register user
- `POST /api/v1/auth/login` - Login user
- `POST /api/v1/auth/refresh` - Refresh JWT token
- `POST /api/v1/auth/forgot-otp` - Request password reset OTP
- `POST /api/v1/auth/verify-otp` - Verify OTP
- `POST /api/v1/auth/reset-with-otp` - Reset password with OTP

### **Jobs**
- `GET /api/v1/jobs/search` - Search jobs
- `GET /api/v1/jobs/{id}` - Get job details
- `GET /api/v1/news/jobs` - Get job news/RSS

### **Resumes**
- `POST /api/v1/resume/upload` - Upload resume
- `GET /api/v1/resume/list` - List resumes
- `GET /api/v1/resume/{id}` - Get resume
- `DELETE /api/v1/resume/{id}` - Delete resume
- `POST /api/v1/parse` - Parse resume

### **Resume Features**
- `POST /api/v1/enhance` - Enhance resume
- `POST /api/v1/compare` - Compare resume to job
- `POST /api/v1/generate` - Generate content
- `POST /api/v1/resume-cover` - Generate resume/cover letter

### **User Profile**
- `GET /api/v1/profile` - Get profile
- `PUT /api/v1/profile` - Update profile

### **Feedback & Interview**
- `POST /api/v1/feedback` - Submit feedback
- `GET /api/v1/feedback` - Get feedback

### **Payments**
- `POST /api/v1/pay/create-checkout` - Create Stripe checkout
- `POST /api/v1/pay/webhook` - Stripe webhook
- `GET /api/v1/pay/subscription` - Get subscription status

### **Trial**
- `GET /api/v1/trial/status` - Check trial status
- `POST /api/v1/trial/use` - Use trial credit

---

## 🎨 Frontend Routes

### **Public Routes**
- `/` - Welcome/landing page
- `/login` - Login page
- `/signup` - Registration page
- `/forgot-password` - Password recovery
- `/reset-password` - Password reset
- `/help` - Help page
- `/resume-cover-generator` - Public resume/cover generator

### **Protected Routes (Dashboard)**
- `/dashboard` - Main dashboard
- `/dashboard/jobs` - Job listings
- `/resume-matcher` - Resume-job matching
- `/enhance-resume` - Resume enhancement
- `/my-resumes` - Resume management
- `/interview-prep` - Interview preparation
- `/resume-compare` - Resume comparison
- `/resume-parser` - Resume parsing
- `/feedback` - Interview feedback
- `/mockmate` - Mock interview
- `/profile` - User profile
- `/settings/password` - Change password
- `/billing` - Billing/subscription management

### **Billing Routes**
- `/billing/success` - Payment success
- `/billing/cancelled` - Payment cancelled

---

## 🔧 Configuration & Environment Variables

### **Backend (.env)**
```
ENV=dev|prod
AUTO_MIGRATE=true|false
USE_AUTH_MIDDLEWARE=true|false

# Database
DATABASE_URL=postgresql://user:pass@localhost/jobflowai

# JWT
SECRET_KEY=your-secret-key
ALGORITHM=HS256

# OpenAI
OPENAI_API_KEY=sk-...

# Job Search APIs
RAPIDAPI_KEY=...
JSEARCH_RAPIDAPI_HOST=...
JSEARCH_RAPIDAPI_PATH=...

# Stripe
STRIPE_SECRET_KEY=sk_...
STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_PRICE_PRO_MONTH=price_...
STRIPE_PRICE_PRO_YEAR=price_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email
SMTP_SERVER=...
SMTP_PORT=...
SMTP_USER=...
SMTP_PASSWORD=...

# Firebase (optional)
FIREBASE_API_KEY=...
```

### **Frontend (.env)**
```
REACT_APP_API_URL=http://localhost:8000
REACT_APP_FIREBASE_API_KEY=...
```

---

## 🐳 Docker Deployment

The project includes Docker configuration for containerization:
- **Dockerfile** - Multi-stage build for backend
- **.dockerignore** - Exclude unnecessary files
- **.env.docker** - Docker-specific environment

Build and run:
```bash
docker build -t jobflowai .
docker run -p 8000:8000 jobflowai
```

---

## 📊 Database Migrations

Uses **Alembic** for database schema management:
- Migration files in `backend/migrations/versions/`
- Auto-migration on startup (if `AUTO_MIGRATE=true`)
- Manual migration: `alembic upgrade head`

---

## 🧪 Testing

Test files located in `backend/tests/`:
- `test_parser.py` - Resume parser tests
- `test_similarity.py` - Similarity calculation tests

Run tests:
```bash
pytest backend/tests/
```

---

## 🚀 Deployment Considerations

### **AWS AppRunner**
- Uses `requirements.apprunner.txt` for dependencies
- Environment variables configured in AppRunner console
- Auto-scaling and load balancing

### **Production Checklist**
- [ ] Set `ENV=prod`
- [ ] Enable `USE_AUTH_MIDDLEWARE=true`
- [ ] Configure production database URL
- [ ] Set strong `SECRET_KEY`
- [ ] Configure Stripe production keys
- [ ] Set up email service (SMTP)
- [ ] Enable HTTPS/SSL
- [ ] Configure CORS for production domain
- [ ] Set up monitoring and logging
- [ ] Configure backup strategy

---

## 📝 Key Files to Review

1. **Backend Entry Point:** `backend/main.py`
2. **Database Models:** `backend/models.py`
3. **Authentication:** `backend/routes/auth.py`
4. **Job Search:** `backend/services/job_aggregator.py`
5. **Resume Processing:** `backend/services/resume_parser.py`
6. **Frontend App:** `frontend/src/App.js`
7. **API Client:** `frontend/src/api/client.js`

---

## 🎯 Development Workflow

### **Backend Development**
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m uvicorn main:app --reload
```

### **Frontend Development**
```bash
cd frontend
npm install
npm start
```

### **Database Setup**
```bash
cd backend
python init_db.py
alembic upgrade head
```

---

## 📞 Support & Documentation

- **API Documentation:** Available at `/docs` (Swagger UI)
- **ReDoc:** Available at `/redoc`
- **Health Check:** `GET /health`
- **Root Endpoint:** `GET /`

---

## 🔒 Security Features

1. **JWT Authentication** - Secure token-based auth
2. **Password Hashing** - bcrypt with salt
3. **CORS Protection** - Configurable allowed origins
4. **SQL Injection Prevention** - SQLAlchemy parameterized queries
5. **Rate Limiting** - Can be added via middleware
6. **HTTPS/SSL** - Recommended for production
7. **Environment Variables** - Secrets not in code
8. **Stripe Webhook Verification** - Signature validation

---

## 📈 Performance Optimizations

1. **Database Indexes** - On frequently queried columns
2. **Composite Indexes** - For common query patterns
3. **Connection Pooling** - SQLAlchemy connection pool
4. **Caching** - Can be added for job listings
5. **Pagination** - For large result sets
6. **Lazy Loading** - SQLAlchemy relationships
7. **Text Embeddings** - Pre-computed for similarity

---

## 🎓 Learning Resources

- **FastAPI:** https://fastapi.tiangolo.com/
- **React:** https://react.dev/
- **SQLAlchemy:** https://docs.sqlalchemy.org/
- **Stripe API:** https://stripe.com/docs/api
- **OpenAI API:** https://platform.openai.com/docs/

---

**Last Updated:** 2025
**Project Status:** Active Development
