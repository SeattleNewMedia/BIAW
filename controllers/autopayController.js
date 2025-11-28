const { base2 } = require('../config/airtable');
const axios = require('axios');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const updateAutopayStatus = async (req, res) => {
  try {
    const { autopayDisabled, memberId } = req.body;

    if (!memberId) {
      return res.status(400).json({ 
        message: "Member ID is required" 
      });
    }

    // If autopayDisabled is false, return early
    if (autopayDisabled === false) {
      return res.status(200).json({ 
        message: "No action needed - autopay is not disabled",
        memberId: memberId,
        autopayDisabled: false
      });
    }

    // Update Airtable
    try {
      const records = await base2(process.env.AIRTABLE_TABLE_NAMES3)
        .select({
          filterByFormula: `{Member ID} = '${memberId}'`,
          maxRecords: 1,
        })
        .firstPage();

      if (records.length > 0) {
        const recordId = records[0].id;
        const subscriptionId = records[0].fields["Subscription ID"];

        if (subscriptionId) {
          try {
            await stripe.subscriptions.update(subscriptionId, {
              cancel_at_period_end: true
            });
            console.log(`Stripe subscription ${subscriptionId} marked for cancellation at period end`);
          } catch (stripeErr) {
            console.error('Error cancelling Stripe subscription:', stripeErr);
            throw stripeErr;
          }
        }

        // Always set to Inactive when function runs
        await base2(process.env.AIRTABLE_TABLE_NAMES3).update(recordId, {
          "Auto Payment status": "In-active"
        });
        console.log(`Airtable record updated for Member ID: ${memberId}`);
      } else {
        console.warn(`No Airtable record found for Member ID: ${memberId}`);
      }
    } catch (err) {
      console.error('Error updating Airtable:', err);
      throw err;
    }

    // Update Webflow
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
        item => item.fieldData["member-id"] === memberId
      );

      if (!matchingItem) {
        console.warn(`No Webflow item found with Member ID: ${memberId}`);
      } else {
        // First update the item to staging
        const updateResponse = await axios.patch(
          `https://api.webflow.com/v2/collections/${process.env.WEBFLOW_COLLECTION_ID}/items/${matchingItem.id}`,
          {
            fieldData: {
              "auto-deduction-status": "In-active"
            }
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.WEBFLOW_API_KEY}`,
              'Content-Type': 'application/json',
            },
          }
        );
        console.log(`Webflow item updated to staging for Member ID: ${memberId}`);

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
        console.log(`Webflow item published for Member ID: ${memberId}`);
      }
    } catch (err) {
      console.error('Error updating Webflow:', err);
      throw err;
    }

    res.status(200).json({ 
      message: "Autopay status updated successfully",
      memberId: memberId,
      autopayDisabled: true
    });

  } catch (error) {
    console.error('Error updating autopay status:', error);
    res.status(500).json({ 
      message: "Failed to update autopay status",
      error: error.message
    });
  }
};

module.exports = {
  updateAutopayStatus
}; 