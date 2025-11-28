const Airtable = require('airtable');

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

// Check if Company ID exists in NAHB Data
async function checkCompanyId(companyId) {
  try {
    const records = await base('NAHB Data')
      .select({ filterByFormula: `{Company ID} = "${companyId}"` })
      .firstPage();
    if (records.length === 0) return null;
    return records[0].fields['Member Type'];
  } catch (error) {
    console.error('Error checking Company ID:', error);
    throw new Error('Failed to verify Company ID.');
  }
}

// Check if Company ID exists and fetch member type(s)
async function checkCompanyIds(companyId) {
  const records = await base('NAHB Data')
    .select({ filterByFormula: `{Company ID} = '${companyId}'` })
    .firstPage();
  if (records.length === 0) {
    return null;
  }
  if (records.length > 1) {
    const values = records.map(record => record.fields['Member Type']);
    return { values, selected: values[0] };
  }
  return { values: [records[0].fields['Member Type']], selected: records[0].fields['Member Type'] };
}

// Helper to check if Company ID and Member Type exist together
async function checkCompanyIdAndMemberType(companyId, memberType) {
  try {
    const records = await base(process.env.AIRTABLE_TABLE_NAME2)
      .select({
        filterByFormula: `AND({Company ID} = '${companyId}', {Member Type} = '${memberType}')`
      })
      .firstPage();
    return records.length > 0;
  } catch (error) {
    console.error('Error checking Company ID and Member Type:', error);
    return false;
  }
}

// Update Airtable after creating a new Memberstack member
async function updateAirtableAfterCreatingMember(id, memberId, email, password, firstName, lastName) {
  // You can adjust which fields you want to update
  return base("Director Access").update(id, {
    "Member ID": memberId,
    "First Name": firstName,
    "Last Name": lastName,
    "Create Account": "Created/Updated"
  });
}

module.exports = {
  base,
  checkCompanyId,
  checkCompanyIds,
  checkCompanyIdAndMemberType,
  updateAirtableAfterCreatingMember
}; 