// content.js — 只在 YouTube 頁面注入，負責在瀏覽器端提取字幕
// 透過 chrome.runtime.onMessage 與 background.js 通訊

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getTranscript') {
    extractTranscript()
      .then(transcript => sendResponse({ transcript }))
      .catch(() => sendResponse({ transcript: null }));
    return true; // 保持 message channel 開啟以支援 async 回覆
  }
});

async function extractTranscript() {
  // 方法 1：從 YouTube 全域變數取得字幕軌道
  let tracks = null;
  try {
    if (window.ytInitialPlayerResponse && window.ytInitialPlayerResponse.captions) {
      tracks = window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer?.captionTracks;
    }
  } catch (e) {}

  // 方法 2：從 <script> 標籤中用 regex 搜尋
  if (!tracks || !tracks.length) {
    const scripts = document.querySelectorAll('script');
    for (const s of scripts) {
      const txt = s.textContent || '';
      const match = txt.match(/"captionTracks":\s*(\[.*?\])\s*,/);
      if (match && match[1]) {
        try {
          tracks = JSON.parse(match[1]);
        } catch (e) {}
        if (tracks && tracks.length) break;
      }
    }
  }

  if (!tracks || !tracks.length) return null;

  // 挑選語系：中文優先 > 英文 > 第一個
  let selectedTrack =
    tracks.find(t => t.languageCode === 'zh-Hant' || t.languageCode === 'zh-TW' || t.languageCode === 'zh') ||
    tracks.find(t => t.languageCode && t.languageCode.startsWith('en')) ||
    tracks[0];

  if (!selectedTrack || !selectedTrack.baseUrl) return null;

  const langName = (selectedTrack.name && selectedTrack.name.simpleText) || selectedTrack.languageCode || '預設字幕';

  // 在使用者瀏覽器中 fetch 字幕（帶上真實 Cookie），4 秒超時
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  let res;
  try {
    res = await fetch(selectedTrack.baseUrl + '&fmt=json3', {
      credentials: 'include',
      signal: controller.signal,
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
  try { data = JSON.parse(rawText); } catch (e) { return null; }

  const events = data.events;
  if (!events || !Array.isArray(events)) return null;

  // 格式化字幕為 Markdown
  let formattedLines = `> 💡 **字幕語系 (瀏覽器端摘取)**：${langName}\n\n`;
  let currentBuffer = '';
  let startTimestamp = '';
  const accumulatedLines = [];

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
}
