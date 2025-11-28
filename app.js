const express = require('express');
const cors = require('cors');
require('dotenv').config();
const formRoutes = require('./routes/formRoutes');
const workspaceFormRoutes = require('./routes/workspaceFormRoutes');
const stripeRoutes = require('./routes/stripeRoutes');
const emailRoutes = require('./routes/emailRoutes');
const autopayRoutes = require('./routes/autopayRoutes');
const productCheckoutRoutes = require('./routes/productCheckoutRoutes');
const productAutopayRoutes = require('./routes/productAutopayRoutes');
const airtableWebhookRoutes = require('./routes/airtableWebhookRoutes');
const subscriptionCheckoutRoutes = require('./routes/subscriptionCheckoutRoutes');
const clickTrackingRoutes = require('./routes/clickTrackingRoutes');

const app = express();


// Stripe webhook endpoint must be before express.json() middleware
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());

// Debug middleware to log CORS-related requests
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - Origin: ${req.headers.origin || 'No origin'}`);
  console.log('Headers:', req.headers);
  next();
});

// const allowedOrigins = ["https://www.biaw.com", "https://biaw.com"];

// CORS configuration - Allow all origins for development
const corsOptions = {
  origin: true, // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With', 
    'Accept', 
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers'
  ],
  exposedHeaders: ['Content-Length', 'X-Requested-With'],
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Alternative restrictive CORS for production (uncomment when needed)
// const corsOptions = {
//   origin: function (origin, callback) {
//     console.log('CORS check for origin:', origin);
//     // Allow requests with no origin (like from Postman or mobile apps)
//     if (!origin || allowedOrigins.includes(origin)) {
//       console.log('CORS allowed for origin:', origin);
//       callback(null, true);
//     } else {
//       console.log('CORS blocked origin:', origin);
//       callback(new Error('Not allowed by CORS'));
//     }
//   },
//   credentials: true,
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
//   allowedHeaders: [
//     'Content-Type', 
//     'Authorization', 
//     'X-Requested-With', 
//     'Accept', 
//     'Origin',
//     'Access-Control-Request-Method',
//     'Access-Control-Request-Headers'
//   ],
//   exposedHeaders: ['Content-Length', 'X-Requested-With'],
//   preflightContinue: false,
//   optionsSuccessStatus: 204
// };

app.use(cors(corsOptions));

// Handle preflight requests for all routes
app.options('*', cors(corsOptions));

// Test endpoint to verify CORS
app.get('/api/test-cors', (req, res) => {
  res.json({ 
    message: 'CORS is working!', 
    origin: req.headers.origin,
    timestamp: new Date().toISOString()
  });
});

app.get("/", (req, res) => {
  res.send("Server is running and ready to accept requests.");
});

app.use('/api', formRoutes);
app.use('/api/workspace', workspaceFormRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/email', emailRoutes);
app.use('/api', autopayRoutes);
app.use('/api/subscription', subscriptionCheckoutRoutes);

// builder subscription
app.use('/api/product', productCheckoutRoutes);
app.use('/api/product-autopay', productAutopayRoutes);
// board meeting
app.use('/api/airtable', airtableWebhookRoutes);

// click tracking
app.use('/api', clickTrackingRoutes);

module.exports = app;
