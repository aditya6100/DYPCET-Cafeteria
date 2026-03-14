// frontend/src/pages/OrderHistoryPage.js

import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAlert } from '../hooks/useAlert';
import apiRequest from '../utils/api';

function OrderHistoryPage() {
  const { isLoggedIn } = useAuth();
  const { showAlert } = useAlert();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn) {
      return;
    }

    const fetchOrders = async () => {
      try {
        setLoading(true);
        const data = await apiRequest('/orders/history');
        setOrders(data);
      } catch (error) {
        showAlert(`Error loading order history: ${error.message}`, 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [isLoggedIn, navigate, showAlert]);

  if (!isLoggedIn) {
    return (
      <main className="container">
        <h2>Your Order History</h2>
        <p style={{ color: '#666' }}>
          Please log in to view your order history.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          <Link to="/login" className="button">Login</Link>
          <Link to="/menu-items" className="button button-small">Back to Menu</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <h2>Your Order History</h2>
      <div id="history-container">
        {loading ? (
          <div className="orders-history-skeleton" aria-hidden="true">
            <div className="history-skeleton-head shimmer" />
            {Array.from({ length: 5 }).map((_, idx) => (
              <div key={`history-skeleton-${idx}`} className="history-skeleton-row">
                <span className="shimmer" />
                <span className="shimmer" />
                <span className="shimmer" />
                <span className="shimmer" />
                <span className="shimmer" />
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          <p>No past orders.</p>
        ) : (
          <div className="responsive-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Date</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Refund</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {orders.map(order => (
                  <tr key={order.id}>
                    <td>#{order.id}</td>
                    <td>{new Date(order.timestamp).toLocaleDateString()}</td>
                    <td>₹{(order.total_amount || 0).toFixed(2)}</td>
                    <td>{order.status}</td>
                    <td>{order.refund_status && order.refund_status !== 'None' ? order.refund_status : '-'}</td>
                    <td><Link to={`/status/${order.id}`} className="button button-small">View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

export default OrderHistoryPage;
