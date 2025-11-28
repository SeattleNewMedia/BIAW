const Waitlist = require('../models/Waitlist');
const Class = require('../models/Class');
const EmailService = require('../services/emailService');
const { base, TABLES } = require('../config/database');
const { logError } = require('../utils/helpers');

class WaitlistController {
  // Add to waitlist
  static async addToWaitlist(req, res) {
    const { loginDetails, classId, loginMember, className, instructor, classur } = req.body;

    // Validation
    if (!loginDetails || !classId || !loginMember || !className || !instructor) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    try {
      // Get class record
      const classRecords = await base(TABLES.BIAW_CLASSES)
        .select({
          filterByFormula: `{Field ID} = '${classId}'`,
          maxRecords: 1,
        })
        .firstPage();

      if (classRecords.length === 0) {
        console.error("No matching record found in Biaw Classes table");
        return res.status(404).send({ message: "No matching class found for the provided Airtable ID." });
      }

      const classRecordId = classRecords[0].id;

      // Create waitlist entry
      const waitlistData = {
        'Mail ID': loginDetails,
        'Client ID': loginMember,
        'Class Name': className,
        'Instructor': instructor,
        'Class Airtable ID': classId,
        'Class Airtable\'s ID': [classRecordId],
        'Class URL': classur,
      };

      const newRecord = await Waitlist.createWaitlistEntry(waitlistData);

      // Send confirmation emails
      await EmailService.sendWaitlistEntryConfirmation(loginDetails, className, instructor, classur);

      res.status(201).json({ 
        message: 'Record created and emails sent successfully.', 
        record: newRecord 
      });
    } catch (err) {
      console.error('Error saving to Airtable:', err);
      res.status(500).json({ message: 'Error saving to Airtable.', error: err.message });
    }
  }
}

module.exports = WaitlistController; 