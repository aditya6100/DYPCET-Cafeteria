const express = require('express');

module.exports = (config, db) => {
    const router = express.Router();
    const auth = require('../middleware/auth')(config, db);

    const authRoutes = require('./auth')(config, db);
    const menuRoutes = require('./menu')(config, db, auth);
    const orderRoutes = require('./orders')(config, db, auth);
    const userRoutes = require('./users')(config, db, auth);
    const feedbackRoutes = require('./feedback')(config, db, auth);
    const noticeRoutes = require('./notices')(config, db, auth);
    const committeeRoutes = require('./committee')(config, db, auth);
    const analyticsRoutes = require('./analytics')(config, db, auth);

    // Mount the individual routers
    router.use('/auth', authRoutes);
    router.use('/menu', menuRoutes);
    router.use('/orders', orderRoutes);
    router.use('/users', userRoutes);
    router.use('/feedback', feedbackRoutes);
    router.use('/notices', noticeRoutes);
    router.use('/committee', committeeRoutes);
    router.use('/analytics', analyticsRoutes);

    return router;
};
