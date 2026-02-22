# Manga Reader

Private manga reader/scraper focused on `comix.to`, with chapter caching in MongoDB and optional cloud image storage.

## Stack

- Node.js + Express
- MongoDB + Prisma
- Puppeteer (`puppeteer-extra` + stealth plugin)
- Axios + Cheerio
- Frontend: vanilla HTML/CSS/JS

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy env:
```bash
copy .env.example .env
```

3. Set required env:
- `DATABASE_TYPE=prisma`
- `DATABASE_URI=<your mongodb uri>`

4. Generate Prisma client:
```bash
npm run prisma:generate
```

5. Start:
```bash
npm start
```

## Main Env Vars

- App/DB:
  - `PORT`
  - `NODE_ENV`
  - `DATABASE_TYPE`
  - `DATABASE_URI`
- Scraping:
  - `PROXY_URL`
- Storage:
  - `STORAGE_PROVIDER=imgbb|freeimage`
  - `STORAGE_UPLOAD_BATCH_SIZE`
  - provider-specific keys (`IMGBB_*`, `FREEIMAGE_API_KEY`)

## Notes

- This build is Prisma-only. Mongoose was removed.
- `DATABASE_TYPE` is kept for your switch flow; current supported value is `prisma`.
