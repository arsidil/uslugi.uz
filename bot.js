const { Telegraf, Markup } = require('telegraf');

const SUPABASE_URL          = 'https://sqsbqsizbzcddbzbaigw.supabase.co';
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxc2Jxc2l6YnpjZGRiemJhaWd3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDEwNTkyOCwiZXhwIjoyMDg5NjgxOTI4fQ.IX0mzMND498fXhaYQ3RUgkp-1OIw_6PLU9xiJGtgOF4';

const MAIN_BOT_TOKEN  = process.env.MAIN_BOT_TOKEN || '';
const POST_CHAT_ID    = process.env.POST_CHAT_ID || '';
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

let postDraftText = null;
let postDraftAwaiting = false;
let postEditPublishedAwaiting = false;
let lastChannelPost = null;

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
    [Markup.button.callback('📝 Пост в канал','channel_post')]
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
/post — начать пост для канала (как кнопка «Пост в канал»)
/cancel_post — отменить ввод или редактирование поста

*Кнопки меню:*
• Ожидают проверки — краткая сводка и подсказка про /pending
• Одобренные / Отклонённые — списки имён
• Пост в канал — текст поста в чат основного бота (нужны MAIN\\_BOT\\_TOKEN и POST\\_CHAT\\_ID в окружении)

*Черновик поста:* после текста появятся кнопки — Отправить, Изменить, Удалить черновик.
*После публикации:* можно удалить или отредактировать сообщение на канале (пока бот помнит последний пост).`;

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

bot.command('post', async ctx => {
  if (!authedAdmins.has(ctx.from.id)) {
    return ctx.reply('🔐 Сначала введите пароль.');
  }
  postDraftAwaiting = true;
  postDraftText = null;
  postEditPublishedAwaiting = false;
  return ctx.reply('📝 Отправьте текст поста для канала.\n/cancel_post — отмена');
});

bot.command('cancel_post', async ctx => {
  postDraftAwaiting = false;
  postEditPublishedAwaiting = false;
  return ctx.reply('✅ Режим поста отменён.');
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

  if (postEditPublishedAwaiting) {
    const text = ctx.message.text.trim();
    if (!text) return ctx.reply('Пришлите непустой текст.');
    if (!MAIN_BOT_TOKEN || !POST_CHAT_ID) {
      postEditPublishedAwaiting = false;
      return ctx.reply('❌ Не заданы MAIN_BOT_TOKEN или POST_CHAT_ID.');
    }
    if (!lastChannelPost) {
      postEditPublishedAwaiting = false;
      return ctx.reply('❌ Нет сохранённого поста для редактирования.');
    }
    try {
      await mainBotRequest('editMessageText', {
        chat_id: lastChannelPost.chat_id,
        message_id: lastChannelPost.message_id,
        text
      });
      postEditPublishedAwaiting = false;
      return ctx.reply('✅ Пост на канале обновлён.', Markup.inlineKeyboard([
        [Markup.button.callback('🗑 Удалить с канала', 'post_pub_del')],
        [Markup.button.callback('✏️ Редактировать на канале', 'post_pub_edit')]
      ]));
    } catch (e) {
      postEditPublishedAwaiting = false;
      return ctx.reply('❌ ' + (e.message || 'Ошибка'));
    }
  }

  if (postDraftAwaiting) {
    postDraftText = ctx.message.text.trim();
    postDraftAwaiting = false;
    return ctx.reply(
      `📋 Черновик:\n\n${postDraftText}`,
      { ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Отправить', 'post_draft_send')],
        [
          Markup.button.callback('✏️ Изменить', 'post_draft_edit'),
          Markup.button.callback('🗑 Удалить черновик', 'post_draft_discard')
        ]
      ]) }
    );
  }

  return next();
});

bot.action('channel_post', async ctx => {
  if (!authedAdmins.has(ctx.from.id)) return ctx.answerCbQuery('⛔ Нет доступа');
  await ctx.answerCbQuery();
  postDraftAwaiting = true;
  postDraftText = null;
  postEditPublishedAwaiting = false;
  return ctx.reply('📝 Отправьте текст поста для канала.\n/cancel_post — отмена');
});

bot.action('post_draft_send', async ctx => {
  await ctx.answerCbQuery();
  if (!postDraftText) return ctx.reply('Нет текста черновика.');
  if (!MAIN_BOT_TOKEN || !POST_CHAT_ID) {
    return ctx.reply('❌ Задайте переменные окружения MAIN_BOT_TOKEN и POST_CHAT_ID (id канала, напр. \\-100…).');
  }
  try {
    const result = await mainBotRequest('sendMessage', {
      chat_id: POST_CHAT_ID,
      text: postDraftText
    });
    lastChannelPost = {
      message_id: result.message_id,
      chat_id: result.chat.id
    };
    postDraftText = null;
    return ctx.editMessageText('✅ Пост опубликован.', {
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🗑 Удалить с канала', 'post_pub_del')],
        [Markup.button.callback('✏️ Редактировать на канале', 'post_pub_edit')]
      ])
    });
  } catch (e) {
    return ctx.reply('❌ ' + (e.message || 'Не удалось отправить'));
  }
});

bot.action('post_draft_discard', async ctx => {
  await ctx.answerCbQuery();
  postDraftText = null;
  return ctx.editMessageText('🗑 Черновик удалён.');
});

bot.action('post_draft_edit', async ctx => {
  await ctx.answerCbQuery();
  postDraftAwaiting = true;
  postDraftText = null;
  return ctx.reply('✏️ Пришлите новый текст поста.');
});

bot.action('post_pub_del', async ctx => {
  await ctx.answerCbQuery();
  if (!lastChannelPost || !MAIN_BOT_TOKEN) return ctx.reply('❌ Нет поста или токена.');
  try {
    await mainBotRequest('deleteMessage', {
      chat_id: lastChannelPost.chat_id,
      message_id: lastChannelPost.message_id
    });
    lastChannelPost = null;
    return ctx.reply('🗑 Пост удалён с канала.');
  } catch (e) {
    return ctx.reply('❌ ' + (e.message || 'Ошибка удаления'));
  }
});

bot.action('post_pub_edit', async ctx => {
  await ctx.answerCbQuery();
  if (!lastChannelPost) return ctx.reply('❌ Нет поста для редактирования.');
  postEditPublishedAwaiting = true;
  return ctx.reply('✏️ Пришлите новый текст — он заменит пост на канале.\n/cancel_post — отмена');
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
