# TaskTalk AI 

> **Voice-controlled task manager** — Create, read, update, and delete tasks entirely through natural spoken conversation. No typing. No buttons. Just talk.

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev)
[![Groq](https://img.shields.io/badge/LLM-Groq%20Llama%203.3-orange)](https://groq.com)

---

##  Features

| Feature | Details |
|---|---|
|  **Voice CRUD** | Create, read, update, delete tasks by speaking |
|  **Context Memory** | "Move the previous one to tomorrow" — understands references |
|  **Temporal Intelligence** | Understands "morning", "evening", "next week", "tomorrow" |
|  **Interruption Handling** | Tap orb mid-speech to immediately interrupt |
|  **Multi-task Creation** | "Create 3 tasks: gym at 7, sync at 9, LinkedIn at 11" |
|  **Auto-reconnect** | WebSocket reconnects automatically with exponential backoff |
|  **Auth (optional)** | JWT signup/login, or use guest mode |
|  **Flexible Storage** | SQLite (dev) or PostgreSQL (Supabase/Render) |

---

##  Architecture

```
Browser Mic (Web Speech API)
        ↓
    STT Transcript
        ↓  WebSocket VOICE_INPUT
FastAPI WebSocket Handler
        ↓
ConversationService ←→ ContextService (session memory)
        ↓
LLMService (Groq llama-3.3-70b) → structured intent JSON
        ↓
TaskService (CRUD + smart matching)
        ↓  WebSocket AI_RESPONSE + TASK_UPDATE
Browser TTS (SpeechSynthesis API)
```

---

##  Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- A free [Groq API key](https://console.groq.com) (takes 30 seconds)

### 1. Clone & setup backend

```bash
cd tasktalk-ai/backend

# Copy env
copy .env.example .env
# Edit .env and set your GROQ_API_KEY

# Install dependencies
pip install -r requirements.txt

# Start backend
uvicorn app.main:app --reload --port 8000
```

### 2. Setup frontend

```bash
cd tasktalk-ai/frontend

npm install
npm run dev
```

### 3. Open browser
Visit **http://localhost:5173** and tap the orb 

> **Note:** Voice requires HTTPS in production. For local dev, Chrome allows mic on localhost.

---

##  Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | ✅ | Get free at console.groq.com |
| `DATABASE_URL` | ✅ | SQLite (default) or PostgreSQL URL |
| `SECRET_KEY` | ✅ | JWT secret (32+ chars) |
| `FRONTEND_URL` | ✅ | CORS allowed origin |

### Frontend (`frontend/.env`)

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8000/api/v1` | Backend REST URL |
| `VITE_WS_URL` | `ws://localhost:8000/ws` | Backend WebSocket URL |

---

##  Example Voice Commands

```
"Create a task for gym tomorrow at 7 AM"
"Create three tasks: gym at 7, team sync at 9, and LinkedIn post at 11"
"What are my morning tasks?"
"Give me today's agenda"
"Move the LinkedIn task to 6 PM"
"Actually change the previous one to tomorrow"
"Delete the 9:15 task"
"Yes" (confirms deletion)
"No" / "Cancel" (cancels)
```

---

##  Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + Vanilla CSS |
| State | Zustand |
| STT | Web Speech API (browser-native) |
| TTS | SpeechSynthesis API (browser-native) |
| WebSocket | FastAPI WebSockets |
| LLM | Groq API (llama-3.3-70b-versatile) |
| Backend | FastAPI + SQLAlchemy |
| Database | SQLite (dev) / PostgreSQL (prod) |
| Auth | JWT + bcrypt |
| Frontend Deploy | Vercel |
| Backend Deploy | Render |

---

##  Project Structure

```
tasktalk-ai/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI app entry point
│   │   ├── database.py              # SQLAlchemy async engine
│   │   ├── config.py                # Settings via pydantic-settings
│   │   ├── models/                  # ORM models (Task, User)
│   │   ├── schemas/                 # Pydantic schemas (intent, auth, task)
│   │   ├── services/
│   │   │   ├── llm_service.py       # Groq intent extraction + response gen
│   │   │   ├── task_service.py      # CRUD + smart matching
│   │   │   ├── conversation_service.py  # Full pipeline orchestration
│   │   │   ├── context_service.py   # Session memory (TTL-managed)
│   │   │   └── auth_service.py      # JWT + bcrypt auth
│   │   ├── websocket/handler.py     # WS endpoint with interrupt support
│   │   ├── routers/auth.py          # REST auth endpoints
│   │   ├── prompts/system_prompt.py # LLM system prompt
│   │   └── utils/temporal.py        # Natural language date/time parsing
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx                  # Main layout + auth gate
│   │   ├── main.jsx                 # React entry
│   │   ├── index.css                # Complete design system
│   │   ├── store/useStore.js        # Zustand global state
│   │   ├── services/ws.js           # WebSocket client with reconnect
│   │   ├── hooks/
│   │   │   ├── useWebSocket.js      # WS event → store wiring
│   │   │   ├── useVoice.js          # Web Speech API + VAD
│   │   │   └── useTTS.js            # SpeechSynthesis + interrupt
│   │   └── components/
│   │       ├── VoiceOrb.jsx         # Animated 5-state orb
│   │       ├── TranscriptPanel.jsx  # Conversation history
│   │       ├── TaskPanel.jsx        # Live task sidebar
│   │       ├── StatusBar.jsx        # WS status + latency
│   │       └── Auth.jsx             # Login/Signup/Guest
│   └── package.json
│
├── render.yaml                      # Render backend deploy config
└── README.md
```

---

##  Deployment

### Frontend → Vercel

```bash
cd frontend
npm run build
# Push to GitHub, connect repo to Vercel
# Set env vars: VITE_API_URL, VITE_WS_URL
```

### Backend → Render

1. Push repo to GitHub
2. Create new **Web Service** on [render.com](https://render.com)
3. Set root directory: `backend`
4. Build command: `pip install -r requirements.txt`
5. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
6. Add environment variables from `.env.example`

### Database → Supabase PostgreSQL (optional upgrade from SQLite)

```
DATABASE_URL=postgresql+psycopg2://user:password@db.supabase.co:5432/postgres
```

---

##  Demo Script

1. **Create tasks**: "Create a task for team sync tomorrow at 10 AM"
2. **Read agenda**: "What are my tasks for tomorrow?"
3. **Update by reference**: "Move the second one to 11 AM"
4. **Context update**: "Actually change it to the day after tomorrow"
5. **Interrupt**: While assistant speaks, tap orb → stops immediately
6. **Multi-task**: "Create three tasks: gym at 7, sync at 9, LinkedIn at 11"
7. **Delete with confirm**: "Delete the gym task" → "Yes"
8. **Semantic understanding**: "Cancel my morning workout" (finds gym task)

---

##  Known Limitations

- Web Speech API requires Chrome or Edge (not Firefox/Safari)
- Voice recognition quality depends on microphone and browser
- Groq free tier has rate limits (~30 req/min) — sufficient for demos
- SQLite does not support concurrent writes (use PostgreSQL for production)

---

##  Future Improvements

- Recurring tasks ("every Monday")
- Priority levels via voice
- Calendar export (iCal)
- Deepgram STT integration for higher accuracy
- Push notification reminders
- Multi-language support


