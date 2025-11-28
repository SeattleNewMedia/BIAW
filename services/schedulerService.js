const Class = require('../models/Class');
const WebflowService = require('./webflowService');
const StripeService = require('./stripeService');
const EmailService = require('./emailService');
const Waitlist = require('../models/Waitlist');
const PurchaseRecordSyncService = require('./purchaseRecordSyncService');
const CategorySyncService = require('./categorySyncService');
const { logError } = require('../utils/helpers');

class SchedulerService {
  // Initialize all scheduled tasks
  static initializeScheduledTasks() {
    console.log("Initializing scheduled tasks...");
    
    // Waitlist notifications - every 50 seconds
    // SchedulerService.scheduleWaitlistNotifications(50 * 1000);
    
    console.log("All scheduled tasks initialized");
  }

  // Schedule waitlist notifications
  // static scheduleWaitlistNotifications(intervalMs) {
  //   console.log("Starting periodic waitlist notifications...");
  //   setInterval(async () => {
  //     try {
  //       console.log(`Running waitlist notifications at ${new Date().toISOString()}`);
  //       await SchedulerService.checkAndNotifyWaitlist();
  //       console.log("Waitlist notifications completed.");
  //     } catch (error) {
  //       logError("Waitlist Notifications", error);
  //     }
  //   }, intervalMs);
  // }

  // Schedule category sync
  static scheduleCategorySync(intervalMs) {
    console.log("Starting periodic category sync...");
    setInterval(async () => {
      try {
        console.log(`Running category sync at ${new Date().toISOString()}`);
        await CategorySyncService.syncCategories();
        console.log("Category sync completed.");
      } catch (error) {
        logError("Category Sync", error);
      }
    }, intervalMs);
  }

  // Process a single class (can be called from webhook)
  static async processSingleClass(classDetails) {
    try {
      console.log(`Processing single class: ${classDetails.Name}`);

      // Create Stripe products and coupon
      const stripeInfo = await StripeService.createStripeProductsAndCoupon(classDetails);

      // Add class to Webflow CMS
      const webflowResult = await WebflowService.addClassToWebflow(classDetails, stripeInfo);
      console.log("Webflow Result:", webflowResult);

      if (!webflowResult || !webflowResult.memberId || !webflowResult.nonMemberId) {
        throw new Error(`Invalid Webflow result returned: ${JSON.stringify(webflowResult)}`);
      }

      const itemIds = [webflowResult.memberId, webflowResult.nonMemberId];

      // Update Airtable with Stripe and Webflow information
      await Class.updateClassRecord(classDetails.id, stripeInfo, stripeInfo.generatedCode2, itemIds, classDetails, webflowResult.nonMemberUrl);

      console.log(`Successfully processed single class: ${classDetails.Name}`);
      return { success: true, itemIds };
    } catch (error) {
      logError(`Processing single class: ${classDetails.Name}`, error);
      throw error;
    }
  }

  // Process class from webhook data
  static async processClassFromWebhook(webhookData) {
    try {
      console.log(`Processing class from webhook: ${webhookData.Name}`);
      
      // Validate required fields
      if (!webhookData.Name || !webhookData['Field ID']) {
        throw new Error('Missing required fields: Name or Field ID');
      }

      // Check if class already exists and has been processed (has payment links)
      const existingClass = await Class.getClassByFieldId(webhookData['Field ID']);
      if (existingClass && existingClass.fields['Member Price ID'] && existingClass.fields['Non-Member Price ID']) {
        console.log(`Class with Field ID ${webhookData['Field ID']} already has payment links, skipping processing`);
        return { success: false, message: 'Class already processed with payment links' };
      }

      // Process the class
      const result = await SchedulerService.processSingleClass(webhookData);
      console.log(`Successfully processed class from webhook: ${webhookData.Name}`);
      return result;
    } catch (error) {
      logError(`Processing class from webhook: ${webhookData.Name}`, error);
      throw error;
    }
  }

  // Check and notify waitlist
  static async checkAndNotifyWaitlist() {
    try {
      const waitlistRecords = await Waitlist.getWaitlistRecordsForNotification();
      const classDetailsCache = {};

      // Fetch class details and cache them
      for (const record of waitlistRecords) {
        const classIds = record.get('Class Airtable\'s ID');

        if (!classIds || classIds.length === 0) {
          console.warn(`Record ${record.id} in "Joint waitlist" has no valid "Class Airtable's ID".`);
          continue;
        }

        const classId = classIds[0];

        if (!classDetailsCache[classId]) {
          try {
            const classRecord = await Class.getClassById(classId);
            classDetailsCache[classId] = {
              seatsRemaining: classRecord.get('Number of seats remaining'),
              className: classRecord.get('Name'),
            };
          } catch (error) {
            console.error(`Failed to fetch class details for ID ${classId}:`, error.message);
          }
        }
      }

      // Process waitlist and send notifications
      for (const record of waitlistRecords) {
        const classIds = record.get('Class Airtable\'s ID');

        if (!classIds || classIds.length === 0) {
          console.warn(`Skipping record ${record.id}: No valid Class Airtable's ID.`);
          continue;
        }

        const classId = classIds[0];
        const email = record.get('Mail ID');
        const classURL = record.get('Class URL')

        if (!classDetailsCache[classId]) {
          console.warn(`Skipping record ${record.id}: Class details not found for ID ${classId}.`);
          continue;
        }

        const { seatsRemaining, className } = classDetailsCache[classId];

        if (seatsRemaining > 0) {
          await EmailService.sendWaitlistNotification(email, record.get('Name'), className,classURL);
          await Waitlist.markAsNotified(record.id);
        }
      }
    } catch (error) {
      logError('Checking or notifying waitlist', error);
    }
  }
}

module.exports = SchedulerService; 
 