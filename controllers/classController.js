const Member = require('../models/Member');
const Class = require('../models/Class');
const Payment = require('../models/Payment');
const StripeService = require('../services/stripeService');
const EmailService = require('../services/emailService');
const WebflowService = require('../services/webflowService');
const PurchaseRecordSyncService = require('../services/purchaseRecordSyncService');
const { base, base2, base3, TABLES } = require('../config/database');
const { logError } = require('../utils/helpers');

class ClassController {
  // Submit class registration (paid)
  static async submitClass(req, res) {
    const {
      SignedMemberName,
      signedmemberemail,
      timestampField,
      priceId,
      numberOfSeats,
      ...fields
    } = req.body;

    try {
      // Validate inputs
      if (!priceId || typeof priceId !== 'string' || !numberOfSeats || isNaN(numberOfSeats) || numberOfSeats <= 0) {
        return res.status(400).send({ message: 'Invalid price ID or seat count.' });
      }

      // Calculate total payment
      const totalPayment = numberOfSeats * parseFloat(fields.pricePerSeat || 0);
      if (totalPayment <= 0) {
        return res.status(400).send({ message: 'Invalid total payment amount.' });
      }

      // Validate Member ID
      const userId = fields['field-2'];
      if (!userId) {
        return res.status(400).send({ message: 'User ID is required and must be a valid Member ID.' });
      }

      const validMemberId = await Member.validateMemberId(userId);

      // Get class record
      const airID = fields['airtable-id'];
      const biawClassesTables = await base(TABLES.BIAW_CLASSES)
        .select({
          filterByFormula: `{Field ID} = '${airID}'`,
          maxRecords: 1,
        })
        .firstPage();

      if (biawClassesTables.length === 0) {
        return res.status(500).send({ message: 'No matching class found for the provided Airtable ID.' });
      }

      const biawClassId = biawClassesTables[0].id;

      // Create seat records
      const seatRecords = [];
      const seatRecordIds = [];
      let seatCount = 0;

      for (let i = 1; i <= 10; i++) {
        const name = fields[`P${i}-Name`];
        const email = fields[`P${i}-Email`];
        const phone = fields[`P${i}-Phone-number`] || fields[`P${i}-Phone-Number`];

        if (!name && !email && !phone) continue;

        seatCount++;

        // Extract CESCL-specific fields for this participant
        const address = i === 1 ? (fields['Address'] || '') : (fields[`A${i}-Address`] || '');
        const companyName = fields[`Company-Name-${i}`] || '';
        const oldCertificateNumber = fields[`certify-number-${i}`] || '';

        const seatRecord = {
          Name: name || "",
          Email: email || "",
          "Phone Number": phone || "",
          "Time Stamp": timestampField,
          "Purchased class Airtable ID": airID,
          "Payment Status": "Pending",
          "Biaw Classes": [biawClassId],
          "Address": address,
          "Company Name": companyName,
          "Old CESCL certificate number": oldCertificateNumber,
        };

        const createdSeatRecord = await base(TABLES.MULTIPLE_CLASS_REGISTRATION).create(seatRecord);
        seatRecords.push(seatRecord);
        seatRecordIds.push(createdSeatRecord.id);
      }

      // Determine self-purchase value from checkbox
      const isSelfPurchase = fields.checkbox === "on" ? "true" : "false";

      // Create payment record
      const paymentRecord = {
        "Name": SignedMemberName,
        "Email": signedmemberemail,
        "Member": [validMemberId],
        "Airtable id": airID,
        "Client name": SignedMemberName,
        "Payment Status": "Pending",
        "Biaw Classes": [biawClassId],
        "Time Stamp":timestampField,
        "Multiple Class Registration": seatRecordIds,
        "Number of seat Purchased": String(seatCount),
        "Booking Type": "User booked",
        "ROII member": "No",
        "Purchased Class url": fields['class-url'],
        "Self Purchase": isSelfPurchase,
      };

      const paymentCreatedRecord = await Payment.createPaymentRecord(paymentRecord);

      // // Sync to Webflow CMS (Payment CMS)
      // if (biawClassId) {
      //   // Get the class details for Webflow sync
      //   const classRecord = await base(TABLES.BIAW_CLASSES).find(biawClassId);
      //   if (classRecord && classRecord.fields) {
      //     await PurchaseRecordSyncService.pushPurchaseRecordToWebflow(paymentCreatedRecord, classRecord.fields);
      //   }
      // }

      // Create Stripe checkout session
      // const session = await StripeService.createCheckoutSession(
      //   [{ price: priceId, quantity: numberOfSeats }],
      //   'https://biaw.com/thank-you',
      //   'https://biaw.com/payment-declined',
      //   paymentCreatedRecord.id,
      //   {
      //     signedmemberemail,
      //     SignedMemberName,
      //     seatCount,
      //     totalPayment,
      //     class: 'classmodule'
      //   },
      // );

      const session = await StripeService.createCheckoutSession(
        [{ price: priceId, quantity: numberOfSeats }],
        'https://biaw.com/thank-you',
        'https://biaw.com/payment-declined',
        paymentCreatedRecord.id,
        {
          signedmemberemail,
          SignedMemberName,
          seatCount,
          totalPayment,
          class: 'classmodule'
        },
        biawClassesTables[0].fields, // Pass classDetails
        { signedmemberemail, SignedMemberName } // Pass userDetails
      );

      res.status(200).send({
        message: 'Class registered successfully',
        records: seatRecords,
        paymentRecord: paymentCreatedRecord,
        checkoutUrl: session.url,
      });
    } catch (error) {
      console.error('Error:', error);
      res.status(500).send({
        message: 'Error registering class',
        error: error.message,
      });
    }
  }

  // Register class (ROII free)
  static async registerClass(req, res) {
    const { memberid, ...fields } = req.body;
    const timestampField = Math.floor(Date.now() / 1000).toString();

    try {
      // Validate Member ID
      const validMemberId = await Member.validateMemberId(memberid);

      const seatRecords = [];
      const seatRecordIds = [];
      const registeredNames = [];
      let seatCount = 0;

      // Process participants
      for (let i = 1; i <= 10; i++) {
        // Updated: Check for both possible field names for robustness
        const Rname = fields[`Roii-P-${i}-Name`] || fields[`P-${i}-Name`] || fields[`P${i}-Name-2`] || "";
        const Remail = fields[`Roii-P-${i}-Email`] || fields[`P-${i}-Email`] || fields[`P${i}-Email-2`] || "";
        const Rphone = fields[`Roii-P-${i}-Phone-Number`] || fields[`P-${i}-Phone-Number`] || fields[`P${i}-Phone-Number-2`] || "";
        const airID = fields['airtable-id'];

        if (!Rname && !Remail && !Rphone) continue;

        if (Rname) seatCount++;

        const biawClassesTables = await base(TABLES.BIAW_CLASSES)
          .select({
            filterByFormula: `{Field ID} = ${airID}`,
            maxRecords: 1,
          })
          .firstPage();

        if (biawClassesTables.length === 0) {
          return res.status(500).send({ message: "No matching class found for the provided Airtable ID." });
        }

        const biawClassIds = biawClassesTables[0].id;

        // Extract CESCL-specific fields for this participant
        const address = i === 1 ? (fields['Address'] || '') : (fields[`A${i}-Address`] || '');
        const companyName = fields[`Company-Name-${i}`] || '';
        const oldCertificateNumber = fields[`certify-number-${i}`] || '';

        const seatRecord = {
          "Name": Rname || "",
          "Email": Remail || "",
          "Phone Number": Rphone || "",
          "Time Stamp": timestampField,
          "Purchased class Airtable ID": airID,
          "Biaw Classes": [biawClassIds],
          "Payment Status": "ROII Free",
          "Address": address,
          "Company Name": companyName,
          "Old CESCL certificate number": oldCertificateNumber,
        };

        seatRecords.push(seatRecord);
      }

      // Create seat records
      const createdRecords = [];
      for (const record of seatRecords) {
        const createdRecord = await base(TABLES.MULTIPLE_CLASS_REGISTRATION).create(record);
        createdRecords.push(createdRecord);
        seatRecordIds.push(createdRecord.id);
        registeredNames.push(record["Name"]);
      }

      // Update class seats
      const biawClassesTable = await base(TABLES.BIAW_CLASSES)
        .select({
          filterByFormula: `{Field ID} = '${fields['airtable-id']}'`,
          maxRecords: 1,
        })
        .firstPage();

      if (biawClassesTable.length === 0) {
        return res.status(500).send({ message: "No matching class found for the provided Airtable ID." });
      }

      const biawClassRecord = biawClassesTable[0];
      const biawClassId = biawClassRecord.id;

      let currentSeatsRemaining = parseInt(biawClassRecord.fields["Number of seats remaining"], 10);
      let totalPurchasedSeats = parseInt(biawClassRecord.fields["Total Number of Purchased Seats"] || "0", 10);
      const classlocation = biawClassRecord.fields["Local Association Name (from Class Location)"]?.[0] || "No details provided";

      if (currentSeatsRemaining < seatCount) {
        return res.status(400).send({ message: "Not enough seats available for this class." });
      }

      const updatedSeatsRemaining = currentSeatsRemaining - seatCount;
      const updatedTotalPurchasedSeats = totalPurchasedSeats + seatCount;

      await Class.updateClassSeats(biawClassId, updatedSeatsRemaining, updatedTotalPurchasedSeats);

      // Sync remaining seats to Webflow CMS in real-time
      try {
        await WebflowService.updateRemainingSeatsForClass(fields['airtable-id'], updatedSeatsRemaining);
      } catch (webflowError) {
        console.error('Error syncing remaining seats to Webflow:', webflowError.message);
        // Don't fail the entire process if Webflow sync fails
      }

      const signEmail = fields['roii-signedmemberemail'];
      const signName = fields["roii-signed-member-name"];

      // Determine self-purchase value from checkbox
      const isSelfPurchase = fields.checkbox === "on" ? "true" : "false";

      // Create payment record
      const paymentRecord = {
        "Name": signName,
        "Email": signEmail,
        "Member": [validMemberId],
        "Airtable id": fields['airtable-id'],
        "Client name": signName,
        "Payment Status": "ROII-Free",
        "Biaw Classes": [fields['airtable-id']],
        "Multiple Class Registration": seatRecordIds,
        "Number of seat Purchased": String(seatCount),
        "Biaw Classes": [biawClassId],
        "Booking Type": "User booked",
        "ROII member": "Yes",
        "Purchased Class url": fields["class-url-2"]|| fields["class-url-roii"],
        "Self Purchase": isSelfPurchase,
        "Initial Payment status (RoII, Paid, Pending)":"ROII-Free"
      };

      const paymentCreatedRecord = await Payment.createPaymentRecord(paymentRecord);

      // Fetch the updated payment record from Airtable
      const updatedRecord = await Payment.getPaymentRecordById(paymentCreatedRecord.id);

      // Sync to Webflow CMS (Payment CMS)
      if (biawClassRecord) {
        try {
          const webflowItemId = await PurchaseRecordSyncService.pushPurchaseRecordToWebflow(updatedRecord, biawClassRecord.fields);
          
          // Update the Airtable payment record with the Webflow item ID
          if (webflowItemId) {
            await Payment.updatePaymentRecord(paymentCreatedRecord.id, {
              "Webflow payment record ID": webflowItemId
            });
            console.log(`Updated Airtable payment record with Webflow item ID: ${webflowItemId}`);
          }
        } catch (webflowError) {
          console.error('Error syncing to Webflow CMS:', webflowError.message);
        }
      }

      // Send confirmation email
      await EmailService.sendROIIClassConfirmation(
        signEmail,
        signName,
        biawClassRecord.fields['Name'],
        biawClassRecord.fields['Description'],
        seatCount,
        fields["class-url-2"],
        classlocation
      );

      // Also add to additional Airtable bases (base2 and base3)
      // 1. Create main registration record in each base
      let regRecordId2 = null;
      let regRecordId3 = null;
      const classFieldId = biawClassRecord.fields['Field ID'];
      try {
        const created = await base2('Registration Records').create([{ fields: {
          "Client ID": memberid,
          "Name": signName,
          "Purchased Class name": biawClassRecord.fields['Name'],
          "Email": signEmail,
          "Class Details": fields["class-url-2"] || fields["class-url-roii"],
          "Guest Details": [], // will update after guest creation
          "Number of seat": seatCount.toString(),
          "Self Registration ": isSelfPurchase,
          "Main Airtable Base Record ID": paymentCreatedRecord.id,
          "Booked/Cancelled": "Booked"
        }}]);
        regRecordId2 = created[0].id;
        console.log(`Created base2 registration record: ${regRecordId2}`);
      } catch (err) {
        console.error('Failed to add ROII registration to base2:', err.message);
      }
      try {
        const created = await base3('Registration Records').create([{ fields: {
          "Client ID": memberid,
          "Name": signName,
          "Purchased Class name": biawClassRecord.fields['Name'],
          "Email": signEmail,
          "Class Details ": fields["class-url-2"] || fields["class-url-roii"],
          "Guest details": [], // will update after guest creation
          "Number of seat ": seatCount.toString(),
          "Self Register ": isSelfPurchase,
          "Main Airtable Base Record ID ": paymentCreatedRecord.id,
          "Booked/Cancelled ": "Booked"
        }}]);
        regRecordId3 = created[0].id;
        console.log(`Created base3 registration record: ${regRecordId3}`);
      } catch (err) {
        console.error('Failed to add ROII registration to base3:', err.message);
      }

      // Update Payment Records table with base2 and base3 record IDs
      if (regRecordId2 || regRecordId3) {
        try {
          const updateFields = {};
          if (regRecordId2) {
            updateFields["ROII class Registration Airtbale Record ID"] = regRecordId2;
          }
          if (regRecordId3) {
            updateFields["ROII Member Activity Airtbale Record ID "] = regRecordId3;
          }
          
          await Payment.updatePaymentRecord(paymentCreatedRecord.id, updateFields);
          console.log(`Updated Payment Records with base2 ID: ${regRecordId2}, base3 ID: ${regRecordId3}`);
        } catch (updateErr) {
          console.error('Failed to update Payment Records with base2/base3 IDs:', updateErr.message);
        }
      }

      // 2. Create guest records in each base, referencing the registration record
      for (const guest of seatRecords) {
        // Prepare guest fields for base2
        const guestFields2 = {
          "Name": guest.Name,
          "Email": guest.Email,
          "Phone Number": guest["Phone Number"],
          "Time Stamp": guest["Time Stamp"],
          "Purchased class Airtable ID": String(classFieldId),
          "Registration Records": regRecordId2 ? [regRecordId2] : [],
          "Booked/Cancelled ": "Booked"
        };
        // Prepare guest fields for base3
        const guestFields3 = {
          "Name": guest.Name,
          "Email": guest.Email,
          "Phone Number": guest["Phone Number"],
          "Time Stamp": guest["Time Stamp"],
          "Purchased class Airtable ID": String(classFieldId),
          "Registered By": regRecordId3 ? [regRecordId3] : [],
          "Booked/Cancelled": "Booked"
        };
        // Insert into base2
        if (regRecordId2) {
          try {
            await base2('Guest Details').create([{ fields: guestFields2 }]);
          } catch (err) {
            console.error('Failed to add guest to base2:', err.message);
          }
        }
        // Insert into base3
        if (regRecordId3) {
          try {
            await base3('Guest details').create([{ fields: guestFields3 }]);
          } catch (err) {
            console.error('Failed to add guest to base3:', err.message);
          }
        }
      }

      // Emails last: member confirmation + admin alert
      const classDateRoii = biawClassRecord.fields['Date'] || '';
      const startTimeRoii = biawClassRecord.fields['Start time'] || '';
      const instructorRoii = biawClassRecord.fields['Instructor Name (from Instructors)'];
      const instructorDisplayRoii = Array.isArray(instructorRoii)
        ? instructorRoii.filter(Boolean).join(', ')
        : instructorRoii || '—';

      const locationTextRoii =
        biawClassRecord.fields['Location'] ||
        [
          biawClassRecord.fields['Local Association Name (from Class Location)']?.[0],
          biawClassRecord.fields['City (from Class Location)'],
        ]
          .filter(Boolean)
          .join(', ') ||
        classlocation;

      let userTypeRoii = '';
      try {
        const memberRow = await base(TABLES.MEMBERS).find(validMemberId);
        const rawUser = memberRow.fields['User'];
        userTypeRoii =
          rawUser && typeof rawUser === 'object' && 'name' in rawUser
            ? rawUser.name
            : rawUser || '';
      } catch (memberLookupErr) {
        logError('ROII admin alert: member User field', memberLookupErr);
      }

      let registrationDateRoii = '';
      const submittedAt = fields.submittedAt || fields['submitted-at'];
      if (submittedAt) {
        const d = new Date(submittedAt);
        if (!isNaN(d.getTime())) {
          registrationDateRoii = d.toLocaleDateString('en-US', {
            month: '2-digit',
            day: '2-digit',
            year: 'numeric',
          });
        }
      }
      if (!registrationDateRoii) {
        const fromStamp = new Date(parseInt(timestampField, 10) * 1000);
        if (!isNaN(fromStamp.getTime())) {
          registrationDateRoii = fromStamp.toLocaleDateString('en-US', {
            month: '2-digit',
            day: '2-digit',
            year: 'numeric',
          });
        }
      }
      if (!registrationDateRoii) {
        registrationDateRoii = new Date().toLocaleDateString('en-US', {
          month: '2-digit',
          day: '2-digit',
          year: 'numeric',
        });
      }

      let roiiFirst = '';
      let roiiLast = '';
      if (signName) {
        const parts = String(signName).trim().split(/\s+/);
        roiiFirst = parts[0] || '';
        roiiLast = parts.slice(1).join(' ') || '';
      }

      try {
        await EmailService.sendNewClassRegistrationAdminAlert({
          className: biawClassRecord.fields['Name'],
          classDate: classDateRoii,
          startTime: startTimeRoii,
          firstName: roiiFirst,
          lastName: roiiLast,
          userType: userTypeRoii,
          instructorName: instructorDisplayRoii,
          mode: biawClassRecord.fields['Product Type'],
          locationText: locationTextRoii,
          paymentStatus: 'Free',
          registrationDate: registrationDateRoii,
          seatCount,
        });
      } catch (adminEmailErr) {
        logError('Admin ROII class registration alert (non-fatal)', adminEmailErr);
      }

      res.status(200).send({
        message: "Class registered successfully",
        records: createdRecords,
        paymentRecord: paymentCreatedRecord,
      });
    } catch (error) {
      console.error("Error adding records to Airtable:", error);
      res.status(500).send({ message: "Error registering class", error: error });
    }
  }
}

module.exports = ClassController; 