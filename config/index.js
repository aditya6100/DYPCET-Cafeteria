require('dotenv').config();

const config = {
    port: process.env.PORT || 3000,
    db: {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        name: process.env.DB_NAME
    },
    razorpay: {
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET
    },
    phonepe: {
        enabled: String(process.env.PHONEPE_ENABLED || 'false').toLowerCase() === 'true',
        client_id: process.env.PHONEPE_CLIENT_ID || '',
        client_secret: process.env.PHONEPE_CLIENT_SECRET || '',
        client_version: process.env.PHONEPE_CLIENT_VERSION || '',
        auth_url: process.env.PHONEPE_AUTH_URL || 'https://api-preprod.phonepe.com/apis/identity-manager/v1/oauth/token',
        base_url: process.env.PHONEPE_BASE_URL || 'https://api-preprod.phonepe.com/apis/pg-sandbox',
        pay_endpoint: process.env.PHONEPE_PAY_ENDPOINT || '/checkout/v2/pay',
        status_endpoint_template: process.env.PHONEPE_STATUS_ENDPOINT_TEMPLATE || '/checkout/v2/order/{merchantOrderId}/status',
        redirect_url: process.env.PHONEPE_REDIRECT_URL || 'http://localhost:3000/payment/phonepe/callback'
    },
    jwt: {
        secret: process.env.JWT_SECRET
    }
};

module.exports = config;
