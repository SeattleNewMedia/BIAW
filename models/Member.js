const { base, TABLES } = require('../config/database');
const { logError } = require('../utils/helpers');

class Member {
  // Validate member ID
  static async validateMemberId(memberId) {
    try {
      if (!memberId) {
        throw new Error("Member ID is required.");
      }

      const records = await base(TABLES.MEMBERS)
        .select({
          filterByFormula: `{Member ID} = '${memberId}'`,
          maxRecords: 1,
        })
        .firstPage();

      if (records.length === 0) {
        throw new Error(`Invalid Member ID: ${memberId}. No matching record found in the Members table.`);
      }

      return records[0].id; // Return Airtable record ID
    } catch (error) {
      logError("Validating member ID", error);
      throw error;
    }
  }

  // Get member by ID
  static async getMemberById(memberId) {
    try {
      const records = await base(TABLES.MEMBERS)
        .select({
          filterByFormula: `{Member ID} = '${memberId}'`,
          maxRecords: 1,
        })
        .firstPage();

      return records.length > 0 ? records[0] : null;
    } catch (error) {
      logError("Getting member by ID", error);
      throw error;
    }
  }
}

module.exports = Member; 