// content.js — 運行在 ISOLATED world
// 負責解析 JSON3 / XML 字幕內容，將字幕備份至 Windows 系統剪貼簿，並向 background 回傳字數與狀態

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getTranscript') {
    getTranscriptFromPage()
      .then(res => sendResponse(res))
      .catch(e => sendResponse({ success: false, error: e.message || '腳本通訊異常' }));
    return true; // 保持 message channel 開啟
  }
});

function getTranscriptFromPage() {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve({ success: false, error: '與 Youtube 主世界通訊逾時 (5 秒內無回應)' });
    }, 5500);

    function handler(event) {
      if (!event.data || event.data.type !== 'OBSIDIAN_TRANSCRIPT_RESULT') return;
      window.removeEventListener('message', handler);
      clearTimeout(timeout);

      if (!event.data.success || !event.data.rawData) {
        resolve({ success: false, error: event.data.error || '未索取到原始資料' });
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
          resolve({ success: false, error: '資料雖然存在但無法成功排版成字串' });
          return;
        }

        // 自動複製到使用者的 系統剪貼簿 供即時驗證或補貼
        try {
          navigator.clipboard.writeText(formatted).catch(() => {});
        } catch (e) {}

        resolve({ success: true, transcript: formatted, wordCount: formatted.length });
      } catch (e) {
        resolve({ success: false, error: `解析格式時發生意外報錯 (${e.message})` });
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
