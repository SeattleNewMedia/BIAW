require('dotenv').config();
const express = require('express');
const cors = require('cors');
const syncRoutes = require('./routes/syncRoutes');
const awardsClassSyncRoutes = require('./routes/awardsClassSyncRoutes');

const app = express();
const port = process.env.PORT || 10000;

// Middleware
app.use(cors());

const allowedOrigins = ["https://biaw-stage-api.webflow.io"];
app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(express.json());

// Root route
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Awards API is running',
        endpoints: {
            health: '/api/sync/health',
            webhook: '/api/sync/webhook',
            status: '/api/sync/status'
        }
    });
});

// Routes
app.use('/api/sync', syncRoutes);
app.use('/api/class-sync', awardsClassSyncRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ success: false, error: err.message });
});

// Start server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
}); 