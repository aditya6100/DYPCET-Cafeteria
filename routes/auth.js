const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const crypto = require('crypto');

module.exports = (config, db) => {
    const router = express.Router();

    // Helper to generate JWT
    const generateToken = (id, name, user_type) => {
        return jwt.sign({ id, name, user_type }, config.jwt.secret, {
            expiresIn: '1d',
        });
    };

    const ensureResetColumns = async () => {
        const columns = await db.query(
            `SELECT COLUMN_NAME
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'users'`
        );
        const existing = new Set((columns || []).map((c) => c.COLUMN_NAME));

        if (!existing.has('reset_password_token')) {
            await db.query(`ALTER TABLE users ADD COLUMN reset_password_token VARCHAR(255) NULL`);
        }
        if (!existing.has('reset_password_expires')) {
            await db.query(`ALTER TABLE users ADD COLUMN reset_password_expires DATETIME NULL`);
        }
    };

    ensureResetColumns()
        .then(() => {
            console.log('Auth reset columns checked/ready.');
        })
        .catch((error) => {
            console.error('Auth reset column setup failed:', error.message);
        });

    const getTransporter = () => {
        let nodemailerLib = null;
        try {
            nodemailerLib = require('nodemailer');
        } catch (error) {
            console.error('[SMTP] Nodemailer module not found!');
            return null;
        }

        const host = process.env.SMTP_HOST;
        const port = Number(process.env.SMTP_PORT || 587);
        const user = process.env.SMTP_USER;
        const pass = process.env.SMTP_PASS;

        console.log(`[SMTP] Initializing transporter → host: ${host}, port: ${port}, user: ${user}, pass: ${pass ? 'SET' : 'MISSING'}`);

        if (!host || !user || !pass) {
            console.error('[SMTP] Missing one or more environment variables (SMTP_HOST, SMTP_USER, SMTP_PASS)');
            return null;
        }

        return nodemailerLib.createTransport({
            host,
            port,
            secure: false, // false for port 587 (STARTTLS)
            auth: { user, pass },
            tls: {
                rejectUnauthorized: false,
                ciphers: 'SSLv3'
            },
            connectionTimeout: 30000,
            greetingTimeout: 20000,
            socketTimeout: 30000,
            debug: true,
            logger: true
        });
    };

    // @desc    Debug SMTP Connection
    // @route   GET /api/auth/debug-smtp
    router.get('/debug-smtp', asyncHandler(async (req, res) => {
        const testEmail = req.query.email || 'test@example.com';
        const transporter = getTransporter();

        if (!transporter) {
            return res.json({
                status: 'FAILED',
                reason: 'Transporter could not be initialized. Check environment variables.',
                vars: {
                    host: process.env.SMTP_HOST || 'NOT SET',
                    port: process.env.SMTP_PORT || 'NOT SET',
                    user: process.env.SMTP_USER || 'NOT SET',
                    pass: process.env.SMTP_PASS ? 'SET' : 'MISSING'
                }
            });
        }

        try {
            await transporter.verify();
            const info = await transporter.sendMail({
                from: `"DYPCET Cafeteria" <${process.env.SMTP_USER}>`,
                to: testEmail,
                subject: 'SMTP DEBUG TEST - DYPCET Cafeteria',
                text: 'If you see this, SMTP is working perfectly on Render!'
            });
            res.json({ status: 'SUCCESS', messageId: info.messageId, recipient: testEmail });
        } catch (err) {
            res.status(500).json({
                status: 'ERROR',
                message: err.message,
                code: err.code,
                command: err.command
            });
        }
    }));

    // @desc    Register a new user
    // @route   POST /api/auth/register
    // @access  Public
    router.post('/register', asyncHandler(async (req, res) => {
        const { name, email, password, user_type = 'student', mobile_no, address, student_id, faculty_id } = req.body;

        if (!name || !email || !password || !user_type || !mobile_no) {
            res.status(400);
            throw new Error('Please provide name, email, password, user_type, and mobile_no.');
        }

        if (!/^\d{10}$/.test(mobile_no)) {
            res.status(400);
            throw new Error('Mobile number must be exactly 10 digits.');
        }

        const userExists = await db.query('SELECT id FROM users WHERE email = ?', [email]);
        if (userExists.length > 0) {
            res.status(409);
            throw new Error('User with this email already exists.');
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const sql = 'INSERT INTO users (name, email, password, user_type, mobile_no, address, student_id, faculty_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
        const params = [name, email, hashedPassword, user_type, mobile_no, address || null, student_id || null, faculty_id || null];

        const result = await db.query(sql, params);

        if (result.insertId) {
            res.status(201).json({
                message: 'User registered successfully',
                userId: result.insertId,
            });
        } else {
            res.status(500);
            throw new Error('Failed to register user.');
        }
    }));

    // @desc    Authenticate user & get token (Login)
    // @route   POST /api/auth/login
    // @access  Public
    router.post('/login', asyncHandler(async (req, res) => {
        const { email, password } = req.body;

        if (!email || !password) {
            res.status(400);
            throw new Error('Please provide email and password.');
        }

        const users = await db.query('SELECT id, name, email, password, user_type FROM users WHERE email = ?', [email]);

        if (users.length === 0) {
            res.status(401);
            throw new Error('Invalid email or password.');
        }

        const user = users[0];
        const isMatch = await bcrypt.compare(password, user.password);

        if (isMatch) {
            res.json({
                _id: user.id,
                name: user.name,
                email: user.email,
                user_type: user.user_type,
                token: generateToken(user.id, user.name, user.user_type),
            });
        } else {
            res.status(401);
            throw new Error('Invalid email or password.');
        }
    }));

    // @desc    Request password reset link
    // @route   POST /api/auth/forgot-password
    // @access  Public
    router.post('/forgot-password', asyncHandler(async (req, res) => {
        const { email } = req.body || {};

        if (!email) {
            res.status(400);
            throw new Error('Email is required.');
        }

        const users = await db.query('SELECT id, email, name FROM users WHERE email = ? LIMIT 1', [email]);
        const user = users[0];

        const genericMessage = 'If that email is registered, a password reset link has been sent.';

        if (!user) {
            return res.json({ message: genericMessage });
        }

        const rawToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        await db.query(
            `UPDATE users SET reset_password_token = ?, reset_password_expires = ? WHERE id = ?`,
            [hashedToken, expiresAt, user.id]
        );

        // Dynamically detect frontend URL from request origin
        let frontendBase = process.env.FRONTEND_URL || 'http://localhost:3000';
        const origin = req.get('origin') || req.get('referer');
        if (origin) {
            try {
                const url = new URL(origin);
                frontendBase = `${url.protocol}//${url.host}`;
            } catch (err) {
                // keep fallback
            }
        }

        const resetLink = `${frontendBase}/reset-password?token=${rawToken}`;
        console.log(`[AUTH] Reset link generated for ${user.email}: ${resetLink}`);

        const transporter = getTransporter();

        if (!transporter) {
            console.error('[AUTH] No transporter available — email not sent.');
            return res.json({ message: genericMessage });
        }

        try {
            const info = await transporter.sendMail({
                from: `"DYPCET Cafeteria Support" <${process.env.SMTP_USER}>`,
                to: user.email,
                subject: 'Password Reset - DYPCET Cafeteria',
                text: `Hello ${user.name || ''},\n\nReset your password using this link:\n${resetLink}\n\nThis link expires in 15 minutes.\n\nIf you did not request this, ignore this email.`,
                html: `
                <div style="font-family: sans-serif; max-width: 500px; margin: auto; padding: 30px; border: 1px solid #eee; border-radius: 10px;">
                    <div style="text-align:center; margin-bottom: 20px;">
                        <h2 style="color: #0A2342; margin:0;">🍽️ DYPCET Cafeteria</h2>
                        <p style="color:#888; font-size:0.85rem;">Mahalaxmi Canteen Management System</p>
                    </div>
                    <h3 style="color: #333;">Password Reset Request</h3>
                    <p>Hello <strong>${user.name || ''}</strong>,</p>
                    <p>We received a request to reset your password. Click the button below to proceed:</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${resetLink}"
                           style="background-color: #F47F20; color: white; padding: 14px 30px;
                                  text-decoration: none; border-radius: 6px; font-weight: bold;
                                  display: inline-block; font-size: 1rem;">
                            Reset My Password
                        </a>
                    </div>
                    <p style="font-size:0.85rem; color:#666;">Or copy this link into your browser:</p>
                    <p style="word-break: break-all; font-size:0.8rem; color: #999;">${resetLink}</p>
                    <hr style="border:0; border-top:1px solid #eee; margin: 20px 0;">
                    <p style="font-size: 0.75rem; color: #aaa; text-align:center;">
                        This link expires in <strong>15 minutes</strong>. If you did not request a reset, ignore this email.
                    </p>
                </div>`
            });
            console.log(`[AUTH] Reset email sent successfully to ${user.email} — MessageId: ${info.messageId}`);
        } catch (emailErr) {
            console.error(`[AUTH] Failed to send reset email: ${emailErr.message}`);
        }

        return res.json({ message: genericMessage });
    }));

    // @desc    Reset password using token
    // @route   POST /api/auth/reset-password
    // @access  Public
    router.post('/reset-password', asyncHandler(async (req, res) => {
        const { token, newPassword } = req.body || {};

        if (!token || !newPassword) {
            res.status(400);
            throw new Error('Token and new password are required.');
        }
        if (String(newPassword).length < 6) {
            res.status(400);
            throw new Error('Password must be at least 6 characters long.');
        }

        const hashedToken = crypto.createHash('sha256').update(String(token)).digest('hex');

        const users = await db.query(
            `SELECT id FROM users
             WHERE reset_password_token = ?
               AND reset_password_expires IS NOT NULL
               AND reset_password_expires > NOW()
             LIMIT 1`,
            [hashedToken]
        );
        const user = users[0];

        if (!user) {
            res.status(400);
            throw new Error('Reset link is invalid or expired.');
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(String(newPassword), salt);

        await db.query(
            `UPDATE users SET password = ?, reset_password_token = NULL, reset_password_expires = NULL WHERE id = ?`,
            [hashedPassword, user.id]
        );

        return res.json({ message: 'Password reset successful. Please log in.' });
    }));

    return router;
};
