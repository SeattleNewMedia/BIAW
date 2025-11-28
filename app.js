// Entry point for the new MVC app
const express = require('express');
const cors = require('cors');
const app = express();
const memberRoutes = require('./routes/memberRoutes');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Use member routes
app.use(memberRoutes);

module.exports = app; 