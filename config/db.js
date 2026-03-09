const mysql = require('mysql');
const util = require('util');

let poolInstance = null;

module.exports = (config) => {
    if (poolInstance) {
        return poolInstance;
    }

    // Create a connection pool instead of a single connection for better performance and management
    const pool = mysql.createPool({
        connectionLimit: 10, // Max number of connections in pool
        host: config.db.host,
        user: config.db.user,
        password: config.db.password,
        database: config.db.name
    });

    // Promisify the pool query to use async/await
    pool.query = util.promisify(pool.query).bind(pool);

    // Test the connection
    pool.getConnection((err, connection) => {
        if (err) {
            if (err.code === 'PROTOCOL_CONNECTION_LOST') {
                console.error('Database connection was closed.');
            }
            if (err.code === 'ER_CON_COUNT_ERROR') {
                console.error('Database has too many connections.');
            }
            if (err.code === 'ECONNREFUSED') {
                console.error('Database connection was refused.');
            }
        }
        if (connection) {
            console.log('Successfully connected to the MySQL database pool.');
            connection.release(); // Release the connection back to the pool
        }
    });

    poolInstance = pool;
    return poolInstance;
};
