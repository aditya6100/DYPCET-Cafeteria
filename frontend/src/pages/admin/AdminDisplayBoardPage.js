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

const getSpeechVoices = () => {
  try {
    if (!window.speechSynthesis) return [];
    return window.speechSynthesis.getVoices() || [];
  } catch (_error) {
    return [];
  }
};

const pickPreferredVoice = (voices) => {
  const list = Array.isArray(voices) ? voices : [];
  if (list.length === 0) return null;

  const preferLang = (v) => String(v.lang || '').toLowerCase();
  const preferName = (v) => String(v.name || '').toLowerCase();
  const femaleHints = ['female', 'woman', 'zira', 'susan', 'catherine', 'samantha', 'victoria', 'linda', 'karen', 'tessa', 'serena', 'amelie', 'ava', 'allison'];
  const isFemaleNamed = (v) => femaleHints.some((hint) => preferName(v).includes(hint));

  const enInFemale = list.find((v) => preferLang(v).startsWith('en-in') && isFemaleNamed(v));
  if (enInFemale) return enInFemale;

  const enFemale = list.find((v) => preferLang(v).startsWith('en') && isFemaleNamed(v));
  if (enFemale) return enFemale;

  const enIn = list.find((v) => preferLang(v).startsWith('en-in'));
  if (enIn) return enIn;
  const en = list.find((v) => preferLang(v).startsWith('en'));
  if (en) return en;
  const google = list.find((v) => preferName(v).includes('google'));
  if (google) return google;
  return list[0];
};

const speakText = (text, voice = null) => {
  try {
    const trimmed = String(text || '').trim();
    if (!trimmed) return;
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    const utterance = new SpeechSynthesisUtterance(trimmed);
    if (voice) {
      utterance.voice = voice;
      if (voice.lang) utterance.lang = voice.lang;
    } else {
      utterance.lang = 'en-IN';
    }
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  } catch (_error) {
    // ignore
  }
};

const isSameLocalDate = (a, b) => (
  a.getFullYear() === b.getFullYear()
  && a.getMonth() === b.getMonth()
  && a.getDate() === b.getDate()
);

const getDisplayOrderNo = (order) => {
  const id = order?.id;
  const token = order?.token_number;
  const ts = order?.timestamp ? new Date(order.timestamp) : null;
  if (!ts || Number.isNaN(ts.getTime())) return token || id;
  const today = new Date();
  // Token numbers are per-day. For previous days, show the global order id instead.
  return isSameLocalDate(ts, today) ? (token || id) : id;
};

function AdminDisplayBoardPage({ kiosk = false, publicMode = false }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [orderPause, setOrderPause] = useState(null);
  const [displaySettings, setDisplaySettings] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [announcementDraft, setAnnouncementDraft] = useState('');
  const [ttsUnlocked, setTtsUnlocked] = useState(() => localStorage.getItem('tts_unlocked') === '1');
  const [voices, setVoices] = useState(() => getSpeechVoices());
  const containerRef = useRef(null);
  const announcedReadyRef = useRef(new Set());
  const initializedReadyRef = useRef(false);
  const lastAnnouncementIdRef = useRef(0);
  const announcementDirtyRef = useRef(false);
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
      if (error?.statusCode === 401 || String(error?.message || '').toLowerCase().includes('unauthorized')) {
        // apiRequest() already logs out on 401; avoid noisy alerts during redirect.
        return;
      }
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
      if (!announcementDirtyRef.current) {
        setAnnouncementDraft((prev) => (prev ? prev : String(data?.announcement_text || '')));
      }
    } catch (_error) {
      // Silent: display board should still work even if settings API fails.
    }
  }, []);

  useEffect(() => {
    if (!window.speechSynthesis) return undefined;

    const refresh = () => setVoices(getSpeechVoices());
    refresh();
    window.speechSynthesis.onvoiceschanged = refresh;
    return () => {
      try {
        window.speechSynthesis.onvoiceschanged = null;
      } catch (_error) {
        // ignore
      }
    };
  }, []);

  const preferredVoice = useMemo(() => pickPreferredVoice(voices), [voices]);
  const isTtsSupported = Boolean(window.speechSynthesis && window.SpeechSynthesisUtterance);

  const announceOrderReady = useCallback(async (orderNo) => {
    const settings = displaySettings || {};
    const repeatCount = Math.round(clampNumber(settings.ready_repeat_count, 1, 10, 3));
    const intervalMs = Math.round(clampNumber(settings.ready_interval_ms, 300, 4000, 1200));
    const ttsEnabled = Boolean(settings.tts_enabled);

    for (let i = 0; i < repeatCount; i += 1) {
      if (ttsEnabled && isTtsSupported && ttsUnlocked) {
        speakText(`Order number ${orderNo} is ready`, preferredVoice);
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }, [displaySettings, isTtsSupported, preferredVoice, ttsUnlocked]);

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
    if (!initializedReadyRef.current) {
      if (loading) return;
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
        const orderNo = getDisplayOrderNo(order);
        // eslint-disable-next-line no-await-in-loop
        await announceOrderReady(orderNo);
      }
    };

    run();
  }, [announceOrderReady, loading, readyOrders]);

  useEffect(() => {
    const announcementId = Number(displaySettings?.announcement_id || 0);
    const text = String(displaySettings?.announcement_text || '').trim();
    if (!announcementId || !text) return;
    if (announcementId === lastAnnouncementIdRef.current) return;
    lastAnnouncementIdRef.current = announcementId;

    if (Boolean(displaySettings?.tts_enabled) && isTtsSupported && ttsUnlocked) {
      speakText(text, preferredVoice);
    }
  }, [displaySettings, isTtsSupported, preferredVoice, ttsUnlocked]);

  const handleUnlockTts = async () => {
    try {
      setTtsUnlocked(true);
      localStorage.setItem('tts_unlocked', '1');
      if (isTtsSupported) {
        speakText('Announcements enabled', preferredVoice);
      }
    } catch (_error) {
      // ignore
    }
  };

  const handleTestTts = () => {
    if (!isTtsSupported) {
      showAlert('Text-to-speech is not supported in this browser/device.', 'error');
      return;
    }
    speakText('Test announcement. DYPCET cafeteria display board.', preferredVoice);
  };

  const handleManualAnnounce = (order) => {
    if (publicMode) return;
    const orderNo = getDisplayOrderNo(order);
    if (!orderNo) return;
    if (Boolean(displaySettings?.tts_enabled) && isTtsSupported && !ttsUnlocked) {
      showAlert('Tap "Enable Voice" once to allow announcements on this device.', 'info');
    }
    announceOrderReady(orderNo);
  };

  const handleSaveSettings = async () => {
    if (publicMode) return;
    setSavingSettings(true);
    try {
      const payload = {
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
                    <div
                      key={`ready-${order.id}`}
                      className={`order-number-card ${!publicMode ? 'clickable' : ''}`}
                      role={!publicMode ? 'button' : undefined}
                      tabIndex={!publicMode ? 0 : undefined}
                      onClick={!publicMode ? () => handleManualAnnounce(order) : undefined}
                      onKeyDown={!publicMode ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleManualAnnounce(order);
                        }
                      } : undefined}
                      title={!publicMode ? 'Click to announce' : undefined}
                    >
                      #{getDisplayOrderNo(order)}
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
                      #{getDisplayOrderNo(order)}
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}

        {Boolean(displaySettings?.tts_enabled) && isTtsSupported && !ttsUnlocked && (
          <div className="tts-unlock-banner no-print">
            <div>
              <strong>Enable announcements</strong>
              <div className="tts-unlock-sub">Tap once to allow voice announcements on this device.</div>
            </div>
            <button type="button" className="fullscreen-btn" onClick={handleUnlockTts}>
              Enable Voice
            </button>
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
            <h4>Display Announcements</h4>
            <div className="display-controls-grid">
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
              <button type="button" className="fullscreen-btn" onClick={handleTestTts} disabled={!isTtsSupported}>
                Test TTS
              </button>
            </div>

            <div className="display-announcement">
              <label>
                Announcement (TTS)
                <textarea
                  rows="2"
                  value={announcementDraft}
                  onChange={(e) => {
                    announcementDirtyRef.current = true;
                    setAnnouncementDraft(e.target.value);
                  }}
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
