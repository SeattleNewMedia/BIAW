const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');
const Airtable = require('airtable');
const AIRTABLE_API_KEYS2 = process.env.AIRTABLE_API_KEYS2;
const AIRTABLE_BASE_ID2 = process.env.AIRTABLE_BASE_ID2;
const base3 = new Airtable({ apiKey: AIRTABLE_API_KEYS2 }).base(AIRTABLE_BASE_ID2);
const AIRTABLE_TABLE_NAMES4 = process.env.AIRTABLE_TABLE_NAMES4 || 'Builder Subscription';

// Create renewal subscription checkout session
const createRenewalCheckout = async (req, res) => {
  console.log('Received request body:', req.body);

  try {
    const { memberId } = req.body;

    if (!memberId) {
      console.log('No memberId provided in request');
      return res.status(400).json({
        message: "Member ID is required"
      });
    }

    console.log('Creating renewal checkout session for memberId:', memberId);
//  price_1QfT38IONk3QNZzYp7CbI3Bh
    // Replace with your actual renewal subscription price ID from Stripe
    const RENEWAL_SUBSCRIPTION_PRICE_ID = 'price_1QfT38IONk3QNZzYp7CbI3Bh';

    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price: RENEWAL_SUBSCRIPTION_PRICE_ID,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      allow_promotion_codes: false,
      success_url: 'https://www.biaw.com/payment-successful',
      cancel_url: 'https://www.biaw.com/user-profile',
      client_reference_id: memberId,
      metadata: {
        memberId: memberId,
        code:"RenewSubscription"
      },
    });

    console.log('Renewal checkout session created:', session.id);

    res.status(200).json({
      sessionId: session.id,
      url: session.url
    });

  } catch (error) {
    console.error('Error creating renewal subscription checkout session:', error);
    res.status(500).json({
      message: "Failed to create renewal subscription checkout session",
      error: error.message
    });
  }
};

// Handle new renewal subscription (for price_1RbJYqE1AF8nzqTawmOYyLLo)
const handleNewRenewalSubscription = async (session) => {
  try {
    const clientReferenceId = session.client_reference_id;
    const today = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'
    const twoYearsLater = new Date();
    twoYearsLater.setFullYear(twoYearsLater.getFullYear() + 2);
    const endDate = twoYearsLater.toISOString().split('T')[0]; // 'YYYY-MM-DD'

    // Get subscription details from Stripe
    const subscription = await stripe.subscriptions.retrieve(session.subscription);
    const subscriptionId = subscription.id;

    // Get the total amount paid from the session and format as string with dollar sign
    const totalAmountPaid = session.amount_total / 100;

    // Update Airtable record
    const records = await base3(AIRTABLE_TABLE_NAMES4)
      .select({
        filterByFormula: `{Member} = '${clientReferenceId}'`,
        maxRecords: 1,
      })
      .firstPage();

    if (records.length > 0) {
      const recordId = records[0].id;
      await base3(AIRTABLE_TABLE_NAMES4).update(recordId, {
        "Subscription ID": subscriptionId,
        "Start date": today,
        "End date": endDate,
        "Subscription autopayment status": "Active",
        "Total Amount": totalAmountPaid
      });
      console.log(`Airtable record updated for Member ID: ${clientReferenceId}`);
    } else {
      console.warn(`No Airtable record found for Member ID: ${clientReferenceId}`);
      return false;
    }

    // Update Webflow record
    try {
      const webflowItems = await axios.get(
        `https://api.webflow.com/v2/collections/${process.env.WEBFLOW_COLLECTION_ID1}/items`,
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
          `https://api.webflow.com/v2/collections/${process.env.WEBFLOW_COLLECTION_ID1}/items/${matchingItem.id}`,
          {
            fieldData: {
              "subscription-starting-date": today,
              "subscription-end-date": endDate,
              "subscription-status": "Active",
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
          `https://api.webflow.com/v2/collections/${process.env.WEBFLOW_COLLECTION_ID1}/items/publish`,
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
    console.error('Error handling new renewal subscription:', error);
    return false;
  }
};

module.exports = {
  createRenewalCheckout,
  handleNewRenewalSubscription
}; 