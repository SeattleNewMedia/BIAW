const { base, TABLES } = require('../config/database');
const { logError } = require('../utils/helpers');

class Payment {
  // Get payment record by ID
  static async getPaymentRecordById(recordId) {
    try {
      // Use filterByFormula to get the specific record by ID
      const records = await base(TABLES.PAYMENT_RECORDS)
        .select({
          filterByFormula: `RECORD_ID() = '${recordId}'`,
          maxRecords: 1,
        })
        .firstPage();

      if (records.length === 0) {
        console.warn(`No payment record found with ID: ${recordId}`);
        return null;
      }

      return records[0];
    } catch (error) {
      logError("Getting payment record by ID", error);
      throw error;
    }
  }

  // Update payment record
  static async updatePaymentRecord(recordId, updateData) {
    try {
      await base(TABLES.PAYMENT_RECORDS).update(recordId, updateData);
      console.log(`Payment record (${recordId}) updated successfully.`);
    } catch (error) {
      logError("Updating payment record", error);
      throw error;
    }
  }

  // Create payment record
  static async createPaymentRecord(paymentData) {
    try {
      const record = await base(TABLES.PAYMENT_RECORDS).create(paymentData);
      return record;
    } catch (error) {
      logError("Creating payment record", error);
      throw error;
    }
  }

  // Update multiple class registration records
  static async updateMultipleClassRegistrations(registrationIds, updateData) {
    try {
      for (const registrationId of registrationIds) {
        await base(TABLES.MULTIPLE_CLASS_REGISTRATION).update(registrationId, updateData);
        console.log(`Payment Status updated for record ID ${registrationId}.`);
      }
    } catch (error) {
      logError("Updating multiple class registrations", error);
      throw error;
    }
  }

  // Get payment records for sync
  static async getPaymentRecordsForSync() {
    try {
      const records = await base(TABLES.PAYMENT_RECORDS).select().all();
      return records;
    } catch (error) {
      logError("Getting payment records for sync", error);
      throw error;
    }
  }

  // Update payment record status
  static async updatePaymentStatus(recordId, status, additionalFields = {}) {
    try {
      const updateData = {
        "Payment Status": status,
        ...additionalFields
      };
      
      await base(TABLES.PAYMENT_RECORDS).update(recordId, updateData);
    } catch (error) {
      logError("Updating payment status", error);
      throw error;
    }
  }

  // Update payment for refund
  static async updatePaymentForRefund(recordId, seatsPurchased) {
    try {
      await base(TABLES.PAYMENT_RECORDS).update(recordId, {
        "Refund Confirmation ": "Confirmed ",
        "Payment Status": "Refunded",
        "Number of seat Purchased": "0",
        "Payment Refund & Cancellation Status":"Refunded"
      });
      console.log(`Updated Airtable payment record: ${recordId}`);
    } catch (error) {
      logError("Error updating Airtable Payment record for refund", error);
      throw error;
    }
  }

  // Update payment for ROII cancellation
  static async updatePaymentForROIICancellation(recordId, seatsPurchased) {
    try {
      await base(TABLES.PAYMENT_RECORDS).update(recordId, {
        "Refund Confirmation ": "Confirmed ",
        "Payment Status": "ROII-Cancelled",
        "Number of seat Purchased": "0",
        "Payment Refund & Cancellation Status":"Refunded"
      });
      console.log(`Updated Airtable payment record: ${recordId}`);
    } catch (error) {
      logError("Error updating Airtable Payment record for ROII cancellation", error);
      throw error;
    }
  }

  // Update payment for cancellation without refund
  static async updatePaymentForCancellationWithoutRefund(recordId, seatsPurchased) {
    try {
      await base(TABLES.PAYMENT_RECORDS).update(recordId, {
        "Refund Confirmation ": "Confirmed ",
        "Payment Status": "Cancelled Without Refund",
        "Number of seat Purchased": "0",
        "Payment Refund & Cancellation Status":"Refunded"
      });
      console.log(`Updated Airtable payment record: ${recordId}`);
    } catch (error) {
      logError("Error updating Airtable Payment record for cancellation without refund", error);
      throw error;
    }
  }

  // Update multiple class registration status
  static async updateMultipleClassRegistrationStatus(registrationId, status) {
    try {
      // If status is "Cancelled Without Refund", set Payment Status to "Refunded"
      const paymentStatus = status === "Cancelled Without Refund" ? "Refunded" : status;
      
      await base(TABLES.MULTIPLE_CLASS_REGISTRATION).update(registrationId, {
        "Payment Status": paymentStatus,
      });
      console.log(`Updated Payment Status for Multiple Class Registration ID: ${registrationId} to ${paymentStatus}`);
    } catch (error) {
      logError(`Failed to update Multiple Class Registration ID: ${registrationId}`, error);
      throw error;
    }
  }

  // Get paid admin bookings
  static async getPaidAdminBookings() {
    try {
      const records = await base(TABLES.PAYMENT_RECORDS)
        .select({
          filterByFormula: `AND(
            {Booking Type} = "Admin booked",
            {Payment Status} = "Paid",
            {Member ID (from User ID)} != "",
            {Biaw Classes} != "",
            {Email} != "",
            NOT({Field ID (from Biaw Classes)} = ""),
            OR(
              {Admin class booking status} = "",
              {Admin class booking status} = "Rejected"
            )
          )`
        })
        .all();
      return records;
    } catch (error) {
      logError("Getting paid admin bookings", error);
      throw error;
    }
  }

  // Get ROII-free admin bookings
  static async getROIIFreeAdminBookings() {
    try {
      const records = await base(TABLES.PAYMENT_RECORDS)
        .select({
          filterByFormula: `AND(
            {Booking Type} = "Admin booked",
            {Payment Status} = "ROII-Free",
            {Member ID (from User ID)} != "",
            {Biaw Classes} != "",
            {Email} != "",
            NOT({Field ID (from Biaw Classes)} = "")
          )`
        })
        .all();
      return records;
    } catch (error) {
      logError("Getting ROII-free admin bookings", error);
      throw error;
    }
  }

  // Reject admin booking
  static async rejectAdminBooking(recordId) {
    try {
      await base(TABLES.PAYMENT_RECORDS).update(recordId, {
        "Admin class booking status": "Rejected"
      });
      console.log(`Marked record ${recordId} as rejected`);
    } catch (error) {
      logError("Rejecting admin booking", error);
      throw error;
    }
  }

  // Complete admin booking
  static async completeAdminBooking(recordId) {
    try {
      await base(TABLES.PAYMENT_RECORDS).update(recordId, {
        'Payment Status': 'Paid',
        'ROII member': 'No',
        "Self Purchase": "false",
        "Admin class booking status": "Completed",
        "Initial Payment status (RoII, Paid, Pending)":"Paid"
      });
      console.log(`Updated Airtable record ${recordId} with Payment Status 'Paid'`);
    } catch (error) {
      logError("Completing admin booking", error);
      throw error;
    }
  }

  // Complete ROII-free admin booking
  static async completeROIIFreeAdminBooking(recordId) {
    try {
      await base(TABLES.PAYMENT_RECORDS).update(recordId, {
        'Payment Status': 'ROII-Free',
        'ROII member': 'Yes',
        "Self Purchase": "false",
        "Admin class booking status": "Completed",
        "Initial Payment status (RoII, Paid, Pending)":"ROII-Free"
      });
      console.log(`Updated Airtable record ${recordId} with Payment Status 'ROII-Free'`);
    } catch (error) {
      logError("Completing ROII-free admin booking", error);
      throw error;
    }
  }
}

module.exports = Payment; 