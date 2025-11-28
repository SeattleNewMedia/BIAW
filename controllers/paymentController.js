const Payment = require('../models/Payment');
const Class = require('../models/Class');
const StripeService = require('../services/stripeService');
const EmailService = require('../services/emailService');
const WebflowService = require('../services/webflowService');
const SchedulerService = require('../services/schedulerService');
const { base, base2, base3, TABLES, AIRTABLE_CONFIG } = require('../config/database');
const axios = require('axios');
const { logError } = require('../utils/helpers');

class PaymentController {
  // Cancel payment and process refund
  static async cancelPayment(req, res) {
    const { airtableRecordId, paymentIntentId } = req.body;

    // Determine which type of cancellation this is
    let recordId = null;
    let stripePaymentIntentId = null;

    if (paymentIntentId) {
      // Stripe refund: Find the Airtable record by Payment Intent field (prioritized)
      try {
        const records = await base(TABLES.PAYMENT_RECORDS).select({
          filterByFormula: `{Payment Intent} = '${paymentIntentId}'`,
          maxRecords: 1
        }).firstPage();
        
        if (records.length === 0) {
          return res.status(404).json({ message: "No payment record found with this Payment Intent ID" });
        }
        
        recordId = records[0].id;
        stripePaymentIntentId = paymentIntentId;
      } catch (error) {
        console.error("Error finding payment record by Payment Intent:", error);
        return res.status(500).json({ message: "Failed to find payment record" });
      }
    } else if (airtableRecordId) {
      // ROII-Cancellation: Use the provided airtableRecordId
      recordId = airtableRecordId;
    } else {
      return res.status(400).json({ message: "Either airtableRecordId or paymentIntentId is required" });
    }

    try {
      // Fetch payment record
      const airtableURL = `${AIRTABLE_CONFIG.baseURL}/${TABLES.PAYMENT_RECORDS}/${recordId}`;
      let recordResponse;
      
      try {
        recordResponse = await axios.get(airtableURL, {
          headers: AIRTABLE_CONFIG.headers,
        });
      } catch (axiosError) {
        console.error('Error fetching payment record from Airtable:', axiosError.response?.status, axiosError.response?.data);
        if (axiosError.response?.status === 404) {
          return res.status(404).json({ message: "Payment record not found" });
        }
        return res.status(500).json({ message: "Failed to fetch payment record from Airtable" });
      }

      // Validate response
      if (!recordResponse.data) {
        console.error('No data received from Airtable API');
        return res.status(404).json({ message: "Payment record not found" });
      }

      console.log('Airtable response data:', JSON.stringify(recordResponse.data, null, 2));

      if (!recordResponse.data.fields) {
        console.error('Invalid response structure from Airtable API:', recordResponse.data);
        return res.status(500).json({ message: "Invalid payment record structure" });
      }

      const recordData = recordResponse.data.fields;
      
      // Validate required fields
      if (!recordData["Payment Status"]) {
        console.error('Missing Payment Status field in record:', recordData);
        return res.status(400).json({ message: "Payment record is missing required fields" });
      }

      if (!recordData["Biaw Classes"] || !Array.isArray(recordData["Biaw Classes"]) || recordData["Biaw Classes"].length === 0) {
        console.error('Missing or invalid Biaw Classes field in record:', recordData);
        return res.status(400).json({ message: "Payment record is missing class information" });
      }

      const currentPaymentStatus = recordData["Payment Status"];
      const seatCount = recordData["Number of seat Purchased"] || 0;
      const classID = recordData["Biaw Classes"][0];
      const multipleClassRegistrationIds = recordData["Multiple Class Registration"] || [];
      const userEmail = recordData["Email"];
      const userName = recordData["Name"];
      const classurled = recordData['Purchased Class url'];
      const cancellationDate = new Date().toISOString();

      // Determine new payment status
      let newPaymentStatus = "Refunded";
      if (currentPaymentStatus === "ROII-Free" || currentPaymentStatus === "ROII-Cancelled") {
        newPaymentStatus = "ROII-Cancelled";
      }

      // Prepare update payload
      const fieldsToUpdate = {
        "Payment Status": newPaymentStatus,
        "Refund Confirmation ": "Confirmed ",
        "Payment Refund & Cancellation Status":"Refunded"

      };

      if (newPaymentStatus === "ROII-Cancelled" || newPaymentStatus === "Refunded") {
        fieldsToUpdate["Number of seat Purchased"] = "0";
      }

      // Update payment status
      await Payment.updatePaymentStatus(recordId, newPaymentStatus, {
        "Refund Confirmation ": "Confirmed ",
        "Number of seat Purchased": newPaymentStatus === "ROII-Cancelled" || newPaymentStatus === "Refunded" ? "0" : String(seatCount)
      });

      // Update Registration Records and Guest Details in base2 and base3 ONLY for ROII cancellations
      if (newPaymentStatus === "ROII-Cancelled") {
        // Update Registration Records in base2 and base3
        try {
          // base2
          const regRecords2 = await base2('Registration Records').select({
            filterByFormula: `{Main Airtable Base Record ID} = '${recordId}'`,
            maxRecords: 1,
          }).firstPage();
          for (const reg of regRecords2) {
            await base2('Registration Records').update(reg.id, { 'Booked/Cancelled': 'Cancelled' });
          }
        } catch (err) {
          console.error('Failed to update Registration Records in base2:', err.message);
        }
        try {
          // base3 (note the trailing space in field name)
          const regRecords3 = await base3('Registration Records').select({
            filterByFormula: `{Main Airtable Base Record ID } = '${recordId}'`,
            maxRecords: 1,
          }).firstPage();
          for (const reg of regRecords3) {
            await base3('Registration Records').update(reg.id, { 'Booked/Cancelled ': 'Cancelled' });
          }
        } catch (err) {
          console.error('Failed to update Registration Records in base3:', err.message);
        }

        // Update Guest Details in base2 and base3
        try {
          // base2: update Guest Details where Registration Records references the registration record
          const regRecords2 = await base2('Registration Records').select({
            filterByFormula: `{Main Airtable Base Record ID} = '${recordId}'`,
            maxRecords: 1,
          }).firstPage();
          if (regRecords2.length > 0) {
            const regRecordId2 = regRecords2[0].id;
            console.log(`Found registration record in base2: ${regRecordId2}`);
            
            // Get Guest Details IDs from the Registration Record's "Guest Details" field
            const guestDetailIds2 = regRecords2[0].fields['Guest Details'] || [];
            console.log(`Found ${guestDetailIds2.length} guest detail IDs in base2 registration record`);
            
            // Update each Guest Details record
            for (const guestId of guestDetailIds2) {
              try {
                await base2('Guest Details').update(guestId, { 'Booked/Cancelled ': 'Cancelled' });
                console.log(`Updated guest record ${guestId} in base2`);
              } catch (updateErr) {
                console.error(`Failed to update guest record ${guestId} in base2:`, updateErr.message);
              }
            }
          } else {
            console.log('No registration record found in base2 for this payment');
          }
        } catch (err) {
          console.error('Failed to update Guest Details in base2:', err.message);
        }
        
        try {
          // base3: update Guest details where Registered By references the registration record
          const regRecords3 = await base3('Registration Records').select({
            filterByFormula: `{Main Airtable Base Record ID } = '${recordId}'`,
            maxRecords: 1,
          }).firstPage();
          if (regRecords3.length > 0) {
            const regRecordId3 = regRecords3[0].id;
            console.log(`Found registration record in base3: ${regRecordId3}`);
            
            // Get Guest Details IDs from the Registration Record's "Guest details" field
            const guestDetailIds3 = regRecords3[0].fields['Guest details'] || [];
            console.log(`Found ${guestDetailIds3.length} guest detail IDs in base3 registration record`);
            
            // Update each Guest Details record
            for (const guestId of guestDetailIds3) {
              try {
                await base3('Guest details').update(guestId, { 'Booked/Cancelled': 'Cancelled' });
                console.log(`Updated guest record ${guestId} in base3`);
              } catch (updateErr) {
                console.error(`Failed to update guest record ${guestId} in base3:`, updateErr.message);
              }
            }
          } else {
            console.log('No registration record found in base3 for this payment');
          }
        } catch (err) {
          console.error('Failed to update Guest details in base3:', err.message);
        }
      }

      // Fetch the updated payment record
      const updatedRecord = await Payment.getPaymentRecordById(recordId);
      
      // Validate updated record
      if (!updatedRecord) {
        console.error('Failed to fetch updated payment record');
        return res.status(500).json({ message: "Failed to fetch updated payment record" });
      }
      
      if (!updatedRecord.fields) {
        console.error('Updated payment record has no fields:', updatedRecord);
        return res.status(500).json({ message: "Updated payment record has invalid structure" });
      }
      
      // Fetch class details
      const classFieldValue = updatedRecord.fields["Field ID (from Biaw Classes)"]?.[0];
      let classRecord = null;
      if (classFieldValue) {
        classRecord = await Class.getClassByFieldId(classFieldValue);
      }
      let classDetails = null;
      if (Array.isArray(classRecord) && classRecord.length > 0) {
        classDetails = classRecord[0].fields;
      } else if (classRecord && classRecord.fields) {
        classDetails = classRecord.fields;
      }
      // Sync to Webflow CMS
      if (classDetails) {
        await require('../services/purchaseRecordSyncService').pushPurchaseRecordToWebflow(updatedRecord, classDetails);
      }

      // Update class seats
      const biawClassesURL = `${AIRTABLE_CONFIG.baseURL}/Biaw Classes/${classID}`;
      const biawClassResponse = await axios.get(biawClassesURL, {
        headers: AIRTABLE_CONFIG.headers,
      });

      const currentSeatsRemaining = parseInt(biawClassResponse.data.fields["Number of seats remaining"], 10);
      const totalPurchasedSeats = parseInt(biawClassResponse.data.fields["Total Number of Purchased Seats"] || "0", 10);
      const className = biawClassResponse.data.fields["Name"];

      const updatedSeatsRemaining = currentSeatsRemaining + seatCount;
      const updatedTotalPurchasedSeats = totalPurchasedSeats - seatCount;

      await Class.updateClassSeats(classID, updatedSeatsRemaining, updatedTotalPurchasedSeats);

      // Sync remaining seats to Webflow CMS in real-time
      try {
        await WebflowService.updateRemainingSeatsForClass(classFieldValue, updatedSeatsRemaining);
      } catch (webflowError) {
        console.error('Error syncing remaining seats to Webflow:', webflowError.message);
        // Don't fail the entire process if Webflow sync fails
      }

      // Update multiple class registration records
      await Payment.updateMultipleClassRegistrations(multipleClassRegistrationIds, {
        "Payment Status": newPaymentStatus,
      });

      // Process Stripe refund if needed
      let refundAmount = null;
      if (stripePaymentIntentId && newPaymentStatus === "Refunded") {
        const refund = await StripeService.processRefund(stripePaymentIntentId);
        refundAmount = refund.refundAmount;
      }

      // Send cancellation email
      await EmailService.sendCancellationConfirmation(
        userEmail,
        userName,
        className,
        classurled,
        cancellationDate,
        refundAmount
      );

      // Check and notify waitlist after payment cancellation/refund
      try {
        await SchedulerService.checkAndNotifyWaitlist();
        console.log('Waitlist checked and notifications sent after payment cancellation/refund');
      } catch (waitlistError) {
        console.error('Error checking waitlist after payment cancellation/refund:', waitlistError.message);
        // Don't fail the cancellation process if waitlist check fails
      }

      res.status(200).json({
        message: "Payment status updated, class seat adjusted, and email sent.",
        recordId: recordId,
        refundId: refundAmount ? "Refund processed" : "No refund needed",
      });
    } catch (error) {
      console.error("Error processing the payment cancellation and refund:", error.message);
      res.status(500).json({ message: "Failed to process refund and update records", error: error.message });
    }
  }

  // Send payment reminder
  static async sendPaymentReminder(req, res) {
    const { id, fields } = req.body;

    console.log('Received data:', { id, fields });

    try {
      const email = fields["Email"];
      const paymentStatus = fields["Payment Status"]?.name;
      const purchaseclassurl = fields["Purchased Class url"];
      const username = fields["Name"];
      const classname = fields["Name (from Biaw Classes)"]?.[0] || null;

      if (paymentStatus !== "Pending") {
        return res.status(400).json({ error: "Payment is not pending" });
      }

      // Send reminder email
      await EmailService.sendPaymentReminder(email, username, classname, purchaseclassurl);

      // Update Airtable field "Mail" to "Mailed"
      await base(TABLES.PAYMENT_RECORDS).update([
        {
          id: id,
          fields: {
            Mail: "Mailed",
          },
        },
      ]);

      console.log(`Updated Airtable record ${id}: "Mail" set to "Mailed"`);

      res.status(200).json({ message: "Email sent and Airtable updated" });
    } catch (error) {
      console.error("Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
}

module.exports = PaymentController; 