import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import apiRequest from '../../utils/api';
import { useAlert } from '../../hooks/useAlert';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import './AdminDisplayBoardPage.css';

const REFRESH_INTERVAL_MS = 10000;
const PUBLIC_REFRESH_INTERVAL_MS = 15000;
const PUBLIC_PAUSE_REFRESH_INTERVAL_MS = 60000;

function AdminDisplayBoardPage({ kiosk = false, publicMode = false }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [orderPause, setOrderPause] = useState(null);
  const containerRef = useRef(null);
  const { showAlert } = useAlert();
  const { isLoggedIn, isAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (publicMode) return;
    if (!isLoggedIn) {
      showAlert('Please log in to access display board.', 'error');
      navigate('/login');
      return;
    }
    if (!isAdmin) {
      showAlert('Only admin/staff can access display board.', 'error');
      navigate('/');
    }
  }, [isAdmin, isLoggedIn, navigate, publicMode, showAlert]);

  const fetchOrders = useCallback(async ({ initial = false } = {}) => {
    try {
      if (initial) setLoading(true);
      if (publicMode) {
        const data = await apiRequest('/orders/display');
        const preparing = Array.isArray(data?.preparing) ? data.preparing : [];
        const ready = Array.isArray(data?.ready) ? data.ready : [];
        setOrders([...preparing, ...ready]);
      } else {
        const data = await apiRequest('/orders/all');
        if (!Array.isArray(data)) {
          throw new Error('Invalid order data received.');
        }
        setOrders(data);
      }
      setLastUpdated(new Date());
    } catch (error) {
      if (initial) {
        showAlert(`Could not load display board: ${error.message}`, 'error');
      }
    } finally {
      if (initial) setLoading(false);
    }
  }, [publicMode, showAlert]);

  const fetchOrderPause = useCallback(async () => {
    try {
      const data = await apiRequest('/menu/order-pause');
      if (!data || typeof data !== 'object') return;
      setOrderPause(data);
    } catch (_error) {
      // Silent: display board should still work even if pause API fails.
    }
  }, []);

  useEffect(() => {
    if (!publicMode && (!isLoggedIn || !isAdmin)) return;
    fetchOrders({ initial: true });
    fetchOrderPause();

    const refreshMs = publicMode ? PUBLIC_REFRESH_INTERVAL_MS : REFRESH_INTERVAL_MS;
    const ordersTimer = setInterval(() => {
      fetchOrders({ initial: false });
    }, refreshMs);

    const pauseTimer = publicMode
      ? setInterval(() => { fetchOrderPause(); }, PUBLIC_PAUSE_REFRESH_INTERVAL_MS)
      : setInterval(() => { fetchOrderPause(); }, refreshMs);

    return () => {
      clearInterval(ordersTimer);
      clearInterval(pauseTimer);
    };
  }, [isAdmin, isLoggedIn, fetchOrders, fetchOrderPause, publicMode]);

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

  const handleOpenKioskWindow = () => {
    const width = window.screen.width;
    const height = window.screen.height;
    const targetPath = publicMode ? '/display-window' : '/admin/display-window';
    window.open(targetPath, 'DYPCET-Display-Kiosk', `width=${width},height=${height},menubar=no,toolbar=no,location=no,status=no,scrollbars=no`);
  };

  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen().catch(err => {
        showAlert(`Error: ${err.message}`, 'error');
      });
    }
  };

  if (!publicMode && (!isLoggedIn || !isAdmin)) {
    return null;
  }

  const shouldShowPauseBanner = Boolean(orderPause?.is_paused_now)
    && (orderPause?.show_on_display_board === undefined ? true : Boolean(orderPause?.show_on_display_board));
  const pauseUntil = String(orderPause?.end_time || '').slice(0, 5);
  const pauseTimezone = String(orderPause?.timezone || '');
  const pauseMessage = String(orderPause?.message || '').trim();

  return (
    <div className={`display-board-page ${kiosk ? 'kiosk-mode' : ''}`}>
      <div className="display-board-container" ref={containerRef}>
        {/* HEADER SECTION */}
        <header className="display-header">
          <div className="header-logo">🍽️</div>
          <h1 className="header-title">DYPCET CAFETERIA</h1>
          <div className="header-timer">
            {lastUpdated ? `Sync: ${lastUpdated.toLocaleTimeString()}` : '...'}
          </div>
        </header>

        {shouldShowPauseBanner && (
          <div className="order-pause-banner" role="status" aria-live="polite">
            <div className="order-pause-title">ORDERS STOPPED</div>
            <div className="order-pause-subtitle">
              {pauseUntil ? `Orders are stopped till ${pauseUntil}` : 'Orders are temporarily stopped.'}
              {pauseTimezone ? ` (${pauseTimezone})` : ''}
            </div>
            {pauseMessage ? <div className="order-pause-message">{pauseMessage}</div> : null}
          </div>
        )}

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
                      #{order.token_number || order.id}
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
                      #{order.token_number || order.id}
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}

        <footer className="display-footer no-print">
          {!kiosk ? (
            <button onClick={handleOpenKioskWindow} className="fullscreen-btn">
               🚀 Open Kiosk in New Window
            </button>
          ) : (
            <button onClick={handleToggleFullscreen} className="fullscreen-btn">
               ⛶ Toggle Fullscreen Mode
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

export default AdminDisplayBoardPage;
