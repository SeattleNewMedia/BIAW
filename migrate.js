#!/usr/bin/env node

/**
 * Migration Script: Monolithic to MVC Architecture
 * 
 * This script helps migrate from the old monolithic index.js to the new MVC structure.
 * It provides guidance and checks for the migration process.
 */

const fs = require('fs');
const path = require('path');

console.log('🚀 Class Registration System - MVC Migration Helper\n');

// Check if old index.js exists
const oldIndexPath = path.join(__dirname, 'index.js');
const newAppPath = path.join(__dirname, 'app.js');

if (fs.existsSync(oldIndexPath)) {
  console.log('✅ Found old index.js file');
  
  // Check if new app.js exists
  if (fs.existsSync(newAppPath)) {
    console.log('✅ Found new app.js file');
    console.log('\n📋 Migration Status:');
    console.log('   - New MVC structure is ready');
    console.log('   - Old index.js is preserved for reference');
    console.log('   - You can now use the new structure');
    
    console.log('\n🔄 Next Steps:');
    console.log('   1. Update your environment variables if needed');
    console.log('   2. Test the new application: npm start');
    console.log('   3. Verify all endpoints work correctly');
    console.log('   4. Once confirmed, you can remove the old index.js');
    
  } else {
    console.log('❌ New app.js not found');
    console.log('   Please ensure the MVC structure is properly created');
  }
} else {
  console.log('❌ Old index.js not found');
  console.log('   Migration may not be needed or files are missing');
}

// Check directory structure
console.log('\n📁 Checking MVC Directory Structure:');

const directories = [
  'config',
  'models', 
  'services',
  'controllers',
  'middleware',
  'routes',
  'utils'
];

directories.forEach(dir => {
  const dirPath = path.join(__dirname, dir);
  if (fs.existsSync(dirPath)) {
    console.log(`   ✅ ${dir}/`);
  } else {
    console.log(`   ❌ ${dir}/ (missing)`);
  }
});

// Check key files
console.log('\n📄 Checking Key Files:');

const keyFiles = [
  'app.js',
  'config/database.js',
  'config/stripe.js',
  'config/webflow.js',
  'config/email.js',
  'models/Class.js',
  'models/Payment.js',
  'models/Member.js',
  'models/Waitlist.js',
  'services/stripeService.js',
  'services/webflowService.js',
  'services/emailService.js',
  'services/schedulerService.js',
  'controllers/webhookController.js',
  'controllers/classController.js',
  'controllers/waitlistController.js',
  'controllers/paymentController.js',
  'middleware/errorHandler.js',
  'routes/index.js',
  'utils/helpers.js',
  'README.md'
];

keyFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    console.log(`   ✅ ${file}`);
  } else {
    console.log(`   ❌ ${file} (missing)`);
  }
});

console.log('\n🎯 Migration Summary:');
console.log('   The new MVC architecture provides:');
console.log('   - Better code organization');
console.log('   - Separation of concerns');
console.log('   - Improved maintainability');
console.log('   - Easier testing');
console.log('   - Better error handling');
console.log('   - Centralized configuration');

console.log('\n📚 For more information, see README.md');
console.log('🔧 To start the application: npm start');
console.log('👨‍💻 For development: npm run dev'); 