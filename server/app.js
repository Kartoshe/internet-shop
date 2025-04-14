require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const db = require('./db');
const fs = require('fs');
const path = require('path');

const app = express();



app.use(cors({
    origin: ['http://localhost:5500', 'http://127.0.0.1:5500'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
app.use(cookieParser());
app.use(express.json());


const SECRET_KEY = process.env.SECRET_KEY || 'dev-secret-key';

// Middleware для проверки авторизации
const authenticate = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Не авторизован' });

  try {
    req.user = jwt.verify(token, SECRET_KEY);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Неверный токен' });
  }
};

// Регистрация
app.post('/api/register', async (req, res) => {
  const { email, password, name, phone, address, birth_date, gender } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  
  try {
    const { rows } = await db.query(
      `INSERT INTO users (email, password_hash, name, 
        phone, address, birth_date, gender
        ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, 
         email, name, phone, address, birth_date, gender, created_at`,
      [email, hashedPassword, name, phone || null,
        address || null, birth_date || null, gender || null]
    );

    // Форматируем дату рождения для ответа
    const user = rows[0];
    if (user.birth_date) {
      user.birth_date = new Date(user.birth_date).toISOString().split('T')[0];
    }

    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(400).json({ error: 'Email уже занят' });
  }
});

// Вход
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  
  const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  if (rows.length === 0) {
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }

  const user = rows[0];
  const isPasswordValid = await bcrypt.compare(password, user.password_hash);
  if (!isPasswordValid) {
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }

  const token = jwt.sign({ id: user.id }, SECRET_KEY, { expiresIn: '1h' });
  res.cookie('token', token, { httpOnly: true }).json({ 
    user: { id: user.id, email: user.email, name: user.name } 
  });
});

// Выход
app.post('/api/logout', (req, res) => {
  res.clearCookie('token').json({ message: 'Вы вышли' });
});

// Получение текущего пользователя
app.get('/api/me', authenticate, async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, email, name, phone, address, 
     birth_date, gender, created_at 
     FROM users WHERE id = $1`, 
     [req.user.id]
  );
  res.json(rows[0]);
});

app.get('/api/products', async (req, res) => {
    console.log('Получен запрос с параметрами:', req.query);
    const { category, minPrice, maxPrice, sort, search, limit } = req.query; // Добавили limit
    let query = 'SELECT id, name, price, image_url, rating, category, stock_quantity FROM products WHERE 1=1';
    const params = [];
    
    if (category) {
      query += ' AND category = $1';
      params.push(category);
    }
    
    if (minPrice) {
      query += ` AND price >= $${params.length + 1}`;
      params.push(minPrice);
    }
    
    if (maxPrice) {
      query += ` AND price <= $${params.length + 1}`;
      params.push(maxPrice);
    }
    
    if (search) {
      query += ` AND (name ILIKE $${params.length + 1} OR description ILIKE $${params.length + 1})`;
      params.push(`%${search}%`);
    }
    
    if (sort === 'price_asc') query += ' ORDER BY price ASC';
    if (sort === 'price_desc') query += ' ORDER BY price DESC';
    if (sort === 'rating') query += ' ORDER BY rating DESC';
    if (sort === 'newest') query += ' ORDER BY id DESC';
  
    // Добавляем LIMIT если передан параметр
    if (limit) {
      query += ` LIMIT $${params.length + 1}`;
      params.push(parseInt(limit));
    }
  
    try {
        console.log('Выполняем SQL:', query, 'Параметры:', params); 
        const { rows } = await db.query(query, params);
        console.log('Результат SQL:', rows.length, 'записей'); 
        res.json(rows);
      } catch (err) {
        console.error('Ошибка SQL:', err); 
        res.status(500).json({ error: 'Ошибка сервера' });
      }
});

app.get('/api/products-for-chatbot', async (req, res) => {
  try {
    const { search, limit = 10 } = req.query;
    let query = 'SELECT * FROM products';
    const params = [];

    if (search) {
      query += ' WHERE name ILIKE $1 OR category ILIKE $1';
      params.push(`%${search}%`);
    }

    const limitValue = parseInt(limit, 10);
    if (isNaN(limitValue) || limitValue < 1) {
      return res.status(400).json({ error: 'Некорректное значение параметра limit' });
    }

    query += ' LIMIT $' + (params.length + 1);
    params.push(limitValue);

    const { rows } = await db.query(query, params); // Заменили pool.query на db.query
    res.json(rows);
  } catch (err) {
    console.error('Ошибка при поиске товаров для чат-бота:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Проверка наличия товаров
app.get('/api/products/stock', async (req, res) => {
  const ids = req.query.ids.split(',').map(Number);
  
  try {
    const { rows } = await db.query(
      'SELECT id, name, stock_quantity FROM products WHERE id = ANY($1::int[])',
      [ids]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Полная информация о товаре
app.get('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await db.query('SELECT * FROM products WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Товар не найден' });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


// Создание заказа
app.post('/api/orders', authenticate, async (req, res) => {
  const { items, phone, address, paymentMethod } = req.body;

  try {
    // Начинаем транзакцию
    await db.query('BEGIN');

    // Проверяем наличие товаров и обновляем количество
    for (const item of items) {
      const { rows } = await db.query(
        'SELECT stock_quantity FROM products WHERE id = $1 FOR UPDATE',
        [item.id]
      );
      
      if (rows.length === 0) {
        await db.query('ROLLBACK');
        return res.status(404).json({ error: `Товар с ID ${item.id} не найден` });
      }

      const currentStock = rows[0].stock_quantity;
      if (currentStock < item.quantity) {
        await db.query('ROLLBACK');
        return res.status(400).json({ error: `Недостаточно товара ${item.id} в наличии` });
      }
      
      await db.query(
        'UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2',
        [item.quantity, item.id]
      );
    }
  
    // Подсчет общей суммы
    const productIds = items.map(item => item.id);
    const { rows: products } = await db.query(
      'SELECT id, price FROM products WHERE id = ANY($1::int[])',
      [productIds]
    );
    
    const total = items.reduce((sum, item) => {
      const product = products.find(p => p.id === item.id);
      return sum + (product.price * item.quantity);
    }, 0);
    
    // Создание заказа
    const { rows: order } = await db.query(
      `INSERT INTO orders 
        (user_id, total_price, payment_method, customer_phone, delivery_address) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [req.user.id, total, paymentMethod, phone, address]
    );
    
    // Добавление товаров в заказ
    for (const item of items) {
      await db.query(
        'INSERT INTO order_items (order_id, product_id, quantity) VALUES ($1, $2, $3)',
        [order[0].id, item.id, item.quantity]
      );
    }
    
    // Фиксируем транзакцию
    await db.query('COMMIT');
    res.json(order[0]);
  } catch (err) {
    await db.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Ошибка при создании заказа' });
  }
});

// История заказов пользователя
// История заказов с фильтрами
app.get('/api/orders', authenticate, async (req, res) => {
  try {
    const { status, date_from, date_to } = req.query;
    
    let query = `
      SELECT 
        o.id, 
        o.total_price, 
        o.status, 
        o.created_at,
        o.customer_phone,
        o.delivery_address,
        o.payment_method,
        json_agg(json_build_object(
          'id', p.id,
          'name', p.name, 
          'price', p.price,
          'quantity', oi.quantity,
          'image_url', p.image_url
        )) as items
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON oi.product_id = p.id
      WHERE o.user_id = $1
    `;
    
    const params = [req.user.id];
    let paramIndex = 2;
    
    if (status) {
      query += ` AND o.status = $${paramIndex++}`;
      params.push(status);
    }
    
    if (date_from) {
      query += ` AND o.created_at >= $${paramIndex++}`;
      params.push(date_from);
    }
    
    if (date_to) {
      query += ` AND o.created_at <= $${paramIndex++}`;
      params.push(`${date_to}T23:59:59.999Z`);
    }
    
    query += `
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `;
    
    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Ошибка получения заказов:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Отмена заказа
app.post('/api/orders/:id/cancel', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Проверяем, что заказ принадлежит пользователю
    const { rows } = await db.query(
      'SELECT id FROM orders WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Заказ не найден' });
    }
    
    // Обновляем статус заказа
    await db.query(
      'UPDATE orders SET status = $1 WHERE id = $2',
      ['cancelled', id]
    );
    
    res.json({ message: 'Заказ отменен' });
  } catch (err) {
    console.error('Ошибка отмены заказа:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Категории товаров
app.get('/api/categories', async (req, res) => {
  const { rows } = await db.query('SELECT DISTINCT category FROM products');
  res.json(rows.map(row => row.category));
});

// Статистика трафика
app.get('/api/stats/traffic', authenticate, async (req, res) => {
  try {
      const { period = 'month', page, category } = req.query;
      
      let query = `
          SELECT 
              DATE_TRUNC($1, created_at) as period,
              COUNT(*) as visits
          FROM tracking
          WHERE 1=1
      `;
      const params = [period];
      
      if (page) {
          if (page === '/product.html') {
              query += ` AND event_type = 'product_view'`;
          } else {
              query += ` AND event_type = 'page_view' AND page_url = $2`;
              params.push(page);
          }
      }
      
      if (category && page === '/product.html') {
          query += ` AND category = $${params.length + 1}`;
          params.push(category);
      }
      
      query += ` GROUP BY period ORDER BY period`;
      
      const { rows } = await db.query(query, params);
      res.json(rows);
  } catch (err) {
      console.error('Ошибка получения статистики трафика:', err);
      res.status(500).json({ error: err.message });
  }
});

// Статистика продаж
app.get('/api/stats/sales', authenticate, async (req, res) => {
  try {
      const { period = 'month', category } = req.query;
      
      let query = `
          SELECT 
              DATE_TRUNC($1, o.created_at) as period,
              SUM(o.total_price) as total_sales,
              COUNT(*) as orders_count
          FROM orders o
      `;
      
      const params = [period];
      
      if (category) {
          query += `
              JOIN order_items oi ON o.id = oi.order_id 
              JOIN products p ON p.id = oi.product_id
              WHERE o.status = 'completed' AND p.category = $2
          `;
          params.push(category);
      } else {
          query += ` WHERE o.status = 'completed'`;
      }
      
      query += ` GROUP BY period ORDER BY period`;
      
      const { rows } = await db.query(query, params);
      res.json(rows);
  } catch (err) {
      res.status(500).json({ error: err.message });
  }
});

// Топ товаров
app.get('/api/stats/products', authenticate, async (req, res) => {
  const { limit = 5, days = 30 } = req.query;
  
  try {
    const { rows } = await db.query(
      `SELECT 
        p.id,
        p.name,
        SUM(oi.quantity) as total_sold,
        SUM(oi.quantity * p.price) as total_revenue
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      JOIN orders o ON o.id = oi.order_id
      WHERE o.created_at >= NOW() - INTERVAL '$$1 days'
      GROUP BY p.id
      ORDER BY total_sold DESC
      LIMIT $2`,
      [days, limit]
    );
    
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Трекинг событий
app.post('/api/track', async (req, res) => {
  try {
      if (!req.body) {
          console.error('Ошибка: req.body is undefined');
          return res.status(400).json({ error: 'Тело запроса отсутствует' });
      }

      const { type, productId, category, pageUrl } = req.body;
      const userAgent = req.get('User-Agent');
      const userId = req.cookies.user_id || null;
      
      console.log(`Трекинг: type=${type}, productId=${productId}, category=${category}, pageUrl=${pageUrl}, userId=${userId}`);

      await db.query(
          `INSERT INTO tracking 
              (user_id, event_type, product_id, category, page_url, user_agent)
              VALUES ($1, $2, $3, $4, $5, $6)`,
          [userId, type, productId || null, category || null, pageUrl || null, userAgent]
      );
      
      const logEntry = `${new Date().toISOString()} | ${type} | User: ${userId || 'anonymous'} | Product: ${productId || 'N/A'} | Category: ${category || 'N/A'} | Page: ${pageUrl || 'N/A'} | UA: ${userAgent}\n`;
      fs.appendFileSync(path.join(__dirname, 'tracking.log'), logEntry);
      
      res.status(200).end();
  } catch (err) {
      console.error('Ошибка трекинга:', err);
      res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.use(express.static('../client'));

app.listen(3000, () => console.log('Сервер запущен на порту 3000'));