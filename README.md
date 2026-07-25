# Telegram to Obsidian Sync Worker

這是一個基於 Cloudflare Workers 的輕量級自動化資訊採集系統。
它的主要目標是：透過手機 Telegram Bot 發送任何文章網址，系統會在背景自動抓取網頁正文、將其轉換為乾淨的 Markdown 格式，並透過 GitHub API 直接推送到您的 Obsidian 筆記倉庫中。

## 🎯 專案目標
在資訊爆炸的時代，我們常在手機上看到不錯的文章想要收藏進自己的 Second Brain (如 Obsidian)。傳統做法需要手動複製、打開筆記軟體、貼上並重新排版，過程繁瑣。
本專案打造了一個**最小阻力**的收集管道：
**手機 Telegram 轉發 -> 雲端自動處理排版 -> Obsidian 自動同步**

## 🛠 技術棧與架構
本專案採用以下技術實作：
- **Cloudflare Workers**: 無伺服器邊緣運算，負責接收 Webhook、處理非同步任務 (`ctx.waitUntil`)、並調用各種 API。免費且穩定。
- **Telegram Bot API**: 作為使用者輸入的介面，支援跨平台（iOS/Android/Desktop）快速分享與轉發。
- **Jina Reader API (`r.jina.ai`)**: 強大的網頁內容提取引擎，能精準去除廣告與干擾元素，將網頁內容轉換為高品質的 Markdown。
- **GitHub API**: 將生成的 Markdown 檔案直接提交 (Commit) 到您的 Obsidian Git 同步倉庫中。
- **TypeScript**: 提供型別安全的開發體驗。

## 🔄 執行流程 (Pipeline)
1. **輸入 (Input)**: 使用者在 Telegram 傳送包含文章 URL 的訊息給專屬 Bot。
2. **接收 (Receive)**: Cloudflare Worker 接收到 Webhook，立即回覆 Telegram：「已收到，後台提取中...」，並透過 `ctx.waitUntil()` 將繁重的抓取任務放入背景執行，隨即回傳 `HTTP 200 OK` 避免 Telegram 超時重試。
3. **處理 (Process)**:
   - Worker 呼叫 Jina Reader API 提取文章正文、標題與作者。
   - Worker 過濾標題中的特殊字元，自動生成檔案名稱：`YYYY-MM-DD-文章標題.md`。
   - 根據 Obsidian 的要求，在 Markdown 頂部組合標準的 YAML Frontmatter（包含時間、標籤、來源等資訊）。
4. **輸出 (Output)**: Worker 將組合好的 Markdown 轉換為 Base64，透過 GitHub API 發送 `PUT` 請求寫入目標倉庫。
5. **通知 (Notify)**: 寫入成功或失敗後，Worker 再次呼叫 Telegram API 通知使用者結果。

## 🚀 部署與使用指南

### 1. 前置作業
您需要準備以下帳號與金鑰：
- **Cloudflare 帳號**
- **Telegram Bot Token** (透過 `@BotFather` 取得)
- **Telegram Webhook Secret** (自訂的字串，用於安全驗證)
- **GitHub Personal Access Token (PAT)** (需具備目標倉庫的 `Contents` 讀寫權限)
- **Jina API Key** (可選，前往 Jina AI 官網免費申請，避免共用 IP 遇到 429 限速問題)

### 2. 環境變數設定
在部署前，請確保在 `wrangler.toml` 中設定您的 GitHub 倉庫資訊：
```toml
[vars]
GITHUB_REPO = "您的GitHub帳號/您的Obsidian倉庫"
GITHUB_BRANCH = "main"
OBSIDIAN_SAVE_PATH = "second_brain/raw/clippings" # 儲存路徑
```

### 3. 上傳金鑰 (Secrets)
請透過 Wrangler 將機密資訊上傳至 Cloudflare：
```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put JINA_API_KEY
```

### 4. 部署至 Cloudflare
推薦使用 Cloudflare Dashboard 內建的 GitHub 整合 (Workers CI/CD)，只需點擊幾下即可完成自動部署：
1. 進入 Cloudflare Dashboard -> **Workers & Pages**。
2. 建立新的 Worker 或進入現有專案。
3. 點擊 **Settings (設定)** -> **Builds (建置)** -> **Connect to GitHub (連結至 GitHub)**。
4. 選擇您的 GitHub 倉庫，Cloudflare 就會在每次程式碼更新時自動為您部署！

### 5. 綁定 Telegram Webhook
取得您的 Worker 網址後（例如 `https://your-worker.your-subdomain.workers.dev`），執行附帶的腳本：
```bash
node setup-webhook.js https://your-worker.your-subdomain.workers.dev
```
當顯示 `{ ok: true }` 時即設定完成！

## 📚 終端使用教學 (How to Use)

本系統支援兩種快速剪藏文章的方式：

### 方式一：手機 / 電腦 Telegram 轉發
1. 開啟您的 Telegram App。
2. 進入您所建立的 Bot 聊天室。
3. 直接貼上或轉發任何包含文章網址的訊息給 Bot。
4. Bot 會立即回覆：「已收到，後台提取中...」。
5. 數秒後，如果處理成功，Bot 會回覆儲存成功，文章已經安靜地躺在您的 Obsidian (GitHub) 裡了！

### 方式二：電腦版 Chrome 一鍵剪藏擴充功能
為了讓電腦端瀏覽網頁時更加方便，專案內附贈了一個極簡的 Chrome 擴充功能：
1. 開啟 Chrome 瀏覽器，前往 `chrome://extensions/`。
2. 開啟右上角的 **「開發人員模式 (Developer mode)」**。
3. 點擊 **「載入未封裝項目 (Load unpacked)」**，並選擇本專案內的 `chrome-extension/` 資料夾。
4. 將擴充功能釘選在右上角的工具列。
5. **使用方法**：在任何你想收藏的網頁上，點擊該擴充功能按鈕。
6. 瀏覽器右下角會跳出通知：「已發送成功！正在後台處理中...」。
7. 處理完畢後，您的手機 Telegram 同樣會收到成功入庫的推播提醒！

## 📂 資料夾結構
- `src/index.ts`: Worker 進入點，處理路由與 Webhook。
- `src/parser.ts`: 負責向 Jina Reader 獲取資料並轉為 Markdown。
- `src/github.ts`: 封裝 GitHub API 呼叫，處理檔案儲存。
- `src/telegram.ts`: 封裝 Telegram API 呼叫，處理訊息發送。
- `chrome-extension/`: Chrome 一鍵剪藏擴充功能的原始碼。
- `setup-webhook.js`: 用於快速綁定 Telegram Webhook 的輔助腳本。

## 📝 授權條款
MIT License
