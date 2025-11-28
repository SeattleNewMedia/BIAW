const Airtable = require('airtable');

// Configure Airtable
Airtable.configure({
  apiKey: process.env.AIRTABLE_API_KEY,
});

const base = Airtable.base(process.env.AIRTABLE_BASE_ID);

// Add support for additional Airtable bases
const base2 = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY2 }).base(process.env.AIRTABLE_BASE_ID2);
const base3 = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY3 }).base(process.env.AIRTABLE_BASE_ID3);

// Table names
const TABLES = {
  BIAW_CLASSES: 'Biaw Classes',
  PAYMENT_RECORDS: process.env.AIRTABLE_TABLE_NAME3 || 'Payment Records',
  MULTIPLE_CLASS_REGISTRATION: process.env.AIRTABLE_TABLE_NAME2,
  MEMBERS: 'Members',
  JOINT_WAITLIST: 'Joint waitlist',
  CATEGORY: 'Category',
  SPECIAL_CLASSES: process.env.AIRTABLE_TABLE_NAME5,
  CESCL_CLASS_REGISTERED_RECORDS: 'CESCL class registered records',
  MULTIPLE_CLASS_REGISTRATION: 'Multiple Class Registration',
  CARDS: 'Cards'
};

// API URLs and headers for direct API calls
const AIRTABLE_CONFIG = {
  baseURL: `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}`,
  headers: {
    Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  }
};

module.exports = {
  base,
  base2,
  base3,
  TABLES,
  AIRTABLE_CONFIG
}; 