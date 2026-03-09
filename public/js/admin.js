document.addEventListener('DOMContentLoaded', () => {
    // 1. Security Check & Setup
    const user = getUser();
    if (!user || (user.user_type !== 'admin' && user.user_type !== 'staff')) {
        showAlert("You do not have permission to access this page.", "error");
        window.location.href = '/login.html';
        return;
    }
    document.getElementById('admin-welcome').textContent = `Welcome, ${user.name}!`;
    document.getElementById('admin-logout-btn').addEventListener('click', (e) => { e.preventDefault(); logout(); });

    // 2. Client-side Router
    const navigate = () => {
        const hash = window.location.hash || '#orders';
        loadContent(hash.substring(1));
        updateActiveLink(hash);
    };
    window.addEventListener('hashchange', navigate);
    navigate();
});

function updateActiveLink(hash) {
    document.querySelectorAll('.admin-sidebar nav a').forEach(a => {
        a.getAttribute('href') === hash ? a.classList.add('active') : a.classList.remove('active');
    });
}

async function loadContent(page) {
    const contentEl = document.getElementById('admin-content');
    if (!contentEl) return;
    contentEl.innerHTML = '<div class="loader"></div>';
    try {
        const response = await fetch(`/admin/templates/${page}.html`);
        if (!response.ok) throw new Error(`Template not found`);
        contentEl.innerHTML = await response.text();
        
        if (page === 'orders') await handleOrdersPage();
        else if (page === 'users') await handleUsersPage();
        else if (page === 'menu') await handleMenuPage();
        else if (page === 'feedback') await handleFeedbackPage();
    } catch (error) {
        contentEl.innerHTML = `<p class="error-message">Error loading page. ${error.message}</p>`;
    }
}

// --- PAGE HANDLERS ---

async function handleOrdersPage() {
    const container = document.getElementById('admin-orders-list');
    try {
        const orders = await apiRequest('/orders/all');
        if (!orders || !Array.isArray(orders)) throw new Error("Invalid order data received.");
        container.innerHTML = orders.length === 0 ? '<p>No orders found.</p>' : `
            <table class="admin-table">
                <thead><tr><th>ID</th><th>Date</th><th>Items</th><th>Total</th><th>Status</th></tr></thead>
                <tbody>
                    ${orders.map(order => `
                        <tr>
                            <td>#${order.id}</td>
                            <td>${new Date(order.timestamp).toLocaleString()}</td>
                            <td>${(order.items || []).map(item => `<span>${item.quantity}x ${item.name}</span>`).join('')}</td>
                            <td>₹${(order.total_amount || 0).toFixed(2)}</td>
                            <td>
                                <select class="status-select" data-order-id="${order.id}">
                                    <option value="Received" ${order.status === 'Received' ? 'selected' : ''}>Received</option>
                                    <option value="Preparing" ${order.status === 'Preparing' ? 'selected' : ''}>Preparing</option>
                                    <option value="Ready" ${order.status === 'Ready' ? 'selected' : ''}>Ready</option>
                                    <option value="Completed" ${order.status === 'Completed' ? 'selected' : ''}>Completed</option>
                                    <option value="Cancelled" ${order.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                                </select>
                            </td>
                        </tr>`).join('')}
                </tbody>
            </table>`;
        container.addEventListener('change', async e => {
            if (e.target.matches('.status-select')) {
                const { orderId } = e.target.dataset;
                const newStatus = e.target.value;
                try {
                    await apiRequest(`/orders/${orderId}/status`, 'PUT', { newStatus });
                    showAlert(`Order #${orderId} status updated`, 'success');
                } catch (error) { showAlert(`Update failed: ${error.message}`, 'error'); }
            }
        });
    } catch (error) { container.innerHTML = `<p class="error-message">Could not load orders: ${error.message}</p>`; }
}

async function handleUsersPage() {
    const container = document.getElementById('admin-users-list');
    try {
        const users = await apiRequest('/users');
        if (!Array.isArray(users)) throw new Error("Invalid user data received.");
        container.innerHTML = users.length === 0 ? '<p>No users found.</p>' : `
            <table class="admin-table">
                <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Type</th><th>Actions</th></tr></thead>
                <tbody>
                    ${users.map(user => `
                        <tr>
                            <td>${user.id}</td>
                            <td>${user.name}</td>
                            <td>${user.email}</td>
                            <td>${user.user_type}</td>
                            <td><button class="button-small danger-btn delete-user-btn" data-user-id="${user.id}">Delete</button></td>
                        </tr>`).join('')}
                </tbody>
            </table>`;
        container.addEventListener('click', async e => {
            if (e.target.matches('.delete-user-btn')) {
                if (!confirm('Are you sure?')) return;
                const { userId } = e.target.dataset;
                try {
                    await apiRequest(`/users/${userId}`, 'DELETE');
                    showAlert('User deleted!', 'success');
                    handleUsersPage(); // Refresh
                } catch (error) { showAlert(`Error deleting user: ${error.message}`, 'error'); }
            }
        });
    } catch (error) { container.innerHTML = `<p class="error-message">Could not load users: ${error.message}</p>`; }
}

async function handleMenuPage() {
    const container = document.getElementById('admin-menu-list');
    const modal = document.getElementById('menu-item-modal');
    const form = document.getElementById('menu-item-form');
    const showModal = (item = null) => {
        form.reset();
        document.getElementById('image-preview').style.display = 'none';
        if (item) {
            document.getElementById('modal-title').textContent = 'Edit Item';
            document.getElementById('edit-item-id').value = item.id;
            document.getElementById('item-name').value = item.name;
            document.getElementById('item-price').value = item.price;
            document.getElementById('item-cost-price').value = item.cost_price;
            document.getElementById('item-menu-type').value = item.menu_type || 'REGULAR';
            document.getElementById('item-is-available').checked = item.is_available;
            document.getElementById('image-preview').src = `/${item.image}`;
            document.getElementById('image-preview').style.display = 'block';
        } else {
            document.getElementById('modal-title').textContent = 'Add New Item';
            document.getElementById('edit-item-id').value = '';
            document.getElementById('item-is-available').checked = true;
        }
        modal.style.display = 'flex';
    };
    const hideModal = () => { modal.style.display = 'none'; };
    
    document.getElementById('add-new-item-btn').addEventListener('click', () => showModal());
    modal.querySelector('.close-btn').addEventListener('click', hideModal);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const itemId = document.getElementById('edit-item-id').value;
        const itemData = {
            name: document.getElementById('item-name').value,
            price: parseFloat(document.getElementById('item-price').value),
            cost_price: parseFloat(document.getElementById('item-cost-price').value),
            menu_type: document.getElementById('item-menu-type').value,
            is_available: document.getElementById('item-is-available').checked,
        };
        const imageFile = document.getElementById('item-image').files[0];
        if (imageFile) {
            itemData.imageName = imageFile.name;
            itemData.image = await new Promise(resolve => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(imageFile);
            });
        }
        try {
            if (itemId) {
                await apiRequest(`/menu/${itemId}`, 'PUT', itemData);
                showAlert('Item updated!', 'success');
            } else {
                await apiRequest('/menu', 'POST', itemData);
                showAlert('Item added!', 'success');
            }
            hideModal();
            handleMenuPage();
        } catch (error) { showAlert(`Error saving item: ${error.message}`, 'error'); }
    });

    try {
        const items = await apiRequest('/menu');
        if (!Array.isArray(items)) throw new Error("Invalid menu data received.");
        container.innerHTML = items.length === 0 ? '<p>No menu items found.</p>' : `
            <table class="admin-table">
                <thead><tr><th>Image</th><th>Name</th><th>Category</th><th>Price</th><th>Available</th><th>Actions</th></tr></thead>
                <tbody>
                    ${items.map(item => `
                        <tr>
                            <td><img src="/${item.image}" alt="${item.name}" class="admin-item-image"></td>
                            <td>${item.name}</td>
                            <td>${item.menu_type || 'N/A'}</td>
                            <td>₹${(item.price || 0).toFixed(2)}</td>
                            <td>${item.is_available ? 'Yes' : 'No'}</td>
                            <td>
                                <button class="button-small edit-btn" data-item='${JSON.stringify(item)}'>Edit</button>
                                <button class="button-small danger-btn delete-btn" data-item-id="${item.id}">Delete</button>
                            </td>
                        </tr>`).join('')}
                </tbody>
            </table>`;
        container.addEventListener('click', async e => {
            if (e.target.matches('.edit-btn')) showModal(JSON.parse(e.target.dataset.item));
            if (e.target.matches('.delete-btn')) {
                if (!confirm('Are you sure?')) return;
                try {
                    await apiRequest(`/menu/${e.target.dataset.itemId}`, 'DELETE');
                    showAlert('Item deleted!', 'success');
                    handleMenuPage();
                } catch (error) { showAlert(`Error deleting item: ${error.message}`, 'error'); }
            }
        });
    } catch (error) { container.innerHTML = `<p class="error-message">Could not load menu: ${error.message}</p>`; }
}

async function handleFeedbackPage() {
    const container = document.getElementById('admin-feedback-list');
    try {
        const feedbacks = await apiRequest('/feedback');
        if (!Array.isArray(feedbacks)) throw new Error("Invalid feedback data received.");
        container.innerHTML = feedbacks.length === 0 ? '<p>No feedback found.</p>' :
            feedbacks.map(fb => `
                <div class="feedback-card">
                    <p><strong>From:</strong> ${fb.user_name} (${fb.user_email})</p>
                    <p><strong>Subject:</strong> ${fb.subject}</p>
                    <p>${fb.message}</p>
                    <div class="feedback-response-area">
                        ${fb.status === 'responded'
                            ? `<p class="admin-response"><strong>Your Response:</strong> ${fb.admin_response}</p>`
                            : `<form class="response-form" data-feedback-id="${fb.id}">
                                <textarea placeholder="Write response..." required></textarea>
                                <button type="submit" class="button-small">Submit</button>
                               </form>`}
                    </div>
                </div>`).join('');
        container.addEventListener('submit', async e => {
            if (e.target.matches('.response-form')) {
                e.preventDefault();
                const feedbackId = e.target.dataset.feedbackId;
                const adminResponse = e.target.querySelector('textarea').value;
                try {
                    await apiRequest(`/feedback/${feedbackId}`, 'PUT', { adminResponse });
                    showAlert('Response sent!', 'success');
                    handleFeedbackPage();
                } catch (error) { showAlert(`Response failed: ${error.message}`, 'error'); }
            }
        });
    } catch (error) { container.innerHTML = `<p class="error-message">Could not load feedback: ${error.message}</p>`; }
}
