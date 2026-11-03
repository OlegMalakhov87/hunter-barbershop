const { body, param, validationResult } = require("express-validator");
const { CONTACT_LINK_FIELDS, normalizeContact } = require("../config/links");
const { normalizePhone } = require("../config/phone");

/** Удаляет угловые скобки и управляющие символы; вывод отдельно экранируется. */
const clean = (value) =>
  typeof value === "string" ? value.replace(/[<>\u0000-\u001f\u007f]/g, "") : value;

/** Проверяет, что строка не содержит HTML-тегов */
const text = (field, min, max) =>
  body(field)
    .isString()
    .withMessage("Неверный тип данных.")
    .bail()
    .trim()
    .customSanitizer(clean)
    .isLength({ min, max })
    .withMessage(`Допустимая длина: ${min}–${max} символов.`);

/** Проверяет, что строка не содержит HTML-тегов и является необязательной */
const optionalText = (field, max) =>
  body(field)
    .optional()
    .isString()
    .withMessage("Неверный тип данных.")
    .bail()
    .trim()
    .customSanitizer(clean)
    .isLength({ max })
    .withMessage(`Не более ${max} символов.`);

/** Проверяет, что параметр пути является числом и преобразует его в число */
const pathId = param("id")
  .isInt({ min: 1, max: 2147483647 })
  .withMessage("Неверный идентификатор.")
  .toInt();

/** Проверяет, что значение является булевым и преобразует его в булево значение */
const active = body("isActive")
  .custom((value) => typeof value === "boolean")
  .withMessage("Неверное значение активности.");

/** Проверяет, что строка не содержит HTML-тегов */
const noHtml = (value) => !/[<>]/.test(value);

/** Проверяет результаты валидации и возвращает ошибку, если есть */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: errors.array({ onlyFirstError: true })[0].msg,
    });
  }
  next();
};

/** Правила валидации для услуг */
const serviceRules = [
  text("name", 2, 100),
  text("category", 2, 50),
  optionalText("description", 500),
  ...["barberPrice", "topBarberPrice"].map((field) =>
    body(field)
      .custom(
        (value) =>
          value === null ||
          value === undefined ||
          (Number.isInteger(value) && value >= 0 && value <= 100000),
      )
      .withMessage("Цена должна быть целым числом от 0 до 100 000 ₽ или оставаться пустой."),
  ),
  body("isPopular")
    .custom((value) => typeof value === "boolean")
    .withMessage("Неверное значение популярности."),
  active,
];

/** Правила валидации для мастеров */
const masterRules = [
  text("name", 2, 80),
  text("role", 2, 80),
  optionalText("description", 500),
  body("photo")
    .optional()
    .isString()
    .bail()
    .trim()
    .custom(
      (value) => !value || /^\/images\/[a-zA-Z0-9/_-]+\.(?:jpg|jpeg|png|webp|avif)$/.test(value),
    )
    .withMessage("Фото должно быть локальным файлом в /images."),
  active,
];

/** Правила валидации для логина администратора */
const loginRules = [
  body("login")
    .isString()
    .bail()
    .trim()
    .isLength({ min: 6, max: 100 })
    .custom(noHtml)
    .withMessage("Проверьте логин."),
  body("password")
    .isString()
    .bail()
    .isLength({ min: 12, max: 100 })
    .withMessage("Проверьте пароль."),
];

/** Правила для публичной формы отзыва. */
const reviewRules = [
  text("name", 2, 80),
  body("rating")
    .custom((value) => Number.isInteger(value) && value >= 1 && value <= 5)
    .withMessage("Выберите оценку от 1 до 5."),
  text("text", 20, 1000),
  body("privacyAcknowledged")
    .custom((value) => value === true)
    .withMessage("Подтвердите ознакомление с политикой."),
  body("processingConsent")
    .custom((value) => value === true)
    .withMessage("Подтвердите согласие на обработку данных."),
  body("publicationConsent")
    .custom((value) => value === true)
    .withMessage("Подтвердите отдельное согласие на публикацию."),
  body("publishName")
    .optional()
    .custom((value) => typeof value === "boolean")
    .withMessage("Неверный выбор публикации имени."),
  ...["privacy", "processing", "publication"].map((kind) =>
    body("versions." + kind)
      .isString()
      .bail()
      .matches(/^[a-f0-9]{64}$/)
      .withMessage("Обновите документы перед отправкой отзыва."),
  ),
];

const contactRules = [
  body("phone")
    .isString()
    .withMessage("Укажите номер телефона строкой.")
    .bail()
    .trim()
    .custom((value) => Boolean(normalizePhone(value)))
    .withMessage("Укажите телефон целиком, например +7 (900) 222-55-66.")
    .bail()
    .customSanitizer(normalizePhone),
  ...CONTACT_LINK_FIELDS.map((field) => {
    let rule = body(field);
    // Старая открытая вкладка админки может ещё не передавать два новых поля.
    if (["maxUrl", "instagramUrl"].includes(field)) rule = rule.optional();
    return rule
      .isString()
      .withMessage("Передайте адрес строкой.")
      .bail()
      .trim()
      .isLength({ max: 2048 })
      .withMessage("Ссылка слишком длинная.")
      .bail()
      .custom((value) => !value || Boolean(normalizeContact(field, value)))
      .withMessage("Укажите допустимую HTTPS-ссылку для выбранного сервиса.");
  }),
];

/** Одинаковые правила текста политики и двух согласий. HTML хранится только как текст. */
const legalText = body("text")
  .isString()
  .withMessage("Текст документа должен быть строкой.")
  .bail()
  .customSanitizer((value) => value.replace(/\r\n?/g, "\n").trim())
  .isLength({ min: 30, max: 12000 })
  .withMessage("Текст должен содержать от 30 до 12 000 символов.")
  .bail()
  .custom((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))
  .withMessage("Текст содержит недопустимые управляющие символы.");
const consentKind = param("kind")
  .isIn(["processing", "publication"])
  .withMessage("Неизвестный документ.");
const reviewStatus = body("status")
  .isString()
  .bail()
  .isIn(["pending", "approved", "rejected"])
  .withMessage("Неверный статус.");

/** Проверяет поля и в JSON, и в строке запроса при загрузке файла. */
function photoRules(source) {
  return [
    source("category")
      .isString()
      .bail()
      .isIn(["work", "atmosphere"])
      .withMessage("Неверный раздел."),
    source("caption")
      .optional()
      .isString()
      .withMessage("Подпись должна быть строкой.")
      .bail()
      .trim()
      .customSanitizer(clean)
      .isLength({ max: 160 })
      .custom((value) => value.length === 0 || value.length >= 3)
      .withMessage("Подпись должна быть пустой или содержать от 3 до 160 символов."),
  ];
}

module.exports = {
  serviceRules,
  masterRules,
  loginRules,
  reviewRules,
  pathId,
  validate,
  contactRules,
  legalText,
  consentKind,
  reviewStatus,
  photoRules,
};
