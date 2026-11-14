const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const readline = require("node:readline");
const { Writable } = require("node:stream");
const dotenv = require("dotenv");
const { assertNodeVersion } = require("../config/runtime");
const { hashPassword, isPasswordHash } = require("../services/passwordService");

const envPath = path.resolve(__dirname, "../../.env");

/** Спрашивает пароль в терминале без вывода символов.
 * @param {string} question - вопрос, который будет выведен перед вводом.
 * @returns {Promise<string>} - введённый пароль.
 * @throws {Error} - если ввод отменён или терминал не поддерживает скрытый ввод.
 */
function readHidden(question) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw Error("Откройте обычный терминал и выполните npm run admin:password.");
  }
  const silentOutput = new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  });
  silentOutput.isTTY = true;
  silentOutput.columns = process.stdout.columns || 80;

  const input = readline.createInterface({
    input: process.stdin,
    output: silentOutput,
    terminal: true,
  });

  process.stdout.write(question);

  return new Promise((resolve, reject) => {
    let answered = false;
    input.once("SIGINT", () => input.close());
    input.once("close", () => {
      process.stdout.write("\n");
      if (!answered) reject(Error("Ввод отменён. Настройки не изменены."));
    });
    input.question("", (answer) => {
      answered = true;
      input.close();
      resolve(answer);
    });
  });
}

/** Атомарно сохраняет хеш в .env.
 * @param {string} encodedHash - хеш пароля.
 * @param {string} [file] - путь к файлу .env.
 * @throws {Error} - если формат хеша неверный или не удалось безопасно обновить .env.
 */
async function savePasswordHash(encodedHash, file = envPath) {
  if (!isPasswordHash(encodedHash)) throw Error("Неверный формат хеша пароля.");

  const source = await fs.readFile(file, "utf8");
  const lineEnding = source.includes("\r\n") ? "\r\n" : "\n";

  // Удаляем старую строку с хешем, если она есть
  const lines = source.replace(
    /^[\t ]*(?:export[\t ]+)?ADMIN_PASSWORD(?:_HASH)?[\t ]*=[\t ]*(?:"(?:\\"|[^"])*"|'(?:\\'|[^'])*'|`(?:\\`|[^`])*`|[^#\r\n]*)(?:[\t ]*#[^\r\n]*)?(?:\r?\n|$)/gm,
    "",
  );

  // Добавляем новую строку
  const next =
    lines.replace(/(?:\r?\n)*$/, "") +
    lineEnding +
    "ADMIN_PASSWORD_HASH='" +
    encodedHash +
    "'" +
    lineEnding;

  // Проверяем, что остальные настройки не были затронуты
  const before = dotenv.parse(source);
  const after = dotenv.parse(next);

  if (
    Object.keys(before).some(
      (key) =>
        !["ADMIN_PASSWORD", "ADMIN_PASSWORD_HASH"].includes(key) && after[key] !== before[key],
    )
  ) {
    throw Error("Не удалось безопасно обновить .env. Проверьте формат строк с паролем.");
  }

  // Атомарная запись
  const temporary = path.join(path.dirname(file), ".env.password-" + randomUUID() + ".tmp");
  try {
    await fs.writeFile(temporary, next, { flag: "wx", mode: 0o600 });
    await fs.rename(temporary, file);
  } finally {
    await fs.unlink(temporary).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

/** Основная функция скрипта. */
async function main() {
  assertNodeVersion();
  const args = process.argv.slice(2);
  if (args.length) throw Error("Используйте npm run admin:password");

  const password = await readHidden("Новый пароль (12–100 символов, ввод скрыт): ");
  const confirmation = await readHidden("Повторите пароль: ");

  if (password !== confirmation) throw Error("Пароли не совпадают. Настройки не изменены.");

  await savePasswordHash(await hashPassword(password));
  console.log("Хеш пароля сохранён в .env. Перезапустите сервер.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      error.code === "ENOENT" ? "Сначала создайте .env из .env.example." : error.message,
    );
    process.exitCode = 1;
  });
}

module.exports = { savePasswordHash };
