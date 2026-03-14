// Basic error handling middleware
const errorHandler = (err, req, res, next) => {
    console.error(err.stack);

    // If the route didn't set an error status code, Express will still have 200 by default.
    // In that case, return 500 so clients can reliably treat it as an error.
    const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;

    res.status(statusCode);

    res.json({
        message: err.message,
        // Provide stack trace only in development environment
        stack: process.env.NODE_ENV === 'production' ? '🥞' : err.stack,
    });
};

module.exports = { errorHandler };
