// content-main.js — 運行在 YouTube 頁面的 MAIN world
// 與影片播放器實體及全域變數深度對接，抓取 JSON3/XML 字幕下載線路並帶上 Cookie 請求，完備診斷

window.addEventListener('message', async (event) => {
  if (!event.data || event.data.type !== 'OBSIDIAN_GET_TRANSCRIPT') return;

  try {
    let tracks = null;
    let tryMethodsLog = [];

    // 1. 從 live 的 YouTube 播放器元件呼叫 API
    try {
      const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
      if (player && typeof player.getPlayerResponse === 'function') {
        const response = player.getPlayerResponse();
        if (response && response.captions) {
          tracks = response.captions.playerCaptionsTracklistRenderer?.captionTracks;
          if (tracks && tracks.length) tryMethodsLog.push("movie_player (成功)");
        } else {
          tryMethodsLog.push("movie_player (無 captions)");
        }
      } else {
        tryMethodsLog.push("movie_player (未尋獲播放器物件)");
      }
    } catch (e) {
      tryMethodsLog.push("movie_player 錯誤");
    }

    // 2. 備用：從 ytInitialPlayerResponse 取得
    if (!tracks || !tracks.length) {
      if (window.ytInitialPlayerResponse && window.ytInitialPlayerResponse.captions) {
        tracks = window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer?.captionTracks;
        if (tracks && tracks.length) tryMethodsLog.push("ytInitialPlayerResponse (成功)");
      } else {
        tryMethodsLog.push("ytInitialPlayerResponse (無字幕)");
      }
    }

    // 3. 備用：從 ytplayer.config 取得
    if ((!tracks || !tracks.length) && window.ytplayer && window.ytplayer.config) {
      try {
        const args = window.ytplayer.config.args;
        if (args && args.raw_player_response && args.raw_player_response.captions) {
          tracks = args.raw_player_response.captions.playerCaptionsTracklistRenderer?.captionTracks;
          if (tracks && tracks.length) tryMethodsLog.push("ytplayer.config (成功)");
        }
      } catch (e) {}
    }

    // 4. 備用：從 DOM script 標籤原始碼尋找
    if (!tracks || !tracks.length) {
      const scripts = document.querySelectorAll('script');
      for (const s of scripts) {
        const txt = s.textContent || '';
        if (!txt.includes('captionTracks')) continue;
        const match = txt.match(/"captionTracks"\s*:\s*(\[[\s\S]*?\])\s*,\s*"/);
        if (match && match[1]) {
          try { tracks = JSON.parse(match[1]); } catch (e) {}
          if (tracks && tracks.length) {
            tryMethodsLog.push("DOM scripts (成功)");
            break;
          }
        }
      }
    }

    if (!tracks || !tracks.length) {
      const detail = tryMethodsLog.length ? `(已嘗試: ${tryMethodsLog.join(', ')})` : '';
      window.postMessage({ type: 'OBSIDIAN_TRANSCRIPT_RESULT', success: false, error: `於頁面變數中未見 captionTracks 欄位 ${detail}` });
      return;
    }

    // 挑選語系：中文優先 > 英文 > 第一個
    let selectedTrack =
      tracks.find(t => t.languageCode === 'zh-Hant' || t.languageCode === 'zh-TW' || t.languageCode === 'zh') ||
      tracks.find(t => t.languageCode && t.languageCode.startsWith('en')) ||
      tracks[0];

    if (!selectedTrack || !selectedTrack.baseUrl) {
      window.postMessage({ type: 'OBSIDIAN_TRANSCRIPT_RESULT', success: false, error: '自 captionTracks 解析成功，但該軌道中毫無 baseUrl 連結' });
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
        errReason = `JSON3 下載失敗 (HTTP ${res.status})`;
      }
    } catch (e) {
      errReason = `JSON3 網路請求失敗 (${e.message})`;
    }

    // 判斷是否含有字幕關鍵特徵 (不過濾 Google 安全前綴如 )]}')
    const isValidContent = (str) => str && (str.includes('{') || str.includes('<') || str.includes('events') || str.includes('transcript'));

    // 如果 JSON3 下載異常或內容無效，改打 XML 原生接口
    if (!rawText || !isValidContent(rawText)) {
      try {
        const xmlRes = await fetch(selectedTrack.baseUrl, {
          credentials: 'include',
          signal: controller.signal,
        });
        if (xmlRes.ok) {
          rawText = await xmlRes.text();
          errReason = null;
        } else {
          errReason = `XML 與 JSON3 下載皆失敗 (HTTP ${xmlRes.status})`;
        }
      } catch (e) {
        errReason = `連線 YouTube 字幕線路逾時或受阻 (${e.message})`;
      }
    }
    clearTimeout(timeoutId);

    if (!rawText || !isValidContent(rawText)) {
      const snippet = rawText ? `(收到的內容開頭: [${rawText.substring(0, 40).replace(/\n/g, ' ')}])` : '(完全空白)';
      window.postMessage({ type: 'OBSIDIAN_TRANSCRIPT_RESULT', success: false, error: errReason || `下載內容不符合 JSON/XML 結構 ${snippet}` });
      return;
    }

    window.postMessage({ type: 'OBSIDIAN_TRANSCRIPT_RESULT', success: true, rawData: rawText, langName });
  } catch (e) {
    window.postMessage({ type: 'OBSIDIAN_TRANSCRIPT_RESULT', success: false, error: `提取腳本崩潰 (${e.message})` });
  }
});
