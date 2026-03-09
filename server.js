const express = require('express');
const path = require('path');
const config = require('./config');
const db = require('./config/db')(config);
const apiRouter = require('./routes')(config, db);
const { errorHandler } = require('./middleware/error');

const app = express();

// --- Middleware ---

// Body parser for JSON requests
app.use(express.json({ limit: '10mb' })); // Increased limit for image uploads
app.use(express.urlencoded({ extended: true }));


// Serve static files (frontend) from the React build folder
app.use(express.static(path.join(__dirname, 'frontend', 'build')));

// --- API Routes ---
// All API endpoints will be prefixed with /api
app.use('/api', apiRouter);


// --- Frontend Catch-all ---
// This route handles any requests that don't match the API or static files.
// It sends the main index.html from the React build, allowing for client-side routing.
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'build', 'index.html'));
});


// --- Global Error Handler ---
// This must be the last middleware.
app.use(errorHandler);


// --- Server ---
app.listen(config.port, () => {
    console.log(`Server running on http://localhost:${config.port}`);
});
