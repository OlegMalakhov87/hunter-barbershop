const { randomBytes, scrypt, timingSafeEqual } = require("node:crypto");
const { promisify } = require("node:util");

/**
 * @file passwordService.js
 * @description Сервис для работы с паролями.
 */

const deriveKey = promisify(scrypt);
// Рекомендованный OWASP вариант scrypt для ограниченной памяти: около 32 МиБ на проверку.
const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const prefix = `scrypt$${options.N}$${options.r}$${options.p}$`;
const keyLength = 64;

/** Разбирает только наш формат, не принимая произвольную дороговизну вычислений из строки.
 * @param {string} value - строка с хешем пароля.
 * @returns {{salt: Buffer, key: Buffer}|null} - соль и хеш или null, если формат не подходит.
 */
function parsePasswordHash(value) {
  if (typeof value !== "string" || !value.startsWith(prefix)) return null;
  const parts = value.slice(prefix.length).split("$");
  if (parts.length !== 2 || !/^[a-f0-9]{32}$/.test(parts[0]) || !/^[a-f0-9]{128}$/.test(parts[1])) {
    return null;
  }
  return { salt: Buffer.from(parts[0], "hex"), key: Buffer.from(parts[1], "hex") };
}

/** Проверяет формат настройки без вычисления хеша и без раскрытия её значения.
 * @param {string} value - строка с хешем пароля.
 * @returns {boolean} - true, если формат подходит, иначе false.
 */
function isPasswordHash(value) {
  return Boolean(parsePasswordHash(value));
}

/**
 * Создаёт стойкий хеш с новой случайной солью для каждого пароля.
 * @param {string} password Пароль длиной 12–100 символов; пробелы сохраняются.
 * @returns {Promise<string>} Алгоритм, параметры, соль и хеш в одной строке.
 */
async function hashPassword(password) {
  if (typeof password !== "string" || password.length < 12 || password.length > 100) {
    throw Error("Пароль должен содержать от 12 до 100 символов.");
  }
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt, keyLength, options);
  return prefix + salt.toString("hex") + "$" + key.toString("hex");
}

/** Сверяет введённый пароль с сохранённым хешем, не сохраняя сам пароль.
 * @param {string} password - введённый пароль.
 * @param {string} encodedHash - сохранённый хеш пароля.
 * @returns {Promise<boolean>} - true, если пароль верен, иначе false.
 */
async function verifyPassword(password, encodedHash) {
  const stored = parsePasswordHash(encodedHash);
  if (!stored || typeof password !== "string" || password.length < 12 || password.length > 100) {
    return false;
  }
  const key = await deriveKey(password, stored.salt, keyLength, options);
  return timingSafeEqual(key, stored.key);
}

module.exports = { hashPassword, verifyPassword, isPasswordHash };
