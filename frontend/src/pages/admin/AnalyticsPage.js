import React, { useEffect, useMemo, useState } from 'react';
import apiRequest from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { useAlert } from '../../hooks/useAlert';
import './AnalyticsPage.css';

const formatMoney = (value) => `INR ${Number(value || 0).toFixed(2)}`;
const toIsoDate = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

function AdminAnalyticsView({ data }) {
  const billing = useMemo(() => data?.billing || {}, [data]);
  const demand = useMemo(() => data?.demand || {}, [data]);
  const peakHours = useMemo(() => data?.peakHours || [], [data]);
  const topItems = useMemo(() => data?.topItems || [], [data]);
  const daily = useMemo(() => data?.dailyAnalytics || [], [data]);
  const itemDailyMatrix = useMemo(() => data?.itemDailyMatrix || null, [data]);

  return (
    <div className="analytics-section">
      <div className="analytics-grid">
        <article className="analytics-card">
          <h4>Gross Revenue</h4>
          <p>{formatMoney(data?.totals?.grossRevenue)}</p>
        </article>
        <article className="analytics-card">
          <h4>Net Revenue</h4>
          <p>{formatMoney(data?.totals?.netRevenue)}</p>
        </article>
        <article className="analytics-card">
          <h4>Total Orders</h4>
          <p>{Number(data?.totals?.totalOrders || 0)}</p>
        </article>
        <article className="analytics-card">
          <h4>Refunded Amount</h4>
          <p>{formatMoney(data?.totals?.refundedAmount)}</p>
        </article>
        <article className="analytics-card">
          <h4>Online Orders</h4>
          <p>{Number(billing?.onlineOrders || 0)}</p>
          <small>{formatMoney(billing?.onlineRevenue)}</small>
        </article>
        <article className="analytics-card">
          <h4>Offline Orders</h4>
          <p>{Number(billing?.offlineOrders || 0)}</p>
          <small>{formatMoney(billing?.offlineRevenue)}</small>
        </article>
        <article className="analytics-card">
          <h4>Tax Collected (CGST+SGST)</h4>
          <p>{formatMoney(billing?.taxCollected)}</p>
          <small>CGST {formatMoney(billing?.cgstCollected)} · SGST {formatMoney(billing?.sgstCollected)}</small>
        </article>
        <article className="analytics-card">
          <h4>Avg Order Value</h4>
          <p>{formatMoney(billing?.averageOrderValue)}</p>
          <small>Last {Number(billing?.daysWindow || 0) || 30} days</small>
        </article>
      </div>

      <div className="analytics-two-col">
        <article className="analytics-panel">
          <h4>Peak Hours (Last 30 Days)</h4>
          {peakHours.length === 0 ? (
            <p className="muted">No order data.</p>
          ) : (
            <ul className="analytics-list">
              {peakHours.map((entry) => (
                <li key={`peak-${entry.hour}`}>
                  <span>{String(entry.hour).padStart(2, '0')}:00 - {String(entry.hour).padStart(2, '0')}:59</span>
                  <strong>{entry.totalOrders} orders</strong>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="analytics-panel">
          <h4>Top Items (Last 30 Days)</h4>
          {topItems.length === 0 ? (
            <p className="muted">No item data.</p>
          ) : (
            <ul className="analytics-list">
              {topItems.map((item) => (
                <li key={`top-${item.name}`}>
                  <span>{item.name}</span>
                  <strong>{item.quantity}</strong>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>

      <div className="analytics-two-col">
        <article className="analytics-panel">
          <h4>High Demand Items</h4>
          {(demand?.highDemand || []).length === 0 ? (
            <p className="muted">No demand data.</p>
          ) : (
            <ul className="analytics-list compact">
              {demand.highDemand.map((item) => (
                <li key={`high-${item.id}`}>
                  <span>{item.name}</span>
                  <strong>{Number(item.quantity || 0)}</strong>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="analytics-panel">
          <h4>Low Demand Items</h4>
          {(demand?.lowDemand || []).length === 0 ? (
            <p className="muted">No demand data.</p>
          ) : (
            <ul className="analytics-list compact">
              {demand.lowDemand.map((item) => (
                <li key={`low-${item.id}`}>
                  <span>{item.name}</span>
                  <strong>{Number(item.quantity || 0)}</strong>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>

      <div className="analytics-two-col">
        <article className="analytics-panel">
          <h4>Refund Stats</h4>
          <ul className="analytics-list">
            <li><span>Requested</span><strong>{Number(data?.refundStats?.requested || 0)}</strong></li>
            <li><span>Approved</span><strong>{Number(data?.refundStats?.approved || 0)}</strong></li>
            <li><span>Rejected</span><strong>{Number(data?.refundStats?.rejected || 0)}</strong></li>
            <li><span>Processed</span><strong>{Number(data?.refundStats?.processed || 0)}</strong></li>
            <li><span>Processed Amount</span><strong>{formatMoney(data?.refundStats?.totalProcessedAmount)}</strong></li>
          </ul>
        </article>
      </div>

      <div className="analytics-two-col">
        <article className="analytics-panel">
          <h4>Item Demand By Day</h4>
          {!itemDailyMatrix?.rows?.length ? (
            <p className="muted">No item daily data.</p>
          ) : (
            <div className="analytics-table-wrap">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    {(itemDailyMatrix.items || []).map((item) => (
                      <th key={`matrix-head-${item.key}`}>{item.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {itemDailyMatrix.rows.map((row) => (
                    <tr key={`matrix-row-${row.day}`}>
                      <td>{new Date(row.day).toLocaleDateString()}</td>
                      {(row.quantities || []).map((qty, idx) => (
                        <td key={`matrix-cell-${row.day}-${idx}`}>{Number(qty || 0)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <small className="muted">Top items are selected automatically for last {itemDailyMatrix?.days?.length || 0} days.</small>
        </article>
      </div>

      <div className="analytics-two-col">
        <article className="analytics-panel">
          <h4>Daily Analytics (Last 14 Days)</h4>
          {daily.length === 0 ? (
            <p className="muted">No recent order analytics.</p>
          ) : (
            <div className="analytics-table-wrap">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Orders</th>
                    <th>Gross</th>
                    <th>Refunded</th>
                    <th>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {daily.map((row) => (
                    <tr key={`daily-${row.day}`}>
                      <td>{new Date(row.day).toLocaleDateString()}</td>
                      <td>{row.orders}</td>
                      <td>{formatMoney(row.grossRevenue)}</td>
                      <td>{formatMoney(row.refundedAmount)}</td>
                      <td>{formatMoney(row.netRevenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </div>
    </div>
  );
}

function FacultyAnalyticsView({ data }) {
  const sentiment = data?.feedbackInsights?.sentiment || {};
  const categories = data?.feedbackInsights?.topComplaintCategories || [];
  const trend = data?.feedback?.trendLast14Days || [];

  return (
    <div className="analytics-section">
      <div className="analytics-grid">
        <article className="analytics-card">
          <h4>Notices Published</h4>
          <p>{Number(data?.notices?.total || 0)}</p>
          <small>{Number(data?.notices?.publishedLast30Days || 0)} in last 30 days</small>
        </article>
        <article className="analytics-card">
          <h4>Active Committee</h4>
          <p>{Number(data?.committee?.active || 0)}</p>
          <small>{Number(data?.committee?.updatesLast30Days || 0)} updates in last 30 days</small>
        </article>
        <article className="analytics-card">
          <h4>Feedback Pending</h4>
          <p>{Number(data?.feedback?.pending || 0)}</p>
          <small>{Number(data?.feedback?.responded || 0)} responded</small>
        </article>
      </div>

      <div className="analytics-two-col">
        <article className="analytics-panel">
          <h4>Feedback Trend (14 Days)</h4>
          {trend.length === 0 ? (
            <p className="muted">No recent feedback.</p>
          ) : (
            <ul className="analytics-list">
              {trend.map((entry) => (
                <li key={`trend-${entry.day}`}>
                  <span>{new Date(entry.day).toLocaleDateString()}</span>
                  <strong>{entry.total}</strong>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="analytics-panel">
          <h4>Feedback Sentiment</h4>
          <ul className="analytics-list">
            <li><span>Positive</span><strong>{Number(sentiment.positive || 0)}</strong></li>
            <li><span>Neutral</span><strong>{Number(sentiment.neutral || 0)}</strong></li>
            <li><span>Negative</span><strong>{Number(sentiment.negative || 0)}</strong></li>
          </ul>
          <h5>Top Complaint Categories</h5>
          <ul className="analytics-list compact">
            {categories.map((entry) => (
              <li key={`faculty-cat-${entry.category}`}>
                <span>{entry.category}</span>
                <strong>{entry.count}</strong>
              </li>
            ))}
            {categories.length === 0 && <li><span className="muted">No feedback categories yet.</span></li>}
          </ul>
        </article>
      </div>
    </div>
  );
}

function AnalyticsPage() {
  const { isAdmin, isFaculty } = useAuth();
  const { showAlert } = useAlert();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [selectedDate, setSelectedDate] = useState(() => toIsoDate(new Date()));
  const [dayLoading, setDayLoading] = useState(false);
  const [dayReport, setDayReport] = useState(null);

  useEffect(() => {
    const fetchAnalytics = async () => {
      setLoading(true);
      try {
        const endpoint = isAdmin ? '/analytics/admin' : '/analytics/faculty';
        const response = await apiRequest(endpoint);
        setData(response);
      } catch (error) {
        showAlert(`Could not load analytics: ${error.message}`, 'error');
      } finally {
        setLoading(false);
      }
    };

    if (isAdmin || isFaculty) {
      fetchAnalytics();
    }
  }, [isAdmin, isFaculty, showAlert]);

  useEffect(() => {
    const fetchDayReport = async () => {
      if (!isAdmin) return;
      if (!selectedDate) return;
      setDayLoading(true);
      try {
        const response = await apiRequest(`/analytics/admin/day?date=${encodeURIComponent(selectedDate)}`);
        setDayReport(response);
      } catch (error) {
        setDayReport(null);
        showAlert(`Could not load day report: ${error.message}`, 'error');
      } finally {
        setDayLoading(false);
      }
    };

    fetchDayReport();
  }, [isAdmin, selectedDate, showAlert]);

  if (loading) {
    return <div className="loader">Loading analytics...</div>;
  }

  if (!data) {
    return <p className="muted">No analytics data available.</p>;
  }

  return (
    <div className="analytics-page">
      <div className="analytics-header">
        <h2>{isAdmin ? 'Admin Analytics Dashboard' : 'Faculty Analytics Dashboard'}</h2>
        <p>
          {isAdmin
            ? 'Revenue, order, refund, and feedback intelligence'
            : 'Notices, committee activity, and feedback trends'}
        </p>
      </div>

      {isAdmin && (
        <div className="analytics-two-col">
          <article className="analytics-panel">
            <h4>Day-wise Report</h4>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.75rem' }}>
              <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ color: '#3a526d' }}>Select Date</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </label>
              {dayLoading ? <span className="muted">Loading...</span> : null}
            </div>

            {!dayReport ? (
              <p className="muted">No day report available.</p>
            ) : (
              <>
                <div className="analytics-grid" style={{ marginBottom: 12 }}>
                  <article className="analytics-card">
                    <h4>Orders</h4>
                    <p>{Number(dayReport?.totals?.totalOrders || 0)}</p>
                    <small>Online {Number(dayReport?.modes?.online?.orders || 0)} · Offline {Number(dayReport?.modes?.offline?.orders || 0)}</small>
                  </article>
                  <article className="analytics-card">
                    <h4>Gross</h4>
                    <p>{formatMoney(dayReport?.totals?.grossRevenue)}</p>
                    <small>Net {formatMoney(dayReport?.totals?.netRevenue)}</small>
                  </article>
                  <article className="analytics-card">
                    <h4>Total Cost</h4>
                    <p>{formatMoney(dayReport?.totals?.totalCost)}</p>
                    <small>Profit {formatMoney(dayReport?.totals?.grossProfit)} ({Number(dayReport?.totals?.profitMarginPct || 0).toFixed(2)}%)</small>
                  </article>
                  <article className="analytics-card">
                    <h4>Tax (CGST+SGST)</h4>
                    <p>{formatMoney(dayReport?.totals?.taxCollected)}</p>
                    <small>CGST {formatMoney(dayReport?.totals?.cgstCollected)} · SGST {formatMoney(dayReport?.totals?.sgstCollected)}</small>
                  </article>
                  <article className="analytics-card">
                    <h4>Refunded</h4>
                    <p>{formatMoney(dayReport?.totals?.refundedAmount)}</p>
                  </article>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: 12 }}>
                  <button
                    type="button"
                    className="button"
                    onClick={() => {
                      const token = localStorage.getItem('token') || '';
                      fetch(`/api/analytics/admin/day/export?date=${encodeURIComponent(selectedDate)}&format=csv`, {
                        headers: token ? { Authorization: `Bearer ${token}` } : {}
                      })
                        .then((r) => {
                          if (!r.ok) throw new Error('Download failed.');
                          return r.blob();
                        })
                        .then((blob) => {
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `DYPCET_Day_Report_${selectedDate}.csv`;
                          document.body.appendChild(a);
                          a.click();
                          a.remove();
                          URL.revokeObjectURL(url);
                        })
                        .catch((e) => showAlert(String(e.message || e), 'error'));
                    }}
                  >
                    Download CSV
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={() => {
                      const token = localStorage.getItem('token') || '';
                      fetch(`/api/analytics/admin/day/export?date=${encodeURIComponent(selectedDate)}&format=pdf`, {
                        headers: token ? { Authorization: `Bearer ${token}` } : {}
                      })
                        .then((r) => {
                          if (!r.ok) throw new Error('Download failed.');
                          return r.blob();
                        })
                        .then((blob) => {
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `DYPCET_Day_Report_${selectedDate}.pdf`;
                          document.body.appendChild(a);
                          a.click();
                          a.remove();
                          URL.revokeObjectURL(url);
                        })
                        .catch((e) => showAlert(String(e.message || e), 'error'));
                    }}
                  >
                    Download PDF
                  </button>
                </div>

                {(dayReport?.items || []).length === 0 ? (
                  <p className="muted">No items ordered on this date.</p>
                ) : (
                  <div className="analytics-table-wrap">
                    <table className="analytics-table">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Qty</th>
                          <th>Avg Price</th>
                          <th>Total</th>
                          <th>Cost</th>
                          <th>Profit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dayReport.items.map((item) => (
                          <tr key={`day-item-${item.id ?? item.name}`}>
                            <td>{item.name}</td>
                            <td>{Number(item.quantity || 0)}</td>
                            <td>{formatMoney(item.avgPrice)}</td>
                            <td>{formatMoney(item.revenue)}</td>
                            <td>{formatMoney(item.cost)}</td>
                            <td>{formatMoney(item.margin)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </article>
        </div>
      )}

      {isAdmin ? <AdminAnalyticsView data={data} /> : <FacultyAnalyticsView data={data} />}
    </div>
  );
}

export default AnalyticsPage;
