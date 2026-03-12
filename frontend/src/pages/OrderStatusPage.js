// frontend/src/pages/OrderStatusPage.js

import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAlert } from '../hooks/useAlert';
import apiRequest from '../utils/api';
import { getToken } from '../utils/auth';

const STATUS_POLL_INTERVAL_MS = 10000; // 10 seconds

function OrderStatusPage() {
  const { isLoggedIn } = useAuth();
  const { showAlert } = useAlert();
  const navigate = useNavigate();
  const { orderId } = useParams();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [isSubmittingRefund, setIsSubmittingRefund] = useState(false);
  const previousStatusRef = useRef(null);

  useEffect(() => {
    if (!isLoggedIn) {
      showAlert('Please log in to view order status.', 'error');
      navigate('/login');
      return;
    }

    if (!orderId) {
      showAlert('No order ID provided.', 'error');
      navigate('/orders');
      return;
    }

    const fetchOrderStatus = async ({ initialLoad = false } = {}) => {
      try {
        if (initialLoad) {
          setLoading(true);
        }

        const data = await apiRequest(`/orders/${orderId}`);

        if (typeof data.items === 'string') {
          data.items = JSON.parse(data.items);
        }

        const currentStatus = data.status;
        const previousStatus = previousStatusRef.current;

        if (previousStatus && previousStatus !== currentStatus) {
          showAlert(`Order status updated: ${currentStatus}`, 'info');
        }
        previousStatusRef.current = currentStatus;

        setOrder(data);
        setLastSyncedAt(Date.now());
      } catch (error) {
        if (initialLoad) {
          showAlert(`Error loading order status: ${error.message}`, 'error');
          navigate('/orders');
        }
      } finally {
        if (initialLoad) {
          setLoading(false);
        }
      }
    };

    fetchOrderStatus({ initialLoad: true });

    const pollTimer = setInterval(() => {
      fetchOrderStatus({ initialLoad: false });
    }, STATUS_POLL_INTERVAL_MS);

    return () => {
      clearInterval(pollTimer);
    };
  }, [isLoggedIn, navigate, orderId, showAlert]);

  if (!isLoggedIn || !orderId) {
    return null;
  }

  const statusSteps = ['Received', 'Preparing', 'Ready', 'Completed', 'Cancelled'];
  const statusMeta = {
    Received: { icon: '🧾', subtitle: 'Order accepted' },
    Preparing: { icon: '👨‍🍳', subtitle: 'Cooking now' },
    Ready: { icon: '📦', subtitle: 'Pickup ready' },
    Completed: { icon: '✅', subtitle: 'Delivered' },
    Cancelled: { icon: '❌', subtitle: 'Order cancelled' }
  };
  const currentStatusIndex = order ? statusSteps.indexOf(order.status) : -1;
  const normalizedProgressIndex = order?.status === 'Cancelled'
    ? 0
    : Math.max(0, Math.min(3, currentStatusIndex));
  const progressPercent = Math.round((normalizedProgressIndex / 3) * 100);
  const normalizedRefundStatus = (order?.refund_status || 'None').toLowerCase();
  const canRequestRefund = order
    && ['received', 'preparing', 'cancelled'].includes((order.status || '').toLowerCase())
    && !['requested', 'approved', 'processed'].includes(normalizedRefundStatus);
  const shouldShowBill = order && (order.status === 'Ready' || order.status === 'Completed');
  const itemsSubtotal = order?.items
    ? order.items.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 0)), 0)
    : 0;
  const orderTotal = Number(order?.total_amount || 0);
  const extraCharges = Math.max(0, orderTotal - itemsSubtotal);
  const handleDownloadBill = async () => {
    if (!order) return;
    try {
      const token = getToken();
      const response = await fetch(`/api/orders/${order.id}/bill.pdf`, {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (!response.ok) {
        throw new Error('Failed to download bill PDF.');
      }

      const contentDisposition = response.headers.get('content-disposition') || '';
      const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
      const filename = filenameMatch?.[1] || `DYPCET_Bill_Order_${order.id}.pdf`;

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      showAlert(error.message || 'Unable to download bill.', 'error');
    }
  };

  const handleRequestRefund = async () => {
    if (!order || isSubmittingRefund) return;
    const reasonInput = window.prompt('Please enter a short reason for refund request:', 'Need refund');
    if (reasonInput === null) return;
    const reason = reasonInput.trim();
    if (!reason) {
      showAlert('Refund reason is required.', 'error');
      return;
    }

    try {
      setIsSubmittingRefund(true);
      const result = await apiRequest(`/orders/${order.id}/refund-request`, 'POST', { reason });
      showAlert(result?.message || 'Refund request submitted.', 'success');
      const refreshed = await apiRequest(`/orders/${order.id}`);
      if (typeof refreshed.items === 'string') {
        refreshed.items = JSON.parse(refreshed.items);
      }
      setOrder(refreshed);
      setLastSyncedAt(Date.now());
    } catch (error) {
      showAlert(error.message || 'Unable to submit refund request.', 'error');
    } finally {
      setIsSubmittingRefund(false);
    }
  };

  return (
    <main className="container">
      <h2>Your Order Status</h2>
      <div id="status-container">
        {loading ? (
          <div className="order-status-skeleton" aria-hidden="true">
            <div className="status-skeleton-title shimmer" />
            <div className="status-skeleton-line shimmer" />
            <div className="status-skeleton-progress shimmer" />
            <div className="status-skeleton-list-item shimmer" />
            <div className="status-skeleton-list-item shimmer" />
            <div className="status-skeleton-list-item shimmer" />
          </div>
        ) : !order ? (
          <p className="error-message">Order details not found.</p>
        ) : (
          <>
            <div className="status-header"><h3>Order #{order.id} Status</h3></div>
            <p style={{ textAlign: 'center', color: '#666', marginTop: '-0.75rem' }}>
              Status auto-refreshes every 10 seconds
              {lastSyncedAt ? ` • Last synced: ${new Date(lastSyncedAt).toLocaleTimeString()}` : ''}
            </p>

            {order.status === 'Preparing' && (
              <div className="preparing-countdown-box">
                <h4>Kitchen is preparing your order</h4>
                <p>Order should be ready soon. Please watch for status update.</p>
              </div>
            )}

            {order.status === 'Ready' && (
              <div className="ready-collect-box">
                <h4>Your order is ready</h4>
                <p>Please collect your item from the cafeteria counter.</p>
              </div>
            )}

            {order.refund_status && order.refund_status !== 'None' && (
              <div className="refund-status-box">
                <h4>Refund: {order.refund_status}</h4>
                {order.refund_amount !== null && order.refund_amount !== undefined && (
                  <p>Refund Amount: {'\u20B9'}{Number(order.refund_amount || 0).toFixed(2)}</p>
                )}
                {order.refund_admin_note && <p>Note: {order.refund_admin_note}</p>}
              </div>
            )}

            <div className="status-progress-summary">
              <div className="summary-top">
                <strong>Progress</strong>
                <span>{order.status === 'Cancelled' ? 'Cancelled' : `${progressPercent}% Complete`}</span>
              </div>
              <div className="summary-track">
                <div className="summary-fill" style={{ width: `${order.status === 'Cancelled' ? 100 : progressPercent}%` }} />
              </div>
            </div>

            <div className="status-progress-bar">
              {statusSteps.map((step, index) => (
                <div
                  key={step}
                  className={`progress-step ${index <= currentStatusIndex ? 'completed' : ''} ${index === currentStatusIndex ? 'active' : ''} ${order.status === 'Cancelled' && step === 'Cancelled' ? 'cancelled' : ''}`}
                >
                  <div className="step-dot">
                    <span>{statusMeta[step]?.icon || '•'}</span>
                  </div>
                  <div className="step-label">{step}</div>
                  <div className="step-subtitle">{statusMeta[step]?.subtitle || ''}</div>
                </div>
              ))}
            </div>

            <h4>Items:</h4>
            <ul className="status-item-list">
              {order.items && order.items.length > 0 ? (
                order.items.map((item) => (
                  <li key={item.id}>
                    <span>{item.quantity}x {item.name}</span>
                    <span>{'\u20B9'}{((item.price || 0) * item.quantity).toFixed(2)}</span>
                  </li>
                ))
              ) : (
                <li>No items found for this order.</li>
              )}
            </ul>

            {shouldShowBill && (
              <div className="order-bill-card">
                <h4>Your Bill</h4>
                <div className="bill-rows">
                  {order.items && order.items.map((item) => (
                    <div className="bill-row" key={`bill-${item.id}`}>
                      <span>{item.name} x {item.quantity}</span>
                      <span>{'\u20B9'}{((item.price || 0) * (item.quantity || 0)).toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="bill-row">
                    <span>Subtotal</span>
                    <span>{'\u20B9'}{itemsSubtotal.toFixed(2)}</span>
                  </div>
                  {extraCharges > 0 && (
                    <div className="bill-row">
                      <span>Taxes & Charges</span>
                      <span>{'\u20B9'}{extraCharges.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="bill-row bill-total">
                    <span>Total Paid</span>
                    <span>{'\u20B9'}{orderTotal.toFixed(2)}</span>
                  </div>
                </div>
                <div className="order-bill-actions">
                  <button type="button" className="button" onClick={handleDownloadBill}>
                    Download Bill (PDF)
                  </button>
                </div>
              </div>
            )}

            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
              {canRequestRefund && (
                <button
                  type="button"
                  className="button button-small"
                  onClick={handleRequestRefund}
                  disabled={isSubmittingRefund}
                  style={{ marginRight: '0.6rem' }}
                >
                  {isSubmittingRefund ? 'Submitting...' : 'Request Refund'}
                </button>
              )}
              <Link to="/orders" className="button button-small">Back to Order History</Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default OrderStatusPage;
