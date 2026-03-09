const express = require('express');
const asyncHandler = require('express-async-handler');
const path = require('path');
const fs = require('fs');
const { formidable } = require('formidable');

module.exports = (config, db, auth) => {
    const router = express.Router();
    const { protect } = auth;

    const canManageNotices = (user = {}) => {
        const userType = String(user.user_type || '').toLowerCase();
        const email = String(user.email || '').toLowerCase();
        return userType === 'faculty' || userType === 'admin' || userType === 'staff' || email.endsWith('@member.com');
    };

    const ensureNoticesSchema = async () => {
        await db.query(
            `CREATE TABLE IF NOT EXISTS notices (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(200) NOT NULL,
                content TEXT NOT NULL,
                image VARCHAR(255) NULL,
                created_by INT NOT NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )`
        );

        const columns = await db.query(
            `SELECT COLUMN_NAME
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'notices'`
        );
        const existing = new Set((columns || []).map((c) => c.COLUMN_NAME));

        if (!existing.has('image')) {
            await db.query(`ALTER TABLE notices ADD COLUMN image VARCHAR(255) NULL`);
        }
    };

    const parseNoticeForm = (req, res, next) => {
        if (!req.headers['content-type'] || !req.headers['content-type'].startsWith('multipart/form-data')) {
            return next();
        }

        const uploadDir = path.join(__dirname, '..', 'public', 'notice_images');
        fs.mkdirSync(uploadDir, { recursive: true });

        const form = formidable({
            uploadDir,
            keepExtensions: true,
            maxFileSize: 5 * 1024 * 1024,
            filename: (name, ext, part) => `${Date.now()}_${part.originalFilename}`,
        });

        form.parse(req, (err, fields, files) => {
            if (err) {
                res.status(400);
                return next(new Error('Failed to parse notice form data.'));
            }

            const parsedFields = {};
            for (const key in fields) {
                parsedFields[key] = Array.isArray(fields[key]) ? fields[key][0] : fields[key];
            }
            req.body = parsedFields;

            if (files.image && files.image.length > 0) {
                const file = files.image[0];
                req.file = {
                    filename: file.newFilename,
                    path: path.join('notice_images', file.newFilename).replace(/\\/g, '/'),
                };
            } else {
                req.file = null;
            }

            next();
        });
    };

    ensureNoticesSchema()
        .then(() => {
            console.log('Notices schema checked/ready.');
        })
        .catch((error) => {
            console.error('Notices schema setup failed:', error.message);
        });

    // @desc    Get active notices for homepage/public
    // @route   GET /api/notices
    // @access  Public
    router.get('/', asyncHandler(async (req, res) => {
        const notices = await db.query(
            `SELECT n.id, n.title, n.content, n.image, n.created_at, u.name AS created_by_name
             FROM notices n
             JOIN users u ON n.created_by = u.id
             WHERE n.is_active = 1
             ORDER BY n.created_at DESC
             LIMIT 10`
        );
        res.json(Array.isArray(notices) ? notices : []);
    }));

    // @desc    Get notices created by committee member user
    // @route   GET /api/notices/faculty
    // @access  Committee Member (faculty/admin/staff/@member.com)
    const getCommitteeNotices = asyncHandler(async (req, res) => {
        if (!canManageNotices(req.user)) {
            res.status(403);
            throw new Error('Not authorized for notice management.');
        }

        const notices = await db.query(
            `SELECT id, title, content, image, is_active, created_at, updated_at
             FROM notices
             WHERE created_by = ?
            ORDER BY created_at DESC`,
            [req.user.id]
        );
        res.json(Array.isArray(notices) ? notices : []);
    });
    router.get('/faculty', protect, getCommitteeNotices);
    router.get('/committee', protect, getCommitteeNotices);

    // @desc    Committee member adds a notice
    // @route   POST /api/notices
    // @access  Committee Member (faculty/admin/staff/@member.com)
    router.post('/', protect, parseNoticeForm, asyncHandler(async (req, res) => {
        if (!canManageNotices(req.user)) {
            res.status(403);
            throw new Error('Not authorized for notice management.');
        }

        const title = String(req.body?.title || '').trim();
        const content = String(req.body?.content || '').trim();

        if (!title || !content) {
            res.status(400);
            throw new Error('Title and content are required.');
        }

        if (title.length > 200) {
            res.status(400);
            throw new Error('Title cannot exceed 200 characters.');
        }

        const result = await db.query(
            `INSERT INTO notices (title, content, image, created_by, is_active)
             VALUES (?, ?, ?, ?, 1)`,
            [title, content, req.file ? req.file.path : null, req.user.id]
        );

        res.status(201).json({
            message: 'Notice created successfully.',
            noticeId: result.insertId
        });
    }));

    return router;
};
