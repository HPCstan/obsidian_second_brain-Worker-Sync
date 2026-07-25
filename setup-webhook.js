const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables from .dev.vars if exists
if (fs.existsSync('.dev.vars')) {
  const envConfig = dotenv.parse(fs.readFileSync('.dev.vars'));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8788507780:AAE9IAhllUD2164aBQpmMD_Ah60_AsIeAhs';
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '1234';

const WORKER_URL = process.argv[2];

if (!WORKER_URL) {
  console.error('Please provide the deployed Worker URL.');
  console.error('Usage: node setup-webhook.js <https://your-worker-url.workers.dev>');
  process.exit(1);
}

const webhookUrl = `${WORKER_URL.replace(/\/$/, '')}/webhook/telegram`;
const apiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`;

async function setWebhook() {
  console.log(`Setting webhook to: ${webhookUrl}`);
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: TELEGRAM_WEBHOOK_SECRET
    })
  });
  
  const data = await response.json();
  console.log('Response:', data);
}

setWebhook();
