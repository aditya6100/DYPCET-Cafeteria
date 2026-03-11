const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const crypto = require('crypto');
const https = require('https');

module.exports = (config, db) => {
    const router = express.Router();
    const { protect } = require('../middleware/auth')(config, db);

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
        .then(() => console.log('Auth reset columns checked/ready.'))
        .catch((error) => console.error('Auth reset column setup failed:', error.message));

    // ─── Send email via Brevo HTTP API (works on Render free tier) ───
    const sendEmailViaBrevo = (toEmail, toName, subject, htmlContent, textContent) => {
        return new Promise((resolve, reject) => {
            const apiKey = process.env.BREVO_API_KEY;
            if (!apiKey) {
                return reject(new Error('BREVO_API_KEY environment variable is not set'));
            }

            const payload = JSON.stringify({
                sender: {
                    name: 'DYPCET Cafeteria Support',
                    email: 'mahalaxmicanteen.dypcet@gmail.com'
                },
                to: [{ email: toEmail, name: toName || toEmail }],
                subject: subject,
                htmlContent: htmlContent,
                textContent: textContent
            });

            const options = {
                hostname: 'api.brevo.com',
                path: '/v3/smtp/email',
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'api-key': apiKey,
                    'content-type': 'application/json',
                    'content-length': Buffer.byteLength(payload)
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        console.log(`[BREVO] Email sent successfully to ${toEmail}`);
                        resolve({ messageId: JSON.parse(data).messageId });
                    } else {
                        console.error(`[BREVO] API error ${res.statusCode}: ${data}`);
                        reject(new Error(`Brevo API error: ${res.statusCode} - ${data}`));
                    }
                });
            });

            req.on('error', (err) => {
                console.error(`[BREVO] Request error: ${err.message}`);
                reject(err);
            });

            req.write(payload);
            req.end();
        });
    };

    // @desc    Debug Email Connection
    // @route   GET /api/auth/debug-smtp
    router.get('/debug-smtp', asyncHandler(async (req, res) => {
        const testEmail = req.query.email || 'test@example.com';
        const apiKey = process.env.BREVO_API_KEY;

        if (!apiKey) {
            return res.json({
                status: 'FAILED',
                reason: 'BREVO_API_KEY is not set in environment variables'
            });
        }

        try {
            await sendEmailViaBrevo(
                testEmail,
                'Test User',
                'SMTP DEBUG TEST - DYPCET Cafeteria',
                '<p>If you see this, <strong>Brevo HTTP API is working perfectly on Render!</strong></p>',
                'If you see this, Brevo HTTP API is working perfectly on Render!'
            );
            res.json({ status: 'SUCCESS', recipient: testEmail });
        } catch (err) {
            res.status(500).json({ status: 'ERROR', message: err.message });
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
        const identifier = String(req.body?.identifier ?? req.body?.email ?? req.body?.mobile_no ?? '').trim();
        const password = req.body?.password;

        if (!identifier || !password) {
            res.status(400);
            throw new Error('Please provide email/mobile number and password.');
        }

        const digitsOnly = identifier.replace(/\D/g, '');
        const looksLikeEmail = identifier.includes('@');

        let users = [];
        if (looksLikeEmail) {
            users = await db.query(
                'SELECT id, name, email, password, user_type, mobile_no FROM users WHERE email = ? LIMIT 1',
                [identifier]
            );
        } else {
            let mobile = digitsOnly;
            // Support +91XXXXXXXXXX / 91XXXXXXXXXX inputs.
            if (mobile.length === 12 && mobile.startsWith('91')) {
                mobile = mobile.slice(2);
            }
            if (!/^\d{10}$/.test(mobile)) {
                res.status(400);
                throw new Error('Please enter a valid email or 10-digit mobile number.');
            }

            users = await db.query(
                'SELECT id, name, email, password, user_type, mobile_no FROM users WHERE mobile_no = ? LIMIT 1',
                [mobile]
            );
        }

        if (users.length === 0) {
            res.status(401);
            throw new Error('Invalid email/mobile number or password.');
        }

        const user = users[0];
        const isMatch = await bcrypt.compare(password, user.password);

        if (isMatch) {
            res.json({
                _id: user.id,
                name: user.name,
                email: user.email,
                user_type: user.user_type,
                mobile_no: user.mobile_no,
                token: generateToken(user.id, user.name, user.user_type),
            });
        } else {
            res.status(401);
            throw new Error('Invalid email/mobile number or password.');
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

        try {
            await sendEmailViaBrevo(
                user.email,
                user.name || '',
                'Password Reset - DYPCET Cafeteria',
                `<div style="font-family: sans-serif; max-width: 500px; margin: auto; padding: 30px; border: 1px solid #eee; border-radius: 10px;">
                    <div style="text-align:center; margin-bottom: 20px;">
                        <h2 style="color: #0A2342; margin:0;">🍽️ DYPCET Cafeteria</h2>
                        <p style="color:#888; font-size:0.85rem;">Mahalaxmi Canteen Management System</p>
                    </div>
                    <h3 style="color: #333;">Password Reset Request</h3>
                    <p>Hello <strong>${user.name || ''}</strong>,</p>
                    <p>We received a request to reset your password. Click the button below:</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${resetLink}"
                           style="background-color: #F47F20; color: white; padding: 14px 30px;
                                  text-decoration: none; border-radius: 6px; font-weight: bold;
                                  display: inline-block; font-size: 1rem;">
                            Reset My Password
                        </a>
                    </div>
                    <p style="font-size:0.85rem; color:#666;">Or copy this link:</p>
                    <p style="word-break: break-all; font-size:0.8rem; color: #999;">${resetLink}</p>
                    <hr style="border:0; border-top:1px solid #eee; margin: 20px 0;">
                    <p style="font-size: 0.75rem; color: #aaa; text-align:center;">
                        This link expires in <strong>15 minutes</strong>.
                    </p>
                </div>`,
                `Hello ${user.name || ''},\n\nReset your password:\n${resetLink}\n\nExpires in 15 minutes.`
            );
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

    // @desc    Update user profile details
    // @route   PUT /api/auth/profile
    // @access  Private
    router.put('/profile', protect, asyncHandler(async (req, res) => {
        const { name, user_type, student_id, address } = req.body;
        const userId = req.user.id;

        const sql = 'UPDATE users SET name = ?, user_type = ?, student_id = ?, address = ? WHERE id = ?';
        const params = [name, user_type, student_id || null, address || null, userId];

        await db.query(sql, params);

        // Fetch updated user
        const updatedUsers = await db.query('SELECT id, name, email, user_type, mobile_no, student_id, address FROM users WHERE id = ?', [userId]);
        
        res.json({
            message: 'Profile updated successfully',
            user: updatedUsers[0]
        });
    }));

    // @desc    Change user password
    // @route   PUT /api/auth/change-password
    // @access  Private
    router.put('/change-password', protect, asyncHandler(async (req, res) => {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id;

        if (!currentPassword || !newPassword) {
            res.status(400);
            throw new Error('Current and new passwords are required.');
        }

        const users = await db.query('SELECT password FROM users WHERE id = ?', [userId]);
        const user = users[0];

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            res.status(401);
            throw new Error('Incorrect current password.');
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        await db.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId]);

        res.json({ message: 'Password changed successfully.' });
    }));

    return router;
};
