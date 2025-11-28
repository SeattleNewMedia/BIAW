const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { base2 } = require('../config/airtable');
const { createWebflowItem } = require('./webflowController');
const AIRTABLE_TABLE_NAMES3 = process.env.AIRTABLE_TABLE_NAMES3 || 'YourTableName';
const axios = require('axios');

// Create subscription checkout session
const createSubscriptionCheckout = async (req, res) => {
  console.log('Received request body:', req.body);

  try {
    const { memberId } = req.body;

    if (!memberId) {
      console.log('No memberId provided in request');
      return res.status(400).json({
        message: "Member ID is required"
      });
    }

    console.log('Creating checkout session for memberId:', memberId);

    // Replace with your actual subscription price ID from Stripe
    const SUBSCRIPTION_PRICE_ID = 'price_1RRLRFIONk3QNZzYGe31hIEh';
    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price: SUBSCRIPTION_PRICE_ID,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      allow_promotion_codes: false,
      success_url: 'https://www.biaw.com/payment-successful',
      cancel_url: 'https://www.biaw.com/contract-subscription-service',
      client_reference_id: memberId,
      metadata: {
        memberId: memberId,
        code:"Renewapplication"
      },
    });

    console.log('Checkout session created:', session.id);

    res.status(200).json({
      sessionId: session.id,
      url: session.url
    });

  } catch (error) {
    console.error('Error creating subscription checkout session:', error);
    res.status(500).json({
      message: "Failed to create subscription checkout session",
      error: error.message
    });
  }
};

const handleRenewalSubscription = async (session) => {
  try {
    const clientReferenceId = session.client_reference_id;
    const today = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'
    const twoYearsLater = new Date();
    twoYearsLater.setFullYear(twoYearsLater.getFullYear() + 2);
    const endDate = twoYearsLater.toISOString().split('T')[0]; // 'YYYY-MM-DD'

    // Get subscription details from Stripe
    const subscription = await stripe.subscriptions.retrieve(session.subscription);
    const subscriptionId = subscription.id;
    
    // Get the total amount paid from the session
    const totalAmountPaid = (session.amount_total / 100).toFixed(2) + '$'; // Convert from cents to dollars

    // Update Airtable record
    const records = await base2(AIRTABLE_TABLE_NAMES3)
      .select({
        filterByFormula: `{Member ID} = '${clientReferenceId}'`,
        maxRecords: 1,
      })
      .firstPage();

    if (records.length > 0) {
      const recordId = records[0].id;
      await base2(AIRTABLE_TABLE_NAMES3).update(recordId, {
        "Subscription ID": subscriptionId,
        "Subscription Start Date": today,
        "Subscription End Date": endDate,
        "Auto Payment status": "Active",
        "Total Amount Paid": totalAmountPaid,
        "Payment Status":"Paid"
      });
      console.log(`Airtable record updated for Member ID: ${clientReferenceId}`);
    } else {
      console.warn(`No Airtable record found for Member ID: ${clientReferenceId}`);
      return false;
    }

    // Update Webflow record
    try {
      const webflowItems = await axios.get(
        `https://api.webflow.com/v2/collections/${process.env.WEBFLOW_COLLECTION_ID}/items`,
        {
          headers: {
            Authorization: `Bearer ${process.env.WEBFLOW_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const matchingItem = webflowItems.data.items.find(
        item => item.fieldData["member-id"] === clientReferenceId
      );

      if (matchingItem) {
        await axios.patch(
          `https://api.webflow.com/v2/collections/${process.env.WEBFLOW_COLLECTION_ID}/items/${matchingItem.id}`,
          {
            fieldData: {
              "start-date": today,
              "end-date": endDate,
              "auto-deduction-status": "Active",
              "total-amount": totalAmountPaid
            }
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.WEBFLOW_API_KEY}`,
              'Content-Type': 'application/json',
            },
          }
        );
        console.log('Successfully updated Webflow item status to Active');

        // Then publish the item to live using the correct publish endpoint
        const publishResponse = await axios.post(
          `https://api.webflow.com/v2/collections/${process.env.WEBFLOW_COLLECTION_ID}/items/publish`,
          {
            itemIds: [matchingItem.id]
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.WEBFLOW_API_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );

        console.log('Webflow item published to live:', JSON.stringify(publishResponse.data, null, 2));
      } else {
        console.warn('No matching Webflow item found for renewal');
      }
    } catch (webflowError) {
      console.error('Error updating Webflow item:', webflowError);
      return false;
    }

    // Send personalized email to the customer after Webflow update
    try {
      const sendEmail = require('../utils/emailService'); // Adjust path if needed
      const customerName = session.customer_details?.name || '';
      const recipientEmail = session.customer_details?.email;
      const subject = "Builder Application Renewal Approved";
      const message = `\nDear ${customerName},\n\nCongratulations! We are pleased to inform you that your Builder Certification has been successfully renewed.\n\nThank you for your continued dedication and efforts.\n\nIf you have any questions or need further assistance, feel free to contact us.\n\nBest regards,  \nBIAW Support Team\n`;
      await sendEmail(recipientEmail, subject, message);
      console.log(`Renewal email sent to ${recipientEmail}`);
    } catch (emailErr) {
      console.error('Error sending renewal email:', emailErr);
    }

    return true;
  } catch (error) {
    console.error('Error handling renewal subscription:', error);
    return false;
  }
};

module.exports = {
  createSubscriptionCheckout,
  handleRenewalSubscription
}; 