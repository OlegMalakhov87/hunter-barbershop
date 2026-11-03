/** Останавливает запуск до загрузки SQLite и Sharp при неподдерживаемой версии Node.js. */
function assertNodeVersion(version = process.versions.node) {
  if (!/^24\.\d+\.\d+$/.test(version)) {
    throw Error(
      `Для Hunter нужна Node.js 24.x. Сейчас используется ${version}. Выберите Node.js 24 (в WSL: nvm use 24) и повторите команду.`,
    );
  }
}

if (require.main === module) {
  try {
    assertNodeVersion();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { assertNodeVersion };
