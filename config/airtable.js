const Airtable = require('airtable');

const base2 = new Airtable({ apiKey: process.env.AIRTABLE_API_KEYS }).base(process.env.AIRTABLE_BASE_ID1);
const base6 = new Airtable({ apiKey: process.env.AIRTABLE_API_KEYS3 }).base(process.env.AIRTABLE_BASE_ID3); // click tracking
const base4 = new Airtable({ apiKey: process.env.AIRTABLE_API_KEYS4 }).base(process.env.AIRTABLE_BASE_ID4);
const base5 = new Airtable({ apiKey: process.env.AIRTABLE_API_KEYS5 }).base(process.env.AIRTABLE_BASE_ID5);

module.exports = { base2, base4, base5, base6 }; 