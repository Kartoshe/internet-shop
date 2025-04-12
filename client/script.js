// Общие функции
let currentUser = null;
let cartItems = JSON.parse(localStorage.getItem('cart')) || [];

// Проверка авторизации
async function checkAuth() {
  try {
    const response = await fetch('/api/me', {
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

// Новая функция для обновления навигации
async function updateNav() {
  const isAuth = await checkAuth();
  const loginLink = document.getElementById('login-link');
  const registerLink = document.getElementById('register-link');
  const accountLink = document.getElementById('account-link');
  const statsLink = document.getElementById('stats-link');
  const logoutBtn = document.getElementById('logout-btn');

  if (isAuth) {
      if (loginLink) loginLink.style.display = 'none';
      if (registerLink) registerLink.style.display = 'none';
      if (accountLink) accountLink.style.display = 'inline';
      if (statsLink) statsLink.style.display = 'inline'; // Показываем ссылку на статистику
      if (logoutBtn) logoutBtn.style.display = 'inline';
  } else {
      if (loginLink) loginLink.style.display = 'inline';
      if (registerLink) registerLink.style.display = 'inline';
      if (accountLink) accountLink.style.display = 'none';
      if (statsLink) statsLink.style.display = 'none'; // Скрываем ссылку на статистику
      if (logoutBtn) logoutBtn.style.display = 'none';
  }
}

// Выход
async function logout() {
  try {
    await fetch('/api/logout', {
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
async function addToCart(productId, quantity = 1) {
  const product = await loadProduct(productId);
  
  trackEvent('add_to_cart', productId, product.category);
  
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
  const products = await fetch(`/api/products?ids=${productIds.join(',')}`)
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
      const url = `/api/products?${new URLSearchParams(filters)}`;
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
  const response = await fetch('/api/categories');
  return await response.json();
}

// Загрузка данных товара
async function loadProduct(id) {
  const response = await fetch(`/api/products/${id}`);
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
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ items: cartItems })
    });
    
    if (!response.ok) throw new Error('Ошибка оформления заказа');
    
    const order = await response.json();
    trackEvent('order_completed', null);
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

// Форматирование данных
function formatPaymentMethod(method) {
  const methods = {
    'cash': 'Наличные',
    'card': 'Карта'
  };
  return methods[method] || 'Не указан';
}

// Работа с заказами
async function loadOrders(filters = {}) {
  try {
    const query = new URLSearchParams(filters).toString();
    const response = await fetch(`/api/orders?${query}`, {
      credentials: 'include'
    });
    
    if (!response.ok) throw new Error('Ошибка загрузки заказов');
    return await response.json();
  } catch (error) {
    console.error('Ошибка:', error);
    return [];
  }
}

async function cancelOrder(orderId, updateUI = true) {
  if (!confirm('Вы действительно хотите отменить этот заказ?')) return false;
  
  try {
    const response = await fetch(`/api/orders/${orderId}/cancel`, {
      method: 'POST',
      credentials: 'include'
    });
    
    if (!response.ok) throw new Error('Ошибка отмены заказа');
    
    // Если updateUI включено, обновляем UI
    if (updateUI) {
      const orderCard = document.querySelector(`.order-card:has([onclick="cancelOrder(${orderId})"])`);
      if (orderCard) {
        // Обновляем статус в UI
        const statusElement = orderCard.querySelector('.order-status');
        statusElement.textContent = getStatusText('cancelled');
        statusElement.className = 'order-status cancelled';
        
        // Удаляем кнопку "Отменить заказ"
        const cancelButton = orderCard.querySelector('.btn-cancel');
        if (cancelButton) cancelButton.remove();
        
        // Обновляем статус в секции доставки
        const deliveryInfo = orderCard.querySelector('.order-delivery-info');
        if (deliveryInfo) {
          const statusText = deliveryInfo.querySelector('p:last-child');
          if (statusText && statusText.textContent.includes('Статус')) {
            statusText.innerHTML = `<strong>Статус:</strong> ${getStatusText('cancelled')}`;
          }
        }
      }
    }
    
    return true;
  } catch (error) {
    alert(error.message);
    return false;
  }
}

// Функция для отображения заказов
function showOrders(orders, containerId, showDetails = false) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!orders || orders.length === 0) {
    container.innerHTML = '<p>Заказы не найдены</p>';
    return;
  }

  container.innerHTML = orders.map(order => `
    <div class="order-card ${showDetails ? '' : 'compact'}">
      <div class="order-header">
        <h3>Заказ №${order.id}</h3>
        <span class="order-date">
          ${new Date(order.created_at).toLocaleDateString('ru-RU')}
        </span>
        <span class="order-status ${order.status}">${getStatusText(order.status)}</span>
        <span class="order-total">${order.total_price.toLocaleString()} ₽</span>
      </div>
      
      ${showDetails ? `
        <div class="order-delivery-info">
          <p><strong>Телефон:</strong> ${order.customer_phone || 'Не указан'}</p>
          <p><strong>Адрес:</strong> ${order.delivery_address || 'Не указан'}</p>
          <p><strong>Способ оплаты:</strong> ${formatPaymentMethod(order.payment_method)}</p>
          <p><strong>Статус:</strong> ${getStatusText(order.status)}</p>
        </div>
      ` : ''}
      
      <div class="order-items">
        ${order.items.slice(0, showDetails ? 10 : 2).map(item => `
          <div class="order-item" onclick="window.location.href='product.html?id=${item.id}'" style="cursor:pointer">
            <img src="${item.image_url || 'images/no-image.png'}" alt="${item.name}">
            <div>
              <p><strong>${item.name}</strong></p>
              <p>${item.price.toLocaleString()} ₽ × ${item.quantity}</p>
            </div>
          </div>
        `).join('')}
        
        ${!showDetails && order.items.length > 2 ? 
          `<p>+ ещё ${order.items.length - 2} товара</p>` : ''}
      </div>
      
      ${showDetails ? `
        <div class="order-actions">
          <button onclick="repeatOrder(${order.id})" class="btn">
            Повторить заказ
          </button>
          ${order.status === 'pending' ? `
            <button onclick="cancelOrder(${order.id})" class="btn btn-cancel">
              Отменить заказ
            </button>
          ` : ''}
        </div>
      ` : ''}
    </div>
  `).join('');
}

function getStatusText(status) {
  const statusMap = {
    'pending': 'В обработке',
    'completed': 'Завершен',
    'cancelled': 'Отменен',
    'shipped': 'Отправлен'
  };
  return statusMap[status] || status;
}

// Трекинг событий
function trackEvent(eventType, productId = null, category = null, pageUrl = window.location.pathname) {
  if (localStorage.getItem('cookieConsent') !== 'accepted') return;

  const shouldLimitTracking = eventType !== 'add_to_cart'; // Не ограничиваем add_to_cart

    if (shouldLimitTracking) {
        const trackingKey = `tracked_${eventType}_${pageUrl}`;
        const lastTracked = sessionStorage.getItem(trackingKey);

        if (lastTracked) {
            console.log(`Событие ${eventType} для ${pageUrl} уже зарегистрировано в этой сессии, пропускаем`);
            return;
        }
    }

  console.log(`Отправка трекинга: type=${eventType}, productId=${productId}, category=${category}, pageUrl=${pageUrl}`);
  fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
          type: eventType,
          productId: productId || null,
          category: category || null,
          pageUrl: pageUrl || null
      })
  })
  .then(() => {
    if (shouldLimitTracking) {
      const trackingKey = `tracked_${eventType}_${pageUrl}`;
      sessionStorage.setItem(trackingKey, 'true');
    }
  })
  .catch(err => console.error('Ошибка трекинга:', err));
}

// Управление согласием на cookies
function manageCookieConsent() {
  const cookieConsent = document.getElementById('cookieConsent');
  if (!cookieConsent) {
      console.log('Баннер cookieConsent не найден на странице');
      return;
  }

  const consent = localStorage.getItem('cookieConsent');
  console.log('Проверка состояния cookieConsent:', consent);
  if (consent === 'accepted' || consent === 'rejected') {
      console.log('Скрываем баннер, так как выбор уже сделан:', consent);
      cookieConsent.style.display = 'none';
  } else {
      console.log('Показываем баннер, так как выбор не сделан');
      cookieConsent.style.display = 'block';
  }
}

// Обработчики кнопок согласия
document.getElementById('acceptCookies')?.addEventListener('click', () => {
  console.log('Cookies приняты');
  localStorage.setItem('cookieConsent', 'accepted');
  document.getElementById('cookieConsent').style.display = 'none';
  
  const expiryDate = new Date();
  expiryDate.setFullYear(expiryDate.getFullYear() + 1);
  document.cookie = `cookieConsent=accepted; expires=${expiryDate.toUTCString()}; path=/`;
  if (currentUser) {
      document.cookie = `user_id=${currentUser.id}; expires=${expiryDate.toUTCString()}; path=/`;
  }
});

document.getElementById('rejectCookies')?.addEventListener('click', () => {
  console.log('Cookies отклонены');
  localStorage.setItem('cookieConsent', 'rejected');
  document.getElementById('cookieConsent').style.display = 'none';
  
  document.cookie.split(";").forEach(c => {
      const cookieName = c.split('=')[0].trim();
      if (!['session_id', 'token'].includes(cookieName)) {
          document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
      }
  });
});

// Вызов при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
  manageCookieConsent();
  updateNav();
  updateCartCount();

  const currentPage = window.location.pathname;
    if (currentPage !== '/product.html') {
      trackEvent('page_view');
    }
});