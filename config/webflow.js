const WEBFLOW_CONFIG = {
  apiKey: process.env.WEBFLOW_API_KEY,
  headers: {
    Authorization: `Bearer ${process.env.WEBFLOW_API_KEY}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  collections: {
    CLASSES: process.env.WEBFLOW_COLLECTION_ID,
    PURCHASE_RECORDS: process.env.WEBFLOW_COLLECTION_ID2,
    CATEGORIES: process.env.WEBFLOW_COLLECTION_ID3
  },
  baseURL: 'https://api.webflow.com/v2/collections'
};

module.exports = WEBFLOW_CONFIG; 