/** Пишет события без паролей, токенов, содержимого форм и текстов SQL. */
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
  ]) {
    if (fields[key] !== undefined) record[key] = fields[key];
  }
  console.log(JSON.stringify(record));
}

module.exports = { logEvent };
