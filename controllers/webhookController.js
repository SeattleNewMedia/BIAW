const { endpointSecret } = require('../config/stripe');
const StripeService = require('../services/stripeService');
const Payment = require('../models/Payment');
const Class = require('../models/Class');
const EmailService = require('../services/emailService');
const WebflowService = require('../services/webflowService');
const SchedulerService = require('../services/schedulerService');
const CESCLService = require('../services/cesclService');
const { formatCurrency } = require('../utils/helpers');
const { logError } = require('../utils/helpers');
const PurchaseRecordSyncService = require('../services/purchaseRecordSyncService');

class WebhookController {
  // Handle Stripe webhook events
  static async handleStripeWebhook(req, res) {
    const sig = req.headers['stripe-signature'];
    const rawBody = req.body;

    let event;
    try {
      event = StripeService.verifyWebhookSignature(rawBody, sig, endpointSecret);
    } catch (err) {
      console.error('⚠️ Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const result = await WebhookController.handleCheckoutSessionCompleted(event.data.object);
      if (result.status === 'skipped') {
        return res.status(200).send(result.message);
      } else if (result.status === 'error') {
        return res.status(400).send(result.message);
      } else if (result.status === 'success') {
        console.log('Webhook processed successfully');
      }
    } else {
      console.log(`Unhandled event type: ${event.type}`);
    }

    res.status(200).send('Received');
  }

  // Handle Airtable class webhook
  static async handleAirtableClassWebhook(req, res) {
    try {
      console.log('Received Airtable class webhook - Body type:', typeof req.body);
      console.log('Received Airtable class webhook - Is Buffer:', Buffer.isBuffer(req.body));
      console.log('Received Airtable class webhook - Body length:', req.body?.length);
      
      let webhookData;
      
      // Handle Buffer data from Airtable
      if (Buffer.isBuffer(req.body)) {
        const jsonString = req.body.toString('utf8');
      
        webhookData = JSON.parse(jsonString);
      } else {
        webhookData = req.body;
        console.log('Direct body data:', webhookData);
      }
      
      // Extract class details from Airtable webhook structure
      let classDetails;
      
      // Check if it's the Airtable webhook format with "All Fields with Values" array
      if (webhookData["All Fields with Values"] && Array.isArray(webhookData["All Fields with Values"])) {
        console.log('Using Airtable webhook format with field array');
        
        // Convert the field array to a flat object
        const fieldsObject = {};
        webhookData["All Fields with Values"].forEach(field => {
          if (field.name && field.value !== null && field.value !== undefined) {
            fieldsObject[field.name] = field.value;
          }
        });
        
        classDetails = { 
          id: webhookData["Raw Record Details"]?.id || webhookData.id, 
          ...fieldsObject 
        };
        
      } else if (webhookData.fields) {
        // Direct fields structure
        classDetails = { id: webhookData.id, ...webhookData.fields };
        console.log('Using direct fields structure');
      } else if (webhookData.record && webhookData.record.fields) {
        // Nested record structure
        classDetails = { id: webhookData.record.id, ...webhookData.record.fields };
        console.log('Using nested record structure');
      } else {
        // Assume it's already in the correct format
        classDetails = webhookData;
        console.log('Using direct webhook data');
      }
      
      console.log('Extracted class details:', classDetails);
      console.log('Class Name:', classDetails?.Name);
      console.log('Field ID:', classDetails?.['Field ID']);
      
      // Validate webhook data
      if (!classDetails || typeof classDetails !== 'object') {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid webhook data format' 
        });
      }

      // Validate required fields
      if (!classDetails.Name || !classDetails['Field ID']) {
        console.error('Missing required fields. Class details:', classDetails);
        return res.status(400).json({ 
          success: false, 
          error: 'Missing required fields: Name or Field ID',
          receivedData: classDetails
        });
      }

      // Process the class from webhook data
      const result = await SchedulerService.processClassFromWebhook(classDetails);
      
      if (result.success) {
        console.log('Class processed successfully from webhook');
        res.status(200).json({ 
          success: true, 
          message: 'Class processed successfully',
          itemIds: result.itemIds 
        });
      } else {
        console.log('Class processing skipped:', result.message);
        res.status(200).json({ 
          success: false, 
          message: result.message 
        });
      }
    } catch (error) {
      logError('Processing Airtable class webhook', error);
      res.status(500).json({ 
        success: false, 
        error: error.message,
        details: error.stack
      });
    }
  }

  // Handle checkout session completed
  static async handleCheckoutSessionCompleted(session) {
    const clientReferenceId = session.client_reference_id;
    const paymentIntentId = session.payment_intent;
    const amountTotal = session.amount_total;
    const checkid = session.id;

        // Check for required metadata
    console.log('Session metadata:', session.metadata);
    if (!session.metadata || session.metadata.class !== 'classmodule') {
      console.log('Metadata not found: class:classmodule - skipping webhook processing');
      return { status: 'skipped', message: 'Webhook skipped - metadata not found' };
    }

    console.log(`Processing checkout session for PaymentIntent: ${paymentIntentId}`);

    if (!clientReferenceId || !paymentIntentId) {
      console.warn('Missing client_reference_id or payment_intent in session');
      return { status: 'error', message: 'Invalid session data' };
    }

    try {
      // Get payment record
      const matchingRecord = await Payment.getPaymentRecordById(clientReferenceId);

      if (matchingRecord) {
        // Update payment record
        await Payment.updatePaymentRecord(matchingRecord.id, {
          'Payment Intent': paymentIntentId,
          'Amount Total': formatCurrency(amountTotal),
          'Payment Status': 'Paid',
          'Payment ID': checkid,
          'Initial Payment status (RoII, Paid, Pending)':'Paid'
        });

        // Fetch the updated payment record from Airtable
        const updatedRecord = await Payment.getPaymentRecordById(matchingRecord.id);
        // Fetch the class record for Webflow sync
        const classFieldValue = updatedRecord.fields["Field ID (from Biaw Classes)"]?.[0];
        let classRecord = null;
        if (classFieldValue) {
          classRecord = await Class.getClassByFieldId(classFieldValue);
        }
        // If getClassByFieldId returns an array, use the first element
        let classDetails = null;
        if (Array.isArray(classRecord) && classRecord.length > 0) {
          classDetails = classRecord[0].fields;
        } else if (classRecord && classRecord.fields) {
          classDetails = classRecord.fields;
        }
        if (classDetails) {
          await PurchaseRecordSyncService.pushPurchaseRecordToWebflow(updatedRecord, classDetails);
        }

        // Process CESCL registration after payment is completed
        try {
          const cesclRecord = await CESCLService.processCESCLRegistrationAfterPayment(
            updatedRecord, 
            matchingRecord.fields['Biaw Classes']?.[0], 
            matchingRecord.fields['Multiple Class Registration'] || []
          );
          if (cesclRecord && cesclRecord.length > 0) {
            console.log('CESCL records created after payment completion:', cesclRecord.length, 'records');
          }
        } catch (cesclError) {
          console.error('Error processing CESCL registration after payment:', cesclError);
          // Don't fail the entire process if CESCL processing fails
        }

        // Process class registration
        await WebhookController.processClassRegistration(matchingRecord, amountTotal);
      } else {
        console.warn(`No matching Airtable record found for clientReferenceId: ${clientReferenceId}`);
      }
    } catch (error) {
      console.error('Error processing the webhook event:', error);
      return { status: 'error', message: 'Error processing webhook event' };
    }
    
    return { status: 'success', message: 'Webhook processed successfully' };
  }

  // Process class registration after payment
  static async processClassRegistration(paymentRecord, amountTotal) {
    const seatCount = parseInt(paymentRecord.fields['Number of seat Purchased'], 10);
    const classFieldValue = paymentRecord.fields["Field ID (from Biaw Classes)"]?.[0] || "No details provided";
    const multipleClassRegistrationIds = paymentRecord.fields['Multiple Class Registration'] || [];
    const userEmail = paymentRecord.fields['Email'];
    const userName = paymentRecord.fields['Name'];
    const purchasedClassUrl = paymentRecord.fields['Purchased Class url'];

    // Get class record
    const classRecord = await Class.getClassByFieldId(classFieldValue);
    if (!classRecord) {
      console.warn(`Class record not found for ID: ${classFieldValue}`);
      return;
    }

    const currentSeatsRemaining = parseInt(classRecord.fields['Number of seats remaining'], 10);
    const totalPurchasedSeats = parseInt(classRecord.fields['Total Number of Purchased Seats'] || '0', 10);
    const className = classRecord.fields['Name'];
    const instructorName = classRecord.fields['Instructor Name (from Instructors)'];
    const platform = classRecord.fields["Local Association Name (from Class Location)"]?.[0] || "No details provided";
    const mode = classRecord.fields["Product Type"]
    const location = classRecord.fields['City (from Class Location)'] || "" ;
    const description = classRecord.fields['Description'];

    if (currentSeatsRemaining < seatCount) {
      console.error('Not enough seats available for this class.');
      return;
    }

    // Update class seats
    await Class.updateClassSeats(
      classRecord.id,
      currentSeatsRemaining - seatCount,
      totalPurchasedSeats + seatCount
    );

    // Sync remaining seats to Webflow CMS in real-time
    try {
      await WebflowService.updateRemainingSeatsForClass(classFieldValue, currentSeatsRemaining - seatCount);
    } catch (webflowError) {
      console.error('Error syncing remaining seats to Webflow:', webflowError.message);
      // Don't fail the entire process if Webflow sync fails
    }

    console.log(
      `Class record updated. Remaining seats: ${currentSeatsRemaining - seatCount}, Total purchased seats: ${totalPurchasedSeats + seatCount}`
    );

    // Update multiple class registration records
    await Payment.updateMultipleClassRegistrations(multipleClassRegistrationIds, {
      'Payment Status': 'Paid',
    });

    // Send confirmation email
    await EmailService.sendRegistrationConfirmation(
      userEmail,
      userName,
      className,
      instructorName,
      mode,
      description,
      location,
      purchasedClassUrl,
      seatCount,
      amountTotal,
      platform,
      classRecord.fields['Date'] || "",
      classRecord.fields['Start time'] || ""
    );
  }
}

module.exports = WebhookController; 