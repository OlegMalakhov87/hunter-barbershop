require("./runtime").assertNodeVersion();
const path = require("node:path");
const { isPasswordHash } = require("../services/passwordService");

const projectDirectory = path.resolve(__dirname, "../..");
require("dotenv").config({ path: path.join(projectDirectory, ".env") });

/** Проверяет настройки запуска, не раскрывая значения секретов в ошибках. */
function loadEnvironment() {
  const required = ["SITE_URL", "ADMIN_LOGIN", "ADMIN_PASSWORD_HASH", "JWT_SECRET"];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) throw Error("Заполните .env: " + missing.join(", "));
  if (process.env.ADMIN_LOGIN.length < 6 || process.env.ADMIN_LOGIN.length > 100) {
    throw Error("ADMIN_LOGIN: от 6 до 100 символов.");
  }
  if (!isPasswordHash(process.env.ADMIN_PASSWORD_HASH))
    throw Error("ADMIN_PASSWORD_HASH: неверный формат. Выполните npm run admin:password.");
  if (process.env.JWT_SECRET.length < 32) throw Error("JWT_SECRET: минимум 32 символа.");
  let siteUrl;
  try {
    siteUrl = new URL(process.env.SITE_URL);
  } catch {
    throw Error("SITE_URL: укажите корректный http/https-адрес.");
  }
  if (
    !["http:", "https:"].includes(siteUrl.protocol) ||
    siteUrl.username ||
    siteUrl.password ||
    siteUrl.pathname !== "/" ||
    siteUrl.search ||
    siteUrl.hash
  ) {
    throw Error("SITE_URL должен содержать только http/https и адрес сайта, без пути и пароля.");
  }
  const port = Number(process.env.PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw Error("PORT: число от 1 до 65535.");
  const proxy = process.env.TRUST_PROXY || "false";
  if (!["false", "true", "loopback"].includes(proxy)) {
    throw Error("TRUST_PROXY: false или loopback (true также означает loopback).");
  }
  return {
    siteUrl,
    port,
    host: process.env.HOST || "127.0.0.1",
    trustProxy: proxy === "false" ? false : "loopback",
    publicDirectory: path.join(projectDirectory, "client/public"),
    pagesDirectory: path.join(projectDirectory, "client/pages"),
  };
}

module.exports = loadEnvironment();
