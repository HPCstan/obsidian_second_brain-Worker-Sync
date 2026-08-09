// content-main.js — 運行在 YouTube 頁面的 MAIN world
// 🏆 核心革新：以「網頁 DOM UI 自動模擬點擊與元素抓取」為第一優先戰略 (全面抵禦 YouTube 空值與防蟲簽證封鎖)，網路接口 API 作為二線備用

async function extractFromDOM() {
  try {
    // 1. 檢查是否已經有字幕面版開啟中
    let segments = document.querySelectorAll('ytd-transcript-segment-renderer, .transcript-segment');
    
    if (!segments || segments.length === 0) {
      // 嘗試點擊展開說明欄 (#expand)
      const expandBtn = document.querySelector('ytd-text-inline-expander #expand, #description #expand, tp-yt-paper-button#expand');
      if (expandBtn && expandBtn.click) {
        try { expandBtn.click(); } catch(e){}
      }

      // 稍等 200ms 讓說明欄開起與渲染
      await new Promise(r => setTimeout(r, 200));

      // 尋找「顯示轉錄稿 / Show transcript / 打開文字稿」按鈕 (不限語系，透過 YouTube 標準組件架構過濾)
      let transcriptBtn = document.querySelector(
        'ytd-video-description-transcript-section-renderer button, ' +
        'ytd-video-description-transcript-section-renderer yt-button-shape button, ' +
        'button[aria-label*="transcript" i], ' +
        'button[aria-label*="轉錄" i], ' +
        'button[aria-label*="转录" i], ' +
        'button[aria-label*="文字稿" i]'
      );

      // 如果沒透過 selector 找到，遍歷頁面上可見按鈕尋找特徵關鍵字
      if (!transcriptBtn) {
        const allBtns = document.querySelectorAll('button, tp-yt-paper-button, yt-button-shape button');
        for (const btn of allBtns) {
          const txt = (btn.textContent || btn.getAttribute('aria-label') || '').trim();
          if (/show transcript|顯示轉錄稿|打开转录稿|显示转录稿|打開文字稿|打开文字稿|開啟轉錄稿|字幕/i.test(txt) && !/cc|subtitle/i.test(txt)) {
            transcriptBtn = btn;
            break;
          }
        }
      }

      if (transcriptBtn && transcriptBtn.click) {
        try { transcriptBtn.click(); } catch(e){}
      }

      // 等待 YouTube 官方渲染字幕面板登場 (最多等待 2.5 秒，每 200ms 探測一次)
      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 200));
        segments = document.querySelectorAll('ytd-transcript-segment-renderer, .transcript-segment');
        if (segments && segments.length > 0) break;
      }
    }

    if (!segments || segments.length === 0) {
      return null;
    }

    // 讀取字幕節點中的時間戳與文字
    let result = `> 💡 **字幕來源 (自 YouTube 網頁 DOM 官方面板自動取回)**：Live Transcript UI\n\n`;
    let currentBuffer = '';
    let startTimestamp = '';
    const lines = [];

    segments.forEach((seg) => {
      const timeEl = seg.querySelector('.segment-timestamp, .segment-start-offset, [class*="timestamp"]');
      const textEl = seg.querySelector('.segment-text, .segment-text-content, [class*="text"]');
      
      let timeTag = timeEl ? timeEl.textContent.trim().replace(/\[|\]/g, '') : '00:00';
      const text = textEl ? textEl.textContent.trim() : '';
      if (!text) return;

      if (!startTimestamp) startTimestamp = timeTag;
      currentBuffer += ' ' + text;

      if (currentBuffer.length > 45 || /[.?!。？！]$/.test(text)) {
        lines.push(`- **[${startTimestamp}]** ${currentBuffer.trim()}`);
        currentBuffer = '';
        startTimestamp = '';
      }
    });

    if (currentBuffer.trim()) {
      lines.push(`- **[${startTimestamp || '00:00'}]** ${currentBuffer.trim()}`);
    }

    return lines.length > 0 ? (result + lines.join('\n')) : null;
  } catch (e) {
    console.warn("[Obsidian Clipper] DOM extraction error:", e);
    return null;
  }
}

window.addEventListener('message', async (event) => {
  if (!event.data || event.data.type !== 'OBSIDIAN_GET_TRANSCRIPT') return;

  try {
    // 檢查是否為行動版網頁 (m.youtube.com)
    if (window.location.hostname === 'm.youtube.com') {
      window.postMessage({ 
        type: 'OBSIDIAN_TRANSCRIPT_RESULT', 
        success: false, 
        error: '行動版網頁 (m.youtube.com) 不支援字幕擷取！請在 Kiwi Browser 右上角選單勾選「電腦版網站 (Desktop site)」後再試一次！' 
      });
      return;
    }

    // 🥇 第一優先：嘗試直接呼叫 YouTube 官方 UI DOM 字幕面板取詞 (100% 免除 HTTP API 遭阻擋或空白字元防護)
    const domTranscript = await extractFromDOM();
    if (domTranscript && domTranscript.length > 30) {
      window.postMessage({ type: 'OBSIDIAN_TRANSCRIPT_RESULT', success: true, formatted: domTranscript, source: 'DOM_UI' });
      return;
    }

    // 🥈 第二順位：網路請求 API 下載與 JSON/XML 解析
    let tracks = null;
    let tryMethodsLog = [];

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
        tryMethodsLog.push("movie_player (未尋獲播放器)");
      }
    } catch (e) {
      tryMethodsLog.push("movie_player 錯誤");
    }

    if (!tracks || !tracks.length) {
      if (window.ytInitialPlayerResponse && window.ytInitialPlayerResponse.captions) {
        tracks = window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer?.captionTracks;
        if (tracks && tracks.length) tryMethodsLog.push("ytInitialPlayerResponse (成功)");
      }
    }

    if ((!tracks || !tracks.length) && window.ytplayer && window.ytplayer.config) {
      try {
        const args = window.ytplayer.config.args;
        if (args && args.raw_player_response && args.raw_player_response.captions) {
          tracks = args.raw_player_response.captions.playerCaptionsTracklistRenderer?.captionTracks;
          if (tracks && tracks.length) tryMethodsLog.push("ytplayer.config (成功)");
        }
      } catch (e) {}
    }

    if (!tracks || !tracks.length) {
      const detail = tryMethodsLog.length ? `(已嘗試: ${tryMethodsLog.join(', ')})` : '';
      window.postMessage({ type: 'OBSIDIAN_TRANSCRIPT_RESULT', success: false, error: `DOM 提取及 API 皆失敗，未見 captionTracks ${detail}` });
      return;
    }

    let selectedTrack =
      tracks.find(t => t.languageCode === 'zh-Hant' || t.languageCode === 'zh-TW' || t.languageCode === 'zh' || t.languageCode === 'zh-Hans' || t.languageCode === 'zh-CN') ||
      tracks.find(t => t.languageCode && t.languageCode.startsWith('en')) ||
      tracks[0];

    if (!selectedTrack || !selectedTrack.baseUrl) {
      window.postMessage({ type: 'OBSIDIAN_TRANSCRIPT_RESULT', success: false, error: '找到軌道但無 baseUrl 下載鏈接' });
      return;
    }

    const langName = (selectedTrack.name && selectedTrack.name.simpleText) || selectedTrack.languageCode || '預設字幕';

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

    const isValidContent = (str) => str && (str.includes('{') || str.includes('<') || str.includes('events') || str.includes('transcript'));

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
          errReason = `XML 下載失敗 (HTTP ${xmlRes.status})`;
        }
      } catch (e) {
        errReason = `連線 YouTube 字幕線路受阻 (${e.message})`;
      }
    }
    clearTimeout(timeoutId);

    if (!rawText || !isValidContent(rawText)) {
      const snippet = rawText ? `(收到的內容開頭: [${rawText.substring(0, 40).replace(/\n/g, ' ')}])` : '(完全空白)';
      window.postMessage({ type: 'OBSIDIAN_TRANSCRIPT_RESULT', success: false, error: errReason || `API 下載遭到 YouTube 阻絕 ${snippet}` });
      return;
    }

    window.postMessage({ type: 'OBSIDIAN_TRANSCRIPT_RESULT', success: true, rawData: rawText, langName, source: 'NETWORK_API' });
  } catch (e) {
    window.postMessage({ type: 'OBSIDIAN_TRANSCRIPT_RESULT', success: false, error: `提取腳本崩潰 (${e.message})` });
  }
});
