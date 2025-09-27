// Телеграм-бот: шуточная викторина для учителя русского/литературы.
// Особенности:
// - Все шуточные вопросы без подсчёта баллов (любой вариант ок).
// - Финальный вопрос про кота (проверяется по CAT_NAME).
// - Меню и команды: /start, /menu, /restart.
// - В конце можно отправить два сертификата: фото (из ./assets) и PDF (генерация pdfkit).

const { Telegraf, Markup, session } = require("telegraf");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
require("dotenv").config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const TEACHER_NAME = process.env.TEACHER_NAME || "Наш любимый учитель";
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

// Команды в меню Telegram
bot.telegram.setMyCommands([
  { command: "start", description: "Начать" },
  { command: "menu", description: "Меню" },
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
    q: `И наконец: как зовут кота Ангелины?`,
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

async function showWelcome(ctx) {
  await ctx.reply(
    `Ангелина, Вы любите розы!? Сегодня — не просто день, а повод устроить лёгкую литературную шалость.
Тема: ${subject}.
В конце — главный вопрос про ... Готова?`,
    Markup.inlineKeyboard([[Markup.button.callback("Старт", "start")]])
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
    `Спасибо за то, что учишь видеть смысл между строк, любить книги и спорить культурно — даже с сериалами 🙂`,
    `Как писал Маяковский: «Если звёзды зажигают — значит — это кому-нибудь нужно».`,
    `Пусть уроки вдохновляют и на них загораются глаза, а ${CAT_NAME} мурлычет рядом и ест с тобой мороженое))`,
    `Тепла, вдохновения и счастливых учеников!`,
    getToast(),
  ].join("\n");

  await ctx.reply(
    lines,
    Markup.inlineKeyboard([
      [Markup.button.callback("Показать сертификаты", "certs")],
      [Markup.button.callback("Старт", "start")],
      [Markup.button.callback("Приветствие", "again")],
      [Markup.button.callback("Меню", "menu")],
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
    { caption: "Подарочный сертификат 🎁" }
  );
}

// 2) PDF-сертификат: если есть картинка — делаем из неё полный лист A4; иначе — текстовый PDF
async function sendPdfCertificate(ctx) {
  const imgPath = ["certificate.jpg", "certificate.jpeg", "certificate.png"]
    .map((n) => path.join(__dirname, "assets", n))
    .find((p) => fs.existsSync(p));

  const outPath = path.join(__dirname, "certificate.pdf");

  await new Promise((resolve, reject) => {
    // Если есть изображение — делаем PDF-страницу с ним целиком.
    if (imgPath) {
      const doc = new PDFDocument({ size: "A4", margin: 0 });
      const stream = fs.createWriteStream(outPath);
      doc.pipe(stream);
      const pageW = doc.page.width;
      const pageH = doc.page.height;
      doc.image(imgPath, 0, 0, { fit: [pageW, pageH] });

      // Небольшая подпись внизу (можно удалить)
      const today = new Date().toLocaleDateString("ru-RU");
      doc
        .fillColor("#4b2b4f")
        .fontSize(10)
        .text(`Для: ${TEACHER_NAME} · Дата: ${today}`, 20, pageH - 30);

      doc.end();
      stream.on("finish", resolve);
      stream.on("error", reject);
      return;
    }

    // Фолбэк: аккуратный текстовый PDF
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);
    doc.fontSize(28).text("СЕРТИФИКАТ ПРИЗНАТЕЛЬНОСТИ", { align: "center" });
    doc.moveDown(1);
    doc.fontSize(14).text(`Вручается ${TEACHER_NAME}`, { align: "center" });
    doc.moveDown(0.5);
    doc.text(
      `За вдохновение на уроках русского языка и литературы, ` +
        `за любовь к чтению и умение разговаривать с эпохой через сериалы.`,
      { align: "center" }
    );
    doc.moveDown(1);
    doc.text(
      `Пусть кот по имени «${CAT_NAME}» всегда поддерживает атмосферу уюта и тепла.`,
      { align: "center", oblique: true }
    );
    doc.moveDown(2);
    const today = new Date().toLocaleDateString("ru-RU");
    doc.text(`Дата: ${today}`, { align: "right" });
    doc.moveDown(1);
    doc.text("Подпись: ____________________", { align: "right" });
    doc.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  await ctx.replyWithDocument(
    { source: outPath, filename: "certificate.pdf" },
    { caption: "Сертификат (PDF)" }
  );
}

// Комплексная отправка двух сертификатов
async function sendCertificates(ctx) {
  await sendPhotoCertificate(ctx); // пришлём картинку
  await sendPdfCertificate(ctx); // и PDF-версию
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

bot.action("certs", async (ctx) => {
  await ctx.answerCbQuery();
  await sendCertificates(ctx);
});

// Ответ на варианты
bot.action(/^answer:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (ctx.session.lock) return;
  ctx.session.lock = true;

  const chosen = Number(ctx.match[1]);
  const step = ctx.session.step ?? 0;
  const correctIndex = ctx.session.correctIndex;

  try {
    await ctx.editMessageReplyMarkup();
  } catch (_) {}

  // all-correct вопрос
  if (correctIndex === -1) {
    await ctx.reply("Отличный выбор! ✅");
  } else if (chosen === correctIndex) {
    // финальный вопрос про кота — «верно»
    await ctx.reply("Точно! 🐾");
  } else {
    const rightText = (ctx.session.currentOptions || [])[correctIndex] ?? "—";
    await ctx.reply(`Почти! Правильный ответ: ${rightText}`);
  }

  ctx.session.step = step + 1;
  await sendQuestion(ctx);
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
