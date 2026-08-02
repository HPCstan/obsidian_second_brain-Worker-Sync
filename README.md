# Obsidian Knowledge Clipper & Worker Sync (v1.6)
**—— 全能跨平台知識採集、淨化、DOM 實時官方面板取詞與自動存檔於 Obsidian 的第二大腦引擎 ——**

這是一個基於 **Cloudflare Workers (Serverless) + Chrome Extension V3** 雙箭頭驅動的頂級無阻力自動化資訊採集與深加工系統。
無論是網頁報導、文字劃線重點、YouTube 影音與全文字幕、隨心速記語句還是網頁圖片，只要透過**手機 Android PWA 原生分享選單、電腦 Chrome/Edge 專屬擴充套件**或 **Telegram Bot** 觸發，系統即會在前端與雲端協同發動強大分析：包含獨家突破 YouTube 抗爬蟲封鎖的「**DOM 官方實時介面取詞術**」、網頁行內自建彩色亮牌 **In-Page Toast** 零延遲反饋、兩段式新聞瀑布流廣告強硬剃除，並以毫秒級時間平順推入 GitHub API 零誤差注入您的 **Obsidian** 知識庫中！

---

## 🚀 史詩級升級亮點與核心技術革命 (v1.6 Highlights & Technical Revolution)

### 1. 🏆 獨步全球的 YouTube 字幕捕撈防衛破局：雙層世界架構 +「DOM 官方實時介面取詞術」
2024–2026 年來，YouTube 為了全面防堵 AI 爬蟲與無權限下載工具，針對字幕接口 (如 `timedtext` 網路線路) 部署了極其嚴苛的 **PoToken (Proof of Origin Token) 機器人審查挑戰**：
只要非 YouTube 正宗官方編譯的 WebAssembly 播放器主機發出的 HTTP 請求，即便是雲端爬蟲或帶著合法登入 Cookie 的擴充腳本調用 `fetch()`，**YouTube 伺服器亦會狡黠地吐回一個 完全空白 (`""`) 且為 HTTP 200 OK 狀態的假回應**，或是強硬返回 204 No Content，徹底把傳統字幕下載機制斬殺殆盡！

為了永久解除此極致壁壘，我方 PC 瀏覽器端套件正式迎來 **v1.6 史詩級進展，導入業界領先的「真實 DOM UI 模擬揭蔽與抓取戰略」**：
- **🌐 MAIN 與 ISOLATED 雙上下文跨度通信**：專用腳本 `content-main.js` 嵌入 YouTube 頁面之原生主程序世界 (MAIN World)，一脈對接現時頁面之播放器內核與變數結構。
- **⚡ 借刀殺人與模擬手心熱力點擊**：當使用者輕點上網工具列之剪藏按鈕，腳本會瞬間於隱蔽背景毫秒自動展開說明欄 (`...更多 / #expand`)，並主動對應語系喚起並點按 YouTube 自豪的 **「顯示轉錄稿 (Show transcript / 打開文字稿)」** 按鈕！
- **🛡️ 官方代驗證，降維收割**：既然是依靠本頁之原生 YouTube 播放器按鈕呼叫，YouTube 主機將毫無懷疑地自動通過其嚴格的 PoToken 防範測試，並把完整、熱騰騰的全文語音字幕逐列穩定**渲染顯現於網頁側邊或下方 DOM 面板中 (`<ytd-transcript-segment-renderer>`)**！
- **📐 精密格式化工匠**：我們的套件秒速捕獲剛於 HTML DOM 本體亮起的每一字與時間標註，透過智能去廢句演算法，將毫秒對齊重整成極為流暢易懂的 **`[mm:ss]` 分鐘段落標記 markdown** 格式！**只要 YouTube ยัง讓會員收看字幕介面，這套「DOM 實時官方面板取詞術」就永遠對所有 Anti-Bot 雲端盾屏蔽免疫！**
- **📋 系統剪貼簿零延遲神助攻**：於精準把字幕回傳雲端存入 Obsidian 的同秒鐘，套件並一氣呵成把排版完美的大片 2,000~20,000 字全片文本，**默默幫您寫進 Windows / macOS 電腦作業系統的內存剪貼簿 (`navigator.clipboard`) 中**，供您立馬自由貼上任何文稿研議與 AI 工具直接對話！

---

### 2. 💡 徹底擺脫系統干擾：網頁內部動態浮現亮牌回報系統 (In-Page UI Toast)
舊式延伸套件普遍依賴作業系統右下角快訊 (`chrome.notifications`) 報告作業狀態，在實戰中卻往往被 Windows 的「專注模式 / Do-Not-Disturb 勿擾時間 / 自訂權限壓制」無聲攔截，讓用戶頻繁苦無回饋不知終盡。
v1.6 破棄沉默，全面導入**在 Chrome 分頁最頂端自帶繪像渲染的絢爛彩色浮動面板 (In-Page DOM Toast)**：
- **⏳ 藍色啟動提示**：點擊按鈕一霎，當下 YouTube 螢幕右側/天花板即刻亮牌提示：「`⏳ [Obsidian Clipper] 正在自 Chrome 提取此影片的字幕，請稍候...`」，不再焦躁抓瞎！
- **✅ 綠色慶祝回報**：攻捷瞬間浮躍高亮翠綠告示：「`✅ [Obsidian Clipper] 成功擷取 YouTube 字幕 (共 18,325 字) 並已自動備份入電腦剪貼簿！同步存回 GitHub 中！`」，榮獲眼見為憑的安心充盈感。
- **📸 橘紅全域顯微鏡**：若遇到私人絕密影片或 YouTube 極度例外版式，系統嚴格奉行「**大聲失敗 (Fail Loud)**」的最高工程理念，不遮蔽委屈！Toast 將第一時間彈起橘紅示警，直接毫不避諱地為您映顯：**「下載內容報錯、原始資料前 40 字符號實踐快照 Snapshot 與雙方交戰歷史路徑 (如試圖調度 `movie_player`, `ytInitialPlayerResponse`, `DOM UI` 之歷程)」**，令世人對異常了如指掌！

---

### 3. 🤖 Telegram Bot 與 GitHub Markdown 「雙料字幕健檢證明書」
雲端 Cloudflare Worker 不僅是負責過軌傳入，在最新底層重塑後，** Worker 端隨時對傳遞來的封包作精妙身檢**：
- **💬 Telegram 喜訊同步播送病歷**：每當處理完成，Bot 都會在「**已成功存入 YouTube 影片**」好消息底欄追加呈顯【`💬 字幕狀況：✅ 全文帶時間軸字幕已完好匯入`】。
- **🛡️ 三線防線雲端再救援**：一旦某老舊機器上 Chrome 套件因故未能發動字幕或忘記刷頁，Worker 主機將自動於後台為您接管，以服務器側備戰連線強行叩關索拉。即使不幸雲端皆為 401 封閉，也將以優美 GitHub callout **`> ⚠️ **字幕提取失敗診斷報告**`** 精心登記入 md 文件上方，詳載前後台具體錯誤原委，讓第二大腦知識無所遺漏。

---

### 4. 🛡️ 兩段式強力廣告淨化與「新聞瀑布流極速斷除大刀」
許多現代大眾數位新聞平臺（如 LINE Today、Yahoo News、三立、太報等）好將行文末底堆砌超巨大「無限狂流滾動廣告、Taboola 商品導航、猜你想要推薦」，致使以往筆記常常吃滿一屏正事、底下拖尾萬字行銷文垃圾！本組件獨創無損重宰雙工防範：
- **層級一：DOM 架構直接消融 (Pre-filtering)**：透過 Jina Reader 傳輸協議安座超寬容之 `X-Remove-Selector` 標牌，前置拔掉導覽選單、分享小工具、熱貼排行榜、側欄行銷磚牆。
- **層級二：推薦流水線自導截斷刀 (End-of-Article Truncated)**：Worker 自研 TypeScript 行內逐字掃描校閱工法，文章下修中只需眼見「**延伸閱讀**」、「**推薦新聞**」、「**其他人也在看**」、「**更多相關影音**」、「**熱門話題**」等騷擾邊境牌位，⚡ **立刻行使無上剪切指令 (`break`) 完美把往後的數十千字推薦流完全鍘斷、廢棄入海**！僅為您儲蓄純萃光潤的黃金核心主幹文本！

---

### 5. 🧠 靈敏雙流分段：金句劃線引用 (Highlight Quote) vs. 靈動隨行打字 (QuickNote)
全系統皆依憑直覺性之流動分類哲學分門：
- **✨ 精粹段落金句反白 (Highlight)**：人在各界網站一覽至醍醐灌頂的三兩段言論時，指尖劃選 -> 按分享剪藏，系統絕不白做勞工去拉拔原全頁千字文，而是精練幫您排成引人共鳴的 **Markdown 引用對話語塊 (`> ...`)**，下緣妥添【來源文章鏈接與標題】！
- **💭 搜尋框/記事簿純分享語點 (QuickNote)**：在手邊沒有專門紙筆刻下？請拿起智慧手持，掏出 Google 搜尋條、LINE 隨寫錄、原生對話欄，不管打幾組腦海片刻創意，一反白轉推往 **Obsidian Clipper**，毫無伴手鏈接照常 100% 把語篇立契歸建於 `QuickNote/` 靈感匯藏專區！

---

## 📚 跨宇宙全鏈結征伐手冊 (How to Use)

本防備網架設一窗共濟大通道，隨君嗜欲分頭出征：

### 💻 方式一：PC Windows/macOS — Chrome / Edge 終極守門套件（具備 DOM 全自動轉錄黑科技）
1. 抓取保存整包本源專案夾。
2. 啟航 Chrome / Edge 等瀏覽器進至擴充管家網格：`chrome://extensions/`（右上邊請點開「**開發人員模式 / Developer Mode**」 switch）。
3. 按一記左上排的「**載入未封裝項目 (Load unpacked)**」，精選本體內 `chrome-extension/` 專用檔案層夾！
4. **極大戰略體驗**：
   - **🎬 YouTube 影音+萬字語音文案大成**：在不論影片播放何刻，豪勇按一次瀏覽器上方釘住的 **[ O ] 剪藏圓牌**，或於頁面空白點鼠鍵右邊 ->「**剪藏當前網頁到 Obsidian**」。仰望右上 Toast 彩霞奔赴率顯為亮綠慶安歡祝！(您此刻甚至已能直接 `Ctrl + V` 按下看，整幅字幕早靜坐進您作業系統之記憶裡了！)
   - **📄 常規文章直灌知識寶庫**：一般閱讀頁一鍵瞬抓全文、剪切髒話廣告流！
   - **🔍 段落深堀語錄**：游擊圈抹滿意段落字言，右鍵單選「**將選取文字傳送至 Obsidian**」！
   - **🎨 圖鑑即刻備忘**：遇見好美工，滑鼠依貼圖片之上右擊「**將圖片傳送至 Obsidian**」，隨轉為單一圖資檔收進私房冊！
   - *(💡 注意：當升級或覆沒腳本後，如果原駐留中之舊分頁無反省反映，**只需在該網頁一敲鍵 `F5` / `Ctrl + R` 施作破舊重整**，嶄新 V1.6 超音速 UI 取詞驅動皆可直升入駐無虞！)*

### 📱 方式二：Android 智慧手持 PWA 系統全鏈結分享欄（零耗能免 App 包）
依托 Google 原生推薦的 PWA (Progressive Web App) 免裝載內建封裝引擎：
1. 掏出手機開啟 Android 上之 Chrome 工具，造訪您的個人專屬基地：
   👉 `https://您的worker專用網名.workers.dev/pwa/install`
2. 戳按右上緣 3 個圓點導向選單 **(⋮)**，點選 **「加到主畫面」** 抑或 **「安裝應用程式」**。
   - *⚠️【核心提醒】：若畫面現身雙層選項挑選，**務苦必挑中有「正往下流落箭頭」樣態之標籤的『安裝 (Install)』**！此神筆能教 Android Core 將把本工坊視為原生 APK，直接烙映進入全局常規分享 (Android System Share Hub) 分班之中！*
3. **戰鬥施打法**：
   - 手持手機看破任何 APP/Chrome 神奇新聞，想存檔？「分享 -> 指向 **Obsidian Clipper**」——即日收編。
   - B 站/ YouTube 手持 App 看完知識片想留念？直接按影片下方之彎撇箭頭「分享」-> **Obsidian Clipper**，下班後奔赴筆記桌即已妥妥備好一整條對比工整的時間軌錄！

### 💬 方式三：極致彈性 Telegram Bot 雙向快打分發
喜悅將社交即時軟體變做剪報檯？我們依然撐起整遍虛空！
- 朝私人 Telegram 助理機器人對談小格拋上一長鏈 YouTube, 或轉送優越長文報導！
- 一鍵扔傳圖片或喃喃自白，Bot 對以溫涼手令告白「**已收到，後台處理中...**」，半晌數秒即奉上 Markdown 文件已穩靠躺上 GitHub & Obsidian 大地的豐喜音耗！

---

## 🛠 系統骨裝與架構地盤導引 (Architecture & Directory)

本專案採行雙棲模組式分治法，高度對比兼併，保證運轉低碳、抗阻力封頂：

```markdown
├── chrome-extension/         # V1.6 終極前端反干擾套件 (跨 Chrome / Edge / Arc 等 Chromium 系)
│   ├── manifest.json         # 現代化 Manifest V3 定義與全頁腳本通流許可
│   ├── background.js         # Service Worker：休眠節能、右鍵選單派駐與 Webhook 專職拋運手
│   ├── content-main.js       # [MAIN World] 神奇黑科技：對接頁面實體、執行模擬點擊開啓字幕面板 DOM 與 API Fallback
│   ├── content.js            # [ISOLATED World] 保衛溝通管：In-Page 動態彩色亮燈 Toast 與系統剪貼簿複寫機制
│   └── icons/                # 經典品牌辨別識別圖資
├── src/                      # Cloudflare Workers 頂端核心主程式組
│   ├── index.ts              # 萬流歸一司令端：統御 PWA Router、分揀分流判讀與 TG Webhook 協議驗證
│   ├── parser.ts             # 煉丹總廚：兩重式廣告淨化大刀、YouTube 代管轉存與全盤診斷報告生檢師
│   ├── github.ts             # Git PUT 低阻密鏈存儲器 (精打細算防杜併發 409 SHA conflict 邏輯)
│   └── telegram.ts           # 即時溫馨快報，為您推向隨身的 Telegram 螢幕終端
├── README.md                 # 本權威實質指南手冊
├── wrangler.toml             # CF 邊境工作平台組裝聲明
└── setup-webhook.js          # Telegram 機器人一針快速貫通綁架幫手
```

---

## 🔒 絕密隱私防禦與開放式聲明 (License & Security)

此項資產自始終極秉性：「**零中間商摸底、直驅雲際、隱密至死**」。
所有您採編的報導、高昂秘技影片與心思囈語，完全不觸摸、不上流予世界上任何一尊第三商業中繼站或是遙想採集資料的陌生資料庫。
一切皆限存於**您本人之絕對專用 Cloudflare 雲邊端運營號與屬於您一人知悉之 GitHub Repository / Obsidian Vault 本體文件牆間**穿梭往來！

**MIT Open-Source License** —— 敬賀神工巨匠皆能隨時披掛戰甲，在無涯浩瀚浩劫與資訊巨波中，安然起造最無敵強悍的個人智慧第二大腦！🛡️💎🚀
