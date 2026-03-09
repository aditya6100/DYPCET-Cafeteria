require('dotenv').config();
const nodemailer = require('nodemailer');

async function testEmail() {
    console.log("--- SMTP TEST START ---");
    console.log("Host:", process.env.SMTP_HOST);
    console.log("Port:", process.env.SMTP_PORT);
    console.log("User:", process.env.SMTP_USER);

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        },
        // Helpful for debugging Gmail
        debug: true,
        logger: true
    });

    try {
        console.log("Verifying connection...");
        await transporter.verify();
        console.log("Connection verified successfully!");

        console.log("Sending test mail...");
        const info = await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: "adityabhanudas610@gmail.com",
            subject: "SMTP TEST - DYPCET Cafeteria",
            text: "This is a test email from your cafeteria management system. If you receive this, SMTP is working!",
            html: "<b>SMTP is working!</b><p>This is a test email from your cafeteria management system.</p>"
        });

        console.log("Message sent: %s", info.messageId);
        console.log("--- SMTP TEST SUCCESS ---");
    } catch (error) {
        console.error("--- SMTP TEST FAILED ---");
        console.error(error);
    }
}

testEmail();
