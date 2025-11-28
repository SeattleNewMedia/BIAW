const express = require('express');
const router = express.Router();
const workspaceFormController = require('../controllers/workspaceFormController');

// Test route to verify the router is working
router.get('/test', (req, res) => {
  res.json({ message: 'Workspace form routes are working!' });
});

router.post('/submit-workspace-form', workspaceFormController.submitWorkspaceForm);

module.exports = router; 