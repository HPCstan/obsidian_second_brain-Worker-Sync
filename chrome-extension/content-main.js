// content-main.js — 運行在 YouTube 頁面的 MAIN world
// 與影片播放器實體互動，提取字幕下載鏈接並帶上 Cookie 下載，隨後傳送回 ISOLATED world

window.addEventListener('message', async (event) => {
  if (!event.data || event.data.type !== 'OBSIDIAN_GET_TRANSCRIPT') return;

  try {
    let tracks = null;

    // 1. 從 live 的 YouTube 播放器元件呼叫 API
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

    // 2. 備用：從 ytInitialPlayerResponse 取得
    if (!tracks || !tracks.length) {
      if (window.ytInitialPlayerResponse && window.ytInitialPlayerResponse.captions) {
        tracks = window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer?.captionTracks;
      }
    }

    // 3. 備用：從 ytplayer.config 取得
    if ((!tracks || !tracks.length) && window.ytplayer && window.ytplayer.config) {
      try {
        const args = window.ytplayer.config.args;
        if (args && args.raw_player_response && args.raw_player_response.captions) {
          tracks = args.raw_player_response.captions.playerCaptionsTracklistRenderer?.captionTracks;
        }
      } catch (e) {}
    }

    if (!tracks || !tracks.length) {
      window.postMessage({ type: 'OBSIDIAN_TRANSCRIPT_RESULT', success: false, error: '此影片未提供授權字幕或 API 中未含 captionTracks' });
      return;
    }

    // 挑選語系：中文優先 > 英文 > 第一個
    let selectedTrack =
      tracks.find(t => t.languageCode === 'zh-Hant' || t.languageCode === 'zh-TW' || t.languageCode === 'zh') ||
      tracks.find(t => t.languageCode && t.languageCode.startsWith('en')) ||
      tracks[0];

    if (!selectedTrack || !selectedTrack.baseUrl) {
      window.postMessage({ type: 'OBSIDIAN_TRANSCRIPT_RESULT', success: false, error: '無法自字幕軌道中取得下載鏈接 (baseUrl 為空)' });
      return;
    }

    const langName = (selectedTrack.name && selectedTrack.name.simpleText) || selectedTrack.languageCode || '預設字幕';

    // 優先下載 JSON3 格式；如果失敗或拒捕則直接載入默認 XML 格式
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    let rawText = null;
    let errReason = null;
    try {
      const res = await fetch(selectedTrack.baseUrl + '&fmt=json3', {
        credentials: 'include',
        signal: controller.signal,
      });
      if (res.ok) {
        rawText = await res.text();
      } else {
        errReason = `JSON3 接口 HTTP 狀態碼 ${res.status}`;
      }
    } catch (e) {
      errReason = e.message;
    }

    // 如果 JSON3 下載異常或回傳非 JSON，改打 XML 原生接口
    if (!rawText || (!rawText.trim().startsWith('{') && !rawText.trim().startsWith('<'))) {
      try {
        const xmlRes = await fetch(selectedTrack.baseUrl, {
          credentials: 'include',
          signal: controller.signal,
        });
        if (xmlRes.ok) {
          rawText = await xmlRes.text();
          errReason = null;
        } else {
          errReason = `XML 與 JSON3 接口皆遭到阻擋 (HTTP ${xmlRes.status})`;
        }
      } catch (e) {
        errReason = `連線 YouTube 字幕線路逾時 (${e.message})`;
      }
    }
    clearTimeout(timeoutId);

    if (!rawText || (!rawText.trim().startsWith('{') && !rawText.trim().startsWith('<'))) {
      window.postMessage({ type: 'OBSIDIAN_TRANSCRIPT_RESULT', success: false, error: errReason || '下載之字幕內容長度不符或非 JSON/XML 結構' });
      return;
    }

    window.postMessage({ type: 'OBSIDIAN_TRANSCRIPT_RESULT', success: true, rawData: rawText, langName });
  } catch (e) {
    window.postMessage({ type: 'OBSIDIAN_TRANSCRIPT_RESULT', success: false, error: `提取腳本嚴重崩潰 (${e.message})` });
  }
});
