const fs = require('fs');
const path = require('path');

const logDirectory = path.resolve(__dirname, '..', '..', 'logs');
const logFile = path.join(logDirectory, 'backend.log');

function serializeError(error) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

function write(level, event, context = {}) {
  const record = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...context });
  const output = level === 'error' ? console.error : console.log;
  output(record);
  try {
    fs.mkdirSync(logDirectory, { recursive: true });
    fs.appendFileSync(logFile, `${record}\n`, 'utf8');
  } catch (loggingError) {
    console.error('No fue posible escribir el registro local.', loggingError);
  }
}

const info = (event, context) => write('info', event, context);
const error = (event, cause, context) => write('error', event, { ...context, error: serializeError(cause) });

module.exports = { info, error, logFile };
