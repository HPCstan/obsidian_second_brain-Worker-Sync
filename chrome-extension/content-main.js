// content-main.js — 運行在 YouTube 頁面的 MAIN world
// 在頁面載入時就主動快取字幕資料，確保不會因 YouTube SPA 切換而遺失

let cachedTranscriptData = null;

// 頁面載入時立即嘗試擷取字幕資料並快取
function cacheTranscriptData() {
  try {
    let tracks = null;

    // 方法 1：從 ytInitialPlayerResponse 取得
    if (window.ytInitialPlayerResponse && window.ytInitialPlayerResponse.captions) {
      tracks = window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer?.captionTracks;
    }

    // 方法 2：從 ytplayer.config 取得
    if ((!tracks || !tracks.length) && window.ytplayer && window.ytplayer.config) {
      try {
        const args = window.ytplayer.config.args;
        if (args && args.raw_player_response && args.raw_player_response.captions) {
          tracks = args.raw_player_response.captions.playerCaptionsTracklistRenderer?.captionTracks;
        }
      } catch (e) {}
    }

    // 方法 3：從 DOM script 標籤搜尋
    if (!tracks || !tracks.length) {
      const scripts = document.querySelectorAll('script');
      for (const s of scripts) {
        const txt = s.textContent || '';
        if (!txt.includes('captionTracks')) continue;
        // 使用更寬鬆的 regex 擷取 captionTracks 陣列
        const match = txt.match(/"captionTracks"\s*:\s*(\[[\s\S]*?\])\s*,\s*"/);
        if (match && match[1]) {
          try { tracks = JSON.parse(match[1]); } catch (e) {}
          if (tracks && tracks.length) break;
        }
        // 備用 regex
        const match2 = txt.match(/"captionTracks"\s*:\s*(\[.*?\])\s*[,}]/);
        if (match2 && match2[1]) {
          try { tracks = JSON.parse(match2[1]); } catch (e) {}
          if (tracks && tracks.length) break;
        }
      }
    }

    if (tracks && tracks.length) {
      cachedTranscriptData = tracks;
    }
  } catch (e) {}
}

// 立即執行一次快取（可能還太早，沒資料）
cacheTranscriptData();

// DOM 載入完成後再試一次
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => cacheTranscriptData());
}

// 延遲 1.5 秒後再試一次（確保 YouTube SPA 初始化完成）
setTimeout(() => cacheTranscriptData(), 1500);

// 監聽 content.js 的請求
window.addEventListener('message', async (event) => {
  if (!event.data || event.data.type !== 'OBSIDIAN_GET_TRANSCRIPT') return;

  try {
    // 如果快取為空，再嘗試一次
    if (!cachedTranscriptData) cacheTranscriptData();

    const tracks = cachedTranscriptData;
    if (!tracks || !tracks.length) {
      window.postMessage({ type: 'OBSIDIAN_TRANSCRIPT_RESULT', rawData: null, langName: null });
      return;
    }

    // 挑選語系：中文優先 > 英文 > 第一個
    let selectedTrack =
      tracks.find(t => t.languageCode === 'zh-Hant' || t.languageCode === 'zh-TW' || t.languageCode === 'zh') ||
      tracks.find(t => t.languageCode && t.languageCode.startsWith('en')) ||
      tracks[0];

    if (!selectedTrack || !selectedTrack.baseUrl) {
      window.postMessage({ type: 'OBSIDIAN_TRANSCRIPT_RESULT', rawData: null, langName: null });
      return;
    }

    const langName = (selectedTrack.name && selectedTrack.name.simpleText) || selectedTrack.languageCode || '';

    // 在頁面主世界中 fetch — 自動帶上使用者真實的 YouTube Cookie
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(selectedTrack.baseUrl + '&fmt=json3', {
      credentials: 'include',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      window.postMessage({ type: 'OBSIDIAN_TRANSCRIPT_RESULT', rawData: null, langName });
      return;
    }

    const rawText = await res.text();
    window.postMessage({ type: 'OBSIDIAN_TRANSCRIPT_RESULT', rawData: rawText, langName });
  } catch (e) {
    window.postMessage({ type: 'OBSIDIAN_TRANSCRIPT_RESULT', rawData: null, langName: null });
  }
});
