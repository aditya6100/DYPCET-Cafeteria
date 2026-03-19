import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import apiRequest from '../../utils/api';
import { useAlert } from '../../hooks/useAlert';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import './AdminDisplayBoardPage.css';

const REFRESH_INTERVAL_MS = 10000;
const PUBLIC_REFRESH_INTERVAL_MS = 15000;
const PUBLIC_PAUSE_REFRESH_INTERVAL_MS = 60000;
const SETTINGS_REFRESH_MS = 30000;

const clampNumber = (value, min, max, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};

const playBeep = async ({ durationMs = 180, frequency = 880, volume = 0.12 } = {}) => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.value = clampNumber(volume, 0, 1, 0.12);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();

    await new Promise((resolve) => setTimeout(resolve, clampNumber(durationMs, 50, 800, 180)));
    oscillator.stop();
    await ctx.close().catch(() => {});
  } catch (_error) {
    // ignore
  }
};

const speakText = (text) => {
  try {
    const trimmed = String(text || '').trim();
    if (!trimmed) return;
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    const utterance = new SpeechSynthesisUtterance(trimmed);
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  } catch (_error) {
    // ignore
  }
};

function AdminDisplayBoardPage({ kiosk = false, publicMode = false }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [orderPause, setOrderPause] = useState(null);
  const [displaySettings, setDisplaySettings] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [announcementDraft, setAnnouncementDraft] = useState('');
  const containerRef = useRef(null);
  const announcedReadyRef = useRef(new Set());
  const initializedReadyRef = useRef(false);
  const lastAnnouncementIdRef = useRef(0);
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

  const fetchDisplaySettings = useCallback(async () => {
    try {
      const data = await apiRequest('/menu/display-board');
      if (!data || typeof data !== 'object') return;
      setDisplaySettings(data);
      if (!announcementDraft) {
        setAnnouncementDraft(String(data?.announcement_text || ''));
      }
    } catch (_error) {
      // Silent: display board should still work even if settings API fails.
    }
  }, [announcementDraft]);

  useEffect(() => {
    if (!publicMode && (!isLoggedIn || !isAdmin)) return;
    fetchOrders({ initial: true });
    fetchOrderPause();
    fetchDisplaySettings();

    const refreshMs = publicMode ? PUBLIC_REFRESH_INTERVAL_MS : REFRESH_INTERVAL_MS;
    const ordersTimer = setInterval(() => {
      fetchOrders({ initial: false });
    }, refreshMs);

    const pauseTimer = publicMode
      ? setInterval(() => { fetchOrderPause(); }, PUBLIC_PAUSE_REFRESH_INTERVAL_MS)
      : setInterval(() => { fetchOrderPause(); }, refreshMs);

    const settingsTimer = setInterval(() => { fetchDisplaySettings(); }, SETTINGS_REFRESH_MS);

    return () => {
      clearInterval(ordersTimer);
      clearInterval(pauseTimer);
      clearInterval(settingsTimer);
    };
  }, [isAdmin, isLoggedIn, fetchOrders, fetchOrderPause, fetchDisplaySettings, publicMode]);

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

  useEffect(() => {
    const settings = displaySettings || {};
    const repeatCount = Math.round(clampNumber(settings.ready_repeat_count, 1, 10, 3));
    const intervalMs = Math.round(clampNumber(settings.ready_interval_ms, 300, 4000, 1200));
    const soundEnabled = settings.sound_enabled === undefined ? true : Boolean(settings.sound_enabled);
    const ttsEnabled = Boolean(settings.tts_enabled);

    if (!initializedReadyRef.current) {
      readyOrders.forEach((order) => {
        announcedReadyRef.current.add(Number(order.id));
      });
      initializedReadyRef.current = true;
      return;
    }

    const newlyReady = readyOrders
      .filter((order) => !announcedReadyRef.current.has(Number(order.id)))
      .slice(0, 3);

    if (newlyReady.length === 0) return;

    const run = async () => {
      for (const order of newlyReady) {
        announcedReadyRef.current.add(Number(order.id));
        const orderNo = order.token_number || order.id;
        for (let i = 0; i < repeatCount; i += 1) {
          if (soundEnabled) {
            // eslint-disable-next-line no-await-in-loop
            await playBeep({ durationMs: 180, frequency: 880, volume: 0.12 });
          }
          if (ttsEnabled) {
            speakText(`Order number ${orderNo} is ready`);
          }
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
      }
    };

    run();
  }, [displaySettings, readyOrders]);

  useEffect(() => {
    const announcementId = Number(displaySettings?.announcement_id || 0);
    const text = String(displaySettings?.announcement_text || '').trim();
    if (!announcementId || !text) return;
    if (announcementId === lastAnnouncementIdRef.current) return;
    lastAnnouncementIdRef.current = announcementId;

    if (Boolean(displaySettings?.tts_enabled)) {
      speakText(text);
    }
  }, [displaySettings]);

  const handleSaveSettings = async () => {
    if (publicMode) return;
    setSavingSettings(true);
    try {
      const payload = {
        sound_enabled: Boolean(displaySettings?.sound_enabled),
        ready_repeat_count: Math.round(clampNumber(displaySettings?.ready_repeat_count, 1, 10, 3)),
        ready_interval_ms: Math.round(clampNumber(displaySettings?.ready_interval_ms, 300, 4000, 1200)),
        tts_enabled: Boolean(displaySettings?.tts_enabled),
      };
      const res = await apiRequest('/menu/display-board', 'PUT', payload);
      setDisplaySettings(res?.settings || displaySettings);
      showAlert('Display settings saved.', 'success');
    } catch (error) {
      showAlert(`Could not save settings: ${error.message}`, 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSendAnnouncement = async () => {
    if (publicMode) return;
    const text = String(announcementDraft || '').trim().slice(0, 240);
    if (!text) {
      showAlert('Please enter an announcement message.', 'error');
      return;
    }
    setSavingSettings(true);
    try {
      const payload = {
        announcement_text: text,
        announcement_id: Date.now(),
      };
      const res = await apiRequest('/menu/display-board', 'PUT', payload);
      setDisplaySettings(res?.settings || displaySettings);
      showAlert('Announcement sent to display.', 'success');
    } catch (error) {
      showAlert(`Could not send announcement: ${error.message}`, 'error');
    } finally {
      setSavingSettings(false);
    }
  };

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
          {!publicMode && !kiosk ? (
            <button onClick={handleOpenKioskWindow} className="fullscreen-btn">
               🚀 Open Kiosk in New Window
            </button>
          ) : (
            <button onClick={handleToggleFullscreen} className="fullscreen-btn">
               ⛶ Toggle Fullscreen Mode
            </button>
          )}
        </footer>

        {!publicMode && !kiosk && (
          <div className="display-admin-controls no-print">
            <h4>Display Sound &amp; Announcements</h4>
            <div className="display-controls-grid">
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(displaySettings?.sound_enabled)}
                  onChange={(e) => setDisplaySettings((prev) => ({ ...(prev || {}), sound_enabled: e.target.checked }))}
                />
                <span>Enable Sound</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(displaySettings?.tts_enabled)}
                  onChange={(e) => setDisplaySettings((prev) => ({ ...(prev || {}), tts_enabled: e.target.checked }))}
                />
                <span>Enable Text-to-Speech</span>
              </label>
              <label className="display-control-field">
                Repeat Count
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={Number(displaySettings?.ready_repeat_count || 3)}
                  onChange={(e) => setDisplaySettings((prev) => ({ ...(prev || {}), ready_repeat_count: e.target.value }))}
                />
              </label>
              <label className="display-control-field">
                Interval (ms)
                <input
                  type="number"
                  min="300"
                  max="4000"
                  value={Number(displaySettings?.ready_interval_ms || 1200)}
                  onChange={(e) => setDisplaySettings((prev) => ({ ...(prev || {}), ready_interval_ms: e.target.value }))}
                />
              </label>
              <button type="button" className="fullscreen-btn" onClick={handleSaveSettings} disabled={savingSettings}>
                {savingSettings ? 'Saving...' : 'Save Settings'}
              </button>
            </div>

            <div className="display-announcement">
              <label>
                Announcement (TTS)
                <textarea
                  rows="2"
                  value={announcementDraft}
                  onChange={(e) => setAnnouncementDraft(e.target.value)}
                  placeholder="Type message to announce on TV display..."
                  maxLength={240}
                />
              </label>
              <button type="button" className="fullscreen-btn" onClick={handleSendAnnouncement} disabled={savingSettings}>
                {savingSettings ? 'Sending...' : 'Send Announcement'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminDisplayBoardPage;
