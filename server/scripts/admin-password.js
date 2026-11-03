const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const readline = require("node:readline");
const { Writable } = require("node:stream");
const dotenv = require("dotenv");
const { assertNodeVersion } = require("../config/runtime");
const { hashPassword, verifyPassword, isPasswordHash } = require("../services/passwordService");

const envPath = path.resolve(__dirname, "../../.env");

/** Спрашивает пароль в терминале без вывода символов и без записи в историю команд. */
function readHidden(question) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw Error(
      "Откройте обычный терминал и выполните npm run admin:password без передачи пароля в команду.",
    );
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

/**
 * Атомарно сохраняет хеш и удаляет старую переменную с открытым паролем.
 * Остальные строки .env, включая комментарии и другие секреты, сохраняются.
 * @param {string} encodedHash Проверенный хеш нового или прежнего пароля.
 * @param {string} file Путь к .env; в тестах используется временный файл.
 * @param {string} [expectedSource] Исходный текст для проверки параллельных правок.
 */
async function savePasswordHash(encodedHash, file = envPath, expectedSource) {
  if (!isPasswordHash(encodedHash)) throw Error("Неверный формат хеша пароля.");
  const source = await fs.readFile(file, "utf8");
  if (expectedSource !== undefined && source !== expectedSource)
    throw Error("Файл .env изменился. Повторите команду.");
  const lineEnding = source.includes("\r\n") ? "\r\n" : "\n";
  // Многострочный пароль тоже удаляется целиком; остальные настройки не перезаписываются.
  const lines = source.replace(
    /^[\t ]*(?:export[\t ]+)?ADMIN_PASSWORD(?:_HASH)?[\t ]*=[\t ]*(?:"(?:\\"|[^"])*"|'(?:\\'|[^'])*'|`(?:\\`|[^`])*`|[^#\r\n]*)(?:[\t ]*#[^\r\n]*)?(?:\r?\n|$)/gm,
    "",
  );
  const next =
    lines.replace(/(?:\r?\n)*$/, "") +
    lineEnding +
    "ADMIN_PASSWORD_HASH='" +
    encodedHash +
    "'" +
    lineEnding;
  const before = dotenv.parse(source);
  const after = dotenv.parse(next);
  if (
    Object.hasOwn(after, "ADMIN_PASSWORD") ||
    after.ADMIN_PASSWORD_HASH !== encodedHash ||
    Object.keys(before).some(
      (key) =>
        !["ADMIN_PASSWORD", "ADMIN_PASSWORD_HASH"].includes(key) && after[key] !== before[key],
    )
  ) {
    throw Error("Не удалось безопасно обновить .env. Проверьте формат строк с паролем.");
  }
  // Имя .env.* исключено из Git даже при аварийной остановке до переименования.
  const temporary = path.join(path.dirname(file), ".env.password-" + randomUUID() + ".tmp");
  try {
    await fs.writeFile(temporary, next, { flag: "wx", mode: 0o600 });
    // Не затираем правки, сделанные в редакторе во время вычисления хеша.
    if ((await fs.readFile(file, "utf8")) !== source)
      throw Error("Файл .env изменился. Повторите команду.");
    await fs.rename(temporary, file);
  } finally {
    await fs.unlink(temporary).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

/** Разово переводит существующий пароль в хеш, сохраняя прежние данные для входа. */
async function migratePassword(file = envPath) {
  const source = await fs.readFile(file, "utf8");
  const settings = dotenv.parse(source);
  const password = settings.ADMIN_PASSWORD;
  if (password === undefined) {
    if (isPasswordHash(settings.ADMIN_PASSWORD_HASH)) return false;
    throw Error("Пароль не настроен. Выполните npm run admin:password.");
  }
  if (settings.ADMIN_PASSWORD_HASH) {
    if (!(await verifyPassword(password, settings.ADMIN_PASSWORD_HASH))) {
      throw Error(
        "В .env указаны разные варианты пароля. Задайте пароль через npm run admin:password.",
      );
    }
    await savePasswordHash(settings.ADMIN_PASSWORD_HASH, file, source);
  } else {
    await savePasswordHash(await hashPassword(password), file, source);
  }
  return true;
}

async function main() {
  assertNodeVersion();
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--migrate") {
    const changed = await migratePassword();
    console.log(
      changed
        ? "Пароль переведён в хеш. Данные для входа сохранены. Перезапустите сервер."
        : "В .env уже хранится хеш пароля.",
    );
    return;
  }
  if (args.length)
    throw Error("Используйте npm run admin:password или npm run admin:password -- --migrate.");
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

module.exports = { savePasswordHash, migratePassword };
