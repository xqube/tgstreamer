# TgStreamer 📺

A Telegram bot that generates direct HTTP streaming URLs for media files. Stream videos directly to VLC, browsers, or any media player without downloading to your device first.

## ✨ Features

- 🎬 **Direct Streaming** — Stream Telegram videos/audio directly to VLC, browsers, or any HTTP-compatible player
- ⬇️ **Download Links** — Get direct download URLs for any media file  
- 📁 **Multi-format Support** — Videos, documents, audio, voice messages, and video notes
- 🔒 **User Authorization** — Restrict access to specific Telegram user IDs
- ⚡ **Range Requests** — Full seeking support for video players
- 🛡️ **Rate Limiting** — Configurable stream limits to control resource usage

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ 
- **Telegram API credentials** — Get from [my.telegram.org](https://my.telegram.org)
- **Bot Token** — Create a bot via [@BotFather](https://t.me/BotFather)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/tgstreamer.git
cd tgstreamer

# Install dependencies
npm install

# Configure environment
cp .env.example .env
```

Edit `.env` and fill in your credentials:

```env
API_ID=your_api_id
API_HASH=your_api_hash
BOT_TOKEN=your_bot_token

# Optional: Restrict to specific users
ALLOWED_USERS=123456789,987654321
```

### Running

**Development mode** (with hot reload):

```bash
npm run dev
```

**Production mode**:

```bash
npm run build
npm start
```

**With PM2** (recommended for servers):

```bash
npm run pm2
```

## 📖 Usage

1. Start the bot and send `/start` to get a welcome message
2. Forward or send any media file (video, audio, document) to the bot
3. Receive streaming and download URLs:
   - **Stream URL** — `http://your-host/stream/{token}`
   - **Download URL** — `http://your-host/download/{token}`
4. Open the stream URL in VLC: **Media → Open Network Stream**

## ⚙️ Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `API_ID` | Telegram API ID | *Required* |
| `API_HASH` | Telegram API Hash | *Required* |
| `BOT_TOKEN` | Bot token from BotFather | *Required* |
| `ALLOWED_USERS` | Comma-separated user IDs (empty = allow all) | *Empty* |
| `HOST` | Public URL for stream links | `http://localhost:8080` |
| `PORT` | HTTP server port | `8080` |
| `MAX_CONCURRENT_STREAMS` | Max streams per file | `3` |
| `MAX_TOTAL_STREAMS` | Global stream limit | `4` |

See [`.env.example`](.env.example) for all configuration options.

## 🏗️ Tech Stack

- **[mtcute](https://github.com/mtcute/mtcute)** — Modern Telegram client library
- **TypeScript** — Type-safe codebase
- **winston** — Logging
- **zod** — Environment validation

## 📜 Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm start` | Run production build |
| `npm run pm2` | Build and start with PM2 |
| `npm run pm2:restart` | Rebuild and restart PM2 process |
| `npm run pm2:stop` | Stop PM2 process |
| `npm run pm2:logs` | View PM2 logs |

## 📝 License

MIT