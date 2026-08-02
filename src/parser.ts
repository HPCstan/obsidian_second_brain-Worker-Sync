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

async function processYouTubeArticle(env: Env, url: string, videoId: string, chatId: number): Promise<void> {
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
`;

    const savedPath = await saveToGitHub(env, filename, content);
    await sendMessage(env, chatId, `已成功存入 YouTube 影片：\`${savedPath}\``);
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

export async function processArticle(env: Env, url: string, chatId: number): Promise<void> {
  try {
    const youtubeId = getYouTubeVideoId(url);
    if (youtubeId) {
      await processYouTubeArticle(env, url, youtubeId, chatId);
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
