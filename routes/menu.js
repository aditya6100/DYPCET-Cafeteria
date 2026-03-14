const express = require('express');
const asyncHandler = require('express-async-handler');
const path = require('path');
const fs = require('fs');
const { formidable } = require('formidable'); // Import formidable factory function

module.exports = (config, db, auth) => { // Accept shared config/db/auth
    const router = express.Router();
    const { protect, admin } = auth;
    const normalizeCategory = (value = 'REGULAR') => {
        const raw = String(value ?? '').trim().toUpperCase();
        const normalized = raw
            .replace(/[^A-Z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');

        // Map common legacy labels to the canonical category keys used in the UI.
        const aliases = {
            HOT_BEVERAGES_TEA: 'HOT_BEVERAGES'
        };

        return aliases[normalized] || normalized || 'REGULAR';
    };
    const toSqlDateTime = (value) => {
        if (!value) return null;
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return null;
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const hh = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        const ss = String(date.getSeconds()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
    };

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
    const getOrderPauseSettings = async () => {
        const rows = await db.query(
            `SELECT setting_value
             FROM menu_settings
             WHERE setting_key = 'order_pause'
             LIMIT 1`
        );

        const raw = rows?.[0]?.setting_value;
        if (!raw) {
            return {
                enabled: false,
                start_time: '13:00',
                end_time: '14:00',
                message: 'Ordering is temporarily paused. Please try again later.',
                show_on_display_board: true
            };
        }

        try {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            return {
                enabled: Boolean(parsed?.enabled),
                start_time: String(parsed?.start_time || '13:00').slice(0, 5),
                end_time: String(parsed?.end_time || '14:00').slice(0, 5),
                message: String(parsed?.message || 'Ordering is temporarily paused. Please try again later.').slice(0, 200),
                show_on_display_board: parsed?.show_on_display_board === undefined ? true : Boolean(parsed?.show_on_display_board)
            };
        } catch (_error) {
            return {
                enabled: false,
                start_time: '13:00',
                end_time: '14:00',
                message: 'Ordering is temporarily paused. Please try again later.',
                show_on_display_board: true
            };
        }
    };

    const ensureMenuColumns = async () => {
        await db.query(
            `CREATE TABLE IF NOT EXISTS menu_categories (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )`
        );

        const columns = await db.query(
            `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'menu_items'`
        );
        if (!Array.isArray(columns) || columns.length === 0) {
            // menu_items table is expected to exist (created via SQL dump/migration).
            // If it doesn't, skip menu-specific column updates/seeding here.
            return;
        }
        const existing = new Set((columns || []).map((c) => c.COLUMN_NAME));
        const menuTypeColumn = (columns || []).find((c) => c.COLUMN_NAME === 'menu_type');

        // If menu_type is ENUM in existing DB, custom categories fail.
        // Convert to VARCHAR to support dynamic admin-defined categories.
        if (menuTypeColumn && String(menuTypeColumn.DATA_TYPE || '').toLowerCase() === 'enum') {
            await db.query(
                `ALTER TABLE menu_items
                 MODIFY COLUMN menu_type VARCHAR(100) NOT NULL DEFAULT 'REGULAR'`
            );
        }

        if (!existing.has('today_special')) {
            await db.query(`ALTER TABLE menu_items ADD COLUMN today_special TINYINT(1) NOT NULL DEFAULT 0`);
        }
        if (!existing.has('display_order')) {
            await db.query(`ALTER TABLE menu_items ADD COLUMN display_order INT NOT NULL DEFAULT 0`);
            await db.query(`UPDATE menu_items SET display_order = id WHERE display_order = 0`);
        }
        if (!existing.has('today_special_start_at')) {
            await db.query(`ALTER TABLE menu_items ADD COLUMN today_special_start_at DATETIME NULL`);
        }
        if (!existing.has('today_special_end_at')) {
            await db.query(`ALTER TABLE menu_items ADD COLUMN today_special_end_at DATETIME NULL`);
        }
        if (!existing.has('description')) {
            await db.query(`ALTER TABLE menu_items ADD COLUMN description TEXT NULL`);
        }

        // Normalize legacy hot beverages category labels so items like "Tea"
        // appear under the correct HOT_BEVERAGES section in the menu UI.
        await db.query(
            `UPDATE menu_items
             SET menu_type = 'HOT_BEVERAGES'
             WHERE menu_type IN ('HOT BEVERAGES/TEA', 'HOT_BEVERAGES/TEA', 'HOT BEVERAGES', 'HOT_BEVERAGES_TEA')`
        );

        // Ensure a basic "Tea" item exists under HOT_BEVERAGES for fresh databases.
        const existingTea = await db.query(
            `SELECT id
             FROM menu_items
             WHERE LOWER(TRIM(name)) = 'tea'
               AND UPPER(TRIM(menu_type)) = 'HOT_BEVERAGES'
             LIMIT 1`
        );
        if (!Array.isArray(existingTea) || existingTea.length === 0) {
            const nextOrderRows = await db.query(
                `SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order
                 FROM menu_items
                 WHERE UPPER(TRIM(menu_type)) = 'HOT_BEVERAGES'`
            );
            const nextOrder = Number(nextOrderRows?.[0]?.next_order || 1);
            await db.query(
                `INSERT INTO menu_items
                    (name, price, cost_price, image, is_available, menu_type, today_special, display_order)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                ['Tea', 10, 10, 'food_images/default-food.png', 1, 'HOT_BEVERAGES', 0, nextOrder]
            );
        }

        await db.query(
            `CREATE TABLE IF NOT EXISTS menu_settings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                setting_key VARCHAR(80) NOT NULL UNIQUE,
                setting_value TEXT NULL,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )`
        );

        await db.query(
            `INSERT IGNORE INTO menu_settings (setting_key, setting_value)
             VALUES ('menu_notice', 'Dinner and many menu items are available only after 12:00 PM.')`
        );

        await db.query(
            `INSERT IGNORE INTO menu_settings (setting_key, setting_value)
             VALUES (
                'order_pause',
                '{"enabled":false,"start_time":"13:00","end_time":"14:00","message":"Ordering is temporarily paused. Please try again later."}'
             )`
        );

        await db.query(
            `CREATE TABLE IF NOT EXISTS menu_category_timings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                category VARCHAR(100) NOT NULL UNIQUE,
                is_enabled TINYINT(1) NOT NULL DEFAULT 0,
                start_time TIME NULL,
                end_time TIME NULL,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )`
        );
    };

    ensureMenuColumns()
        .then(() => {
            console.log('Menu columns checked/ready.');
        })
        .catch((error) => {
            console.error('Menu column setup failed:', error.message);
        });

    // Custom middleware to parse multipart/form-data
    const parseMultipartForm = (req, res, next) => {
        // Check if the request is multipart/form-data
        if (!req.headers['content-type'] || !req.headers['content-type'].startsWith('multipart/form-data')) {
            return next();
        }

        const uploadDir = path.join(__dirname, '..', 'public', 'food_images');
        fs.mkdirSync(uploadDir, { recursive: true });
        const form = formidable({
            uploadDir,
            keepExtensions: true,
            maxFileSize: 5 * 1024 * 1024, // 5MB limit
            filename: (name, ext, part, form) => {
                // Generate a unique filename
                return `${Date.now()}_${part.originalFilename}`;
            },
        });

        form.parse(req, (err, fields, files) => {
            if (err) {
                console.error('Error parsing form:', err);
                res.status(400);
                return next(new Error('Failed to parse form data.'));
            }

            // Convert fields (array of strings) to single string if only one value
            const parsedFields = {};
            for (const key in fields) {
                parsedFields[key] = Array.isArray(fields[key]) ? fields[key][0] : fields[key];
            }
            req.body = parsedFields;

            // Attach file info to req.file if an image was uploaded
            if (files.image && files.image.length > 0) {
                const file = files.image[0];
                req.file = {
                    fieldname: 'image',
                    originalname: file.originalFilename,
                    encoding: file.encoding,
                    mimetype: file.mimetype,
                    destination: path.join('public', 'food_images'), // Relative path for storage
                    filename: file.newFilename, // Use the generated new filename
                    path: path.join('food_images', file.newFilename), // Relative path for database
                    size: file.size,
                };
                next();
            } else {
                req.file = null; // No file uploaded
                next();
            }
        });
    };

    // @desc    Fetch menu items (show available and unavailable items)
    // @route   GET /api/menu
    // @access  Public
    router.get('/', asyncHandler(async (req, res) => {
        const menuItems = await db.query(
            `SELECT m.*,
                    CASE
                        WHEN m.today_special = 1
                         AND (m.today_special_start_at IS NULL OR m.today_special_start_at <= NOW())
                         AND (m.today_special_end_at IS NULL OR m.today_special_end_at >= NOW())
                        THEN 1
                        ELSE 0
                    END AS today_special_effective
             FROM menu_items m
             ORDER BY m.menu_type ASC, m.display_order ASC, m.name ASC`
        );
        res.json(menuItems);
    }));

    // @desc    Fetch best-selling menu items based on order history
    // @route   GET /api/menu/best-selling
    // @access  Public
    router.get('/best-selling', asyncHandler(async (req, res) => {
        const requestedLimit = Number.parseInt(req.query.limit, 10);
        const limit = Number.isFinite(requestedLimit)
            ? Math.min(Math.max(requestedLimit, 1), 20)
            : 6;

        const orderRows = await db.query(
            `SELECT items
             FROM orders
             WHERE status IS NOT NULL
               AND LOWER(status) <> 'cancelled'`
        );

        const salesMap = new Map();
        const normalizeNameKey = (value = '') => String(value).trim().toLowerCase();

        (orderRows || []).forEach((row) => {
            let parsedItems = [];
            try {
                parsedItems = typeof row.items === 'string' ? JSON.parse(row.items) : (row.items || []);
            } catch (_error) {
                parsedItems = [];
            }

            (parsedItems || []).forEach((item) => {
                const qty = Number(item?.quantity || 0);
                if (!Number.isFinite(qty) || qty <= 0) return;

                const itemId = Number(item?.id);
                const itemName = String(item?.name || '').trim();
                if (!itemName && !Number.isFinite(itemId)) return;

                const key = Number.isFinite(itemId) ? `id:${itemId}` : `name:${normalizeNameKey(itemName)}`;
                const existing = salesMap.get(key) || {
                    id: Number.isFinite(itemId) ? itemId : null,
                    name: itemName || 'Item',
                    units_sold: 0
                };

                existing.units_sold += qty;
                if (!existing.name && itemName) {
                    existing.name = itemName;
                }
                salesMap.set(key, existing);
            });
        });

        if (salesMap.size === 0) {
            return res.json([]);
        }

        const sortedSales = Array.from(salesMap.values())
            .sort((a, b) => Number(b.units_sold || 0) - Number(a.units_sold || 0))
            .slice(0, Math.max(limit * 3, limit));

        const menuItems = await db.query(
            `SELECT m.*,
                    CASE
                        WHEN m.today_special = 1
                         AND (m.today_special_start_at IS NULL OR m.today_special_start_at <= NOW())
                         AND (m.today_special_end_at IS NULL OR m.today_special_end_at >= NOW())
                        THEN 1
                        ELSE 0
                    END AS today_special_effective
             FROM menu_items m`
        );

        const byId = new Map();
        const byName = new Map();
        (menuItems || []).forEach((item) => {
            byId.set(Number(item.id), item);
            byName.set(normalizeNameKey(item.name), item);
        });

        const bestSellers = [];
        sortedSales.forEach((sale) => {
            if (bestSellers.length >= limit) return;
            const matched = Number.isFinite(Number(sale.id))
                ? byId.get(Number(sale.id))
                : byName.get(normalizeNameKey(sale.name));
            if (!matched) return;

            bestSellers.push({
                ...matched,
                units_sold: sale.units_sold
            });
        });

        // If sales history has fewer unique matched items than requested limit,
        // fill the remaining slots from menu items so UI can still show Top N cards.
        if (bestSellers.length < limit) {
            const selectedIds = new Set(bestSellers.map((item) => Number(item.id)));
            const fallbackItems = (menuItems || [])
                .filter((item) => !selectedIds.has(Number(item.id)))
                .sort((a, b) => {
                    const aAvailable = Number(a.is_available || 0);
                    const bAvailable = Number(b.is_available || 0);
                    if (aAvailable !== bAvailable) return bAvailable - aAvailable;
                    return String(a.name || '').localeCompare(String(b.name || ''));
                });

            for (const item of fallbackItems) {
                if (bestSellers.length >= limit) break;
                bestSellers.push({
                    ...item,
                    units_sold: 0
                });
            }
        }

        res.json(bestSellers);
    }));

    // @desc    Fetch menu notice text
    // @route   GET /api/menu/notice
    // @access  Public
    router.get('/notice', asyncHandler(async (_req, res) => {
        const rows = await db.query(
            `SELECT setting_value, updated_at
             FROM menu_settings
             WHERE setting_key = 'menu_notice'
             LIMIT 1`
        );
        const row = rows && rows[0] ? rows[0] : null;
        res.json({
            notice: row?.setting_value || '',
            updated_at: row?.updated_at || null
        });
    }));

    // @desc    Get all category timings (public)
    // @route   GET /api/menu/category-timings
    // @access  Public
    router.get('/category-timings', asyncHandler(async (_req, res) => {
        const rows = await db.query(
            `SELECT category, is_enabled, start_time, end_time, updated_at
             FROM menu_category_timings
             ORDER BY category ASC`
        );
        res.json(Array.isArray(rows) ? rows : []);
    }));

    // @desc    Upsert category timing
    // @route   PUT /api/menu/category-timings/:category
    // @access  Admin
    router.put('/category-timings/:category', protect, admin, asyncHandler(async (req, res) => {
        const category = normalizeCategory(req.params?.category || '');
        if (!category) {
            res.status(400);
            throw new Error('Category is required.');
        }

        const enabled = Number(req.body?.is_enabled) ? 1 : 0;
        const startTime = String(req.body?.start_time || '').trim() || null;
        const endTime = String(req.body?.end_time || '').trim() || null;
        const timePattern = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

        if (enabled) {
            if (!startTime || !endTime) {
                res.status(400);
                throw new Error('start_time and end_time are required when timing is enabled.');
            }
            if (!timePattern.test(startTime) || !timePattern.test(endTime)) {
                res.status(400);
                throw new Error('Invalid time format. Use HH:MM or HH:MM:SS.');
            }
        }

        await db.query(
            `INSERT INTO menu_category_timings (category, is_enabled, start_time, end_time)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                is_enabled = VALUES(is_enabled),
                start_time = VALUES(start_time),
                end_time = VALUES(end_time),
                updated_at = CURRENT_TIMESTAMP`,
            [category, enabled, enabled ? startTime : null, enabled ? endTime : null]
        );

        res.json({ message: 'Category timing updated successfully.' });
    }));

    // @desc    Update menu notice text
    // @route   PUT /api/menu/notice
    // @access  Admin
    router.put('/notice', protect, admin, asyncHandler(async (req, res) => {
        const nextNotice = String(req.body?.notice || '').trim().slice(0, 600);

        await db.query(
            `INSERT INTO menu_settings (setting_key, setting_value)
             VALUES ('menu_notice', ?)
             ON DUPLICATE KEY UPDATE
                setting_value = VALUES(setting_value),
                updated_at = CURRENT_TIMESTAMP`,
            [nextNotice]
        );

        res.json({ message: 'Menu notice updated successfully.' });
    }));

    // @desc    Fetch order pause window (time-based ordering block)
    // @route   GET /api/menu/order-pause
    // @access  Public
    router.get('/order-pause', asyncHandler(async (_req, res) => {
        const settings = await getOrderPauseSettings();
        const startMinutes = parseTimeToMinutes(settings.start_time);
        const endMinutes = parseTimeToMinutes(settings.end_time);
        const isPausedNow = Boolean(settings.enabled) && isNowWithinWindow(startMinutes, endMinutes);
        res.json({
            ...settings,
            is_paused_now: isPausedNow,
            timezone: APP_TIMEZONE
        });
    }));

    // @desc    Update order pause window
    // @route   PUT /api/menu/order-pause
    // @access  Admin
    router.put('/order-pause', protect, admin, asyncHandler(async (req, res) => {
        const enabled = Boolean(req.body?.enabled);
        const start_time = String(req.body?.start_time || '13:00').slice(0, 5);
        const end_time = String(req.body?.end_time || '14:00').slice(0, 5);
        const message = String(req.body?.message || '').trim().slice(0, 200)
            || 'Ordering is temporarily paused. Please try again later.';
        const show_on_display_board = req.body?.show_on_display_board === undefined
            ? true
            : Boolean(req.body?.show_on_display_board);

        const payload = JSON.stringify({ enabled, start_time, end_time, message, show_on_display_board });

        await db.query(
            `INSERT INTO menu_settings (setting_key, setting_value)
             VALUES ('order_pause', ?)
             ON DUPLICATE KEY UPDATE
                setting_value = VALUES(setting_value),
                updated_at = CURRENT_TIMESTAMP`,
            [payload]
        );

        const startMinutes = parseTimeToMinutes(start_time);
        const endMinutes = parseTimeToMinutes(end_time);
        const isPausedNow = Boolean(enabled) && isNowWithinWindow(startMinutes, endMinutes);

        res.json({
            message: 'Order pause settings updated successfully.',
            settings: { enabled, start_time, end_time, message, show_on_display_board, is_paused_now: isPausedNow, timezone: APP_TIMEZONE }
        });
    }));

    // @desc    Fetch menu categories
    // @route   GET /api/menu/categories
    // @access  Protected Admin
    router.get('/categories', protect, admin, asyncHandler(async (req, res) => {
        const categoriesFromItems = await db.query(
            `SELECT DISTINCT menu_type
             FROM menu_items
             WHERE menu_type IS NOT NULL
               AND menu_type <> ''
             ORDER BY menu_type ASC`
        );

        const categoriesFromMaster = await db.query(
            `SELECT name
             FROM menu_categories
             ORDER BY name ASC`
        );

        const unique = new Set();
        (categoriesFromItems || []).forEach((row) => unique.add(row.menu_type));
        (categoriesFromMaster || []).forEach((row) => unique.add(row.name));

        res.json(Array.from(unique).sort());
    }));

    // @desc    Add new menu category (without creating an item)
    // @route   POST /api/menu/categories
    // @access  Protected Admin
    router.post('/categories', protect, admin, asyncHandler(async (req, res) => {
        const normalized = normalizeCategory(req.body?.name || '');
        if (!normalized) {
            res.status(400);
            throw new Error('Category name is required.');
        }

        try {
            await db.query(
                `INSERT INTO menu_categories (name)
                 VALUES (?)`,
                [normalized]
            );
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                return res.json({ message: 'Category already exists.' });
            }
            throw error;
        }

        return res.status(201).json({ message: 'Category added successfully.' });
    }));

    // @desc    Add a new menu item
    // @route   POST /api/menu
    // @access  Admin
    router.post('/', protect, admin, parseMultipartForm, asyncHandler(async (req, res) => {
        const {
            name,
            price,
            cost_price,
            menu_type = 'REGULAR',
            is_available,
            today_special,
            today_special_start_at,
            today_special_end_at,
            description
        } = req.body;
        
        const trimmedName = String(name || '').trim();
        const parsedPrice = Number.parseFloat(String(price ?? '').trim());
        const costText = String(cost_price ?? '').trim();
        const parsedCostPrice = costText === '' ? 0 : Number.parseFloat(costText);

        if (!trimmedName) {
            res.status(400);
            throw new Error('Missing required field: name');
        }
        if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
            res.status(400);
            throw new Error('Invalid price value.');
        }
        if (!Number.isFinite(parsedCostPrice) || parsedCostPrice < 0) {
            res.status(400);
            throw new Error('Invalid cost_price value.');
        }

        let imagePath = 'food_images/default-food.png'; // Default image
        
        // If a file was uploaded, update imagePath
        if (req.file) {
            imagePath = `food_images/${path.basename(req.file.path)}`;
        }

        const startAt = toSqlDateTime(today_special_start_at);
        const endAt = toSqlDateTime(today_special_end_at);
        if (startAt && endAt && new Date(startAt).getTime() > new Date(endAt).getTime()) {
            res.status(400);
            throw new Error('Today special start time must be before end time.');
        }

        const normalizedMenuType = normalizeCategory(menu_type);
        const displayOrderRows = await db.query(
            `SELECT COALESCE(MAX(CASE WHEN display_order <= 2000000000 THEN display_order END), 0) + 1 AS next_order
             FROM menu_items
             WHERE UPPER(TRIM(menu_type)) = ?`,
            [normalizedMenuType]
        );
        const displayOrder = Number(displayOrderRows?.[0]?.next_order || 1);

        const sql = `INSERT INTO menu_items
            (name, price, cost_price, image, is_available, menu_type, today_special, display_order, today_special_start_at, today_special_end_at, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const params = [
            trimmedName,
            parsedPrice,
            parsedCostPrice,
            imagePath,
            Number(is_available) ? 1 : 0,
            normalizedMenuType,
            Number(today_special) ? 1 : 0,
            displayOrder,
            startAt,
            endAt,
            description || null
        ];
        
        const result = await db.query(sql, params);

        if (result.insertId) {
            res.status(201).json({ message: "Menu item added successfully", itemId: result.insertId });
        } else {
            res.status(500);
            throw new Error("Failed to add menu item");
        }
    }));

    // @desc    Update a menu item
    // @route   PUT /api/menu/:id
    // @access  Admin
    router.put('/:id', protect, admin, parseMultipartForm, asyncHandler(async (req, res) => {
        const {
            name,
            price,
            cost_price,
            is_available,
            menu_type,
            today_special,
            today_special_start_at,
            today_special_end_at,
            description
        } = req.body;
        const { id } = req.params;

        const item = await db.query("SELECT image, today_special_start_at, today_special_end_at FROM menu_items WHERE id = ?", [id]);
        if (item.length === 0) {
            res.status(404);
            throw new Error("Menu item not found");
        }

        let imagePath = item[0].image; // Keep existing image path by default

        // If a new file was uploaded, handle it
        if (req.file) {
            // Delete old image if it's not the default one
            if (imagePath && imagePath !== 'food_images/default-food.png') {
                const oldFullPath = path.join(__dirname, '..', 'public', imagePath);
                if (fs.existsSync(oldFullPath)) {
                    fs.unlinkSync(oldFullPath);
                }
            }
            imagePath = `food_images/${path.basename(req.file.path)}`;
        }


        // Build query dynamically based on provided fields
        const fieldsToUpdate = [];
        const params = [];

        if (name !== undefined) { fieldsToUpdate.push("name = ?"); params.push(name); }
        if (price !== undefined && price !== '') { fieldsToUpdate.push("price = ?"); params.push(parseFloat(price)); }
        if (cost_price !== undefined && cost_price !== '') { fieldsToUpdate.push("cost_price = ?"); params.push(parseFloat(cost_price)); }
        if (is_available !== undefined) {
            fieldsToUpdate.push("is_available = ?");
            params.push(Number(is_available)); 
        }
        if (menu_type !== undefined) { fieldsToUpdate.push("menu_type = ?"); params.push(normalizeCategory(menu_type)); }
        if (today_special !== undefined) {
            fieldsToUpdate.push("today_special = ?");
            params.push(Number(today_special));
        }
        if (today_special_start_at !== undefined) {
            fieldsToUpdate.push("today_special_start_at = ?");
            params.push(toSqlDateTime(today_special_start_at));
        }
        if (today_special_end_at !== undefined) {
            fieldsToUpdate.push("today_special_end_at = ?");
            params.push(toSqlDateTime(today_special_end_at));
        }
        if (description !== undefined) {
            fieldsToUpdate.push("description = ?");
            params.push(description || null);
        }

        const hasStart = today_special_start_at !== undefined;
        const hasEnd = today_special_end_at !== undefined;
        if (hasStart || hasEnd) {
            const effectiveStart = hasStart ? toSqlDateTime(today_special_start_at) : toSqlDateTime(item[0].today_special_start_at);
            const effectiveEnd = hasEnd ? toSqlDateTime(today_special_end_at) : toSqlDateTime(item[0].today_special_end_at);
            if (effectiveStart && effectiveEnd && new Date(effectiveStart).getTime() > new Date(effectiveEnd).getTime()) {
                res.status(400);
                throw new Error('Today special start time must be before end time.');
            }
        }
        if (req.file || (imagePath && !req.file && imagePath !== item[0].image)) {
            fieldsToUpdate.push("image = ?");
            params.push(imagePath);
        }


        if (fieldsToUpdate.length === 0) {
            return res.status(400).json({ message: "No fields to update" });
        }

        params.push(id);
        const sql = `UPDATE menu_items SET ${fieldsToUpdate.join(", ")} WHERE id = ?`;

        const result = await db.query(sql, params);

        res.json({ 
            message: "Menu item updated successfully",
            changed: result.affectedRows > 0
        });
    }));

    // @desc    Reorder menu items inside one category
    // @route   PUT /api/menu/reorder
    // @access  Admin
    router.put('/reorder', protect, admin, asyncHandler(async (req, res) => {
        const category = normalizeCategory(req.body?.category);
        const itemIds = Array.isArray(req.body?.itemIds) ? req.body.itemIds.map((id) => Number(id)).filter(Boolean) : [];

        if (!itemIds.length) {
            res.status(400);
            throw new Error('itemIds are required for reordering.');
        }

        let order = 1;
        for (const id of itemIds) {
            // eslint-disable-next-line no-await-in-loop
            await db.query(
                `UPDATE menu_items
                 SET display_order = ?
                 WHERE id = ? AND menu_type = ?`,
                [order, id, category]
            );
            order += 1;
        }

        res.json({ message: 'Menu order updated successfully.' });
    }));

    // @desc    Delete a menu item
    // @route   DELETE /api/menu/:id
    // @access  Admin
    router.delete('/:id', protect, admin, asyncHandler(async (req, res) => {
        const { id } = req.params;

        const item = await db.query("SELECT image FROM menu_items WHERE id = ?", [id]);
        if (item.length === 0) {
            res.status(404);
            throw new Error("Menu item not found");
        }

        // Attempt to delete the associated image file, unless it's the default one
        const imagePath = item[0].image;
        if (imagePath && imagePath !== 'food_images/default-food.png') {
            const fullPath = path.join(__dirname, '..', 'public', imagePath);
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
            }
        }

        const result = await db.query("DELETE FROM menu_items WHERE id = ?", [id]);

        if (result.affectedRows > 0) {
            res.json({ message: "Menu item deleted successfully" });
        } else {
            res.status(404);
            throw new Error("Menu item not found");
        }
    }));

    return router;
};
