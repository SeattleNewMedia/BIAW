const axios = require('axios');
const { base } = require('../models/airtableModel');
const { updateMemberstack } = require('../models/memberstackModel');
const { sendEmail } = require('./emailService');
const formatDate = require('../utils/formatDate');

const AIRTABLE_URL2 = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_NAME3}`;
const MEMBERSTACK_URL = 'https://admin.memberstack.com/members';
const airtableHeaders = {
  Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
  'Content-Type': 'application/json',
};
const memberstackHeaders = {
  'X-API-KEY': process.env.MEMBERSTACK_API_KEY,
  'Content-Type': 'application/json',
};

// async function fetchUpdatedAirtableRecords() {
//   try {
//     const response = await axios.get(AIRTABLE_URL2, { headers: airtableHeaders });
//     const records = response.data.records.filter(
//       (record) => record.fields['Membership Update Status'] === 'Updated'
//     );
//     console.log(`Fetched ${records.length} records to update.`);
//     return records;
//   } catch (error) {
//     console.error('Error fetching Airtable records:', error.response?.data || error.message);
//     return [];
//   }
// }

async function updateMemberstackDetails(userId, memberUpdateData) {
  try {
    console.log(`Updating Memberstack member ${userId}...`);
    const response = await axios.patch(`${MEMBERSTACK_URL}/${userId}`, memberUpdateData, {
      headers: memberstackHeaders,
    });
    console.log(`Memberstack member ${userId} updated successfully.`);
    return response.data;
  } catch (error) {
    console.error(`Error updating Memberstack member ${userId}:`, error.response?.data || error.message);
    throw error;
  }
}

async function updateAirtableRecord(recordId) {
  try {
    const url = `${AIRTABLE_URL2}/${recordId}`;
    const data = {
      fields: {
        "Membership update status":"Published",
        "Membership Status":"Member",
        "UserType":"Member"
      },
    };
    console.log(`Updating Airtable record ${recordId}...`);
    const response = await axios.patch(url, data, { headers: airtableHeaders });
    console.log(`Airtable record ${recordId} updated successfully.`);
  } catch (error) {
    console.error(`Error updating Airtable record ${recordId}:`, error.response?.data || error.message);
  }
}

async function processAndUpdateRecords(records) {
  try {
    for (const record of records) {
      const { id: recordId, fields } = record;
      const userId = fields['Member ID'];
      if (!userId) {
        console.warn(`No Member ID found for record ${recordId}, skipping.`);
        continue;
      }
      
      const userName = (fields['User'] && fields['User'].name) || '';
      const isMember = !!userName;
      
      // Update member custom fields for both member and non-member
      const memberUpdateData = {
        customFields: {
          "first-name": fields['First Name'] || "",
          "last-name": fields['Last Name'] || "",
          "company-name": fields['Company Name'] || "N/A",
          "pin-number": fields['Company ID Used '] || '',
          'user': userName,
          'user-type': isMember ? "Member" : "Non-Member"
        }
      };

      try {
        // Update member custom fields
        await updateMemberstackDetails(userId, memberUpdateData);
        
        // Only perform plan changes if upgrading from non-member to member
        if (isMember) {
          // Check if user currently has non-member plan and needs to be upgraded
          try {
            // Add member plan
            await axios.post(
              `${MEMBERSTACK_URL}/${userId}/add-plan`,
              {
                planId: "pln_member-olag0ljk"
              },
              { headers: memberstackHeaders }
            );
            console.log(`Added member plan for user ${userId}`);
          } catch (error) {
            console.error(`Error adding member plan for ${userId}:`, error.response?.data || error.message);
          }

          try {
            // Remove non-member plan
            await axios.post(
              `${MEMBERSTACK_URL}/${userId}/remove-plan`,
              {
                planId: "pln_non-member-pzaf0lap"
              },
              { headers: memberstackHeaders }
            );
            console.log(`Removed non-member plan for user ${userId}`);
          } catch (error) {
            console.error(`Error removing non-member plan for ${userId}:`, error.response?.data || error.message);
          }
        }

        await updateAirtableRecord(recordId);
        
        // Update Director Access table if applicable
        const directorRecords = await base("Director Access")
          .select({ filterByFormula: `{Email} = '${fields["Email Address"]}'` })
          .firstPage();
        if (directorRecords.length > 0) {
          const directorRecord = directorRecords[0];
          const directorRecordId = directorRecord.id;
          const directorUpdateData = {
            "Company ID": fields['Company ID Used '] || null,
            "User": userName,
          };
          await base("Director Access").update(directorRecordId, directorUpdateData);
          await base("Director Access").update(directorRecordId, { "Create Account": "Created/Updated" });
        } else {
          console.log(`Email ${fields["Email Address"]} not found in "Director" table. Skipping update.`);
        }
      } catch (error) {
        console.error(`Failed to update Memberstack or Airtable for record ${recordId}.`, error.response ? error.response.data : error.message);
      }
    }
  } catch (error) {
    console.error('Error processing records:', error.message);
  }
}

// Example: assignPlanToMember, processAndUpdateRecords, runPeriodicUpdate
// (Move your periodic update and plan assignment logic here)

// ... placeholder for now ...

module.exports = {
  processAndUpdateRecords,
  // assignPlanToMember,
  // runPeriodicUpdate,
}; 