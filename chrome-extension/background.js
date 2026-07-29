// 設定您的 Worker 網址
const WORKER_URL = "https://obsidian-clipping-worker.ogeypt.workers.dev/webhook/browser";
// 設定您的 Webhook 密碼 (預設與 TELEGRAM_WEBHOOK_SECRET 相同)
const WORKER_SECRET = "1234";

const ICON_BLUE = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZD0iTTEyIDJDNi40OCAyIDIgNi40OCAyIDEyczQuNDggMTAgMTAgMTAgMTAtNC40OCAxMC0xMFMxNy41MiAy 12IDJ6IiBmaWxsPSIjNDI4NUY0Ii8+PC9zdmc+";
const ICON_GREEN = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZD0iTTEyIDJDNi40OCAyIDIgNi40OCAyIDEyczQuNDggMTAgMTAgMTAgMTAtNC40OCAxMC0xMFMxNy41MiAy 12IDJ6IiBmaWxsPSIjMEY5RDU4Ii8+PC9zdmc+";
const ICON_RED = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZD0iTTEyIDJDNi40OCAyIDIgNi40OCAyIDEyczQuNDggMTAgMTAgMTAgMTAtNC40OCAxMC0xMFMxNy41MiAy 12IDJ6IiBmaWxsPSIjREIzMjM2Ii8+PC9zdmc+";

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

async function sendToWorker(payload) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: ICON_BLUE,
    title: "Obsidian Clipper",
    message: "傳送至 Worker 中..."
  });

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
        message: "✅ 已發送成功！正在後台處理中..."
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

// Handler for the extension icon click (defaults to URL)
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url) return;
  await sendToWorker({ url: tab.url });
});

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
    await sendToWorker({ url: info.pageUrl });
  } else if (info.menuItemId === "clip-text") {
    await sendToWorker({ text: info.selectionText });
  } else if (info.menuItemId === "clip-image") {
    try {
      const imgRes = await fetch(info.srcUrl);
      const blob = await imgRes.blob();
      const base64DataUrl = await blobToBase64(blob);
      // data:image/png;base64,iVBORw0KGgo...
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
