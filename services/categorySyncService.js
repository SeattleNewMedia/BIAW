const axios = require('axios');
const { AIRTABLE_CONFIG, TABLES } = require('../config/database');
const WEBFLOW_CONFIG = require('../config/webflow');
const WebflowService = require('./webflowService');
const { logError } = require('../utils/helpers');
const Class = require('../models/Class');

class CategorySyncService {
  // Sync categories from Airtable to Webflow
  static async syncCategories(webhookData = null) {
    try {
      let categoriesToProcess;

      if (webhookData) {
        // Process single category from webhook
        console.log(`Processing single category from webhook: ${webhookData.fields?.['Category Name'] || 'Unknown'}`);
        categoriesToProcess = [webhookData];
      } else {
        // Fallback: fetch all categories (for manual sync)
        const airtableCategories = (await axios.get(`${AIRTABLE_CONFIG.baseURL}/${TABLES.CATEGORY}`, {
          headers: AIRTABLE_CONFIG.headers
        })).data.records;
        console.log(`Fetched ${airtableCategories.length} categories from Airtable.`);
        categoriesToProcess = airtableCategories;
      }

      const existingWebflowCategories = (await axios.get(`${WEBFLOW_CONFIG.baseURL}/${WEBFLOW_CONFIG.collections.CATEGORIES}/items`, {
        headers: WEBFLOW_CONFIG.headers
      })).data.items || [];
      const webflowCategoriesByAirtableId = existingWebflowCategories.reduce((acc, record) => {
        (acc[record.fieldData["category-airtable-id"]] ||= []).push(record);
        return acc;
      }, {});

      for (const { id: airtableCategoryId, fields } of categoriesToProcess) {
        const {
          "Category Name": name,
          "Item Id (from Biaw Classes)": itemIdFromBiaw = [],
          "Item Id 2 (from Biaw Classes)": itemId2FromBiaw = [],
          "Item Id": memberRelatedClassIdsRaw = [],
          "Item Id 2": nonMemberRelatedClassIdsRaw = [],
          "Member item Webflow ID": memberWebflowId = null,
          "Non-Member item Webflow ID": nonMemberWebflowId = null,
          "Category Description": description = "",
          "Listing Order": sortOrder = null,
          status,
        } = fields;

        // Validation: required fields
        if (!name || !itemIdFromBiaw || !itemId2FromBiaw || itemIdFromBiaw.length === 0 || itemId2FromBiaw.length === 0) {
          console.warn(`Skipping category ${airtableCategoryId} due to missing required fields: name, Item Id (from Biaw Classes), or Item Id 2 (from Biaw Classes)`);
          continue;
        }

        // For member
        const relatedClassIdsForMember = fields["Item Id (from Biaw Classes)"] || [];
        const validatedRelatedClassIdsForMember = await WebflowService.validateWebflowItemIds(
          Array.isArray(relatedClassIdsForMember)
            ? relatedClassIdsForMember
            : typeof relatedClassIdsForMember === "string"
              ? relatedClassIdsForMember.split(",").map(id => id.trim()).filter(Boolean)
              : []
        );
        // For non-member
        const relatedClassIdsForNonMember = fields["Item Id 2 (from Biaw Classes)"] || [];
        const validatedRelatedClassIdsForNonMember = await WebflowService.validateWebflowItemIds(
          Array.isArray(relatedClassIdsForNonMember)
            ? relatedClassIdsForNonMember
            : typeof relatedClassIdsForNonMember === "string"
              ? relatedClassIdsForNonMember.split(",").map(id => id.trim()).filter(Boolean)
              : []
        );

        // Build the two category objects (member and non-member)
        const memberCategory = {
          fieldData: {
            name,
            "related-classes": validatedRelatedClassIdsForMember,
            "class-description": description || "",
            "category-order": sortOrder || "",
            "member-non-member": "Yes",
            "category-airtable-id": airtableCategoryId
          }
        };
        const nonMemberCategory = {
          fieldData: {
            name,
            "related-classes": validatedRelatedClassIdsForNonMember,
            "class-description": description || "",
            "category-order": sortOrder || "",
            "member-non-member": "No",
            "category-airtable-id": airtableCategoryId
          }
        };
        const categoriesToSend = [memberCategory, nonMemberCategory];

        // Guard: re-fetch Airtable record to check if Webflow IDs are already set (prevents double creation)
        let latestFields = fields;
        let latestMemberWebflowId = memberWebflowId;
        let latestNonMemberWebflowId = nonMemberWebflowId;
        try {
          const latestAirtable = (await axios.get(`${AIRTABLE_CONFIG.baseURL}/${TABLES.CATEGORY}/${airtableCategoryId}`, {
            headers: AIRTABLE_CONFIG.headers
          })).data;
          latestFields = latestAirtable.fields || fields;
          latestMemberWebflowId = latestFields["Member item Webflow ID"];
          latestNonMemberWebflowId = latestFields["Non-Member item Webflow ID"];
        } catch (e) {
          // fallback to original fields
        }
        const alreadyCreated = latestMemberWebflowId && latestNonMemberWebflowId;

        if (!alreadyCreated) {
          // CREATE: Only run this block ONCE per category!
          console.log(`Creating new categories for Airtable ID ${airtableCategoryId} (no Webflow IDs present)`);
          const createdWebflowIds = [];
          // Track which ID is for member/non-member
          let memberCreatedId = null;
          let nonMemberCreatedId = null;
          for (const categoryData of categoriesToSend) {
            // Create in staging first
            const webflowResponse = await axios.post(`${WEBFLOW_CONFIG.baseURL}/${WEBFLOW_CONFIG.collections.CATEGORIES}/items`,
              categoryData, { headers: WEBFLOW_CONFIG.headers });
            const createdId = webflowResponse.data.id;
            console.log(`Created new category in staging:`, createdId, `for member-non-member:`, categoryData.fieldData["member-non-member"]);
            // Publish to live
            const publishURL = `https://api.webflow.com/v2/collections/${WEBFLOW_CONFIG.collections.CATEGORIES}/items/publish`;
            const publishData = {
              itemIds: [createdId]
            };
            await axios.post(publishURL, publishData, { headers: WEBFLOW_CONFIG.headers });
            console.log(`Published new category to live:`, createdId);
            createdWebflowIds.push(createdId);
            if (categoryData.fieldData["member-non-member"] === "Yes") memberCreatedId = createdId;
            if (categoryData.fieldData["member-non-member"] === "No") nonMemberCreatedId = createdId;
          }
          // Update Airtable with the created Webflow IDs
          if (memberCreatedId && nonMemberCreatedId) {
            const airtableUpdates = {
              "Member item Webflow ID": memberCreatedId,
              "Non-Member item Webflow ID": nonMemberCreatedId,
              status: "Published"
            };
            await axios.patch(`${AIRTABLE_CONFIG.baseURL}/${TABLES.CATEGORY}/${airtableCategoryId}`, {
              fields: airtableUpdates
            }, { headers: AIRTABLE_CONFIG.headers });
            console.log(`Updated Airtable with Webflow IDs: Member - ${memberCreatedId}, Non-Member - ${nonMemberCreatedId}`);
          }
        } else {
          // UPDATE: Only run this block ONCE per category!
          console.log(`Updating existing categories for Airtable ID ${airtableCategoryId} (Webflow IDs present)`);
          let updatedAny = false;
          for (const categoryData of categoriesToSend) {
            // First try to find by category-airtable-id
            let existingRecords = webflowCategoriesByAirtableId[airtableCategoryId]?.filter(
              record => record.fieldData["member-non-member"] === categoryData.fieldData["member-non-member"]
            ) || [];
            
            // Fallback: If no records found by category-airtable-id, try using Webflow IDs from Airtable
            if (existingRecords.length === 0) {
              console.warn(`No records found by category-airtable-id for ${airtableCategoryId}, trying fallback using Webflow IDs from Airtable`);
              const targetWebflowId = categoryData.fieldData["member-non-member"] === "Yes" 
                ? latestMemberWebflowId 
                : latestNonMemberWebflowId;
              
              if (targetWebflowId) {
                // Find the record by its Webflow ID
                const recordById = existingWebflowCategories.find(
                  record => record.id === targetWebflowId && 
                  record.fieldData["member-non-member"] === categoryData.fieldData["member-non-member"]
                );
                
                if (recordById) {
                  existingRecords = [recordById];
                  console.log(`Found record by Webflow ID fallback: ${targetWebflowId}`);
                  
                  // Ensure category-airtable-id is set for future lookups
                  if (!recordById.fieldData["category-airtable-id"] || recordById.fieldData["category-airtable-id"] !== airtableCategoryId) {
                    console.log(`Setting missing category-airtable-id on Webflow record ${targetWebflowId}`);
                    categoryData.fieldData["category-airtable-id"] = airtableCategoryId;
                  }
                } else {
                  console.warn(`Webflow record ${targetWebflowId} not found in existing categories`);
                }
              } else {
                console.warn(`No Webflow ID available in Airtable for ${categoryData.fieldData["member-non-member"]} category`);
              }
            }
            
            for (const record of existingRecords) {
              const updates = Object.fromEntries(
                Object.entries(categoryData.fieldData).filter(([key, value]) =>
                  (record.fieldData[key] || "").toString() !== value.toString()
                )
              );
              
              // Always ensure category-airtable-id is set (even if nothing else changed)
              if (!record.fieldData["category-airtable-id"] || record.fieldData["category-airtable-id"] !== airtableCategoryId) {
                updates["category-airtable-id"] = airtableCategoryId;
                console.log(`Adding missing or incorrect category-airtable-id to updates for record ${record.id}`);
              }
              
              if (Object.keys(updates).length) {
                updatedAny = true;
                console.log(`Updating Webflow record ${record.id} with changes:`, Object.keys(updates), `for member-non-member:`, categoryData.fieldData["member-non-member"]);
                // Update staging first
                await axios.patch(`${WEBFLOW_CONFIG.baseURL}/${WEBFLOW_CONFIG.collections.CATEGORIES}/items/${record.id}`,
                  { fieldData: updates }, { headers: WEBFLOW_CONFIG.headers });
                console.log(`Updated Webflow record ${record.id} in staging`);
                // Publish to live
                const publishURL = `https://api.webflow.com/v2/collections/${WEBFLOW_CONFIG.collections.CATEGORIES}/items/publish`;
                const publishData = {
                  itemIds: [record.id]
                };
                await axios.post(publishURL, publishData, { headers: WEBFLOW_CONFIG.headers });
                console.log(`Published Webflow record ${record.id} to live`);
              } else {
                console.log(`Webflow record ${record.id} is up to date for member-non-member:`, categoryData.fieldData["member-non-member"]);
              }
            }
          }
          // After all updates, update Airtable status to Published
          try {
            await axios.patch(`${AIRTABLE_CONFIG.baseURL}/${TABLES.CATEGORY}/${airtableCategoryId}`, {
              fields: { status: "Published" }
            }, { headers: AIRTABLE_CONFIG.headers });
            console.log(`Updated Airtable status to Published for category ${airtableCategoryId}`);
          } catch (e) {
            console.error(`Failed to update Airtable status for category ${airtableCategoryId}:`, e.message);
          }
        }
      }
    } catch (error) {
      console.error("Error during synchronization:", error.response?.data || error.message);
    }
  }
}

module.exports = CategorySyncService; 