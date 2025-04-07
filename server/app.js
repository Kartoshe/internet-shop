require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const db = require('./db');

const app = express();
app.use(cors({
    origin: ['http://localhost:5500', 'http://127.0.0.1:5500', 'null'],
    credentials: true
  }));
app.use(cookieParser());
app.use(express.json());
app.use(express.static('../client'));

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
  const { email, password, name } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  
  try {
    const { rows } = await db.query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name',
      [email, hashedPassword, name]
    );
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
    'SELECT id, email, name FROM users WHERE id = $1', 
    [req.user.id]
  );
  res.json(rows[0]);
});

app.get('/api/products', async (req, res) => {
    console.log('Получен запрос с параметрами:', req.query);
    const { category, minPrice, maxPrice, sort, search, limit } = req.query; // Добавили limit
    let query = 'SELECT id, name, price, image_url, rating, category FROM products WHERE 1=1';
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
        console.log('Выполняем SQL:', query, 'Параметры:', params); // Добавьте это
        const { rows } = await db.query(query, params);
        console.log('Результат SQL:', rows.length, 'записей'); // Добавьте это
        res.json(rows);
      } catch (err) {
        console.error('Ошибка SQL:', err); // Добавьте это
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
  const { items } = req.body;
  
  try {
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
      'INSERT INTO orders (user_id, total_price) VALUES ($1, $2) RETURNING *',
      [req.user.id, total]
    );
    
    // Добавление товаров в заказ
    for (const item of items) {
      await db.query(
        'INSERT INTO order_items (order_id, product_id, quantity) VALUES ($1, $2, $3)',
        [order[0].id, item.id, item.quantity]
      );
    }
    
    res.json(order[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при создании заказа' });
  }
});

// История заказов пользователя
app.get('/api/orders', authenticate, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT o.id, o.total_price, o.status, o.created_at, 
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
       GROUP BY o.id
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Категории товаров
app.get('/api/categories', async (req, res) => {
  const { rows } = await db.query('SELECT DISTINCT category FROM products');
  res.json(rows.map(row => row.category));
});

app.listen(3000, () => console.log('Сервер запущен на порту 3000'));