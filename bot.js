const { Telegraf, Markup } = require('telegraf');

const SUPABASE_URL          = 'https://sqsbqsizbzcddbzbaigw.supabase.co';
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxc2Jxc2l6YnpjZGRiemJhaWd3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDEwNTkyOCwiZXhwIjoyMDg5NjgxOTI4fQ.IX0mzMND498fXhaYQ3RUgkp-1OIw_6PLU9xiJGtgOF4';

const MAIN_BOT_TOKEN  = process.env.MAIN_BOT_TOKEN || '';
const ADMIN_PASSWORD  = 'USLUGI 1207';

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
  // 204 No Content — успех для DELETE/PATCH без тела
  if (res.status === 204) return null;
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

const UUID_RE = /^(approve|reject|delete)_(.+)$/;
const authedAdmins = new Set();

let broadcastDraftText = null;
let broadcastAwaiting = false;

async function mainBotRequest(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${MAIN_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.description || 'Telegram API error');
  return j.result;
}

function mainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📋 Ожидают проверки','pending_apps')],
    [Markup.button.callback('✅ Одобренные','approved_apps')],
    [Markup.button.callback('❌ Отклонённые','rejected_apps')],
    [Markup.button.callback('📢 Рассылка пользователям','broadcast')]
  ]);
}

function showMainMenu(ctx) {
  return ctx.reply('👋 *USLUGI.UZ — Админ панель*\n\nВыбери действие или команду — см. /help', {
    parse_mode: 'Markdown',
    ...mainMenuKeyboard()
  });
}

const HELP_TEXT =
`📖 *Справка — админ USLUGI.UZ*

*Команды:*
/start — вход и главное меню (сначала запросит пароль)
/help — эта справка
/pending — все заявки в статусе «ожидают» с кнопками одобрить / отклонить
/list — одобренные анкеты с кнопкой удаления с сайта
/broadcast — начать рассылку всем пользователям основного бота
/cancel_post — отменить ввод текста рассылки

*Кнопки меню:*
• Ожидают проверки — краткая сводка и подсказка про /pending
• Одобренные / Отклонённые — списки имён
• Рассылка — отправить сообщение всем пользователям основного бота

*Для рассылки нужны:*
MAIN\\_BOT\\_TOKEN (токен основного бота) в переменных окружения Railway.`;


bot.use(async (ctx, next) => {
  if (!ctx.from || ctx.from.id !== ADMIN_ID) {
    try {
      if (ctx.message && ctx.chat?.type === 'private') await ctx.reply('⛔ Нет доступа');
    } catch (_) {}
    return;
  }
  return next();
});

bot.start(ctx => {
  if (!authedAdmins.has(ctx.from.id)) {
    return ctx.reply('🔐 *USLUGI.UZ — Админ*\n\nВведите пароль одним сообщением:', { parse_mode: 'Markdown' });
  }
  return showMainMenu(ctx);
});

bot.command('help', async ctx => {
  if (!authedAdmins.has(ctx.from.id)) {
    return ctx.reply('🔐 Сначала введите пароль. Отправьте /start');
  }
  return ctx.reply(HELP_TEXT, { parse_mode: 'Markdown' });
});

bot.command('broadcast', async ctx => {
  if (!authedAdmins.has(ctx.from.id)) {
    return ctx.reply('🔐 Сначала введите пароль.');
  }
  broadcastAwaiting = true;
  broadcastDraftText = null;
  return ctx.reply('📢 Отправьте текст рассылки.\nОн уйдёт всем пользователям основного бота.\n\n/cancel_post — отмена');
});

bot.command('cancel_post', async ctx => {
  broadcastAwaiting = false;
  broadcastDraftText = null;
  return ctx.reply('✅ Рассылка отменена.');
});

bot.on('text', async (ctx, next) => {
  if (ctx.message.text.startsWith('/')) return next();

  if (!authedAdmins.has(ctx.from.id)) {
    if (ctx.message.text.trim() === ADMIN_PASSWORD) {
      authedAdmins.add(ctx.from.id);
      await ctx.reply('✅ Пароль принят.');
      return showMainMenu(ctx);
    }
    return ctx.reply('❌ Неверный пароль.');
  }

  if (broadcastAwaiting) {
    broadcastDraftText = ctx.message.text.trim();
    broadcastAwaiting = false;
    return ctx.reply(
      `📋 Черновик рассылки:\n\n${broadcastDraftText}`,
      Markup.inlineKeyboard([
        [Markup.button.callback('📢 Разослать всем', 'broadcast_send')],
        [
          Markup.button.callback('✏️ Изменить', 'broadcast_edit'),
          Markup.button.callback('🗑 Отменить', 'broadcast_discard')
        ]
      ])
    );
  }

  return next();
});

bot.action('broadcast', async ctx => {
  if (!authedAdmins.has(ctx.from.id)) return ctx.answerCbQuery('⛔ Нет доступа');
  await ctx.answerCbQuery();
  broadcastAwaiting = true;
  broadcastDraftText = null;
  return ctx.reply('📢 Отправьте текст рассылки.\nОн уйдёт всем пользователям основного бота.\n\n/cancel_post — отмена');
});

bot.action('broadcast_send', async ctx => {
  await ctx.answerCbQuery();
  if (!broadcastDraftText) return ctx.reply('Нет текста рассылки.');
  if (!MAIN_BOT_TOKEN) {
    return ctx.reply('❌ Задайте MAIN_BOT_TOKEN в переменных окружения Railway (сервер админ-бота).');
  }

  // Получаем всех пользователей из Supabase
  let users = [];
  try {
    users = await db.select('users', 'select=chat_id');
  } catch (e) {
    return ctx.reply('❌ Не удалось получить список пользователей: ' + e.message);
  }

  if (!users || !users.length) {
    return ctx.reply('❌ Нет пользователей для рассылки. Возможно никто ещё не нажал /start в основном боте.');
  }

  await ctx.editMessageText(`📢 Запускаю рассылку для ${users.length} пользователей...`);

  let ok = 0, fail = 0;
  for (const u of users) {
    try {
      await mainBotRequest('sendMessage', {
        chat_id: u.chat_id,
        text: broadcastDraftText,
        parse_mode: 'Markdown'
      });
      ok++;
    } catch (e) {
      fail++;
      console.warn(`Рассылка fail ${u.chat_id}:`, e.message);
    }
    // небольшая пауза чтобы не словить rate limit Telegram
    await new Promise(r => setTimeout(r, 50));
  }

  broadcastDraftText = null;
  return ctx.reply(`✅ Рассылка завершена.\n📤 Отправлено: ${ok}\n❌ Ошибок: ${fail}`);
});

bot.action('broadcast_edit', async ctx => {
  await ctx.answerCbQuery();
  broadcastAwaiting = true;
  broadcastDraftText = null;
  return ctx.reply('✏️ Пришлите новый текст рассылки.');
});

bot.action('broadcast_discard', async ctx => {
  await ctx.answerCbQuery();
  broadcastDraftText = null;
  broadcastAwaiting = false;
  return ctx.editMessageText('🗑 Рассылка отменена.');
});

bot.action('main_menu', ctx => {
  if (!authedAdmins.has(ctx.from.id)) return ctx.answerCbQuery('🔐 Нужен пароль');
  ctx.editMessageText('👋 *USLUGI.UZ — Админ панель*\n\nВыбери действие:', {
    parse_mode: 'Markdown',
    ...mainMenuKeyboard()
  });
  ctx.answerCbQuery();
});

bot.action('pending_apps', async ctx => {
  if (!authedAdmins.has(ctx.from.id)) return ctx.answerCbQuery('⛔ Нет доступа');
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

bot.command('pending', async ctx => {
  if (!authedAdmins.has(ctx.from.id)) return ctx.reply('🔐 Сначала введите пароль.');
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

bot.action('approved_apps', async ctx => {
  if (!authedAdmins.has(ctx.from.id)) return ctx.answerCbQuery('⛔ Нет доступа');
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

bot.action('rejected_apps', async ctx => {
  if (!authedAdmins.has(ctx.from.id)) return ctx.answerCbQuery('⛔ Нет доступа');
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

bot.command('list', async ctx => {
  if (!authedAdmins.has(ctx.from.id)) return ctx.reply('🔐 Сначала введите пароль.');
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

bot.on('callback_query', async (ctx, next) => {
  if (!authedAdmins.has(ctx.from.id)) return ctx.answerCbQuery('🔐 Нужен пароль');
  const data = ctx.callbackQuery.data || '';
  const match = data.match(UUID_RE);
  if (!match) return next();

  const action = match[1];
  const id     = match[2];

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
      try {
        await db.delete('reviews', `service_id=eq.${id}`);
      } catch (err) {
        console.warn('reviews delete:', err.message);
      }
      await db.delete('services', `id=eq.${id}`);
      await ctx.editMessageText(`🗑 *Анкета удалена*\n👤 ${d.name}`, {parse_mode:'Markdown'});
      ctx.answerCbQuery('🗑 Удалено');
    }
  } catch(e) {
    console.error(`Ошибка ${action}:`, e.message);
    ctx.answerCbQuery('❌ Ошибка: ' + e.message.slice(0,50));
  }
});

function formatService(d) {
  return `🚨 *НОВАЯ ЗАЯВКА*\n\n` +
    `👤 *${d.name}*\n📂 ${d.category}` +
    (d.specialty ? `\n🎯 *${d.specialty}*` : '') +
    (d.phone     ? `\n📞 *${d.phone}*`     : '') +
    (d.telegram  ? `\n✈️ @${d.telegram}`   : '') +
    (d.description ? `\n📝 ${d.description}` : '');
}

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

db.select('services','status=eq.pending&order=created_at.asc').then(rows => {
  if (rows) rows.forEach(r => seenIds.add(r.id));
  console.log(`📊 При запуске pending в очереди: ${seenIds.size}`);
  setInterval(pollPending, 10_000);
}).catch(() => setInterval(pollPending, 10_000));

bot.launch();
console.log('✅ Бот запущен!');

process.once('SIGINT',  () => { bot.stop('SIGINT');  });
process.once('SIGTERM', () => { bot.stop('SIGTERM'); });
