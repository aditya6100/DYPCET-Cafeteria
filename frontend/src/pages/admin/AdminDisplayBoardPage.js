import React, { useCallback, useEffect, useMemo, useState } from 'react';
import apiRequest from '../../utils/api';
import { useAlert } from '../../hooks/useAlert';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import './AdminDisplayBoardPage.css';

const REFRESH_INTERVAL_MS = 10000;
const MAX_CARDS_PER_COLUMN = 12;

function AdminDisplayBoardPage({ kiosk = false }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const { showAlert } = useAlert();
  const { isLoggedIn, isAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoggedIn) {
      showAlert('Please log in to access display board.', 'error');
      navigate('/login');
      return;
    }
    if (!isAdmin) {
      showAlert('Only admin/staff can access display board.', 'error');
      navigate('/');
    }
  }, [isAdmin, isLoggedIn, navigate, showAlert]);

  const fetchOrders = useCallback(async ({ initial = false } = {}) => {
    try {
      if (initial) setLoading(true);
      const data = await apiRequest('/orders/all');
      if (!Array.isArray(data)) {
        throw new Error('Invalid order data received.');
      }
      const normalized = data.map((order) => ({
        ...order,
        items: typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || [])
      }));
      setOrders(normalized);
      setLastUpdated(new Date());
    } catch (error) {
      if (initial) {
        showAlert(`Could not load display board: ${error.message}`, 'error');
      }
    } finally {
      if (initial) setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => {
    if (!isLoggedIn || !isAdmin) return;
    fetchOrders({ initial: true });
    const timer = setInterval(() => fetchOrders({ initial: false }), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isAdmin, isLoggedIn, fetchOrders]);

  const preparingOrders = useMemo(
    () => orders
      .filter((o) => (o.status || '').toLowerCase() === 'preparing')
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, MAX_CARDS_PER_COLUMN),
    [orders]
  );

  const completedOrders = useMemo(
    () => orders
      .filter((o) => (o.status || '').toLowerCase() === 'completed')
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, MAX_CARDS_PER_COLUMN),
    [orders]
  );

  const handleFullscreen = () => {
    const root = document.documentElement;
    if (document.fullscreenElement) {
      document.exitFullscreen();
      return;
    }
    root.requestFullscreen();
  };

  const handleOpenWindow = () => {
    window.open('/admin/display-window', 'cafeteria-display-board', 'width=1920,height=1080');
  };

  if (!isLoggedIn || !isAdmin) {
    return null;
  }

  return (
    <div className="display-board-page">
      <div className="display-board-header">
        <div className="display-title-wrap">
          <span className="display-kicker">Live Kitchen Monitor</span>
          <h2>{kiosk ? 'Live Order Display' : 'Cafeteria Live Display Board'}</h2>
          <p>
            Auto-refresh every 10 seconds
            {lastUpdated ? ` | Last updated: ${lastUpdated.toLocaleTimeString()}` : ''}
          </p>
        </div>
        <div className="display-board-actions">
          {!kiosk && (
            <button type="button" className="button display-btn secondary" onClick={handleOpenWindow}>Open New Window</button>
          )}
          <button type="button" className="button display-btn" onClick={handleFullscreen}>Toggle Fullscreen</button>
        </div>
      </div>

      {loading ? (
        <div className="loader">Loading display board...</div>
      ) : (
        <div className="display-columns">
          <section className="display-column preparing">
            <div className="display-column-header">
              <h3>Preparing Orders</h3>
              <span>{preparingOrders.length}</span>
            </div>
            <div className="display-order-list">
              {preparingOrders.length === 0 ? (
                <div className="display-empty">No preparing orders right now.</div>
              ) : (
                preparingOrders.map((order) => (
                  <article key={`preparing-${order.id}`} className="display-order-card">
                    <div className="card-top only-order-no">
                      <strong>Order #{order.id}</strong>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="display-column completed">
            <div className="display-column-header">
              <h3>Completed Orders</h3>
              <span>{completedOrders.length}</span>
            </div>
            <div className="display-order-list">
              {completedOrders.length === 0 ? (
                <div className="display-empty">No completed orders yet.</div>
              ) : (
                completedOrders.map((order) => (
                  <article key={`completed-${order.id}`} className="display-order-card">
                    <div className="card-top only-order-no">
                      <strong>Order #{order.id}</strong>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default AdminDisplayBoardPage;
