# Manga Reader

Private manga reader/scraper focused on `comix.to`, with chapter caching in MongoDB and optional cloud image storage.

## Disclaimer

This project is for private/personal use. Scraping may violate a target site's Terms of Service. Use responsibly.

## Features

- Scrape manga details and chapter images from `comix.to`
- Cloudflare-aware scraping flow (browser cookie refresh + fallback strategies)
- Persistent chapter cache in MongoDB
- Optional cloud storage upload per chapter:
  - `imagekit`
  - `imgbb`
  - `freeimage`
- Reader UI with:
  - chapter navigation
  - read tracking
  - reload/sync controls
- Server-side batch sync jobs for chapters
- User auth + lists + reading history

## Tech Stack

- Node.js + Express
- MongoDB + Mongoose
- Puppeteer (`puppeteer-extra` + stealth plugin)
- Axios + Cheerio
- Frontend: vanilla HTML/CSS/JS

## Project Structure

```text
manga/
├─ public/                       # frontend pages/scripts/styles
├─ models/                       # mongoose models
├─ scrapers/                     # homepage/title scrapers
├─ utils/
│  ├─ storage-providers/         # imagekit/imgbb/freeimage providers
│  ├─ browser.js                 # shared puppeteer browser
│  ├─ cookie-manager.js          # Cloudflare cookie lifecycle
│  ├─ storage.js                 # provider selector/router
│  └─ auto-updater.js            # scheduled updates
├─ scraper-cheerio.js            # chapter scraper + upload flow
├─ server.js                     # API server
└─ .env.example                  # env template
```

## Requirements

- Node.js 18+ (recommended)
- MongoDB instance

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Create env file:

```bash
copy .env.example .env
```

3. Fill required env values:

- `MONGODB_URI`
- optional cloud storage keys depending on `STORAGE_PROVIDER`

4. Start server:

```bash
npm start
```

5. Open:

`http://localhost:3000`

## Environment Variables

See `.env.example` for full list. Main ones:

- App/DB
  - `PORT`
  - `NODE_ENV`
  - `MONGODB_URI`

- Scraping
  - `PROXY_URL` (used by scraper/browser + comix HTTP flow)

- Storage selection
  - `STORAGE_PROVIDER=imagekit|imgbb|freeimage`
  - `STORAGE_UPLOAD_BATCH_SIZE`

- ImageKit
  - `IMAGEKIT_URL_ENDPOINT`
  - `IMAGEKIT_PUBLIC_KEY`
  - `IMAGEKIT_PRIVATE_KEY`

- ImgBB
  - `IMGBB_API_KEY`
  - `IMGBB_UPLOAD_BATCH_SIZE`
  - `IMGBB_UPLOAD_JITTER_MIN_MS`
  - `IMGBB_UPLOAD_JITTER_MAX_MS`
  - `IMGBB_RETRY_DELAY_MS`
  - `IMGBB_USE_UNIQUE_NAME`
  - `IMGBB_EXPIRATION` (optional)

- Freeimage
  - `FREEIMAGE_API_KEY`
  - `FREEIMAGE_UPLOAD_BATCH_SIZE`

- Auto updater
  - `AUTO_UPDATE_INTERVAL_HOURS`
  - `AUTO_UPDATE_INTERVAL_MINUTES`
  - `AUTO_UPDATE_ON_STARTUP`

## Key API Routes

- Chapter + reader data
  - `GET /api/chapter?url=...`

- Library/manga
  - `GET /api/library`
  - `GET /api/manga/:id`
  - `POST /api/add-manga`
  - `POST /api/scrape/homepage`
  - `POST /api/scrape/manga/:id`

- Cloud sync
  - `POST /api/sync/chapter`
  - `POST /api/sync/batch`
  - `GET /api/sync/batch/status/:jobId`
  - `GET /api/sync/status/:mangaId`

- User/auth
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/user/read-chapter`
  - `GET /api/user/read-chapters/:username/:mangaId`
  - `GET /api/user/reading-history/:username`
  - `GET /api/user/:username`
  - `GET /api/user/:username/lists`
  - `POST /api/user/action`
  - `POST /api/user/list`

- Health
  - `GET /api/health`

## Notes

- For cloud storage uploads, failed uploads currently fall back to original source URLs.
- Chapter sync writes are upserted by chapter URL, so re-sync updates existing stored links.

