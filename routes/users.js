const express = require('express');
const asyncHandler = require('express-async-handler');
const bcrypt = require('bcrypt');

module.exports = (config, db, auth) => { // Accept shared config/db/auth
    const router = express.Router();
    const { protect, admin } = auth;

    // --- User-specific routes ---

    // @desc    Get user's own profile
    // @route   GET /api/users/profile
    // @access  Protected
    router.get('/profile', protect, asyncHandler(async (req, res) => {
        // The user object is already attached by the 'protect' middleware
        res.json(req.user);
    }));

    // @desc    Update user's own profile
    // @route   PUT /api/users/profile
    // @access  Protected
    router.put('/profile', protect, asyncHandler(async (req, res) => {
        const { name, mobile_no, address } = req.body;
        const userId = req.user.id;

        // In a real app, you'd have more robust validation here
        const sql = "UPDATE users SET name = ?, mobile_no = ?, address = ? WHERE id = ?";
        const result = await db.query(sql, [name, mobile_no, address || null, userId]);

        if (result.affectedRows > 0) {
            // Fetch the updated user data to send back
            const updatedUser = await db.query("SELECT id, name, email, user_type, mobile_no, address FROM users WHERE id = ?", [userId]);
            res.json(updatedUser[0]);
        } else {
            res.status(404);
            throw new Error("User not found or no changes made.");
        }
    }));

    // @desc    Change user's own password
    // @route   PUT /api/users/profile/password
    // @access  Protected
    router.put('/profile/password', protect, asyncHandler(async (req, res) => {
        const { newPassword } = req.body;
        const userId = req.user.id;

        if (!newPassword || newPassword.length < 6) {
            res.status(400);
            throw new Error("Password must be at least 6 characters long.");
        }
        
        // Hash the new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        const sql = "UPDATE users SET password = ? WHERE id = ?";
        const result = await db.query(sql, [hashedPassword, userId]);

        if (result.affectedRows > 0) {
            res.json({ message: "Password updated successfully." });
        } else {
            res.status(404);
            throw new Error("User not found.");
        }
    }));


    // @desc    Get all users (Faculty access)
    // @route   GET /api/users/faculty
    // @access  Faculty
    router.get('/faculty', protect, asyncHandler(async (req, res) => {
        // Check if user is faculty coordinator
        if (req.user.user_type !== 'faculty') {
            res.status(403);
            throw new Error('Not authorized - Faculty coordinators only');
        }
        const users = await db.query("SELECT id, name, email, user_type, mobile_no, address, student_id, faculty_id FROM users");
        // Ensure we always respond with an array
        res.json(Array.isArray(users) ? users : []);
    }));


    // --- Admin-only routes ---
    router.use(protect, admin);

    // @desc    Get all users
    // @route   GET /api/users
    // @access  Admin
    router.get('/', asyncHandler(async (req, res) => {
        const users = await db.query("SELECT id, name, email, user_type, mobile_no, address, student_id, faculty_id FROM users");
        // Ensure we always respond with an array
        res.json(Array.isArray(users) ? users : []);
    }));

    // @desc    Create a new user (Admin only)
    // @route   POST /api/users
    // @access  Admin
    router.post('/', asyncHandler(async (req, res) => {
        const { name, email, password, user_type, mobile_no, address, student_id, faculty_id } = req.body;

        if (!name || !email || !password || !user_type || !mobile_no) {
            res.status(400);
            throw new Error('Please provide name, email, password, user_type, and mobile_no.');
        }

        // Check if email already exists
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
                message: 'User created successfully',
                userId: result.insertId,
            });
        } else {
            res.status(500);
            throw new Error('Failed to create user.');
        }
    }));

    // @desc    Get a single user by ID
    // @route   GET /api/users/:id
    // @access  Admin
    router.get('/:id', asyncHandler(async (req, res) => {
        const user = await db.query("SELECT id, name, email, user_type, mobile_no, address, student_id, faculty_id, created_at FROM users WHERE id = ?", [req.params.id]);
        if (user.length > 0) {
            res.json(user[0]);
        } else {
            res.status(404);
            throw new Error('User not found');
        }
    }));


    // @desc    Update a user
    // @route   PUT /api/users/:id
    // @access  Admin
    router.put('/:id', asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { name, email, user_type, mobile_no, address, student_id, faculty_id } = req.body;

        // Check if user exists
        const userExists = await db.query("SELECT id FROM users WHERE id = ?", [id]);
        if (userExists.length === 0) {
            res.status(404);
            throw new Error("User not found");
        }

        // Build query dynamically
        const fieldsToUpdate = [];
        const params = [];

        if (name !== undefined) { fieldsToUpdate.push("name = ?"); params.push(name); }
        if (email !== undefined) { fieldsToUpdate.push("email = ?"); params.push(email); }
        if (user_type !== undefined) { fieldsToUpdate.push("user_type = ?"); params.push(user_type); }
        if (mobile_no !== undefined) { fieldsToUpdate.push("mobile_no = ?"); params.push(mobile_no); }
        
        // Handle fields that can be null
        fieldsToUpdate.push("address = ?");
        params.push(address || null);
        fieldsToUpdate.push("student_id = ?");
        params.push(student_id || null);
        fieldsToUpdate.push("faculty_id = ?");
        params.push(faculty_id || null);

        if (fieldsToUpdate.length === 0) {
            return res.status(400).json({ message: "No fields to update" });
        }

        params.push(id);
        const sql = `UPDATE users SET ${fieldsToUpdate.join(", ")} WHERE id = ?`;

        try {
            const result = await db.query(sql, params);
            if (result.affectedRows > 0) {
                res.json({ message: "User updated successfully." });
            } else {
                res.status(404).json({ error: "User not found or no changes made." });
            }
        } catch (error) {
            // Handle potential unique constraint violations
            if (error.code === 'ER_DUP_ENTRY') {
                res.status(409); // Conflict
                if (error.sqlMessage.includes('email')) throw new Error("Email already in use.");
                if (error.sqlMessage.includes('student_id')) throw new Error("Student ID already in use.");
                if (error.sqlMessage.includes('faculty_id')) throw new Error("Faculty ID already in use.");
            }
            throw error; // Re-throw other errors
        }
    }));


    // @desc    Delete a user
    // @route   DELETE /api/users/:id
    // @access  Admin
    router.delete('/:id', asyncHandler(async (req, res) => {
        const { id } = req.params;

        // Optional: Prevent admin from deleting themselves
        if (req.user.id === parseInt(id, 10)) {
            res.status(400);
            throw new Error("You cannot delete your own admin account.");
        }

        const result = await db.query("DELETE FROM users WHERE id = ?", [id]);

        if (result.affectedRows > 0) {
            res.json({ message: "User deleted successfully." });
        } else {
            res.status(404);
            throw new Error("User not found.");
        }
    }));

    return router;
};
