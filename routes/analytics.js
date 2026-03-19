const express = require('express');
const asyncHandler = require('express-async-handler');

const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const clampInt = (value, min, max) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return min;
    return Math.max(min, Math.min(max, Math.floor(parsed)));
};

const normalizeText = (value = '') => String(value || '').toLowerCase();

const classifySentiment = (text = '') => {
    const normalized = normalizeText(text);
    if (!normalized.trim()) return 'neutral';

    const positiveWords = ['good', 'great', 'excellent', 'best', 'clean', 'hygiene', 'tasty', 'fast', 'nice', 'amazing'];
    const negativeWords = ['bad', 'worst', 'late', 'delay', 'dirty', 'cold', 'stale', 'expensive', 'issue', 'problem', 'slow'];

    const positiveScore = positiveWords.reduce((score, word) => score + (normalized.includes(word) ? 1 : 0), 0);
    const negativeScore = negativeWords.reduce((score, word) => score + (normalized.includes(word) ? 1 : 0), 0);

    if (negativeScore > positiveScore) return 'negative';
    if (positiveScore > negativeScore) return 'positive';
    return 'neutral';
};

const detectCategory = (subject = '', message = '') => {
    const text = normalizeText(`${subject} ${message}`);
    const categories = [
        { key: 'Food Quality', words: ['taste', 'quality', 'stale', 'cold', 'spicy', 'fresh'] },
        { key: 'Service Delay', words: ['late', 'delay', 'slow', 'waiting', 'queue'] },
        { key: 'Pricing', words: ['price', 'cost', 'expensive', 'cheap'] },
        { key: 'Hygiene', words: ['clean', 'dirty', 'hygiene', 'sanitary'] },
        { key: 'Availability', words: ['unavailable', 'stock', 'sold out', 'not available'] },
        { key: 'Staff Behaviour', words: ['staff', 'behavior', 'behaviour', 'rude', 'support'] }
    ];

    for (const category of categories) {
        if (category.words.some((word) => text.includes(word))) {
            return category.key;
        }
    }
    return 'General';
};

const computeFeedbackInsights = (rows = []) => {
    const sentiment = { positive: 0, neutral: 0, negative: 0 };
    const categoryMap = {};

    for (const row of rows) {
        const currentSentiment = classifySentiment(`${row.subject || ''} ${row.message || ''}`);
        sentiment[currentSentiment] += 1;

        const category = detectCategory(row.subject, row.message);
        categoryMap[category] = (categoryMap[category] || 0) + 1;
    }

    const topComplaintCategories = Object.entries(categoryMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([category, count]) => ({ category, count }));

    return { sentiment, topComplaintCategories };
};

const safeJsonParse = (value, fallback) => {
    try {
        if (value === null || value === undefined) return fallback;
        if (typeof value === 'object') return value;
        return JSON.parse(value);
    } catch (_error) {
        return fallback;
    }
};

const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

module.exports = (config, db, auth) => {
    const router = express.Router();
    const { protect, admin } = auth;

    // Cache orders columns to avoid selecting columns that don't exist across deployments.
    let ordersColumnCache = { fetchedAt: 0, columns: new Set() };
    const getOrdersColumns = async () => {
        const now = Date.now();
        if (ordersColumnCache.fetchedAt && (now - ordersColumnCache.fetchedAt) < 60 * 1000) {
            return ordersColumnCache.columns;
        }

        const cols = await db.query(
            `SELECT COLUMN_NAME
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'orders'`
        );
        ordersColumnCache = {
            fetchedAt: now,
            columns: new Set((cols || []).map((c) => String(c.COLUMN_NAME)))
        };
        return ordersColumnCache.columns;
    };

    const isPaidOrder = (row, orderCols) => {
        const status = String(row.status || '').toLowerCase();
        if (status === 'cancelled') return false;
        if (orderCols.has('payment_status')) {
            return String(row.payment_status || '').toLowerCase() === 'paid';
        }
        return status !== 'awaiting payment';
    };

    const classifyOrderMode = (row, orderCols) => {
        const rawSource = orderCols.has('order_source') ? String(row.order_source || '') : '';
        const rawMethod = orderCols.has('payment_method') ? String(row.payment_method || '') : '';
        const source = rawSource.toLowerCase();
        const method = rawMethod.toLowerCase();

        if (source === 'offline' || method === 'cash') return 'offline';
        if (source === 'online' || method === 'online') return 'online';
        if (method.includes('upi')) return 'online';
        return 'unknown';
    };

    const getOrderItemsArray = (row) => {
        const parsed = safeJsonParse(row.items, []);
        return Array.isArray(parsed) ? parsed : [];
    };

    const computeOrderSubtotal = (items) => roundMoney((items || []).reduce((sum, item) => (
        sum + (toNumber(item?.price) * toNumber(item?.quantity))
    ), 0));

    const isValidIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());

    const escapeCsv = (value) => {
        const raw = String(value ?? '');
        if (/[",\n]/.test(raw)) {
            return `"${raw.replace(/"/g, '""')}"`;
        }
        return raw;
    };

    const createSimplePdfBuffer = (title, lines = []) => {
        const width = 595; // A4 portrait
        const height = 842;
        const stream = [];

        const escapePdfText = (value = '') =>
            String(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

        const addText = (text, x, y, size = 10, font = 'F1') => {
            stream.push('BT');
            stream.push(`/${font} ${size} Tf`);
            stream.push(`1 0 0 1 ${x} ${y} Tm`);
            stream.push(`(${escapePdfText(text)}) Tj`);
            stream.push('ET');
        };

        stream.push('0.65 w');
        addText(String(title || 'Report').slice(0, 60), 60, 800, 16, 'F2');

        let y = 780;
        for (const line of lines) {
            if (y < 60) break;
            addText(String(line || '').slice(0, 110), 60, y, 10, 'F1');
            y -= 14;
        }

        const streamData = `${stream.join('\n')}\n`;
        const objects = [
            null,
            '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
            '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
            `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n`,
            `4 0 obj\n<< /Length ${Buffer.byteLength(streamData, 'utf8')} >>\nstream\n${streamData}endstream\nendobj\n`,
            '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
            '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
        ];

        const parts = ['%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'];
        const offsets = [0];
        for (let i = 1; i < objects.length; i += 1) {
            offsets[i] = Buffer.byteLength(parts.join(''), 'utf8');
            parts.push(objects[i]);
        }
        const xrefOffset = Buffer.byteLength(parts.join(''), 'utf8');
        parts.push(`xref\n0 ${objects.length}\n`);
        parts.push('0000000000 65535 f \n');
        for (let i = 1; i < objects.length; i += 1) {
            parts.push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
        }
        parts.push(`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
        return Buffer.from(parts.join(''), 'utf8');
    };

    const buildAdminDayReport = async (date) => {
        const orderCols = await getOrdersColumns();
        const selectCols = ['id', 'total', 'status', 'timestamp', 'items', 'refund_status', 'refund_amount'];
        if (orderCols.has('payment_status')) selectCols.push('payment_status');
        if (orderCols.has('payment_method')) selectCols.push('payment_method');
        if (orderCols.has('order_source')) selectCols.push('order_source');

        const rows = await db.query(
            `SELECT ${selectCols.join(', ')}
             FROM orders
             WHERE DATE(timestamp) = ?`,
            [date]
        );

        const menuRows = await db.query(`SELECT id, name, cost_price FROM menu_items`);
        const menuById = new Map((menuRows || []).map((r) => [
            Number(r.id),
            {
                name: String(r.name || 'Item').trim() || 'Item',
                cost_price: toNumber(r.cost_price)
            }
        ]));

        const paidOrders = (rows || []).filter((row) => isPaidOrder(row, orderCols));
        const modes = {
            online: { orders: 0, revenue: 0 },
            offline: { orders: 0, revenue: 0 },
            unknown: { orders: 0, revenue: 0 }
        };

        let grossRevenue = 0;
        let refundedAmount = 0;
        let taxCollected = 0;
        let totalCost = 0;

        const itemAgg = new Map(); // key -> { id, name, quantity, revenue, cost }
        for (const row of paidOrders) {
            const mode = classifyOrderMode(row, orderCols);
            const orderTotal = toNumber(row.total);
            modes[mode].orders += 1;
            modes[mode].revenue = roundMoney(modes[mode].revenue + orderTotal);

            grossRevenue = roundMoney(grossRevenue + orderTotal);
            if (String(row.refund_status || '').toLowerCase() === 'processed') {
                refundedAmount = roundMoney(refundedAmount + toNumber(row.refund_amount));
            }

            const items = getOrderItemsArray(row);
            const subTotal = computeOrderSubtotal(items);
            const tax = Math.max(0, roundMoney(orderTotal - subTotal));
            taxCollected = roundMoney(taxCollected + tax);

            for (const item of items) {
                const itemId = Number(item?.id);
                const quantity = toNumber(item?.quantity);
                const price = toNumber(item?.price);
                const revenue = roundMoney(quantity * price);

                let resolvedName = String(item?.name || 'Item').trim() || 'Item';
                let unitCost = 0;
                if (Number.isFinite(itemId) && menuById.has(itemId)) {
                    const meta = menuById.get(itemId);
                    resolvedName = meta.name || resolvedName;
                    unitCost = toNumber(meta.cost_price);
                }
                const cost = roundMoney(quantity * unitCost);
                totalCost = roundMoney(totalCost + cost);

                const key = Number.isFinite(itemId) ? `id:${itemId}` : `name:${resolvedName.toLowerCase()}`;
                if (!itemAgg.has(key)) {
                    itemAgg.set(key, {
                        id: Number.isFinite(itemId) ? itemId : null,
                        name: resolvedName,
                        quantity: 0,
                        revenue: 0,
                        cost: 0
                    });
                }
                const entry = itemAgg.get(key);
                entry.quantity = toNumber(entry.quantity) + quantity;
                entry.revenue = roundMoney(toNumber(entry.revenue) + revenue);
                entry.cost = roundMoney(toNumber(entry.cost) + cost);
            }
        }

        const items = [...itemAgg.values()]
            .map((item) => {
                const margin = roundMoney(toNumber(item.revenue) - toNumber(item.cost));
                return {
                    ...item,
                    avgPrice: item.quantity > 0 ? roundMoney(item.revenue / item.quantity) : 0,
                    margin,
                    marginPct: item.revenue > 0 ? roundMoney((margin / item.revenue) * 100) : 0
                };
            })
            .sort((a, b) => b.revenue - a.revenue);

        const netRevenue = roundMoney(grossRevenue - refundedAmount);
        const grossProfit = roundMoney(netRevenue - totalCost);
        const profitMarginPct = netRevenue > 0 ? roundMoney((grossProfit / netRevenue) * 100) : 0;

        return {
            date,
            totals: {
                totalOrders: paidOrders.length,
                grossRevenue,
                refundedAmount,
                netRevenue,
                taxCollected,
                cgstCollected: roundMoney(taxCollected / 2),
                sgstCollected: roundMoney(taxCollected / 2),
                totalCost,
                grossProfit,
                profitMarginPct
            },
            modes,
            items
        };
    };

    // @desc    Admin analytics dashboard data
    // @route   GET /api/analytics/admin
    // @access  Admin/Staff
    router.get('/admin', protect, admin, asyncHandler(async (req, res) => {
        const days = clampInt(req.query?.days ?? 30, 1, 180);
        const itemDays = clampInt(req.query?.itemDays ?? 14, 1, 60);
        const topItemsLimit = clampInt(req.query?.topItems ?? 10, 1, 40);
        const matrixItemsLimit = clampInt(req.query?.matrixItems ?? 8, 1, 12);
        const maxDays = Math.max(days, itemDays, 30);

        const orderCols = await getOrdersColumns();
        const selectCols = ['id', 'total', 'status', 'timestamp', 'items', 'refund_status', 'refund_amount'];
        if (orderCols.has('payment_status')) selectCols.push('payment_status');
        if (orderCols.has('payment_method')) selectCols.push('payment_method');
        if (orderCols.has('order_source')) selectCols.push('order_source');
        if (orderCols.has('token_number')) selectCols.push('token_number');

        const orderRows = await db.query(
            `SELECT ${selectCols.join(', ')}
             FROM orders
             WHERE timestamp >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
            [maxDays]
        );

        const menuRows = await db.query(`SELECT id, name FROM menu_items`);
        const menuItems = (menuRows || []).map((row) => ({
            id: Number(row.id),
            name: String(row.name || 'Item').trim() || 'Item'
        }));
        const menuById = new Map(menuItems.map((i) => [Number(i.id), i.name]));

        const refundStatsRows = await db.query(
            `SELECT refund_status, COUNT(*) AS total, SUM(COALESCE(refund_amount, 0)) AS amount
             FROM orders
             WHERE refund_status <> 'None'
             GROUP BY refund_status`
        );

        const feedbackRows = await db.query(
            `SELECT subject, message
             FROM feedback
             WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`
        );

        const now = Date.now();
        const inLastDays = (row, windowDays) => {
            const ts = row.timestamp ? new Date(row.timestamp).getTime() : 0;
            if (!ts) return false;
            return ts >= (now - (windowDays * 24 * 60 * 60 * 1000));
        };

        const paidOrdersRange = orderRows.filter((row) => inLastDays(row, days) && isPaidOrder(row, orderCols));
        const paidOrders30 = orderRows.filter((row) => inLastDays(row, 30) && isPaidOrder(row, orderCols));
        const paidOrdersMatrix = orderRows.filter((row) => inLastDays(row, itemDays) && isPaidOrder(row, orderCols));

        const totalOrders = paidOrdersRange.length;
        const grossRevenue = roundMoney(paidOrdersRange.reduce((sum, row) => sum + toNumber(row.total), 0));
        const refundedAmount = roundMoney(paidOrdersRange
            .filter((row) => String(row.refund_status || '').toLowerCase() === 'processed')
            .reduce((sum, row) => sum + toNumber(row.refund_amount), 0));
        const netRevenue = roundMoney(grossRevenue - refundedAmount);

        const modeStats = {
            online: { orders: 0, revenue: 0 },
            offline: { orders: 0, revenue: 0 },
            unknown: { orders: 0, revenue: 0 }
        };
        let taxCollected = 0;

        const itemQtyMap = new Map();
        const itemRevenueMap = new Map();
        const itemOrderCountMap = new Map();

        for (const row of paidOrdersRange) {
            const mode = classifyOrderMode(row, orderCols);
            const amount = toNumber(row.total);
            modeStats[mode].orders += 1;
            modeStats[mode].revenue = roundMoney(modeStats[mode].revenue + amount);

            const items = getOrderItemsArray(row);
            const subTotal = computeOrderSubtotal(items);
            const tax = Math.max(0, roundMoney(amount - subTotal));
            taxCollected = roundMoney(taxCollected + tax);

            const countedKeys = new Set();
            for (const item of items) {
                const itemId = Number(item?.id);
                const name = (Number.isFinite(itemId) && menuById.has(itemId))
                    ? menuById.get(itemId)
                    : String(item?.name || 'Item').trim() || 'Item';
                const key = Number.isFinite(itemId) ? `id:${itemId}` : `name:${name.toLowerCase()}`;
                const qty = toNumber(item?.quantity);
                const price = toNumber(item?.price);

                itemQtyMap.set(key, toNumber(itemQtyMap.get(key)) + qty);
                itemRevenueMap.set(key, roundMoney(toNumber(itemRevenueMap.get(key)) + (qty * price)));
                if (!countedKeys.has(key)) {
                    itemOrderCountMap.set(key, toNumber(itemOrderCountMap.get(key)) + 1);
                    countedKeys.add(key);
                }
            }
        }

        const keyToLabel = (key) => {
            if (key.startsWith('id:')) {
                const id = Number(key.slice(3));
                return menuById.get(id) || `Item ${id}`;
            }
            return key.slice(5);
        };

        const topItems = [...itemQtyMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([key, quantity]) => ({ name: keyToLabel(key), quantity }));

        const peakHourMap = {};
        for (const row of paidOrders30) {
            const ts = row.timestamp ? new Date(row.timestamp) : null;
            if (!ts) continue;
            const hour = ts.getHours();
            peakHourMap[hour] = (peakHourMap[hour] || 0) + 1;
        }
        const peakHours = Object.entries(peakHourMap)
            .map(([hour, totalOrdersCount]) => ({ hour: Number(hour), totalOrders: totalOrdersCount }))
            .sort((a, b) => b.totalOrders - a.totalOrders)
            .slice(0, 5);

        const dailyAnalyticsMap = new Map();
        for (const row of orderRows) {
            if (!inLastDays(row, 14)) continue;
            if (!isPaidOrder(row, orderCols)) continue;
            const day = row.timestamp ? new Date(row.timestamp).toISOString().slice(0, 10) : null;
            if (!day) continue;
            if (!dailyAnalyticsMap.has(day)) {
                dailyAnalyticsMap.set(day, { day, orders: 0, grossRevenue: 0, refundedAmount: 0 });
            }
            const entry = dailyAnalyticsMap.get(day);
            entry.orders += 1;
            entry.grossRevenue = roundMoney(entry.grossRevenue + toNumber(row.total));
            if (String(row.refund_status || '').toLowerCase() === 'processed') {
                entry.refundedAmount = roundMoney(entry.refundedAmount + toNumber(row.refund_amount));
            }
        }
        const dailyAnalytics = [...dailyAnalyticsMap.values()]
            .sort((a, b) => a.day.localeCompare(b.day))
            .map((row) => ({
                day: row.day,
                orders: row.orders,
                grossRevenue: roundMoney(row.grossRevenue),
                refundedAmount: roundMoney(row.refundedAmount),
                netRevenue: roundMoney(row.grossRevenue - row.refundedAmount)
            }));

        const matrixTopKeys = [...itemQtyMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, matrixItemsLimit)
            .map(([key]) => key);

        const dailyMatrixMap = new Map(); // day -> key -> qty
        for (const row of paidOrdersMatrix) {
            const day = row.timestamp ? new Date(row.timestamp).toISOString().slice(0, 10) : null;
            if (!day) continue;
            if (!dailyMatrixMap.has(day)) dailyMatrixMap.set(day, new Map());
            const dayMap = dailyMatrixMap.get(day);

            const items = getOrderItemsArray(row);
            for (const item of items) {
                const itemId = Number(item?.id);
                const name = (Number.isFinite(itemId) && menuById.has(itemId))
                    ? menuById.get(itemId)
                    : String(item?.name || 'Item').trim() || 'Item';
                const key = Number.isFinite(itemId) ? `id:${itemId}` : `name:${name.toLowerCase()}`;
                if (!matrixTopKeys.includes(key)) continue;
                const qty = toNumber(item?.quantity);
                dayMap.set(key, toNumber(dayMap.get(key)) + qty);
            }
        }

        const matrixDays = [];
        for (let i = itemDays - 1; i >= 0; i -= 1) {
            const d = new Date(now - (i * 24 * 60 * 60 * 1000));
            matrixDays.push(d.toISOString().slice(0, 10));
        }

        const itemDailyMatrix = {
            days: matrixDays,
            items: matrixTopKeys.map((key) => ({ key, name: keyToLabel(key) })),
            rows: matrixDays.map((day) => {
                const m = dailyMatrixMap.get(day) || new Map();
                return {
                    day,
                    quantities: matrixTopKeys.map((key) => toNumber(m.get(key)))
                };
            })
        };

        const menuDemand = menuItems.map((item) => {
            const key = `id:${item.id}`;
            return { id: item.id, name: item.name, quantity: toNumber(itemQtyMap.get(key)) };
        });
        const highDemand = [...menuDemand].sort((a, b) => b.quantity - a.quantity).slice(0, topItemsLimit);
        const lowDemand = [...menuDemand].sort((a, b) => a.quantity - b.quantity).slice(0, topItemsLimit);

        const refundStats = {
            requested: 0,
            approved: 0,
            rejected: 0,
            processed: 0,
            totalProcessedAmount: 0
        };
        for (const row of refundStatsRows) {
            const key = String(row.refund_status || '').toLowerCase();
            if (key === 'requested') refundStats.requested = toNumber(row.total);
            if (key === 'approved') refundStats.approved = toNumber(row.total);
            if (key === 'rejected') refundStats.rejected = toNumber(row.total);
            if (key === 'processed') {
                refundStats.processed = toNumber(row.total);
                refundStats.totalProcessedAmount = toNumber(row.amount);
            }
        }

        const feedbackInsights = computeFeedbackInsights(feedbackRows || []);

        res.json({
            totals: {
                totalOrders,
                grossRevenue,
                netRevenue,
                refundedAmount
            },
            billing: {
                daysWindow: days,
                onlineOrders: modeStats.online.orders,
                offlineOrders: modeStats.offline.orders,
                unknownOrders: modeStats.unknown.orders,
                onlineRevenue: modeStats.online.revenue,
                offlineRevenue: modeStats.offline.revenue,
                unknownRevenue: modeStats.unknown.revenue,
                taxCollected,
                cgstCollected: roundMoney(taxCollected / 2),
                sgstCollected: roundMoney(taxCollected / 2),
                averageOrderValue: totalOrders > 0 ? roundMoney(grossRevenue / totalOrders) : 0
            },
            demand: {
                highDemand,
                lowDemand
            },
            itemDailyMatrix,
            peakHours,
            topItems,
            refundStats,
            feedbackInsights,
            dailyAnalytics
        });
    }));

    // @desc    Admin day-wise billing + item demand report
    // @route   GET /api/analytics/admin/day?date=YYYY-MM-DD
    // @access  Admin/Staff
    router.get('/admin/day', protect, admin, asyncHandler(async (req, res) => {
        const date = String(req.query?.date || '').trim();
        if (!isValidIsoDate(date)) {
            res.status(400);
            throw new Error('Valid date (YYYY-MM-DD) is required.');
        }

        const report = await buildAdminDayReport(date);
        res.json(report);
    }));

    // @desc    Download admin day-wise report (CSV/PDF)
    // @route   GET /api/analytics/admin/day/export?date=YYYY-MM-DD&format=csv|pdf
    // @access  Admin/Staff
    router.get('/admin/day/export', protect, admin, asyncHandler(async (req, res) => {
        const date = String(req.query?.date || '').trim();
        const format = String(req.query?.format || 'csv').trim().toLowerCase();

        if (!isValidIsoDate(date)) {
            res.status(400);
            throw new Error('Valid date (YYYY-MM-DD) is required.');
        }
        if (!['csv', 'pdf'].includes(format)) {
            res.status(400);
            throw new Error('format must be csv or pdf.');
        }

        const report = await buildAdminDayReport(date);
        const filenameBase = `DYPCET_Day_Report_${date}`;

        if (format === 'csv') {
            const headers = ['Item', 'Qty', 'Avg Price', 'Revenue', 'Cost', 'Profit'];
            const rows = (report.items || []).map((item) => ([
                escapeCsv(item.name),
                String(Number(item.quantity || 0)),
                String(Number(item.avgPrice || 0).toFixed(2)),
                String(Number(item.revenue || 0).toFixed(2)),
                String(Number(item.cost || 0).toFixed(2)),
                String(Number(item.margin || 0).toFixed(2)),
            ].join(',')));

            const summary = [
                '',
                '',
                '',
                `Gross:${Number(report.totals.grossRevenue || 0).toFixed(2)}`,
                `Cost:${Number(report.totals.totalCost || 0).toFixed(2)}`,
                `Profit:${Number(report.totals.grossProfit || 0).toFixed(2)}`,
            ].join(',');

            const csv = [headers.join(','), ...rows, summary].join('\n');
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.csv"`);
            return res.send(csv);
        }

        const lines = [
            `Date: ${report.date}`,
            `Orders: ${report.totals.totalOrders} (Online ${report.modes.online.orders}, Offline ${report.modes.offline.orders})`,
            `Gross: INR ${Number(report.totals.grossRevenue || 0).toFixed(2)}`,
            `Cost: INR ${Number(report.totals.totalCost || 0).toFixed(2)}`,
            `Profit: INR ${Number(report.totals.grossProfit || 0).toFixed(2)} (${Number(report.totals.profitMarginPct || 0).toFixed(2)}%)`,
            `Tax (CGST+SGST): INR ${Number(report.totals.taxCollected || 0).toFixed(2)}`,
            '',
            'Items:',
            ...((report.items || []).slice(0, 45).map((item) => (
                `${String(item.name).slice(0, 40)} | Qty ${item.quantity} | Rev ${Number(item.revenue || 0).toFixed(2)} | Cost ${Number(item.cost || 0).toFixed(2)} | Profit ${Number(item.margin || 0).toFixed(2)}`
            )))
        ];

        const pdf = createSimplePdfBuffer('DYPCET Cafeteria - Day Report', lines);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.pdf"`);
        res.setHeader('Content-Length', pdf.length);
        return res.send(pdf);
    }));

    // @desc    Faculty analytics dashboard data
    // @route   GET /api/analytics/faculty
    // @access  Faculty Coordinator
    router.get('/faculty', protect, asyncHandler(async (req, res) => {
        if (String(req.user?.user_type || '').toLowerCase() !== 'faculty') {
            res.status(403);
            throw new Error('Not authorized - Faculty coordinators only');
        }

        const noticeRows = await db.query(
            `SELECT id, is_active, created_at
             FROM notices`
        );

        const committeeRows = await db.query(
            `SELECT id, is_active, created_at, updated_at
             FROM canteen_committee_members`
        );

        const feedbackRows = await db.query(
            `SELECT subject, message, status, created_at
             FROM feedback`
        );

        const feedbackTrendRows = await db.query(
            `SELECT DATE(created_at) AS day, COUNT(*) AS total
             FROM feedback
             WHERE created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
             GROUP BY DATE(created_at)
             ORDER BY day ASC`
        );

        const noticesTotal = noticeRows.length;
        const noticesActive = noticeRows.filter((row) => Number(row.is_active) === 1).length;
        const noticesLast30Days = noticeRows.filter(
            (row) => new Date(row.created_at).getTime() >= Date.now() - (30 * 24 * 60 * 60 * 1000)
        ).length;

        const committeeActive = committeeRows.filter((row) => Number(row.is_active) === 1).length;
        const committeeInactive = committeeRows.length - committeeActive;
        const committeeUpdates30Days = committeeRows.filter(
            (row) => new Date(row.updated_at || row.created_at).getTime() >= Date.now() - (30 * 24 * 60 * 60 * 1000)
        ).length;

        const feedbackTotal = feedbackRows.length;
        const feedbackPending = feedbackRows.filter((row) => String(row.status || '').toLowerCase() === 'pending').length;
        const feedbackResponded = feedbackRows.filter((row) => String(row.status || '').toLowerCase() === 'responded').length;
        const feedbackLast30Days = feedbackRows.filter(
            (row) => new Date(row.created_at).getTime() >= Date.now() - (30 * 24 * 60 * 60 * 1000)
        ).length;

        const feedbackInsights = computeFeedbackInsights(feedbackRows || []);

        res.json({
            notices: {
                total: noticesTotal,
                active: noticesActive,
                publishedLast30Days: noticesLast30Days
            },
            committee: {
                total: committeeRows.length,
                active: committeeActive,
                inactive: committeeInactive,
                updatesLast30Days: committeeUpdates30Days
            },
            feedback: {
                total: feedbackTotal,
                pending: feedbackPending,
                responded: feedbackResponded,
                submittedLast30Days: feedbackLast30Days,
                trendLast14Days: (feedbackTrendRows || []).map((row) => ({
                    day: row.day,
                    total: Number(row.total)
                }))
            },
            feedbackInsights
        });
    }));

    return router;
};
