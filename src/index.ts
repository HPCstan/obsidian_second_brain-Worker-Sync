import { Env } from './env';
import { sendMessage } from './telegram';
import { processArticle } from './parser';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health check endpoint
    if (request.method === 'GET' && url.pathname === '/health') {
      return new Response('OK', { status: 200 });
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

    return new Response('Not Found', { status: 404 });
  },
};
