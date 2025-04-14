let chatbotContainer, chatbotHeader, chatbotMessages, chatbotInput, chatbotSend;

function addMessage(text, sender) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `chatbot-message ${sender}`;
  messageDiv.textContent = text;
  chatbotMessages.appendChild(messageDiv);
  chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
}

function showActionButtons() {
  const buttonDiv = document.createElement('div');
  buttonDiv.className = 'chatbot-buttons';

  const searchButton = document.createElement('button');
  searchButton.textContent = 'Найти товар';
  searchButton.addEventListener('click', () => window.processMessage('найти товар'));

  const orderButton = document.createElement('button');
  orderButton.textContent = 'Оформить заказ';
  orderButton.addEventListener('click', () => window.processMessage('оформить заказ'));

  const historyButton = document.createElement('button');
  historyButton.textContent = 'История заказов';
  historyButton.addEventListener('click', () => window.processMessage('история заказов'));

  buttonDiv.appendChild(searchButton);
  buttonDiv.appendChild(orderButton);
  buttonDiv.appendChild(historyButton);

  chatbotMessages.appendChild(buttonDiv);
  chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
}

function saveChatHistory() {
  const messages = [];
  const messageElements = chatbotMessages.children;
  for (let i = 0; i < messageElements.length; i++) {
    const element = messageElements[i];
    if (element.classList.contains('chatbot-message')) {
      const sender = element.classList.contains('bot') ? 'bot' : 'user';
      messages.push({ text: element.textContent, sender });
    } else if (element.classList.contains('chatbot-buttons')) {
      messages.push({ type: 'buttons' });
    }
  }
  sessionStorage.setItem('chatHistory', JSON.stringify(messages));
}

function loadChatHistory() {
  const savedHistory = sessionStorage.getItem('chatHistory');
  if (savedHistory) {
    const messages = JSON.parse(savedHistory);
    messages.forEach(item => {
      if (item.type === 'buttons') {
        showActionButtons();
      } else {
        addMessage(item.text, item.sender);
      }
    });
    chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
    return true; 
  }
  return false; 
}

window.processMessage = async function(message) {
  if (message.includes('выйти') || message.includes('отмена')) {
    addMessage('Действие отменено. Чем могу помочь дальше?', 'bot');
    chatbotInput.dataset.intent = '';
    chatbotInput.dataset.productId = '';
    chatbotInput.dataset.phone = '';
    chatbotInput.dataset.address = '';
    showActionButtons();
    saveChatHistory();
    return;
  }

  if (message.includes('найти') || message.includes('поиск')) {
    addMessage('Введите название товара или категорию для поиска:', 'bot');
    chatbotInput.dataset.intent = 'search';
    saveChatHistory();
  } else if (message.includes('оформить') || message === 'заказ' || message.includes('артикул')) {
    addMessage('Введите артикул товара:', 'bot');
    chatbotInput.dataset.intent = 'order';
    saveChatHistory();
  } else if (message.includes('истори') || message.includes('заказы')) {
    await showOrderHistory();
  } else if (chatbotInput.dataset.intent === 'search') {
    await searchProducts(message);

    addMessage('Что хотите сделать дальше?', 'bot');
    showActionButtons();
    chatbotInput.dataset.intent = '';
  } else if (chatbotInput.dataset.intent === 'order') {
    await placeOrderById(message);
  } else if (chatbotInput.dataset.intent === 'order_phone') {
    chatbotInput.dataset.phone = message;
    addMessage('Введите адрес доставки:', 'bot');
    chatbotInput.dataset.intent = 'order_address';
    saveChatHistory();
  } else if (chatbotInput.dataset.intent === 'order_address') {
    chatbotInput.dataset.address = message;
    addMessage('Выберите способ оплаты:\n- cash (наличные)\n- card (карта)', 'bot');
    chatbotInput.dataset.intent = 'order_payment';
    saveChatHistory();
  } else if (chatbotInput.dataset.intent === 'order_payment') {
    const paymentMethod = message.toLowerCase();

    const validMethods = {
      'cash': 'cash',
      'card': 'card',
      'наличные': 'cash',
      'карта': 'card',
    };
    const selectedMethod = validMethods[paymentMethod];

    if (!selectedMethod) {
      addMessage('Пожалуйста, выберите способ оплаты: cash (наличные) или card (карта)', 'bot');
      addMessage('Или введите "выйти", чтобы отменить.', 'bot');
      saveChatHistory();
      return;
    }

    const productId = chatbotInput.dataset.productId;
    const phone = chatbotInput.dataset.phone;
    const address = chatbotInput.dataset.address;

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          items: [{ id: parseInt(productId), quantity: 1 }],
          phone,
          address,
          paymentMethod: selectedMethod
        })
      });

      if (!response.ok) throw new Error('Ошибка оформления заказа');

      const order = await response.json();
      addMessage(
        `Заказ №${order.id} успешно оформлен!\n` +
        `Сумма: ${order.total_price.toLocaleString()} ₽\n` +
        `Статус: ${order.status}`,
        'bot'
      );

      addMessage('Что хотите сделать дальше?', 'bot');
      showActionButtons();
    } catch (err) {
      addMessage('Произошла ошибка при оформлении заказа. Попробуйте позже.', 'bot');
      addMessage('Что хотите сделать дальше?', 'bot');
      showActionButtons();
      console.error('Ошибка оформления заказа:', err);
    }
    chatbotInput.dataset.intent = '';
    chatbotInput.dataset.productId = '';
    chatbotInput.dataset.phone = '';
    chatbotInput.dataset.address = '';
    saveChatHistory();
  } else {
    addMessage('Извините, я не понял. Выберите действие:', 'bot');
    showActionButtons();
    saveChatHistory();
  }
};

async function searchProducts(query) {
  try {
    const response = await fetch(`/api/products-for-chatbot?search=${encodeURIComponent(query)}&limit=3`);
    if (!response.ok) throw new Error('Ошибка поиска товаров');

    const products = await response.json();
    if (products.length === 0) {
      addMessage('Товары не найдены. Попробуйте другой запрос.', 'bot');
      saveChatHistory();
      return;
    }

    const productList = products
      .map(product => 
        `📦 ${product.name} (Артикул: ${product.id})\n` +
        `Цена: ${product.price.toLocaleString()} ₽\n` +
        `Категория: ${product.category}`
      )
      .join('\n\n');
    addMessage(`Вот что я нашёл:\n${productList}`, 'bot');
    saveChatHistory();
  } catch (err) {
    addMessage('Произошла ошибка при поиске товаров. Попробуйте позже.', 'bot');
    saveChatHistory();
    console.error('Ошибка поиска:', err);
  }
}

async function placeOrderById(productId) {
  try {
    const userResponse = await fetch('/api/me', { credentials: 'include' });
    if (!userResponse.ok) {
      addMessage('Пожалуйста, войдите в систему, чтобы оформить заказ.', 'bot');
      const buttonDiv = document.createElement('div');
      buttonDiv.className = 'chatbot-buttons';
      const loginButton = document.createElement('button');
      loginButton.textContent = 'Войти в аккаунт';
      loginButton.addEventListener('click', () => {
        window.location.href = '/login.html';
      });
      buttonDiv.appendChild(loginButton);
      chatbotMessages.appendChild(buttonDiv);
      saveChatHistory();
      chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
      return;
    }

    const productResponse = await fetch(`/api/products/${productId}`);
    if (!productResponse.ok) {
      addMessage('Товар с таким артикулом не найден. Укажите правильный артикул.', 'bot');
      addMessage('Или введите "выйти", чтобы отменить.', 'bot');
      saveChatHistory();
      return;
    }

    const product = await productResponse.json();
    if (product.stock_quantity < 1) {
      addMessage('Извините, товара нет в наличии.', 'bot');
      addMessage('Что хотите сделать дальше?', 'bot');
      showActionButtons();
      saveChatHistory();
      return;
    }

    addMessage('Введите ваш телефон для доставки (например, +79991234567):', 'bot');
    chatbotInput.dataset.intent = 'order_phone';
    chatbotInput.dataset.productId = productId;
    saveChatHistory();
  } catch (err) {
    addMessage('Произошла ошибка. Попробуйте позже.', 'bot');
    addMessage('Что хотите сделать дальше?', 'bot');
    showActionButtons();
    saveChatHistory();
    console.error('Ошибка оформления заказа:', err);
  }
}

async function showOrderHistory() {
  try {
    const userResponse = await fetch('/api/me', { credentials: 'include' });
    if (!userResponse.ok) {
      addMessage('Пожалуйста, войдите в систему, чтобы посмотреть историю заказов.', 'bot');
      const buttonDiv = document.createElement('div');
      buttonDiv.className = 'chatbot-buttons';
      const loginButton = document.createElement('button');
      loginButton.textContent = 'Войти в аккаунт';
      loginButton.addEventListener('click', () => {
        window.location.href = '/login.html';
      });
      buttonDiv.appendChild(loginButton);
      chatbotMessages.appendChild(buttonDiv);
      saveChatHistory();
      chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
      return;
    }

    const response = await fetch('/api/orders', { credentials: 'include' });
    if (!response.ok) throw new Error('Ошибка загрузки заказов');

    const orders = await response.json();
    if (orders.length === 0) {
      addMessage('У вас пока нет заказов.', 'bot');
      addMessage('Что хотите сделать дальше?', 'bot');
      showActionButtons();
      saveChatHistory();
      return;
    }

    const recentOrders = orders.slice(0, 3);
    const orderList = recentOrders
      .map(order => 
        `📦 Заказ №${order.id}\n` +
        `Дата: ${new Date(order.created_at).toLocaleDateString('ru-RU')}\n` +
        `Сумма: ${order.total_price.toLocaleString()} ₽\n` +
        `Статус: ${order.status}`
      )
      .join('\n\n');
    addMessage(`Вот ваши последние заказы:\n${orderList}`, 'bot');

    if (orders.length > 3) {
      addMessage('У вас есть ещё заказы!\nХотите посмотреть все?', 'bot');
      const buttonDiv = document.createElement('div');
      buttonDiv.className = 'chatbot-buttons';
      const historyButton = document.createElement('button');
      historyButton.textContent = 'Перейти в историю заказов';
      historyButton.addEventListener('click', () => {
        window.location.href = '/orders.html';
      });
      buttonDiv.appendChild(historyButton);
      chatbotMessages.appendChild(buttonDiv);
      chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
    }

    addMessage('Что хотите сделать дальше?', 'bot');
    showActionButtons();
    saveChatHistory();
  } catch (err) {
    addMessage('Произошла ошибка при загрузке истории заказов. Попробуйте позже.', 'bot');
    addMessage('Что хотите сделать дальше?', 'bot');
    showActionButtons();
    saveChatHistory();
    console.error('Ошибка загрузки заказов:', err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  chatbotContainer = document.getElementById('chatbot-container');
  chatbotHeader = document.getElementById('chatbot-header');
  chatbotMessages = document.getElementById('chatbot-messages');
  chatbotInput = document.getElementById('chatbot-input');
  chatbotSend = document.getElementById('chatbot-send');

  document.getElementById('chatbot-body').style.display = 'none';
  document.getElementById('chatbot-toggle').textContent = '💬';

  let isFirstOpen = true;

  const hasHistory = loadChatHistory();

  chatbotHeader.addEventListener('click', () => {
    const isCollapsed = chatbotContainer.classList.contains('collapsed');
    if (isCollapsed) {
      chatbotContainer.classList.remove('collapsed');
      document.getElementById('chatbot-body').style.display = 'flex';
      document.getElementById('chatbot-toggle').textContent = '✖';
      if (isFirstOpen && !hasHistory) {
        showWelcomeMessage();
        isFirstOpen = false;
      }
    } else {
      chatbotContainer.classList.add('collapsed');
      document.getElementById('chatbot-body').style.display = 'none';
      document.getElementById('chatbot-toggle').textContent = '💬';
    }
  });

  chatbotSend.addEventListener('click', () => sendMessage());
  chatbotInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  function sendMessage() {
    const message = chatbotInput.value.trim();
    if (!message) return;

    addMessage(message, 'user');
    chatbotInput.value = '';
    saveChatHistory();
    window.processMessage(message.toLowerCase());
  }

  function showWelcomeMessage() {
    addMessage('Привет! Я чат-бот интернет-магазина. Чем могу помочь? 😊', 'bot');
    showActionButtons();
    saveChatHistory();
  }
});