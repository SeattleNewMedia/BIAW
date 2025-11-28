const moment = require('moment');
const puppeteer = require('puppeteer');
const axios = require('axios');
const FormData = require('form-data');
const EmailService = require('./emailService');

/**
 * Generates a certification HTML from Airtable webhook data.
 * @param {Object} record - The Airtable record object.
 * @returns {string} - The filled HTML string.
 */
async function generateCertificationHTML(record) {
  const fields = record.fields;

  // Extract fields with fallback/defaults
  const certificationNumber = fields['Certification Number'] || '';
  const name = Array.isArray(fields['Name (from Payment Records)']) ? fields['Name (from Payment Records)'][0] : '';
  const certificationDate = fields['Certification Date'] || '';
  const formattedDate = certificationDate ? moment(certificationDate).format('MM.DD.YYYY') : '';

  // Fetch class name from Biaw Classes if possible
  let className = 'Online CESCL Certification';
  const classId = fields['Biaw Classes (from Payment Records) (from Payment Records)']?.[0];
  if (classId) {
    try {
      const classRecord = await require('../config/database').base('Biaw Classes').find(classId);
      className = classRecord.fields['Name'] || className;
    } catch (e) {
      // fallback to default
    }
  }

  // HTML template
  return `
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <title>Recertification Certificate</title>
    <style>
        body { font-family: 'Times New Roman', serif; margin: 0; padding: 0; background-color: #f4f4f4; }
        .email-container { width: 90%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 25px solid #003954; }
        .inner-border { border: 2px solid red; padding: 15px; }
        .header { text-align: center; font-size: 24px; font-weight: bold; }
        .certificate-body { text-align: center; padding: 0px 0px; }
        .class-name { font-size: 32px; font-weight: bold; color: #000; margin: 20px; }
        .name{ font-size: 32px; font-weight: bold; color: #000; margin: 0; }
        .certification-tag{ font-size: 22px; font-weight: bold; color: #000; }
        .details { font-size: 16px; color: #666; }
        .footer { text-align: center; font-size: 14px; color: #999; padding-top: 20px; }
        span{ color: #000; font-weight: 700; }
        .line{ width: 80%; height: 2px; background-color: #797979; margin: 0 auto; }
        .certificate-id{ font-weight: 700; }
        @media screen and (max-width: 600px) { .email-container { padding: 10px; } }
    </style>
</head>
<body>
    <table class="email-container" cellpadding="0" cellspacing="0" width="100%">
        <tr>
            <td>
                <table class="inner-border" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                        <td class="certificate-body">
                            <img src="https://cdn.prod.website-files.com/67ae1136d7eaa77fd9fb8d4b/67e1a291a2d745dbd9e12186_image%2080.png" alt="" />
                            <p class="certificate-id">${certificationNumber}</p>
                            <p class="class-name">${className === 'Online CESCL Recertification' ? 'Online CESCL Recertification' : 'Online CESCL Certification'}</p>
                            <p class="certification-tag">Certification Completion</p>
                            <p>Presented to</p>
                            <p class="name">${name}</p>
                        </td>
                    </tr>
                    <tr>
                      <td align="center">
                        <div class="line"></div>
                      </td>
                    </tr>
                    <tr>
                       <td class="certificate-body">
                         <p class="details">For successfully completing Online CESCL Certification<br> on <span>${formattedDate}</span> from <span>08:00 to 05:00</span></p>
                          <p class="details">Presented by <span>Alex Zimmerman, Creative Courses LLC</span></p>
                       </td>
                    </tr>
                    <tr>
                        <td class="footer">&copy; 2025 Creative Courses LLC</td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
  `;
}

/**
 * Generates a certification card HTML from Airtable webhook data.
 * @param {Object} record - The Airtable record object.
 * @returns {string} - The filled HTML string for the card.
 */
function generateCertificationCardHTML(record) {
  const fields = record.fields;
  const certificationNumber = fields['Certification Number'] || '';
  const name = Array.isArray(fields['Name (from Payment Records)']) ? fields['Name (from Payment Records)'][0] : '';
  const certificationDate = fields['Certification Date'] || '';
  const formattedDate = certificationDate ? moment(certificationDate).format('MM.DD.YYYY') : '';
  const expiryDate = certificationDate ? moment(certificationDate).add(3, 'years').format('MM.DD.YYYY') : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Certification Card</title>
    <style>
        .card {
            width: 340px;
            height: 210px;
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
        img{
          width: 500px
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="header">
            <img style="width:300px;" src="https://cdn.prod.website-files.com/67ae1136d7eaa77fd9fb8d4b/67e2f24464c4b4681915afb6_image%20(8).png" alt="BIAW Logo" class="logo">
            <span class="id">ID ${certificationNumber}</span>
        </div>
        <div class="name">${name}</div>
        <div class="description">Successfully Completed the Online CESCL (Certified Erosion & Sediment Control Lead) training and is hereby a</div>
        <div class="cert-title">Certified Erosion & Sediment Control Lead</div>
        <div class="dates">
            <p>Certified: ${formattedDate}</p>
            <p>Expires: ${expiryDate}</p>
        </div>
    </div>
</body>
</html>
  `;
}

/**
 * Converts HTML to PDF and returns the PDF buffer.
 * @param {string} html - The HTML string to convert.
 * @returns {Buffer} - The PDF buffer.
 */
async function htmlToPdfBuffer(html) {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
  await browser.close();
  return pdfBuffer;
}



/**
 * Uploads a PDF buffer to GoFile and returns the direct file URL.
 * @param {Buffer} pdfBuffer - The PDF buffer to upload.
 * @returns {Promise<string>} - The direct URL of the uploaded PDF.
 */
async function uploadPdfToGoFile(pdfBuffer) {
  const form = new FormData();
  form.append('file', pdfBuffer, { filename: 'certificate.pdf', contentType: 'application/pdf' });
  const response = await axios.post('https://store1.gofile.io/uploadFile', form, { headers: form.getHeaders() });
  if (response.data && response.data.status === 'ok') {
    console.log('GoFile returned direct file URL:', response.data.data.directLink);
    return response.data.data.directLink;
  } else {
    console.error('gofile.io did not return a valid file URL:', response.data);
    throw new Error('gofile.io did not return a file URL');
  }
}

/**
 * Converts HTML to PDF using PDF.co and returns the public URL.
 * @param {string} html - The HTML string to convert.
 * @returns {Promise<string>} - The public URL of the generated PDF.
 */
async function htmlToPdfCoUrl(html) {
  const apiKey = "abin@seattlenewmedia.com_d268XjbXlJ4h1WPzB2rjqQxQwJsW6zlhhsFBjyJOm3QlOID3enULpC7k2oTbAYcX"; // Set your PDF.co API key in env
  const response = await axios.post(
    'https://api.pdf.co/v1/pdf/convert/from/html',
    {
      html: html,
      name: 'certificate.pdf',
      async: false
    },
    {
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      }
    }
  );
  if (response.data && response.data.url) {
    return response.data.url;
  } else {
    throw new Error('PDF.co did not return a file URL');
  }
}

/**
 * Extracts certification data from Airtable record for email sending.
 * @param {Object} record - The Airtable record object.
 * @returns {Object} - The formatted certification data.
 */
function extractCertificationData(record) {
  const fields = record.fields;
  
  return {
    name: Array.isArray(fields['Name (from Payment Records)']) ? fields['Name (from Payment Records)'][0] : '',
    company: Array.isArray(fields['Company Name (from Payment Records) 2']) ? fields['Company Name (from Payment Records) 2'][0] : '',
    address: Array.isArray(fields['Address (from Payment Records)']) ? fields['Address (from Payment Records)'] : [],
    lastModified: fields['Last Modified'] || new Date().toISOString(),
    certificationNumber: fields['Certification Number'] || '',
    certificationDate: fields['Certification Date'] || '',
    email: fields['Email (from Payment Records)'] || ''
  };
}

/**
 * Sends certification email with generated PDF attachments.
 * @param {Object} record - The Airtable record object.
 * @returns {Promise<Object>} - The email sending result.
 */
async function sendCertificationEmailWithAttachments(record) {
  try {
    const certificationData = extractCertificationData(record);
    
    if (!certificationData.email) {
      throw new Error('No email address found in certification record');
    }

    // Generate certification HTML
    const certificationHTML = await generateCertificationHTML(record);
    const cardHTML = generateCertificationCardHTML(record);

    // Convert to PDFs
    const certificationPdfBuffer = await htmlToPdfBuffer(certificationHTML);
    const cardPdfBuffer = await htmlToPdfBuffer(cardHTML);

    // Upload PDFs to get URLs
    const certificationPdfUrl = await uploadPdfToGoFile(certificationPdfBuffer);
    const cardPdfUrl = await uploadPdfToGoFile(cardPdfBuffer);

    // Prepare attachments
    const attachments = [
      {
        filename: `CESCL_Certification_${certificationData.certificationNumber}.pdf`,
        url: certificationPdfUrl
      },
      {
        filename: `CESCL_Card_${certificationData.certificationNumber}.pdf`,
        url: cardPdfUrl
      }
    ];

    // Send email with attachments
    const result = await EmailService.sendCertificationEmailWithAttachments(
      certificationData.email,
      certificationData,
      attachments
    );

    console.log(`Certification email with attachments sent successfully to ${certificationData.email}`);
    return result;
  } catch (error) {
    console.error('Error sending certification email with attachments:', error);
    throw error;
  }
}

/**
 * Sends certification email without attachments (just the email template).
 * @param {Object} record - The Airtable record object.
 * @returns {Promise<Object>} - The email sending result.
 */
async function sendCertificationEmail(record) {
  try {
    const certificationData = extractCertificationData(record);
    
    if (!certificationData.email) {
      throw new Error('No email address found in certification record');
    }

    // Send email without attachments
    const result = await EmailService.sendCertificationEmail(
      certificationData.email,
      certificationData
    );

    console.log(`Certification email sent successfully to ${certificationData.email}`);
    return result;
  } catch (error) {
    console.error('Error sending certification email:', error);
    throw error;
  }
}

module.exports = {
  generateCertificationHTML,
  generateCertificationCardHTML,
  htmlToPdfBuffer,
  htmlToPdfCoUrl,
  sendCertificationEmailWithAttachments,
  sendCertificationEmail
}; 