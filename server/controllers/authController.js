const { issueToken, revokeSession } = require("../middleware/auth");
const { logEvent } = require("../services/logger");

/** Авторизация пользователя */
async function login(req, res) {
  const token = await issueToken(req.body.login, req.body.password);
  logEvent(token ? "auth.login_success" : "auth.login_failed", { requestId: res.locals.requestId });
  if (!token) return res.status(401).json({ error: "Неверный логин или пароль." });
  return res.json({ token });
}

/** Выход пользователя */
function logout(req, res) {
  revokeSession(req);
  logEvent("auth.logout", { requestId: res.locals.requestId });
  res.json({ loggedOut: true });
}

module.exports = { login, logout };
