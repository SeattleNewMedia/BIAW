// certificationCardMergeService.js

const { base, TABLES } = require('../config/database');
const axios = require('axios');

/**
 * Helper to format a date as MM.DD.YYYY
 */
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}.${d.getFullYear()}`;
}

/**
 * Helper to add years to a date string (YYYY-MM-DD)
 */
function addYears(dateStr, years) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().split('T')[0];
}

/**
 * Generates HTML for merged certification cards from a Cards table record.
 * @param {Object} cardsRecord - The Cards table record (with fields as shown).
 * @returns {string} - The HTML string for the merged cards.
 */
function generateMergedCertificationCardsHTML(cardsRecord) {
  const fields = cardsRecord.fields;
  const numCertificatesRaw = fields["Number of Certificate"];
  const numCertificates = parseInt(
    typeof numCertificatesRaw === 'object' && numCertificatesRaw !== null
      ? numCertificatesRaw.name
      : numCertificatesRaw,
    10
  ) || 0;
  const certNumbers = fields["Certification Number (from Certification Records)"] || [];
  const names = fields["Name (from Payment Records) (from Certification Records)"] || [];
  const certDates = fields["Certification Date (from Certification Records)"] || [];


  let cardsHTML = '';

  for (let i = 0; i < numCertificates; i++) {
    const certNum = certNumbers[i] || '';
    const name = names[i] || '';
    const certDate = certDates[i] || '';
    const certDateFormatted = certDate ? formatDate(certDate) : '';
    const expiryDate = certDate ? formatDate(addYears(certDate, 3)) : '';

    cardsHTML += `
    <div class="card">
      <div class="header">
        <img style="width:300px;" src="https://cdn.prod.website-files.com/67ae1136d7eaa77fd9fb8d4b/67e2f24464c4b4681915afb6_image%20(8).png" alt="BIAW Logo" class="logo" />
        <span class="id">ID ${certNum}</span>
      </div>
      <div class="name">${name}</div>
      <div class="description">Successfully Completed the Online CESCL (Certified Erosion & Sediment Control Lead) training and is hereby a</div>
      <div class="cert-title">Certified Erosion & Sediment Control Lead</div>
      <div class="dates">
        <p>Certified: ${certDateFormatted}</p>
        <p>Expires: ${expiryDate}</p>
      </div>
    </div>
    `;
  }

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Certification Cards</title>
  <style>
    .cards-container {
      display: flex;
      flex-wrap: wrap;
      gap: 20px;
      padding: 20px;
    }
    .card {
      height: auto;
      width: 340px;
      min-height: 210px;
      border: 1px solid #ccc;
      border-radius: 10px;
      padding: 15px;
      font-family: Arial, sans-serif;
      box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.2);
    }
    .header {
      display: flex;
      flex-direction: column;
      gap: 20px;
      align-items: center;
    }
    .logo {
      width: 80px;
    }
    .id {
      font-weight: bold;
      font-size: 14px;
    }
    .name {
      font-size: 18px;
      font-weight: bold;
      margin-top: 10px;
    }
    .description {
      font-size: 12px;
      font-style: italic;
      margin-top: 5px;
    }
    .cert-title {
      font-size: 14px;
      font-weight: bold;
      margin-top: 10px;
    }
    .dates {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <div class="cards-container">
    ${cardsHTML}
  </div>
</body>
</html>
  `;
}

/**
 * Optimized merged cards PDF creation and Airtable update using PDF.co.
 * @param {Object} cardsRecord - The Cards table record (with fields and id).
 * @returns {Promise<{pdfUrl: string, html: string}>} - The public URL of the uploaded PDF and the HTML.
 */
async function createAndAttachMergedCardsPDF_Optimized(cardsRecord) {
  console.log('Received request to merge cards for record:', cardsRecord.id);

  // 1. Validation
  if (!cardsRecord || !cardsRecord.fields) {
    throw new Error('Missing or invalid Cards record');
  }
  console.log('Validation passed.');

  // 2. Generate HTML
  const html = generateMergedCertificationCardsHTML(cardsRecord);
  console.log('Generated merged cards HTML.');
  console.log('HTML being sent to PDF.co:', html);

  // 3. Generate PDF and get public URL (using PDF.co directly here)
  console.log('Generating merged cards PDF with PDF.co...');
  const apiKey = "abin@seattlenewmedia.com_d268XjbXlJ4h1WPzB2rjqQxQwJsW6zlhhsFBjyJOm3QlOID3enULpC7k2oTbAYcX"; // Set your PDF.co API key in env
  const response = await axios.post(
    'https://api.pdf.co/v1/pdf/convert/from/html',
    {
      html: html,
      name: 'certificate.pdf',
      async: false,
      paperSize: 'A3',
      orientation: 'portrait'
    },
    {
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      }
    }
  );
  if (!response.data || !response.data.url) {
    throw new Error('PDF.co did not return a file URL');
  }
  const pdfUrl = response.data.url;
  console.log('PDF.co returned URL:', pdfUrl);

  // 4. Update Airtable Cards record
  await base(TABLES.CARDS).update(cardsRecord.id, {
    "Cards": [{ url: pdfUrl }],
    "Certificate create status": "Created"
  });
  console.log('Airtable Cards record updated with PDF URL and status.');

  return { pdfUrl, html };
}

module.exports = {
  generateMergedCertificationCardsHTML,
  createAndAttachMergedCardsPDF_Optimized,
}; 