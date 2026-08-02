// content-main.js — 運行在 YouTube 頁面的 MAIN world
// 當按下 Obsidian Clipper 時，即時向 YouTube 播放器 (movie_player) 請求最新的字幕資料，徹底解決 SPA 分頁切換找不到字幕的問題

window.addEventListener('message', async (event) => {
  if (!event.data || event.data.type !== 'OBSIDIAN_GET_TRANSCRIPT') return;

  try {
    let tracks = null;

    // 🏆 最強方法 1：即時從 live 的 YouTube 播放器元件呼叫 API，SPA 換頁百分之百能抓到最新影片的字幕
    try {
      const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
      if (player && typeof player.getPlayerResponse === 'function') {
        const response = player.getPlayerResponse();
        if (response && response.captions) {
          tracks = response.captions.playerCaptionsTracklistRenderer?.captionTracks;
        }
      }
    } catch (e) {
      console.warn("getPlayerResponse failed:", e);
    }

    // 備用方法 2：從 ytInitialPlayerResponse 取得
    if (!tracks || !tracks.length) {
      if (window.ytInitialPlayerResponse && window.ytInitialPlayerResponse.captions) {
        tracks = window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer?.captionTracks;
      }
    }

    // 備用方法 3：從 ytplayer.config 取得
    if ((!tracks || !tracks.length) && window.ytplayer && window.ytplayer.config) {
      try {
        const args = window.ytplayer.config.args;
        if (args && args.raw_player_response && args.raw_player_response.captions) {
          tracks = args.raw_player_response.captions.playerCaptionsTracklistRenderer?.captionTracks;
        }
      } catch (e) {}
    }

    if (!tracks || !tracks.length) {
      console.warn("[Obsidian Clipper] 找不到可用之字幕軌道資料。");
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

    // 在頁面主世界中 fetch — 自動帶上使用者真實的 YouTube Cookie 與 Session
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(selectedTrack.baseUrl + '&fmt=json3', {
      credentials: 'include',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn("[Obsidian Clipper] 下載字幕 JSON3 失敗:", res.status);
      window.postMessage({ type: 'OBSIDIAN_TRANSCRIPT_RESULT', rawData: null, langName });
      return;
    }

    const rawText = await res.text();
    window.postMessage({ type: 'OBSIDIAN_TRANSCRIPT_RESULT', rawData: rawText, langName });
  } catch (e) {
    console.error("[Obsidian Clipper] 字幕提取處理拋錯:", e);
    window.postMessage({ type: 'OBSIDIAN_TRANSCRIPT_RESULT', rawData: null, langName: null });
  }
});
