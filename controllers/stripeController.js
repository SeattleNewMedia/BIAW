require('dotenv').config();

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set in environment variables');
}

if (!process.env.WEBFLOW_API_KEY || !process.env.WEBFLOW_COLLECTION_ID) {
  throw new Error('WEBFLOW_API_KEY and WEBFLOW_COLLECTION_ID must be set in environment variables');
}

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
  throw new Error('EMAIL_USER and EMAIL_PASSWORD must be set in environment variables');
}

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { base2 } = require('../config/airtable');
const { createWebflowItem } = require('./webflowController');
const sendEmail = require('../utils/emailService');
const { handleRenewalSubscription } = require('./RenewSubscriptionController');
const { handleNewRenewalSubscription } = require('./NewRenewSubscriptionController');
const { handleDonation } = require('./donationController');
const AIRTABLE_TABLE_NAMES = process.env.AIRTABLE_TABLE_NAMES || 'YourTableName';
const AIRTABLE_TABLE_NAMES3 = process.env.AIRTABLE_TABLE_NAMES3 || 'YourTableName3';
const { updateAirtableWithCheckout } = require('./productCheckoutController');
const axios = require('axios');

// Create checkout session with member ID (subscription for 2 years)
const createCheckoutSession = async (req, res) => {
  try {
    const { memberId, isMember } = req.body;

    // price_1R4VxHIONk3QNZzY6sfWnRVX
    // price_1R4VuYIONk3QNZzYi5LsltBc
    // Define price IDs
    const oneTimePriceId = isMember ? 'price_1QfTqtIONk3QNZzY3ZrLSvd0' : 'price_1R4VxHIONk3QNZzY6sfWnRVX';
    const recurringPriceId = 'price_1R4VuYIONk3QNZzYi5LsltBc';

    // const oneTimePriceId = isMember ? 'price_1Rc9JGIONk3QNZzYATx6BKYW' : 'price_1Rc9JGIONk3QNZzYATx6BKYW';
    // const recurringPriceId = 'price_1Rc9BdIONk3QNZzYdmhk9E1j';

    const sessionConfig = {
      payment_method_types: ['card'],
      line_items: [
        {
          price: oneTimePriceId,
          quantity: 1,
        },
        {
          price: recurringPriceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: 'https://www.biaw.com/payment-successful',
      cancel_url: 'https://www.biaw.com/builder-application-form',
      client_reference_id: memberId || null,
      metadata: {
        isMember: isMember ? 'true' : 'false',
        memberId: memberId || 'non-member',
        code:"Applicationform"
      },
    };

    const session = await stripe.checkout.sessions.create(sessionConfig);

    res.status(200).json({
      sessionId: session.id,
      url: session.url
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: error.message });
  }
};

const handleWebhook = async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!endpointSecret) {
      console.error('STRIPE_WEBHOOK_SECRET is not set in environment variables');
      return res.status(500).send('Webhook secret is not configured');
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      console.error('⚠️ Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle checkout.session.completed
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const clientReferenceId = session.client_reference_id;
      const metadataCode = session.metadata?.code || '';

      console.log('Checkout Session:', {
        id: session.id,
        clientReferenceId: session.client_reference_id,
        amountTotal: session.amount_total,
        customerEmail: session.customer_details?.email,
        customerName: session.customer_details?.name,
        status: session.status,
        metadata: session.metadata,
        subscription: session.subscription
      });

      console.log('Processing checkout session with metadata code:', metadataCode);
      
      // Check for donation payment link first
      const donationProcessed = await handleDonation(session);
      if (donationProcessed) {
        console.log('Donation processed successfully');
        return res.status(200).send('Received');
      }
      
      // Check if metadata exists and has the code field
      if (!session.metadata) {
        console.warn('No metadata found in session, falling back to Applicationform processing');
        return res.status(200).send('Received');
      }

      if (!metadataCode) {
        console.warn('No code found in metadata, falling back to Applicationform processing');
        return res.status(200).send('Received');
      }

      // Route based on metadata code
      switch (metadataCode) {
        case 'Renewapplication':
          const processedRenewal = await handleRenewalSubscription(session);
          if (processedRenewal) {
            console.log('Renewal subscription processed successfully');
            return res.status(200).send('Received');
          }
          break;

        case 'RenewSubscription':
          const processedNewRenewal = await handleNewRenewalSubscription(session);
          if (processedNewRenewal) {
            console.log('New renewal subscription processed successfully');
            return res.status(200).send('Received');
          }
          break;

        case 'BuilderSubscription':
          const details = {
            member: clientReferenceId || session.customer || '',
            totalAmount: session.amount_total ? session.amount_total / 100 : undefined,
            subscriptionId: session.subscription,
            name: session.customer_details?.name || '',
            email: session.customer_details?.email || '',
            startDate: session.created ? new Date(session.created * 1000).toISOString() : '',
            endDate: session.subscription ? await getSubscriptionEndDate(session.subscription) : '',
          };
          try {
            await updateAirtableWithCheckout(details);
            console.log('Airtable/Webflow/email updated for member (BuilderSubscription):', details.member);
            return res.status(200).send('Received');
          } catch (err) {
            console.error('Failed to update Airtable/Webflow/email (BuilderSubscription):', err);
            return res.status(500).send('Error processing BuilderSubscription');
          }
          break;

        case 'Applicationform':
          // Process Applicationform checkout (original builder application)
          await processApplicationForm(session);
          return res.status(200).send('Received');

        default:
          console.log('No matching metadata code found or code is empty:', metadataCode);
          return res.status(200).send('Received');
      }
    }

    // Handle other event types if needed
    return res.status(200).send('Received');
  } catch (err) {
    console.error('Webhook handler error:', err);
    return res.status(500).send('Webhook handler error');
  }
};

// Helper function to get subscription end date
const getSubscriptionEndDate = async (subscriptionId) => {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    // Calculate 2 years from subscription start date
    const startDate = new Date(subscription.start_date * 1000);
    const twoYearsLater = new Date(startDate);
    twoYearsLater.setFullYear(twoYearsLater.getFullYear() + 2);
    return twoYearsLater.toISOString();
  } catch (error) {
    console.error('Error getting subscription end date:', error);
    return null;
  }
};

// Helper function to process Applicationform
const processApplicationForm = async (session) => {
  const clientReferenceId = session.client_reference_id;
  let airtableRecord = null;

  console.log('Processing Applicationform for client reference ID:', clientReferenceId);

  // Airtable update logic
  try {
    const records = await base2(AIRTABLE_TABLE_NAMES)
      .select({
        filterByFormula: `{Member ID} = '${clientReferenceId}'`,
        maxRecords: 1,
      })
      .firstPage();

    if (records.length > 0) {
      const recordId = records[0].id;
      airtableRecord = records[0];
      // Format subscriptionEnd as YYYY-MM-DD for Airtable Date field
      const renewalDate = new Date(session.subscription ? await getSubscriptionEndDate(session.subscription) : new Date());
      const renewalDateFormatted = renewalDate.toISOString().split('T')[0];
      await base2(AIRTABLE_TABLE_NAMES).update(recordId, {
        "Payment Status": "Paid",
        "Send Mail Status": "Mailed",
        "Status ": "Submitted",
        "Renewal Date": renewalDateFormatted
      });
      console.log(`Airtable record updated for Member ID: ${clientReferenceId}`);
    } else {
      console.warn(`No Airtable record found for Member ID: ${clientReferenceId}`);
    }
  } catch (err) {
    console.error('Error updating Airtable:', err);
  }

  // Create a new row in AIRTABLE_TABLE_NAMES3 for the paid user
  try {
    const userName =
      session.customer_details?.name ||
      session.metadata?.SignedMemberName ||
      'Unknown';
    const totalAmount = (session.amount_total / 100).toFixed(2) + '$';
    const subscriptionStart = session.subscription ? new Date(session.created * 1000).toISOString() : new Date().toISOString();
    
    // Calculate end date as 2 years from start date
    const startDate = new Date(subscriptionStart);
    const endDate = new Date(startDate);
    endDate.setFullYear(endDate.getFullYear() + 2);
    const subscriptionEnd = endDate.toISOString();

    const paymentRecord = await base2(AIRTABLE_TABLE_NAMES3).create([
      {
        fields: {
          "Name": userName,
          "Total Amount Paid": totalAmount,
          "Subscription Start Date": subscriptionStart,
          "Subscription End Date": subscriptionEnd,
          "Payment Status": "Paid",
          "Subscription ID": session.subscription,
          "Member ID": clientReferenceId,
          "Auto Payment status": "Active"
        }
      }
    ]);
    console.log(`Airtable row created in ${AIRTABLE_TABLE_NAMES3} for paid user: ${userName}`);

    // Send payment confirmation email
    try {
      // Get customer email from session or Airtable
      let customerEmail = session.customer_details?.email;
      if (!customerEmail && airtableRecord) {
        customerEmail = airtableRecord.fields.Email;
      }

      if (customerEmail) {
        const emailSubject = 'Payment Confirmation - BIAW';
        const emailText = `Dear ${userName},

Thank you for your recent payment. We are pleased to confirm that your subscription has been successfully activated.

Below are the details of your subscription:

Payment Amount: ${totalAmount}  
Subscription Start Date: ${new Date(subscriptionStart).toLocaleDateString()}  
Subscription End Date: ${new Date(subscriptionEnd).toLocaleDateString()}

Thank you for choosing BIAW. We truly value your support.

Warm regards,  
BIAW Support Team`;

        await sendEmail(customerEmail, emailSubject, emailText);
        console.log(`Payment confirmation email sent to ${customerEmail}`);
      } else {
        console.warn('No email address available to send payment confirmation');
      }
    } catch (emailError) {
      console.error('Error sending payment confirmation email:', emailError);
    }

    // Create Webflow CMS item
    try {
      const slug = `${userName}-${clientReferenceId}`.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      
      const webflowPayload = {
        name: userName,
        "member-id": clientReferenceId,
        "auto-deduction-status": "Active",
        "end-date": subscriptionEnd,
        "start-date": subscriptionStart,
        "total-amount": totalAmount,
        "certification-status": "Submitted",
        slug: slug
      };

      const webflowResponse = await createWebflowItem(webflowPayload);
      console.log('Successfully added item to Webflow:', webflowResponse.id);

    } catch (webflowError) {
      console.error('Error creating Webflow item:', webflowError.response?.data || webflowError.message);
    }

  } catch (err) {
    console.error('Error creating Airtable row for paid user:', err);
  }
};

const updateWebflowCertificationStatus = async (req, res) => {
  try {
    const { id, fields } = req.body;

    if (!fields["Member ID"]) {
      return res.status(400).json({ 
        message: "Member ID is required to update Webflow item" 
      });
    }

    // First, find the Webflow item by member-id
    const webflowItems = await axios.get(
      `https://api.webflow.com/v2/collections/${process.env.WEBFLOW_COLLECTION_ID}/items`,
      {
        headers: {
          Authorization: `Bearer ${process.env.WEBFLOW_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // Find the matching item by member-id
    const matchingItem = webflowItems.data.items.find(
      item => item.fieldData["member-id"] === fields["Member ID"]
    );

    if (!matchingItem) {
      return res.status(404).json({ 
        message: "No Webflow item found with matching Member ID" 
      });
    }

    // Update the certification status in Webflow
    const updateResponse = await axios.patch(
      `https://api.webflow.com/v2/collections/${process.env.WEBFLOW_COLLECTION_ID}/items/${matchingItem.id}`,
      {
        fieldData: {
          "certification-status": fields["Certification Status"] || "Submitted"
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WEBFLOW_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`Webflow item updated to staging for Member ID: ${fields["Member ID"]}`);

    // Then publish the item
    const updateResponse2 = await axios.post(
      `https://api.webflow.com/v2/collections/${process.env.WEBFLOW_COLLECTION_ID}/items/publish`,
      {
          itemIds: [matchingItem.id]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WEBFLOW_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`Webflow item published for Member ID: ${fields["Member ID"]}`);

    console.log('Successfully updated Webflow item certification status:', {
      memberId: fields["Member ID"],
      webflowItemId: matchingItem.id,
      newStatus: fields["Certification Status"] || "Submitted"
    });

    res.status(200).json({ 
      message: "Webflow item updated successfully",
      webflowItemId: matchingItem.id
    });

  } catch (error) {
    console.error('Error updating Webflow item:', error.response?.data || error.message);
    res.status(500).json({ 
      message: "Failed to update Webflow item",
      error: error.response?.data || error.message
    });
  }
};

module.exports = {
  handleWebhook,
  createCheckoutSession,
  updateWebflowCertificationStatus
}; 