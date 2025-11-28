const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');
const sendEmail = require('../utils/emailService');

// Handle product checkout for subscription module
const handleProductCheckout = async (req, res) => {
  try {
    const { memberId, isMember } = req.body;
    console.log('Received memberId:', memberId, 'isMember:', isMember);

    const oneTimePriceId = 'price_1QfStgIONk3QNZzYljqLKDjB'; 
    const recurringPriceId = 'price_1QfSvkIONk3QNZzYRbmdzE0X'; 

    // const oneTimePriceId = 'price_1Rc9JGIONk3QNZzYATx6BKYW';
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
      cancel_url: 'https://www.biaw.com/contract-subscription-service',
      client_reference_id:memberId,
      automatic_tax: {
        enabled: true,
      },
      tax_id_collection: {
        enabled: true,
      },
      metadata: {
        memberId: memberId || 'non-member',
        isMember: isMember ? 'true' : 'false',
        code:"BuilderSubscription"
      }
    };

    if (memberId && typeof memberId === 'string' && memberId.trim() !== '') {
      sessionConfig.client_reference_id = memberId;
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    res.status(200).json({
      sessionId: session.id,
      url: session.url
    });

  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({
      message: "Failed to create checkout session",
      error: error.message
    });
  }
};

async function updateWebflowCMS(fields) {
  const WEBFLOW_COLLECTION_ID1 = process.env.WEBFLOW_COLLECTION_ID1;
  const WEBFLOW_API_KEY = process.env.WEBFLOW_API_KEY;

  // 1. Create the item in staging (not live)
  const createUrl = `https://api.webflow.com/v2/collections/${WEBFLOW_COLLECTION_ID1}/items`;
  const headers = {
    Authorization: `Bearer ${WEBFLOW_API_KEY}`,
    'Content-Type': 'application/json'
  };

  const data = {
    fieldData: fields
  };

  try {
    // Create item in staging
    const createResponse = await axios.post(createUrl, data, { headers });
    const itemId = createResponse.data.id;

    // 2. Publish the item to live
    const publishUrl = `https://api.webflow.com/v2/collections/${WEBFLOW_COLLECTION_ID1}/items/publish`;
    const publishData = {
      itemIds: [itemId]
    };

    const publishResponse = await axios.post(publishUrl, publishData, { headers });

    return {
      createResponse: createResponse.data,
      publishResponse: publishResponse.data
    };
  } catch (error) {
    console.error('Webflow update error:', error.response?.data || error.message);
    throw error;
  }
}

async function updateAirtableWithCheckout(details) {
  const AIRTABLE_BASE_ID2 = process.env.AIRTABLE_BASE_ID2;
  const AIRTABLE_API_KEYS2 = process.env.AIRTABLE_API_KEYS2;
  const AIRTABLE_TABLE_NAMES4 = process.env.AIRTABLE_TABLE_NAMES4;

  // First check if record already exists
  const checkUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID2}/${AIRTABLE_TABLE_NAMES4}?filterByFormula={Subscription ID}='${details.subscriptionId}'`;
  const headers = {
    Authorization: `Bearer ${AIRTABLE_API_KEYS2}`,
    'Content-Type': 'application/json'
  };

  try {
    // Check if record exists
    const checkResponse = await axios.get(checkUrl, { headers });
    if (checkResponse.data.records.length > 0) {
      console.log('Record already exists in Airtable for subscription:', details.subscriptionId);
      return; // Exit if record exists
    }

    // Calculate end date (1 year from start date)
    const startDate = new Date(details.startDate);
    const endDate = new Date(startDate);
    endDate.setFullYear(endDate.getFullYear() + 2);

    // If no record exists, create new one
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID2}/${AIRTABLE_TABLE_NAMES4}`;
    const data = {
      fields: {
        "Member": details.member,
        "Total Amount": details.totalAmount,
        "Subscription ID": details.subscriptionId,
        "Name": details.name,
        "Email": details.email,
        "Start date": details.startDate,
        "End date": endDate.toISOString(),
        "Subscription autopayment status":"Active"
      }
    };

    const response = await axios.post(url, data, { headers });
    console.log('Airtable updated for member:', details.member);

    // After Airtable update, update Webflow
    const webflowFields = {
      "member-id": details.member,
      "subscription-status": "Active",
      "subscription-starting-date": startDate.toISOString().split('T')[0],
      "subscription-end-date": endDate.toISOString().split('T')[0],
      "name": details.name,
      "slug": details.name ? details.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') : ''
    };
    await updateWebflowCMS(webflowFields);
    console.log('Webflow CMS updated for member:', details.member);

    // After Webflow update, send email
    if (details.email) {
     const subject = 'Subscription Activated - BIAW';
const body = `Dear ${details.name},

We are excited to inform you that your subscription with BIAW has been successfully activated!

Subscription Details:
Start Date: ${startDate.toISOString().split('T')[0]}
End Date: ${endDate.toISOString().split('T')[0]}
Duration: 2 years

As a valued subscriber, you now have full access to all the benefits and features included in your plan. We're thrilled to have you with us and are committed to providing you with the best possible experience.

Thank you for choosing BIAW. We look forward to supporting you over the next two years and beyond.

BIAW Support Team`;

await sendEmail(details.email, subject, body);
console.log('Subscription email sent to:', details.email);

    }
  } catch (error) {
    console.error('Error in updateAirtableWithCheckout:', error.response?.data || error.message);
    throw error;
  }
}

module.exports = {
  updateAirtableWithCheckout,
  handleProductCheckout
}; 