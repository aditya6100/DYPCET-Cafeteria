const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const crypto = require('crypto');
const https = require('https');

module.exports = (config, db) => {
    const router = express.Router();

    // Helper to generate JWT
    const generateToken = (id, name, user_type) => {
        return jwt.sign({ id, name, user_type }, config.jwt.secret, {
            expiresIn: '1d',
        });
    };

    const ensureAuthTables = async () => {
        // Ensure reset columns
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

        // Ensure otp_verifications table
        await db.query(`
            CREATE TABLE IF NOT EXISTS otp_verifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                mobile_no VARCHAR(15) NOT NULL,
                otp VARCHAR(6) NOT NULL,
                expires_at DATETIME NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
    };

    ensureAuthTables()
        .then(() => console.log('Auth tables checked/ready.'))
        .catch((error) => console.error('Auth table setup failed:', error.message));

    // ─── Send SMS via Fast2SMS ───
    const sendSmsViaFast2SMS = (mobileNo, otp) => {
        return new Promise((resolve, reject) => {
            const apiKey = process.env.FAST2SMS_API_KEY;
            if (!apiKey) {
                return reject(new Error('FAST2SMS_API_KEY environment variable is not set'));
            }

            const payload = JSON.stringify({
                variables_values: otp,
                route: 'otp',
                numbers: mobileNo,
            });

            const options = {
                hostname: 'www.fast2sms.com',
                path: '/dev/bulkV2',
                method: 'POST',
                headers: {
                    'authorization': apiKey,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        const parsed = JSON.parse(data);
                        if (parsed.return) {
                            console.log(`[FAST2SMS] OTP sent successfully to ${mobileNo}`);
                            resolve(parsed);
                        } else {
                            console.error(`[FAST2SMS] Business error: ${data}`);
                            reject(new Error(`Fast2SMS error: ${parsed.message || 'Unknown error'}`));
                        }
                    } else {
                        console.error(`[FAST2SMS] API error ${res.statusCode}: ${data}`);
                        reject(new Error(`Fast2SMS API error: ${res.statusCode}`));
                    }
                });
            });

            req.on('error', (err) => {
                console.error(`[FAST2SMS] Request error: ${err.message}`);
                reject(err);
            });

            req.write(payload);
            req.end();
        });
    };

    // @desc    Send OTP for registration
    // @route   POST /api/auth/send-otp
    // @access  Public
    router.post('/send-otp', asyncHandler(async (req, res) => {
        const { mobile_no } = req.body;

        if (!mobile_no || !/^\d{10}$/.test(mobile_no)) {
            res.status(400);
            throw new Error('Please provide a valid 10-digit mobile number.');
        }

        // Check if user with this mobile already exists
        const userExists = await db.query('SELECT id FROM users WHERE mobile_no = ?', [mobile_no]);
        if (userExists.length > 0) {
            res.status(409);
            throw new Error('User with this mobile number already exists.');
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        // Save OTP to DB
        await db.query('DELETE FROM otp_verifications WHERE mobile_no = ?', [mobile_no]);
        await db.query(
            'INSERT INTO otp_verifications (mobile_no, otp, expires_at) VALUES (?, ?, ?)',
            [mobile_no, otp, expiresAt]
        );

        try {
            await sendSmsViaFast2SMS(mobile_no, otp);
            res.json({ success: true, message: 'OTP sent successfully.' });
        } catch (error) {
            res.status(500);
            throw new Error(`Failed to send OTP: ${error.message}`);
        }
    }));

    // @desc    Register a new user
    // @route   POST /api/auth/register
    // @access  Public
    router.post('/register', asyncHandler(async (req, res) => {
        const { name, email, password, user_type = 'student', mobile_no, address, student_id, faculty_id, otp } = req.body;

        if (!name || !email || !password || !user_type || !mobile_no || !otp) {
            res.status(400);
            throw new Error('Please provide name, email, password, user_type, mobile_no, and otp.');
        }

        // Verify OTP
        const otpEntry = await db.query(
            'SELECT * FROM otp_verifications WHERE mobile_no = ? AND otp = ? AND expires_at > NOW()',
            [mobile_no, otp]
        );

        if (otpEntry.length === 0) {
            res.status(400);
            throw new Error('Invalid or expired OTP.');
        }

        // Check if email exists
        const emailExists = await db.query('SELECT id FROM users WHERE email = ?', [email]);
        if (emailExists.length > 0) {
            res.status(409);
            throw new Error('User with this email already exists.');
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const sql = 'INSERT INTO users (name, email, password, user_type, mobile_no, address, student_id, faculty_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
        const params = [name, email, hashedPassword, user_type, mobile_no, address || null, student_id || null, faculty_id || null];

        const result = await db.query(sql, params);

        if (result.insertId) {
            // Delete OTP after successful registration
            await db.query('DELETE FROM otp_verifications WHERE mobile_no = ?', [mobile_no]);

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

    return router;
};
