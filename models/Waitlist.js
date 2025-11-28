const { base, TABLES } = require('../config/database');
const { logError } = require('../utils/helpers');

class Waitlist {
  // Get waitlist records that need notification
  static async getWaitlistRecordsForNotification() {
    try {
      const records = await base(TABLES.JOINT_WAITLIST)
        .select({
          filterByFormula: `{Notified} = "Yet to Notify"`,
        })
        .all();

      return records;
    } catch (error) {
      logError("Getting waitlist records for notification", error);
      throw error;
    }
  }

  // Mark waitlist record as notified
  static async markAsNotified(recordId) {
    try {
      await base(TABLES.JOINT_WAITLIST).update(recordId, {
        "Notified": "Notified",
      });
      console.log(`Marked record ${recordId} as notified.`);
    } catch (error) {
      logError("Marking waitlist record as notified", error);
      throw error;
    }
  }

  // Create waitlist entry
  static async createWaitlistEntry(waitlistData) {
    try {
      const record = await base(TABLES.JOINT_WAITLIST).create(waitlistData);
      return record;
    } catch (error) {
      logError("Creating waitlist entry", error);
      throw error;
    }
  }
}

module.exports = Waitlist; 