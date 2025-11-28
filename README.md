# Class Registration System - MVC Architecture

A comprehensive class registration and management system built with Node.js, Express, and MVC architecture. This system integrates Airtable (database), Stripe (payments), Webflow (CMS), and automated email notifications.

## 🏗️ Architecture Overview

This application follows the **Model-View-Controller (MVC)** pattern with clear separation of concerns:

```
├── app.js                 # Main application entry point
├── config/               # Configuration files
│   ├── database.js       # Airtable configuration
│   ├── webflow.js        # Webflow API configuration
│   ├── stripe.js         # Stripe configuration
│   └── email.js          # Email configuration
├── models/               # Data models (Airtable interactions)
│   ├── Class.js          # Class-related operations
│   ├── Payment.js        # Payment-related operations
│   ├── Member.js         # Member validation
│   └── Waitlist.js       # Waitlist operations
├── services/             # Business logic services
│   ├── stripeService.js  # Stripe operations
│   ├── webflowService.js # Webflow CMS operations
│   ├── emailService.js   # Email operations
│   ├── schedulerService.js # Automated tasks
│   ├── categorySyncService.js # Category synchronization
│   └── purchaseRecordSyncService.js # Purchase record sync
├── controllers/          # Request handlers
│   ├── webhookController.js    # Stripe webhook handling
│   ├── airtableWebhookController.js # Airtable webhook handling
│   ├── classController.js      # Class registration
│   ├── waitlistController.js   # Waitlist management
│   ├── paymentController.js    # Payment operations
│   └── adminController.js      # Admin operations
├── middleware/           # Express middleware
│   └── errorHandler.js   # Global error handling
├── routes/               # Route definitions
│   ├── index.js          # Main routes
│   └── adminRoutes.js    # Admin routes
└── utils/                # Utility functions
    └── helpers.js        # Common helper functions
```

## 🚀 Features

### Core Functionality
- **Class Registration**: Paid and free (ROII) class registrations
- **Payment Processing**: Stripe integration with webhook handling
- **Waitlist Management**: Automated waitlist notifications
- **Email Notifications**: Comprehensive email system for confirmations and reminders
- **Seat Management**: Real-time seat synchronization between Airtable and Webflow
- **Automated Publishing**: Automatic class publishing from Airtable to Webflow
- **Webhook Integration**: Real-time updates via Airtable webhooks

### Automated Processes
- **Class Publishing**: Real-time via Airtable webhooks
- **Seat Synchronization**: Real-time via webhooks
- **Waitlist Notifications**: Every 50 seconds (when enabled)
- **Purchase Record Sync**: Every 30 seconds (when enabled)
- **Category Sync**: Real-time via Airtable automation webhooks

### Recent Improvements
- ✅ **Webflow Staging → Live Workflow**: All Webflow operations now use proper staging → live workflow
- ✅ **Unique Slugs**: Member and Non-Member entries now have different slugs with unique identifiers
- ✅ **Enhanced Error Handling**: Comprehensive error handling and validation
- ✅ **Environment Variable Validation**: App validates required environment variables on startup
- ✅ **Health Check Endpoint**: `/health` endpoint for monitoring
- ✅ **Improved Webhook Processing**: Better field mapping and null safety
- ✅ **Professional Email Templates**: Updated all email templates with professional BIAW branding
- ✅ **Enhanced Waitlist Notifications**: Improved waitlist email content with direct class links
- ✅ **Certification Email System**: Professional certification emails with PDF attachments
- ✅ **Admin Notifications**: Detailed admin notifications for waitlist entries
- ✅ **Payment Reminders**: Updated payment reminder emails with better messaging
- ✅ **Cancellation Confirmations**: Enhanced cancellation emails with refund information

## 📋 Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Environment variables configured

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd class-module
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file with the following variables:
   ```env
   # Airtable Configuration
   AIRTABLE_API_KEY=your_airtable_api_key
   AIRTABLE_BASE_ID=your_airtable_base_id
   AIRTABLE_TABLE_NAME=your_table_name
   AIRTABLE_TABLE_NAME2=your_table_name2
   AIRTABLE_TABLE_NAME3=your_table_name3
   AIRTABLE_TABLE_NAME4=your_table_name4
   AIRTABLE_TABLE_NAME5=your_table_name5

   # Stripe Configuration
   STRIPE_API_KEY=your_stripe_secret_key
   STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret

   # Webflow Configuration
   WEBFLOW_API_KEY=your_webflow_api_key
   WEBFLOW_COLLECTION_ID=your_collection_id
   WEBFLOW_COLLECTION_ID2=your_collection_id2
   WEBFLOW_COLLECTION_ID3=your_collection_id3

   # Email Configuration
   EMAIL_USER=your_email@gmail.com
   EMAIL_PASSWORD=your_email_app_password

   # Server Configuration
   PORT=4000
   NODE_ENV=development
   ```

4. **Start the application**
   ```bash
   # Production
   npm start

   # Development (with auto-reload)
   npm run dev
   ```

## 🚀 Deployment

### Render Deployment
The application is configured for deployment on Render:

1. **Environment Variables**: Set all required environment variables in Render dashboard
2. **Build Command**: `npm install`
3. **Start Command**: `npm start`
4. **Node Version**: 18.x or higher

### Health Check
After deployment, test the health endpoint:
```
GET https://your-app-name.onrender.com/health
```

## 🛣️ API Endpoints

### Health & Monitoring
- `GET /health` - Health check endpoint

### Webhooks
- `POST /webhook` - Stripe webhook handler
- `POST /webhook/airtable-class` - Airtable class webhook handler

### Class Registration
- `POST /submit-class` - Submit paid class registration
- `POST /register-class` - Register for free (ROII) class

### Waitlist
- `POST /waitlist` - Add to class waitlist

### Payments
- `POST /cancel-payment` - Cancel payment and process refund
- `POST /api/mail` - Send payment reminder

### Airtable Webhooks
- `POST /api/endpoint` - Handle class updates
- `POST /api/delete` - Handle class deletions
- `POST /api/special` - Handle special class operations
- `POST /api/category-sync` - Handle category synchronization

### Admin Operations
- `POST /admin/update-seats` - Update class seats (admin only)

### Certification System
- `POST /api/certification` - Generate certification certificates and cards
- `POST /api/send-certificate-email` - Send certification emails with PDF attachments

## 🔄 Automated Workflows

### Class Publishing Workflow (Webhook-Based)
1. **Webhook Trigger**: Airtable sends webhook when class status changes to "Publish"
2. **Create Products**: Creates Stripe products for Member/Non-Member pricing
3. **Generate Coupons**: Creates discount coupons if specified
4. **Publish to Webflow**: Adds class to Webflow CMS with both Member/Non-Member variants
5. **Update Airtable**: Marks class as "Published" with Stripe and Webflow IDs
6. **Slug Storage**: Stores non-member slug in Airtable for direct linking

### Payment Processing Workflow
1. **Registration**: User registers for class (creates pending payment record)
2. **Checkout**: Stripe checkout session created
3. **Payment**: User completes payment
4. **Webhook**: Stripe webhook processes successful payment
5. **Update Records**: Updates payment status and class seats
6. **Email**: Sends confirmation email

### Waitlist Workflow
1. **Monitor**: System checks waitlist for available seats
2. **Notify**: Sends email notification to waitlisted users
3. **Mark Notified**: Updates waitlist record status

### Email Notification System
The system includes comprehensive email notifications with professional BIAW branding:

#### **Registration Confirmations**
- Class registration confirmations with detailed class information
- Payment confirmations with receipt details
- Free (ROII) class confirmations

#### **Waitlist Management**
- **User Notifications**: Professional waitlist entry confirmations
- **Admin Notifications**: Detailed waitlist entry alerts with user and class details
- **Seat Availability**: Enhanced notifications when seats become available

#### **Payment & Cancellation**
- **Payment Reminders**: Professional reminders for incomplete payments
- **Cancellation Confirmations**: Detailed cancellation confirmations with refund information
- **Refund Confirmations**: Clear refund processing notifications

#### **Certification System**
- **Certification Emails**: Professional BIAW certification emails with PDF attachments
- **Certificate Generation**: Automatic PDF certificate and card generation
- **Email Templates**: Professional HTML templates with dynamic data replacement

#### **Admin Communications**
- **Booking Confirmations**: Admin booking confirmations for manual registrations
- **System Notifications**: Detailed system alerts for administrative actions

## 🏛️ MVC Architecture Benefits

### **Separation of Concerns**
- **Models**: Handle data operations and business logic
- **Views**: API responses (JSON)
- **Controllers**: Handle HTTP requests and responses
- **Services**: Business logic and external integrations

### **Maintainability**
- Clear file organization
- Reusable components
- Easy to test individual components
- Centralized error handling

### **Scalability**
- Modular design allows easy feature additions
- Service layer can be easily extended
- Configuration centralized for easy management

## 🔧 Configuration

### Email System Configuration
The email system uses professional HTML templates with dynamic data replacement:

#### **Template Features**
- **Professional Design**: Clean, modern email templates with BIAW branding
- **Dynamic Content**: All personal information is dynamically inserted
- **Responsive Design**: Works on desktop and mobile devices
- **HTML Format**: Rich formatting with links, styling, and professional layout
- **Error Handling**: Comprehensive error handling for email delivery

#### **Email Types**
- **Registration Confirmations**: Detailed class and payment confirmations
- **Waitlist Notifications**: Professional waitlist entry and availability alerts
- **Payment Reminders**: Clear payment completion reminders
- **Cancellation Confirmations**: Detailed cancellation and refund confirmations
- **Certification Emails**: Professional certification emails with PDF attachments
- **Admin Notifications**: Detailed system alerts for administrative actions

### Database (Airtable)
The system uses Airtable as the primary database with the following tables:
- **Biaw Classes**: Main class information
- **Payment Records**: Payment tracking
- **Multiple Class Registration**: Individual seat records
- **Members**: Member validation
- **Joint waitlist**: Waitlist management
- **Category**: Class categories

### External Services
- **Stripe**: Payment processing and product management
- **Webflow**: CMS for class display (with staging → live workflow)
- **Gmail**: Email notifications via Nodemailer

## 🚨 Error Handling

The application includes comprehensive error handling:
- **Global Error Handler**: Catches all unhandled errors
- **Service-level Error Handling**: Each service handles its own errors
- **Controller Error Handling**: Controllers handle request-specific errors
- **Environment Validation**: Validates required environment variables on startup
- **Logging**: All errors are logged for debugging

## 🔍 Monitoring

The application includes:
- **Console Logging**: Detailed logs for all operations
- **Error Tracking**: Comprehensive error logging
- **Performance Monitoring**: Task execution timing
- **Health Check**: `/health` endpoint for monitoring
- **Webhook Processing**: Real-time monitoring of webhook events

## 🧪 Testing

To add tests to this MVC structure:
1. Create a `tests/` directory
2. Add unit tests for models and services
3. Add integration tests for controllers
4. Add end-to-end tests for complete workflows

## 📈 Performance Considerations

- **Caching**: Implement caching for frequently accessed data
- **Database Optimization**: Use Airtable's filtering and pagination
- **Rate Limiting**: Implement rate limiting for external APIs
- **Connection Pooling**: Optimize database connections
- **Webflow Workflow**: Proper staging → live workflow prevents content conflicts

## 🔐 Security

- **Environment Variables**: Sensitive data stored in environment variables
- **Input Validation**: All inputs are validated
- **Error Sanitization**: Errors don't expose sensitive information
- **Webhook Verification**: Stripe webhook signatures are verified
- **Field Validation**: Webhook handlers validate required fields

## 📝 Contributing

1. Follow the MVC architecture pattern
2. Add proper error handling
3. Include logging for debugging
4. Update documentation
5. Test thoroughly
6. Use proper Webflow staging → live workflow
7. Maintain professional email templates with BIAW branding
8. Ensure all email templates are responsive and accessible
9. Test email delivery across different email clients

## 📄 License

This project is licensed under the ISC License. 