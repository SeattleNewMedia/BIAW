const Payment = require('../models/Payment');
const Class = require('../models/Class');
const EmailService = require('../services/emailService');
const StripeService = require('../services/stripeService');
const SchedulerService = require('../services/schedulerService');
const { logError } = require('../utils/helpers');
const axios = require('axios');
const { AIRTABLE_CONFIG, base2, base3 } = require('../config/database');

class AdminController {
  // Process refund with Stripe
  static async processRefund(req, res) {
    try {
      const { id, fields } = req.body;

      if (!id || !fields) {
        return res.status(400).json({ message: "Invalid request data" });
      }

      console.log("Received refund request:", { id, fields });

      const paymentIntentId = fields["Payment Intent"];
      const classid = fields["Field ID (from Biaw Classes)"]?.[0] || null;
      const seatsPurchased = parseInt(fields["Number of seat Purchased"], 10) || 0;
      const custEmail = fields["Email"];
      const username = fields["Name"];
      const classname = fields["Name (from Biaw Classes)"]?.[0] || null;

      let refundSuccessful = false;

      // Process Stripe refund if it's a Stripe payment
      if (AdminController.isStripePayment(paymentIntentId)) {
        try {
          const refund = await StripeService.createRefund(paymentIntentId);

          if (refund.status === "succeeded") {
            console.log(`Stripe refund successful for Payment Intent: ${paymentIntentId}`);
            refundSuccessful = true;
          } else {
            console.warn(`Refund failed for Payment Intent: ${paymentIntentId}`);
          }
        } catch (error) {
          console.error(`Error processing Stripe refund: ${error.message}`);
        }
      } else {
        console.log(`Skipping Stripe refund: Payment Intent (${paymentIntentId}) is not a Stripe Payment Intent.`);
      }

      // Update payment record
      await Payment.updatePaymentForRefund(id, seatsPurchased);

      // Update class availability
      if (classid) {
        await Class.updateClassSeatsForRefund(classid, seatsPurchased);
        // Fetch updated class record to get new seat count
        const { base, TABLES } = require('../config/database');
        const classRecords = await base(TABLES.BIAW_CLASSES)
          .select({ filterByFormula: `{Field ID} = '${classid}'`, maxRecords: 1 })
          .firstPage();
        if (classRecords.length > 0) {
          const updatedClass = classRecords[0];
          const updatedRemainingSeats = parseInt(updatedClass.fields["Number of seats remaining"], 10) || 0;
          const WebflowService = require('../services/webflowService');
          await WebflowService.updateWebflowItemsByFieldId(classid, updatedRemainingSeats);
          
          // Sync updated payment record to Webflow CMS (Purchase CMS)
          try {
            const PaymentModel = require('../models/Payment');
            const PurchaseRecordSyncService = require('../services/purchaseRecordSyncService');
            const updatedPaymentRecord = await PaymentModel.getPaymentRecordById(id);
            if (updatedPaymentRecord && updatedClass.fields) {
              await PurchaseRecordSyncService.pushPurchaseRecordToWebflow(updatedPaymentRecord, updatedClass.fields);
              console.log(`Synced updated payment record to Webflow Purchase CMS for refund`);
            }
          } catch (webflowError) {
            console.error('Error syncing payment record to Webflow Purchase CMS:', webflowError.message);
          }
        }
      }

      // Update linked multiple class registrations
      const multipleClassRegistrationIds = fields["Multiple Class Registration"] || [];
      for (const multipleClassIdObj of multipleClassRegistrationIds) {
        const multipleClassId = multipleClassIdObj.id || multipleClassIdObj;
        if (multipleClassId) {
          await Payment.updateMultipleClassRegistrationStatus(multipleClassId, "Refunded");
        }
      }

      // Send confirmation email
      if (custEmail) {
        await EmailService.sendRefundConfirmationEmail(custEmail, username, classname, seatsPurchased);
        console.log(`Email sent to ${custEmail} for refund request ID: ${id}`);
      }

      // Check and notify waitlist after refund
      try {
        await SchedulerService.checkAndNotifyWaitlist();
        console.log('Waitlist checked and notifications sent after refund');
      } catch (waitlistError) {
        console.error('Error checking waitlist after refund:', waitlistError.message);
        // Don't fail the refund process if waitlist check fails
      }

      return res.status(200).json({ message: "Refund processed successfully" });
    } catch (error) {
      logError("Processing refund", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  // Process ROII cancellation
  static async processROIICancellation(req, res) {
    try {
      const { id, fields } = req.body;

      if (!id || !fields) {
        return res.status(400).json({ message: "Invalid request data" });
      }

      console.log("Received ROII cancellation request:", { id, fields });

      const classid = fields["Field ID (from Biaw Classes)"]?.[0] || null;
      const seatsPurchased = parseInt(fields["Number of seat Purchased"], 10) || 0;
      const custEmail = fields["Email"];
      const username = fields["Name"];
      const classname = fields["Name (from Biaw Classes)"]?.[0] || null;

      // Update payment record
      await Payment.updatePaymentForROIICancellation(id, seatsPurchased);

      // Update Registration Records in base2 and base3
      try {
        // base2
        const regRecords2 = await base2('Registration Records').select({
          filterByFormula: `{Main Airtable Base Record ID} = '${id}'`,
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
          filterByFormula: `{Main Airtable Base Record ID } = '${id}'`,
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
          filterByFormula: `{Main Airtable Base Record ID} = '${id}'`,
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
          filterByFormula: `{Main Airtable Base Record ID } = '${id}'`,
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

      // Update class availability
      if (classid) {
        try {
          await Class.updateClassSeatsForRefund(classid, seatsPurchased);
          console.log(`Updated class seats for ROII cancellation. Class ID: ${classid}, Seats returned: ${seatsPurchased}`);
          // Fetch updated class record to get new seat count
          const { base, TABLES } = require('../config/database');
          const classRecords = await base(TABLES.BIAW_CLASSES)
            .select({ filterByFormula: `{Field ID} = '${classid}'`, maxRecords: 1 })
            .firstPage();
          if (classRecords.length > 0) {
            const updatedClass = classRecords[0];
            const updatedRemainingSeats = parseInt(updatedClass.fields["Number of seats remaining"], 10) || 0;
            const WebflowService = require('../services/webflowService');
            await WebflowService.updateWebflowItemsByFieldId(classid, updatedRemainingSeats);
            console.log(`Synced updated seats to Webflow. Remaining seats: ${updatedRemainingSeats}`);
            
            // Sync updated payment record to Webflow CMS (Purchase CMS)
            try {
              const PaymentModel = require('../models/Payment');
              const PurchaseRecordSyncService = require('../services/purchaseRecordSyncService');
              const updatedPaymentRecord = await PaymentModel.getPaymentRecordById(id);
              if (updatedPaymentRecord && updatedClass.fields) {
                await PurchaseRecordSyncService.pushPurchaseRecordToWebflow(updatedPaymentRecord, updatedClass.fields);
                console.log(`Synced updated payment record to Webflow Purchase CMS for ROII cancellation`);
              }
            } catch (webflowError) {
              console.error('Error syncing payment record to Webflow Purchase CMS:', webflowError.message);
            }
          } else {
            console.warn(`No class record found for class ID: ${classid}`);
          }
        } catch (error) {
          console.error(`Error updating class seats for ROII cancellation. Class ID: ${classid}`, error);
          // Don't fail the entire process if seat update fails
        }
      } else {
        console.warn('No class ID found for ROII cancellation');
      }

      // Update linked multiple class registrations
      const multipleClassRegistrationIds = fields["Multiple Class Registration"] || [];
      for (const multipleClassIdObj of multipleClassRegistrationIds) {
        const multipleClassId = multipleClassIdObj.id || multipleClassIdObj;
        if (multipleClassId) {
          await Payment.updateMultipleClassRegistrationStatus(multipleClassId, "ROII-Cancelled");
        }
      }

      // Send confirmation email
      if (custEmail) {
        await EmailService.sendROIICancellationEmail(custEmail, username, classname, seatsPurchased);
        console.log(`Email sent to ${custEmail} for ROII cancellation request ID: ${id}`);
      }

      // Check and notify waitlist after ROII cancellation
      try {
        await SchedulerService.checkAndNotifyWaitlist();
        console.log('Waitlist checked and notifications sent after ROII cancellation');
      } catch (waitlistError) {
        console.error('Error checking waitlist after ROII cancellation:', waitlistError.message);
        // Don't fail the cancellation process if waitlist check fails
      }

      return res.status(200).json({ message: "ROII cancellation processed successfully" });
    } catch (error) {
      logError("Processing ROII cancellation", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  // Process cancellation without refund
  static async processCancellationWithoutRefund(req, res) {
    try {
      const { id, fields } = req.body;

      if (!id || !fields) {
        return res.status(400).json({ message: "Invalid request data" });
      }

      console.log("Received cancellation without refund request:", { id, fields });

      const classid = fields["Field ID (from Biaw Classes)"]?.[0] || null;
      const seatsPurchased = parseInt(fields["Number of seat Purchased"], 10) || 0;
      const custEmail = fields["Email"];
      const username = fields["Name"];
      const classname = fields["Name (from Biaw Classes)"]?.[0] || null;

      // Update payment record
      await Payment.updatePaymentForCancellationWithoutRefund(id, seatsPurchased);

      // Update class availability
      if (classid) {
        try {
          await Class.updateClassSeatsForRefund(classid, seatsPurchased);
          console.log(`Updated class seats for cancellation without refund. Class ID: ${classid}, Seats returned: ${seatsPurchased}`);
          // Fetch updated class record to get new seat count
          const { base, TABLES } = require('../config/database');
          const classRecords = await base(TABLES.BIAW_CLASSES)
            .select({ filterByFormula: `{Field ID} = '${classid}'`, maxRecords: 1 })
            .firstPage();
          if (classRecords.length > 0) {
            const updatedClass = classRecords[0];
            const updatedRemainingSeats = parseInt(updatedClass.fields["Number of seats remaining"], 10) || 0;
            const WebflowService = require('../services/webflowService');
            await WebflowService.updateWebflowItemsByFieldId(classid, updatedRemainingSeats);
            console.log(`Synced updated seats to Webflow. Remaining seats: ${updatedRemainingSeats}`);
            
            // Sync updated payment record to Webflow CMS (Purchase CMS)
            try {
              const PaymentModel = require('../models/Payment');
              const PurchaseRecordSyncService = require('../services/purchaseRecordSyncService');
              const updatedPaymentRecord = await PaymentModel.getPaymentRecordById(id);
              if (updatedPaymentRecord && updatedClass.fields) {
                await PurchaseRecordSyncService.pushPurchaseRecordToWebflow(updatedPaymentRecord, updatedClass.fields);
                console.log(`Synced updated payment record to Webflow Purchase CMS for cancellation without refund`);
              }
            } catch (webflowError) {
              console.error('Error syncing payment record to Webflow Purchase CMS:', webflowError.message);
            }
          } else {
            console.warn(`No class record found for class ID: ${classid}`);
          }
        } catch (error) {
          console.error(`Error updating class seats for cancellation without refund. Class ID: ${classid}`, error);
          // Don't fail the entire process if seat update fails
        }
      } else {
        console.warn('No class ID found for cancellation without refund');
      }

      // Update linked multiple class registrations
      const multipleClassRegistrationIds = fields["Multiple Class Registration"] || [];
      for (const multipleClassIdObj of multipleClassRegistrationIds) {
        const multipleClassId = multipleClassIdObj.id || multipleClassIdObj;
        if (multipleClassId) {
          await Payment.updateMultipleClassRegistrationStatus(multipleClassId, "Refunded");
        }
      }

      // Send confirmation email
      if (custEmail) {
        await EmailService.sendCancellationWithoutRefundEmail(custEmail, username, classname, seatsPurchased);
        console.log(`Email sent to ${custEmail} for cancellation request ID: ${id}`);
      }

      // Check and notify waitlist after cancellation without refund
      try {
        await SchedulerService.checkAndNotifyWaitlist();
        console.log('Waitlist checked and notifications sent after cancellation without refund');
      } catch (waitlistError) {
        console.error('Error checking waitlist after cancellation without refund:', waitlistError.message);
        // Don't fail the cancellation process if waitlist check fails
      }

      return res.status(200).json({ message: "Cancellation processed successfully" });
    } catch (error) {
      logError("Processing cancellation without refund", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  // Process admin bookings
  static async processAdminBookings() {
    try {
      console.log("Processing admin bookings...");
      
      // Process paid admin bookings
      await AdminController.processPaidAdminBookings();
      
      // Process ROII-free admin bookings
      await AdminController.processROIIFreeAdminBookings();
      
      console.log("Admin bookings processing completed");
    } catch (error) {
      logError("Processing admin bookings", error);
    }
  }

  // Process paid admin bookings
  static async processPaidAdminBookings() {
    try {
      const records = await Payment.getPaidAdminBookings();

      for (const record of records) {
        try {
          const email = record.get('Email');
          const totalamount = record.get('Amount Total')
          const seatsPurchased = parseInt(record.get('Number of seat Purchased'), 10) || 0;
          // Get classId as string (not array)
          let classId = record.get('Biaw Classes');
          if (Array.isArray(classId)) {
            classId = classId[0];
          }
          const multipleClassRegistrationIds = record.get('Multiple Class Registration') || [];
          const amount = record.get('Amount Total');
          const name = record.get("Name");
          const description = record.get("Description")?.[0] || "No details provided";
          const classname = record.get("Name (from Biaw Classes)")?.[0] || "No details provided";
          const location = record.get("Location (from Biaw Classes)")?.[0] || "No location provided";
          const currentBookingStatus = record.get("Admin class booking status");

          if (!email || seatsPurchased <= 0 || !classId || !totalamount) {
            console.log(`Skipping record due to missing data. Record ID: ${record.id}`);
            continue;
          }

          // Check class availability
          const linkedClass = await Class.getClassById(classId);
          if (!linkedClass) {
            console.log(`Skipping record: Linked class not found for ${record.id}`);
            continue;
          }

          const seatsRemaining = parseInt(linkedClass.get('Number of seats remaining'), 10) || 0;
          const publishStatus = linkedClass.get('Publish / Unpublish');

          // Handle rejection cases
          if (seatsRemaining <= 0 || publishStatus === "Deleted" || seatsPurchased > seatsRemaining) {
            if (currentBookingStatus !== "Rejected") {
              await Payment.rejectAdminBooking(record.id);
              await EmailService.sendBookingRejectionEmail(email, name);
              console.log(`Rejection email sent to ${email}`);
            }
            continue;
          }

          // Process successful booking
          await Payment.completeAdminBooking(record.id);
          
          console.log(`Processing class seats update for classId: ${classId}, seatsPurchased: ${seatsPurchased}`);
          await Class.updateClassSeatsForBooking(classId, seatsPurchased);

          // Sync to Webflow CMS (Payment CMS)
          try {
            const PaymentModel = require('../models/Payment');
            const ClassModel = require('../models/Class');
            const PurchaseRecordSyncService = require('../services/purchaseRecordSyncService');
            const WebflowService = require('../services/webflowService');
            const updatedPaymentRecord = await PaymentModel.getPaymentRecordById(record.id);
            const classRecord = await ClassModel.getClassById(classId);
            if (updatedPaymentRecord && classRecord && classRecord.fields) {
              await PurchaseRecordSyncService.pushPurchaseRecordToWebflow(updatedPaymentRecord, classRecord.fields);
              // Also update class seats in Webflow
              const fieldId = classRecord.fields['Field ID'];
              const updatedRemainingSeats = parseInt(classRecord.fields['Number of seats remaining'], 10) || 0;
              await WebflowService.updateWebflowItemsByFieldId(fieldId, updatedRemainingSeats);
            }
          } catch (webflowError) {
            console.error('Error syncing payment record to Webflow:', webflowError.message);
          }

          // Update multiple class registrations
          for (const multipleClassId of multipleClassRegistrationIds) {
            await Payment.updateMultipleClassRegistrationStatus(multipleClassId, "Paid");
          }

          // Send confirmation email
          await EmailService.sendAdminBookingConfirmationEmail(email, name, classname, description, seatsPurchased, amount, location);
          console.log(`Confirmation email sent to ${email}`);

        } catch (error) {
          logError(`Processing paid admin booking record ${record.id}`, error);
          console.error("Detailed error for record:", {
            recordId: record.id,
            classId,
            seatsPurchased,
            email,
            error: error.message,
            stack: error.stack
          });
        }
      }
    } catch (error) {
      logError("Processing paid admin bookings", error);
    }
  }

  // Process ROII-free admin bookings
  static async processROIIFreeAdminBookings() {
    try {
      const records = await Payment.getROIIFreeAdminBookings();

      for (const record of records) {
        try {
          const email = record.get('Email');
          const seatsPurchased = parseInt(record.get('Number of seat Purchased'), 10) || 0;
          // Get classId as string (not array)
          let classId = record.get('Biaw Classes');
          if (Array.isArray(classId)) {
            classId = classId[0];
          }
          const multipleClassRegistrationIds = record.get('Multiple Class Registration') || [];
          const name = record.get("Name");
          const description = record.get("Description")?.[0] || "No details provided";
          const classname = record.get("Name (from Biaw Classes)")?.[0] || "No details provided";
          const location = record.get("Location (from Biaw Classes)")?.[0] || "No location provided";
          const currentBookingStatus = record.get("Admin class booking status");

          if (!email || seatsPurchased <= 0 || !classId) {
            console.log(`Skipping record due to missing data. Record ID: ${record.id}`);
            continue;
          }

          // Check class availability
          const linkedClass = await Class.getClassById(classId);
          if (!linkedClass) {
            console.log(`Skipping record: Linked class not found for ${record.id}`);
            continue;
          }

          const seatsRemaining = parseInt(linkedClass.get('Number of seats remaining'), 10) || 0;
          const publishStatus = linkedClass.get('Publish / Unpublish');

          // Handle rejection cases
          if (seatsRemaining <= 0 || publishStatus === "Deleted" || seatsPurchased > seatsRemaining) {
            if (currentBookingStatus !== "Rejected") {
              await Payment.rejectAdminBooking(record.id);
              await EmailService.sendBookingRejectionEmail(email, name);
              console.log(`Rejection email sent to ${email}`);
            }
            continue;
          }

          // Process successful booking
          await Payment.completeROIIFreeAdminBooking(record.id);
          await Class.updateClassSeatsForBooking(classId, seatsPurchased);

          // Sync to Webflow CMS (Payment CMS)
          try {
            const PaymentModel = require('../models/Payment');
            const ClassModel = require('../models/Class');
            const PurchaseRecordSyncService = require('../services/purchaseRecordSyncService');
            const WebflowService = require('../services/webflowService');
            const updatedPaymentRecord = await PaymentModel.getPaymentRecordById(record.id);
            const classRecord = await ClassModel.getClassById(classId);
            if (updatedPaymentRecord && classRecord && classRecord.fields) {
              await PurchaseRecordSyncService.pushPurchaseRecordToWebflow(updatedPaymentRecord, classRecord.fields);
              // Also update class seats in Webflow
              const fieldId = classRecord.fields['Field ID'];
              const updatedRemainingSeats = parseInt(classRecord.fields['Number of seats remaining'], 10) || 0;
              await WebflowService.updateWebflowItemsByFieldId(fieldId, updatedRemainingSeats);
            }
          } catch (webflowError) {
            console.error('Error syncing payment record to Webflow:', webflowError.message);
          }

          // --- Create Registration Record in base2 and base3, then update Payment record ---
          let regRecordId2 = null;
          let regRecordId3 = null;
          // Fix Client ID for base2
          const memberIdValue = record.get('Member ID (from User ID)');
          const clientId = Array.isArray(memberIdValue) ? memberIdValue[0] : (memberIdValue || '');

          // 1. Create registration record in base2
          try {
            const created = await base2('Registration Records').create([{
              fields: {
                "Client ID": clientId,
                "Name": name,
                "Purchased Class name": classname,
                "Email": email,
                "Class Details": record.get("Purchased Class url") || record.get("class-url-roii") || '',
                "Guest Details": [], // will update after guest creation
                "Number of seat": seatsPurchased.toString(),
                "Self Registration ": "False", // changed from boolean to string
                "Main Airtable Base Record ID": record.id,
                "Booked/Cancelled": "Booked"
              }
            }]);
            regRecordId2 = created[0].id;
            console.log(`Created base2 registration record: ${regRecordId2}`);
          } catch (err) {
            console.error('Failed to add ROII registration to base2:', err.message);
          }
          // 2. Create registration record in base3
          try {
            const created = await base3('Registration Records').create([{
              fields: {
                "Client ID": clientId,
                "Name": name,
                "Purchased Class name": classname,
                "Email": email,
                "Class Details ": record.get("Purchased Class url") || record.get("class-url-roii") || '',
                "Guest details": [],
                "Number of seat ": seatsPurchased.toString(),
                "Self Register ": "False", // changed from boolean to string
                "Main Airtable Base Record ID ": record.id,
                "Booked/Cancelled ": "Booked"
              }
            }]);
            regRecordId3 = created[0].id;
            console.log(`Created base3 registration record: ${regRecordId3}`);
          } catch (err) {
            console.error('Failed to add ROII registration to base3:', err.message);
          }
          // 3. Update Payment Records table with base2 and base3 record IDs
          if (regRecordId2 || regRecordId3) {
            try {
              const updateFields = {};
              if (regRecordId2) {
                updateFields["ROII class Registration Airtbale Record ID"] = regRecordId2;
              }
              if (regRecordId3) {
                updateFields["ROII Member Activity Airtbale Record ID "] = regRecordId3;
              }
              await Payment.updatePaymentRecord(record.id, updateFields);
              console.log(`Updated Payment Records with base2 ID: ${regRecordId2}, base3 ID: ${regRecordId3}`);
            } catch (updateErr) {
              console.error('Failed to update Payment Records with base2/base3 IDs:', updateErr.message);
            }
          }

          // 4. Create guest records in each base, referencing the registration record
          // Fetch guest data from Multiple Class Registration table
          const multipleClassRegIds = record.get('Multiple Class Registration') || [];
          const guestIds2 = [];
          const guestIds3 = [];
          const classFieldId = linkedClass.fields['Field ID'];
          const { base, TABLES } = require('../config/database');
          for (const regId of multipleClassRegIds) {
            try {
              // Fetch the Multiple Class Registration record
              const regRecord = await base(TABLES.MULTIPLE_CLASS_REGISTRATION).find(regId);
              const guest = regRecord.fields;

              // Prepare guest fields for base2
              const guestFields2 = {
                "Name": guest["Name"],
                "Email": guest["Email"],
                "Phone Number": guest["Phone Number"],
                "Time Stamp": guest["Time Stamp"],
                "Purchased class Airtable ID": String(classFieldId),
                "Registration Records": regRecordId2 ? [regRecordId2] : [],
                "Booked/Cancelled ": "Booked"
              };
              // Prepare guest fields for base3
              const guestFields3 = {
                "Name": guest["Name"],
                "Email": guest["Email"],
                "Phone Number": guest["Phone Number"],
                "Time Stamp": guest["Time Stamp"],
                "Purchased class Airtable ID": String(classFieldId),
                "Registered By": regRecordId3 ? [regRecordId3] : [],
                "Booked/Cancelled": "Booked"
              };
              // Insert into base2
              if (regRecordId2) {
                try {
                  const created = await base2('Guest Details').create([{ fields: guestFields2 }]);
                  guestIds2.push(created[0].id);
                } catch (err) {
                  console.error('Failed to add guest to base2:', err.message);
                }
              }
              // Insert into base3
              if (regRecordId3) {
                try {
                  const created = await base3('Guest details').create([{ fields: guestFields3 }]);
                  guestIds3.push(created[0].id);
                } catch (err) {
                  console.error('Failed to add guest to base3:', err.message);
                }
              }
            } catch (err) {
              console.error('Failed to fetch Multiple Class Registration record:', err.message);
            }
          }
          // Update registration records with guest IDs
          if (regRecordId2 && guestIds2.length > 0) {
            try {
              await base2('Registration Records').update(regRecordId2, { 'Guest Details': guestIds2 });
            } catch (err) {
              console.error('Failed to update base2 registration with guest IDs:', err.message);
            }
          }
          if (regRecordId3 && guestIds3.length > 0) {
            try {
              await base3('Registration Records').update(regRecordId3, { 'Guest details': guestIds3 });
            } catch (err) {
              console.error('Failed to update base3 registration with guest IDs:', err.message);
            }
          }

          // Update multiple class registrations
          for (const multipleClassId of multipleClassRegistrationIds) {
            await Payment.updateMultipleClassRegistrationStatus(multipleClassId, "ROII Free");
          }

          // Send confirmation email
          await EmailService.sendROIIFreeBookingConfirmationEmail(email, name, classname, description, seatsPurchased, location);
          console.log(`Confirmation email sent to ${email}`);

        } catch (error) {
          logError(`Processing ROII-free admin booking record ${record.id}`, error);
        }
      }
    } catch (error) {
      logError("Processing ROII-free admin bookings", error);
    }
  }

  // Process seat additions/reductions
  static async processSeatUpdates() {
    try {
      console.log("Processing seat updates...");
      const records = await Class.getClassesForSeatUpdate();

      for (const record of records) {
        try {
          const fields = record.fields;
          const recordId = record.id;

          const currentSeats = parseInt(fields['Number of seats '] || 0, 10);
          const currentRemaining = parseInt(fields['Number of seats remaining'] || 0, 10);
          const additionalSeat = parseInt(fields['Additional seat'] || "0", 10);
          const reduceSeat = parseInt(fields['Reduce Seat '] || "0", 10);

          console.log(`Seat update details for record ${recordId}:`, {
            currentSeats,
            currentRemaining,
            additionalSeat,
            reduceSeat,
            additionalSeatType: typeof additionalSeat,
            reduceSeatType: typeof reduceSeat
          });

          if (additionalSeat > 0 || reduceSeat > 0) {
            console.log(`Processing seat update for record: ${recordId}`);

            // Check if reducing seats would result in negative remaining seats
            if (reduceSeat > 0 && currentRemaining < reduceSeat) {
              console.log(`Skipping seat reduction for record: ${recordId}. Current remaining seats: ${currentRemaining}, Attempted reduction: ${reduceSeat}. Cannot reduce more seats than currently available.`);
              continue;
            }

            const newTotalSeats = Math.max(currentSeats + additionalSeat - reduceSeat, 0);
            const newRemainingSeats = Math.max(currentRemaining + additionalSeat - reduceSeat, 0);

            console.log(`Calculated new values:`, {
              newTotalSeats,
              newRemainingSeats,
              calculation: `${currentSeats} + ${additionalSeat} - ${reduceSeat} = ${newTotalSeats}`
            });

            await Class.updateAdminClassSeats(recordId, newRemainingSeats, newTotalSeats);
            console.log(`Seat update completed for record: ${recordId}`);
          } else {
            console.log(`No seat changes needed for record: ${recordId} (additionalSeat: ${additionalSeat}, reduceSeat: ${reduceSeat})`);
          }
        } catch (error) {
          logError(`Processing seat update for record ${record.id}`, error);
        }
      }
    } catch (error) {
      logError("Processing seat updates", error);
    }
  }

  // Create discount coupons
  static async createDiscountCoupons() {
    try {
      console.log("Creating discount coupons...");
      const records = await Class.getClassesForCouponCreation();

      for (const record of records) {
        try {
          const discountPercentage = record.get('% Discounts');
          const memberPriceId = record.get('Member Price ID');
          const nonMemberPriceId = record.get('Non-Member Price ID');
          const maxDiscountedSeats = record.get('Maximum discounted seats');

          if (discountPercentage && memberPriceId && nonMemberPriceId) {
            const couponInfo = await StripeService.createDiscountCoupon(
              discountPercentage,
              memberPriceId,
              nonMemberPriceId,
              maxDiscountedSeats
            );

            await Class.updateClassWithCoupon(record.id, couponInfo.generatedCode);
            console.log(`Coupon created for record: ${record.id}`);
          }
        } catch (error) {
          logError(`Creating coupon for record ${record.id}`, error);
        }
      }
    } catch (error) {
      logError("Creating discount coupons", error);
    }
  }

  // Helper method to check if payment is Stripe payment
  static isStripePayment(paymentId) {
    return typeof paymentId === "string" && paymentId.startsWith("pi_");
  }

  // Manual trigger for admin bookings processing
  static async triggerAdminBookings(req, res) {
    try {
      console.log("Manual admin bookings processing triggered");
      await AdminController.processAdminBookings();
      return res.status(200).json({ 
        message: "Admin bookings processing completed successfully",
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logError("Manual admin bookings processing", error);
      return res.status(500).json({ 
        message: "Error processing admin bookings",
        error: error.message 
      });
    }
  }

  // Manual trigger for seat updates processing
  static async triggerSeatUpdates(req, res) {
    try {
      console.log("Manual seat updates processing triggered");
      await AdminController.processSeatUpdates();
      return res.status(200).json({ 
        message: "Seat updates processing completed successfully",
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logError("Manual seat updates processing", error);
      return res.status(500).json({ 
        message: "Error processing seat updates",
        error: error.message 
      });
    }
  }

  // Manual trigger for discount coupons creation
  static async triggerDiscountCoupons(req, res) {
    try {
      console.log("Manual discount coupons creation triggered");
      await AdminController.createDiscountCoupons();
      return res.status(200).json({ 
        message: "Discount coupons creation completed successfully",
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logError("Manual discount coupons creation", error);
      return res.status(500).json({ 
        message: "Error creating discount coupons",
        error: error.message 
      });
    }
  }

  // Manual trigger for all admin operations
  static async triggerAllAdminOperations(req, res) {
    try {
      console.log("Manual all admin operations triggered");
      
      // Process all operations sequentially
      await AdminController.processAdminBookings();
      await AdminController.processSeatUpdates();
      await AdminController.createDiscountCoupons();
      
      return res.status(200).json({ 
        message: "All admin operations completed successfully",
        operations: [
          "Admin bookings processing",
          "Seat updates processing", 
          "Discount coupons creation"
        ],
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logError("Manual all admin operations", error);
      return res.status(500).json({ 
        message: "Error processing admin operations",
        error: error.message 
      });
    }
  }
}

module.exports = AdminController; 