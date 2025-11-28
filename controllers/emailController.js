const sendEmail = require('../utils/emailService');
const { base2 } = require('../config/airtable');
const axios = require('axios');
const AIRTABLE_TABLE_NAMES = process.env.AIRTABLE_TABLE_NAMES || 'YourTableName';

if (!process.env.WEBFLOW_API_KEY || !process.env.WEBFLOW_COLLECTION_ID) {
  throw new Error('WEBFLOW_API_KEY and WEBFLOW_COLLECTION_ID must be set in environment variables');
}

// Valid certification statuses
const VALID_STATUSES = ['Submitted', 'Under Process', 'Certified', 'Rejected'];

// Email templates for different statuses
const EMAIL_TEMPLATES = {
  'Certified': {
    subject: 'Your Builder Application is Approved – Certified Status Achieved',
    template: (firstName, lastName) => `Dear ${firstName} ${lastName},

Congratulations! We are delighted to inform you that your Builder Application has been approved, and you are now officially Certified.

Thank you for your commitment and efforts throughout the application process.

If you have any questions or need further assistance, feel free to contact us.

Best regards,
BIAW Support Team`
  },
  'Rejected': {
    subject: 'Your Builder Application Not Approved',
    template: (firstName, lastName) => `Dear ${firstName} ${lastName},

Thank you for submitting your Builder Application to BIAW. After careful review, we regret to inform you that your application has not been approved.
If you would like further clarification or feedback regarding the decision, please feel free to contact us .
We appreciate your interest in BIAW, and we encourage you to apply again in the future.

Best regards,
BIAW Support Team`
  },
  'Under Process': {
    subject: 'Your Builder Application is Now Being Processed',
    template: (firstName, lastName) => `Dear ${firstName} ${lastName},

We are pleased to inform you that your Builder Application is now being processed. Our team is thoroughly reviewing the details and will reach out if any further information is needed.

Thank you for your patience. We will notify you as soon as the review is complete. If you have any questions during this time, please don't hesitate to contact us.

Best regards,
BIAW Support Team
`
  }
};

// Send status email
const sendStatusEmail = async (fields) => {
  try {
    const firstName = fields['First Name'] || '';
    const lastName = fields['Last Name'] || '';
    const email = fields['Email'];
    const status = fields["Status"]?.name;

    if (!email) {
      throw new Error('Email address is required to send status email');
    }

    if (!status || !EMAIL_TEMPLATES[status]) {
      throw new Error(`Invalid or unsupported status: ${status}`);
    }

    const template = EMAIL_TEMPLATES[status];
    const emailSubject = template.subject;
    const emailText = template.template(firstName, lastName);

    await sendEmail(email, emailSubject, emailText);
    console.log(`Status email (${status}) sent to ${email}`);
    return true;
  } catch (error) {
    console.error('Error sending status email:', error);
    throw error;
  }
};

// Update certification status in Webflow
const updateWebflowStatus = async (fields) => {
  try {
    const status = fields["Status"]?.name;
    
    if (!status || !VALID_STATUSES.includes(status)) {
      throw new Error("Valid Status is required (Submitted, Under Process, Certified, or Rejected)");
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
      throw new Error("No Webflow item found with matching Member ID");
    }

    // Check if current status is already Rejected or Certified
    const currentStatus = matchingItem.fieldData["certification-status"];
    if (currentStatus === "Rejected" || currentStatus === "Certified") {
      console.log(`Status update skipped - certification is already ${currentStatus}`);
      return {
        webflowItemId: matchingItem.id,
        oldStatus: currentStatus,
        newStatus: currentStatus,
        skipped: true,
        reason: `Already ${currentStatus}`
      };
    }

    // First update the item to staging
    const updateResponse = await axios.patch(
      `https://api.webflow.com/v2/collections/${process.env.WEBFLOW_COLLECTION_ID}/items/${matchingItem.id}`,
      {
        fieldData: {
          "certification-status": status
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
      oldStatus: matchingItem.fieldData["certification-status"],
      newStatus: status
    });

    return {
      webflowItemId: matchingItem.id,
      oldStatus: matchingItem.fieldData["certification-status"],
      newStatus: status,
      skipped: false
    };
  } catch (error) {
    console.error('Error updating Webflow item:', error.response?.data || error.message);
    throw error;
  }
};

// Handle mail status update
const handleMailStatus = async (req, res) => {
  try {
    const { id, fields } = req.body;
    console.log('Received mail status update:', { id, fields });

    // Validate required fields
    if (!fields["Member ID"]) {
      return res.status(400).json({ 
        message: "Member ID is required" 
      });
    }

    // Get mail status and certification status
    const mailStatus = fields["Send Mail Status"]?.name;
    const certificationStatus = fields["Status"]?.name;

    if (!mailStatus) {
      return res.status(400).json({ 
        message: "Mail status is required" 
      });
    }

    if (!certificationStatus || !EMAIL_TEMPLATES[certificationStatus]) {
      return res.status(400).json({ 
        message: "Valid certification status is required" 
      });
    }

    // Send email if mail status is not "Hold mail"
    if (mailStatus !== 'Hold mail') {
      try {
        // First check webflow status
        const webflowResult = await updateWebflowStatus(fields);
        
        // Only send email if webflow status wasn't skipped
        if (!webflowResult.skipped) {
          const emailSent = await sendStatusEmail(fields);

          // Only update Airtable if email was sent successfully
          if (emailSent && id) {
            await base2(AIRTABLE_TABLE_NAMES).update(id, {
              'Send Mail Status': 'Mailed'
            });
            console.log(`Airtable record ${id} updated: Send Mail Status set to 'Mailed'`);
          }
        }

        res.status(200).json({ 
          message: webflowResult.skipped ? 
            `Status update skipped - ${webflowResult.reason}` : 
            "Status email sent and webflow updated successfully",
          emailSent: !webflowResult.skipped,
          status: certificationStatus,
          webflowUpdate: webflowResult
        });
      } catch (error) {
        console.error('Error in status update:', error);
        res.status(500).json({ 
          message: "Failed to process status update",
          error: error.message
        });
      }
    } else {
      res.status(200).json({ 
        message: "No email sent - mail is on hold",
        emailSent: false,
        reason: 'Mail is on hold'
      });
    }

  } catch (error) {
    console.error('Error handling mail status:', error);
    res.status(500).json({ 
      message: "Failed to process mail status",
      error: error.message
    });
  }
};

module.exports = {
  handleMailStatus,
  sendStatusEmail
}; 