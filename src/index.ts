import { Env } from './env';
import { sendMessage } from './telegram';
import { processArticle, processQuickNote, processImage, processBase64Image, fetchYouTubeTranscript } from './parser';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health check endpoint
    if (request.method === 'GET' && url.pathname === '/health') {
      return new Response('OK', { status: 200 });
    }

    // Test endpoint for YouTube VR Subtitle extraction
    if (request.method === 'GET' && url.pathname === '/test-yt') {
      const videoId = url.searchParams.get('v') || '_hAi3xjTyTI';
      const result = await fetchYouTubeTranscript(videoId, env);
      return new Response(result, {
        status: 200,
        headers: { 'Content-Type': 'text/markdown; charset=utf-8' }
      });
    }

    // Telegram webhook endpoint
    if (request.method === 'POST' && url.pathname === '/webhook/telegram') {
      // (Optional) Validate custom secret passed in webhook query or header
      // For Telegram, you can use the secret token feature
      const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
      if (env.TELEGRAM_WEBHOOK_SECRET && secret !== env.TELEGRAM_WEBHOOK_SECRET) {
        return new Response('Unauthorized', { status: 401 });
      }

      try {
        const body: any = await request.json();
        const message = body.message;

        if (message && message.text) {
          const chatId = message.chat.id;
          const text = message.text as string;

          // Simple URL extraction (find first URL in text)
          const urlMatch = text.match(/(https?:\/\/[^\s]+)/);

          if (urlMatch) {
            const articleUrl = urlMatch[1];
            
            // 1. Acknowledge receipt
            await sendMessage(env, chatId, '已收到，後台提取中...');

            // 2. Perform long-running task in background
            ctx.waitUntil(processArticle(env, articleUrl, chatId));
          } else {
            await sendMessage(env, chatId, '請發送包含文章網址的訊息。');
          }
        }
        
        // Return 200 OK immediately so Telegram doesn't retry
        return new Response('OK', { status: 200 });
      } catch (err: any) {
        console.error('Webhook error:', err);
        return new Response('Error', { status: 500 });
      }
    }

    // Browser Extension endpoint
    if (request.method === 'OPTIONS' && url.pathname === '/webhook/browser') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    if (request.method === 'POST' && url.pathname === '/webhook/browser') {
      try {
        const body: any = await request.json();
        const articleUrl = body.url;
        const transcript = body.transcript;
        const text = body.text;
        const imageBase64 = body.imageBase64;
        const mimeType = body.mimeType || 'image/png';
        const secret = body.secret;
        
        const expectedSecret = env.BROWSER_SECRET || env.TELEGRAM_WEBHOOK_SECRET;

        if (secret !== expectedSecret) {
          return new Response('Unauthorized', { status: 401 });
        }

        if (!articleUrl && !text && !imageBase64) {
          return new Response('Missing content', { status: 400 });
        }

        const chatId = Number(env.ADMIN_CHAT_ID);
        if (!chatId) {
           return new Response('ADMIN_CHAT_ID not configured', { status: 500 });
        }

        const browserError = body.browserError;

        if (imageBase64) {
          ctx.waitUntil(processBase64Image(env, imageBase64, mimeType, chatId));
        } else if (text) {
          ctx.waitUntil(processQuickNote(env, text, chatId));
        } else if (articleUrl) {
          ctx.waitUntil(processArticle(env, articleUrl, chatId, transcript, browserError));
        }

        return new Response(JSON.stringify({ success: true }), { 
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      } catch (err: any) {
        console.error('Browser webhook error:', err);
        return new Response('Error', { status: 500 });
      }
    }

    // PWA Manifest endpoint
    if (request.method === 'GET' && url.pathname === '/pwa/manifest.json') {
      const manifest = {
        name: "Obsidian Clipper",
        short_name: "Clipper",
        start_url: "/pwa/install",
        display: "standalone",
        icons: [{
          src: "https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/obsidian.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any"
        }],
        share_target: {
          action: "/pwa/share",
          method: "POST",
          enctype: "multipart/form-data",
          params: {
            title: "title",
            text: "text",
            url: "url",
            files: [
              {
                name: "media",
                accept: ["image/*"]
              }
            ]
          }
        }
      };
      return new Response(JSON.stringify(manifest), {
        headers: { 'Content-Type': 'application/manifest+json' }
      });
    }

    // PWA Install page
    if (request.method === 'GET' && url.pathname === '/pwa/install') {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Obsidian Clipper 安裝頁面</title>
          <link rel="manifest" href="/pwa/manifest.json">
          <style>
            body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f4f4f5; text-align: center; padding: 20px; }
            img { width: 120px; height: 120px; margin-bottom: 20px; border-radius: 20px; }
            h1 { color: #18181b; }
            p { color: #52525b; max-width: 400px; line-height: 1.5; font-size: 16px;}
            .btn { background: #7c3aed; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; margin-top: 20px; font-weight: bold; }
          </style>
        </head>
        <body>
          <img src="https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/obsidian.png" alt="Obsidian Logo">
          <h1>Obsidian Clipper</h1>
          <p>這個頁面<strong>不是用來輸入網址的</strong>喔！<br><br>這是一個安裝畫面。請點擊右下角的瀏覽器選單 (⋮)，選擇 <strong>「加到主畫面 (Add to Home screen)」</strong>。</p>
          <p>安裝完成後，以後在任何網頁點擊系統的「分享」，就能直接把它傳到 Obsidian！</p>
        </body>
        </html>
      `;
      return new Response(html, { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
    }

    // PWA Share endpoint (POST for multipart)
    if (request.method === 'POST' && url.pathname === '/pwa/share') {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>處理中...</title>
          <style>
            body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f4f4f5; text-align: center; }
            h1 { color: #10b981; }
            p { color: #52525b; }
          </style>
        </head>
        <body>
          <h1>✅ 發送成功！</h1>
          <p>內容已在後台處理中，本畫面將自動關閉。</p>
          <script>
            setTimeout(() => { window.close(); }, 2000);
          </script>
        </body>
        </html>
      `;

      try {
        const formData = await request.formData();
        const sharedUrl = (formData.get('url') as string || '').trim();
        const sharedText = (formData.get('text') as string || '').trim();
        const sharedTitle = (formData.get('title') as string || '').trim();
        const media = formData.get('media') as File | null;

        const chatId = Number(env.ADMIN_CHAT_ID);

        if (chatId) {
          if (media && media.size > 0) {
            ctx.waitUntil(processImage(env, media, chatId));
          } else {
            let isNote = false;
            let noteContent = '';
            
            // Check if there is any URL present anywhere in the shared fields
            const extractedUrl = sharedUrl || (sharedText.match(/(https?:\/\/[^\s]+)/)?.[1]) || (sharedTitle.match(/(https?:\/\/[^\s]+)/)?.[1]);
            
            if (extractedUrl) {
              // A URL exists! When should we treat this as a highlighted quote note instead of scraping the article?
              // Only when sharedUrl is provided separately AND sharedText has clean text without a URL (meaning user highlighted text on the page)
              const hasUrlInText = /https?:\/\/[^\s]+/.test(sharedText);
              if (sharedUrl && sharedText && !hasUrlInText && sharedText !== sharedTitle.trim() && sharedText !== sharedUrl) {
                // User highlighted text on a webpage!
                isNote = true;
                noteContent = `> ${sharedText.replace(/\n/g, '\n> ')}\n\n---\n來源：[${sharedTitle || sharedUrl}](${sharedUrl})`;
              } else {
                // In all other cases where a URL is present (like sharing a link from News apps, Chrome menu share, etc.), we ALWAYS scrape the article!
                isNote = false;
              }
            } else {
              // No URL anywhere! This is purely typed text from a text box, Google search dialog, or notes app!
              isNote = true;
              noteContent = [sharedTitle, sharedText].filter(Boolean).join('\n').trim();
            }

            if (isNote && noteContent) {
              ctx.waitUntil(processQuickNote(env, noteContent, chatId));
            } else if (extractedUrl) {
              ctx.waitUntil(processArticle(env, extractedUrl, chatId));
            } else if (noteContent) {
              ctx.waitUntil(processQuickNote(env, noteContent, chatId));
            }
          }
        }
      } catch (err: any) {
        console.error('PWA Share error:', err);
      }

      return new Response(html, { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
    }

    return new Response('Not Found', { status: 404 });
  },
};
