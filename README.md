
<div align="center">

<img src="./frontend/public/utube.png" alt="uTube logo" width="140" />

# uTube

**A full-stack video-sharing and live-streaming platform, built from scratch as a collaborative student project.**

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.11x-009688?logo=fastapi&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-18-339933?logo=node.js&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-SQLAlchemy-003B57?logo=sqlite&logoColor=white)
![CI](https://img.shields.io/badge/CI-GitHub_Actions-2088FF?logo=githubactions&logoColor=white)

</div>

---

## Overview

uTube is a YouTube-style platform that goes beyond a simple video-upload clone: it supports on-demand video (upload, transcoding, watch, like, comment) **and** live streaming with real-time chat, moderation tools, and a live analytics dashboard — all built on a custom three-service architecture (FastAPI backend, React frontend, Node.js RTMP media server).

It was built to learn and demonstrate end-to-end product engineering: authentication and security, relational data modeling, real-time systems (WebSockets, RTMP), media processing, and a recommendation engine — not just CRUD.

## Features

**Accounts & Security**
- JWT-based authentication with `python-jose` + `bcrypt` password hashing
- Email verification via one-time codes (SMTP, with a "mock mode" that prints the OTP to the console when no SMTP server is configured — handy for local dev)
- Role-based access: regular users, moderators, and admins

**Video**
- Upload, transcode, and serve videos with thumbnails, previews, and multiple resolutions
- Like/dislike, threaded comments, playlists, "Watch Later," and watch history
- Channels with subscriptions, banners, and profile customization

**Live Streaming**
- RTMP ingest via a dedicated Node.js media server (`node-media-server`), so streamers can go live from OBS or any RTMP encoder
- HTTP-FLV playback in the browser via `flv.js`
- A "Live Studio" dashboard for streamers with real-time viewer counts, chat rate, and new-subscriber tracking
- Real-time chat over WebSockets, scoped per stream "room," with slow mode, live polls, message deletion, and moderator kick/ban actions

**Discovery**
- Trending and recommendation endpoints backed by a hybrid recommendation service
- Semantic similarity search using local sentence-transformer embeddings (`all-MiniLM-L6-v2`), with a graceful lexical-search fallback if the model isn't available

**Moderation & Admin**
- Dedicated moderation dashboard (ban/mute users, delete content, review reports)
- Admin panel for platform-wide management

**Engineering**
- CI pipeline (GitHub Actions) running backend (`pytest`) and frontend test suites on every PR
- CodeQL static analysis for both the Python and JavaScript codebases

## Architecture

uTube runs as three cooperating services, launched together in development with a single command:

```
┌─────────────────┐      REST + WebSocket      ┌──────────────────┐
│  React Frontend  │ ─────────────────────────► │  FastAPI Backend  │
│  (Vite, :5173)   │ ◄───────────────────────── │     (:8000)       │
└─────────────────┘                             └──────────────────┘
        ▲                                                 ▲
        │ HTTP-FLV playback (:8080)                       │ prePublish / donePublish
        │                                                  │ webhooks (stream auth)
        │                                                  │
┌─────────────────────────────────────────────────────────────────┐
│              Node.js RTMP Media Server (:1935 / :8080)           │
│                     (node-media-server)                          │
└─────────────────────────────────────────────────────────────────┘
```

- **Frontend** — React 18 + Vite + Tailwind CSS. Talks to the backend over REST (Axios) and WebSockets (live chat), and plays live streams via `flv.js`.
- **Backend** — FastAPI + SQLAlchemy (SQLite). Owns auth, videos, comments, channels, playlists, recommendations, chat, moderation, and stream metadata/auth.
- **RTMP/media server** — Node.js + `node-media-server`, accepting RTMP pushes from streaming software and notifying the backend when a stream starts/stops so `is_live` status stays accurate.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, React Router, Axios, Framer Motion, flv.js, DOMPurify |
| Backend | FastAPI, SQLAlchemy, Pydantic, python-jose (JWT), bcrypt, OpenCV, Pillow |
| Live Streaming | Node.js, node-media-server (RTMP → HTTP-FLV) |
| Real-time | WebSockets (chat, live viewer counts, polls) |
| ML / Search | sentence-transformers (`all-MiniLM-L6-v2`), NumPy (cosine similarity) |
| Database | SQLite |
| Testing / CI | pytest, pytest-asyncio, GitHub Actions, CodeQL |

## Getting Started

### Prerequisites
- Node.js 18+
- Python 3.11+
- `ffmpeg` available on your `PATH` (used for video transcoding)

### Installation

```bash
# Clone the repo
git clone https://github.com/Emir-pek/uTube-.git
cd uTube-

# Install root + workspace dependencies (frontend, rtmp-server, backend)
npm install
# ^ this also runs `postinstall`, which installs Python deps via
#   pip install -r backend/requirements.txt
```

Then set up your environment files:

```bash
# Backend: create a .env in the project root with at least
#   SECRET_KEY=<your-own-secret>
#   SMTP_SERVER / SMTP_PORT / SMTP_USERNAME / SMTP_PASSWORD  (optional — omit for mock-mode OTP emails)

# Frontend: copy the example env and adjust for your setup
cp frontend/.env.example frontend/.env.local
```

### Running locally

```bash
npm run dev
```

This runs all three services concurrently:
- FastAPI backend at `http://localhost:8000` (interactive docs at `/api/v1/docs`)
- Vite frontend at `http://localhost:3000`
- RTMP media server at `rtmp://localhost:1935/live` (HTTP-FLV at `:8080`)

To go live, point OBS (or any RTMP encoder) at the RTMP URL shown in your profile's Live Studio, using your personal stream key.

### Running services individually

```bash
npm run backend   # FastAPI only
npm run frontend  # Vite dev server only (waits for backend to be up)
npm run media     # RTMP media server only
```

## Project Structure

```
uTube-/
├── backend/                # FastAPI application
│   ├── core/                # Config, security, video processing
│   ├── database/            # SQLAlchemy models, seeding, migrations
│   ├── routes/               # REST endpoints (auth, video, chat, streams, admin, ...)
│   ├── services/             # Business logic (mail, transcoding, embeddings, cleanup)
│   ├── chat/                 # WebSocket connection manager for live chat
│   └── main.py                # App entrypoint
├── frontend/                # React + Vite client
│   └── src/
│       ├── components/        # Reusable UI (video player, sidebar, modals, ...)
│       ├── pages/              # Route-level views (Home, Watch, LiveStudio, Admin, ...)
│       ├── context/            # React context providers (theme, sidebar, watch later)
│       └── utils/               # API client and helpers
├── rtmp-server/              # Node.js RTMP ingest + live-status webhooks
└── Documentation/            # Setup notes and internal docs
```

## Testing & Quality

```bash
# Backend
cd backend && pytest --ignore=scripts/

# Frontend
cd frontend && npm test
```

GitHub Actions runs both suites on every pull request against `main`, alongside CodeQL security scanning for the Python and JavaScript code.

## Roadmap

- [ ] Redis-backed viewer counts and cross-instance chat scaling
- [ ] Persistent peak-viewer and total watch-time analytics
- [ ] Production-ready secrets management (move `SECRET_KEY` and SMTP credentials fully out of source control)

## Author

Built by **Emir Efe Pekcan** — Software Engineering student at OSTİM Technical University.

- [LinkedIn](https://www.linkedin.com/in/emirefepekcan/)
