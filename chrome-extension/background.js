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
  if (!tab || !tab.url) return;
  await handleUrlClip(tab);
});

async function extractYouTubeTranscriptInTab() {
  try {
    let tracks = null;
    // 優先從 YouTube 全域變數取得字幕軌道資訊
    if (window.ytInitialPlayerResponse && window.ytInitialPlayerResponse.captions) {
      tracks = window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer?.captionTracks;
    }
    // 備用：從 HTML 原始碼中用 regex 搜尋
    if (!tracks || !tracks.length) {
      const scripts = document.querySelectorAll('script');
      for (const s of scripts) {
        const txt = s.textContent || '';
        const match = txt.match(/"captionTracks":\s*(\[.*?\])\s*,/);
        if (match && match[1]) {
          try { tracks = JSON.parse(match[1]); } catch(e) {}
          if (tracks && tracks.length) break;
        }
      }
    }
    if (!tracks || !tracks.length) return null;

    // 挑選語系：中文優先 > 英文 > 第一個
    let selectedTrack = tracks.find(t => t.languageCode === 'zh-Hant' || t.languageCode === 'zh-TW' || t.languageCode === 'zh');
    if (!selectedTrack) selectedTrack = tracks.find(t => t.languageCode && t.languageCode.startsWith('en'));
    if (!selectedTrack) selectedTrack = tracks[0];
    if (!selectedTrack || !selectedTrack.baseUrl) return null;

    const langName = (selectedTrack.name && selectedTrack.name.simpleText) || selectedTrack.languageCode || '預設字幕';

    // 在瀏覽器頁面中 fetch 字幕（帶上使用者真實 Cookie），設定 4 秒超時
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    let res;
    try {
      res = await fetch(`${selectedTrack.baseUrl}&fmt=json3`, {
        credentials: 'include',
        signal: controller.signal
      });
    } catch (e) {
      clearTimeout(timeoutId);
      return null;
    }
    clearTimeout(timeoutId);

    if (!res.ok) return null;
    const rawText = await res.text();
    if (!rawText || rawText.length < 10 || !rawText.startsWith('{')) return null;

    let data;
    try { data = JSON.parse(rawText); } catch(e) { return null; }
    const events = data.events;
    if (!events || !Array.isArray(events)) return null;

    let formattedLines = `> 💡 **字幕語系 / 版本 (瀏覽器原音摘抄)**：${langName}\n\n`;
    let currentBuffer = '';
    let startTimestamp = '';
    let accumulatedLines = [];

    for (const ev of events) {
      if (!ev.segs || !Array.isArray(ev.segs)) continue;
      const text = ev.segs.map(s => s.utf8 || '').join('').trim();
      if (!text || text === '\n') continue;

      const tStartMs = ev.tStartMs || 0;
      const totalSeconds = Math.floor(tStartMs / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      const timeTag = `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}]`;

      if (!startTimestamp) startTimestamp = timeTag;
      currentBuffer += ' ' + text;

      if (currentBuffer.length > 45 || /[.?!。？！]$/.test(text)) {
        accumulatedLines.push(`- **${startTimestamp}** ${currentBuffer.trim()}`);
        currentBuffer = '';
        startTimestamp = '';
      }
    }
    if (currentBuffer.trim()) {
      accumulatedLines.push(`- **${startTimestamp || '[00:00]'}** ${currentBuffer.trim()}`);
    }

    return formattedLines + accumulatedLines.join('\n');
  } catch (err) {
    return null;
  }
}

async function handleUrlClip(tab) {
  if (!tab || !tab.url) return;
  let payload = { url: tab.url };

  // 只在 YouTube 頁面嘗試在瀏覽器端抓取字幕
  if (tab.id && (tab.url.includes("youtube.com/") || tab.url.includes("youtu.be/"))) {
    try {
      // 用 Promise.race 加 6 秒硬限時，確保不會無限等待
      const scriptPromise = chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractYouTubeTranscriptInTab
      });
      const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 6000));
      const results = await Promise.race([scriptPromise, timeoutPromise]);

      if (results && Array.isArray(results) && results[0] && results[0].result) {
        payload.transcript = results[0].result;
      }
    } catch (e) {
      console.warn("YouTube transcript extraction skipped:", e.message || e);
    }
  }

  // 不論字幕是否取得成功，一定會走到這裡送出到 Worker
  await sendToWorker(payload);
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
