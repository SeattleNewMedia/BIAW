const axios = require('axios');
const { AIRTABLE_CONFIG } = require('../config/database');

/**
 * Updates the Certificate Card attachment field for a Certification Records record.
 * @param {string} recordId - The Airtable record ID.
 * @param {string} fileUrl - The public URL of the certificate PDF.
 */
async function updateCertificateCardAttachment(recordId, fileUrl) {
  const tableName = 'Certification Records';
  const url = `${AIRTABLE_CONFIG.baseURL}/${encodeURIComponent(tableName)}/${recordId}`;
  const data = {
    fields: {
      "Certificate": [{ url: fileUrl }]
    }
  };
  await axios.patch(url, data, { headers: AIRTABLE_CONFIG.headers });
}

/**
 * Updates the Certificate attachment field for a Certification Records record.
 * @param {string} recordId - The Airtable record ID.
 * @param {string} fileUrl - The public URL of the certificate PDF.
 */
async function updateCertificateAttachment(recordId, fileUrl) {
  const tableName = 'Certification Records';
  const url = `${AIRTABLE_CONFIG.baseURL}/${encodeURIComponent(tableName)}/${recordId}`;
  const data = {
    fields: {
      "Certificate Card": [{ url: fileUrl }]
    }
  };
  await axios.patch(url, data, { headers: AIRTABLE_CONFIG.headers });
}

/**
 * Updates the Status field to "Certificate Created".
 * @param {string} recordId - The Airtable record ID.
 */
async function updateStatusToCertificateCreated(recordId) {
  const tableName = 'Certification Records';
  const url = `${AIRTABLE_CONFIG.baseURL}/${encodeURIComponent(tableName)}/${recordId}`;
  const data = {
    fields: {
      "Status": "Certificate Created"
    }
  };
  await axios.patch(url, data, { headers: AIRTABLE_CONFIG.headers });
}

/**
 * Creates a record in the CESCL Certified members table.
 * @param {Object} memberData - Object containing Name, Certificate ID, and Email.
 */
async function createCESCLCertifiedMember(memberData) {
  const tableName = 'CESCL Certified members';
  const url = `${AIRTABLE_CONFIG.baseURL}/${encodeURIComponent(tableName)}`;
  const data = {
    fields: {
      "Name": memberData.name,
      "Certificate ID": memberData.certificateId,
      "Email": memberData.email
    }
  };
  await axios.post(url, data, { headers: AIRTABLE_CONFIG.headers });
}

/**
 * Updates the Send mail notification and Send mail initial statement fields to "Mailed".
 * @param {string} recordId - The Airtable record ID.
 */
async function updateEmailStatusToMailed(recordId) {
  const tableName = 'Certification Records';
  const url = `${AIRTABLE_CONFIG.baseURL}/${encodeURIComponent(tableName)}/${recordId}`;
  const data = {
    fields: {
      "Send mail notification": "Mailed",
      "send mail initial statement": "Mailed"
    }
  };
  await axios.patch(url, data, { headers: AIRTABLE_CONFIG.headers });
}

/**
 * Directly uploads a PDF buffer as an attachment to Airtable (if supported).
 * @param {string} recordId - The Airtable record ID.
 * @param {Buffer} pdfBuffer - The PDF buffer.
 */
async function uploadPdfDirectToAirtable(recordId, pdfBuffer) {
  const tableName = 'Certification Records';
  const url = `${AIRTABLE_CONFIG.baseURL}/${encodeURIComponent(tableName)}/${recordId}`;
  const data = {
    fields: {
      "Certificate Card": [
        {
          filename: "certificate.pdf",
          bytes: pdfBuffer.toString('base64'),
          type: "application/pdf"
        }
      ]
    }
  };
  await axios.patch(url, data, { headers: AIRTABLE_CONFIG.headers });
}

module.exports = {
  updateCertificateCardAttachment,
  updateCertificateAttachment,
  updateStatusToCertificateCreated,
  createCESCLCertifiedMember,
  updateEmailStatusToMailed,
  uploadPdfDirectToAirtable
}; 