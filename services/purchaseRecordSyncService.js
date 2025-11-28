const axios = require('axios');
const { AIRTABLE_CONFIG, TABLES } = require('../config/database');
const WEBFLOW_CONFIG = require('../config/webflow');
const { logError } = require('../utils/helpers');

function slugify(str) {
  // Only allow a-z, 0-9, dash, underscore, and ensure it starts with a valid character
  let slug = str
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+/, '') // Remove leading dashes
    .replace(/-+$/, ''); // Remove trailing dashes
  if (!/^[_a-zA-Z0-9]/.test(slug)) {
    slug = `_${slug}`;
  }
  return slug;
}

class PurchaseRecordSyncService {
  // Push a single purchase record to Webflow CMS (create or update)
  static async pushPurchaseRecordToWebflow(record, classDetails) {
    const airtableRecordId = record.id;
    const paymentStatus = record.fields["Payment Status"];
    const memberId = record.fields["Member ID (from User ID)"]?.[0] || "";
    const classFieldValue1 = record.fields["Field ID (from Biaw Classes)"]?.[0] || "";
    const name = classDetails.Name || "";
    const url2 = classDetails.slug || ""
    let slug = `${slugify(name)}-${airtableRecordId.slice(-5)}`;
    if (!/^[_a-zA-Z0-9]/.test(slug)) {
      slug = `_${slug}`;
    }

    // Upload banner image to Webflow Assets if a URL is present
    const imageUrl = classDetails.Images?.[0]?.url;
   
    // Prepare total amount for Webflow (strip $ and commas if present)
    let totalAmountRaw = record.fields["Amount Total"] || "Free";
    let totalAmount = totalAmountRaw;
    if (typeof totalAmountRaw === "string" && totalAmountRaw !== "Free") {
      totalAmount = totalAmountRaw.replace(/[$,]/g, '').trim();
    }

    const webflowData = {
      fieldData: {
        "class-url": record.fields["Purchased Class url"] || url2 || "",
        "name": name,
        "field-id": String(classFieldValue1),
        "member-id": memberId,
        "mail-id": record.fields["Email"] || "",
        "total-amount": totalAmount,
        "purchase-class-name": name,
        "purchased-class-end-date": classDetails["End date "] || "",
        "purchased-class-end-time": classDetails["End Time "] || "",
        "purchased-class-start-date": classDetails["Date"] || "",
        "purchased-class-start-time": classDetails["Start time"] || "",
        "payment-status": (paymentStatus === 'ROII-Cancelled' || paymentStatus === 'Cancelled Without Refund') ? 'Refunded' : paymentStatus,
        "image-2" : imageUrl,
        "payment-intent-2": record.fields["Payment Intent"],
        "number-of-purchased-seats": String(record.fields["Number of seat Purchased"] || ""),
        "purchase-record-airtable-id": airtableRecordId,
        "booking-type": record.fields["Booking Type"] || "",
        "slug": slug
      },
    };
    // Add cancelation-status based on payment status
    if (paymentStatus === 'ROII-Cancelled' || paymentStatus === 'Refunded' || paymentStatus === 'Cancelled Without Refund') {
      if (paymentStatus === 'Refunded') {
        webflowData.fieldData['cancelation-status'] = 'Refunded';
      } else {
        webflowData.fieldData['cancelation-status'] = 'Cancelled';
      }
    }
 
    try {
      // 1. Check if this record already exists in Webflow (by Airtable ID or Payment Intent)
      const res = await axios.get(
        `${WEBFLOW_CONFIG.baseURL}/${WEBFLOW_CONFIG.collections.PURCHASE_RECORDS}/items`,
        { headers: WEBFLOW_CONFIG.headers }
      );
      const paymentIntent = record.fields["Payment Intent"];
      
      // First try to find by Airtable Record ID
      let existing = (res.data.items || []).find(
        item => item.fieldData["purchase-record-airtable-id"] === airtableRecordId
      );
      
      // If not found by Airtable ID, try to find by Payment Intent
      if (!existing && paymentIntent) {
        existing = (res.data.items || []).find(
          item => item.fieldData["payment-intent-2"] === paymentIntent
        );
        if (existing) {
          console.log(`Found existing record by Payment Intent: ${paymentIntent} instead of Airtable ID: ${airtableRecordId}`);
        }
      }

      let webflowItemId = null;

      if (existing) {
        // 2. If exists, update it
        await axios.patch(
          `${WEBFLOW_CONFIG.baseURL}/${WEBFLOW_CONFIG.collections.PURCHASE_RECORDS}/items/${existing.id}`,
          { fieldData: webflowData.fieldData },
          { headers: WEBFLOW_CONFIG.headers }
        );
        // Publish the updated item (use /v2 endpoint)
        await axios.post(
          `https://api.webflow.com/v2/collections/${WEBFLOW_CONFIG.collections.PURCHASE_RECORDS}/items/publish`,
          { itemIds: [existing.id] },
          { headers: WEBFLOW_CONFIG.headers }
        );
        console.log(`Updated and published payment record in Webflow CMS (ID: ${airtableRecordId})`);
        webflowItemId = existing.id;
      } else {
        // 3. If not, create it
        const createRes = await axios.post(
          `${WEBFLOW_CONFIG.baseURL}/${WEBFLOW_CONFIG.collections.PURCHASE_RECORDS}/items`,
          webflowData,
          { headers: WEBFLOW_CONFIG.headers }
        );
        const itemId = createRes.data.id;
        // Publish the new item (use /v2 endpoint)
        await axios.post(
          `https://api.webflow.com/v2/collections/${WEBFLOW_CONFIG.collections.PURCHASE_RECORDS}/items/publish`,
          { itemIds: [itemId] },
          { headers: WEBFLOW_CONFIG.headers }
        );
        console.log(`Created and published new payment record in Webflow CMS (ID: ${airtableRecordId})`);
        webflowItemId = itemId;
      }

      return webflowItemId;
    } catch (err) {
      // Log the full error response from Webflow for debugging
      if (err.response && err.response.data) {
        logError('Creating/Updating Webflow record', JSON.stringify(err.response.data));
      } else {
        logError('Creating/Updating Webflow record', err);
      }
      throw err;
    }
  }
}

module.exports = PurchaseRecordSyncService; 