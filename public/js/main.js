// Final Restored main.js (without accordion, homepage visible on load)
document.addEventListener('DOMContentLoaded', () => {
    updateNav();
    runPageSpecificInits();
});

function runPageSpecificInits() {
    // These now correctly initialize for all pages that exist
    if (document.querySelector('.menu-section')) initMenuPage();
    if (document.querySelector('.cart-page')) initCartPage();
    if (document.querySelector('.history-page')) initHistoryPage();
    if (document.querySelector('.status-page')) initStatusPage();
    if (document.querySelector('.profile-page')) initProfilePage();
}

// --- Navigation ---
function updateNav() {
    const user = getUser();
    const nav = document.querySelector('header nav ul');
    if (!nav) return;
    const cart = getCart();
    const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    let navLinks = `<li><a href="/index.html" class="active">Menu</a></li>`;
    if (user) {
        navLinks += `
            <li><a href="/cart.html">Cart ${cartCount > 0 ? `(${cartCount})` : ''}</a></li>
            <li><a href="/history.html">Orders</a></li>
            <li><a href="/profile.html">Profile</a></li>
            ${(user.user_type === 'admin' || user.user_type === 'staff') ? `<li><a href="/admin/dashboard.html">Admin</a></li>` : ''}
            <li><a href="#" id="logout-btn">Logout (${user.name})</a></li>`;
    } else {
        navLinks += `<li><a href="/login.html">Login / Register</a></li>`;
    }
    nav.innerHTML = navLinks;

    if (user) {
        document.getElementById('logout-btn').addEventListener('click', e => { e.preventDefault(); logout(); });
    }
}

// --- Cart ---
function getCart() { return JSON.parse(localStorage.getItem('cart')) || []; }
function saveCart(cart) { localStorage.setItem('cart', JSON.stringify(cart)); updateNav(); }
function addToCart(item, quantity = 1) {
    if (!isLoggedIn()) {
        showAlert("Please log in to add items to your cart.", "error");
        return window.location.href = '/login.html';
    }
    const cart = getCart();
    const existingItem = cart.find(i => i.id === item.id);
    if (existingItem) existingItem.quantity += quantity;
    else cart.push({ ...item, quantity });
    saveCart(cart);
    showAlert(`${item.name} added to cart!`, 'success');
}

// --- Menu Page ---
async function initMenuPage() {
    // Slideshow
    let slideIndex = 0;
    const slides = document.querySelectorAll('.hero-slideshow-container .slide');
    function showSlides() {
        if (slides.length === 0) return;
        slides.forEach(slide => slide.classList.remove('active'));
        slideIndex++;
        if (slideIndex > slides.length) slideIndex = 1;
        if(slides[slideIndex - 1]) slides[slideIndex - 1].classList.add('active');
        setTimeout(showSlides, 5000);
    }
    showSlides();

    // Fetch Menu
    try {
        const menuItems = await apiRequest('/menu');
        renderMenu(menuItems);
    } catch (error) { document.querySelector('.menu').innerHTML = `<p class="error-message">Could not load menu.</p>`; }
}

function renderMenu(items) {
    const menuContainer = document.querySelector('.menu');
    menuContainer.innerHTML = '';
    if (!Array.isArray(items) || items.length === 0) {
        menuContainer.innerHTML = '<p>No items on the menu right now.</p>';
        return;
    }
    items.forEach(item => {
        const card = document.createElement('div');
        card.className = `menu-card ${!item.is_available ? 'unavailable' : ''}`;
        card.innerHTML = `
            <img src="${item.image ? `/${item.image}` : '/food_images/default-food.png'}" alt="${item.name}">
            <div class="menu-card-content">
                <h4>${item.name}</h4>
                <p>₹${(item.price || 0).toFixed(2)}</p>
                <div class="quantity-selector">
                    <label>Qty:</label>
                    <input type="number" id="quantity-${item.id}" value="1" min="1" ${!item.is_available ? 'disabled' : ''}>
                </div>
                <button class="button add-to-cart-btn" data-item-id="${item.id}" ${!item.is_available ? 'disabled' : ''}>Add to Cart</button>
            </div>`;
        menuContainer.appendChild(card);
    });
    menuContainer.addEventListener('click', e => {
        if (e.target.matches('.add-to-cart-btn')) {
            const itemId = parseInt(e.target.dataset.itemId);
            const item = items.find(i => i.id === itemId);
            const quantity = parseInt(document.getElementById(`quantity-${itemId}`).value);
            if (item && quantity > 0) addToCart(item, quantity);
        }
    });
}

// --- Cart Page ---
function initCartPage() {
    if (!isLoggedIn()) return window.location.href = '/login.html';
    renderCart();
    document.getElementById('checkout-btn').addEventListener('click', handlePayment);
}

function renderCart() {
    const cart = getCart();
    const container = document.getElementById('cart-container');
    container.innerHTML = '';
    if (cart.length === 0) {
        container.innerHTML = '<h3>Your Cart is Empty</h3><p><a href="/index.html">Continue Shopping</a></p>';
        document.getElementById('cart-summary').style.display = 'none';
        return;
    }
    document.getElementById('cart-summary').style.display = 'block';
    
    let subtotal = 0;
    const itemsHtml = cart.map(item => {
        const itemTotal = (item.price || 0) * item.quantity;
        subtotal += itemTotal;
        return `<tr>
                    <td>${item.name}</td>
                    <td>₹${(item.price || 0).toFixed(2)}</td>
                    <td>${item.quantity}</td>
                    <td>₹${itemTotal.toFixed(2)}</td>
                    <td><button class="remove-btn button-small danger-btn" data-item-id="${item.id}">X</button></td>
                </tr>`;
    }).join('');

    container.innerHTML = `<table class="admin-table"><thead><tr><th>Item</th><th>Price</th><th>Qty</th><th>Total</th><th></th></tr></thead><tbody>${itemsHtml}</tbody></table>`;
    
    const taxes = subtotal * 0.05;
    document.getElementById('cart-subtotal').textContent = `₹${subtotal.toFixed(2)}`;
    document.getElementById('cart-taxes').textContent = `₹${taxes.toFixed(2)}`;
    document.getElementById('cart-total').textContent = `₹${(subtotal + taxes).toFixed(2)}`;

    container.addEventListener('click', e => {
        if(e.target.matches('.remove-btn')) {
            saveCart(getCart().filter(i => i.id !== parseInt(e.target.dataset.itemId)));
            renderCart();
        }
    });
}

async function handlePayment() {
    const cart = getCart();
    if (cart.length === 0) return showAlert("Cart is empty!", "error");
    
    const totalAmount = cart.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0) * 1.05;

    try {
        const order = await apiRequest('/orders', 'POST', { amount: totalAmount });
        const user = getUser();
        const rzp = new Razorpay({
            key: 'rzp_test_SP4dD3Sn0jbV2f',
            amount: order.amount,
            currency: "INR",
            name: "DYPCET Cafeteria",
            order_id: order.id,
            handler: async function (response) {
                try {
                    const verificationData = { ...response, items: cart, total_amount: totalAmount };
                    const result = await apiRequest('/orders/verify', 'POST', verificationData);
                    if (result && result.orderId) {
                        saveCart([]);
                        showAlert('Order placed successfully!', 'success');
                        window.location.href = `/status.html?id=${result.orderId}`;
                    } else {
                        throw new Error("Order verification failed after payment.");
                    }
                } catch (verifyError) {
                    showAlert(`Verification failed: ${verifyError.message}`, 'error');
                }
            },
            prefill: { name: user.name, email: user.email },
        });
        rzp.open();
    } catch (error) {
        showAlert(`Payment initialization failed: ${error.message}`, 'error');
    }
}

// --- Other Pages ---
async function initHistoryPage() {
    if (!isLoggedIn()) return window.location.href = '/login.html';
    const container = document.getElementById('history-container');
    try {
        const orders = await apiRequest('/orders/history');
        container.innerHTML = !orders || orders.length === 0 ? '<p>No past orders.</p>' : `
            <table class="admin-table">
                <thead><tr><th>ID</th><th>Date</th><th>Total</th><th>Status</th><th></th></tr></thead>
                <tbody>
                    ${orders.map(order => `
                        <tr>
                            <td>#${order.id}</td>
                            <td>${new Date(order.timestamp).toLocaleDateString()}</td>
                            <td>₹${(order.total_amount || 0).toFixed(2)}</td>
                            <td>${order.status}</td>
                            <td><a href="/status.html?id=${order.id}" class="button button-small">View</a></td>
                        </tr>`).join('')}
                </tbody>
            </table>`;
    } catch (error) { container.innerHTML = `<p class="error-message">Could not load order history.</p>`; }
}

async function initStatusPage() {
    console.log("--- Frontend Status Page Init ---");
    if (!isLoggedIn()) return window.location.href = '/login.html';
    const container = document.getElementById('status-container');
    const orderId = new URLSearchParams(window.location.search).get('id');
    console.log("Frontend: Retrieved Order ID from URL:", orderId);

    if (!orderId) {
        container.innerHTML = '<p class="error-message">No order ID provided. Please go back to your <a href="/history.html">order history</a>.</p>';
        return;
    }

    try {
        console.log(`Frontend: Fetching details for order ID: ${orderId}`);
        const order = await apiRequest(`/orders/${orderId}`);
        console.log("Frontend: Received order details from API:", order);

        if (!order || !order.id) {
            throw new Error("Order data could not be found or is incomplete.");
        }

        const items = (typeof order.items === 'string') ? JSON.parse(order.items) : order.items || [];
        const statusSteps = ['Received', 'Preparing', 'Ready', 'Completed', 'Cancelled'];
        const currentStatusIndex = statusSteps.indexOf(order.status);
        container.innerHTML = `
            <div class="status-header"><h3>Order #${order.id} Status</h3></div>
            <div class="status-progress-bar">
                ${statusSteps.map((step, index) => `<div class="progress-step ${index <= currentStatusIndex ? 'completed' : ''}"><div class="step-dot"></div><div class="step-label">${step}</div></div>`).join('')}
            </div>
            <h4>Items:</h4>
            <ul>${items.map(item => `<li><span>${item.quantity}x ${item.name}</span> <span>₹${((item.price || 0) * item.quantity).toFixed(2)}</span></li>`).join('')}</ul>`;
        console.log("Frontend: Status page rendered successfully.");
    } catch(error) { 
        console.error("Frontend: Error in initStatusPage:", error);
        container.innerHTML = `<p class="error-message">Could not load order status: ${error.message}</p>`; 
    }
}

async function initProfilePage() {
    if (!isLoggedIn()) return window.location.href = '/login.html';
    const user = getUser();
    document.getElementById('profile-name').value = user.name;
    document.getElementById('profile-email').value = user.email;

    // Add feedback form logic
    const feedbackForm = document.getElementById('feedback-form');
    if (feedbackForm) {
        feedbackForm.addEventListener('submit', async e => {
            e.preventDefault();
            try {
                await apiRequest('/feedback', 'POST', { subject: e.target.subject.value, message: e.target.message.value });
                showAlert('Feedback submitted!', 'success');
                e.target.reset();
            } catch (error) { showAlert(`Submission failed: ${error.message}`, 'error'); }
        });
    }
}
