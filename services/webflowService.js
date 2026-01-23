const axios = require('axios');
const WEBFLOW_CONFIG = require('../config/webflow');
const { generateSlug } = require('../utils/helpers');
const { logError } = require('../utils/helpers');

class WebflowService {
  // Helper to publish items to live
  static async publishWebflowItems(itemIds) {
    try {
      const collectionId = WEBFLOW_CONFIG.collections.CLASSES;
      const publishUrl = `https://api.webflow.com/v2/collections/${collectionId}/items/publish`;
      const data = {
        itemIds: itemIds.map(String) // ensure all are strings
      };
      await axios.post(publishUrl, data, { headers: WEBFLOW_CONFIG.headers });
      console.log(`Published items to live: ${itemIds.join(', ')}`);
    } catch (error) {
      console.error('Error publishing items to live:', error.response?.data || error.message);
      throw error;
    }
  }

  // Add class to Webflow CMS
  static async addClassToWebflow(classDetails, stripeInfo) {
    try {
      const instructorName = Array.isArray(classDetails["Instructor Name (from Instructors)"])
        ? classDetails["Instructor Name (from Instructors)"].join(", ")
        : classDetails["Instructor Name (from Instructors)"];

      const instructorPicField = classDetails["Instructor Pic (from Instructors)"];
      const instructorPicUrl = instructorPicField && instructorPicField.length > 0 ? instructorPicField[0].url : "";

      const imagesField = classDetails["Images"];
      const imageUrls = imagesField && imagesField.length > 0 ? imagesField.map((image) => image.url) : [];

      const bannerimagesField = classDetails["Banner Image"];
      const bannerimageUrls = bannerimagesField && bannerimagesField.length > 0 ? bannerimagesField.map((image) => image.url) : [];

      const instructorDetails = classDetails["Instructor Details (from Instructors)"]?.[0] || "";
      const instructorCompany = classDetails["Instructor Company (from Instructors)"]?.[0] || "";

      const city = classDetails["City (from Class Location)"]?.[0] || "";
      const state = classDetails["State (from Location 2)"]?.[0] || "";
      const location2 = classDetails["Local Association Name (from Class Location)"]?.[0] || "";
      const zipcode = classDetails["Zip (from Location 2)"]?.[0] || "";

      // For member
      const relatedClassIdsForMember = classDetails["Item Id (from Related Classes )"] || [];
      const validatedRelatedClassIdsForMember = await this.validateWebflowItemIds(
        Array.isArray(relatedClassIdsForMember)
          ? relatedClassIdsForMember
          : typeof relatedClassIdsForMember === "string"
            ? relatedClassIdsForMember.split(",").map(id => id.trim()).filter(Boolean)
            : []
      );
      
      // For non-member
      const relatedClassIdsForNonMember = classDetails["Item Id 2 (from Related Classes )"] || [];
      const validatedRelatedClassIdsForNonMember = await this.validateWebflowItemIds(
        Array.isArray(relatedClassIdsForNonMember)
          ? relatedClassIdsForNonMember
          : typeof relatedClassIdsForNonMember === "string"
            ? relatedClassIdsForNonMember.split(",").map(id => id.trim()).filter(Boolean)
            : []
      );
      
      console.log(`Related class IDs for Member:`, validatedRelatedClassIdsForMember);
      console.log(`Related class IDs for Non-Member:`, validatedRelatedClassIdsForNonMember);

      // Set CESCL toggles based on class name
      let showAddressField = false;
      let recertification = false;
      
      if (classDetails.Name === 'Online CESCL (Certified Erosion & Sediment Control Lead)') {
        showAddressField = true;
        recertification = false;
        console.log('Setting CESCL toggles for Online CESCL: show-address-field=true, recertification=false');
      } else if (classDetails.Name === 'Online CESCL Recertification') {
        showAddressField = true;
        recertification = true;
        console.log('Setting CESCL toggles for Online CESCL Recertification: show-address-field=true, recertification=true');
      }

      // Precompute both slugs and URLs with different unique digits
      function getRandom4Digit() {
        return Math.floor(1000 + Math.random() * 9000).toString();
      }
      const memberUnique4Digit = getRandom4Digit();
      const nonMemberUnique4Digit = getRandom4Digit();
      const memberSlug = generateSlug(classDetails, memberUnique4Digit);
      const nonMemberSlug = generateSlug(classDetails, nonMemberUnique4Digit);
      const memberUrl = `https://biaw.com/classes/${memberSlug}`;
      const nonMemberUrl = `https://biaw.com/classes/${nonMemberSlug}`;

      let memberId = null, nonMemberId = null;
      const itemIds = [];

      for (const dropdownValue of ["Member", "Non-Member"]) {
        let memberValue = "No";
        let nonMemberValue = "No";
        let paymentLink = "";
        let relatedClassIds = [];
        let slug = dropdownValue === "Member" ? memberSlug : nonMemberSlug;

        if (dropdownValue === "Member") {
          memberValue = "Yes";
          nonMemberValue = "No";
          paymentLink = stripeInfo.memberPaymentLink.url;
          relatedClassIds = validatedRelatedClassIdsForMember;
        } else if (dropdownValue === "Non-Member") {
          memberValue = "No";
          nonMemberValue = "Yes";
          paymentLink = stripeInfo.nonMemberPaymentLink.url;
          relatedClassIds = validatedRelatedClassIdsForNonMember;
        }

        // Create in staging (not live), including both URLs
        const response = await axios.post(
          `${WEBFLOW_CONFIG.baseURL}/${WEBFLOW_CONFIG.collections.CLASSES}/items`,
          {
            fieldData: {
              name: classDetails.Name,
              slug: slug,
              description: classDetails.Description || "No description available",
              "price-member": String(classDetails["Price - Member"]),
              "price-non-member": String(classDetails["Price - Non Member"]),
              "member-price-id": dropdownValue === "Member" ? String(stripeInfo.memberPrice.id) : "",
              "non-member-price-id": dropdownValue === "Non-Member" ? String(stripeInfo.nonMemberPrice.id) : "",
              "price-id": dropdownValue === "Member"? String(stripeInfo.memberPrice.id): dropdownValue === "Non-Member" ? String(stripeInfo.nonMemberPrice.id) : "",
              "field-id": String(classDetails["Field ID"]),
              date: classDetails.Date,
              "end-date": classDetails["End date "],
              location: location2,
              "payment-link": paymentLink,
              "start-time": classDetails["Start time"],
              "end-time": classDetails["End Time "],
              "class-type": typeof classDetails["Product Type"] === 'object' ? classDetails["Product Type"].name : classDetails["Product Type"],
              "instructor-name": instructorName,
              "instructor-pic": instructorPicUrl,
              "image-2": imageUrls,
              "main-images": imageUrls,
              "instructor-details": instructorDetails,
              "instructor-company": instructorCompany,
              "price-roii-participants": typeof classDetails["Price - ROII Participants (Select)"] === 'object' ? classDetails["Price - ROII Participants (Select)"].name : classDetails["Price - ROII Participants (Select)"],
              "created-date": classDetails.Created,
              "number-of-seats": String(classDetails["Number of seats "]),
              // "airtablerecordid": classDetails.id,
              "member-non-member": dropdownValue,
              "member": memberValue,
              "city-name": city,
              "sort-order": classDetails['Sort order'],
              "non-member": nonMemberValue,
              "related-classes": relatedClassIds,
              "banner-image": bannerimageUrls,
              "member-class-page-url": memberUrl,
              "non-member-class-page-url": nonMemberUrl,
              "show-address-field": showAddressField,
              "recertification-class": recertification
            },
          },
          {
            headers: WEBFLOW_CONFIG.headers,
          }
        );

        itemIds.push(response.data.id);
        if (dropdownValue === "Member") {
          memberId = response.data.id;
        } else {
          nonMemberId = response.data.id;
        }
        console.log(`Successfully added ${dropdownValue} entry for class: ${classDetails.Name} (staging)`);
      }

      // Publish the created items
      await this.publishWebflowItems(itemIds);

      return {
        memberId,
        nonMemberId,
        nonMemberUrl
      };
    } catch (error) {
      if (error.response) {
        console.error("Webflow API Error:", error.response.data);
        // Log more details about the validation error
        if (error.response.data.details) {
          console.error("Validation Error Details:", error.response.data.details);
        }
      } else {
        console.error("Unknown Error:", error.message);
      }
      throw error;
    }
  }


    // Validate Webflow item IDs
  // static async validateWebflowItemIds(itemIds) {
  //   try {
  //     const response = await axios.get(`${WEBFLOW_CONFIG.baseURL}/${WEBFLOW_CONFIG.collections.CLASSES}/items`, {
  //       headers: WEBFLOW_CONFIG.headers,
  //     });

  //     const webflowItems = response.data.items;
  //     const webflowItemIds = new Set(webflowItems.map((item) => item.id));

  //     return itemIds.filter((id) => webflowItemIds.has(id));
  //   } catch (error) {
  //     logError("Validating Webflow item IDs", error);
  //     throw error;
  //   }
  // }


  // Validate Webflow item IDs - fetches ALL items with pagination to include both old and new classes
  static async validateWebflowItemIds(itemIds) {
    try {
      // Fetch all items with pagination to ensure we get both old and new items
      let allWebflowItems = [];
      let offset = 0;
      const limit = 100; // Webflow API limit per page
      let hasMore = true;
      let pageCount = 0;
      const maxPages = 200; // Safety limit to prevent infinite loops

      console.log(`Starting to fetch Webflow items for validation. Input IDs: ${itemIds.length}`);

      while (hasMore && pageCount < maxPages) {
        try {
          const response = await axios.get(`${WEBFLOW_CONFIG.baseURL}/${WEBFLOW_CONFIG.collections.CLASSES}/items`, {
            headers: WEBFLOW_CONFIG.headers,
            params: {
              offset: offset,
              limit: limit
            }
          });

          const items = response.data.items || [];
          allWebflowItems = allWebflowItems.concat(items);
          pageCount++;

          console.log(`Fetched page ${pageCount}: ${items.length} items (total so far: ${allWebflowItems.length})`);

          // Check if there are more items to fetch
          // If we got fewer items than the limit, we've reached the end
          hasMore = items.length === limit;
          offset += limit;

          // If no items returned, we're done
          if (items.length === 0) {
            hasMore = false;
          }
        } catch (pageError) {
          // If offset-based pagination fails, try without offset (might return all items)
          if (offset > 0 && pageError.response?.status === 400) {
            console.warn('Offset-based pagination not supported, trying single request for all items');
            try {
              const singleResponse = await axios.get(`${WEBFLOW_CONFIG.baseURL}/${WEBFLOW_CONFIG.collections.CLASSES}/items`, {
                headers: WEBFLOW_CONFIG.headers,
              });
              const singleItems = singleResponse.data.items || [];
              allWebflowItems = allWebflowItems.concat(singleItems);
              console.log(`Fetched ${singleItems.length} items in single request`);
            } catch (singleError) {
              console.error('Single request also failed:', singleError.message);
            }
          } else {
            console.error(`Error fetching page at offset ${offset}:`, pageError.message);
          }
          hasMore = false;
        }
      }

      console.log(`Fetched ${allWebflowItems.length} total items from Webflow for validation (${pageCount} pages)`);
      const webflowItemIds = new Set(allWebflowItems.map((item) => item.id));

      const validatedIds = itemIds.filter((id) => webflowItemIds.has(id));
      const invalidIds = itemIds.filter((id) => !webflowItemIds.has(id));
      
      if (invalidIds.length > 0) {
        console.warn(`The following ${invalidIds.length} item IDs were not found in Webflow and will be excluded:`, invalidIds);
      }
      
      console.log(`Validated ${validatedIds.length} out of ${itemIds.length} item IDs`);
      return validatedIds;
    } catch (error) {
      // Final fallback: try single request without pagination
      console.warn('Pagination failed, attempting single request as fallback:', error.message);
      try {
        const response = await axios.get(`${WEBFLOW_CONFIG.baseURL}/${WEBFLOW_CONFIG.collections.CLASSES}/items`, {
          headers: WEBFLOW_CONFIG.headers,
        });
        const webflowItems = response.data.items || [];
        const webflowItemIds = new Set(webflowItems.map((item) => item.id));
        const validatedIds = itemIds.filter((id) => webflowItemIds.has(id));
        console.warn(`Fallback: Validated ${validatedIds.length} out of ${itemIds.length} item IDs (may be incomplete if pagination is needed)`);
        return validatedIds;
      } catch (fallbackError) {
        logError("Validating Webflow item IDs", fallbackError);
        throw fallbackError;
      }
    }
  }

  // Sync remaining seats
  static async syncRemainingSeats(airtableRecords) {
    try {
      const webflowResponse = await axios.get(`${WEBFLOW_CONFIG.baseURL}/${WEBFLOW_CONFIG.collections.CLASSES}/items`, {
        headers: WEBFLOW_CONFIG.headers,
      });

      const webflowRecords = webflowResponse.data.items || [];
      console.log(`Fetched ${webflowRecords.length} records from Webflow.`);

      const webflowRecordMap = new Map();
      webflowRecords.forEach((record) => {
        const fieldId = record.fieldData["field-id"];
        if (fieldId) {
          if (!webflowRecordMap.has(fieldId)) {
            webflowRecordMap.set(fieldId, []);
          }
          webflowRecordMap.get(fieldId).push(record);
        }
      });

      for (const airtableRecord of airtableRecords) {
        const fieldId = airtableRecord.fields["Field ID"];
        const airtableSeatsRemaining = airtableRecord.fields["Number of seats remaining"];
        const webflowRecordsToUpdate = webflowRecordMap.get(fieldId);

        if (webflowRecordsToUpdate) {
          for (const webflowRecord of webflowRecordsToUpdate) {
            const webflowSeatsRemaining = webflowRecord.fieldData["number-of-seats"];
            if (String(webflowSeatsRemaining) !== String(airtableSeatsRemaining)) {
              const updateURL = `${WEBFLOW_CONFIG.baseURL}/${WEBFLOW_CONFIG.collections.CLASSES}/items/${webflowRecord.id}`;
              const updateData = {
                fieldData: {
                  "number-of-seats": String(airtableSeatsRemaining),
                },
              };
              try {
                // Update staging first
                await axios.patch(updateURL, updateData, { headers: WEBFLOW_CONFIG.headers });
                console.log(`Updated number-of-seats for Webflow record ID ${webflowRecord.id} in staging`);
                
                // Publish to live
                const publishURL = `https://api.webflow.com/v2/collections/${WEBFLOW_CONFIG.collections.CLASSES}/items/publish`;
                const publishData = {
                  itemIds: [webflowRecord.id]
                };
                await axios.post(publishURL, publishData, { headers: WEBFLOW_CONFIG.headers });
                console.log(`Published Webflow record ID ${webflowRecord.id} to live`);
              } catch (error) {
                console.error(
                  `Error updating number-of-seats for Webflow record ID ${webflowRecord.id}:`,
                  error.response?.data || error.message
                );
              }
            }
          }
        }
      }
    } catch (error) {
      logError("Syncing remaining seats", error);
      throw error;
    }
  }

  // Update remaining seats for a specific class in real-time
  static async updateRemainingSeatsForClass(fieldId, newSeatsRemaining) {
    try {
      console.log(`Updating remaining seats for Field ID: ${fieldId} to: ${newSeatsRemaining}`);
      
      const webflowResponse = await axios.get(`${WEBFLOW_CONFIG.baseURL}/${WEBFLOW_CONFIG.collections.CLASSES}/items`, {
        headers: WEBFLOW_CONFIG.headers,
      });

      const webflowRecords = webflowResponse.data.items || [];
      const fieldIdString = String(fieldId);
      const matchingWebflowRecords = webflowRecords.filter(
        (record) => String(record.fieldData?.["field-id"]) === fieldIdString
      );

      if (matchingWebflowRecords.length === 0) {
        console.warn(`No matching Webflow records found for Field ID: ${fieldId}`);
        return;
      }

      // Update both Member and Non-Member entries
      for (const webflowRecord of matchingWebflowRecords) {
        const updateURL = `${WEBFLOW_CONFIG.baseURL}/${WEBFLOW_CONFIG.collections.CLASSES}/items/${webflowRecord.id}`;
        const updateData = {
          fieldData: {
            "number-of-seats": String(newSeatsRemaining),
          },
        };
        
        try {
          // Update staging first
          await axios.patch(updateURL, updateData, { headers: WEBFLOW_CONFIG.headers });
          console.log(`Updated number-of-seats for Webflow record ID ${webflowRecord.id} in staging`);
          
          // Publish to live
          const publishURL = `https://api.webflow.com/v2/collections/${WEBFLOW_CONFIG.collections.CLASSES}/items/publish`;
          const publishData = {
            itemIds: [webflowRecord.id]
          };
          await axios.post(publishURL, publishData, { headers: WEBFLOW_CONFIG.headers });
          console.log(`Published Webflow record ID ${webflowRecord.id} to live`);
        } catch (updateError) {
          console.error(
            `Error updating number-of-seats for Webflow record ID ${webflowRecord.id}:`,
            updateError.response?.data || updateError.message
          );
          throw updateError;
        }
      }
      
      console.log(`Successfully updated remaining seats for class with Field ID ${fieldId} in Webflow CMS`);
    } catch (error) {
      logError("Updating remaining seats for class in Webflow", error);
      throw error;
    }
  }

  // Update class in Webflow
  static async updateClassInWebflow(fieldId, updates) {
    try {
      const webflowResponse = await axios.get(`${WEBFLOW_CONFIG.baseURL}/${WEBFLOW_CONFIG.collections.CLASSES}/items`, {
        headers: WEBFLOW_CONFIG.headers,
      });

      const webflowRecords = webflowResponse.data.items || [];
      const fieldIdString = String(fieldId);
      const matchingWebflowRecords = webflowRecords.filter(
        (record) => String(record.fieldData?.["field-id"]) === fieldIdString
      );

      if (matchingWebflowRecords.length === 0) {
        console.warn(`No matching Webflow records found for Field ID: ${fieldId}`);
        return;
      }

      for (const webflowRecord of matchingWebflowRecords) {
        const updateURL = `${WEBFLOW_CONFIG.baseURL}/${WEBFLOW_CONFIG.collections.CLASSES}/items/${webflowRecord.id}`;
        try {
          // Update staging first
          await axios.patch(updateURL, { fieldData: updates }, { headers: WEBFLOW_CONFIG.headers });
          console.log(`Updated Webflow record ID ${webflowRecord.id} in staging`);
          
          // Publish to live
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
      }
    } catch (error) {
      logError("Updating class in Webflow", error);
      throw error;
    }
  }

  // Update Webflow CMS items by Field ID (new method for admin)
  static async updateWebflowItemsByFieldId(fieldId, newRemainingSeats, newTotalSeats) {
    try {
      console.log(`Updating Webflow CMS items for Field ID: ${fieldId} with remaining seats: ${newRemainingSeats}`);
      
      const webflowResponse = await axios.get(`${WEBFLOW_CONFIG.baseURL}/${WEBFLOW_CONFIG.collections.CLASSES}/items`, {
        headers: WEBFLOW_CONFIG.headers,
      });

      const webflowRecords = webflowResponse.data.items || [];
      
      // Debug: Show all available field IDs in Webflow
      console.log(`Total Webflow CMS items found: ${webflowRecords.length}`);
      const availableFieldIds = webflowRecords.map(record => ({
        id: record.id,
        fieldId: record.fieldData?.["field-id"],
        fieldIdType: typeof record.fieldData?.["field-id"],
        name: record.fieldData?.["name"] || "No name"
      }));
      console.log("Available Field IDs in Webflow:", availableFieldIds);
      
      // Fix ReferenceError: ensure matchingWebflowRecords is always defined before use
      const fieldIdString = String(fieldId);
      const matchingWebflowRecords = webflowRecords.filter(
        (record) => String(record.fieldData?.["field-id"]) === fieldIdString
      );

      console.log(`Found ${matchingWebflowRecords.length} matching records`);

      if (matchingWebflowRecords.length === 0) {
        console.warn(`No matching Webflow CMS items found for Field ID: ${fieldId}`);
        console.warn("This could be due to:");
        console.warn("1. Data type mismatch (string vs number)");
        console.warn("2. Field name difference");
        console.warn("3. Items don't exist in Webflow yet");
        return;
      }

      console.log(`Found ${matchingWebflowRecords.length} Webflow CMS items to update for Field ID: ${fieldId}`);

      // Update all matching Webflow CMS items
      for (const webflowRecord of matchingWebflowRecords) {
        const updateURL = `${WEBFLOW_CONFIG.baseURL}/${WEBFLOW_CONFIG.collections.CLASSES}/items/${webflowRecord.id}`;
        const updateData = {
          fieldData: {
            "number-of-seats":String(newRemainingSeats)
          },
        };
        
        try {
          // Update staging first
          await axios.patch(updateURL, updateData, { headers: WEBFLOW_CONFIG.headers });
          console.log(`Updated Webflow CMS item ID ${webflowRecord.id} in staging with remaining seats: ${newRemainingSeats}`);
          
          // Publish to live
          const publishURL = `https://api.webflow.com/v2/collections/${WEBFLOW_CONFIG.collections.CLASSES}/items/publish`;
          const publishData = {
            itemIds: [webflowRecord.id]
          };
          await axios.post(publishURL, publishData, { headers: WEBFLOW_CONFIG.headers });
          console.log(`Published Webflow CMS item ID ${webflowRecord.id} to live`);
        } catch (updateError) {
          console.error(
            `Error updating Webflow CMS item ID ${webflowRecord.id}:`,
            updateError.response?.data || updateError.message
          );
          throw updateError;
        }
      }
      
      console.log(`Successfully updated ${matchingWebflowRecords.length} Webflow CMS items for Field ID: ${fieldId}`);
    } catch (error) {
      logError("Updating Webflow CMS items by Field ID", error);
      throw error;
    }
  }
}

module.exports = WebflowService; 