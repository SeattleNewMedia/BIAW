const { base, TABLES } = require('../config/database');
const { logError } = require('../utils/helpers');

class Class {
  // Update class record with Stripe and Webflow information
  static async updateClassRecord(recordId, stripeInfo, generatedCode2, itemIds, classDetails, nonMemberUrl = null) {
    try {
      if (!recordId) {
        throw new Error("Invalid recordId: recordId is undefined or empty.");
      }

      const numberOfSeats = String(classDetails["Number of seats "] ?? "0");

      await base(TABLES.BIAW_CLASSES).update(recordId, {
        "Item Id": itemIds?.[0] ?? "Unknown Member Price ID",
        "Item Id 2": itemIds?.[1] ?? "Unknown Member Price ID",
        "Member Price ID": String(stripeInfo?.memberPrice?.id ?? "Unknown Member Price ID"),
        "Non-Member Price ID": String(stripeInfo?.nonMemberPrice?.id ?? "Unknown Non-Member Price ID"),
        "Coupon Code": generatedCode2 || null,
        "Publish / Unpublish": "Publish",
        "Number of seats remaining": numberOfSeats,
        "slug" : nonMemberUrl || null,
      });

      console.log("Airtable record updated successfully!");
    } catch (error) {
      console.error("Error updating Airtable Record:", {
        recordId,
        stripeInfo,
        generatedCode2,
        error: error.message,
        itemIds,
        classDetails,
        nonMemberUrl
      });
      throw error;
    }
  }

  // Get class by field ID
  static async getClassByFieldId(fieldId) {
    try {
      const records = await base(TABLES.BIAW_CLASSES)
        .select({
          filterByFormula: `{Field ID} = '${fieldId}'`,
          maxRecords: 1,
        })
        .firstPage();

      return records.length > 0 ? records[0] : null;
    } catch (error) {
      logError("Getting class by field ID", error);
      throw error;
    }
  }

  // Get class by Airtable record ID
  static async getClassById(recordId) {
    try {
      const record = await base(TABLES.BIAW_CLASSES).find(recordId);
      return record;
    } catch (error) {
      logError("Getting class by ID", error);
      throw error;
    }
  }

  // Update class seats
  static async updateClassSeats(classId, seatsRemaining, totalPurchasedSeats) {
    try {
      await base(TABLES.BIAW_CLASSES).update(classId, {
        'Number of seats remaining': String(seatsRemaining),
        'Total Number of Purchased Seats': String(totalPurchasedSeats),
      });
    } catch (error) {
      logError("Updating class seats", error);
      throw error;
    }
  }

  // Get all classes for seat synchronization
  static async getAllClasses() {
    try {
      const records = await base(TABLES.BIAW_CLASSES).select().all();
      return records;
    } catch (error) {
      logError("Getting all classes", error);
      throw error;
    }
  }

  // Get classes for seat update
  static async getClassesForSeatUpdate() {
    try {
      const records = await base(TABLES.BIAW_CLASSES)
        .select({
          filterByFormula: 'OR({Seat addition status} = "Updated", {Seat reduction status } = "Updated")'
        })
        .all();
      return records;
    } catch (error) {
      logError("Getting classes for seat update", error);
      throw error;
    }
  }

  // Get classes for coupon creation
  static async getClassesForCouponCreation() {
    try {
      const records = await base(TABLES.BIAW_CLASSES)
        .select({
          filterByFormula: `AND({% Discounts} > 0, {Coupon Code} = "", {Member Price ID} != "", {Non-Member Price ID} != "", {Publish / Unpublish} = "Update")`
        })
        .all();
      return records;
    } catch (error) {
      logError("Getting classes for coupon creation", error);
      throw error;
    }
  }

  // Update class seats for refund
  static async updateClassSeatsForRefund(memberId, seatsPurchased) {
    try {
      const classRecords = await base(TABLES.BIAW_CLASSES)
        .select({
          filterByFormula: `{Field ID} = '${memberId}'`,
          maxRecords: 1,
        })
        .firstPage();

      if (classRecords.length > 0) {
        const classRecord = classRecords[0];
        const currentRemainingSeats = parseInt(classRecord.fields["Number of seats remaining"], 10) || 0;
        const currentTotalPurchasedSeats = parseInt(classRecord.fields["Total Number of Purchased Seats"], 10) || 0;

        const updatedRemainingSeats = (currentRemainingSeats + seatsPurchased).toString();
        const updatedTotalSeats = (currentTotalPurchasedSeats - seatsPurchased).toString();

        await base(TABLES.BIAW_CLASSES).update(classRecord.id, {
          "Number of seats remaining": updatedRemainingSeats,
          "Total Number of Purchased Seats": updatedTotalSeats,
        });

        console.log(`Updated Biaw Classes record: ${classRecord.id}`);
      }
    } catch (error) {
      logError("Error updating Biaw Classes record for refund", error);
      throw error;
    }
  }

  // Update class seats for booking
  static async updateClassSeatsForBooking(classId, seatsPurchased) {
    try {
      if (!classId) {
        throw new Error("Class ID is required");
      }

      if (!seatsPurchased || seatsPurchased <= 0) {
        throw new Error("Seats purchased must be greater than 0");
      }

      console.log(`Attempting to update class seats for classId: ${classId}, seatsPurchased: ${seatsPurchased}`);

      const classRecord = await base(TABLES.BIAW_CLASSES).find(classId);

      if (!classRecord) {
        throw new Error(`Class record not found for ID: ${classId}`);
      }

      console.log(`Found class record:`, classRecord.fields);

      const currentRemainingSeats = parseInt(classRecord.fields['Number of seats remaining'], 10) || 0;
      const currentTotalPurchasedSeats = parseInt(classRecord.fields['Total Number of Purchased Seats'], 10) || 0;

      console.log(`Current seats - Remaining: ${currentRemainingSeats}, Total Purchased: ${currentTotalPurchasedSeats}`);

      const updatedRemainingSeats = Math.max(currentRemainingSeats - seatsPurchased, 0);
      const updatedTotalSeats = currentTotalPurchasedSeats + seatsPurchased;

      console.log(`Updated seats - Remaining: ${updatedRemainingSeats}, Total Purchased: ${updatedTotalSeats}`);

      const updateData = {
        'Number of seats remaining': String(updatedRemainingSeats),
        'Total Number of Purchased Seats': String(updatedTotalSeats),
      };

      console.log(`Updating class with data:`, updateData);

      await base(TABLES.BIAW_CLASSES).update(classId, updateData);

      console.log(`Successfully updated Biaw Classes record: ${classId}`);
    } catch (error) {
      logError("Error updating Biaw Classes record for booking", error);
      console.error("Full error details:", {
        classId,
        seatsPurchased,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  // Update class with coupon
  static async updateClassWithCoupon(recordId, generatedCode) {
    try {
      await base(TABLES.BIAW_CLASSES).update(recordId, {
        'Coupon Code': generatedCode,
        "Publish / Unpublish": "Publish"
      });
      console.log(`Record updated successfully for ID: ${recordId}`);
    } catch (error) {
      logError("Updating class with coupon", error);
      throw error;
    }
  }

  // Update admin class seats (for seat additions/reductions)
  static async updateAdminClassSeats(recordId, newRemainingSeats, newTotalSeats) {
    try {
      if (!recordId) {
        throw new Error("Record ID is required");
      }

      console.log(`Updating admin class seats for recordId: ${recordId}`);
      console.log(`New values - Total Seats: ${newTotalSeats}, Remaining Seats: ${newRemainingSeats}`);

      const updateData = {
        'Number of seats ': Number(newTotalSeats),
        'Number of seats remaining': String(newRemainingSeats),
        'Additional seat': "0", // Reset to default
        'Reduce Seat ': "0", // Reset to default
        'Seat addition status': "Publish", // Mark as updated
        'Seat reduction status ': "Publish",
        'Publish / Unpublish':"Publish"
      };

      console.log(`Updating class with data:`, updateData);

      await base(TABLES.BIAW_CLASSES).update(recordId, updateData);

      // After updating the main class record, update all related class items with the same Field ID
      await Class.updateRelatedClassItems(recordId, newRemainingSeats, newTotalSeats);

      // Check and notify waitlist after seat updates
      try {
        const SchedulerService = require('../services/schedulerService');
        await SchedulerService.checkAndNotifyWaitlist();
        console.log(`Waitlist check completed after seat update for record: ${recordId}`);
      } catch (waitlistError) {
        console.error(`Error checking waitlist after seat update for record ${recordId}:`, waitlistError.message);
        // Don't fail the seat update if waitlist check fails
      }

      console.log(`Successfully updated admin class seats for record: ${recordId}`);
    } catch (error) {
      logError("Error updating admin class seats", error);
      console.error("Full error details:", {
        recordId,
        newRemainingSeats,
        newTotalSeats,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  // Update related class items with the same Field ID
  static async updateRelatedClassItems(recordId, newRemainingSeats, newTotalSeats) {
    try {
      // First, get the Field ID of the updated record
      const updatedRecord = await base(TABLES.BIAW_CLASSES).find(recordId);
      if (!updatedRecord) {
        console.log(`Record not found for ID: ${recordId}`);
        return;
      }

      const fieldId = updatedRecord.fields['Field ID'];
      if (!fieldId) {
        console.log(`No Field ID found for record: ${recordId}`);
        return;
      }

      console.log(`Looking for Webflow CMS items with Field ID: ${fieldId}`);

      // Import WebflowService to update CMS items
      const WebflowService = require('../services/webflowService');

      // Update Webflow CMS items with the same Field ID
      await WebflowService.updateWebflowItemsByFieldId(fieldId, newRemainingSeats, newTotalSeats);

      console.log(`Successfully updated Webflow CMS items for Field ID: ${fieldId}`);
    } catch (error) {
      logError("Error updating Webflow CMS items", error);
      console.error("Full error details:", {
        recordId,
        newRemainingSeats,
        error: error.message,
        stack: error.stack
      });
    }
  }
}

module.exports = Class; 