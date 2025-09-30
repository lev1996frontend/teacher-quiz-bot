// Телеграм-бот: шуточная викторина для учителя русского/литературы.
// Особенности:
// - Все шуточные вопросы без подсчёта баллов (любой вариант ок).
// - Финальный вопрос про кота (проверяется по CAT_NAME).
// - Меню и команды: /start, /menu, /restart.
// - В конце можно отправить два сертификата: фото (из ./assets) и PDF (генерация pdfkit).

const { Telegraf, Markup, session } = require("telegraf");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const CAT_NAME = process.env.CAT_NAME || "Мурзик";

if (!BOT_TOKEN) {
  console.error("Не задан BOT_TOKEN в .env");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Надёжная сессия
bot.use(
  session({
    getSessionKey: (ctx) => {
      const fromId = ctx.from?.id;
      const chatId = ctx.chat?.id;
      if (fromId && chatId) return `${fromId}:${chatId}`;
      if (fromId) return String(fromId);
      return undefined;
    },
    defaultSession: () => ({
      step: 0,
      quiz: null,
      currentOptions: null,
      correctIndex: null, // -1 => all-correct
      lock: false,
    }),
  })
);

// ===== ДОСТУП ТОЛЬКО ДЛЯ РАЗРЕШЁННЫХ ID =====
// В .env / Render: ALLOWED_IDS=452539069  (несколько через запятую)
const ALLOWED_IDS = new Set(
  String(process.env.ALLOWED_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s)) // преобразуем к числу
);
bot.use(async (ctx, next) => {
  if (ctx.from?.id) {
    console.log("from.id =", ctx.from.id, "allowed =", [...ALLOWED_IDS]);
  }
  return next();
});

// Команды в меню Telegram
bot.telegram.setMyCommands([
  { command: "start", description: "Начать" },
  { command: "restart", description: "Перезапустить викторину" },
]);

// ===== Настройки и вопросы =====
const subject = "русский язык и литература";

const TOASTS = [
  "Учитель — сердце класса!\nСлово — искра, взгляд — компас.\nПусть горит и греет!",
  "Вы — к доске вселенной!\nЗвёзды — как запятые,\nставите — и светлее.",
  "Голос — мел, дыхание — строка.\nУчитель, вы — ударение на смысле!\nПусть не кончается вдох.",
  "Если детей зажигают — значит, это нужно!\nВы — спичка мыслей.\nПусть огонь — безопасно, ярко, дружно.",
  "Литература — барабан сердца!\nВы держите ритм.\nМы — в такт, мы — в строку!",
  "Слово — мост. Вы — архитектор.\nМы — шаг за шагом через «возможность».\nСпасибо, что ведёте.",
];

// Шуточные вопросы: allCorrect:true -> любой ответ засчитывается
const BASE_QUESTIONS = [
  {
    q: "Что делает урок литературы по-настоящему захватывающим?",
    options: [
      "Интрига в сюжете",
      "Учитель с искрой",
      "Ученик с вопросом «а зачем?»",
      "Неожиданная цитата в начале",
    ],
    allCorrect: true,
  },
  {
    q: "Какой это троп: «русский язык — нитка, сшивающая смысл»?",
    options: [
      "Метафора",
      "Красиво сказано — и хватит",
      "Это когда предметы дружат со смыслами",
      "Тот самый случай, когда хочется подчеркнуть в тетради",
    ],
    allCorrect: true,
  },
  {
    q: "Правильный порядок на уроке литературы?",
    options: [
      "Чай — книга — вдохновение",
      "Тезис — цитата — вывод",
      "Вопрос — спор — примирение с Пушкиным",
      "Сначала тишина, потом смысл",
    ],
    allCorrect: true,
  },
  {
    q: "Как отличить роман от повести на глаз?",
    options: [
      "По толщине книги",
      "По толщине закладок",
      "По толщине переживаний",
      "Никак, пока не начнёшь читать",
    ],
    allCorrect: true,
  },
  {
    q: "Что делать, если запятая уплыла?",
    options: [
      "Позвать двоеточие — оно серьёзное",
      "Поставить тире — оно всё объяснит",
      "Сделать вдох и перечитать",
      "Найти запятую в учебнике и успокоиться",
    ],
    allCorrect: true,
  },
  {
    q: "Современные сериалы — это…",
    options: [
      "Новые «Война и мир», только сериями",
      "Тренажёр по сопереживанию",
      "Метод понять, чем живёт эпоха",
      "Лайфхак: как заинтересовать класс",
    ],
    allCorrect: true,
  },
  {
    q: "Какая суперсила нужна учителю русского?",
    options: [
      "Видеть смысл между строк",
      "Останавливать ошибки взглядом",
      "Превращать правило в историю",
      "Слышать, где ставить ударение",
    ],
    allCorrect: true,
  },
  {
    q: "С чем лучше сравнить запятую?",
    options: [
      "С перекрёстком мысли",
      "С вдохом читателя",
      "С мини-паузой актёра",
      "С маленькой, но гордой деталью смысла",
    ],
    allCorrect: true,
  },
  {
    q: "Какой идеальный финал урока литературы?",
    options: [
      "У всех появилась любимая цитата",
      "Кто-то спросил, что читать дальше",
      "Тетради закрылись, а мысли — нет",
      "Учитель улыбнулся — значит, вышло",
    ],
    allCorrect: true,
  },
  {
    q: "Как понять, что сериал годный для примера на уроке?",
    options: [
      "Есть характеры, с которыми можно спорить",
      "Есть тема, которую хочется обсудить",
      "Есть сцена, где язык играет роль",
      "Есть повод вспомнить классиков",
    ],
    allCorrect: true,
  },
];

function getToast() {
  return TOASTS[Math.floor(Math.random() * TOASTS.length)];
}

// Финальный вопрос про кота — единственный с проверкой
function makeFinalCatQuestion() {
  const pool = ["Шеня", "Любимка", "Крашулик"];
  const set = new Set(pool);
  set.add(CAT_NAME);
  let arr = Array.from(set);
  if (arr.length > 4) {
    const w = arr.filter((x) => x !== CAT_NAME);
    arr = w.slice(0, 3).concat(CAT_NAME);
  }
  return {
    q: `И наконец: как зовут твоего кота?`,
    options: arr,
    correctText: CAT_NAME,
  };
}

function getQuestions() {
  return [...BASE_QUESTIONS, makeFinalCatQuestion()];
}

// ===== Утилиты =====
function shuffle(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isLastQuestion(ctx) {
  const list = ctx.session.quiz || [];
  const step = ctx.session.step ?? 0;
  return step === list.length - 1;
}

function isAllowed(ctx) {
  const uid = ctx.from?.id;
  if (!uid) return false;
  if (!ALLOWED_IDS || ALLOWED_IDS.size === 0) return true; // пустой список = открыт всем
  return ALLOWED_IDS.has(uid);
}

async function showWelcome(ctx) {
  await ctx.reply(
    `Ангелина, Вы любите розы!? Сегодня — не просто день, а повод устроить лёгкую литературную шалость.
Тема: ${subject}.
Зима близко, так что не тормозим — жмём «Старт» и погнали!`,
    Markup.inlineKeyboard([[Markup.button.callback("Старт", "start")]])
  );
  await ctx.reply(
    [
      "Как это работает (очень просто):",
      "1) Жми «Старт» и устраиваем литературный флекс. 💃📚",
      "2) Клацай любой вариант — много думать вредно! 😉",
      "3) В финале — главный босс. Тут уже нужен правильный ответ. 🐾",
      "4) Захочешь ещё круг? жми «Перезапустить» — и поехали заново. 🔄",
    ].join("\n")
  );
}

async function showMenu(ctx) {
  return ctx.reply(
    "Меню:",
    Markup.inlineKeyboard([
      [Markup.button.callback("Начать заново", "start")],
      [Markup.button.callback("Приветствие", "again")],
      [Markup.button.callback("Показать сертификаты", "certs")],
    ])
  );
}

async function sendQuestion(ctx) {
  const step = ctx.session.step ?? 0;
  const list = ctx.session.quiz ?? (ctx.session.quiz = getQuestions());
  const total = list.length;

  if (step >= total) return finish(ctx);

  const { q, options, correctText, allCorrect } = list[step];
  const shuffled = shuffle(options);

  ctx.session.currentOptions = shuffled;
  ctx.session.correctIndex = allCorrect ? -1 : shuffled.indexOf(correctText);
  ctx.session.lock = false;

  const buttons = shuffled.map((opt, i) => [
    Markup.button.callback(opt, `answer:${i}`),
  ]);
  return ctx.reply(
    `Вопрос ${step + 1} из ${total}\n\n${q}`,
    Markup.inlineKeyboard(buttons)
  );
}

async function finish(ctx) {
  const lines = [
    `Ангелина, с Днём учителя!`,
    `Спасибо за то, что учишь видеть смысл между строк, любить книги и спорить культурно — даже о сериалах 🙂`,
    `Как писал Маяковский: «Если звёзды зажигают — значит — это кому-нибудь нужно».`,
    `Пусть уроки вдохновляют и на них загораются глаза, а ${CAT_NAME} мурлычет рядом и ест мороженое))`,
    `Тепла, вдохновения и счастливых учеников!`,
    getToast(),
  ].join("\n");

  await ctx.reply(
    lines,
    Markup.inlineKeyboard([
      [Markup.button.callback("Показать сертификаты", "certs")],
      [
        Markup.button.callback("Начать", "start"),
        Markup.button.callback("Перезапустить", "restart"),
      ],
    ])
  );

  // Сброс состояния
  ctx.session.step = 0;
  ctx.session.quiz = null;
  ctx.session.currentOptions = null;
  ctx.session.correctIndex = null;
  ctx.session.lock = false;
}

// ===== Сертификаты =====

// 1) Фото-сертификат: отправляем ровно ту картинку из ./assets
async function sendPhotoCertificate(ctx) {
  const candidates = ["certificate.jpg", "certificate.jpeg", "certificate.png"];
  const found = candidates
    .map((name) => path.join(__dirname, "assets", name))
    .find((p) => fs.existsSync(p));
  if (!found) {
    await ctx.reply(
      "Фото-сертификат пока не добавлен (положи файл в ./assets/certificate.jpg)."
    );
    return;
  }
  await ctx.replyWithPhoto(
    { source: found },
    {
      caption:
        "Подарочный сертификат 🎁(в пдф не действующий код активации, я тебе в лс пришлю)",
    }
  );
}

// === ПРОСТАЯ ОТПРАВКА ГОТОВОГО PDF ===
async function sendPlainPdf(ctx) {
  const pdfPath = path.join(__dirname, "assets", "certificate.pdf");
  if (!fs.existsSync(pdfPath)) {
    return ctx.reply("Файл assets/certificate.pdf не найден 🙈");
  }
  await ctx.replyWithDocument({ source: pdfPath, filename: "certificate.pdf" });
}

// Комплексная отправка двух сертификатов
async function sendCertificates(ctx) {
  await sendPhotoCertificate(ctx); // пришлём картинку
  await sendPlainPdf(ctx); // и PDF-версию
}

// ===== Команды и действия =====
bot.start(async (ctx) => {
  ctx.session.step = 0;
  ctx.session.quiz = getQuestions();
  await showWelcome(ctx);
});

bot.command("menu", async (ctx) => {
  await showMenu(ctx);
});

bot.command("restart", async (ctx) => {
  ctx.session.step = 0;
  ctx.session.quiz = getQuestions();
  await ctx.reply("Начинаем заново!");
  await sendQuestion(ctx);
});

bot.action("menu", async (ctx) => {
  await ctx.answerCbQuery();
  await showMenu(ctx);
});

bot.action("start", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.step = 0;
  ctx.session.quiz = getQuestions();
  await sendQuestion(ctx);
});

bot.action("again", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.step = 0;
  ctx.session.quiz = getQuestions();
  await showWelcome(ctx);
});

bot.action("restart", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.step = 0;
  ctx.session.quiz = getQuestions();
  await ctx.reply("Перезапускаю викторину! 🔄");
  await sendQuestion(ctx);
});

bot.action("certs", async (ctx) => {
  try {
    if (!isAllowed(ctx)) {
      // всплывающее окно
      await ctx.answerCbQuery("Доступ к сертификатам ограничен 💌", {
        show_alert: true,
      });

      // пишем НАПРЯМУЮ пользователю, даже если нет ctx.chat
      const userId = ctx.from.id;
      await ctx.telegram.sendMessage(
        userId,
        "Извини, сертификаты доступны только адресату 💌"
      );

      return; // стоп
    }

    await ctx.answerCbQuery(); // обычный короткий «тик»
    await sendCertificates(ctx); // тут твоя логика отправки
  } catch (e) {
    console.error("certs handler error:", e);
    // мягко сообщим в личку, даже если что-то упало
    const userId = ctx.from?.id === 5057813537;
    if (userId) {
      try {
        await ctx.telegram.sendMessage(
          userId,
          "Упс, что-то пошло не так. Попробуй ещё раз."
        );
      } catch {}
    }
  }
});

// Ответ на варианты: все шутки засчитываются, финальный — строго правильный
bot.action(/^answer:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  // защита от дабл-клика
  if (ctx.session.lock) return;
  ctx.session.lock = true;

  const chosen = Number(ctx.match[1]);
  const step = ctx.session.step ?? 0;
  const correctIndex = ctx.session.correctIndex; // -1 для шуточных
  const list = ctx.session.quiz || [];
  const last = isLastQuestion(ctx);

  // убираем клавиатуру у предыдущего сообщения (если получится)
  try {
    await ctx.editMessageReplyMarkup();
  } catch (_) {}

  // 1) Шуточные вопросы: любой ответ ок
  if (correctIndex === -1) {
    await ctx.reply("Отличный выбор! ✅");
    ctx.session.step = step + 1;
    ctx.session.lock = false;
    return sendQuestion(ctx);
  }

  // 2) Финальный вопрос: требуем точный ответ
  if (chosen === correctIndex) {
    await ctx.reply("Точно! 🐾");
    ctx.session.step = step + 1; // вызовет finish(ctx), т.к. это последний
    ctx.session.lock = false;
    return sendQuestion(ctx);
  } else {
    // неверно на финальном — остаёмся на том же шаге и просим повторить
    if (last) {
      await ctx.reply("Почти! Это не он. Попробуй ещё раз 😊");
      const buttons = (ctx.session.currentOptions || []).map((opt, i) => [
        Markup.button.callback(opt, `answer:${i}`),
      ]);
      ctx.session.lock = false; // разрешаем снова выбрать
      return ctx.reply(
        `Ещё раз:\n\n${list[step]?.q || "Выбери правильный вариант"}`,
        Markup.inlineKeyboard(buttons)
      );
    }

    // (на всякий случай — сюда не попадём, т.к. проверяем только последний)
    const rightText = (ctx.session.currentOptions || [])[correctIndex] ?? "—";
    await ctx.reply(`Почти! Правильный ответ: ${rightText}`);
    ctx.session.step = step + 1;
    ctx.session.lock = false;
    return sendQuestion(ctx);
  }
});

bot.catch((err, ctx) => {
  console.error("Bot error:", err);
  try {
    ctx.reply("Произошла ошибка, попробуйте ещё раз.");
  } catch (_) {}
});

const express = require("express");
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = (process.env.WEBHOOK_URL || "").replace(/\/$/, "");
const HOOK_PATH =
  "/telegram/" + Buffer.from(BOT_TOKEN).toString("hex").slice(0, 12);

(async () => {
  if (WEBHOOK_URL) {
    const app = express();
    app.use(express.json());
    app.post(HOOK_PATH, (req, res) => bot.webhookCallback(HOOK_PATH)(req, res));
    app.get("/", (_, res) => res.send("OK"));
    await bot.telegram.setWebhook(WEBHOOK_URL + HOOK_PATH);
    app.listen(PORT, () =>
      console.log(`Webhook mode: ${WEBHOOK_URL}${HOOK_PATH}`)
    );
  } else {
    await bot.launch();
    console.log("Polling mode: bot launched.");
  }
})();

// Корректное завершение
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
