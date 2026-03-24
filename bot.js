const { Telegraf, Markup } = require('telegraf');

const SUPABASE_URL          = 'https://sqsbqsizbzcddbzbaigw.supabase.co';
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxc2Jxc2l6YnpjZGRiemJhaWd3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDEwNTkyOCwiZXhwIjoyMDg5NjgxOTI4fQ.IX0mzMND498fXhaYQ3RUgkp-1OIw_6PLU9xiJGtgOF4';

async function sbFetch(path, opts={}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...opts,
    headers: {
      'apikey':        SUPABASE_SERVICE_ROLE,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE}`,
      'Content-Type':  'application/json',
      ...(opts.headers||{})
    }
  });
  if (!res.ok) { const e=await res.text(); throw new Error(`Supabase ${res.status}: ${e}`); }
  const t=await res.text(); return t?JSON.parse(t):null;
}

const db = {
  select: (tbl,p='') => sbFetch(`/rest/v1/${tbl}?${p}`,{method:'GET',headers:{'Prefer':'return=representation'}}),
  update: (tbl,f,d)  => sbFetch(`/rest/v1/${tbl}?${f}`,{method:'PATCH',headers:{'Prefer':'return=representation'},body:JSON.stringify(d)}),
  delete: (tbl,f)    => sbFetch(`/rest/v1/${tbl}?${f}`,{method:'DELETE'})
};

const BOT_TOKEN = process.env.BOT_TOKEN || '8626567698:AAHuhRM4wHuc4_HerFbem1mD_WXTHv6e9v8';
const ADMIN_ID  = 1147754219;
const bot = new Telegraf(BOT_TOKEN);

// UUID pattern for action regex — matches uuid in callback data
// Callback data format: approve_<uuid>, reject_<uuid>, delete_<uuid>
// UUID contains hyphens, so we use a broad match
const UUID_RE = /^(approve|reject|delete)_(.+)$/;

// ── /start ──
bot.start(ctx => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply('⛔ Нет доступа');
  ctx.reply('👋 *USLUGI.UZ — Админ панель*\n\nВыбери действие:', {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('📋 Ожидают проверки','pending_apps')],
      [Markup.button.callback('✅ Одобренные','approved_apps')],
      [Markup.button.callback('❌ Отклонённые','rejected_apps')]
    ])
  });
});

// ── Главное меню ──
bot.action('main_menu', ctx => {
  ctx.editMessageText('👋 *USLUGI.UZ — Админ панель*\n\nВыбери действие:', {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('📋 Ожидают проверки','pending_apps')],
      [Markup.button.callback('✅ Одобренные','approved_apps')],
      [Markup.button.callback('❌ Отклонённые','rejected_apps')]
    ])
  });
  ctx.answerCbQuery();
});

// ── Ожидающие ──
bot.action('pending_apps', async ctx => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Нет доступа');
  try {
    const rows = await db.select('services','status=eq.pending&order=created_at.asc');
    if (!rows||!rows.length) {
      await ctx.editMessageText('✅ Нет новых заявок', Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Обновить','pending_apps')],
        [Markup.button.callback('🏠 Главная','main_menu')]
      ]));
      return ctx.answerCbQuery();
    }
    await ctx.editMessageText(`📋 *Ожидают проверки: ${rows.length}*\n\nОтправь /pending чтобы увидеть их с кнопками`, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Обновить','pending_apps')],
        [Markup.button.callback('🏠 Главная','main_menu')]
      ])
    });
    ctx.answerCbQuery();
  } catch(e) { console.error(e); ctx.answerCbQuery('❌ Ошибка'); }
});

// ── /pending — список с кнопками одобрить/отклонить ──
bot.command('pending', async ctx => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply('⛔ Нет доступа');
  try {
    const rows = await db.select('services','status=eq.pending&order=created_at.asc');
    if (!rows||!rows.length) return ctx.reply('✅ Нет ожидающих заявок');
    ctx.reply(`📋 *Ожидают проверки: ${rows.length}*`, {parse_mode:'Markdown'});
    for (const d of rows) {
      const text = formatService(d);
      await bot.telegram.sendMessage(ADMIN_ID, text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[
          Markup.button.callback('✅ Одобрить', `approve_${d.id}`),
          Markup.button.callback('❌ Отклонить', `reject_${d.id}`)
        ]])
      });
    }
  } catch(e) { console.error(e); ctx.reply('❌ Ошибка'); }
});

// ── Одобренные ──
bot.action('approved_apps', async ctx => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Нет доступа');
  try {
    const rows = await db.select('services','status=eq.approved&order=created_at.desc');
    if (!rows||!rows.length) {
      await ctx.editMessageText('Нет одобренных заявок', Markup.inlineKeyboard([[Markup.button.callback('🏠 Главная','main_menu')]]));
      return ctx.answerCbQuery();
    }
    let text=`✅ *Одобренных: ${rows.length}*\n\n`;
    rows.forEach(d=>{text+=`• *${d.name}* — ${d.specialty||d.category}\n`;});
    await ctx.editMessageText(text, {parse_mode:'Markdown',...Markup.inlineKeyboard([[Markup.button.callback('🏠 Главная','main_menu')]])});
    ctx.answerCbQuery();
  } catch(e) { console.error(e); ctx.answerCbQuery('❌ Ошибка'); }
});

// ── Отклонённые ──
bot.action('rejected_apps', async ctx => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Нет доступа');
  try {
    const rows = await db.select('services','status=eq.rejected&order=created_at.desc');
    if (!rows||!rows.length) {
      await ctx.editMessageText('Нет отклонённых заявок', Markup.inlineKeyboard([[Markup.button.callback('🏠 Главная','main_menu')]]));
      return ctx.answerCbQuery();
    }
    let text=`❌ *Отклонённых: ${rows.length}*\n\n`;
    rows.forEach(d=>{text+=`• *${d.name}* — ${d.specialty||d.category}\n`;});
    await ctx.editMessageText(text, {parse_mode:'Markdown',...Markup.inlineKeyboard([[Markup.button.callback('🏠 Главная','main_menu')]])});
    ctx.answerCbQuery();
  } catch(e) { console.error(e); ctx.answerCbQuery('❌ Ошибка'); }
});

// ── /list — одобренные с кнопкой удаления ──
bot.command('list', async ctx => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply('⛔ Нет доступа');
  try {
    const rows = await db.select('services','status=eq.approved&order=created_at.desc');
    if (!rows||!rows.length) return ctx.reply('📭 Нет одобренных анкет');
    await ctx.reply(`📋 *Одобренных: ${rows.length}*`, {parse_mode:'Markdown'});
    for (const d of rows) {
      const ph=d.phone?`\n📞 ${d.phone}`:'';
      const tg=d.telegram?`\n✈️ @${d.telegram}`:'';
      const sp=d.specialty?` — ${d.specialty}`:'';
      await bot.telegram.sendMessage(ADMIN_ID,
        `👤 *${d.name}*\n📂 ${d.category}${sp}${ph}${tg}`,
        {parse_mode:'Markdown',...Markup.inlineKeyboard([[Markup.button.callback('🗑 Удалить анкету',`delete_${d.id}`)]])}
      );
    }
  } catch(e) { console.error(e); ctx.reply('❌ Ошибка'); }
});

// ── Универсальный обработчик approve_ / reject_ / delete_ ──
// Используем on('callback_query') чтобы поддержать UUID с дефисами
bot.on('callback_query', async ctx => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Нет доступа');
  const data = ctx.callbackQuery.data || '';
  const match = data.match(UUID_RE);
  if (!match) return; // пусть другие action-хендлеры обработают

  const action = match[1]; // approve | reject | delete
  const id     = match[2]; // uuid

  try {
    const rows = await db.select('services', `id=eq.${id}`);
    if (!rows || !rows.length) {
      await ctx.editMessageText('⚠️ Запись не найдена (уже удалена?)');
      return ctx.answerCbQuery();
    }
    const d = rows[0];

    if (action === 'approve') {
      await db.update('services', `id=eq.${id}`, {status:'approved'});
      await ctx.editMessageText(
        `✅ *ОДОБРЕНО*\n\n👤 ${d.name}\n🎯 ${d.specialty||'-'}\n📂 ${d.category}\n📞 ${d.phone||'-'}\n✈️ ${d.telegram?'@'+d.telegram:'-'}`,
        {parse_mode:'Markdown'}
      );
      ctx.answerCbQuery('✅ Одобрено!');

    } else if (action === 'reject') {
      await db.update('services', `id=eq.${id}`, {status:'rejected'});
      await ctx.editMessageText(
        `❌ *ОТКЛОНЕНО*\n\n👤 ${d.name}\n🎯 ${d.specialty||'-'}\n📂 ${d.category}`,
        {parse_mode:'Markdown'}
      );
      ctx.answerCbQuery('❌ Отклонено');

    } else if (action === 'delete') {
      await db.delete('services', `id=eq.${id}`);
      await ctx.editMessageText(`🗑 *Анкета удалена*\n👤 ${d.name}`, {parse_mode:'Markdown'});
      ctx.answerCbQuery('🗑 Удалено');
    }
  } catch(e) {
    console.error(`Ошибка ${action}:`, e.message);
    ctx.answerCbQuery('❌ Ошибка: ' + e.message.slice(0,50));
  }
});

// ── Хелпер форматирования ──
function formatService(d) {
  return `🚨 *НОВАЯ ЗАЯВКА*\n\n` +
    `👤 *${d.name}*\n📂 ${d.category}` +
    (d.specialty ? `\n🎯 *${d.specialty}*` : '') +
    (d.phone     ? `\n📞 *${d.phone}*`     : '') +
    (d.telegram  ? `\n✈️ @${d.telegram}`   : '') +
    (d.description ? `\n📝 ${d.description}` : '');
}

// ── Polling новых заявок (каждые 10 секунд) ──
const seenIds = new Set();

async function pollPending() {
  try {
    const rows = await db.select('services','status=eq.pending&order=created_at.asc');
    if (!rows||!rows.length) return;
    for (const d of rows) {
      if (seenIds.has(d.id)) continue;
      seenIds.add(d.id);
      await bot.telegram.sendMessage(ADMIN_ID, formatService(d), {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[
          Markup.button.callback('✅ Одобрить', `approve_${d.id}`),
          Markup.button.callback('❌ Отклонить', `reject_${d.id}`)
        ]])
      });
      console.log(`📨 Новая заявка: ${d.name} (${d.id})`);
    }
  } catch(e) { console.error('Polling error:', e.message); }
}

// Запуск: сначала запоминаем существующие pending без уведомлений
db.select('services','status=eq.pending&order=created_at.asc').then(rows => {
  if (rows) rows.forEach(r => seenIds.add(r.id));
  console.log(`📊 При запуске pending в очереди: ${seenIds.size}`);
  setInterval(pollPending, 10_000);
}).catch(() => setInterval(pollPending, 10_000));

bot.launch();
console.log('✅ Бот запущен!');

process.once('SIGINT',  () => { bot.stop('SIGINT');  });
process.once('SIGTERM', () => { bot.stop('SIGTERM'); });
