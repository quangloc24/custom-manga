FROM node:20-bookworm-slim

# Install Chromium and runtime libs used by Puppeteer
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    wget \
    xdg-utils \
    dumb-init \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Prevent Puppeteer from downloading Chromium during npm install
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production

COPY package*.json ./
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev; \
    else \
      npm install --omit=dev; \
    fi

COPY . .

# Run as non-root user with UID in 10000-20000 range (Choreo policy).
# Keep USER as a hardcoded numeric literal so static scanners can detect it.
RUN groupadd -g 10014 appgroup \
  && useradd -u 10014 -g 10014 -m -s /usr/sbin/nologin appuser \
  && mkdir -p /tmp/chrome-user-data /tmp/chrome-data /tmp/chrome-cache \
  && chown -R 10014:10014 /app /tmp/chrome-user-data /tmp/chrome-data /tmp/chrome-cache
ENV USER=10014
USER 10014

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "start"]
