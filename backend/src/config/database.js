const mysql = require('mysql2/promise');

const required = ['DB_HOST4', 'DB_USER4', 'DB_PASSWORD4', 'DB4'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Falta la variable de entorno ${key}.`);
}

const pool = mysql.createPool({
  host: process.env.DB_HOST4,
  user: process.env.DB_USER4,
  password: process.env.DB_PASSWORD4,
  database: process.env.DB4,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 8),
  timezone: '-05:00',
  charset: 'utf8mb4_unicode_ci',
});

module.exports = { pool };
