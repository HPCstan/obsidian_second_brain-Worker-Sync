// 設定您的 Worker 網址
const WORKER_URL = "https://obsidian-clipping-worker.ogeypt.workers.dev/webhook/browser";
// 設定您的 Webhook 密碼 (預設與 TELEGRAM_WEBHOOK_SECRET 相同)
const WORKER_SECRET = "1234";

const ICON_BLUE = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZD0iTTEyIDJDNi40OCAyIDIgNi40OCAyIDEyczQuNDggMTAgMTAgMTAgMTAtNC40OCAxMC0xMFMxNy41MiAy IDEyIDJ6IiBmaWxsPSIjNDI4NUY0Ii8+PC9zdmc+";
const ICON_GREEN = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZD0iTTEyIDJDNi40OCAyIDIgNi40OCAyIDEyczQuNDggMTAgMTAgMTAgMTAtNC40OCAxMC0xMFMxNy41MiAy IDEyIDJ6IiBmaWxsPSIjMEY5RDU4Ii8+PC9zdmc+";
const ICON_RED = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZD0iTTEyIDJDNi40OCAyIDIgNi40OCAyIDEyczQuNDggMTAgMTAgMTAgMTAtNC40OCAxMC0xMFMxNy41MiAy IDEyIDJ6IiBmaWxsPSIjREIzMjM2Ii8+PC9zdmc+";

console.log("Obsidian Clipper service worker loaded");

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "clip-page",
    title: "剪藏當前網頁到 Obsidian",
    contexts: ["page"]
  });
  chrome.contextMenus.create({
    id: "clip-text",
    title: "將選取文字傳送至 Obsidian",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "clip-image",
    title: "將圖片傳送至 Obsidian",
    contexts: ["image"]
  });
});

async function sendToWorker(payload, customSuccessMessage) {
  try {
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, secret: WORKER_SECRET })
    });

    if (response.ok) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: ICON_GREEN,
        title: "Obsidian Clipper",
        message: customSuccessMessage || "✅ 已發送成功！正在後台處理中..."
      });
    } else {
      const errText = await response.text();
      throw new Error(`Error ${response.status}: ${errText}`);
    }
  } catch (error) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: ICON_RED,
      title: "Obsidian Clipper Error",
      message: error.message
    });
  }
}

// Handler for the extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (!tab || !tab.url) return;
    await handleUrlClip(tab);
  } catch (e) {
    console.error("Click handler error:", e);
    if (tab && tab.url) {
      await sendToWorker({ url: tab.url });
    }
  }
});

async function handleUrlClip(tab) {
  if (!tab || !tab.url) return;
  let payload = { url: tab.url };
  let statusMessage = null;

  // 如果是 YouTube 頁面，嘗試透過 content script 取得字幕
  if (tab.id && (tab.url.includes("youtube.com/") || tab.url.includes("youtu.be/"))) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: ICON_BLUE,
      title: "Obsidian Clipper",
      message: "⏳ 正在自 Chrome 提取 YouTube 字幕與通訊..."
    });

    try {
      const response = await Promise.race([
        chrome.tabs.sendMessage(tab.id, { action: 'getTranscript' }),
        new Promise(resolve => setTimeout(() => resolve({ success: false, error: '等待回覆超時' }), 6000))
      ]);

      if (response && response.success && response.transcript) {
        payload.transcript = response.transcript;
        statusMessage = `✅ 成功複製 YouTube 字幕 (共 ${response.wordCount} 字) 並同步複製進剪貼簿！已開始同步至 GitHub！`;
      } else {
        const errDesc = response && response.error ? response.error : '未安裝或尚未刷新頁面';
        statusMessage = `⚠️ 字幕提取失敗 (${errDesc})，即將僅歸檔影片連結至 GitHub。`;
      }
    } catch (e) {
      statusMessage = `⚠️ 無法聯繫套件腳本 (${e.message || e})，請重新整理 YouTube 頁面後再按一次！`;
    }
  } else {
    chrome.notifications.create({
      type: "basic",
      iconUrl: ICON_BLUE,
      title: "Obsidian Clipper",
      message: "傳送至 Worker 中..."
    });
  }

  await sendToWorker(payload, statusMessage);
}

// Helper to convert blob to base64
function blobToBase64(blob) {
  return new Promise((resolve, _) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

// Handler for context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "clip-page") {
    await handleUrlClip(tab || { url: info.pageUrl });
  } else if (info.menuItemId === "clip-text") {
    await sendToWorker({ text: info.selectionText });
  } else if (info.menuItemId === "clip-image") {
    try {
      const imgRes = await fetch(info.srcUrl);
      const blob = await imgRes.blob();
      const base64DataUrl = await blobToBase64(blob);
      const mimeType = base64DataUrl.split(';')[0].split(':')[1];
      const base64Data = base64DataUrl.split(',')[1];
      
      await sendToWorker({ imageBase64: base64Data, mimeType: mimeType });
    } catch (e) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: ICON_RED,
        title: "Image Fetch Error",
        message: "無法取得該圖片資料。"
      });
    }
  }
});
