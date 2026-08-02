// content.js — 運行在 ISOLATED world
// 負責在網頁頂端直接顯示美觀浮動通知 (Toast)，解析 JSON3 / XML 字幕，自動複製剪貼簿，並回傳診斷

function showInPageToast(message, bgColor, durationMs = 6000) {
  try {
    const existing = document.getElementById('obsidian-clipper-inpage-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'obsidian-clipper-inpage-toast';
    toast.style.cssText = `
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 2147483647;
      padding: 14px 22px;
      background: ${bgColor};
      color: white;
      font-size: 15px;
      font-weight: bold;
      border-radius: 8px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
      font-family: system-ui, -apple-system, sans-serif;
      transition: opacity 0.5s ease;
      display: flex;
      align-items: center;
      gap: 10px;
      line-height: 1.4;
      max-width: 420px;
      pointer-events: none;
    `;
    toast.innerText = message;
    document.body.appendChild(toast);

    if (durationMs > 0) {
      setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 500);
      }, durationMs);
    }
  } catch (e) {
    console.error("Failed to render toast:", e);
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getTranscript') {
    showInPageToast('⏳ [Obsidian Clipper] 正在自 Chrome 提取此影片的字幕，請稍候...', '#3b82f6', 0);

    getTranscriptFromPage()
      .then(res => {
        if (res.success) {
          showInPageToast(`✅ [Obsidian Clipper] 成功擷取 YouTube 字幕 (共 ${res.wordCount} 字) 並已自動備份入電腦剪貼簿！同步存回 GitHub 中！`, '#10b981', 8000);
        } else {
          showInPageToast(`⚠️ [Obsidian Clipper] ${res.error || '字幕提取失敗'}。將僅歸檔影片基本資料至 GitHub。`, '#f97316', 10000);
        }
        sendResponse(res);
      })
      .catch(e => {
        const msg = e.message || '腳本通訊異常';
        showInPageToast(`🚨 [Obsidian Clipper] 通訊異常: ${msg}`, '#ef4444', 8000);
        sendResponse({ success: false, error: msg });
      });
    return true; // 保持 message channel 開啟
  }
});

function getTranscriptFromPage() {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve({ success: false, error: '與 YouTube 主程式通訊逾時 (請確認已按下 F5 重新整理該影片)' });
    }, 5500);

    function handler(event) {
      if (!event.data || event.data.type !== 'OBSIDIAN_TRANSCRIPT_RESULT') return;
      window.removeEventListener('message', handler);
      clearTimeout(timeout);

      if (!event.data.success || !event.data.rawData) {
        resolve({ success: false, error: event.data.error || '未自播放器索取到原始資料' });
        return;
      }

      const rawData = event.data.rawData.trim();
      const langName = event.data.langName || '預設字幕';

      try {
        let formatted = null;
        if (rawData.startsWith('<') || rawData.includes('<transcript>')) {
          formatted = formatXmlTranscript(rawData, langName);
        } else if (rawData.startsWith('{') || rawData.includes('"events"')) {
          formatted = formatJsonTranscript(rawData, langName);
        }

        if (!formatted || formatted.length < 20) {
          resolve({ success: false, error: '資料已接收但無法成功轉譯排版成 Markdown 字串' });
          return;
        }

        // 自動複製到使用者的 系統剪貼簿 供即時驗證或補貼
        try {
          navigator.clipboard.writeText(formatted).catch(() => {});
        } catch (e) {}

        resolve({ success: true, transcript: formatted, wordCount: formatted.length });
      } catch (e) {
        resolve({ success: false, error: `解析格式時發生報錯 (${e.message})` });
      }
    }

    window.addEventListener('message', handler);
    window.postMessage({ type: 'OBSIDIAN_GET_TRANSCRIPT' });
  });
}

function formatJsonTranscript(rawJson, langName) {
  const data = JSON.parse(rawJson);
  const events = data.events;
  if (!events || !Array.isArray(events)) return null;

  let result = `> 💡 **字幕語系 / 版本 (自 Chrome 即時提取)**：${langName}\n\n`;
  let currentBuffer = '';
  let startTimestamp = '';
  const lines = [];

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
      lines.push(`- **${startTimestamp}** ${currentBuffer.trim()}`);
      currentBuffer = '';
      startTimestamp = '';
    }
  }
  if (currentBuffer.trim()) {
    lines.push(`- **${startTimestamp || '[00:00]'}** ${currentBuffer.trim()}`);
  }

  if (lines.length === 0) return null;
  return result + lines.join('\n');
}

function formatXmlTranscript(rawXml, langName) {
  const doc = new DOMParser().parseFromString(rawXml, 'text/xml');
  const textNodes = doc.querySelectorAll('text');
  if (!textNodes || textNodes.length === 0) return null;

  let result = `> 💡 **字幕語系 / 版本 (自 Chrome 即時提取)**：${langName}\n\n`;
  let currentBuffer = '';
  let startTimestamp = '';
  const lines = [];

  textNodes.forEach((node) => {
    const text = (node.textContent || '').trim();
    if (!text) return;
    const start = parseFloat(node.getAttribute('start') || '0');
    const totalSeconds = Math.floor(start);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const timeTag = `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}]`;

    if (!startTimestamp) startTimestamp = timeTag;
    currentBuffer += ' ' + text;

    if (currentBuffer.length > 45 || /[.?!。？！]$/.test(text)) {
      lines.push(`- **${startTimestamp}** ${currentBuffer.trim()}`);
      currentBuffer = '';
      startTimestamp = '';
    }
  });
  if (currentBuffer.trim()) {
    lines.push(`- **${startTimestamp || '[00:00]'}** ${currentBuffer.trim()}`);
  }

  if (lines.length === 0) return null;
  return result + lines.join('\n');
}
