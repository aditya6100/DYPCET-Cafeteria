import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import apiRequest from '../../utils/api';
import { useAlert } from '../../hooks/useAlert';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import './AdminDisplayBoardPage.css';

const REFRESH_INTERVAL_MS = 10000;

function AdminDisplayBoardPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const containerRef = useRef(null);
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
      .slice(0, 10),
    [orders]
  );

  const readyOrders = useMemo(
    () => orders
      .filter((o) => (o.status || '').toLowerCase() === 'ready' || (o.status || '').toLowerCase() === 'completed')
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 10),
    [orders]
  );

  const handleFullscreen = () => {
    if (!containerRef.current) return;
    
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen().catch(err => {
        showAlert(`Error attempting to enable full-screen mode: ${err.message}`, 'error');
      });
    }
  };

  if (!isLoggedIn || !isAdmin) {
    return null;
  }

  return (
    <div className="display-board-page">
      <div className="display-board-container" ref={containerRef}>
        {/* HEADER SECTION */}
        <header className="display-header">
          <div className="header-logo">🍽️</div>
          <h1 className="header-title">DYPCET CAFETERIA</h1>
          <div className="header-timer">
            {lastUpdated ? `Sync: ${lastUpdated.toLocaleTimeString()}` : '...'}
          </div>
        </header>

        {loading ? (
          <div className="loader">INITIALIZING...</div>
        ) : (
          <div className="display-main-grid">
            {/* READY SECTION */}
            <section className="display-split ready">
              <div className="split-header">
                <span className="status-icon">✅</span> READY
              </div>
              <div className="order-grid-compact">
                {readyOrders.length === 0 ? (
                  <div className="empty-msg">Waiting...</div>
                ) : (
                  readyOrders.map((order) => (
                    <div key={`ready-${order.id}`} className="order-number-card">
                      #{order.id}
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* PREPARING SECTION */}
            <section className="display-split preparing">
              <div className="split-header">
                <span className="status-icon rotate">🔄</span> PREPARING
              </div>
              <div className="order-grid-compact">
                {preparingOrders.length === 0 ? (
                  <div className="empty-msg">Kitchen Free</div>
                ) : (
                  preparingOrders.map((order) => (
                    <div key={`prep-${order.id}`} className="order-number-card">
                      #{order.id}
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}

        <footer className="display-footer no-print">
          <button onClick={handleFullscreen} className="fullscreen-btn">
             Toggle Kiosk Fullscreen Mode
          </button>
        </footer>
      </div>
    </div>
  );
}

export default AdminDisplayBoardPage;
