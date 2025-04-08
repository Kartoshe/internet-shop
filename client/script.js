// Общие функции
let currentUser = null;
let cartItems = JSON.parse(localStorage.getItem('cart')) || [];

// Проверка авторизации
async function checkAuth() {
  try {
    const response = await fetch('http://localhost:3000/api/me', {
      credentials: 'include'
    });
    
    if (response.ok) {
      currentUser = await response.json();
      return true;
    } else {
      currentUser = null;
      return false;
    }
  } catch (err) {
    console.error('Ошибка проверки авторизации:', err);
    return false;
  }
}

// Выход
async function logout() {
  try {
    await fetch('http://localhost:3000/api/logout', {
      method: 'POST',
      credentials: 'include'
    });
    localStorage.removeItem('cart');
    window.location.href = 'login.html';
  } catch (err) {
    console.error('Ошибка выхода:', err);
  }
}

// Добавление товара в корзину
function addToCart(productId, quantity = 1) {
  const existingItem = cartItems.find(item => item.id === productId);
  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    cartItems.push({ id: productId, quantity });
  }
  localStorage.setItem('cart', JSON.stringify(cartItems));
  updateCartCount();
}

// Обновление счетчика корзины
function updateCartCount() {
  const count = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const cartElements = document.querySelectorAll('.cart-count');
  cartElements.forEach(el => {
    el.textContent = count;
    el.style.display = count > 0 ? 'inline-block' : 'none';
  });
}

// Полное обновление отображения корзины
async function updateCartDisplay() {
  updateCartCount();

  if (!document.getElementById('order-items')) return;

  if (cartItems.length === 0) {
    window.location.href = 'catalog.html';
    return;
  }

  const productIds = cartItems.map(item => item.id);
  const products = await fetch(`http://localhost:3000/api/products?ids=${productIds.join(',')}`)
    .then(res => res.json());

  const orderItems = cartItems.map(cartItem => {
    const product = products.find(p => p.id === cartItem.id);
    return { ...product, quantity: cartItem.quantity };
  });

  const itemsContainer = document.getElementById('order-items');
  itemsContainer.innerHTML = orderItems.map(item => `
    <div class="order-item">
      <span>${item.name} (${item.quantity} × ${item.price.toLocaleString()}₽)</span>
      <span>${(item.price * item.quantity).toLocaleString()}₽</span>
    </div>
  `).join('');

  const total = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  document.getElementById('order-total').textContent = total.toLocaleString();
}

// Загрузка товаров для каталога
async function loadProducts(filters = {}) {
    console.log('Функция вызвана с параметрами:', filters);
    
    try {
      const url = `http://localhost:3000/api/products?${new URLSearchParams(filters)}`;
      console.log('Запрос на:', url);
      
      const response = await fetch(url);
      console.log('Статус ответа:', response.status);
      
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const data = await response.json();
      console.log('Получены данные:', data);
      return data;
    } catch (err) {
      console.error('Ошибка:', err);
      return [];
    }
  }

// Загрузка категорий
async function loadCategories() {
  const response = await fetch('http://localhost:3000/api/categories');
  return await response.json();
}

// Загрузка данных товара
async function loadProduct(id) {
  const response = await fetch(`http://localhost:3000/api/products/${id}`);
  if (!response.ok) throw new Error('Товар не найден');
  return await response.json();
}

// Оформление заказа
async function checkoutOrder(deliveryData) {
  if (!currentUser) {
    alert('Для оформления заказа войдите в систему');
    return;
  }

  try {
    const response = await fetch('http://localhost:3000/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ items: cartItems })
    });
    
    if (!response.ok) throw new Error('Ошибка оформления заказа');
    
    const order = await response.json();
    localStorage.removeItem('cart');
    cartItems = [];
    return order;
  } catch (err) {
    console.error('Ошибка:', err);
    throw err;
  }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
  updateCartCount();
  
  // Проверка авторизации для защищенных страниц
  if (['account.html', 'checkout.html'].some(page => window.location.pathname.endsWith(page))) {
    checkAuth().then(isAuth => {
      if (!isAuth) window.location.href = 'login.html';
    });
  }
});

function validateQuantity(input) {
    const max = parseInt(input.max);
    const errorElement = document.getElementById('quantity-error');
    
    if (parseInt(input.value) > max) {
      input.value = max;
      errorElement.style.display = 'inline';
      setTimeout(() => errorElement.style.display = 'none', 2000);
    }
}
  
function addToCartWithValidation(productId) {
    const quantityInput = document.getElementById('quantity');
    const quantity = parseInt(quantityInput.value);
    const max = parseInt(quantityInput.max);

    if (quantity > max) {
        quantityInput.value = max;
        document.getElementById('quantity-error').style.display = 'inline';
        return;
    }

    addToCart(productId, quantity);
}