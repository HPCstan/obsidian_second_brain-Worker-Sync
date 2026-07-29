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

export async function processArticle(env: Env, url: string, chatId: number): Promise<void> {
  try {
    // 1. Fetch from Jina Reader API
    const jinaUrl = `https://r.jina.ai/${url}`;
    const headers: Record<string, string> = {
      'Accept': 'application/json'
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
    let content = data.content || '';
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
