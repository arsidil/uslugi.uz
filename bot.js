const { Telegraf, Markup } = require('telegraf');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// ── FIREBASE ──
let serviceAccount;
try {
  if (process.env.SERVICE_ACCOUNT_KEY) {
    // Railway — читаем из переменной окружения
    serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT_KEY);
    console.log('✅ Firebase ключ загружен из ENV');
  } else {
    // Локально — читаем из файла
    serviceAccount = JSON.parse(fs.readFileSync(path.join(__dirname, 'serviceAccountKey.json'), 'utf8'));
    console.log('✅ Firebase ключ загружен из файла');
  }
} catch (error) {
  console.error('❌ Ошибка загрузки ключа:', error.message);
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id
  });
  console.log('✅ Firebase инициализирован');
}

const db  = admin.firestore();
const bot = new Telegraf('8626567698:AAHuhRM4wHuc4_HerFbem1mD_WXTHv6e9v8');
const ADMIN_ID = 1147754219;

// ── /start ──
bot.start((ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply('⛔ Нет доступа');
  ctx.reply(
    '👋 *USLUGI.UZ — Админ панель*\n\nВыбери действие:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📋 Ожидают проверки', 'pending_apps')],
        [Markup.button.callback('✅ Одобренные', 'approved_apps')],
        [Markup.button.callback('❌ Отклонённые', 'rejected_apps')]
      ])
    }
  );
});

// ── Список ожидающих ──
bot.action('pending_apps', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Нет доступа');
  try {
    const snapshot = await db.collection('services').where('status', '==', 'pending').get();
    if (snapshot.empty) {
      await ctx.editMessageText('✅ Нет новых заявок', Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Обновить', 'pending_apps')],
        [Markup.button.callback('🏠 Главная', 'main_menu')]
      ]));
      return ctx.answerCbQuery();
    }
    await ctx.editMessageText(
      `📋 *Ожидают проверки: ${snapshot.size}*\n\nНажми /start чтобы получить список заявок с кнопками`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Обновить', 'pending_apps')],
          [Markup.button.callback('🏠 Главная', 'main_menu')]
        ])
      }
    );
    ctx.answerCbQuery();
  } catch (e) {
    console.error(e);
    ctx.answerCbQuery('❌ Ошибка');
  }
});

// ── Список одобренных ──
bot.action('approved_apps', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Нет доступа');
  try {
    const snapshot = await db.collection('services').where('status', '==', 'approved').get();
    if (snapshot.empty) {
      await ctx.editMessageText('Нет одобренных заявок', Markup.inlineKeyboard([[Markup.button.callback('🏠 Главная', 'main_menu')]]));
      return ctx.answerCbQuery();
    }
    let text = `✅ *Одобренных: ${snapshot.size}*\n\n`;
    snapshot.forEach(doc => {
      const d = doc.data();
      text += `• *${d.name}* — ${d.specialty || d.category}\n`;
    });
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

// ── Список отклонённых ──
bot.action('rejected_apps', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Нет доступа');
  try {
    const snapshot = await db.collection('services').where('status', '==', 'rejected').get();
    if (snapshot.empty) {
      await ctx.editMessageText('Нет отклонённых заявок', Markup.inlineKeyboard([[Markup.button.callback('🏠 Главная', 'main_menu')]]));
      return ctx.answerCbQuery();
    }
    let text = `❌ *Отклонённых: ${snapshot.size}*\n\n`;
    snapshot.forEach(doc => {
      const d = doc.data();
      text += `• *${d.name}* — ${d.specialty || d.category}\n`;
    });
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

// ── Главное меню ──
bot.action('main_menu', (ctx) => {
  ctx.editMessageText(
    '👋 *USLUGI.UZ — Админ панель*\n\nВыбери действие:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📋 Ожидают проверки', 'pending_apps')],
        [Markup.button.callback('✅ Одобренные', 'approved_apps')],
        [Markup.button.callback('❌ Отклонённые', 'rejected_apps')]
      ])
    }
  );
  ctx.answerCbQuery();
});

// ── ✅ Одобрить ──
bot.action(/^approve_(.+)$/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Нет доступа');
  try {
    const docId = ctx.match[1];
    const doc = await db.collection('services').doc(docId).get();
    if (!doc.exists) {
      await ctx.editMessageText('⚠️ Заявка не найдена (возможно уже удалена)');
      return ctx.answerCbQuery();
    }
    await db.collection('services').doc(docId).update({ status: 'approved' });
    const d = doc.data();
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

// ── ❌ Отклонить ──
bot.action(/^reject_(.+)$/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Нет доступа');
  try {
    const docId = ctx.match[1];
    const doc = await db.collection('services').doc(docId).get();
    if (!doc.exists) {
      await ctx.editMessageText('⚠️ Заявка не найдена');
      return ctx.answerCbQuery();
    }
    await db.collection('services').doc(docId).update({ status: 'rejected' });
    const d = doc.data();
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

// ── /list — все одобренные с кнопкой удаления ──
bot.command('list', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply('⛔ Нет доступа');
  try {
    const snapshot = await db.collection('services').where('status', '==', 'approved').get();
    if (snapshot.empty) return ctx.reply('📭 Нет одобренных анкет');

    ctx.reply(`📋 *Одобренных анкет: ${snapshot.size}*\nНажми на имя чтобы удалить:`, { parse_mode: 'Markdown' });

    // Отправляем каждую анкету отдельным сообщением с кнопкой удаления
    for (const docSnap of snapshot.docs) {
      const d = docSnap.data();
      const text =
        `👤 *${d.name}*\n` +
        `📂 ${d.category}${d.specialty ? ' — ' + d.specialty : ''}\n` +
        `${d.phone ? '📞 ' + d.phone : ''}${d.telegram ? '  ✈️ @' + d.telegram : ''}`;
      await bot.telegram.sendMessage(ADMIN_ID, text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🗑 Удалить анкету', `delete_${docSnap.id}`)]
        ])
      });
    }
  } catch (e) {
    console.error(e);
    ctx.reply('❌ Ошибка при загрузке списка');
  }
});

// ── Удалить анкету ──
bot.action(/^delete_(.+)$/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Нет доступа');
  try {
    const docId = ctx.match[1];
    const docRef = db.collection('services').doc(docId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      await ctx.editMessageText('⚠️ Анкета не найдена');
      return ctx.answerCbQuery();
    }
    const name = docSnap.data().name;
    await docRef.delete();
    await ctx.editMessageText(`🗑 *Анкета удалена*\n👤 ${name}`, { parse_mode: 'Markdown' });
    ctx.answerCbQuery('🗑 Удалено');
  } catch (e) {
    console.error(e);
    ctx.answerCbQuery('❌ Ошибка');
  }
});


let isFirstSnapshot = true; // чтобы не спамить при запуске

db.collection('services')
  .where('status', '==', 'pending')
  .onSnapshot(
    (snapshot) => {
      if (isFirstSnapshot) {
        isFirstSnapshot = false;
        console.log(`📊 При запуске в очереди: ${snapshot.size} заявок`);
        return; // не отправляем уведомления о старых pending при старте
      }

      snapshot.docChanges().forEach((change) => {
        if (change.type !== 'added') return;

        const d     = doc => doc.data();
        const docId = change.doc.id;
        const app   = change.doc.data();

        const phLine = app.phone    ? `\n📞 *${app.phone}*`          : '';
        const tgLine = app.telegram ? `\n✈️ @${app.telegram}`        : '';
        const spLine = app.specialty ? `\n🎯 *${app.specialty}*`     : '';
        const dsLine = app.description ? `\n📝 ${app.description}`   : '';

        const text =
          `🚨 *НОВАЯ ЗАЯВКА*\n\n` +
          `👤 *${app.name}*\n` +
          `📂 ${app.category}` +
          spLine + phLine + tgLine + dsLine;

        bot.telegram.sendMessage(ADMIN_ID, text, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('✅ Одобрить', `approve_${docId}`),
              Markup.button.callback('❌ Отклонить', `reject_${docId}`)
            ]
          ])
        }).catch(err => console.error('Ошибка отправки уведомления:', err));

        console.log(`📨 Новая заявка: ${app.name} (${docId})`);
      });
    },
    (error) => {
      console.error('❌ Ошибка Firestore onSnapshot:', error);
    }
  );

// ── Запуск ──
bot.launch();
console.log('✅ Бот запущен! Жду новых заявок...');

process.once('SIGINT',  () => { bot.stop('SIGINT');  console.log('⏹️ Остановлен'); });
process.once('SIGTERM', () => { bot.stop('SIGTERM'); console.log('⏹️ Остановлен'); });
