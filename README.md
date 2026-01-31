# 📖 Manga Reader

A private manga reading site that scrapes manga images from comix.to and provides a clean, modern reading interface.

## ⚠️ Disclaimer

This project is for **private use only**. Web scraping may violate the target site's Terms of Service. Use responsibly and respect the source website.

## ✨ Features

- 🎨 **Modern Dark UI** - Beautiful gradient design optimized for reading
- 📱 **Responsive Design** - Works perfectly on mobile and desktop
- ⌨️ **Keyboard Navigation** - Use arrow keys (←/→) to navigate chapters
- 🖼️ **Image Proxying** - Avoids CORS issues by proxying images through backend
- 🔄 **Chapter Navigation** - Automatic next/previous chapter detection
- ⚡ **Fast Loading** - Puppeteer-based scraping handles dynamic content
- 💾 **Image Caching** - 24-hour cache for faster subsequent loads

## 🚀 Quick Start

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. **Navigate to the project directory:**

   ```bash
   cd "e:/cua loc/linh tinh/bot/manga"
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Create environment file:**

   ```bash
   copy .env.example .env
   ```

4. **Start the server:**

   ```bash
   npm start
   ```

5. **Open your browser:**
   Navigate to `http://localhost:3000`

## 📖 Usage

1. Open the manga reader in your browser
2. Paste a chapter URL from comix.to (e.g., `https://comix.to/title/rm2xv-the-grand-dukes-bride-is-a-hellborn-warrior/7244161-chapter-40`)
3. Click "Load Chapter" or press Enter
4. Enjoy reading!

### Keyboard Shortcuts

- `←` (Left Arrow) - Previous chapter
- `→` (Right Arrow) - Next chapter
- `Enter` - Load chapter (when input is focused)

## 🛠️ Tech Stack

### Backend

- **Express.js** - Web server
- **Puppeteer** - Web scraping (handles JavaScript-rendered content)
- **Axios** - HTTP requests for image proxying
- **Cheerio** - HTML parsing fallback
- **CORS** - Cross-origin resource sharing

### Frontend

- **Vanilla JavaScript** - No framework dependencies
- **Modern CSS** - Gradients, animations, glassmorphism
- **Responsive Design** - Mobile-first approach

## 📁 Project Structure

```
manga/
├── public/
│   ├── index.html      # Main HTML file
│   ├── styles.css      # Styling
│   └── app.js          # Frontend logic
├── scraper.js          # Puppeteer scraping logic
├── server.js           # Express server
├── package.json        # Dependencies
├── .env.example        # Environment variables template
├── .gitignore          # Git ignore rules
└── README.md           # This file
```

## 🔧 Configuration

Edit the `.env` file to customize settings:

```env
PORT=3000
NODE_ENV=development
```

## 🐛 Troubleshooting

### Puppeteer Installation Issues

If Puppeteer fails to install, try:

```bash
npm install puppeteer --unsafe-perm=true
```

### Images Not Loading

- Check if the source URL is correct
- Verify the site structure hasn't changed
- Check browser console for errors

### Server Won't Start

- Ensure port 3000 is not already in use
- Try a different port in `.env` file
- Check Node.js version (should be v14+)

## 📝 API Endpoints

- `GET /api/chapter?url=<manga_url>` - Scrape chapter images
- `GET /api/proxy-image?url=<image_url>` - Proxy manga images
- `GET /api/health` - Health check endpoint

## 🎯 Future Enhancements

- [ ] Bookmark/favorites system
- [ ] Reading history
- [ ] Multiple manga source support
- [ ] Offline reading mode
- [ ] Reading progress tracking

## 📄 License

This project is for educational and private use only.

## 🙏 Acknowledgments

- Built with Node.js and modern web technologies
- Designed for optimal reading experience
