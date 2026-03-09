const express = require('express');
const asyncHandler = require('express-async-handler');

module.exports = (config, db, auth) => { // Accept shared config/db/auth
    const router = express.Router();
    const { protect, admin } = auth;
    const canRespondToFeedback = (userType) => ['admin', 'staff', 'faculty'].includes(String(userType || '').toLowerCase());
    const canViewInsights = (userType) => ['admin', 'staff', 'faculty'].includes(String(userType || '').toLowerCase());

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

    // @desc    User submit feedback
    // @route   POST /api/feedback
    // @access  Protected
    router.post('/', protect, asyncHandler(async (req, res) => {
        const { subject, message } = req.body;
        const userId = req.user.id;

        if (!subject || !message) {
            res.status(400);
            throw new Error('Subject and message are required for feedback.');
        }

        const sql = "INSERT INTO feedback (user_id, subject, message) VALUES (?, ?, ?)";
        const result = await db.query(sql, [userId, subject, message]);

        if (result.insertId) {
            res.status(201).json({ message: "Feedback submitted successfully.", feedbackId: result.insertId });
        } else {
            res.status(500);
            throw new Error("Failed to submit feedback.");
        }
    }));


    // @desc    Faculty get all feedback
    // @route   GET /api/feedback/faculty
    // @access  Faculty
    router.get('/faculty', protect, asyncHandler(async (req, res) => {
        // Check if user is faculty coordinator
        if (req.user.user_type !== 'faculty') {
            res.status(403);
            throw new Error('Not authorized - Faculty coordinators only');
        }
        const sql = `
            SELECT f.id, f.user_id, u.name as user_name, u.email as user_email,
                   f.subject, f.message, f.admin_response, f.created_at, f.status
            FROM feedback f
            JOIN users u ON f.user_id = u.id
            ORDER BY f.created_at DESC
        `;
        const feedback = await db.query(sql);
        res.json(feedback);
    }));


    // @desc    Admin get all feedback
    // @route   GET /api/feedback
    // @access  Admin
    router.get('/', protect, admin, asyncHandler(async (req, res) => {
        const { status } = req.query;
        let sql = `
            SELECT f.id, f.user_id, u.name as user_name, u.email as user_email,
                   f.subject, f.message, f.admin_response, f.created_at, f.status
            FROM feedback f
            JOIN users u ON f.user_id = u.id
        `;
        let params = [];

        if (status && (status === 'pending' || status === 'responded')) {
            sql += ` WHERE f.status = ?`;
            params.push(status);
        }
        sql += ` ORDER BY f.created_at DESC`;
        
        const feedback = await db.query(sql, params);
        res.json(feedback);
    }));

    // @desc    Feedback insights with sentiment and complaint categories
    // @route   GET /api/feedback/insights
    // @access  Admin/Staff/Faculty
    router.get('/insights', protect, asyncHandler(async (req, res) => {
        if (!canViewInsights(req.user?.user_type)) {
            res.status(403);
            throw new Error('Not authorized to view feedback insights.');
        }

        const rows = await db.query(
            `SELECT subject, message, status, created_at
             FROM feedback
             ORDER BY created_at DESC`
        );

        const sentiment = { positive: 0, neutral: 0, negative: 0 };
        const categoryMap = {};
        let pending = 0;
        let responded = 0;

        for (const row of (rows || [])) {
            const sentimentLabel = classifySentiment(`${row.subject || ''} ${row.message || ''}`);
            sentiment[sentimentLabel] += 1;

            const category = detectCategory(row.subject, row.message);
            categoryMap[category] = (categoryMap[category] || 0) + 1;

            const status = String(row.status || '').toLowerCase();
            if (status === 'responded') responded += 1;
            else pending += 1;
        }

        const topComplaintCategories = Object.entries(categoryMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([category, count]) => ({ category, count }));

        res.json({
            totals: {
                total: rows.length,
                pending,
                responded
            },
            sentiment,
            topComplaintCategories
        });
    }));


    // @desc    Admin/Staff/Faculty respond to feedback
    // @route   PUT /api/feedback/:id
    // @access  Admin/Staff/Faculty
    router.put('/:id', protect, asyncHandler(async (req, res) => {
        if (!canRespondToFeedback(req.user?.user_type)) {
            res.status(403);
            throw new Error('Not authorized to respond to feedback.');
        }

        const { adminResponse } = req.body;
        const { id } = req.params;

        if (!adminResponse) {
            res.status(400);
            throw new Error('Admin response is required.');
        }

        const sql = "UPDATE feedback SET admin_response = ?, status = 'responded' WHERE id = ?";
        const result = await db.query(sql, [adminResponse, id]);

        if (result.affectedRows > 0) {
            res.json({ message: "Feedback responded to successfully." });
        } else {
            res.status(404);
            throw new Error("Feedback not found or no changes made.");
        }
    }));

    return router;
};
