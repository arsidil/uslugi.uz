/**
 * Пользовательский бот (мини-приложение).
 * WEB_APP_URL — HTTPS-URL вашего index.html (например Pages / хостинг).
 */
const { Telegraf, Markup } = require('telegraf');

const BOT_TOKEN = process.env.MAIN_USER_BOT_TOKEN || process.env.BOT_TOKEN || '';
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://example.com/index.html';

if (!BOT_TOKEN) {
  console.error('Задайте MAIN_USER_BOT_TOKEN или BOT_TOKEN в окружении.');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

const WELCOME =
  'Откройте мини-приложение и найдите подходящего специалиста за 2 минуты 💛';

bot.start((ctx) =>
  ctx.reply(
    WELCOME,
    Markup.inlineKeyboard([
      Markup.button.webApp('Открыть USLUGI.UZ', WEB_APP_URL)
    ])
  )
);

bot.command('help', (ctx) =>
  ctx.reply(`${WELCOME}\n\nКоманда /start — открыть кнопку мини-приложения.`)
);

bot.launch();
console.log('✅ Основной бот запущен');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
