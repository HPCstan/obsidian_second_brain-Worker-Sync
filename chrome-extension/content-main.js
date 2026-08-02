// content-main.js — 運行在 YouTube 頁面的 MAIN world
// 擁有頁面 JavaScript 的完整存取權（window.ytInitialPlayerResponse、Cookie 等）
// 透過 window.postMessage 與 isolated world 的 content.js 通訊

window.addEventListener('message', async (event) => {
  if (!event.data || event.data.type !== 'OBSIDIAN_GET_TRANSCRIPT') return;

  try {
    // 方法 1：直接從 YouTube 全域變數取得字幕軌道
    let tracks = null;
    try {
      const pr = window.ytInitialPlayerResponse;
      if (pr && pr.captions) {
        tracks = pr.captions.playerCaptionsTracklistRenderer?.captionTracks;
      }
    } catch (e) {}

    // 方法 2：從頁面的 ytplayer.config 或 DOM 中搜尋
    if (!tracks || !tracks.length) {
      try {
        const scripts = document.querySelectorAll('script');
        for (const s of scripts) {
          const txt = s.textContent || '';
          if (!txt.includes('captionTracks')) continue;
          const match = txt.match(/"captionTracks":(\[.*?\])(?:\s*,|\s*\})/);
          if (match && match[1]) {
            try { tracks = JSON.parse(match[1]); } catch (e) {}
            if (tracks && tracks.length) break;
          }
        }
      } catch (e) {}
    }

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
