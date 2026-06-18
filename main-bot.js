/**
 * Основной пользовательский бот USLUGI.UZ
 * Открывает мини-приложение по кнопке.
 * Сохраняет пользователей в Supabase для рассылки.
 *
 * Переменные окружения (Railway):
 *   BOT_TOKEN              — токен основного бота
 *   WEB_APP_URL            — HTTPS-ссылка на index.html (Vercel)
 *   SUPABASE_URL           — URL проекта Supabase
 *   SUPABASE_SERVICE_ROLE  — service_role ключ
 */
const { Telegraf, Markup } = require('telegraf');

const BOT_TOKEN          = process.env.BOT_TOKEN || '';
const WEB_APP_URL        = process.env.WEB_APP_URL || 'https://example.com/index.html';
const SUPABASE_URL       = process.env.SUPABASE_URL || 'https://sqsbqsizbzcddbzbaigw.supabase.co';
const SUPABASE_KEY       = process.env.SUPABASE_SERVICE_ROLE ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxc2Jxc2l6YnpjZGRiemJhaWd3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDEwNTkyOCwiZXhwIjoyMDg5NjgxOTI4fQ.IX0mzMND498fXhaYQ3RUgkp-1OIw_6PLU9xiJGtgOF4';

if (!BOT_TOKEN) {
  console.error('❌ Задайте BOT_TOKEN в переменных окружения Railway.');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Сохранить пользователя в таблицу users (upsert — обновляет username если изменился)
async function saveUser(chatId, username) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/users`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({ chat_id: chatId, username: username || null })
    });
  } catch (e) {
    console.error('saveUser error:', e.message);
  }
}

// ─── ОТЛОЖЕННАЯ РАССЫЛКА ЧЕРЕЗ 3 ЧАСА ПОСЛЕ /start ───────────────────────────
const DELAYED_PHOTO_URL =
  `${SUPABASE_URL}/storage/v1/object/public/broadcast-photos/public/welcome1-3.png`;

const DELAYED_TEXT =
`Привет! 💛

Тут можно не только искать специалистов, но и самому попасть в базу.

Если умеешь что-то делать — добавь анкету. Возможно, кто-то уже ищет именно тебя.`;

const DELAY_MS = 3 * 60 * 60 * 1000; // 3 часа

// Множество chat_id, которым уже запланирована отложенная рассылка
// (защита от повторного /start — не шлём второй раз)
const scheduledDelayed = new Set();

async function sendDelayedMessage(chatId) {
  try {
    await bot.telegram.sendPhoto(chatId, DELAYED_PHOTO_URL, {
      caption: DELAYED_TEXT,
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.url('🌟 Стать специалистом', 'https://uslugi-uz.vercel.app/')]
      ])
    });
    console.log(`📨 Отложенное сообщение отправлено: ${chatId}`);
  } catch (e) {
    console.warn(`Delayed msg failed for ${chatId}:`, e.message);
  } finally {
    scheduledDelayed.delete(chatId);
  }
}

// ──────────────────────────────────────────────────────────────────────────────

const WELCOME_TEXT =
`👋 Добро пожаловать в *USLUGI.UZ*!

Здесь вы можете найти проверенных специалистов рядом с вами — за 2 минуты 💛

Нажмите кнопку ниже, чтобы открыть каталог:`;

const appButton = () => Markup.inlineKeyboard([
  [Markup.button.webApp('🔍 Открыть USLUGI.UZ', WEB_APP_URL)]
]);

bot.start(async ctx => {
  await saveUser(ctx.chat.id, ctx.from?.username);

  // Запускаем отложенное сообщение через 3 часа (только один раз на пользователя)
  if (!scheduledDelayed.has(ctx.chat.id)) {
    scheduledDelayed.add(ctx.chat.id);
    setTimeout(() => sendDelayedMessage(ctx.chat.id), DELAY_MS);
    console.log(`⏳ Отложенное сообщение запланировано для ${ctx.chat.id}`);
  }

  return ctx.reply(WELCOME_TEXT, { parse_mode: 'Markdown', ...appButton() });
});

bot.command('help', ctx =>
  ctx.reply(WELCOME_TEXT, { parse_mode: 'Markdown', ...appButton() })
);

// Любое другое сообщение — напоминаем про кнопку
bot.on('message', ctx =>
  ctx.reply('Нажмите кнопку, чтобы открыть каталог специалистов 👇', appButton())
);

bot.launch();
console.log('✅ Основной бот запущен');

process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
