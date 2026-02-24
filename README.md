# Manga Frontend (Vite + Vanilla JS)

This repository is frontend-only.  
Backend API is separated (Hono) in `manga-api`.

## Run

1. Install:
```bash
npm install
```

2. Configure API URL:
```bash
copy .env.example .env
```

Set:
```env
VITE_API_URL=http://localhost:3000
```

3. Start dev server:
```bash
npm run dev
```

4. Build:
```bash
npm run build
```

5. Preview:
```bash
npm run preview
```

## Notes

- Existing pages/CSS/JS were kept and served by Vite from `public/`.
- All frontend `fetch("/api/...")` calls are auto-rerouted to `VITE_API_URL`.
- In your API project, set CORS to allow frontend origin (example):
  - `CORS_ORIGIN=http://localhost:5173`
