import React, { useState, useEffect, useRef } from 'react';
import apiRequest from '../../utils/api';

const POLL_INTERVAL = 10000;

const DisplayBoard = ({ kiosk = false }) => {
  const [readyOrders, setReadyOrders] = useState([]);
  const [preparingOrders, setPreparingOrders] = useState([]);
  const [lastSync, setLastSync] = useState(new Date());
  const [newReadyIds, setNewReadyIds] = useState(new Set());
  const [currentTime, setCurrentTime] = useState(new Date());
  const prevReadyIds = useRef(new Set());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchOrders = async () => {
    try {
      const data = await apiRequest('/orders/display', 'GET');
      const ready = (data.ready || []);
      const preparing = (data.preparing || []);

      const newIds = new Set(ready.map(o => o.id || o.order_id));
      const flashIds = new Set([...newIds].filter(id => !prevReadyIds.current.has(id)));
      if (flashIds.size > 0) {
        setNewReadyIds(flashIds);
        setTimeout(() => setNewReadyIds(new Set()), 3000);
      }
      prevReadyIds.current = newIds;
      setReadyOrders(ready);
      setPreparingOrders(preparing);
      setLastSync(new Date());
    } catch (err) {
      console.error('Display board fetch error:', err);
    }
  };

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (date) =>
    date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

  const formatDate = (date) =>
    date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const handleOpenKioskWindow = () => {
    const width = window.screen.width;
    const height = window.screen.height;
    window.open('/admin/display-window', 'DYPCET-Display-Kiosk', `width=${width},height=${height},menubar=no,toolbar=no,location=no,status=no,scrollbars=no`);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;700&display=swap');

        :root {
          --bg: #0a0e17;
          --surface: #111827;
          --surface2: #1a2235;
          --border: rgba(255,255,255,0.07);
          --ready-color: #00e5a0;
          --ready-glow: rgba(0, 229, 160, 0.3);
          --preparing-color: #f59e0b;
          --preparing-glow: rgba(245, 158, 11, 0.3);
          --text-primary: #f1f5f9;
          --text-secondary: #64748b;
          --accent: #3b82f6;
          --divider: rgba(255,255,255,0.06);
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .board-root {
          min-height: 100vh;
          background: var(--bg);
          font-family: 'DM Sans', sans-serif;
          color: var(--text-primary);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          position: relative;
        }

        .board-root.kiosk-mode {
            /* Full screen adjustments if needed */
        }

        .board-root::before {
          content: '';
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background:
            radial-gradient(ellipse 60% 40% at 20% 10%, rgba(0,229,160,0.04) 0%, transparent 60%),
            radial-gradient(ellipse 50% 40% at 80% 80%, rgba(59,130,246,0.04) 0%, transparent 60%);
          pointer-events: none;
          z-index: 0;
        }

        /* ── HEADER ── */
        .board-header {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 2.5rem;
          height: 80px;
          background: var(--surface);
          border-bottom: 1px solid var(--border);
        }

        .board-header::after {
          content: '';
          position: absolute;
          bottom: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, var(--ready-color), var(--accent), var(--preparing-color), transparent);
        }

        .header-brand {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .header-logo {
          width: 42px;
          height: 42px;
          background: linear-gradient(135deg, var(--ready-color), var(--accent));
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.2rem;
        }

        .header-title {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 1.9rem;
          letter-spacing: 0.12em;
          color: var(--text-primary);
          line-height: 1;
        }

        .header-subtitle {
          font-size: 0.72rem;
          color: var(--text-secondary);
          letter-spacing: 0.15em;
          text-transform: uppercase;
          margin-top: 2px;
        }

        .header-clock {
          text-align: right;
        }

        .clock-time {
          font-family: 'JetBrains Mono', monospace;
          font-size: 2rem;
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: 0.05em;
          line-height: 1;
        }

        .clock-date {
          font-size: 0.72rem;
          color: var(--text-secondary);
          letter-spacing: 0.08em;
          margin-top: 3px;
          text-align: right;
        }

        .header-sync {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }

        .sync-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--ready-color);
          box-shadow: 0 0 8px var(--ready-color);
          animation: pulse-dot 2s ease-in-out infinite;
        }

        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }

        .sync-label {
          font-size: 0.65rem;
          color: var(--text-secondary);
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        /* ── COLUMN HEADERS ── */
        .board-columns-header {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0;
        }

        .col-header {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          padding: 1rem 2rem;
          border-bottom: 1px solid var(--border);
        }

        .col-header.ready { background: rgba(0, 229, 160, 0.05); border-right: 1px solid var(--border); }
        .col-header.preparing { background: rgba(245, 158, 11, 0.05); }

        .col-header-icon {
          font-size: 1.3rem;
        }

        .col-header-label {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 1.4rem;
          letter-spacing: 0.15em;
        }

        .col-header.ready .col-header-label { color: var(--ready-color); }
        .col-header.preparing .col-header-label { color: var(--preparing-color); }

        .col-header-count {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.8rem;
          font-weight: 700;
          padding: 2px 10px;
          border-radius: 20px;
        }

        .col-header.ready .col-header-count {
          background: rgba(0,229,160,0.15);
          color: var(--ready-color);
          border: 1px solid rgba(0,229,160,0.3);
        }

        .col-header.preparing .col-header-count {
          background: rgba(245,158,11,0.15);
          color: var(--preparing-color);
          border: 1px solid rgba(245,158,11,0.3);
        }

        /* ── MAIN GRID ── */
        .board-body {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: 1fr 1fr;
          flex: 1;
          gap: 0;
        }

        .orders-panel {
          padding: 1.5rem;
          overflow-y: auto;
        }

        .orders-panel.ready { border-right: 1px solid var(--border); }

        .orders-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 1rem;
        }

        /* ── TOKEN CARD ── */
        .token-card {
          background: var(--surface);
          border-radius: 14px;
          padding: 1.5rem 1rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          border: 1px solid var(--border);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          position: relative;
          overflow: hidden;
          cursor: default;
        }

        .token-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          border-radius: 14px 14px 0 0;
        }

        .token-card.ready::before { background: var(--ready-color); }
        .token-card.preparing::before { background: var(--preparing-color); }

        .token-card.ready {
          border-color: rgba(0,229,160,0.2);
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }

        .token-card.preparing {
          border-color: rgba(245,158,11,0.2);
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }

        .token-card:hover { transform: translateY(-2px); }

        /* Flash animation for newly ready orders */
        .token-card.flash-ready {
          animation: flash-glow 3s ease-out;
        }

        @keyframes flash-glow {
          0%   { box-shadow: 0 0 0px var(--ready-glow); background: rgba(0,229,160,0.2); }
          20%  { box-shadow: 0 0 40px var(--ready-glow), 0 0 80px var(--ready-glow); background: rgba(0,229,160,0.3); }
          60%  { box-shadow: 0 0 20px var(--ready-glow); }
          100% { box-shadow: 0 4px 20px rgba(0,0,0,0.3); background: var(--surface); }
        }

        .token-number {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 2.8rem;
          line-height: 1;
          letter-spacing: 0.05em;
        }

        .token-card.ready .token-number { color: var(--ready-color); }
        .token-card.preparing .token-number { color: var(--preparing-color); }

        .token-name {
          font-size: 0.7rem;
          color: var(--text-secondary);
          text-align: center;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          max-width: 120px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .token-badge {
          font-size: 0.6rem;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 20px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .token-card.ready .token-badge {
          background: rgba(0,229,160,0.15);
          color: var(--ready-color);
        }

        .token-card.preparing .token-badge {
          background: rgba(245,158,11,0.15);
          color: var(--preparing-color);
        }

        /* Preparing pulse animation */
        .token-card.preparing .token-number {
          animation: preparing-pulse 2.5s ease-in-out infinite;
        }

        @keyframes preparing-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        /* ── EMPTY STATE ── */
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 200px;
          gap: 0.75rem;
          color: var(--text-secondary);
        }

        .empty-icon { font-size: 2.5rem; opacity: 0.4; }
        .empty-text { font-size: 0.85rem; letter-spacing: 0.1em; text-transform: uppercase; opacity: 0.5; }

        /* ── FOOTER ── */
        .board-footer {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.6rem 2.5rem;
          background: var(--surface);
          border-top: 1px solid var(--border);
          font-size: 0.7rem;
          color: var(--text-secondary);
          letter-spacing: 0.08em;
        }

        .footer-marquee {
          flex: 1;
          overflow: hidden;
          margin: 0 2rem;
        }

        .footer-marquee-inner {
          display: inline-block;
          white-space: nowrap;
          animation: marquee 30s linear infinite;
          color: var(--text-secondary);
        }

        @keyframes marquee {
          from { transform: translateX(100vw); }
          to { transform: translateX(-100%); }
        }

        .footer-status {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          text-transform: uppercase;
        }

        /* Scrollbar */
        .orders-panel::-webkit-scrollbar { width: 4px; }
        .orders-panel::-webkit-scrollbar-track { background: transparent; }
        .orders-panel::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

        /* Action button */
        .action-btn {
          position: fixed;
          bottom: 1rem;
          right: 1rem;
          z-index: 100;
          background: var(--surface2);
          border: 1px solid var(--border);
          color: var(--text-secondary);
          padding: 0.5rem 1rem;
          border-radius: 8px;
          font-family: 'DM Sans', sans-serif;
          font-size: 0.75rem;
          cursor: pointer;
          letter-spacing: 0.05em;
          transition: all 0.2s ease;
        }

        .action-btn:hover {
          background: var(--surface);
          color: var(--text-primary);
          border-color: rgba(255,255,255,0.15);
        }
      `}</style>

      <div className={`board-root ${kiosk ? 'kiosk-mode' : ''}`}>

        {/* HEADER */}
        <header className="board-header">
          <div className="header-brand">
            <div className="header-logo">🍽️</div>
            <div>
              <div className="header-title">DYPCET Cafeteria</div>
              <div className="header-subtitle">Order Status Display · Mahalaxmi Canteen</div>
            </div>
          </div>

          <div className="header-sync">
            <div className="sync-dot" />
            <div className="sync-label">Live</div>
          </div>

          <div className="header-clock">
            <div className="clock-time">{formatTime(currentTime)}</div>
            <div className="clock-date">{formatDate(currentTime)}</div>
          </div>
        </header>

        {/* COLUMN HEADERS */}
        <div className="board-columns-header">
          <div className="col-header ready">
            <span className="col-header-icon">✅</span>
            <span className="col-header-label">Ready for Pickup</span>
            <span className="col-header-count">{readyOrders.length}</span>
          </div>
          <div className="col-header preparing">
            <span className="col-header-icon">⏳</span>
            <span className="col-header-label">Preparing</span>
            <span className="col-header-count">{preparingOrders.length}</span>
          </div>
        </div>

        {/* MAIN BODY */}
        <div className="board-body">

          {/* READY PANEL */}
          <div className="orders-panel ready">
            {readyOrders.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🟢</div>
                <div className="empty-text">No orders ready yet</div>
              </div>
            ) : (
              <div className="orders-grid">
                {readyOrders.map((order) => {
                  const id = order.id || order.order_id;
                  const isNew = newReadyIds.has(id);
                  return (
                    <div key={id} className={`token-card ready ${isNew ? 'flash-ready' : ''}`}>
                      <div className="token-number">#{order.token_number || order.id}</div>
                      {order.customer_name && (
                        <div className="token-name">{order.customer_name}</div>
                      )}
                      <div className="token-badge">Collect Now</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* PREPARING PANEL */}
          <div className="orders-panel preparing">
            {preparingOrders.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🍳</div>
                <div className="empty-text">Kitchen Free</div>
              </div>
            ) : (
              <div className="orders-grid">
                {preparingOrders.map((order) => {
                  const id = order.id || order.order_id;
                  return (
                    <div key={id} className="token-card preparing">
                      <div className="token-number">#{order.token_number || order.id}</div>
                      {order.customer_name && (
                        <div className="token-name">{order.customer_name}</div>
                      )}
                      <div className="token-badge">In Kitchen</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* FOOTER */}
        <footer className="board-footer">
          <div className="footer-status">
            <span>🔄</span>
            <span>Auto-refresh every 10s · Last sync {formatTime(lastSync)}</span>
          </div>
          <div className="footer-marquee">
            <div className="footer-marquee-inner">
              🔔 Please collect your order promptly after it appears in READY &nbsp;&nbsp;&nbsp;
              🍽️ Thank you for dining at DYPCET Cafeteria &nbsp;&nbsp;&nbsp;
              ⚡ Powered by Mahalaxmi Canteen Management System &nbsp;&nbsp;&nbsp;
            </div>
          </div>
          <div className="footer-status">
            <span>DYPCET · {new Date().getFullYear()}</span>
          </div>
        </footer>

        {/* Action Button */}
        {!kiosk ? (
            <button className="action-btn" onClick={handleOpenKioskWindow}>
                🚀 Open Kiosk Window
            </button>
        ) : (
            <button
            className="action-btn"
            onClick={() => {
                if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen();
                } else {
                document.exitFullscreen();
                }
            }}
            >
            ⛶ Toggle Fullscreen
            </button>
        )}

      </div>
    </>
  );
};

export default DisplayBoard;
