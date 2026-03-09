import React, { useCallback, useEffect, useMemo, useState } from 'react';
import apiRequest from '../../utils/api';
import { useAlert } from '../../hooks/useAlert';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import './AdminDisplayBoardPage.css';

const REFRESH_INTERVAL_MS = 10000;
// We'll fetch more but the CSS will handle the "rotation" view
const MAX_ORDERS_TO_FETCH = 30; 

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
      setOrders(data);
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
      .slice(0, MAX_ORDERS_TO_FETCH),
    [orders]
  );

  const completedOrders = useMemo(
    () => orders
      .filter((o) => (o.status || '').toLowerCase() === 'completed' || (o.status || '').toLowerCase() === 'ready')
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, MAX_ORDERS_TO_FETCH),
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

  if (!isLoggedIn || !isAdmin) {
    return null;
  }

  return (
    <div className="display-board-page">
      <div className="display-board-header">
        <div className="display-title-wrap">
          <span className="display-kicker">● Live Kitchen Status</span>
          <h2>Cafeteria Order Monitor</h2>
          <p>
            {lastUpdated ? `Sync: ${lastUpdated.toLocaleTimeString()}` : 'Syncing...'}
          </p>
        </div>
        <div className="display-board-actions">
          <button type="button" className="display-btn" onClick={handleFullscreen}>
            {document.fullscreenElement ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loader">INITIALIZING SYSTEM...</div>
      ) : (
        <div className="display-columns">
          {/* PREPARING SECTION */}
          <section className="display-column preparing">
            <div className="display-column-header">
              <h3>IN PREPARATION</h3>
              <span className="count-badge">{preparingOrders.length}</span>
            </div>
            <div className="display-marquee-container">
              <div className={`display-order-row ${preparingOrders.length > 6 ? 'animate-scroll' : ''}`}>
                {preparingOrders.length === 0 ? (
                  <div className="display-empty">Kitchen is clear.</div>
                ) : (
                  <>
                    {preparingOrders.map((order) => (
                      <article key={`preparing-${order.id}`} className="display-order-card">
                        <strong>{order.id}</strong>
                        <div className="status-icon">👨‍🍳 COOKING</div>
                      </article>
                    ))}
                    {/* Duplicate for seamless loop if many orders */}
                    {preparingOrders.length > 6 && preparingOrders.map((order) => (
                      <article key={`preparing-dup-${order.id}`} className="display-order-card" aria-hidden="true">
                        <strong>{order.id}</strong>
                        <div className="status-icon">👨‍🍳 COOKING</div>
                      </article>
                    ))}
                  </>
                )}
              </div>
            </div>
          </section>

          {/* READY SECTION */}
          <section className="display-column completed">
            <div className="display-column-header">
              <h3>READY FOR PICKUP</h3>
              <span className="count-badge">{completedOrders.length}</span>
            </div>
            <div className="display-marquee-container">
              <div className={`display-order-row ${completedOrders.length > 6 ? 'animate-scroll' : ''}`}>
                {completedOrders.length === 0 ? (
                  <div className="display-empty">No orders ready yet.</div>
                ) : (
                  <>
                    {completedOrders.map((order) => (
                      <article key={`completed-${order.id}`} className="display-order-card">
                        <strong>{order.id}</strong>
                        <div className="status-icon">✅ READY</div>
                      </article>
                    ))}
                    {/* Duplicate for seamless loop if many orders */}
                    {completedOrders.length > 6 && completedOrders.map((order) => (
                      <article key={`completed-dup-${order.id}`} className="display-order-card" aria-hidden="true">
                        <strong>{order.id}</strong>
                        <div className="status-icon">✅ READY</div>
                      </article>
                    ))}
                  </>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default AdminDisplayBoardPage;
