// frontend/src/pages/admin/AdminOrdersPage.js

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import apiRequest from '../../utils/api';
import { useAlert } from '../../hooks/useAlert';
import './AdminDashboard.css';
import './AdminOrdersPage.css';

function AdminOrdersPage() {
  const CGST_RATE = 0.025;
  const SGST_RATE = 0.025;

  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [refundAmountInput, setRefundAmountInput] = useState('');
  const [refundNoteInput, setRefundNoteInput] = useState('');
  const [refundActionLoading, setRefundActionLoading] = useState(false);
  const [refundAuditLogs, setRefundAuditLogs] = useState([]);
  const [isEditingOrder, setIsEditingOrder] = useState(false);
  const [savingOrderEdit, setSavingOrderEdit] = useState(false);
  const [orderEditForm, setOrderEditForm] = useState({
    token_number: '',
    customer_name: '',
    customer_mobile: '',
    order_instruction: '',
    total_amount: '',
  });
  const [orderEditItems, setOrderEditItems] = useState([]);
  const [orderEditItemsDirty, setOrderEditItemsDirty] = useState(false);
  const [menuItemsForEdit, setMenuItemsForEdit] = useState([]);
  const [menuItemsLoaded, setMenuItemsLoaded] = useState(false);
  const [addMenuItemId, setAddMenuItemId] = useState('');
  const [addMenuItemQty, setAddMenuItemQty] = useState('1');
  const [stats, setStats] = useState({
    totalOrders: 0,
    pendingOrders: 0,
    completedOrders: 0,
    totalRevenue: 0
  });
  const { showAlert } = useAlert();

  const safeParseItems = useCallback((items) => {
    if (Array.isArray(items)) return items;
    if (typeof items === 'string') {
      try {
        const parsed = JSON.parse(items);
        return Array.isArray(parsed) ? parsed : [];
      } catch (_error) {
        return [];
      }
    }
    return [];
  }, []);

  const normalizeItemsForEdit = useCallback((items) => {
    const raw = safeParseItems(items);
    return raw.map((item) => ({
      id: item?.id ?? item?.menu_item_id ?? item?.item_id ?? null,
      name: String(item?.name ?? item?.item_name ?? '').trim(),
      price: String(item?.price ?? item?.unit_price ?? 0),
      quantity: String(item?.quantity ?? item?.qty ?? 1),
    }));
  }, [safeParseItems]);

  const previewTotals = useMemo(() => {
    const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
    const normalized = (Array.isArray(orderEditItems) ? orderEditItems : []).map((it) => ({
      price: Number(it?.price ?? 0),
      quantity: Number(it?.quantity ?? 0),
    })).filter((it) => Number.isFinite(it.price) && it.price >= 0 && Number.isFinite(it.quantity) && it.quantity > 0);

    const subTotal = roundMoney(normalized.reduce((sum, it) => sum + (it.price * it.quantity), 0));
    const cgstAmount = roundMoney(subTotal * CGST_RATE);
    const sgstAmount = roundMoney(subTotal * SGST_RATE);
    const grandTotal = roundMoney(subTotal + cgstAmount + sgstAmount);
    return { subTotal, cgstAmount, sgstAmount, grandTotal };
  }, [orderEditItems]);

  useEffect(() => {
    if (!isEditingOrder) return;
    if (menuItemsLoaded) return;

    let cancelled = false;
    (async () => {
      try {
        const data = await apiRequest('/menu');
        if (cancelled) return;
        setMenuItemsForEdit(Array.isArray(data) ? data : []);
      } catch (error) {
        if (!cancelled) {
          showAlert(`Could not load menu for item edit: ${error.message}`, 'error');
        }
      } finally {
        if (!cancelled) setMenuItemsLoaded(true);
      }
    })();

    return () => { cancelled = true; };
  }, [isEditingOrder, menuItemsLoaded, showAlert]);

  const applyFilters = useCallback((ordersToFilter, search, status, fromDate, toDate) => {
    let filtered = ordersToFilter;

    if (status !== 'all') {
      filtered = filtered.filter((o) => String(o.status || '').toLowerCase() === status.toLowerCase());
    }

    if (search.trim()) {
      const needle = search.toLowerCase();
      filtered = filtered.filter(o =>
        o.id.toString().includes(search) ||
        String(o.token_number || '').includes(search) ||
        (o.user_name && o.user_name.toLowerCase().includes(needle)) ||
        (o.user_email && o.user_email.toLowerCase().includes(needle)) ||
        (o.customer_name && o.customer_name.toLowerCase().includes(needle)) ||
        (o.customer_mobile && String(o.customer_mobile).includes(search))
      );
    }

    if (fromDate) {
      const fromTs = new Date(`${fromDate}T00:00:00`).getTime();
      filtered = filtered.filter((o) => new Date(o.timestamp).getTime() >= fromTs);
    }

    if (toDate) {
      const toTs = new Date(`${toDate}T23:59:59`).getTime();
      filtered = filtered.filter((o) => new Date(o.timestamp).getTime() <= toTs);
    }

    setFilteredOrders(filtered);
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiRequest('/orders/all');
      if (!Array.isArray(data)) {
        throw new Error('Invalid order data received.');
      }
      setOrders(data);

      const totalOrders = data.length;
      const pendingOrders = data.filter(
        (o) => o.status === 'pending' || o.status === 'Awaiting Payment' || o.status === 'Received' || o.status === 'Preparing' || o.status === 'Ready'
      ).length;
      const completedOrders = data.filter(
        (o) => o.status === 'completed' || o.status === 'Completed'
      ).length;
      const totalRevenue = data.reduce((sum, o) => sum + (o.total_amount || 0), 0);

      setStats({
        totalOrders,
        pendingOrders,
        completedOrders,
        totalRevenue
      });

      applyFilters(data, searchTerm, filterStatus, dateFrom, dateTo);
    } catch (error) {
      showAlert(`Could not load orders: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [applyFilters, dateFrom, dateTo, filterStatus, searchTerm, showAlert]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    applyFilters(orders, searchTerm, filterStatus, dateFrom, dateTo);
  }, [searchTerm, filterStatus, dateFrom, dateTo, orders, applyFilters]);

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      await apiRequest(`/orders/${orderId}/status`, 'PUT', { newStatus });
      showAlert(`Order #${orderId} status updated to ${newStatus}`, 'success');
      fetchOrders();
      setSelectedOrder(null);
    } catch (error) {
      showAlert(`Update failed: ${error.message}`, 'error');
    }
  };

  const handleMarkPaid = async (orderId) => {
    try {
      await apiRequest(`/orders/${orderId}/mark-paid`, 'PUT');
      showAlert(`Order #${orderId} marked as paid.`, 'success');
      fetchOrders();
      setSelectedOrder(null);
    } catch (error) {
      showAlert(`Mark paid failed: ${error.message}`, 'error');
    }
  };

  const handleRefundAction = async (orderId, action) => {
    try {
      setRefundActionLoading(true);
      const reasonText = (refundNoteInput || '').trim();
      const payload = {
        action,
        adminNote: reasonText || undefined,
        reason: reasonText || undefined
      };

      if (action === 'approve') {
        const parsedAmount = Number(refundAmountInput);
        if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
          showAlert('Enter a valid refund amount.', 'error');
          return;
        }
        payload.approvedAmount = parsedAmount;
      }

      await apiRequest(`/orders/${orderId}/refund`, 'PUT', payload);
      showAlert(`Refund ${action} action completed for order #${orderId}.`, 'success');
      await fetchOrders();
      const refreshed = await apiRequest(`/orders/${orderId}`);
      const logs = await apiRequest(`/orders/${orderId}/refund-audit`);
      if (typeof refreshed.items === 'string') {
        refreshed.items = JSON.parse(refreshed.items);
      }
      setSelectedOrder((prev) => ({
        ...refreshed,
        user_name: prev?.user_name,
        user_email: prev?.user_email
      }));
      setRefundAuditLogs(Array.isArray(logs) ? logs : []);
      setRefundAmountInput('');
      setRefundNoteInput('');
    } catch (error) {
      showAlert(`Refund ${action} failed: ${error.message}`, 'error');
    } finally {
      setRefundActionLoading(false);
    }
  };

  const openOrderDetails = async (order) => {
    setSelectedOrder(order);
    setIsEditingOrder(false);
    setOrderEditForm({
      token_number: order?.token_number ?? '',
      customer_name: order?.customer_name ?? '',
      customer_mobile: order?.customer_mobile ?? '',
      order_instruction: order?.order_instruction ?? '',
      total_amount: order?.total_amount ?? '',
    });
    setOrderEditItems(normalizeItemsForEdit(order?.items));
    setOrderEditItemsDirty(false);
    setAddMenuItemId('');
    setAddMenuItemQty('1');
    setRefundAmountInput(order?.refund_amount ?? order?.total_amount ?? '');
    setRefundNoteInput('');
    try {
      const logs = await apiRequest(`/orders/${order.id}/refund-audit`);
      setRefundAuditLogs(Array.isArray(logs) ? logs : []);
    } catch (error) {
      setRefundAuditLogs([]);
      showAlert(`Could not load refund audit: ${error.message}`, 'error');
    }
  };

  const handlePrint = (order) => {
    // 1. Prepare items
    const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items || [];
    
    // 2. Open a new window with a specific size (like a kitchen slip)
    const printWindow = window.open('', '_blank', 'width=450,height=600');
    
    // 3. Define the HTML for the cook's slip
    const content = `
      <html>
        <head>
          <title>KITCHEN SLIP - Order #${order.token_number || order.id}</title>
          <style>
            body { font-family: 'Courier New', Courier, monospace; padding: 15px; color: #000; }
            .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 10px; margin-bottom: 15px; }
            .order-id { font-size: 28px; font-weight: bold; margin: 5px 0; }
            .order-time { font-size: 14px; margin-bottom: 5px; }
            .items-container { margin-top: 15px; }
            .item-row { font-size: 20px; border-bottom: 1px solid #eee; padding: 10px 0; display: flex; align-items: center; }
            .item-qty { font-size: 24px; font-weight: bold; border: 2px solid #000; padding: 2px 10px; margin-right: 15px; min-width: 30px; text-align: center; }
            .item-name { flex-grow: 1; }
            .instruction-box { background: #f2f2f2; padding: 12px; margin-top: 20px; border: 1px solid #999; border-radius: 4px; }
            .instruction-title { font-weight: bold; font-size: 16px; margin-bottom: 5px; text-decoration: underline; }
            .instruction-text { font-size: 18px; font-style: italic; color: #d32f2f; }
            .footer { margin-top: 30px; text-align: center; font-size: 12px; border-top: 1px dashed #000; padding-top: 10px; color: #666; }
            @media print {
              @page { margin: 0; size: auto; }
              body { margin: 1cm; width: 100%; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div style="font-size: 14px; letter-spacing: 2px;">*** KITCHEN SLIP ***</div>
            <div class="order-id">#${order.token_number || order.id}</div>
            <div class="order-time">${new Date(order.timestamp).toLocaleString()}</div>
            <div style="font-size: 14px; margin-top: 5px;">Customer: ${order.customer_name || order.user_name || 'N/A'}</div>
          </div>
          
          <div class="items-container">
            ${items.map(item => `
              <div class="item-row">
                <span class="item-qty">${item.quantity}</span>
                <span class="item-name">${item.name}</span>
              </div>
            `).join('')}
          </div>

          ${order.order_instruction ? `
            <div class="instruction-box">
              <div class="instruction-title">SPECIAL INSTRUCTIONS:</div>
              <div class="instruction-text">${order.order_instruction}</div>
            </div>
          ` : ''}

          <div class="footer">
            DYPCET Cafeteria Management System<br>
            - Thank you -
          </div>

          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
                // Window stays open for review; can be closed manually.
              }, 500);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(content);
    printWindow.document.close();
  };

  const getStatusColor = (status) => {
    const s = status?.toLowerCase() || '';
    if (s.includes('awaiting')) return '#ff9800';
    if (s.includes('received') || s.includes('pending')) return '#ffc107';
    if (s.includes('preparing')) return '#17a2b8';
    if (s.includes('ready')) return '#28a745';
    if (s.includes('completed')) return '#20c997';
    if (s.includes('cancelled')) return '#dc3545';
    return '#6c757d';
  };

  const getStatusTextColor = (status) => {
    const s = status?.toLowerCase() || '';
    // Yellow and very light tones need dark text for readability.
    if (s.includes('awaiting')) return '#1b2430';
    if (s.includes('received') || s.includes('pending')) return '#1b2430';
    return '#ffffff';
  };

  const handleAdminSaveOrderEdits = async () => {
    if (!selectedOrder) return;
    setSavingOrderEdit(true);
    try {
      const payload = {
        token_number: orderEditForm.token_number === '' ? null : Number(orderEditForm.token_number),
        customer_name: String(orderEditForm.customer_name || '').trim(),
        customer_mobile: String(orderEditForm.customer_mobile || '').trim(),
        order_instruction: String(orderEditForm.order_instruction || '').trim(),
      };

      if (orderEditItemsDirty) {
        const normalized = (Array.isArray(orderEditItems) ? orderEditItems : []).map((it) => ({
          id: it?.id ? Number(it.id) : undefined,
          name: String(it?.name || '').trim(),
          price: Number(it?.price ?? 0),
          quantity: Number(it?.quantity ?? 0),
        })).filter((it) => it.name && Number.isFinite(it.price) && it.price >= 0 && Number.isFinite(it.quantity) && it.quantity > 0);

        if (normalized.length === 0) {
          showAlert('Add at least 1 valid item (name, price, qty).', 'error');
          return;
        }

        payload.items = normalized;
      } else {
        payload.total_amount = orderEditForm.total_amount === '' ? undefined : Number(orderEditForm.total_amount);
      }

      const res = await apiRequest(`/orders/${selectedOrder.id}/admin`, 'PUT', payload);
      showAlert('Order updated.', 'success');
      setIsEditingOrder(false);
      fetchOrders();
      if (res?.order) {
        const next = { ...selectedOrder, ...res.order };
        if (typeof next.items === 'string') {
          try { next.items = JSON.parse(next.items); } catch (_error) { /* ignore */ }
        }
        setSelectedOrder(next);
        setOrderEditItems(normalizeItemsForEdit(next.items));
        setOrderEditItemsDirty(false);
      }
    } catch (error) {
      showAlert(`Could not update order: ${error.message}`, 'error');
    } finally {
      setSavingOrderEdit(false);
    }
  };

  const handleAdminDeleteOrder = async () => {
    if (!selectedOrder) return;
    const displayNo = selectedOrder.token_number || selectedOrder.id;
    const ok = window.confirm(`Delete order #${displayNo}? This cannot be undone.`);
    if (!ok) return;

    try {
      await apiRequest(`/orders/${selectedOrder.id}`, 'DELETE');
      showAlert('Order deleted.', 'success');
      setSelectedOrder(null);
      setRefundAuditLogs([]);
      fetchOrders();
    } catch (error) {
      showAlert(`Could not delete order: ${error.message}`, 'error');
    }
  };

  const getStatusMutedBackground = (status) => {
    const s = status?.toLowerCase() || '';
    if (s.includes('awaiting')) return '#fff0e0';
    if (s.includes('received') || s.includes('pending')) return '#fff7d6';
    if (s.includes('preparing')) return '#e7f8fc';
    if (s.includes('ready')) return '#e9f9ef';
    if (s.includes('completed')) return '#e8faf6';
    if (s.includes('cancelled')) return '#fdebed';
    return '#f2f4f7';
  };

  const getStatusButtonTextColor = (status, isActive) => {
    if (!isActive) {
      const s = status?.toLowerCase() || '';
      if (s.includes('awaiting')) return '#8a4a00';
      if (s.includes('received') || s.includes('pending')) return '#7a5a00';
      if (s.includes('preparing')) return '#0f5f6d';
      if (s.includes('ready')) return '#1b6f2f';
      if (s.includes('completed')) return '#15785f';
      if (s.includes('cancelled')) return '#a52833';
      return '#324a63';
    }
    return getStatusTextColor(status);
  };

  const getDateLabel = (date) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const orderDate = new Date(date);
    const todayStr = today.toDateString();
    const yesterdayStr = yesterday.toDateString();
    const orderDateStr = orderDate.toDateString();

    if (orderDateStr === todayStr) return 'Today';
    if (orderDateStr === yesterdayStr) return 'Yesterday';
    return orderDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const groupOrdersByDay = (ordersToGroup) => {
    const grouped = {};
    
    ordersToGroup.forEach(order => {
      const dateKey = new Date(order.timestamp).toDateString();
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(order);
    });

    // Sort dates in descending order (newest first)
    return Object.entries(grouped)
      .sort(([dateA], [dateB]) => new Date(dateB) - new Date(dateA))
      .map(([date, orders]) => ({ date, orders }));
  };

  const getStatusIcon = (status) => {
    const s = status?.toLowerCase() || '';
    if (s.includes('awaiting')) return '💵';
    if (s.includes('received') || s.includes('pending')) return '•';
    if (s.includes('preparing')) return '•';
    if (s.includes('ready')) return '✓';
    if (s.includes('completed')) return '✓';
    if (s.includes('cancelled')) return '✕';
    return '•';
  };

  if (loading) {
    return <div className="loader">Loading Orders...</div>;
  }

  return (
    <div>
      <h2 style={{ marginTop: 0, marginBottom: '2rem' }}>Order Management</h2>

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">ORD</div> <div className="stat-content"> <div className="stat-value">{stats.totalOrders}</div>
            <div className="stat-label">Total Orders</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">PEN</div> <div className="stat-content"> <div className="stat-value">{stats.pendingOrders}</div>
            <div className="stat-label">Pending Orders</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">CMP</div> <div className="stat-content"> <div className="stat-value">{stats.completedOrders}</div>
            <div className="stat-label">Completed Orders</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">REV</div> <div className="stat-content"> <div className="stat-value">₹{stats.totalRevenue.toFixed(0)}</div>
            <div className="stat-label">Total Revenue</div>
          </div>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="orders-controls">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search by Order ID, Name, Email, or Mobile..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="orders-date-filters">
          <div className="date-filter-field">
            <label htmlFor="dateFrom">From</label>
            <input
              id="dateFrom"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div className="date-filter-field">
            <label htmlFor="dateTo">To</label>
            <input
              id="dateTo"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="filter-btn clear-dates-btn"
            onClick={() => {
              setDateFrom('');
              setDateTo('');
            }}
          >
            Clear Dates
          </button>
        </div>
        <div className="filter-buttons">
          <button
            className={`filter-btn ${filterStatus === 'all' ? 'active' : ''}`}
            onClick={() => setFilterStatus('all')}
          >
            All Orders
          </button>
          <button
            className={`filter-btn ${filterStatus === 'awaiting payment' ? 'active' : ''}`}
            onClick={() => setFilterStatus('awaiting payment')}
          >
            Awaiting Payment
          </button>
          <button
            className={`filter-btn ${filterStatus === 'received' ? 'active' : ''}`}
            onClick={() => setFilterStatus('received')}
          >
            Received
          </button>
          <button
            className={`filter-btn ${filterStatus === 'preparing' ? 'active' : ''}`}
            onClick={() => setFilterStatus('preparing')}
          >
            Preparing
          </button>
          <button
            className={`filter-btn ${filterStatus === 'ready' ? 'active' : ''}`}
            onClick={() => setFilterStatus('ready')}
          >
            Ready
          </button>
          <button
            className={`filter-btn ${filterStatus === 'completed' ? 'active' : ''}`}
            onClick={() => setFilterStatus('completed')}
          >
            Completed
          </button>
        </div>
      </div>

      {/* Orders Display */}
      {filteredOrders.length === 0 ? (
        <p className="no-items">No orders found matching your criteria.</p>
      ) : (
        <div className="orders-daywise">
          {groupOrdersByDay(filteredOrders).map(({ date, orders }) => (
            <div key={date} className="day-section">
              <div className="day-header">
                <h3>{getDateLabel(date)}</h3>
                <span className="order-count">{orders.length} orders</span>
              </div>

              <div className="orders-grid">
{orders.map(order => {
                  const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items || [];
                  const customerLabel = String(order.customer_name || order.user_name || '').trim();
                  const customerMobile = String(order.customer_mobile || '').trim();
                  return (
                    <div key={order.id} className="order-card">
                      <div className="order-header">
                        <div className="order-id">Order #{order.token_number || order.id}</div>
                        <div 
                          className="status-badge"
                          style={{ backgroundColor: getStatusColor(order.status), color: getStatusTextColor(order.status) }}
                        >
                          {getStatusIcon(order.status)} {order.status}
                        </div>
                      </div>

                      <div className="order-details">
                        <div className="detail-row">
                          <span className="label">Date:</span>
                          <span className="value">{new Date(order.timestamp).toLocaleString()}</span>
                        </div>
                        {(customerLabel || customerMobile) && (
                          <div className="detail-row">
                            <span className="label">Customer:</span>
                            <span className="value">
                              {customerLabel || 'Guest'}{customerMobile ? ` • ${customerMobile}` : ''}
                            </span>
                          </div>
                        )}
                  <div className="detail-row">
                    <span className="label">Amount:</span>
                    <span className="value amount">₹{(order.total_amount || 0).toFixed(2)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Items:</span>
                    <span className="value">{items.length} item(s)</span>
                  </div>
                  {order.order_instruction && (
                    <div className="detail-row instruction-row">
                      <span className="label">Instruction:</span>
                      <span className="value">{order.order_instruction}</span>
                    </div>
                  )}
                </div>

                <div className="order-items-preview">
                  {items.slice(0, 2).map(item => (
                    <div key={item.id} className="item-preview">
                      <span>{item.quantity}x {item.name}</span>
                    </div>
                  ))}
                  {items.length > 2 && (
                    <div className="item-preview more">+{items.length - 2} more</div>
                  )}
                </div>

                <button
                  className="view-details-btn"
                  onClick={() => openOrderDetails(order)}
                >
                  View Details -></button>
              </div>
            );
          })}
            </div>
            </div>
          ))}
        </div>
      )}

      {/* Order Details Modal */}
      {selectedOrder && (
        <div className="modal-overlay" onClick={() => { setSelectedOrder(null); setRefundAuditLogs([]); setIsEditingOrder(false); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="header-left">
                <h3>Order Details #{selectedOrder.token_number || selectedOrder.id}</h3>
                <div 
                  className="modal-status-badge"
                  style={{ backgroundColor: getStatusColor(selectedOrder.status), color: getStatusTextColor(selectedOrder.status) }}
                >
                  {getStatusIcon(selectedOrder.status)} {selectedOrder.status}
                </div>
                <button 
                  className="print-btn" 
                  onClick={() => handlePrint(selectedOrder)}
                  style={{
                    backgroundColor: '#333',
                    color: 'white',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    marginLeft: '15px',
                    border: 'none',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}
                >
                  🖨️ Print Receipt
                </button>
                <button
                  className="print-btn"
                  onClick={() => setIsEditingOrder((v) => !v)}
                  style={{
                    backgroundColor: '#0A2342',
                    color: 'white',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    marginLeft: '10px',
                    border: 'none',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}
                >
                  ✏️ {isEditingOrder ? 'Close Edit' : 'Edit'}
                </button>
                <button
                  className="print-btn"
                  onClick={handleAdminDeleteOrder}
                  style={{
                    backgroundColor: '#dc3545',
                    color: 'white',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    marginLeft: '10px',
                    border: 'none',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}
                >
                  🗑️ Delete
                </button>
              </div>
              <button className="close-btn" onClick={() => { setSelectedOrder(null); setRefundAuditLogs([]); setIsEditingOrder(false); }}>×</button>
            </div>

            <div className="modal-body">
              {isEditingOrder && (
                <div className="quick-action" style={{ background: '#f8fbff', borderColor: '#cfe2ff' }}>
                  <span className="action-icon">✏️</span>
                  <span className="action-text">Edit order fields (admin only). Use carefully.</span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', width: '100%', marginTop: '10px' }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      Token Number
                      <input
                        type="number"
                        min="1"
                        value={orderEditForm.token_number}
                        onChange={(e) => setOrderEditForm((p) => ({ ...p, token_number: e.target.value }))}
                      />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      Customer Name
                      <input
                        type="text"
                        value={orderEditForm.customer_name}
                        onChange={(e) => setOrderEditForm((p) => ({ ...p, customer_name: e.target.value }))}
                      />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      Customer Mobile
                      <input
                        type="tel"
                        value={orderEditForm.customer_mobile}
                        onChange={(e) => setOrderEditForm((p) => ({ ...p, customer_mobile: e.target.value }))}
                      />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      Total Amount
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={orderEditForm.total_amount}
                        onChange={(e) => setOrderEditForm((p) => ({ ...p, total_amount: e.target.value }))}
                        disabled={orderEditItemsDirty}
                      />
                      {orderEditItemsDirty && (
                        <small className="order-edit-help">Total is auto-calculated from items (incl. CGST/SGST).</small>
                      )}
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, gridColumn: '1 / -1' }}>
                      Order Instruction
                      <textarea
                        rows="2"
                        value={orderEditForm.order_instruction}
                        onChange={(e) => setOrderEditForm((p) => ({ ...p, order_instruction: e.target.value }))}
                      />
                    </label>
                  </div>

                  <div className="order-items-editor">
                    <div className="order-items-editor__header">
                      <div className="order-items-editor__title">Order Items</div>
                      <div className="order-items-editor__subtitle">Editing items recalculates total with 2.5% CGST + 2.5% SGST.</div>
                    </div>

                    <div className="order-items-editor__grid order-items-editor__grid--head">
                      <div>Item</div>
                      <div>Price</div>
                      <div>Qty</div>
                      <div>Line</div>
                      <div></div>
                    </div>

                    {orderEditItems.map((item, idx) => {
                      const line = (Number(item?.price ?? 0) * Number(item?.quantity ?? 0)) || 0;
                      return (
                        <div className="order-items-editor__grid" key={`${item?.id ?? item?.name ?? 'item'}-${idx}`}>
                          <input
                            type="text"
                            value={item?.name ?? ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              setOrderEditItems((prev) => prev.map((it, i) => (i === idx ? { ...it, name: value } : it)));
                              setOrderEditItemsDirty(true);
                            }}
                            placeholder="Item name"
                          />
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item?.price ?? ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              setOrderEditItems((prev) => prev.map((it, i) => (i === idx ? { ...it, price: value } : it)));
                              setOrderEditItemsDirty(true);
                            }}
                            placeholder="0"
                          />
                          <input
                            type="number"
                            step="1"
                            min="1"
                            value={item?.quantity ?? ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              setOrderEditItems((prev) => prev.map((it, i) => (i === idx ? { ...it, quantity: value } : it)));
                              setOrderEditItemsDirty(true);
                            }}
                            placeholder="1"
                          />
                          <div className="order-items-editor__line">₹{Number.isFinite(line) ? line.toFixed(2) : '0.00'}</div>
                          <button
                            type="button"
                            className="order-items-editor__remove"
                            onClick={() => {
                              setOrderEditItems((prev) => prev.filter((_it, i) => i !== idx));
                              setOrderEditItemsDirty(true);
                            }}
                            title="Remove item"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}

                    <div className="order-items-editor__add">
                      <select
                        value={addMenuItemId}
                        onChange={(e) => setAddMenuItemId(e.target.value)}
                      >
                        <option value="">Add from menu…</option>
                        {menuItemsForEdit.map((mi) => (
                          <option key={mi.id} value={String(mi.id)}>
                            {mi.name} (₹{Number(mi.price || 0).toFixed(2)})
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={addMenuItemQty}
                        onChange={(e) => setAddMenuItemQty(e.target.value)}
                        placeholder="Qty"
                      />
                      <button
                        type="button"
                        className="order-items-editor__addbtn"
                        onClick={() => {
                          const idNum = Number(addMenuItemId);
                          if (!Number.isFinite(idNum) || idNum <= 0) return;
                          const qty = Math.max(1, Math.floor(Number(addMenuItemQty || 1) || 1));
                          const found = menuItemsForEdit.find((m) => Number(m.id) === idNum);
                          if (!found) return;

                          setOrderEditItems((prev) => {
                            const existingIdx = prev.findIndex((it) => Number(it?.id) === idNum);
                            if (existingIdx >= 0) {
                              return prev.map((it, i) => (i === existingIdx ? { ...it, quantity: String((Number(it.quantity || 0) || 0) + qty) } : it));
                            }
                            return [
                              ...prev,
                              {
                                id: idNum,
                                name: String(found.name || '').trim(),
                                price: String(found.price ?? 0),
                                quantity: String(qty),
                              }
                            ];
                          });
                          setOrderEditItemsDirty(true);
                          setAddMenuItemId('');
                          setAddMenuItemQty('1');
                        }}
                        disabled={!addMenuItemId}
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        className="order-items-editor__addbtn secondary"
                        onClick={() => {
                          setOrderEditItems((prev) => ([...prev, { id: null, name: '', price: '0', quantity: '1' }]));
                          setOrderEditItemsDirty(true);
                        }}
                      >
                        Add custom
                      </button>
                    </div>

                    <div className="order-items-editor__totals">
                      <div><span>Subtotal</span><span>₹{previewTotals.subTotal.toFixed(2)}</span></div>
                      <div><span>CGST (2.5%)</span><span>₹{previewTotals.cgstAmount.toFixed(2)}</span></div>
                      <div><span>SGST (2.5%)</span><span>₹{previewTotals.sgstAmount.toFixed(2)}</span></div>
                      <div className="grand"><span>Grand Total</span><span>₹{previewTotals.grandTotal.toFixed(2)}</span></div>
                      {orderEditItemsDirty && (
                        <div className="hint">Click “Save Changes” to apply item edits.</div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                    <button
                      type="button"
                      className="accept-order-btn"
                      onClick={handleAdminSaveOrderEdits}
                      disabled={savingOrderEdit}
                    >
                      {savingOrderEdit ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              )}
              {/* Quick Actions */}
              {selectedOrder.status === 'Received' && (
                <div className="quick-action">
                  <span className="action-icon">•</span>
                  <span className="action-text">This order is ready to be processed. Click "Accepting Order" to start preparation.</span>
                  <button 
                    className="accept-order-btn"
                    onClick={() => handleStatusChange(selectedOrder.id, 'Preparing')}
                  >
                    Accept & Start Preparing
                  </button>
                </div>
              )}

              {selectedOrder.status === 'Preparing' && (
                <div className="quick-action preparing">
                  <span className="action-icon">•</span>
                  <span className="action-text">Order is being prepared. Click "Ready for Pickup" when done.</span>
                  <button 
                    className="accept-order-btn ready"
                    onClick={() => handleStatusChange(selectedOrder.id, 'Ready')}
                  >
                    Ready for Pickup
                  </button>
                </div>
              )}

              {selectedOrder.status === 'Ready' && (
                <div className="quick-action ready">
                  <span className="action-icon">•</span>
                  <span className="action-text">Order is ready! Click "Mark Completed" once customer picks it up.</span>
                  <button 
                    className="accept-order-btn completed"
                    onClick={() => handleStatusChange(selectedOrder.id, 'Completed')}
                  >
                    Mark as Completed
                  </button>
                </div>
              )}

              {selectedOrder.status === 'Completed' && (
                <div className="quick-action completed">
                  <span className="action-icon">•</span>
                  <span className="action-text">Order completed successfully!</span>
                </div>
              )}

              {selectedOrder.status === 'Cancelled' && (
                <div className="quick-action cancelled">
                  <span className="action-icon">•</span>
                  <span className="action-text">This order has been cancelled.</span>
                </div>
              )}

              {/* Order Meta Info */}
              <div className="meta-info">
                <div className="meta-item">
                  <span className="meta-label">Order Date:</span>
                  <span className="meta-value">{new Date(selectedOrder.timestamp).toLocaleDateString()}</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Order Time:</span>
                  <span className="meta-value">{new Date(selectedOrder.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Total Items:</span>
                  <span className="meta-value">{(typeof selectedOrder.items === 'string' ? JSON.parse(selectedOrder.items) : selectedOrder.items || []).length}</span>
                </div>
              </div>

              {/* Customer Info */}
              <div className="section">
                <h4>Customer Information</h4>
                <div className="customer-card">
                  <div className="customer-field">
                    <span className="label">Full Name</span>
                    <span className="value">{selectedOrder.customer_name || selectedOrder.user_name || 'N/A'}</span>
                  </div>
                  <div className="customer-field">
                    <span className="label">Email</span>
                    <span className="value">{selectedOrder.user_email || 'N/A'}</span>
                  </div>
                  {selectedOrder.customer_mobile && (
                    <div className="customer-field">
                      <span className="label">Mobile</span>
                      <span className="value">{selectedOrder.customer_mobile}</span>
                    </div>
                  )}
                  {(selectedOrder.order_source || selectedOrder.payment_method || selectedOrder.payment_status) && (
                    <div className="customer-field">
                      <span className="label">Order Type</span>
                      <span className="value">
                        {String(selectedOrder.order_source || 'ONLINE').toUpperCase()}
                        {selectedOrder.payment_method ? ` • ${String(selectedOrder.payment_method).toUpperCase()}` : ''}
                        {selectedOrder.payment_status ? ` • ${String(selectedOrder.payment_status).toUpperCase()}` : ''}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="section">
                <h4>Order Instruction</h4>
                <div className="customer-card">
                  <div className="customer-field">
                    <span className="value">
                      {String(selectedOrder.order_instruction || '').trim() || 'No instruction provided.'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Order Items - Enhanced */}
              <div className="section">
                <h4>Order Items</h4>
                <div className="items-list enhanced">
                  {(typeof selectedOrder.items === 'string' ? JSON.parse(selectedOrder.items) : selectedOrder.items || []).map((item, idx) => (
                    <div key={item.id || idx} className="item-row enhanced">
                      <div className="item-left">
                        <div className="item-number">{idx + 1}</div>
                        <div className="item-info">
                          <div className="item-name">{item.name}</div>
                          <div className="item-qty-info">Qty: <strong>{item.quantity}</strong></div>
                        </div>
                      </div>
                      <div className="item-right">
                        <div className="item-price">₹{((item.price || 0) * item.quantity).toFixed(2)}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="items-total enhanced">
                  <div className="total-label">Grand Total</div>
                  <div className="total-amount">₹{(selectedOrder.total_amount || 0).toFixed(2)}</div>
                </div>
              </div>

              {/* Order Progress Timeline */}
              <div className="section">
                <h4>Order Progress</h4>
                <div className="progress-timeline">
                  {(() => {
                    const isOffline = String(selectedOrder.order_source || '').toUpperCase() === 'OFFLINE' || selectedOrder.status === 'Awaiting Payment';
                    const statuses = isOffline
                      ? ['Awaiting Payment', 'Received', 'Preparing', 'Ready', 'Completed']
                      : ['Received', 'Preparing', 'Ready', 'Completed'];

                    return statuses.map((status, idx) => {
                      const currentIdx = statuses.indexOf(selectedOrder.status);
                      const isCompleted = idx <= currentIdx && currentIdx !== -1;
                      const isCurrent = selectedOrder.status === status;

                      return (
                        <div
                          key={status}
                          className={`progress-item ${isCompleted ? 'completed' : ''} ${isCurrent ? 'active' : ''}`}
                        >
                          <div className="progress-dot">
                            {isCompleted ? '✓' : idx + 1}
                          </div>
                          <div className="progress-label">{status}</div>
                          {idx < statuses.length - 1 && <div className="progress-line"></div>}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* Offline Cash Actions */}
              {String(selectedOrder.order_source || '').toUpperCase() === 'OFFLINE' && (
                <div className="section action-section">
                  <h4>Offline Payment</h4>
                  {selectedOrder.status === 'Awaiting Payment' ? (
                    <div className="status-buttons enhanced" style={{ gap: '0.75rem' }}>
                      <button
                        type="button"
                        className="status-btn enhanced active"
                        onClick={() => handleMarkPaid(selectedOrder.id)}
                        style={{ backgroundColor: '#ff9800', borderColor: '#ff9800', color: '#1b2430' }}
                      >
                        💵 <span>Mark Paid (Generate Token)</span>
                      </button>
                      <button
                        type="button"
                        className="status-btn enhanced"
                        onClick={() => handleStatusChange(selectedOrder.id, 'Cancelled')}
                        style={{ borderColor: '#dc3545', color: '#a52833', backgroundColor: '#fdebed' }}
                      >
                        ✕ <span>Cancel Unpaid Order</span>
                      </button>
                      <div style={{ color: '#666', paddingTop: '0.25rem' }}>
                        Note: Unpaid offline orders auto-cancel after 30 minutes.
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: '#666' }}>
                      This offline order is already processed (paid or cancelled).
                    </div>
                  )}
                </div>
              )}

              {/* Status Update Actions */}
              <div className="section action-section">
                <h4>Change Status</h4>
                <div className="status-buttons enhanced">
                  {['Received', 'Preparing', 'Ready', 'Completed', 'Cancelled'].map(status => (
                    (() => {
                      const isActive = selectedOrder.status === status;
                      return (
                    <button
                      key={status}
                      className={`status-btn enhanced ${isActive ? 'active' : ''}`}
                      onClick={() => handleStatusChange(selectedOrder.id, status)}
                      style={{
                        borderColor: getStatusColor(status),
                        color: getStatusButtonTextColor(status, isActive),
                        backgroundColor: isActive ? getStatusColor(status) : getStatusMutedBackground(status)
                      }}
                    >
                      {getStatusIcon(status)}
                      <span>{status}</span>
                    </button>
                      );
                    })()
                  ))}
                </div>
              </div>

              <div className="section action-section">
                <h4>Refund Management</h4>
                <div className="refund-summary-block">
                  <div><strong>Refund Status:</strong> {selectedOrder.refund_status || 'None'}</div>
                  {selectedOrder.refund_reason && <div><strong>Reason:</strong> {selectedOrder.refund_reason}</div>}
                  {selectedOrder.refund_amount !== null && selectedOrder.refund_amount !== undefined && (
                    <div><strong>Amount:</strong> INR {Number(selectedOrder.refund_amount || 0).toFixed(2)}</div>
                  )}
                  {selectedOrder.refund_admin_note && (
                    <div><strong>Admin Note:</strong> {selectedOrder.refund_admin_note}</div>
                  )}
                </div>

                {selectedOrder.refund_status === 'Requested' && (
                  <div className="refund-actions-row">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="refund-input"
                      value={refundAmountInput}
                      onChange={(e) => setRefundAmountInput(e.target.value)}
                      placeholder="Refund amount"
                    />
                    <input
                      type="text"
                      className="refund-input"
                      value={refundNoteInput}
                      onChange={(e) => setRefundNoteInput(e.target.value)}
                      placeholder="Admin note (optional)"
                    />
                    <button
                      type="button"
                      className="button button-small"
                      disabled={refundActionLoading}
                      onClick={() => handleRefundAction(selectedOrder.id, 'approve')}
                    >
                      One-Click Approve
                    </button>
                    <button
                      type="button"
                      className="button button-small danger-btn"
                      disabled={refundActionLoading}
                      onClick={() => handleRefundAction(selectedOrder.id, 'reject')}
                    >
                      One-Click Reject
                    </button>
                  </div>
                )}

                {selectedOrder.refund_status === 'Approved' && (
                  <div className="refund-actions-row">
                    <input
                      type="text"
                      className="refund-input"
                      value={refundNoteInput}
                      onChange={(e) => setRefundNoteInput(e.target.value)}
                      placeholder="Processing note (optional)"
                    />
                    <button
                      type="button"
                      className="button button-small"
                      disabled={refundActionLoading}
                      onClick={() => handleRefundAction(selectedOrder.id, 'process')}
                    >
                      Process Refund (Live API)
                    </button>

                  </div>
                )}

                {refundAuditLogs.length > 0 && (
                  <div className="refund-summary-block">
                    <div><strong>Refund Audit Trail</strong></div>
                    {refundAuditLogs.map((log) => (
                      <div key={`audit-${log.id}`} style={{ marginTop: '8px' }}>
                        <div>
                          <strong>{String(log.action || '').toUpperCase()}</strong>
                          {' '}by {log.processed_by_name || `User ${log.processed_by}`}
                          {' '}on {new Date(log.created_at).toLocaleString()}
                        </div>
                        {log.amount !== null && log.amount !== undefined && (
                          <div>Amount: INR {Number(log.amount || 0).toFixed(2)}</div>
                        )}
                        <div>Reason: {log.reason || 'No reason provided.'}</div>
                        <div>Status: {log.previous_refund_status || '-'} {'->'} {log.next_refund_status || '-'}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="close-modal-btn" onClick={() => { setSelectedOrder(null); setRefundAuditLogs([]); setIsEditingOrder(false); }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminOrdersPage;



