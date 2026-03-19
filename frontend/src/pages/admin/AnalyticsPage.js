import React, { useEffect, useMemo, useState } from 'react';
import apiRequest from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { useAlert } from '../../hooks/useAlert';
import './AnalyticsPage.css';

const formatMoney = (value) => `INR ${Number(value || 0).toFixed(2)}`;

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

      {isAdmin ? <AdminAnalyticsView data={data} /> : <FacultyAnalyticsView data={data} />}
    </div>
  );
}

export default AnalyticsPage;
