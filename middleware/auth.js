const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');

module.exports = (config, db) => { // Accept config and a shared db instance

    // Middleware to protect routes that require a logged-in user
    const protect = asyncHandler(async (req, res, next) => {
        let token;

        // Check for the token in the Authorization header
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            try {
                // Get token from header (e.g., "Bearer eyJhbGci...")
                token = req.headers.authorization.split(' ')[1];

                // Verify the token
                const decoded = jwt.verify(token, config.jwt.secret);

                // Get user from the database using the id from the token payload
                // We select all fields except the password for security
                const users = await db.query(
                    "SELECT id, name, email, user_type, mobile_no, address, student_id, faculty_id FROM users WHERE id = ?",
                    [decoded.id]
                );

                if (users.length === 0) {
                    res.status(401);
                    throw new Error('Not authorized, user not found');
                }

                // Attach the user object to the request for use in subsequent routes
                req.user = users[0];

                next(); // Proceed to the next middleware/route handler

            } catch (error) {
                console.error(error);
                res.status(401);
                throw new Error('Not authorized, token failed');
            }
        }

        if (!token) {
            res.status(401);
            throw new Error('Not authorized, no token');
        }
    });


    // Middleware to check for admin users
    const admin = asyncHandler((req, res, next) => {
        // This middleware should run *after* the 'protect' middleware
        if (req.user && (req.user.user_type === 'admin' || req.user.user_type === 'staff')) {
            next(); // User is an admin or staff, proceed
        } else {
            res.status(403); // Forbidden
            throw new Error('Not authorized as an admin or staff');
        }
    });

    return { protect, admin };
};
