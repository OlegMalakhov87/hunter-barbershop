/** Пишет события без паролей, токенов, содержимого форм и текстов SQL.
 * @param {string} event - название события.
 * @param {Object} [fields] - дополнительные поля события.
 * @returns {void}
 */
function logEvent(event, fields = {}) {
  const record = { time: new Date().toISOString(), event };
  for (const key of [
    "requestId",
    "method",
    "route",
    "status",
    "errorName",
    "errorCode",
    "host",
    "port",
    "actor",
    "reviewId",
  ]) {
    if (fields[key] !== undefined) record[key] = fields[key];
  }
  console.log(JSON.stringify(record));
}

module.exports = { logEvent };
