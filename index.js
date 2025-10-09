const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

// Конфигурация (заменили process.env на прямые значения)
const TOKEN = "8442760191:AAHQEA7eZAuCmsadZ5gYcoPDfFkbXkeUXL0";
const CHAT_ID = "-4816045252";

console.log("Используемый токен:", TOKEN);
console.log("Чат ID:", CHAT_ID);

const bot = new TelegramBot(TOKEN, { polling: true });
const userStates = {};

function formatDate(date) {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  
  return `${day}.${month}.${year}. ${hours}:${minutes}`;
}

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'Пользователь';

  userStates[chatId] = { 
    step: 1, 
    data: { 
      photos: [],
      receivedPhotos: new Set() 
    } 
  };

  bot.sendMessage(
    chatId,
    `Привет, ${firstName}! Это бот для заявок на ремонт в компанию [Мехатроника СПб](https://mechatronic.spb.ru/)\n\nУкажите модель техники (если есть возможность, укажите год выпуска):`,
    { parse_mode: 'Markdown' }
  );
});

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  if (!userStates[chatId]) return;

  const state = userStates[chatId];

  if (state.step === 1 && msg.text && !msg.text.startsWith('/')) {
    state.data.model = msg.text;
    state.step = 2;
    bot.sendMessage(chatId, 'Опишите проблему или симптомы поломки:');
  }
  else if (state.step === 2 && msg.text && !msg.text.startsWith('/')) {
    state.data.problem = msg.text;
    state.step = 3;
    bot.sendMessage(chatId, 'Отправьте фотографии блока/модуля (если есть):', {
      reply_markup: {
        inline_keyboard: [[{ text: 'Продолжить', callback_data: 'skip_photos' }]]
      }
    });
  }
  else if (state.step === 3) {
    if (msg.photo) {
      const bestPhoto = msg.photo[msg.photo.length - 1];
      
      if (!state.data.receivedPhotos.has(bestPhoto.file_id)) {
        state.data.photos.push(bestPhoto.file_id);
        state.data.receivedPhotos.add(bestPhoto.file_id);
        
        clearTimeout(state.photoTimeout);
        state.photoTimeout = setTimeout(() => {
          if (state.step === 3) {
            state.step = 4;
            bot.sendMessage(chatId, 'Укажите номер телефона для связи:');
            try {
              bot.deleteMessage(chatId, msg.message_id - 1);
            } catch (e) {
              console.log('Не удалось удалить сообщение:', e.message);
            }
          }
        }, 3000);
      }
    }
  }
  else if (state.step === 4 && msg.text && !msg.text.startsWith('/')) {
    state.data.phone = msg.text;
    state.data.username = msg.from.username ? `@${msg.from.username}` : 'Не указано';
    state.data.timestamp = new Date();
    
    sendApplication(chatId, state.data);
    delete userStates[chatId];
  }
});

bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const state = userStates[chatId];
  if (!state) return;

  if (query.data === 'skip_photos' && state.step === 3) {
    clearTimeout(state.photoTimeout);
    state.step = 4;
    bot.sendMessage(chatId, 'Укажите номер телефона для связи:');
    bot.answerCallbackQuery(query.id);
    try {
      bot.deleteMessage(chatId, query.message.message_id);
    } catch (e) {
      console.log('Не удалось удалить сообщение:', e.message);
    }
  }
});

function sendApplication(chatId, data) {
  const currentTime = formatDate(data.timestamp || new Date());
  const requestText = `📋 Новая заявка (${currentTime})\n👤 Клиент: ${data.username}\n🔧 Модель: ${data.model}\n⚠️ Проблема: ${data.problem}\n📞 Контакт: ${data.phone}`;

  if (data.photos.length > 0) {
    const mediaGroup = data.photos.map((photoId, index) => ({
      type: 'photo',
      media: photoId,
      caption: index === 0 ? requestText : undefined
    }));
    bot.sendMediaGroup(CHAT_ID, mediaGroup);
  } else {
    bot.sendMessage(CHAT_ID, requestText);
  }

  const logEntry = `--- Заявка от ${currentTime} ---
Чат ID: ${chatId}
Клиент: ${data.username}
Модель: ${data.model}
Проблема: ${data.problem}
Телефон: ${data.phone}
Фото: ${data.photos.length}
-------------------\n`;
  fs.appendFileSync('logs.txt', logEntry);

  bot.sendMessage(chatId, '✅ Заявка отправлена! Скоро мы с вами свяжемся.');
}

bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

console.log('Бот запущен...');