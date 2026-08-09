# Obsidian Knowledge Clipper & Worker Sync (v1.7)

本專案是一個基於 Cloudflare Workers 與 Chrome Extension V3 的知識採集與同步系統。使用者可透過電腦版瀏覽器、Kiwi Browser (Android)、PWA 或 Telegram Bot，將網頁文章、重點畫線、YouTube 影片字幕及快速筆記，直接儲存至 GitHub 儲存庫（並同步至 Obsidian）。

## 1. 系統架構

```text
├── chrome-extension/         # V1.6 Chrome 擴充套件 (Manifest V3)
│   ├── manifest.json         # 擴充套件設定與權限宣告
│   ├── background.js         # Service Worker：處理右鍵選單與 Webhook 請求發送
│   ├── content-main.js       # [MAIN World] DOM 腳本：負責 UI 互動與字幕提取
│   ├── content.js            # [ISOLATED World] UI 腳本：負責網頁內 Toast 提示與剪貼簿寫入
│   └── icons/                # 擴充套件圖示
├── src/                      # Cloudflare Workers (v1.7)
│   ├── index.ts              # 程式進入點：PWA 路由、請求解析與診斷端點
│   ├── parser.ts             # 內容解析器：YouTube API 提取、廣告移除與資料格式化
│   ├── github.ts             # GitHub API 整合，負責檔案 Commit
│   ├── telegram.ts           # Telegram Bot Webhook 整合
│   └── env.ts                # 環境變數與型別定義
├── README.md                 # 專案說明文件
├── wrangler.toml             # Cloudflare 部署設定檔
└── setup-webhook.js          # Telegram Webhook 註冊腳本
```

## 2. 核心功能與技術細節

### 2.1 YouTube 字幕提取

系統採用雙層策略提取 YouTube 字幕，以應對 YouTube 伺服器端的機器人防護機制（如 PoToken 驗證與 IP 封鎖）。

*   **前端 DOM 提取（首選方案）**：Chrome 擴充套件直接從 YouTube 網頁的 DOM 結構中提取字幕。此方法因請求來自使用者的真實住宅 IP，可完全避開後端 IP 封鎖 (HTTP 429) 與 PoToken 驗證問題。
    *   **UI 自動化**：使用多語系選擇器（支援繁/簡體中文與英文）自動尋找並點擊「顯示轉錄稿 / Show Transcript」按鈕。
    *   **純文字 (innerText) 解析（備用提取）**：為應對 YouTube 採用的新型 `yt-view-model` 架構（該架構移除了標準的 `<ytd-transcript-segment-renderer>` 標籤），擴充套件會直接讀取字幕面板的 `innerText`，並透過正規表達式穩定提取時間戳與文字。
    *   **剪貼簿整合**：提取成功後，自動將格式化後的字幕複製到系統剪貼簿。
*   **後端 API 提取（備用方案）**：若 DOM 提取失敗，或請求是經由 Telegram/PWA 發送（無前端擴充套件環境），Cloudflare Worker 會嘗試透過 YouTube InnerTube API 獲取字幕。
    *   **動態 SAPISIDHASH 生成**：Worker 利用 Web Crypto API (`crypto.subtle.digest`)，結合使用者配置的 Cookie (`YOUTUBE_COOKIE`)，動態生成合法的 `SAPISIDHASH` 驗證標頭。
    *   **客戶端偽裝**：模擬特定客戶端（例如 Oculus Quest 3 / `ANDROID_VR`）發送請求，以繞過部分網頁版的 CAPTCHA 限制。
    *   **資料中心 IP 限制**：由於 YouTube 對雲端服務供應商有嚴格的伺服器端阻擋，源自 Cloudflare Datacenter IP 的請求仍可能遭遇 `HTTP 429` (Too Many Requests) 或 `LOGIN_REQUIRED` 錯誤。

### 2.2 內容處理與廣告移除

針對一般網頁文章（如新聞網站），系統內建內容過濾機制以確保 Markdown 輸出的純淨度：
*   **DOM 節點移除**：在透過 Jina Reader 解析時，傳遞 `X-Remove-Selector` 標頭以剔除導覽列與分享按鈕等非內文區塊。
*   **關鍵字截斷**：掃描內文，若遇到常見的推薦閱讀標題（如「延伸閱讀」、「推薦新聞」、「其他人也在看」），則自動截斷後續內容，避免將無關的推薦文章寫入筆記中。

### 2.3 使用者介面 (In-Page Toast)

擴充套件捨棄了容易被作業系統「勿擾模式」攔截的系統通知，改用直接注入網頁 DOM 的 Toast 提示元件。此設計確保了狀態回報（如處理中、成功、錯誤診斷）的即時可見性。

### 2.4 支援的資料處理類型

*   **完整網頁/影片**：提取當前 URL 的主要文章內容或影片字幕。
*   **重點畫線 (Highlight)**：選取網頁文字後分享，系統會將其格式化為 Markdown 引用區塊 (`> ...`)，並附上來源網址。
*   **快速筆記 (QuickNote)**：分享純文字（未包含有效網址）時，系統會直接將該段文字儲存至 Obsidian 內的 `QuickNote/` 目錄。

## 3. 安裝與使用方式

### 3.1 電腦端 (Chrome / Edge)

1.  在瀏覽器網址列輸入 `chrome://extensions/` 並開啟「開發人員模式」。
2.  點選「載入未封裝項目」，選擇本專案的 `chrome-extension/` 目錄。
3.  點擊瀏覽器右上角的擴充套件圖示，或使用右鍵選單即可進行剪藏。

### 3.2 Android 行動端 (Kiwi Browser 擴充套件)

此為行動裝置上最穩定的 YouTube 字幕提取方式，因為它能完整執行前端 DOM 提取策略。
1.  從 Google Play 商店安裝 Kiwi Browser。
2.  在網址列輸入 `chrome://extensions/`，開啟「開發人員模式」並載入擴充套件。
3.  **電腦版網站要求**：在 Kiwi Browser 觀看 YouTube 時，必須透過瀏覽器選單切換至**「電腦版網站」(Desktop site)** (`www.youtube.com`)。因行動版網頁 (`m.youtube.com`) 缺少字幕面板的 UI 元素，擴充套件若偵測到行動版網頁會主動跳出錯誤提示。

### 3.3 Android 行動端 (PWA 原生分享)

此方法可將擷取工具註冊至 Android 的原生分享選單中。
1.  使用 Android Chrome 瀏覽器造訪：`https://[您的Worker網域]/pwa/install`。
2.  開啟瀏覽器選單，選擇「安裝應用程式」或「加到主畫面」。
3.  日後在任何 App 中，只需使用 Android 原生的「分享」功能，將網址或文字傳送給 Obsidian Clipper 即可。*(註：透過此方式提取 YouTube 字幕將完全仰賴後端 API 備用方案，有較高機率遭到阻擋)*。

### 3.4 Telegram Bot

將網址或純文字發送給已配置的 Telegram Bot。Cloudflare Worker 會在背景處理該請求，並將生成的 Markdown 直接 Commit 至 GitHub 儲存庫。

## 4. 隱私與安全性

*   **直連架構**：所有的資料處理僅發生在使用者的瀏覽器、專屬的 Cloudflare Worker 以及私人的 GitHub 儲存庫之間。
*   **無第三方追蹤**：系統不會將任何資料傳送或儲存至中繼資料庫或第三方分析服務。
*   **授權條款**：本專案採用 MIT 開源授權條款。
