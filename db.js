const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'postgres', 
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'internet_shop',
  password: process.env.DB_PASSWORD || 'pas123',
  port: process.env.DB_PORT || 5432,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false 
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};