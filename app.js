const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const routes = require('./routes');
const { errorHandler } = require('./middleware/errorHandler');
const { initializeScheduledTasks } = require('./services/schedulerService');

const app = express();

// Middleware for webhook routes - use raw body parsing
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use('/webhook/airtable-class', express.raw({ type: 'application/json' }));

// Only use express.json() for non-webhook routes
app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/webhook')) return next();
  express.json()(req, res, next);
});

// CORS configuration
// const allowedOrigins = [
//   "https://biaw-stage-api.webflow.io",
// ];
// app.use(
//   cors({
//     origin: allowedOrigins,
//     methods: ["GET", "POST", "OPTIONS"],
//     allowedHeaders: ["Content-Type", "Authorization"],
//     credentials: true,
//   })
// );

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

app.use(cors(corsOptions));

// Routes
app.use('/', routes);

// Error handling middleware
app.use(errorHandler);

// Initialize scheduled tasks
initializeScheduledTasks();

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

module.exports = app; 