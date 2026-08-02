// content.js — 運行在 ISOLATED world
// 負責與 background.js 通訊（chrome API），並透過 window.postMessage 與 content-main.js 交換資料

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getTranscript') {
    getTranscriptFromPage()
      .then(transcript => sendResponse({ transcript }))
      .catch(() => sendResponse({ transcript: null }));
    return true; // 保持 message channel 開啟
  }
});

function getTranscriptFromPage() {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve(null);
    }, 6000);

    function handler(event) {
      if (!event.data || event.data.type !== 'OBSIDIAN_TRANSCRIPT_RESULT') return;
      window.removeEventListener('message', handler);
      clearTimeout(timeout);

      const rawData = event.data.rawData;
      const langName = event.data.langName || '預設字幕';

      if (!rawData || rawData.length < 10 || !rawData.startsWith('{')) {
        resolve(null);
        return;
      }

      try {
        const formatted = formatTranscript(rawData, langName);
        resolve(formatted);
      } catch (e) {
        resolve(null);
      }
    }

    window.addEventListener('message', handler);
    // 向 MAIN world 的 content-main.js 發送提取請求
    window.postMessage({ type: 'OBSIDIAN_GET_TRANSCRIPT' });
  });
}

function formatTranscript(rawJson, langName) {
  const data = JSON.parse(rawJson);
  const events = data.events;
  if (!events || !Array.isArray(events)) return null;

  let result = `> 💡 **字幕語系 (瀏覽器端摘取)**：${langName}\n\n`;
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
