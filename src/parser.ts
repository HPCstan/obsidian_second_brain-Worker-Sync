import { Env } from './env';
import { saveToGitHub } from './github';
import { sendMessage } from './telegram';

// Helper to sanitize filenames
function sanitizeFilename(name: string): string {
  // Remove \ / : * ? " < > |
  return name.replace(/[\\/:*?"<>|]/g, '').trim();
}

function generateYamlFrontmatter(title: string, url: string, author?: string): string {
  const now = new Date();
  // Escape double quotes in title
  const safeTitle = title.replace(/"/g, '\\"');
  
  return `---
title: "${safeTitle}"
source: "${url}"
author: "${author || 'Unknown'}"
created_at: ${now.toISOString()}
tags:
  - clipping
  - unread
---

`;
}

function getYouTubeVideoId(url: string): string | null {
  const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
  const match = url.match(regExp);
  return (match && match[1].length === 11) ? match[1] : null;
}

function decodeHtmlEntities(str: string): string {
  return str.replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&#x27;/g, "'")
            .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c, 10)));
}

async function generateSapisidHash(cookieStr?: string): Promise<string | null> {
  if (!cookieStr) return null;
  const match = cookieStr.match(/SAPISID=([^;]+)/) || cookieStr.match(/__Secure-3PAPISID=([^;]+)/);
  if (!match || !match[1]) return null;
  const sapisid = match[1];
  const timestamp = Math.floor(Date.now() / 1000);
  const input = `${timestamp} ${sapisid} https://www.youtube.com`;
  const buffer = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(input));
  const hashArray = Array.from(new Uint8Array(buffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `SAPISIDHASH ${timestamp}_${hashHex}_u SAPISID3PHASH ${timestamp}_${hashHex}_u`;
}

function formatXmlTranscript(rawXml: string, langName: string): string | null {
  const formattedHeader = `> 💡 **字幕語系 / 版本**：${langName} (透過 Oculus VR 高階解密授權取得)\n\n`;
  const regex = /<p\s+t="(\d+)"[^>]*>(.*?)<\/p>/gs;
  const matches: { tMs: number; text: string }[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(rawXml)) !== null) {
    const tMs = parseInt(match[1], 10) || 0;
    let text = match[2].replace(/<[^>]+>/g, '').trim();
    text = decodeHtmlEntities(text);
    if (text && text !== '\n') {
      matches.push({ tMs, text });
    }
  }
  if (matches.length === 0) return null;

  let currentBuffer = '';
  let startTimestamp = '';
  const accumulatedLines: string[] = [];
  for (const item of matches) {
    const totalSeconds = Math.floor(item.tMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const timeTag = `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}]`;
    if (!startTimestamp) startTimestamp = timeTag;
    currentBuffer += ' ' + item.text;
    if (currentBuffer.length > 45 || /[.?!。？！；]$/.test(item.text)) {
      accumulatedLines.push(`- **${startTimestamp}** ${currentBuffer.trim()}`);
      currentBuffer = '';
      startTimestamp = '';
    }
  }
  if (currentBuffer.trim()) {
    accumulatedLines.push(`- **${startTimestamp || '[00:00]'}** ${currentBuffer.trim()}`);
  }
  return formattedHeader + accumulatedLines.join('\n');
}

function formatJson3Transcript(rawJson: string, langName: string): string | null {
  try {
    const captionData: any = JSON.parse(rawJson);
    const events = captionData.events;
    if (!events || !Array.isArray(events)) return null;
    let formattedHeader = `> 💡 **字幕語系 / 版本**：${langName}\n\n`;
    let currentBuffer = '';
    let startTimestamp = '';
    const accumulatedLines: string[] = [];
    for (const ev of events) {
      if (!ev.segs || !Array.isArray(ev.segs)) continue;
      let text = ev.segs.map((s: any) => s.utf8 || '').join('').trim();
      text = decodeHtmlEntities(text);
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
    return formattedHeader + accumulatedLines.join('\n');
  } catch {
    return null;
  }
}

export async function fetchYouTubeTranscript(videoId: string, env?: Env): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const pageHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7'
    };
    if (env?.YOUTUBE_COOKIE) {
      pageHeaders['Cookie'] = env.YOUTUBE_COOKIE;
    }

    const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      signal: controller.signal,
      headers: pageHeaders
    });
    
    if (!pageRes.ok) {
      return '> ℹ️ *無法取得影片網頁資料或遭到 YouTube 防衛安全驗證封阻。*';
    }
    const html = await pageRes.text();
    const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
    const apiKey = (apiKeyMatch && apiKeyMatch[1]) ? apiKeyMatch[1] : 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
    const visitorMatch = html.match(/"visitorData":"([^"]+)"/) || html.match(/"X-Goog-Visitor-Id":"([^"]+)"/);
    const visitorId = (visitorMatch && visitorMatch[1]) ? visitorMatch[1] : undefined;

    // 優先：使用 Oculus Quest 3 (ANDROID_VR) API 繞過伺服器端 Token 驗證
    let tracks: any[] = [];
    try {
      const vrHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
        'X-Youtube-Client-Name': '28',
        'X-Youtube-Client-Version': '1.65.10',
        'Origin': 'https://www.youtube.com',
        'X-Origin': 'https://www.youtube.com'
      };
      if (env?.YOUTUBE_COOKIE) {
        vrHeaders['Cookie'] = env.YOUTUBE_COOKIE;
        const authHash = await generateSapisidHash(env.YOUTUBE_COOKIE);
        if (authHash) vrHeaders['Authorization'] = authHash;
      }
      if (visitorId) vrHeaders['X-Goog-Visitor-Id'] = visitorId;

      const vrBody = {
        context: {
          client: {
            clientName: "ANDROID_VR",
            clientVersion: "1.65.10",
            deviceMake: "Oculus",
            deviceModel: "Quest 3",
            androidSdkVersion: 32,
            userAgent: vrHeaders['User-Agent'],
            osName: "Android",
            osVersion: "12L",
            hl: "zh-TW",
            gl: "TW",
            timeZone: "Asia/Taipei",
            utcOffsetMinutes: 480
          }
        },
        videoId: videoId,
        playbackContext: { contentPlaybackContext: { html5Preference: "HTML5_PREF_WANTS" } },
        contentCheckOk: true,
        racyCheckOk: true
      };

      const playerRes = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}&prettyPrint=false`, {
        method: 'POST',
        headers: vrHeaders,
        body: JSON.stringify(vrBody),
        signal: controller.signal
      });

      if (playerRes.ok) {
        const playerData: any = await playerRes.json();
        const vrTracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (Array.isArray(vrTracks) && vrTracks.length > 0) {
          tracks = vrTracks;
          let selectedTrack = tracks.find((t: any) => t.languageCode === 'zh-TW' || t.languageCode === 'zh-Hant' || t.languageCode === 'zh') ||
                              tracks.find((t: any) => t.languageCode?.startsWith('en')) ||
                              tracks[0];
          const langName = selectedTrack.name?.simpleText || selectedTrack.languageCode || '中文字幕';
          const subRes = await fetch(`${selectedTrack.baseUrl}&fmt=vtt`, { headers: vrHeaders });
          if (subRes.ok) {
            const subText = await subRes.text();
            if (subText.trim().startsWith('{')) {
              const resJson = formatJson3Transcript(subText, langName);
              if (resJson) return resJson;
            } else if (subText.includes('<timedtext') || subText.includes('<p t=')) {
              const resXml = formatXmlTranscript(subText, langName);
              if (resXml) return resXml;
            }
          }
        }
      }
    } catch (e) {
      console.warn('Oculus VR API attempt failed, falling back to standard scraping', e);
    }

    // 備援：原版網頁 DOM Captions 解析
    const match = html.match(/"captionTracks":\s*(\[[^\[\]]+\])/);
    if (!match || !match[1]) {
      return '> ℹ️ *此影片未提供封閉字幕或遭到 YouTube 防機器人檢查（Bot Challenge）阻截雲端訪問。您可直接於上方播放器點選 CC 字幕對照觀賞！*';
    }
    
    try {
      tracks = JSON.parse(match[1]);
    } catch {
      return '> ℹ️ *解析字幕軌道結構失敗。*';
    }
    
    if (!tracks || tracks.length === 0) {
      return '> ℹ️ *此影片未提供可用之字幕軌。*';
    }
    
    let selectedTrack = tracks.find((t: any) => t.languageCode === 'zh-Hant' || t.languageCode === 'zh-TW' || t.languageCode === 'zh') ||
                        tracks.find((t: any) => t.languageCode?.startsWith('en')) ||
                        tracks[0];
    
    const langName = selectedTrack.name?.simpleText || selectedTrack.languageCode || '預設字幕';
    const baseUrl = selectedTrack.baseUrl;
    if (!baseUrl) {
      return '> ℹ️ *無法取得字幕下載網址。*';
    }
    
    const transController = new AbortController();
    const transTimeout = setTimeout(() => transController.abort(), 4000);
    const transcriptRes = await fetch(`${baseUrl}&fmt=json3`, {
      signal: transController.signal,
      headers: pageHeaders
    }).finally(() => clearTimeout(transTimeout));
    
    if (!transcriptRes.ok) {
      return '> ℹ️ *下載字幕資料時遭遇 HTTP 拒止。*';
    }
    
    const rawText = await transcriptRes.text();
    const formatted = formatJson3Transcript(rawText, langName);
    if (formatted) return formatted;

    return '> ℹ️ *因 YouTube 伺服器端之金鑰簽證 (PoToken / Cookie 隔離) 防衛驗證，雲端處理中樞無法自該接口下線全文檔案。您可以在前方 iframe 播放器中直接點啟官方 CC 字幕邊播邊賞！*';
  } catch (err: any) {
    console.warn('Transcript fetch fallback:', err);
    return `> ℹ️ *因為 YouTube 抗爬蟲安全審查或連線逾時，此次未一併抓入字幕台詞。下方影片本體已為您完整內嵌！*`;
  } finally {
    clearTimeout(timeout);
  }
}

async function processYouTubeArticle(env: Env, url: string, videoId: string, chatId: number, browserTranscript?: string, browserError?: string): Promise<void> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const res = await fetch(oembedUrl);
    
    let title = `YouTube Video (${videoId})`;
    let author = 'YouTube Channel';
    let authorUrl = 'https://www.youtube.com';
    let thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    
    if (res.ok) {
      const data: any = await res.json();
      if (data.title) title = data.title;
      if (data.author_name) author = data.author_name;
      if (data.author_url) authorUrl = data.author_url;
      if (data.thumbnail_url) thumbnailUrl = data.thumbnail_url;
    }
    
    let transcriptText = browserTranscript;
    let subtitleStatus = "✅ 全文帶時間軸字幕已完好匯入";
    if (!transcriptText) {
      const serverFallback = await fetchYouTubeTranscript(videoId, env);
      if (serverFallback && !serverFallback.includes("ℹ️ *")) {
        transcriptText = serverFallback;
      } else {
        const errDesc = browserError || "未能自瀏覽器成功交接資料 (未及時接收或遭安全性設定阻斷)";
        subtitleStatus = `⚠️ 此次未成功含帶字幕 (診斷報告: ${errDesc})`;
        transcriptText = `> ⚠️ **字幕提取失敗診斷報告**\n> - **Chrome 套件層狀態**：${errDesc}\n> - **Cloudflare 伺服器層狀態**：${serverFallback.replace("> ℹ️ *", "").replace("*", "")}`;
      }
    }
    
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const cleanTitle = sanitizeFilename(title);
    const filename = `${dateStr}-${cleanTitle}.md`;
    
    const safeTitle = title.replace(/"/g, '\\"');
    const safeAuthor = author.replace(/"/g, '\\"');
    
    const content = `---
title: "${safeTitle}"
source: "${url}"
author: "${safeAuthor}"
created_at: ${now.toISOString()}
tags:
  - clipping
  - youtube
  - unread
---

# ${title}

> [!NOTE] 頻道資訊
> 作者 / 頻道：**[${author}](${authorUrl})**
> 影片連結：[在 YouTube 上觀看](${url})

## 影片封面與預覽

![影片封面](${thumbnailUrl})

## 影片嵌入 (Embed)

<iframe width="560" height="315" src="https://www.youtube.com/embed/${videoId}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

## 📝 影片全文字幕 (Transcript)

${transcriptText}
`;

    const savedPath = await saveToGitHub(env, filename, content);
    await sendMessage(env, chatId, `已成功存入 YouTube 影片：\`${savedPath}\`\n💬 字幕狀況：${subtitleStatus}`);
  } catch (error: any) {
    console.error('YouTube process error:', error);
    await sendMessage(env, chatId, `YouTube 影片儲存失敗：${error.message || error}`);
  }
}

function cleanArticleContent(content: string): string {
  const lines = content.split('\n');
  const cleanedLines: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    const stripForm = trimmed.replace(/^(?:#{1,6}\s*|[\*\-\=\_]{2,}\s*)+|[\*\-\=\_]{2,}\s*$/g, '').trim();
    
    // Check if we hit an end-of-article recommendation/advertisement feed separator
    if (cleanedLines.length > 3 && /^(?:更多.+(?:報導|報道|新聞|文章|內容)|看更多.+|延伸閱讀|相關(?:閱讀|新聞|報導|報道|文章)|推薦(?:閱讀|新聞|文章|內容)|熱門(?:新聞|文章|焦點|報導)|其他人也(?:看|在看|看了)|大家(?:都在看|正觀看|也盯著)|人氣(?:點閱|新聞|文章|排行榜)|猜你(?:也喜歡|喜歡|想看|沒看過)|人氣推薦|人氣夯文|編輯推薦|點擊前往)[:：\s]*$/i.test(stripForm)) {
      // Truncate! Everything below this separator is related articles, advertisements, or bottom news feeds.
      break;
    }
    
    // Filter out internal recommendation link lines or common ad / newsletter slogans
    if (/^【?(?:(?:延伸|相關|推薦)(?:閱讀|新聞|報導|報道|文章)|看更多|更多報導|推薦分享|推薦文章|廣告|Advertisement|Share on|分享至|分享到|分享：|追蹤我們|點此下載|按讚追蹤|加入 LINE|訂閱電子報)[:：\s]*/i.test(stripForm)) {
      continue;
    }
    // Filter out lines that are purely social sharing or junk links without narrative content
    if (/^(\s*\[(?:Facebook|Twitter|LINE|Instagram|Telegram|Email|WeChat|WhatsApp|分享|按讚|追蹤|訂閱|複製連結|Share)[^\]]*\]\([^\)]+\)\s*)+$/i.test(trimmed)) {
      continue;
    }
    cleanedLines.push(line);
  }
  
  // Remove multiple consecutive empty lines down to a max of two
  return cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export async function processArticle(env: Env, url: string, chatId: number, browserTranscript?: string, browserError?: string): Promise<void> {
  try {
    const youtubeId = getYouTubeVideoId(url);
    if (youtubeId) {
      await processYouTubeArticle(env, url, youtubeId, chatId, browserTranscript, browserError);
      return;
    }

    // 1. Fetch from Jina Reader API
    const jinaUrl = `https://r.jina.ai/${url}`;
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'X-Remove-Selector': 'header, nav, footer, aside, .ads, .ad, .advertisement, .sidebar, .comments, .related-posts, .related-news, .recommend, .recommend-news, .social-share, [role="navigation"], [role="banner"], [role="contentinfo"], #sidebar, #footer, #comments, .share-buttons, .ad-box, .taboola, .outbrain, [class*="recommend"], [class*="related"], [id*="recommend"], [id*="related"], iframe:not([src*="youtube"])'
    };
    if (env.JINA_API_KEY) {
      headers['Authorization'] = `Bearer ${env.JINA_API_KEY}`;
    }

    let response;
    let retries = 3;
    while (retries > 0) {
      response = await fetch(jinaUrl, { headers });
      if (response.status === 429) {
        retries--;
        if (retries === 0) break;
        
        let waitTime = 2; // Default 2 seconds
        try {
          const errData: any = await response.clone().json();
          if (errData.retryAfter) {
            waitTime = errData.retryAfter;
          }
        } catch (e) {
          // ignore
        }
        
        console.log(`Rate limited by Jina. Waiting ${waitTime}s before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
        continue;
      }
      break;
    }

    if (!response || !response.ok) {
      throw new Error(`Jina Reader failed: ${response?.status} ${await response?.text()}`);
    }

    const resJson: any = await response.json();
    // Jina returns { code, status, data: { title, url, content, author, ... } }
    const data = resJson.data || resJson; // Fallback in case of different format
    
    let title = data.title || 'Untitled';
    let content = cleanArticleContent(data.content || '');
    let author = data.author || '';

    // Append original link at the end
    content += `\n\n> 原文連結：[點擊跳轉](${url})\n`;

    // 2. Generate filename and frontmatter
    const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const cleanTitle = sanitizeFilename(title);
    const filename = `${dateStr}-${cleanTitle}.md`;

    const frontmatter = generateYamlFrontmatter(title, url, author);
    const finalContent = frontmatter + content;

    // 3. Save to GitHub
    const savedPath = await saveToGitHub(env, filename, finalContent);

    // 4. Send success message
    await sendMessage(env, chatId, `已成功存入 Obsidian：\`${savedPath}\``);
  } catch (error: any) {
    console.error('Process error:', error);
    await sendMessage(env, chatId, `採集失敗：${error.message || error}`);
  }
}

function getTimestampString(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').replace('T', '-').split('-').slice(0,6).join('');
}

export async function processQuickNote(env: Env, text: string, chatId: number): Promise<void> {
  try {
    const timestamp = getTimestampString();
    const filename = `${timestamp}-QuickNote.md`;
    
    // Use the first line as a title, up to 50 chars
    const firstLine = text.split('\n')[0].trim();
    const title = firstLine.length > 50 ? firstLine.substring(0, 50) + '...' : firstLine;
    
    const frontmatter = `---
title: "速記: ${title.replace(/"/g, '\\"')}"
source: "Telegram / PWA"
created_at: ${new Date().toISOString()}
tags:
  - quick-note
  - unread
---

`;
    const finalContent = frontmatter + text;

    const savedPath = await saveToGitHub(env, filename, finalContent);
    await sendMessage(env, chatId, `已成功存入 QuickNote：\`${savedPath}\``);
  } catch (error: any) {
    console.error('QuickNote error:', error);
    await sendMessage(env, chatId, `速記儲存失敗：${error.message || error}`);
  }
}

export async function processImage(env: Env, file: File, chatId: number): Promise<void> {
  try {
    const timestamp = getTimestampString();
    
    // Determine extension
    let ext = 'jpg';
    if (file.type === 'image/png') ext = 'png';
    else if (file.type === 'image/gif') ext = 'gif';
    else if (file.type === 'image/webp') ext = 'webp';
    
    const filename = `${timestamp}-Image.${ext}`;
    
    const arrayBuffer = await file.arrayBuffer();
    const base64Content = Buffer.from(arrayBuffer).toString('base64');

    const savedPath = await saveToGitHub(env, filename, base64Content, true);
    await sendMessage(env, chatId, `已成功存入圖片：\`${savedPath}\``);
  } catch (error: any) {
    console.error('Image error:', error);
    await sendMessage(env, chatId, `圖片儲存失敗：${error.message || error}`);
  }
}

export async function processBase64Image(env: Env, base64Data: string, mimeType: string, chatId: number): Promise<void> {
  try {
    const timestamp = getTimestampString();
    
    let ext = 'jpg';
    if (mimeType.includes('png')) ext = 'png';
    else if (mimeType.includes('gif')) ext = 'gif';
    else if (mimeType.includes('webp')) ext = 'webp';
    
    const filename = `${timestamp}-Image.${ext}`;
    
    const savedPath = await saveToGitHub(env, filename, base64Data, true);
    await sendMessage(env, chatId, `已成功存入圖片：\`${savedPath}\``);
  } catch (error: any) {
    console.error('Base64 Image error:', error);
    await sendMessage(env, chatId, `圖片儲存失敗：${error.message || error}`);
  }
}
