const axios = require('axios');
const { AIRTABLE_CONFIG, TABLES } = require('../config/database');
const WEBFLOW_CONFIG = require('../config/webflow');
const StripeService = require('../services/stripeService');
const { stripe } = require('../config/stripe');
const { logError } = require('../utils/helpers');

class AirtableWebhookController {
  // Handle class deletion webhook

  static async handleUnpublishWebhook(req, res) {
    try {
      const { id, fields } = req.body;
      const airtableId = id;

      if (!fields || !fields["Field ID"]) {
        return res.status(400).send("Missing required fields in the payload.");
      }

      // Fetch corresponding Webflow records using field-id
      const webflowResponse = await axios.get(`${WEBFLOW_CONFIG.baseURL}/${WEBFLOW_CONFIG.collections.CLASSES}/items`, {
        headers: WEBFLOW_CONFIG.headers
      });
      const webflowRecords = webflowResponse.data.items || [];
      const fieldId = fields["Field ID"]; // Could be string or number
      const fieldIdString = String(fieldId);
      const webflowRecordsToUpdate = webflowRecords.filter(
        (record) => String(record.fieldData?.["field-id"]) === fieldIdString
      );

      if (webflowRecordsToUpdate.length === 0) {
        return res.status(404).send("No matching Webflow records found for provided Field ID");
      }

      for (const webflowRecord of webflowRecordsToUpdate) {
        const updateURL = `${WEBFLOW_CONFIG.baseURL}/${WEBFLOW_CONFIG.collections.CLASSES}/items/${webflowRecord.id}`;
        const updateData = {
          fieldData: { "class-delete-2": "Unpublish" }
        };

        try {
          // Update staging
          await axios.patch(updateURL, updateData, { headers: WEBFLOW_CONFIG.headers });
          // Publish to live
          const publishURL = `https://api.webflow.com/v2/collections/${WEBFLOW_CONFIG.collections.CLASSES}/items/publish`;
          const publishData = { itemIds: [webflowRecord.id] };
          await axios.post(publishURL, publishData, { headers: WEBFLOW_CONFIG.headers });
        } catch (error) {
          console.error(`Error unpublishing Webflow record ID ${webflowRecord.id}:`, error.response?.data || error.message);
        }
      }

      // IMPORTANT: Do not delete Airtable record here.
      console.log(`Processed unpublish for Airtable ID: ${airtableId}`);
      res.status(200).send("Unpublish processed successfully.");
    } catch (error) {
      console.error("Error processing unpublish webhook:", error.message);
      res.status(500).send("Internal Server Error");
    }
  }

  static async handleDeleteWebhook(req, res) {
    try {
      const { id, fields } = req.body;
      const airtableId = id;

      if (!fields || !fields["Publish / Unpublish"]) {
        return res.status(400).send("Missing required fields in the payload.");
      }

      const publishStatus = fields["Publish / Unpublish"]?.name;
      console.log(`Webhook received for Airtable ID: ${airtableId}, Status: ${publishStatus}`);

      // Fetch corresponding Webflow records using field-id
      const webflowResponse = await axios.get(`${WEBFLOW_CONFIG.baseURL}/${WEBFLOW_CONFIG.collections.CLASSES}/items`, { 
        headers: WEBFLOW_CONFIG.headers 
      });
      const webflowRecords = webflowResponse.data.items || [];
      const fieldId = fields["Field ID"];
      const fieldIdString = String(fieldId);
      const webflowRecordsToUpdate = webflowRecords.filter(
        (record) => String(record.fieldData?.["field-id"]) === fieldIdString
      );

      // Handle "Delete"
      if (publishStatus === "Delete") {
        for (const webflowRecord of webflowRecordsToUpdate) {
          const updateURL = `${WEBFLOW_CONFIG.baseURL}/${WEBFLOW_CONFIG.collections.CLASSES}/items/${webflowRecord.id}`;
          const updateData = {
            fieldData: { "class-delete-2": "Delete" },
          };

          try {
            // Update staging first
            await axios.patch(updateURL, updateData, { headers: WEBFLOW_CONFIG.headers });
            console.log(`Set class-delete-2 to "Delete" for Webflow record ID ${webflowRecord.id} in staging`);
            
            // Publish to live
            const publishURL = `https://api.webflow.com/v2/collections/${WEBFLOW_CONFIG.collections.CLASSES}/items/publish`;
            const publishData = {
              itemIds: [webflowRecord.id]
            };
            await axios.post(publishURL, publishData, { headers: WEBFLOW_CONFIG.headers });
            console.log(`Published Webflow record ID ${webflowRecord.id} to live with delete status`);
          } catch (error) {
            console.error(`Error updating Webflow record ID ${webflowRecord.id}:`, error.message);
          }
        }

        // Delete the Airtable record
        try {
          await axios.delete(`${AIRTABLE_CONFIG.baseURL}/${TABLES.BIAW_CLASSES}/${airtableId}`, { 
            headers: AIRTABLE_CONFIG.headers 
          });
          console.log(`Deleted Airtable record ${airtableId}.`);
        } catch (error) {
          console.error(`Error deleting Airtable record ${airtableId}:`, error.message);
        }
      }

      res.status(200).send("Webhook processed successfully.");
    } catch (error) {
      console.error("Error processing webhook:", error.message);
      res.status(500).send("Internal Server Error");
    }
  }

  // Handle class update webhook
  static async handleUpdateWebhook(req, res) {
    const { id, fields } = req.body;

    try {
      console.log("Received data:", { id, fields });
      let airtableUpdates = {};

      // Fetch matching Webflow records using field-id
      const webflowResponse = await axios.get(`${WEBFLOW_CONFIG.baseURL}/${WEBFLOW_CONFIG.collections.CLASSES}/items`, { 
        headers: WEBFLOW_CONFIG.headers 
      });
      const webflowRecords = webflowResponse.data.items || [];
      const fieldId = fields["Field ID"];
      const fieldIdString = String(fieldId);
      const matchingWebflowRecords = webflowRecords.filter(
        (record) => String(record.fieldData?.["field-id"]) === fieldIdString
      );

      if (matchingWebflowRecords.length === 0) {
        console.warn(`No matching Webflow records found for Field ID: ${fieldId}`);
        return res.status(404).json({ error: "No matching Webflow records found" });
      }

      // Iterate over matching Webflow records
      for (const webflowRecord of matchingWebflowRecords) {
        const updates = {};

        const priceROIIName = fields["Price - ROII Participants (Select)"]?.name;
        const productTypeName = fields["Product Type"]?.name;

        // Extract images from Airtable
        const airtableImages = fields["Images"]?.map((imageObj) => imageObj.url) || [];
        const webflowImages = webflowRecord.fieldData["main-images"] || [];
        const imagesAreDifferent =
          airtableImages.length !== webflowImages.length ||
          airtableImages.some((image, index) => image !== webflowImages[index]);

        if (imagesAreDifferent) {
          updates["main-images"] = airtableImages;
        }

        const airtableBannerImages = fields["Banner image"]?.map((imageObj) => imageObj.url) || [];
        const webflowBannerImages = webflowRecord.fieldData["banner-image"] || [];
        const imagesAreDifferent1 =
          airtableBannerImages.length !== webflowBannerImages.length ||
          airtableBannerImages.some((image, index) => image !== webflowBannerImages[index]);

        if (imagesAreDifferent1) {
          updates["banner-image"] = airtableBannerImages;
        }

        // const publishUnpublishValue = fields["Publish / Unpublish"]?.name;
        
        // if (webflowRecord.fieldData["class-delete-2"] !== publishUnpublishValue) {
        //   updates["class-delete-2"] = publishUnpublishValue;
        // }
        const publishUnpublishValue = fields["Publish / Unpublish"]?.name;
        // For republish, remove the Unpublish/Delete label by clearing the field
        const desiredDeleteLabel = publishUnpublishValue === "Publish" ? "" : publishUnpublishValue;
        if (webflowRecord.fieldData["class-delete-2"] !== desiredDeleteLabel) {
          updates["class-delete-2"] = desiredDeleteLabel;
        }

        const airtableInstructorPics = fields["Instructor Pic (from Instructors)"]?.map(
          (picObj) => picObj.url
        ) || [];
        const webflowInstructorPics = webflowRecord.fieldData["instructor-pic"] || [];
        const instructorPicsAreDifferent =
          airtableInstructorPics.length !== webflowInstructorPics.length ||
          airtableInstructorPics.some((pic, index) => pic !== webflowInstructorPics[index]);

        if (instructorPicsAreDifferent) {
          updates["instructor-pic"] = airtableInstructorPics;
        }

        if (webflowRecord.fieldData["number-of-seats"] !== String(fields["Number of seats remaining"])) {
          updates["number-of-seats"] = String(fields["Number of seats remaining"]);
        }
        if (webflowRecord.fieldData.name !== fields.Name) {
          updates.name = fields.Name;
        }
        if (webflowRecord.fieldData["price-roii-participants"] !== priceROIIName) {
          updates["price-roii-participants"] = priceROIIName;
        }
        if (webflowRecord.fieldData["start-time"] !== fields["Start time"]) {
          updates["start-time"] = fields["Start time"];
        }
        if (webflowRecord.fieldData["end-time"] !== fields["End Time "]) {
          updates["end-time"] = fields["End Time "];
        }
        if (webflowRecord.fieldData["sort-order"] !== fields["Sort order"]) {
          updates["sort-order"] = fields["Sort order"];
        }
        if (webflowRecord.fieldData["date"] !== fields["Date"]) {
          updates["date"] = fields["Date"];
        }
        if (webflowRecord.fieldData["end-date"] !== fields["End date "]) {
          updates["end-date"] = fields["End date "];
        }
        if (fields["Local Association Name (from Class Location)"] && webflowRecord.fieldData["location"] !== fields["Local Association Name (from Class Location)"].join(", ")) {
          updates["location"] = fields["Local Association Name (from Class Location)"].join(", ");
        }
        if (webflowRecord.fieldData["description"] !== fields["Description"]) {
          updates["description"] = fields["Description"];
        }

        if (webflowRecord.fieldData["class-type"] !== productTypeName) {
          updates["class-type"] = productTypeName;
        }

        const city1 = fields["City (from Class Location)"]?.join(", ");

        if (webflowRecord.fieldData["city-name"] !== city1) {
          updates["city-name"] = city1;
        }

        // Handle related-classes field
        const id1 = fields["Item Id (from Related Classes )"] || null;
        const id2 = fields["Item Id 2 (from Related Classes )"] || null;
        let newRelatedClassId = null;

        const isMember = webflowRecord.fieldData["member"];
        if (isMember === "Yes") {
          newRelatedClassId = id1;
        } else if (isMember === "No") {
          newRelatedClassId = id2;
        }

        if (newRelatedClassId) {
          updates["related-classes"] = newRelatedClassId;
        } else {
          console.warn(`Skipping related-classes update for Webflow record ID ${webflowRecord.id}`);
        }

        // Instructor details
        const instructname = fields["Instructor Name (from Instructors)"]?.join(", ");
        const instructcompany = fields["Instructor Company (from Instructors)"]?.join(", ");
        const instructdetails = fields["Instructor Details (from Instructors)"]?.join(", ");
        
        if (webflowRecord.fieldData["instructor-name"] !== instructname) {
          updates["instructor-name"] = instructname;
        }
        if (webflowRecord.fieldData["instructor-company"] !== instructcompany) {
          updates["instructor-company"] = instructcompany;
        }
        if (webflowRecord.fieldData["instructor-details"] !== instructdetails) {
          updates["instructor-details"] = instructdetails;
        }

        // Handle price updates and Stripe product creation
        const airtableMemberPrice = String(fields["Price - Member"]);
        const webflowMemberPrice = String(webflowRecord.fieldData["price-member"]);
        const airtableNonMemberPrice = String(fields["Price - Non Member"]);
        const webflowNonMemberPrice = String(webflowRecord.fieldData["price-non-member"]);
        const discountPercent = parseInt(fields["% Discounts"] || "0", 10);
        let memberPriceId = webflowRecord.fieldData["member-price-id"];
        let nonMemberPriceId = webflowRecord.fieldData["non-member-price-id"];
        let pricesChanged = false;

        if (airtableMemberPrice !== webflowMemberPrice || airtableNonMemberPrice !== webflowNonMemberPrice) {
          pricesChanged = true;
        }

        if (pricesChanged) {
          try {
            // Always create both products/prices
            const memberProduct = await stripe.products.create({
              name: `Member Price for ${fields.Name}`,
              description: `Updated member pricing for ${fields.Name}`,
            });
            const memberPrice = await stripe.prices.create({
              unit_amount: Math.round(Number(airtableMemberPrice) * 100),
              currency: "usd",
              product: memberProduct.id,
            });
            memberPriceId = memberPrice.id;
            airtableUpdates["Member Price ID"] = memberPriceId;

            const nonMemberProduct = await stripe.products.create({
              name: `Non-Member Price for ${fields.Name}`,
              description: `Updated non-member pricing for ${fields.Name}`,
            });
            const nonMemberPrice = await stripe.prices.create({
              unit_amount: Math.round(Number(airtableNonMemberPrice) * 100),
              currency: "usd",
              product: nonMemberProduct.id,
            });
            nonMemberPriceId = nonMemberPrice.id;
            airtableUpdates["Non-Member Price ID"] = nonMemberPriceId;

            // If discount is set, create coupon and update Airtable
            if (!isNaN(discountPercent) && discountPercent > 0) {
              const coupon = await StripeService.createDiscountCoupon(
                discountPercent,
                memberPriceId,
                nonMemberPriceId,
                parseInt(fields["Maximum discounted seats"] || "0", 10)
              );
              if (coupon && coupon.promotionCode) {
                airtableUpdates["Stripe Coupon"] = coupon.promotionCode.code;
              }
            }
          } catch (stripeError) {
            console.error("Error creating new Stripe products/prices/coupon:", stripeError);
          }
        }

        // Set price IDs and price fields for each Webflow record
        if (webflowRecord.fieldData["member"] === "Yes") {
          updates["member-price-id"] = memberPriceId;
          updates["price-id"] = memberPriceId;
          updates["price-member"] = airtableMemberPrice;
          updates["price-non-member"] = airtableNonMemberPrice;
        }
        if (webflowRecord.fieldData["member"] === "No") {
          updates["non-member-price-id"] = nonMemberPriceId;
          updates["price-id"] = nonMemberPriceId;
          updates["price-member"] = airtableMemberPrice;
          updates["price-non-member"] = airtableNonMemberPrice;
        }

        // If there are updates, send them to Webflow staging first, then publish to live
        if (Object.keys(updates).length > 0) {
          const updateURL = `${WEBFLOW_CONFIG.baseURL}/${WEBFLOW_CONFIG.collections.CLASSES}/items/${webflowRecord.id}`;
          try {
            // Update staging version first
            await axios.patch(updateURL, { fieldData: updates }, { headers: WEBFLOW_CONFIG.headers });
            console.log(`Updated Webflow record ID ${webflowRecord.id} in staging`);
            
            // Publish the updated item to live
            const publishURL = `https://api.webflow.com/v2/collections/${WEBFLOW_CONFIG.collections.CLASSES}/items/publish`;
            const publishData = {
              itemIds: [webflowRecord.id]
            };
            await axios.post(publishURL, publishData, { headers: WEBFLOW_CONFIG.headers });
            console.log(`Published Webflow record ID ${webflowRecord.id} to live`);
          } catch (updateError) {
            console.error(
              `Error updating Webflow record ID ${webflowRecord.id}:`,
              updateError.response?.data || updateError.message
            );
          }
        } else {
          console.log(`No updates needed for Webflow record ID: ${webflowRecord.id}`);
        }
      }

      if (Object.keys(airtableUpdates).length > 0) {
        try {
          await axios.patch(
            `${AIRTABLE_CONFIG.baseURL}/${TABLES.BIAW_CLASSES}/${id}`,
            { fields: airtableUpdates },
            { headers: AIRTABLE_CONFIG.headers }
          );
          console.log(`Updated Airtable record ${id} with new Stripe price IDs.`);
        } catch (airtableError) {
          console.error("Error updating Airtable with new Stripe price IDs:", airtableError);
        }
      }

      // Mark Airtable record as updated
      await axios.patch(
        `${AIRTABLE_CONFIG.baseURL}/${TABLES.BIAW_CLASSES}/${id}`,
        { fields: { "Publish / Unpublish": "Publish" } },
        { headers: AIRTABLE_CONFIG.headers }
      );
      console.log(`Marked Airtable record ${id} as "Publish".`);

      res.status(200).json({ message: "Sync completed successfully" });
    } catch (error) {
      console.error("Error syncing data:", error.response?.data || error.message);
      res.status(500).json({ error: "Sync failed" });
    }
  }

  // Handle category sync webhook
  static async handleCategorySyncWebhook(req, res) {
    try {
      const { id, fields } = req.body;
      console.log('Received category sync webhook:', { id, fields });

      // Import CategorySyncService
      const CategorySyncService = require('../services/categorySyncService');
      
      // Trigger category sync with webhook data
      await CategorySyncService.syncCategories({ id, fields });
      
      console.log('Category sync completed successfully');
      res.status(200).json({ message: 'Category sync completed successfully' });
    } catch (error) {
      console.error('Error in category sync webhook:', error);
      res.status(500).json({ error: 'Category sync failed' });
    }
  }

  // Handle special class webhook
  static async handleSpecialWebhook(req, res) {
    const { id, fields } = req.body;

    console.log('Received data:', { id, fields });

    try {
      const name = fields.Name || 'Untitled';
      const description = fields.Description || 'No description available';
      const mainImages = fields.Image?.[0]?.thumbnails?.large?.url || '';
      const roiiSpecialClassLink = fields.Link || '';
      const startDate = fields['Start Date'] || '';
      const endDate = fields['End Date'] || '';

      console.log('Extracted fields:', { name, description, mainImages, roiiSpecialClassLink, startDate, endDate });

      // Check if Webflow item IDs already exist in the payload
      const existingMemberItemId = fields['Webflow Item ID (Member)'];
      const existingNonMemberItemId = fields['Webflow Item ID (Non member)'];

      console.log('Existing Webflow IDs:', { existingMemberItemId, existingNonMemberItemId });

      let memberItemId;
      let nonMemberItemId;

      // If both Webflow IDs exist, update existing items
      if (existingMemberItemId && existingNonMemberItemId) {
        console.log('Updating existing Webflow items...');
        
        const updatePayload = {
          fieldData: {
            name: name,
            description: description,
            'roii-special-class-link': roiiSpecialClassLink,
            'main-images': mainImages,
            "banner-image": mainImages,
            date: startDate,
            'end-date': endDate,
          },
        };

        // Define publishURL once for both items
        const publishURL = `https://api.webflow.com/v2/collections/${WEBFLOW_CONFIG.collections.CLASSES}/items/publish`;

        // Update Member item
        try {
          await axios.patch(
            `${WEBFLOW_CONFIG.baseURL}/${WEBFLOW_CONFIG.collections.CLASSES}/items/${existingMemberItemId}`,
            updatePayload,
            { headers: WEBFLOW_CONFIG.headers }
          );
          console.log(`Updated existing Member item: ${existingMemberItemId}`);

          // Publish Member item to live
          const publishData = { itemIds: [existingMemberItemId] };
          await axios.post(publishURL, publishData, { headers: WEBFLOW_CONFIG.headers });
          console.log(`Published updated Member item to live: ${existingMemberItemId}`);
        } catch (error) {
          console.error('Error updating Member item:', error.response?.data || error.message);
        }

        // Update Non-Member item
        try {
          await axios.patch(
            `${WEBFLOW_CONFIG.baseURL}/${WEBFLOW_CONFIG.collections.CLASSES}/items/${existingNonMemberItemId}`,
            updatePayload,
            { headers: WEBFLOW_CONFIG.headers }
          );
          console.log(`Updated existing Non-Member item: ${existingNonMemberItemId}`);

          // Publish Non-Member item to live
          const publishData = { itemIds: [existingNonMemberItemId] };
          await axios.post(publishURL, publishData, { headers: WEBFLOW_CONFIG.headers });
          console.log(`Published updated Non-Member item to live: ${existingNonMemberItemId}`);
        } catch (error) {
          console.error('Error updating Non-Member item:', error.response?.data || error.message);
        }

        memberItemId = existingMemberItemId;
        nonMemberItemId = existingNonMemberItemId;
      } else {
        // Create new items if Webflow IDs don't exist
        console.log('Creating new Webflow items...');
        
        for (const dropdownValue of ['Member', 'Non-Member']) {
          const isMember = dropdownValue === 'Member';
          const memberValue = isMember ? 'Yes' : 'No';
          const nonMemberValue = isMember ? 'No' : 'Yes';

          const slug = `${name}-${dropdownValue}`.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

          const webflowPayload = {
            fieldData: {
              name: name,
              slug: slug,
              description: description,
              'roii-special-class-link': roiiSpecialClassLink,
              'main-images': mainImages,
              member: memberValue,
              'non-member': nonMemberValue,
              'member-non-member': dropdownValue,
              "banner-image": mainImages,
              date: startDate,
              'end-date': endDate,
            },
          };

          try {
            const webflowResponse = await axios.post(
              `${WEBFLOW_CONFIG.baseURL}/${WEBFLOW_CONFIG.collections.CLASSES}/items`,
              webflowPayload,
              {
                headers: WEBFLOW_CONFIG.headers,
              }
            );

            const webflowItemId = webflowResponse.data.id;
            console.log(`Successfully added ${dropdownValue} item to Webflow staging:`, webflowItemId);

            // Publish the item to live
            const publishURL = `https://api.webflow.com/v2/collections/${WEBFLOW_CONFIG.collections.CLASSES}/items/publish`;
            const publishData = {
              itemIds: [webflowItemId]
            };
            await axios.post(publishURL, publishData, { headers: WEBFLOW_CONFIG.headers });
            console.log(`Published ${dropdownValue} item to live:`, webflowItemId);

            if (dropdownValue === 'Member') {
              memberItemId = webflowItemId;
            } else if (dropdownValue === 'Non-Member') {
              nonMemberItemId = webflowItemId;
            }
          } catch (webflowError) {
            console.error('Error syncing data to Webflow:', webflowError.response?.data || webflowError.message);
            throw webflowError;
          }
        }

        // Update Airtable with new Webflow IDs only if we created new items
        if (memberItemId && nonMemberItemId) {
          const airtableUpdatePayload = {
            fields: {
              'Webflow Item ID (Member)': memberItemId,
              'Webflow Item ID (Non member)': nonMemberItemId,
            },
          };

          await axios.patch(
            `${AIRTABLE_CONFIG.baseURL}/${TABLES.SPECIAL_CLASSES}/${id}`,
            airtableUpdatePayload,
            {
              headers: AIRTABLE_CONFIG.headers,
            }
          );

          console.log(`Updated Airtable with new Webflow CMS IDs: Member - ${memberItemId}, Non-Member - ${nonMemberItemId}`);
        }
      }

      res.status(200).json({ message: 'Data processed and synced successfully.' });
    } catch (error) {
      console.error('Error syncing data:', error.message);
      res.status(500).json({ message: 'Error syncing data', error: error.message });
    }
  }
}

module.exports = AirtableWebhookController; 