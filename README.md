# Obsidian Knowledge Clipper & Worker Sync (v1.7)

This project is a knowledge collection and synchronization system based on Cloudflare Workers and Chrome Extension V3. It allows users to save web articles, text highlights, YouTube video transcripts, and quick notes directly to a GitHub repository (syncing with Obsidian) via PC browsers, Kiwi Browser (Android), PWA, or a Telegram Bot.

## 1. System Architecture

```text
├── chrome-extension/         # V1.6 Chrome Extension (Manifest V3)
│   ├── manifest.json         # Extension configuration and permissions
│   ├── background.js         # Service Worker for context menus and Webhook dispatch
│   ├── content-main.js       # [MAIN World] DOM script for UI interaction and transcript extraction
│   ├── content.js            # [ISOLATED World] UI script for In-Page Toast notifications and clipboard
│   └── icons/                # Extension icons
├── src/                      # Cloudflare Workers (v1.7)
│   ├── index.ts              # Entry point: PWA Router, request parsing, diagnostic endpoints
│   ├── parser.ts             # Content parser: YouTube API extraction, ad removal, payload formatting
│   ├── github.ts             # GitHub API integration for file commits
│   ├── telegram.ts           # Telegram Bot Webhook integration
│   └── env.ts                # Environment variables and type definitions
├── README.md                 # Project documentation
├── wrangler.toml             # Cloudflare configuration file
└── setup-webhook.js          # Telegram webhook registration script
```

## 2. Key Features & Technical Details

### 2.1 YouTube Transcript Extraction

The system utilizes a two-tier strategy to extract YouTube transcripts, addressing anti-bot mechanisms (e.g., PoToken, IP blocking) implemented by YouTube.

*   **Frontend DOM Extraction (Primary)**: The Chrome extension extracts transcripts directly from the YouTube page DOM. This method avoids backend IP blocking (HTTP 429) and PoToken verification issues since the request originates from the user's residential IP.
    *   **UI Automation**: Automatically clicks the "Show Transcript" button using localized selectors (Supports Traditional/Simplified Chinese and English button texts).
    *   **innerText Parsing (Fallback)**: To handle YouTube's newer `yt-view-model` architecture (Engagement Panels) where standard HTML tags like `<ytd-transcript-segment-renderer>` are removed, the extension parses the visible `innerText` of the panel to extract timestamps and text reliably.
    *   **Clipboard Integration**: Automatically copies the extracted transcript to the system clipboard upon successful extraction.
*   **Backend API Fallback (Secondary)**: If DOM extraction fails or the request is sent via Telegram/PWA (without extension context), the Cloudflare Worker attempts to fetch the transcript via the YouTube InnerTube API.
    *   **Dynamic SAPISIDHASH Generation**: The Worker uses the Web Crypto API (`crypto.subtle.digest`) to generate a valid `SAPISIDHASH` header based on the configured user cookies (`YOUTUBE_COOKIE`).
    *   **Client Spoofing**: Simulates requests using specific client profiles (e.g., Oculus Quest 3 / `ANDROID_VR`) to bypass certain web-based CAPTCHA requirements.
    *   **Datacenter IP Limitations**: Note that requests originating from Cloudflare Datacenter IPs may still encounter `HTTP 429` (Too Many Requests) or `LOGIN_REQUIRED` errors due to YouTube's strict server-side blocking of cloud hosting providers.

### 2.2 Content Processing and Ad Removal

For standard web articles (e.g., news portals), the system implements content filtering to ensure clean Markdown output:
*   **DOM Node Removal**: Utilizes `X-Remove-Selector` headers during Jina Reader parsing to strip navigation menus and sharing widgets.
*   **Keyword Truncation**: Scans the text and truncates content following common recommendation feed headers (e.g., "延伸閱讀", "推薦新聞", "其他人也在看") to prevent appending unrelated articles to the note.

### 2.3 User Interface (In-Page Toast)

The extension uses DOM-based Toast notifications injected directly into the webpage rather than native OS notifications. This ensures visibility even when the operating system is in "Do Not Disturb" mode and provides immediate status feedback (Loading, Success, or Error diagnostics).

### 2.4 Data Types Supported

*   **Full Page/Video**: Extracts the main content or transcript of the current URL.
*   **Highlight Quote**: Sharing selected text formats it as a Markdown blockquote (`> ...`) with the source URL appended.
*   **QuickNote**: Sharing plain text without a valid URL saves it directly to a dedicated `QuickNote/` directory.

## 3. Installation and Usage

### 3.1 PC (Chrome / Edge)

1.  Enable "Developer Mode" in `chrome://extensions/`.
2.  Click "Load unpacked" and select the `chrome-extension/` directory.
3.  Click the extension icon or use the right-click context menu to save content.

### 3.2 Android (Kiwi Browser Extension)

This method provides the most reliable YouTube transcript extraction on mobile by utilizing the frontend DOM strategy.
1.  Install Kiwi Browser from the Google Play Store.
2.  Enable "Developer Mode" in `chrome://extensions/` and load the extension ZIP or directory.
3.  **Desktop Site Requirement**: When viewing YouTube in Kiwi Browser, you must switch to the **"Desktop site"** (`www.youtube.com`) via the browser menu. The mobile site (`m.youtube.com`) lacks the necessary UI elements for transcript extraction. The extension will display a warning if triggered on the mobile site.

### 3.3 Android (PWA Share Hub)

This method registers the tool in the native Android share menu.
1.  Navigate to `https://[YOUR_WORKER_DOMAIN]/pwa/install` in Chrome for Android.
2.  Select "Install App" or "Add to Home Screen" from the browser menu.
3.  Use the native Android "Share" menu from any app to send links or text to the Obsidian Clipper. *(Note: YouTube extraction via this method relies on the backend API fallback, which may be blocked).*

### 3.4 Telegram Bot

Send URLs or text messages to the configured Telegram Bot. The Worker processes the request and commits the generated Markdown directly to the GitHub repository.

## 4. Privacy and Security

*   **Direct Architecture**: All data processing occurs directly between the user's browser, their private Cloudflare Worker, and their private GitHub Repository.
*   **No Third-Party Tracking**: The system does not transmit data to any intermediary databases or third-party analytics services.
*   **License**: MIT Open-Source License.
