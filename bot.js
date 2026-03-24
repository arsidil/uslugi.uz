const { Telegraf, Markup } = require('telegraf');

// ══════════════════════════════════════════
//  SUPABASE CONFIG (Service Role Key — полный доступ)
// ══════════════════════════════════════════
const SUPABASE_URL          = 'https://sqsbqsizbzcddbzbaigw.supabase.co';
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxc2Jxc2l6YnpjZGRiemJhaWd3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDEwNTkyOCwiZXhwIjoyMDg5NjgxOTI4fQ.IX0mzMND498fXhaYQ3RUgkp-1OIw_6PLU9xiJGtgOF4';

// ── Supabase REST helper (uses Service Role — bypasses RLS) ──
async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...opts,
    headers: {
      'apikey':        SUPABASE_SERVICE_ROLE,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE}`,
      'Content-Type':  'application/json',
      ...(opts.headers || {})
    }
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase error ${res.status}: ${errText}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const db = {
  async select(table, params = '') {
    return sbFetch(`/rest/v1/${table}?${params}`, {
      method: 'GET',
      headers: { 'Prefer': 'return=representation' }
    });
  },
  async update(table, filter, data) {
    return sbFetch(`/rest/v1/${table}?${filter}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify(data)
    });
  },
  async delete(table, filter) {
    return sbFetch(`/rest/v1/${table}?${filter}`, { method: 'DELETE' });
  }
};

// ── Bot & Admin ──
const BOT_TOKEN = process.env.BOT_TOKEN || '8626567698:AAHuhRM4wHuc4_HerFbem1mD_WXTHv6e9v8';
const ADMIN_ID  = 1147754219;

const bot = new Telegraf(BOT_TOKEN);

// ─────────────────────────────────────────
//  /start
// ─────────────────────────────────────────
bot.start((ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply('⛔ Нет доступа');
  ctx.reply(
    '👋 *USLUGI.UZ — Админ панель*\n\nВыбери действие:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📋 Ожидают проверки', 'pending_apps')],
        [Markup.button.callback('✅ Одобренные',        'approved_apps')],
        [Markup.button.callback('❌ Отклонённые',       'rejected_apps')]
      ])
    }
  );
});

// ─────────────────────────────────────────
//  Список ожидающих
// ─────────────────────────────────────────
bot.action('pending_apps', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Нет доступа');
  try {
    const rows = await db.select('services', 'status=eq.pending&order=created_at.asc');
    if (!rows || rows.length === 0) {
      await ctx.editMessageText('✅ Нет новых заявок', Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Обновить', 'pending_apps')],
        [Markup.button.callback('🏠 Главная',  'main_menu')]
      ]));
      return ctx.answerCbQuery();
    }
    await ctx.editMessageText(
      `📋 *Ожидают проверки: ${rows.length}*\n\nИспользуй /start чтобы получить список с кнопками`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Обновить', 'pending_apps')],
          [Markup.button.callback('🏠 Главная',  'main_menu')]
        ])
      }
    );
    ctx.answerCbQuery();
  } catch (e) {
    console.error(e);
    ctx.answerCbQuery('❌ Ошибка');
  }
});

// ─────────────────────────────────────────
//  Одобренные
// ─────────────────────────────────────────
bot.action('approved_apps', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Нет доступа');
  try {
    const rows = await db.select('services', 'status=eq.approved&order=created_at.desc');
    if (!rows || rows.length === 0) {
      await ctx.editMessageText('Нет одобренных заявок', Markup.inlineKeyboard([[Markup.button.callback('🏠 Главная', 'main_menu')]]));
      return ctx.answerCbQuery();
    }
    let text = `✅ *Одобренных: ${rows.length}*\n\n`;
    rows.forEach(d => { text += `• *${d.name}* — ${d.specialty || d.category}\n`; });
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('🏠 Главная', 'main_menu')]])
    });
    ctx.answerCbQuery();
  } catch (e) {
    console.error(e);
    ctx.answerCbQuery('❌ Ошибка');
  }
});

// ─────────────────────────────────────────
//  Отклонённые
// ─────────────────────────────────────────
bot.action('rejected_apps', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Нет доступа');
  try {
    const rows = await db.select('services', 'status=eq.rejected&order=created_at.desc');
    if (!rows || rows.length === 0) {
      await ctx.editMessageText('Нет отклонённых заявок', Markup.inlineKeyboard([[Markup.button.callback('🏠 Главная', 'main_menu')]]));
      return ctx.answerCbQuery();
    }
    let text = `❌ *Отклонённых: ${rows.length}*\n\n`;
    rows.forEach(d => { text += `• *${d.name}* — ${d.specialty || d.category}\n`; });
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('🏠 Главная', 'main_menu')]])
    });
    ctx.answerCbQuery();
  } catch (e) {
    console.error(e);
    ctx.answerCbQuery('❌ Ошибка');
  }
});

// ─────────────────────────────────────────
//  Главное меню
// ─────────────────────────────────────────
bot.action('main_menu', (ctx) => {
  ctx.editMessageText(
    '👋 *USLUGI.UZ — Админ панель*\n\nВыбери действие:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📋 Ожидают проверки', 'pending_apps')],
        [Markup.button.callback('✅ Одобренные',        'approved_apps')],
        [Markup.button.callback('❌ Отклонённые',       'rejected_apps')]
      ])
    }
  );
  ctx.answerCbQuery();
});

// ─────────────────────────────────────────
//  ✅ Одобрить
// ─────────────────────────────────────────
bot.action(/^approve_(.+)$/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Нет доступа');
  try {
    const id   = ctx.match[1];
    const rows = await db.select('services', `id=eq.${id}`);
    if (!rows || rows.length === 0) {
      await ctx.editMessageText('⚠️ Заявка не найдена (возможно уже удалена)');
      return ctx.answerCbQuery();
    }
    const d = rows[0];
    await db.update('services', `id=eq.${id}`, { status: 'approved' });
    await ctx.editMessageText(
      `✅ *ОДОБРЕНО*\n\n👤 ${d.name}\n🎯 ${d.specialty || '-'}\n📂 ${d.category}\n📞 ${d.phone || '-'}\n✈️ ${d.telegram ? '@' + d.telegram : '-'}`,
      { parse_mode: 'Markdown' }
    );
    ctx.answerCbQuery('✅ Одобрено!');
  } catch (e) {
    console.error('Ошибка approve:', e);
    ctx.answerCbQuery('❌ Ошибка');
  }
});

// ─────────────────────────────────────────
//  ❌ Отклонить
// ─────────────────────────────────────────
bot.action(/^reject_(.+)$/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Нет доступа');
  try {
    const id   = ctx.match[1];
    const rows = await db.select('services', `id=eq.${id}`);
    if (!rows || rows.length === 0) {
      await ctx.editMessageText('⚠️ Заявка не найдена');
      return ctx.answerCbQuery();
    }
    const d = rows[0];
    await db.update('services', `id=eq.${id}`, { status: 'rejected' });
    await ctx.editMessageText(
      `❌ *ОТКЛОНЕНО*\n\n👤 ${d.name}\n🎯 ${d.specialty || '-'}\n📂 ${d.category}`,
      { parse_mode: 'Markdown' }
    );
    ctx.answerCbQuery('❌ Отклонено');
  } catch (e) {
    console.error('Ошибка reject:', e);
    ctx.answerCbQuery('❌ Ошибка');
  }
});

// ─────────────────────────────────────────
//  /list — все одобренные с кнопкой удаления
// ─────────────────────────────────────────
bot.command('list', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply('⛔ Нет доступа');
  try {
    const rows = await db.select('services', 'status=eq.approved&order=created_at.desc');
    if (!rows || rows.length === 0) return ctx.reply('📭 Нет одобренных анкет');

    await ctx.reply(`📋 *Одобренных анкет: ${rows.length}*\nНажми кнопку чтобы удалить:`, { parse_mode: 'Markdown' });

    for (const d of rows) {
      const phLine = d.phone    ? `\n📞 ${d.phone}`         : '';
      const tgLine = d.telegram ? `\n✈️ @${d.telegram}`     : '';
      const spLine = d.specialty ? ` — ${d.specialty}`      : '';
      const text   = `👤 *${d.name}*\n📂 ${d.category}${spLine}${phLine}${tgLine}`;
      await bot.telegram.sendMessage(ADMIN_ID, text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🗑 Удалить анкету', `delete_${d.id}`)]
        ])
      });
    }
  } catch (e) {
    console.error(e);
    ctx.reply('❌ Ошибка при загрузке списка');
  }
});

// ─────────────────────────────────────────
//  🗑 Удалить анкету
// ─────────────────────────────────────────
bot.action(/^delete_(.+)$/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Нет доступа');
  try {
    const id   = ctx.match[1];
    const rows = await db.select('services', `id=eq.${id}`);
    if (!rows || rows.length === 0) {
      await ctx.editMessageText('⚠️ Анкета не найдена');
      return ctx.answerCbQuery();
    }
    const name = rows[0].name;
    await db.delete('services', `id=eq.${id}`);
    await ctx.editMessageText(`🗑 *Анкета удалена*\n👤 ${name}`, { parse_mode: 'Markdown' });
    ctx.answerCbQuery('🗑 Удалено');
  } catch (e) {
    console.error(e);
    ctx.answerCbQuery('❌ Ошибка');
  }
});

// ─────────────────────────────────────────
//  Realtime: уведомления о новых заявках
//  Supabase Realtime через WebSocket
// ─────────────────────────────────────────
let isFirstSnapshot = true;

function startRealtimeWatch() {
  const WebSocket = require('ws');
  const wsUrl = SUPABASE_URL.replace('https://', 'wss://')
    + `/realtime/v1/websocket?apikey=${SUPABASE_SERVICE_ROLE}&vsn=1.0.0`;

  const ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    console.log('📡 Realtime подключён');
    ws.send(JSON.stringify({
      topic:   'realtime:public:services',
      event:   'phx_join',
      payload: { config: { broadcast: { self: false }, postgres_changes: [{ event: 'INSERT', schema: 'public', table: 'services' }] } },
      ref:     '1'
    }));
  });

  ws.on('message', async (rawData) => {
    try {
      const msg = JSON.parse(rawData);
      if (msg.event !== 'postgres_changes' && msg.event !== 'INSERT') return;

      // Supabase Realtime v2 wraps payload differently
      const record = msg.payload?.data?.record || msg.payload?.record;
      if (!record) return;
      if (record.status !== 'pending') return;

      if (isFirstSnapshot) { isFirstSnapshot = false; return; }

      const d = record;
      const phLine = d.phone    ? `\n📞 *${d.phone}*`        : '';
      const tgLine = d.telegram ? `\n✈️ @${d.telegram}`      : '';
      const spLine = d.specialty ? `\n🎯 *${d.specialty}*`   : '';
      const dsLine = d.description ? `\n📝 ${d.description}` : '';

      const text =
        `🚨 *НОВАЯ ЗАЯВКА*\n\n` +
        `👤 *${d.name}*\n` +
        `📂 ${d.category}` +
        spLine + phLine + tgLine + dsLine;

      await bot.telegram.sendMessage(ADMIN_ID, text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Одобрить', `approve_${d.id}`),
            Markup.button.callback('❌ Отклонить', `reject_${d.id}`)
          ]
        ])
      });
      console.log(`📨 Новая заявка: ${d.name} (${d.id})`);
    } catch (err) {
      console.error('Realtime parse error:', err);
    }
  });

  ws.on('error', (err) => console.error('Realtime WS error:', err.message));
  ws.on('close', () => {
    console.warn('⚠️ Realtime WS закрыт, переподключение через 5с...');
    setTimeout(startRealtimeWatch, 5000);
  });

  // Heartbeat every 30s
  const ping = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: null }));
    } else {
      clearInterval(ping);
    }
  }, 30_000);
}

// ─────────────────────────────────────────
//  Альтернативный вариант — polling новых заявок
//  (используется если ws пакет недоступен)
// ─────────────────────────────────────────
let lastSeenId = null;
async function pollPending() {
  try {
    const rows = await db.select('services', 'status=eq.pending&order=created_at.asc');
    if (!rows || rows.length === 0) return;
    for (const d of rows) {
      if (lastSeenId === null) { lastSeenId = d.id; continue; } // первый запуск — просто запомнить
      if (d.id <= lastSeenId) continue;
      lastSeenId = d.id;

      const phLine = d.phone    ? `\n📞 *${d.phone}*`        : '';
      const tgLine = d.telegram ? `\n✈️ @${d.telegram}`      : '';
      const spLine = d.specialty ? `\n🎯 *${d.specialty}*`   : '';
      const dsLine = d.description ? `\n📝 ${d.description}` : '';

      const text =
        `🚨 *НОВАЯ ЗАЯВКА*\n\n👤 *${d.name}*\n📂 ${d.category}` +
        spLine + phLine + tgLine + dsLine;

      await bot.telegram.sendMessage(ADMIN_ID, text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Одобрить', `approve_${d.id}`),
            Markup.button.callback('❌ Отклонить', `reject_${d.id}`)
          ]
        ])
      });
      console.log(`📨 Новая заявка (polling): ${d.name} (${d.id})`);
    }
    if (lastSeenId === null && rows.length > 0) lastSeenId = rows[rows.length - 1].id;
  } catch (err) {
    console.error('Polling error:', err.message);
  }
}

// ─────────────────────────────────────────
//  Запуск
// ─────────────────────────────────────────
bot.launch();
console.log('✅ Бот запущен! Жду новых заявок...');

// Попробуем Realtime WS, если пакет ws доступен
try {
  require('ws');
  startRealtimeWatch();
  console.log('📡 Используем Supabase Realtime (WebSocket)');
} catch (_) {
  // ws не установлен — используем polling каждые 15 секунд
  console.log('⚠️ Пакет ws не найден — используем polling (каждые 15с)');
  // Первый запуск — запомнить текущие pending без уведомлений
  db.select('services', 'status=eq.pending&order=created_at.asc').then(rows => {
    if (rows && rows.length > 0) lastSeenId = rows[rows.length - 1].id;
    setInterval(pollPending, 15_000);
  }).catch(() => setInterval(pollPending, 15_000));
}

process.once('SIGINT',  () => { bot.stop('SIGINT');  console.log('⏹️ Остановлен'); });
process.once('SIGTERM', () => { bot.stop('SIGTERM'); console.log('⏹️ Остановлен'); });
