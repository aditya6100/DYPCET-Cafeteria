const express = require('express');
const asyncHandler = require('express-async-handler');

const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
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

module.exports = (config, db, auth) => {
    const router = express.Router();
    const { protect, admin } = auth;

    // @desc    Admin analytics dashboard data
    // @route   GET /api/analytics/admin
    // @access  Admin/Staff
    router.get('/admin', protect, admin, asyncHandler(async (req, res) => {
        const orderRows = await db.query(
            `SELECT id, total, status, timestamp, items, payment_status, refund_status, refund_amount
             FROM orders`
        );

        const refundStatsRows = await db.query(
            `SELECT refund_status, COUNT(*) AS total, SUM(COALESCE(refund_amount, 0)) AS amount
             FROM orders
             WHERE refund_status <> 'None'
             GROUP BY refund_status`
        );

        const peakHourRows = await db.query(
            `SELECT HOUR(timestamp) AS hour_of_day, COUNT(*) AS total
             FROM orders
             WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 30 DAY)
             GROUP BY HOUR(timestamp)
             ORDER BY total DESC, hour_of_day ASC
             LIMIT 5`
        );

        const last30OrderRows = await db.query(
            `SELECT items
             FROM orders
             WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 30 DAY)`
        );

        const feedbackRows = await db.query(
            `SELECT subject, message
             FROM feedback
             WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`
        );

        const dailyRows = await db.query(
            `SELECT DATE(timestamp) AS day,
                    COUNT(*) AS total_orders,
                    SUM(COALESCE(total, 0)) AS gross_revenue,
                    SUM(CASE WHEN LOWER(COALESCE(refund_status, '')) = 'processed'
                             THEN COALESCE(refund_amount, 0)
                             ELSE 0
                        END) AS refunded_amount
             FROM orders
             WHERE timestamp >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
             GROUP BY DATE(timestamp)
             ORDER BY day ASC`
        );

        const totalOrders = orderRows.length;
        const grossRevenue = orderRows.reduce((sum, row) => sum + toNumber(row.total), 0);
        const refundedAmount = orderRows
            .filter((row) => String(row.refund_status || '').toLowerCase() === 'processed')
            .reduce((sum, row) => sum + toNumber(row.refund_amount), 0);
        const netRevenue = grossRevenue - refundedAmount;

        const topItemsMap = {};
        for (const row of last30OrderRows) {
            let items = [];
            if (Array.isArray(row.items)) {
                items = row.items;
            } else if (typeof row.items === 'string') {
                try {
                    items = JSON.parse(row.items);
                } catch (error) {
                    items = [];
                }
            }

            for (const item of items) {
                const name = String(item?.name || 'Unknown Item').trim();
                const quantity = toNumber(item?.quantity || 0);
                topItemsMap[name] = (topItemsMap[name] || 0) + quantity;
            }
        }

        const topItems = Object.entries(topItemsMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([name, quantity]) => ({ name, quantity }));

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
                grossRevenue: Number(grossRevenue.toFixed(2)),
                netRevenue: Number(netRevenue.toFixed(2)),
                refundedAmount: Number(refundedAmount.toFixed(2))
            },
            peakHours: (peakHourRows || []).map((row) => ({
                hour: Number(row.hour_of_day),
                totalOrders: Number(row.total)
            })),
            topItems,
            refundStats,
            feedbackInsights,
            dailyAnalytics: (dailyRows || []).map((row) => {
                const gross = Number(toNumber(row.gross_revenue).toFixed(2));
                const refunded = Number(toNumber(row.refunded_amount).toFixed(2));
                return {
                    day: row.day,
                    orders: Number(row.total_orders || 0),
                    grossRevenue: gross,
                    refundedAmount: refunded,
                    netRevenue: Number((gross - refunded).toFixed(2))
                };
            })
        });
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
