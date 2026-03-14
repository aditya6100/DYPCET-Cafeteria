const express = require('express');
const asyncHandler = require('express-async-handler');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const querystring = require('querystring');
const bcrypt = require('bcrypt');

const escapePdfText = (value = '') =>
    String(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

const createA5BillPdfBuffer = (billData) => {
    const width = 420; // A5 width in points (approx)
    const height = 595; // A5 height in points (approx)
    const stream = [];

    const addText = (text, x, y, size = 10, font = 'F1') => {
        stream.push('BT');
        stream.push(`/${font} ${size} Tf`);
        stream.push(`1 0 0 1 ${x} ${y} Tm`);
        stream.push(`(${escapePdfText(text)}) Tj`);
        stream.push('ET');
    };

    const addLine = (x1, y1, x2, y2) => {
        stream.push(`${x1} ${y1} m ${x2} ${y2} l S`);
    };

    stream.push('0.65 w');
    addText('Mahalaxmi Canteen', 124, 560, 16, 'F2');
    addText('D Y Patil College of Engineering and Technology, Kolhapur.', 55, 543, 9);

    addLine(20, 534, 400, 534);

    addText(`Name: ${billData.customerName}`, 24, 518, 10);
    addText(`Date: ${billData.orderDate}`, 280, 518, 10);
    addText('Pick Up', 24, 502, 10);
    addText(billData.pickupTime, 84, 502, 10, 'F2');

    addText(`Cashier: ${billData.cashier}`, 24, 486, 10);
    addText(`Bill No.: ${billData.billNo}`, 280, 486, 10);
    addText(`Token No.: ${billData.tokenNo}`, 24, 470, 10);

    addLine(20, 458, 400, 458);

    addText('Item', 24, 444, 10, 'F2');
    addText('Qty.', 244, 444, 10, 'F2');
    addText('Price', 286, 444, 10, 'F2');
    addText('Amount', 338, 444, 10, 'F2');
    addLine(20, 438, 400, 438);

    let y = 422;
    billData.items.forEach((item) => {
        const safeName = String(item.name || '').slice(0, 26);
        addText(safeName, 24, y, 10);
        addText(String(item.quantity), 248, y, 10);
        addText(Number(item.price || 0).toFixed(2), 280, y, 10);
        addText(Number(item.amount || 0).toFixed(2), 338, y, 10);
        y -= 15;
    });

    addLine(20, y + 6, 400, y + 6);

    const totalsY = y - 10;
    addText(`Total Qty: ${billData.totalQty}`, 24, totalsY, 10, 'F2');
    addText('Sub Total', 264, totalsY, 10);
    addText(billData.subTotal, 338, totalsY, 10);

    addText('Grand Total', 264, totalsY - 16, 10, 'F2');
    addText(`Rs ${billData.grandTotal}`, 334, totalsY - 16, 11, 'F2');

    addLine(20, totalsY - 24, 400, totalsY - 24);

    addText(`Paid via ${billData.paymentMode}`, 24, totalsY - 40, 10);
    addText('FSSAI Lic No. 21520199000172', 24, totalsY - 58, 9);
    addText('!!! Thank You. Visit Again !!!!', 118, totalsY - 78, 11, 'F2');

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

module.exports = (config, db, auth) => { // Accept shared config/db/auth
    const router = express.Router();
    const { protect, optionalProtect, admin } = auth;

    const normalizeStatus = (status = '') => String(status).trim().toLowerCase();

    const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';
    const parseTimeToMinutes = (value) => {
        if (!value) return null;
        const [hh = '0', mm = '0'] = String(value).split(':');
        const h = Number(hh);
        const m = Number(mm);
        if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
        return (h * 60) + m;
    };
    const getNowMinutesInTimeZone = () => {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: APP_TIMEZONE,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).formatToParts(new Date());
        const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
        const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
        return (hour * 60) + minute;
    };
    const isNowWithinWindow = (startMinutes, endMinutes) => {
        if (startMinutes === null || endMinutes === null) return false;
        const nowMinutes = getNowMinutesInTimeZone();
        // Supports overnight windows (e.g. 20:00 to 04:00).
        if (startMinutes <= endMinutes) {
            return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
        }
        return nowMinutes >= startMinutes || nowMinutes <= endMinutes;
    };
    const ensureOrderingOpen = async (res) => {
        let settings = null;
        try {
            const rows = await db.query(
                `SELECT setting_value
                 FROM menu_settings
                 WHERE setting_key = 'order_pause'
                 LIMIT 1`
            );
            const raw = rows?.[0]?.setting_value;
            if (raw) {
                const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                settings = {
                    enabled: Boolean(parsed?.enabled),
                    start_time: String(parsed?.start_time || '').slice(0, 5),
                    end_time: String(parsed?.end_time || '').slice(0, 5),
                    message: String(parsed?.message || '').trim()
                };
            }
        } catch (_error) {
            settings = null;
        }

        if (!settings?.enabled) return;

        const startMinutes = parseTimeToMinutes(settings.start_time);
        const endMinutes = parseTimeToMinutes(settings.end_time);
        if (!isNowWithinWindow(startMinutes, endMinutes)) return;

        res.status(403);
        throw new Error(settings.message || 'Ordering is temporarily paused. Please try again later.');
    };

    const ensureOfflineGuestUser = async () => {
        const existing = await db.query(
            `SELECT id FROM users WHERE email = ? LIMIT 1`,
            ['offline_guest@dypcet.local']
        );
        if (existing?.[0]?.id) return Number(existing[0].id);

        const randomPassword = crypto.randomBytes(24).toString('hex');
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(randomPassword, salt);

        const result = await db.query(
            `INSERT INTO users (name, email, password, user_type, mobile_no)
             VALUES (?, ?, ?, ?, ?)`,
            ['Offline Guest', 'offline_guest@dypcet.local', hashedPassword, 'visitor', '0000000000']
        );
        return Number(result.insertId);
    };

    let offlineGuestUserIdPromise = null;
    const getOfflineGuestUserId = () => {
        if (!offlineGuestUserIdPromise) {
            offlineGuestUserIdPromise = ensureOfflineGuestUser();
        }
        return offlineGuestUserIdPromise;
    };

    const getRefundPolicy = (status) => {
        const normalized = normalizeStatus(status);
        if (normalized === 'received') {
            return {
                eligible: true,
                defaultAmountRatio: 1,
                message: 'Order has not started. Full refund is allowed.'
            };
        }
        if (normalized === 'preparing') {
            return {
                eligible: true,
                defaultAmountRatio: 0.5,
                message: 'Order is in preparation. Partial refund may be approved.'
            };
        }
        if (normalized === 'cancelled') {
            return {
                eligible: true,
                defaultAmountRatio: 1,
                message: 'Cancelled orders are eligible for refund.'
            };
        }
        if (normalized === 'ready') {
            return {
                eligible: false,
                defaultAmountRatio: 0,
                message: 'Order is ready for pickup. Refund is not available by default.'
            };
        }
        if (normalized === 'completed') {
            return {
                eligible: false,
                defaultAmountRatio: 0,
                message: 'Completed orders are not eligible for refund by default.'
            };
        }
        return {
            eligible: false,
            defaultAmountRatio: 0,
            message: 'Refund is not available for this order status.'
        };
    };

    const ensureRefundColumns = async () => {
        const columns = await db.query(
            `SELECT COLUMN_NAME
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'orders'`
        );
        const existing = new Set((columns || []).map((c) => c.COLUMN_NAME));
        const migrations = [
            { column: 'payment_status', sql: "ALTER TABLE orders ADD COLUMN payment_status VARCHAR(30) NOT NULL DEFAULT 'Paid'" },
            { column: 'refund_status', sql: "ALTER TABLE orders ADD COLUMN refund_status VARCHAR(30) NOT NULL DEFAULT 'None'" },
            { column: 'refund_amount', sql: "ALTER TABLE orders ADD COLUMN refund_amount DECIMAL(10,2) NULL" },
            { column: 'refund_reason', sql: "ALTER TABLE orders ADD COLUMN refund_reason TEXT NULL" },
            { column: 'refund_admin_note', sql: "ALTER TABLE orders ADD COLUMN refund_admin_note TEXT NULL" },
            { column: 'refund_requested_at', sql: "ALTER TABLE orders ADD COLUMN refund_requested_at DATETIME NULL" },
            { column: 'refund_processed_at', sql: "ALTER TABLE orders ADD COLUMN refund_processed_at DATETIME NULL" },
            { column: 'refund_processed_by', sql: "ALTER TABLE orders ADD COLUMN refund_processed_by INT NULL" },
            { column: 'refund_last_action', sql: "ALTER TABLE orders ADD COLUMN refund_last_action VARCHAR(30) NULL" },
            { column: 'order_instruction', sql: "ALTER TABLE orders ADD COLUMN order_instruction TEXT NULL" },
            { column: 'token_number', sql: "ALTER TABLE orders ADD COLUMN token_number INT NULL" },
            { column: 'order_source', sql: "ALTER TABLE orders ADD COLUMN order_source VARCHAR(20) NOT NULL DEFAULT 'ONLINE'" },
            { column: 'payment_method', sql: "ALTER TABLE orders ADD COLUMN payment_method VARCHAR(20) NOT NULL DEFAULT 'ONLINE'" },
            { column: 'guest_access_token', sql: "ALTER TABLE orders ADD COLUMN guest_access_token VARCHAR(80) NULL" },
            { column: 'paid_at', sql: "ALTER TABLE orders ADD COLUMN paid_at DATETIME NULL" }
        ];

        for (const migration of migrations) {
            if (!existing.has(migration.column)) {
                // eslint-disable-next-line no-await-in-loop
                await db.query(migration.sql);
            }
        }

        // Backfill existing orders if token_number is null (optional, but good for display)
        await db.query(`
            UPDATE orders o
            SET token_number = (
                SELECT COUNT(*)
                FROM (SELECT id, timestamp FROM orders) as o2
                WHERE DATE(o2.timestamp) = DATE(o.timestamp)
                  AND o2.id <= o.id
            )
            WHERE token_number IS NULL
        `);

        await db.query(
            `UPDATE orders
             SET payment_status = COALESCE(NULLIF(payment_status, ''), 'Paid'),
                 refund_status = COALESCE(NULLIF(refund_status, ''), 'None'),
                 order_source = COALESCE(NULLIF(order_source, ''), 'ONLINE'),
                 payment_method = COALESCE(NULLIF(payment_method, ''), 'ONLINE')
             WHERE payment_status IS NULL
                OR payment_status = ''
                OR refund_status IS NULL
                OR refund_status = ''
                OR order_source IS NULL
                OR order_source = ''
                OR payment_method IS NULL
                OR payment_method = ''`
        );

        await db.query(
            `CREATE TABLE IF NOT EXISTS refund_audit_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                order_id INT NOT NULL,
                action VARCHAR(30) NOT NULL,
                previous_refund_status VARCHAR(30) NULL,
                next_refund_status VARCHAR(30) NULL,
                amount DECIMAL(10,2) NULL,
                reason TEXT NULL,
                processed_by INT NOT NULL,
                processed_by_name VARCHAR(150) NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_refund_order (order_id),
                INDEX idx_refund_actor (processed_by)
            )`
        );
    };

    ensureRefundColumns()
        .then(() => {
            console.log('Refund columns checked/ready.');

            // Ensure a dedicated guest user exists for offline checkout when no login is used.
            getOfflineGuestUserId().catch((error) => {
                console.error('Offline guest user setup failed:', error.message);
            });

            // Auto-cancel unpaid offline orders after 30 minutes.
            const cancelUnpaidOffline = async () => {
                try {
                    await db.query(
                        `UPDATE orders
                         SET status = 'Cancelled'
                         WHERE status = 'Awaiting Payment'
                           AND LOWER(payment_status) IN ('unpaid', 'pending')
                           AND UPPER(order_source) = 'OFFLINE'
                           AND timestamp < (NOW() - INTERVAL 30 MINUTE)`
                    );
                } catch (error) {
                    console.error('Auto-cancel unpaid offline orders failed:', error.message);
                }
            };

            setInterval(cancelUnpaidOffline, 60 * 1000);
            cancelUnpaidOffline();
        })
        .catch((error) => {
            console.error('Refund column setup failed:', error.message);
        });

    const ensurePhonePeTables = async () => {
        await db.query(
            `CREATE TABLE IF NOT EXISTS phonepe_payment_sessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                merchant_order_id VARCHAR(120) NOT NULL UNIQUE,
                user_id INT NOT NULL,
                items_json LONGTEXT NOT NULL,
                total_amount DECIMAL(10,2) NOT NULL,
                payment_status VARCHAR(30) NOT NULL DEFAULT 'CREATED',
                payment_order_id VARCHAR(160) NULL,
                payment_transaction_id VARCHAR(160) NULL,
                redirect_url TEXT NULL,
                consumed TINYINT(1) NOT NULL DEFAULT 0,
                raw_response LONGTEXT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_phonepe_user (user_id),
                INDEX idx_phonepe_status (payment_status)
            )`
        );
    };

    ensurePhonePeTables()
        .then(() => {
            console.log('PhonePe payment session table checked/ready.');
        })
        .catch((error) => {
            console.error('PhonePe table setup failed:', error.message);
        });

    const isPhonePeConfigured = () => {
        const phonepe = config.phonepe || {};
        return Boolean(
            phonepe.enabled
            && phonepe.client_id
            && phonepe.client_secret
            && phonepe.client_version
            && phonepe.auth_url
            && phonepe.base_url
        );
    };

    const getPhonePeToken = async () => {
        const authUrl = config.phonepe.auth_url;
        const credentials = {
            client_id: config.phonepe.client_id,
            client_secret: config.phonepe.client_secret,
            client_version: Number(config.phonepe.client_version)
        };

        // Try JSON first.
        let response = await fetch(authUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ...credentials,
                grant_type: 'client_credentials'
            })
        });

        // Fallback: some PhonePe setups expect x-www-form-urlencoded.
        if (!response.ok) {
            response = await fetch(authUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: querystring.stringify({
                    ...credentials,
                    grant_type: 'client_credentials'
                })
            });
        }

        const tokenData = await response.json().catch(() => ({}));
        if (!response.ok) {
            const errorMsg = tokenData?.message || tokenData?.error || 'PhonePe token request failed.';
            throw new Error(errorMsg);
        }

        const accessToken = tokenData?.access_token || tokenData?.data?.access_token || tokenData?.token;
        if (!accessToken) {
            throw new Error('PhonePe access token missing in auth response.');
        }
        return accessToken;
    };

    const extractPhonePeRedirectUrl = (payload) => (
        payload?.redirectUrl
        || payload?.data?.redirectUrl
        || payload?.data?.instrumentResponse?.redirectInfo?.url
        || payload?.instrumentResponse?.redirectInfo?.url
        || payload?.data?.paymentUrl
        || null
    );

    const extractPhonePeStatus = (payload) => {
        const rawStatus = payload?.state
            || payload?.status
            || payload?.data?.state
            || payload?.data?.status
            || payload?.code
            || '';
        return String(rawStatus).trim().toUpperCase();
    };

    const buildPhonePeStatusUrl = (merchantOrderId) => {
        const template = config.phonepe.status_endpoint_template;
        return `${config.phonepe.base_url}${template.replace('{merchantOrderId}', encodeURIComponent(merchantOrderId))}`;
    };

    // Initialize Razorpay
    const razorpay = new Razorpay({
        key_id: config.razorpay.key_id,
        key_secret: config.razorpay.key_secret
    });

    // @desc    Create a new Razorpay order
    // @route   POST /api/orders
    // @access  Protected
    router.post('/', protect, asyncHandler(async (req, res) => {
        await ensureOrderingOpen(res);
        const { amount } = req.body;

        if (!amount || amount <= 0) {
            res.status(400);
            throw new Error('Valid amount is required to create an order.');
        }

        const options = {
            amount: Math.round(amount * 100), // amount in the smallest currency unit (paise)
            currency: "INR",
            receipt: `receipt_order_${new Date().getTime()}`,
        };

        try {
            const order = await razorpay.orders.create(options);
            if (!order) {
                res.status(500);
                throw new Error('Failed to create Razorpay order.');
            }
            res.status(200).json(order);
        } catch (error) {
            console.error("Razorpay order creation failed:", error);
            res.status(500);
            throw new Error('Razorpay order creation failed.');
        }
    }));

    // @desc    Verify payment and save order to DB
    // @route   POST /api/orders/verify
    // @access  Protected
    router.post('/verify', protect, asyncHandler(async (req, res) => {
        await ensureOrderingOpen(res);
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            items,
            total_amount,
            order_instruction
        } = req.body;
        const userId = req.user.id;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !items || !total_amount) {
            throw new Error("Missing fields for payment verification.");
        }

        // 1. Verify Signature
        const hmac_body = razorpay_order_id + "|" + razorpay_payment_id;
        const generated_signature = crypto.createHmac('sha256', config.razorpay.key_secret).update(hmac_body).digest('hex');

        if (generated_signature !== razorpay_signature) {
            throw new Error("Payment verification failed: Invalid signature.");
        }

        // 2. Calculate daily token number
        const tokenResult = await db.query(
            "SELECT COUNT(*) as count FROM orders WHERE DATE(timestamp) = CURDATE()"
        );
        const dailyToken = (tokenResult[0]?.count || 0) + 1;

        // 3. Save the order using the CORRECT column names from the user's schema
        const sql = "INSERT INTO orders (user_id, items, total, status, payment_id, transaction_id, order_instruction, token_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
        const itemsJson = JSON.stringify(items);
        const safeInstruction = typeof order_instruction === 'string'
            ? order_instruction.trim().slice(0, 500)
            : null;
        const params = [userId, itemsJson, total_amount, 'Received', razorpay_payment_id, razorpay_order_id, safeInstruction || null, dailyToken];

        try {
            const result = await db.query(sql, params);
            if (result && result.insertId) {
                res.status(201).json({
                    message: "Order placed successfully!",
                    orderId: result.insertId
                });
            } else {
                throw new Error("Database insertion failed.");
            }
        } catch (dbError) {
            console.error("!!! DATABASE ERROR during order insertion:", dbError);
            throw new Error("Failed to save order to the database due to a server error.");
        }
    }));

    // @desc    Create an offline (cash) order without online payment
    // @route   POST /api/orders/offline
    // @access  Public (optional auth)
    router.post('/offline', optionalProtect, asyncHandler(async (req, res) => {
        await ensureOrderingOpen(res);

        const items = Array.isArray(req.body?.items) ? req.body.items : [];
        const totalAmount = Number(req.body?.total_amount || 0);
        const orderInstruction = typeof req.body?.order_instruction === 'string'
            ? req.body.order_instruction.trim().slice(0, 500)
            : null;

        if (items.length === 0 || !Number.isFinite(totalAmount) || totalAmount <= 0) {
            res.status(400);
            throw new Error('Valid items and total_amount are required.');
        }

        const isLoggedIn = Boolean(req.user?.id);
        let customerName = '';
        let customerMobile = '';
        let userId = null;
        let guestAccessToken = null;

        if (isLoggedIn) {
            userId = Number(req.user.id);
            customerName = String(req.user.name || '').trim();
            customerMobile = String(req.user.mobile_no || '').trim();

            // If profile is missing details, allow client to provide them for cash order.
            const providedName = String(req.body?.customer_name || '').trim().slice(0, 100);
            const providedMobileRaw = String(req.body?.customer_mobile || '').trim();
            const providedMobileDigits = providedMobileRaw.replace(/\D/g, '').slice(-10);

            if (!customerName && providedName) {
                customerName = providedName;
            }
            if ((!customerMobile || !/^\d{10}$/.test(customerMobile.replace(/\D/g, '').slice(-10))) && /^\d{10}$/.test(providedMobileDigits)) {
                customerMobile = providedMobileDigits;
            }
        } else {
            customerName = String(req.body?.customer_name || '').trim().slice(0, 100);
            const mobileRaw = String(req.body?.customer_mobile || '').trim();
            const mobileDigits = mobileRaw.replace(/\D/g, '').slice(-10);

            if (!customerName) {
                res.status(400);
                throw new Error('Customer name is required for offline orders.');
            }
            if (!/^\d{10}$/.test(mobileDigits)) {
                res.status(400);
                throw new Error('Customer mobile number must be 10 digits.');
            }

            customerMobile = mobileDigits;
            userId = await getOfflineGuestUserId();
            guestAccessToken = crypto.randomBytes(24).toString('hex');
        }

        const sql = `INSERT INTO orders
            (user_id, items, total, status, payment_status, payment_method, order_source, token_number,
             customer_name, customer_mobile, transaction_id, payment_id, order_instruction, guest_access_token, paid_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        const params = [
            userId,
            JSON.stringify(items),
            Number(totalAmount.toFixed(2)),
            'Awaiting Payment',
            'Unpaid',
            'CASH',
            'OFFLINE',
            null,
            customerName || null,
            customerMobile || null,
            null,
            null,
            orderInstruction || null,
            guestAccessToken,
            null
        ];

        const result = await db.query(sql, params);
        res.status(201).json({
            message: 'Offline order created. Please pay at the counter to start preparation.',
            orderId: result.insertId,
            guestAccessToken: guestAccessToken || null
        });
    }));

    // @desc    Get a single offline guest order by ID (token-based)
    // @route   GET /api/orders/guest/:id
    // @access  Public (token required)
    router.get('/guest/:id', asyncHandler(async (req, res) => {
        const orderId = Number(req.params.id);
        const token = String(req.query?.token || '').trim();

        if (!Number.isFinite(orderId) || orderId <= 0) {
            res.status(400);
            throw new Error('Invalid order ID.');
        }
        if (!token) {
            res.status(401);
            throw new Error('Guest token is required.');
        }

        const results = await db.query(
            `SELECT id, items, total AS total_amount, status, timestamp, transaction_id,
                    payment_status, payment_method, order_source, token_number, customer_name, customer_mobile,
                    refund_status, refund_amount, refund_reason, refund_admin_note,
                    refund_requested_at, refund_processed_at, refund_processed_by, refund_last_action, order_instruction,
                    guest_access_token
             FROM orders
             WHERE id = ?
               AND UPPER(order_source) = 'OFFLINE'
             LIMIT 1`,
            [orderId]
        );
        const order = results?.[0];
        if (!order) {
            res.status(404);
            throw new Error('Order not found.');
        }
        if (String(order.guest_access_token || '') !== token) {
            res.status(403);
            throw new Error('Invalid guest token.');
        }

        if (order.items && typeof order.items === 'string') {
            order.items = JSON.parse(order.items);
        }
        delete order.guest_access_token;

        res.json(order);
    }));

    // @desc    Get Razorpay checkout config (public key only)
    // @route   GET /api/orders/razorpay/config
    // @access  Protected
    router.get('/razorpay/config', protect, asyncHandler(async (_req, res) => {
        if (!config.razorpay.key_id) {
            res.status(500);
            throw new Error('Razorpay key is not configured on server.');
        }
        res.json({ key_id: config.razorpay.key_id });
    }));

    // @desc    Check whether PhonePe is configured
    // @route   GET /api/orders/phonepe/config
    // @access  Protected
    router.get('/phonepe/config', protect, asyncHandler(async (_req, res) => {
        res.json({ enabled: isPhonePeConfigured() });
    }));

    // @desc    Initiate PhonePe checkout session
    // @route   POST /api/orders/phonepe/initiate
    // @access  Protected
    router.post('/phonepe/initiate', protect, asyncHandler(async (req, res) => {
        await ensureOrderingOpen(res);
        if (!isPhonePeConfigured()) {
            res.status(400);
            throw new Error('PhonePe is not configured on the server. Please set PHONEPE_* environment variables.');
        }

        const items = Array.isArray(req.body?.items) ? req.body.items : [];
        const totalAmount = Number(req.body?.total_amount || 0);
        if (items.length === 0 || !Number.isFinite(totalAmount) || totalAmount <= 0) {
            res.status(400);
            throw new Error('Valid items and total_amount are required to initiate PhonePe payment.');
        }

        const merchantOrderId = `DYPCET_${Date.now()}_${req.user.id}_${Math.floor(Math.random() * 100000)}`;
        const amountInPaise = Math.round(totalAmount * 100);
        const redirectUrl = `${config.phonepe.redirect_url}${config.phonepe.redirect_url.includes('?') ? '&' : '?'}merchantOrderId=${encodeURIComponent(merchantOrderId)}`;

        await db.query(
            `INSERT INTO phonepe_payment_sessions
                (merchant_order_id, user_id, items_json, total_amount, payment_status)
             VALUES (?, ?, ?, ?, 'CREATED')`,
            [merchantOrderId, req.user.id, JSON.stringify(items), Number(totalAmount.toFixed(2))]
        );

        const token = await getPhonePeToken();
        const payUrl = `${config.phonepe.base_url}${config.phonepe.pay_endpoint}`;
        const payload = {
            merchantOrderId,
            amount: amountInPaise,
            paymentFlow: {
                type: 'PG_CHECKOUT',
                message: 'DYPCET Cafeteria Order',
                merchantUrls: {
                    redirectUrl
                }
            }
        };

        const response = await fetch(payUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `O-Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const payData = await response.json().catch(() => ({}));
        if (!response.ok) {
            await db.query(
                `UPDATE phonepe_payment_sessions
                 SET payment_status = 'FAILED', raw_response = ?
                 WHERE merchant_order_id = ?`,
                [JSON.stringify(payData || {}), merchantOrderId]
            );
            const msg = payData?.message || payData?.error || 'PhonePe payment initiation failed.';
            res.status(400);
            throw new Error(msg);
        }

        const paymentUrl = extractPhonePeRedirectUrl(payData);
        if (!paymentUrl) {
            await db.query(
                `UPDATE phonepe_payment_sessions
                 SET payment_status = 'FAILED', raw_response = ?
                 WHERE merchant_order_id = ?`,
                [JSON.stringify(payData || {}), merchantOrderId]
            );
            res.status(500);
            throw new Error('PhonePe did not return a redirect URL.');
        }

        await db.query(
            `UPDATE phonepe_payment_sessions
             SET payment_status = 'PENDING',
                 payment_order_id = ?,
                 redirect_url = ?,
                 raw_response = ?
             WHERE merchant_order_id = ?`,
            [
                payData?.orderId || payData?.data?.orderId || null,
                paymentUrl,
                JSON.stringify(payData || {}),
                merchantOrderId
            ]
        );

        res.status(200).json({
            merchantOrderId,
            paymentUrl
        });
    }));

    // @desc    Confirm PhonePe payment and place order
    // @route   POST /api/orders/phonepe/confirm
    // @access  Protected
    router.post('/phonepe/confirm', protect, asyncHandler(async (req, res) => {
        await ensureOrderingOpen(res);
        if (!isPhonePeConfigured()) {
            res.status(400);
            throw new Error('PhonePe is not configured on the server.');
        }

        const merchantOrderId = String(req.body?.merchantOrderId || '').trim();
        if (!merchantOrderId) {
            res.status(400);
            throw new Error('merchantOrderId is required.');
        }

        const sessionRows = await db.query(
            `SELECT *
             FROM phonepe_payment_sessions
             WHERE merchant_order_id = ?`,
            [merchantOrderId]
        );
        const session = sessionRows?.[0];
        if (!session) {
            res.status(404);
            throw new Error('Payment session not found.');
        }
        if (Number(session.user_id) !== Number(req.user.id)) {
            res.status(403);
            throw new Error('You are not allowed to confirm this payment.');
        }
        if (Number(session.consumed) === 1) {
            const existingRows = await db.query(
                `SELECT id FROM orders WHERE transaction_id = ? ORDER BY id DESC LIMIT 1`,
                [merchantOrderId]
            );
            if (existingRows?.[0]?.id) {
                return res.json({
                    message: 'Payment already confirmed.',
                    orderId: existingRows[0].id
                });
            }
            res.status(409);
            throw new Error('Payment session already consumed.');
        }

        const token = await getPhonePeToken();
        const statusUrl = buildPhonePeStatusUrl(merchantOrderId);
        const statusResponse = await fetch(statusUrl, {
            method: 'GET',
            headers: {
                Authorization: `O-Bearer ${token}`
            }
        });
        const statusData = await statusResponse.json().catch(() => ({}));
        if (!statusResponse.ok) {
            const statusErr = statusData?.message || statusData?.error || 'Unable to fetch PhonePe payment status.';
            res.status(400);
            throw new Error(statusErr);
        }

        const normalizedStatus = extractPhonePeStatus(statusData);
        const isSuccess = ['COMPLETED', 'SUCCESS', 'PAYMENT_SUCCESS', 'PAID'].includes(normalizedStatus);
        if (!isSuccess) {
            await db.query(
                `UPDATE phonepe_payment_sessions
                 SET payment_status = ?, raw_response = ?
                 WHERE merchant_order_id = ?`,
                [normalizedStatus || 'FAILED', JSON.stringify(statusData || {}), merchantOrderId]
            );
            res.status(400);
            throw new Error(`Payment not successful. Current status: ${normalizedStatus || 'UNKNOWN'}`);
        }

        const items = JSON.parse(session.items_json || '[]');
        
        // Calculate daily token number
        const tokenResult = await db.query(
            "SELECT COUNT(*) as count FROM orders WHERE DATE(timestamp) = CURDATE()"
        );
        const dailyToken = (tokenResult[0]?.count || 0) + 1;

        const insertResult = await db.query(
            `INSERT INTO orders (user_id, items, total, status, payment_id, transaction_id, payment_status, token_number)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.user.id,
                JSON.stringify(items),
                Number(session.total_amount || 0),
                'Received',
                statusData?.transactionId || statusData?.data?.transactionId || null,
                merchantOrderId,
                'Paid',
                dailyToken
            ]
        );

        await db.query(
            `UPDATE phonepe_payment_sessions
             SET payment_status = 'SUCCESS',
                 consumed = 1,
                 payment_transaction_id = ?,
                 raw_response = ?
             WHERE merchant_order_id = ?`,
            [
                statusData?.transactionId || statusData?.data?.transactionId || null,
                JSON.stringify(statusData || {}),
                merchantOrderId
            ]
        );

        res.status(201).json({
            message: 'PhonePe payment verified and order placed successfully.',
            orderId: insertResult.insertId
        });
    }));

    // @desc    PhonePe webhook receiver (best-effort session status update)
    // @route   POST /api/orders/phonepe/webhook
    // @access  Public (PhonePe server)
    router.post('/phonepe/webhook', asyncHandler(async (req, res) => {
        const merchantOrderId = String(
            req.body?.merchantOrderId
            || req.body?.orderId
            || req.body?.data?.merchantOrderId
            || ''
        ).trim();
        const paymentTransactionId = String(
            req.body?.transactionId
            || req.body?.data?.transactionId
            || ''
        ).trim() || null;
        const normalizedStatus = extractPhonePeStatus(req.body) || 'UNKNOWN';

        if (!merchantOrderId) {
            return res.status(200).json({ received: true, ignored: true });
        }

        await db.query(
            `UPDATE phonepe_payment_sessions
             SET payment_status = ?,
                 payment_transaction_id = COALESCE(?, payment_transaction_id),
                 raw_response = ?
             WHERE merchant_order_id = ?`,
            [normalizedStatus, paymentTransactionId, JSON.stringify(req.body || {}), merchantOrderId]
        );

        res.status(200).json({ received: true });
    }));


    // @desc    Get orders for display board
    // @route   GET /api/orders/display
    // @access  Public (or protected if needed, but display board usually needs to be accessible)
    router.get('/display', asyncHandler(async (req, res) => {
        const preparing = await db.query(
            "SELECT id, status, timestamp, user_id FROM orders WHERE LOWER(status) = 'preparing' ORDER BY timestamp ASC LIMIT 20"
        );
        const ready = await db.query(
            "SELECT id, status, timestamp, user_id FROM orders WHERE LOWER(status) IN ('ready', 'completed') ORDER BY timestamp DESC LIMIT 20"
        );

        // Map them to include customer names if possible
        const fetchNames = async (orderList) => {
            const enriched = [];
            for (const o of orderList) {
                const user = await db.query("SELECT name FROM users WHERE id = ?", [o.user_id]);
                enriched.push({
                    ...o,
                    customer_name: user?.[0]?.name || 'Customer'
                });
            }
            return enriched;
        };

        res.json({
            preparing: await fetchNames(preparing),
            ready: await fetchNames(ready)
        });
    }));

    // @desc    Get order history for logged-in user
    // @route   GET /api/orders/history
    router.get('/history', protect, asyncHandler(async (req, res) => {
        const orders = await db.query(
            `SELECT id, items, total AS total_amount, status, timestamp, transaction_id,
                    payment_status, payment_method, order_source, token_number,
                    customer_name, customer_mobile,
                    refund_status, refund_amount, refund_reason,
                    refund_admin_note, refund_requested_at, refund_processed_at,
                    refund_processed_by, refund_last_action, order_instruction
             FROM orders
             WHERE user_id = ?`,
            [req.user.id]
        );
        res.json(Array.isArray(orders) ? orders : []);
    }));

    // @desc    Get all orders for admin
    // @route   GET /api/orders/all
    router.get('/all', protect, admin, asyncHandler(async (req, res) => {
        const orders = await db.query(
            `SELECT o.id, o.items, o.total AS total_amount, o.status, o.timestamp, o.transaction_id,
                    o.payment_status, o.payment_method, o.order_source, o.token_number,
                    o.customer_name, o.customer_mobile,
                    o.refund_status, o.refund_amount, o.refund_reason,
                    o.refund_admin_note, o.refund_requested_at, o.refund_processed_at,
                    o.refund_processed_by, o.refund_last_action, o.order_instruction,
                    u.name as user_name, u.email as user_email
             FROM orders o
             JOIN users u ON o.user_id = u.id
             ORDER BY o.timestamp DESC`
        );
        const parsedOrders = (orders || []).map(order => {
            if (typeof order.items !== 'string') {
                return { ...order, items: Array.isArray(order.items) ? order.items : [] };
            }
            try {
                const parsed = JSON.parse(order.items);
                return { ...order, items: Array.isArray(parsed) ? parsed : [] };
            } catch (error) {
                console.error(`Failed to parse items JSON for order ${order.id}:`, error.message);
                return { ...order, items: [] };
            }
        });
        res.json(parsedOrders);
    }));

    // @desc    Get refunds for logged-in user
    // @route   GET /api/orders/refunds/me
    router.get('/refunds/me', protect, asyncHandler(async (req, res) => {
        const orders = await db.query(
            `SELECT id, status, total AS total_amount, timestamp, refund_status,
                    refund_amount, refund_reason, refund_admin_note,
                    refund_requested_at, refund_processed_at, refund_processed_by, refund_last_action
             FROM orders
             WHERE user_id = ?
               AND refund_status <> 'None'
             ORDER BY timestamp DESC`,
            [req.user.id]
        );
        res.json(Array.isArray(orders) ? orders : []);
    }));

    // @desc    Get all refund requests for admin
    // @route   GET /api/orders/refunds/all
    router.get('/refunds/all', protect, admin, asyncHandler(async (req, res) => {
        const refunds = await db.query(
            `SELECT o.id, o.status, o.total AS total_amount, o.timestamp, o.transaction_id,
                    o.payment_status, o.refund_status, o.refund_amount, o.refund_reason,
                    o.refund_admin_note, o.refund_requested_at, o.refund_processed_at,
                    o.refund_processed_by, o.refund_last_action,
                    u.name AS user_name, u.email AS user_email
             FROM orders o
             JOIN users u ON o.user_id = u.id
             WHERE o.refund_status <> 'None'
             ORDER BY COALESCE(o.refund_requested_at, o.timestamp) DESC`
        );
        res.json(Array.isArray(refunds) ? refunds : []);
    }));

    // @desc    Request refund for an order
    // @route   POST /api/orders/:id/refund-request
    // @access  Protected (owner only)
    router.post('/:id/refund-request', protect, asyncHandler(async (req, res) => {
        const orderId = req.params.id;
        const { reason } = req.body || {};

        const rows = await db.query(
            `SELECT id, user_id, status, total AS total_amount, refund_status
             FROM orders
             WHERE id = ?`,
            [orderId]
        );
        const order = rows[0];

        if (!order) {
            res.status(404);
            throw new Error('Order not found.');
        }

        if (Number(order.user_id) !== Number(req.user.id)) {
            res.status(403);
            throw new Error('You can request refund only for your own order.');
        }

        if (['Requested', 'Approved', 'Processed'].includes(order.refund_status)) {
            res.status(400);
            throw new Error(`Refund already ${order.refund_status.toLowerCase()} for this order.`);
        }

        const policy = getRefundPolicy(order.status);
        if (!policy.eligible) {
            res.status(400);
            throw new Error(policy.message);
        }

        const suggestedAmount = Number(order.total_amount || 0) * policy.defaultAmountRatio;
        await db.query(
            `UPDATE orders
             SET refund_status = 'Requested',
                 refund_amount = ?,
                 refund_reason = ?,
                 refund_admin_note = ?,
                 refund_requested_at = NOW(),
                 refund_processed_at = NULL,
                 refund_processed_by = NULL,
                 refund_last_action = 'request'
             WHERE id = ?`,
            [
                Number(suggestedAmount.toFixed(2)),
                reason ? String(reason).trim().slice(0, 2000) : 'Requested by customer',
                policy.message,
                orderId
            ]
        );

        res.json({
            message: 'Refund request submitted successfully.',
            suggestedRefundAmount: Number(suggestedAmount.toFixed(2)),
            policyMessage: policy.message
        });
    }));

    // @desc    Approve or reject refund
    // @route   PUT /api/orders/:id/refund
    // @access  Admin
    router.put('/:id/refund', protect, admin, asyncHandler(async (req, res) => {
        const orderId = req.params.id;
        const { action, approvedAmount, adminNote, reason } = req.body || {};
        const normalizedAction = String(action || '').trim().toLowerCase();
        const auditReason = String(reason || adminNote || '').trim().slice(0, 2000);

        if (!['approve', 'reject', 'process'].includes(normalizedAction)) {
            res.status(400);
            throw new Error('Valid refund action is required: approve, reject, or process.');
        }

        const rows = await db.query(
            `SELECT id, total AS total_amount, refund_status, refund_amount, payment_id, transaction_id
             FROM orders
             WHERE id = ?`,
            [orderId]
        );
        const order = rows[0];

        if (!order) {
            res.status(404);
            throw new Error('Order not found.');
        }

        if (order.refund_status === 'None') {
            res.status(400);
            throw new Error('No refund request found for this order.');
        }

        const safeAdminNote = adminNote ? String(adminNote).trim().slice(0, 2000) : null;
        let nextRefundStatus = order.refund_status;
        let loggedAmount = null;

        if (normalizedAction === 'approve') {
            const total = Number(order.total_amount || 0);
            const amount = Number(approvedAmount);
            const safeAmount = Number.isFinite(amount) ? amount : total;
            if (safeAmount < 0 || safeAmount > total) {
                res.status(400);
                throw new Error(`Refund amount must be between 0 and ${total.toFixed(2)}.`);
            }

            await db.query(
                `UPDATE orders
                 SET refund_status = 'Approved',
                     refund_amount = ?,
                     refund_admin_note = ?,
                     payment_status = 'Refund Pending',
                     refund_processed_at = NULL,
                     refund_processed_by = ?,
                     refund_last_action = 'approve'
                  WHERE id = ?`,
                [Number(safeAmount.toFixed(2)), safeAdminNote, req.user.id, orderId]
            );
            nextRefundStatus = 'Approved';
            loggedAmount = Number(safeAmount.toFixed(2));
        } else if (normalizedAction === 'reject') {
            await db.query(
                `UPDATE orders
                 SET refund_status = 'Rejected',
                     refund_admin_note = ?,
                     refund_processed_at = NOW(),
                     refund_processed_by = ?,
                     refund_last_action = 'reject'
                  WHERE id = ?`,
                [safeAdminNote || 'Refund request rejected by admin.', req.user.id, orderId]
            );
            nextRefundStatus = 'Rejected';
        } else {
            // ACTION: PROCESS (Actual API Call)
            const refundAmount = Number(order.refund_amount || order.total_amount || 0);

            // 1. If it's a Razorpay payment, call their API
            if (order.payment_id && order.payment_id.startsWith('pay_')) {
                try {
                    console.log(`[REFUND] Initiating Razorpay refund for payment ${order.payment_id}, amount: ${refundAmount}`);
                    const rzpRefund = await razorpay.payments.refund(order.payment_id, {
                        amount: Math.round(refundAmount * 100), // convert to paise
                        notes: {
                            reason: auditReason || 'Admin processed refund',
                            order_id: orderId.toString()
                        }
                    });
                    console.log(`[REFUND] Razorpay refund successful: ${rzpRefund.id}`);
                } catch (rzpError) {
                    console.error("[REFUND] Razorpay API refund failed:", rzpError);
                    res.status(500);
                    throw new Error(`Razorpay Refund Failed: ${rzpError.description || rzpError.message || 'Unknown error'}`);
                }
            } else {
                console.log(`[REFUND] Order ${orderId} does not have a Razorpay payment ID (${order.payment_id}). Proceeding with manual/DB-only refund.`);
            }

            await db.query(
                `UPDATE orders
                 SET refund_status = 'Processed',
                     payment_status = 'Refunded',
                     refund_processed_at = NOW(),
                     refund_admin_note = ?,
                     refund_processed_by = ?,
                     refund_last_action = 'process'
                 WHERE id = ?`,
                [safeAdminNote || 'Refund processed successfully.', req.user.id, orderId]
            );
            nextRefundStatus = 'Processed';
            loggedAmount = refundAmount;
        }
        await db.query(
            `INSERT INTO refund_audit_logs
                (order_id, action, previous_refund_status, next_refund_status, amount, reason, processed_by, processed_by_name)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                orderId,
                normalizedAction,
                order.refund_status,
                nextRefundStatus,
                loggedAmount,
                auditReason || safeAdminNote || 'No reason provided.',
                req.user.id,
                req.user.name || null
            ]
        );

        const actionLabel =
            normalizedAction === 'approve'
                ? 'approved'
                : normalizedAction === 'reject'
                    ? 'rejected'
                    : 'processed';
        res.json({ message: `Refund ${actionLabel} successfully.` });
    }));

    // @desc    Get refund audit trail for an order
    // @route   GET /api/orders/:id/refund-audit
    // @access  Admin
    router.get('/:id/refund-audit', protect, admin, asyncHandler(async (req, res) => {
        const orderId = req.params.id;
        const logs = await db.query(
            `SELECT id, order_id, action, previous_refund_status, next_refund_status, amount,
                    reason, processed_by, processed_by_name, created_at
             FROM refund_audit_logs
             WHERE order_id = ?
             ORDER BY created_at DESC, id DESC`,
            [orderId]
        );
        res.json(Array.isArray(logs) ? logs : []);
    }));

    // @desc    Download bill PDF for an order
    // @route   GET /api/orders/:id/bill.pdf
    // @access  Protected (owner, admin, staff)
    router.get('/:id/bill.pdf', protect, asyncHandler(async (req, res) => {
        const orderId = req.params.id;
        const results = await db.query(
            `SELECT o.id, o.items, o.total AS total_amount, o.status, o.timestamp, o.transaction_id, o.user_id,
                    payment_status, refund_status, refund_amount, refund_reason,
                    refund_admin_note, refund_requested_at, refund_processed_at,
                    refund_processed_by, refund_last_action, u.name AS customer_name
             FROM orders o
             LEFT JOIN users u ON o.user_id = u.id
             WHERE o.id = ?`,
            [orderId]
        );
        const order = results[0];

        if (!order) {
            res.status(404);
            throw new Error('Order not found.');
        }

        if (req.user.user_type !== 'admin' && req.user.user_type !== 'staff' && req.user.id !== order.user_id) {
            res.status(403);
            throw new Error('You do not have permission to access this bill.');
        }

        let parsedItems = [];
        if (order.items) {
            parsedItems = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
        }

        const subtotal = (parsedItems || []).reduce(
            (sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 0)),
            0
        );
        const total = Number(order.total_amount || 0);
        const orderDate = new Date(order.timestamp || Date.now());
        const dd = String(orderDate.getDate()).padStart(2, '0');
        const mm = String(orderDate.getMonth() + 1).padStart(2, '0');
        const yy = String(orderDate.getFullYear()).slice(-2);
        const hh = String(orderDate.getHours()).padStart(2, '0');
        const min = String(orderDate.getMinutes()).padStart(2, '0');

        const billItems = (parsedItems || []).map((item) => {
            const qty = Number(item.quantity || 0);
            const price = Number(item.price || 0);
            return {
                name: item.name || 'Item',
                quantity: qty,
                price,
                amount: qty * price
            };
        });
        const totalQty = billItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

        const paymentMode = order.transaction_id
            ? 'Other [UPI]'
            : 'Cash';

        const pdfBuffer = createA5BillPdfBuffer({
            customerName: order.customer_name || req.user.name || 'Customer',
            orderDate: `${dd}/${mm}/${yy}`,
            pickupTime: `${hh}:${min}`,
            cashier: 'biller',
            billNo: order.id,
            tokenNo: order.id,
            items: billItems,
            totalQty,
            subTotal: subtotal.toFixed(2),
            grandTotal: total.toFixed(2),
            paymentMode
        });
        const filename = `DYPCET_Bill_Order_${order.id}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=\"${filename}\"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        res.send(pdfBuffer);
    }));

    // @desc    Get a single order by ID
    // @route   GET /api/orders/:id
    router.get('/:id', protect, asyncHandler(async (req, res) => {
        const orderId = req.params.id;
        console.log(`--- FETCHING ORDER ID: ${orderId} ---`);
        const query = `SELECT id, items, total AS total_amount, status, timestamp, transaction_id, user_id,
                              payment_status, payment_method, order_source, token_number, customer_name, customer_mobile,
                              refund_status, refund_amount, refund_reason,
                              refund_admin_note, refund_requested_at, refund_processed_at,
                              refund_processed_by, refund_last_action, order_instruction
                       FROM orders WHERE id = ?`;
        
        const results = await db.query(query, [orderId]);
        const order = results[0];

        // Step 1: Check if order exists at all
        if (!order) {
            console.error(`Order ID ${orderId} not found in DB.`);
            res.status(404);
            throw new Error('Order not found.');
        }

        // Step 2: Check for permissions
        if (req.user.user_type !== 'admin' && req.user.user_type !== 'staff' && req.user.id !== order.user_id) {
            console.error(`Permission denied for user ${req.user.id} to view order ${orderId}.`);
            res.status(403); // Forbidden
            throw new Error('You do not have permission to view this order.');
        }

        // If we get here, everything is good.
        if (order.items && typeof order.items === 'string') {
            order.items = JSON.parse(order.items);
        }
        console.log(`Sending order ${orderId} details:`, order);
        res.json(order);
    }));

    // @desc    Mark an offline cash order as paid and assign token number
    // @route   PUT /api/orders/:id/mark-paid
    // @access  Admin
    router.put('/:id/mark-paid', protect, admin, asyncHandler(async (req, res) => {
        const orderId = Number(req.params.id);
        if (!Number.isFinite(orderId) || orderId <= 0) {
            res.status(400);
            throw new Error('Invalid order ID.');
        }

        const rows = await db.query(
            `SELECT id, status, timestamp, payment_status, order_source
             FROM orders
             WHERE id = ?
             LIMIT 1`,
            [orderId]
        );
        const order = rows?.[0];
        if (!order) {
            res.status(404);
            throw new Error('Order not found.');
        }
        if (String(order.order_source || '').toUpperCase() !== 'OFFLINE') {
            res.status(400);
            throw new Error('Only offline orders can be marked paid here.');
        }
        if (String(order.payment_status || '').toLowerCase() === 'paid') {
            return res.json({ message: 'Order is already marked as paid.' });
        }

        const tokenRows = await db.query(
            `SELECT COALESCE(MAX(token_number), 0) + 1 AS next_token
             FROM orders
             WHERE token_number IS NOT NULL
               AND DATE(timestamp) = DATE(?)`,
            [order.timestamp]
        );
        const tokenNumber = Number(tokenRows?.[0]?.next_token || 1);

        await db.query(
            `UPDATE orders
             SET payment_status = 'Paid',
                 payment_method = 'CASH',
                 paid_at = NOW(),
                 token_number = ?,
                 status = 'Received'
             WHERE id = ?`,
            [tokenNumber, orderId]
        );

        res.json({ message: 'Offline order marked as paid.', token_number: tokenNumber });
    }));


    // @desc    Update order status
    // @route   PUT /api/orders/:id/status
    // @access  Admin
    router.put('/:id/status', protect, admin, asyncHandler(async (req, res) => {
        const { newStatus } = req.body;
        const { id } = req.params;

        if (!newStatus) {
            res.status(400);
            throw new Error('New status is required.');
        }

        const result = await db.query("UPDATE orders SET status = ? WHERE id = ?", [newStatus, id]);

        if (result.affectedRows > 0) {
            res.json({ message: "Order status updated successfully" });
        } else {
            res.status(404);
            throw new Error("Order not found");
        }
    }));

    return router;
};
