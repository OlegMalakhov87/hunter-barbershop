const jwt = require("jsonwebtoken");
const { timingSafeEqual, createHash, randomUUID } = require("node:crypto");
const { verifyPassword } = require("../services/passwordService");
const { HttpError } = require("../utils/http");

const lifetimeSeconds = 3600;
const issuer = "hunter";
const audience = "hunter-admin";
// Реестр содержит только случайные идентификаторы. Перезапуск закрывает все сеансы.
const sessions = new Map();
let activeVerifications = 0;
const maxConcurrentVerifications = 2;

/** Сравнивает значения фиксированной длины без раннего выхода по символам пароля. */
function safeEqual(left, right) {
  const digest = (value) => createHash("sha256").update(String(value)).digest();
  return timingSafeEqual(digest(left), digest(right));
}

function removeExpiredSessions() {
  for (const [id, expiresAt] of sessions) {
    if (expiresAt <= Date.now()) sessions.delete(id);
  }
}

/** Выдаёт ограниченный по времени JWT и регистрирует сеанс одного администратора. */
async function issueToken(login, password) {
  if (typeof login !== "string" || typeof password !== "string") return null;
  // Ограничиваем расход памяти scrypt без очереди, которая могла бы расти бесконечно.
  if (activeVerifications >= maxConcurrentVerifications)
    throw new HttpError(503, "Сейчас проверяются другие входы. Повторите через несколько секунд.");
  let passwordMatches;
  activeVerifications++;
  try {
    // Выполняем ту же проверку и для неверного логина, чтобы не раскрывать его по задержке.
    passwordMatches = await verifyPassword(password, process.env.ADMIN_PASSWORD_HASH);
  } finally {
    activeVerifications--;
  }
  if (!safeEqual(login, process.env.ADMIN_LOGIN) || !passwordMatches) return null;
  removeExpiredSessions();
  // Ограничение защищает память и закрывает самые старые сеансы при большом числе вкладок.
  if (sessions.size >= 10) sessions.delete(sessions.keys().next().value);
  const id = randomUUID();
  const token = jwt.sign({ role: "admin" }, process.env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: lifetimeSeconds,
    issuer,
    audience,
    subject: "admin",
    jwtid: id,
  });
  sessions.set(id, Date.now() + lifetimeSeconds * 1000);
  return token;
}

/** Проверяет подпись, назначение, срок и наличие действующего сеанса. */
function requireAdmin(req, res, next) {
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(
    req.get("Authorization") || "",
  );
  if (!match || match[1].length > 4096)
    return res.status(401).json({ error: "Требуется вход в панель." });
  try {
    const payload = jwt.verify(match[1], process.env.JWT_SECRET, {
      algorithms: ["HS256"],
      issuer,
      audience,
      subject: "admin",
    });
    removeExpiredSessions();
    if (payload.role !== "admin" || typeof payload.jti !== "string" || !sessions.has(payload.jti)) {
      throw Error("Сеанс закрыт");
    }
    req.adminSession = payload;
    return next();
  } catch {
    return res.status(401).json({ error: "Сеанс истёк. Войдите снова." });
  }
}

/** Делает использованный при выходе токен недействительным до истечения его срока. */
function revokeSession(req) {
  sessions.delete(req.adminSession.jti);
}

module.exports = { issueToken, requireAdmin, revokeSession };
