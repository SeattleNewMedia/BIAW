# Deployment Guide for Render

## Environment Variables Required

Make sure to set these environment variables in your Render dashboard:

### Required Variables:
- `AIRTABLE_API_KEY` - Your Airtable API key
- `AIRTABLE_BASE_ID` - Your Airtable base ID
- `WEBFLOW_API_KEY` - Your Webflow API key
- `WEBFLOW_COLLECTION_ID` - Your Webflow collection ID
- `STRIPE_SECRET_KEY` - Your Stripe secret key

### Optional Variables:
- `NODE_ENV` - Set to "production" for production deployment
- `PORT` - Render will set this automatically

## Render Configuration

1. **Build Command**: `npm install`
2. **Start Command**: `npm start`
3. **Node Version**: 18.x or higher

## Troubleshooting 502 Errors

### 1. Check Environment Variables
Make sure all required environment variables are set in your Render dashboard.

### 2. Check Logs
View your application logs in the Render dashboard to see specific error messages.

### 3. Health Check
Once deployed, test the health endpoint:
```
GET https://your-app-name.onrender.com/health
```

### 4. Common Issues

#### Missing Environment Variables
If you see errors about missing environment variables, add them to your Render environment settings.

#### Port Issues
Render automatically sets the PORT environment variable. Make sure your app uses `process.env.PORT`.

#### Memory Issues
If your app crashes due to memory, consider upgrading your Render plan.

## Local Testing

Before deploying, test locally:

1. Create a `.env` file with all required variables
2. Run `npm install`
3. Run `npm start`
4. Test the health endpoint: `http://localhost:5000/health`

## Webhook URLs

After deployment, update your webhook URLs to point to your Render app:

- Airtable Webhooks: `https://your-app-name.onrender.com/webhook/airtable-class`
- Stripe Webhooks: `https://your-app-name.onrender.com/webhook/stripe`

## Monitoring

- Use the `/health` endpoint to monitor your app
- Check Render logs for any errors
- Monitor your webhook endpoints for proper functionality 