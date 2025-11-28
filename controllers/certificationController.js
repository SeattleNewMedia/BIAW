const { generateCertificationHTML, generateCertificationCardHTML, htmlToPdfCoUrl } = require('../services/certificationService');
const { updateCertificateCardAttachment, updateCertificateAttachment, updateStatusToCertificateCreated, createCESCLCertifiedMember, updateEmailStatusToMailed } = require('../services/airtableService');
const { sendEmail } = require('../services/emailService');
const EmailService = require('../services/emailService');

class CertificationController {
  // POST /api/certification
  static async generateCertificate(req, res) {
    try {
      console.log('Received POST /api/certification');
      let record;
      if (Array.isArray(req.body.records) && req.body.records.length > 0) {
        record = req.body.records[0];
        console.log('Received Airtable payload as records array.');
      } else if (req.body.id && req.body.fields) {
        record = { id: req.body.id, fields: req.body.fields };
        console.log('Received Airtable payload as single record.');
      } else {
        console.log('No valid record(s) provided');
        return res.status(400).json({ error: 'No valid record(s) provided' });
      }

      // Validation
      const fields = record.fields;
      const certificationDate = fields['Certification Date'];
      const paymentStatus = fields['Payment status (from Payment Records)'];
      const certificateCard = fields['Certificate Card'];

      // Check if Certification Date is available
      if (!certificationDate) {
        console.log('Validation failed: Certification Date is missing');
        return res.status(400).json({ error: 'Certification Date is required' });
      }

      // Check if Payment Records status is "Paid"
      if (!paymentStatus || !paymentStatus.includes('Paid')) {
        console.log('Validation failed: Payment status is not Paid');
        return res.status(400).json({ error: 'Payment status must be Paid' });
      }

      // Check if Certificate Card field is empty
      if (certificateCard && certificateCard.length > 0) {
        console.log('Validation failed: Certificate Card field is not empty');
        return res.status(400).json({ error: 'Certificate Card field must be empty' });
      }

      console.log('Validation passed. Generating HTML for record:', record.id || '[no id]', fields?.['Name (from Payment Records)']);
      
      // Generate both certificate and card HTML
      const certificateHtml = await generateCertificationHTML(record);
      const cardHtml = await generateCertificationCardHTML(record);

      // Generate and host both PDFs with PDF.co
      console.log('Generating certificate PDF with PDF.co...');
      const certificatePdfUrl = await htmlToPdfCoUrl(certificateHtml);
      console.log('Certificate PDF.co returned URL:', certificatePdfUrl);

      console.log('Generating certificate card PDF with PDF.co...');
      const cardPdfUrl = await htmlToPdfCoUrl(cardHtml);
      console.log('Card PDF.co returned URL:', cardPdfUrl);

      // Update Airtable with both PDF URLs
      await updateCertificateCardAttachment(record.id, certificatePdfUrl);
      await updateCertificateAttachment(record.id, cardPdfUrl);
      console.log('Airtable record updated with both PDF URLs.');

      // Update status to "Certificate Created"
      await updateStatusToCertificateCreated(record.id);
      console.log('Status updated to Certificate Created.');

      // Create record in CESCL Certified members table
      const memberData = {
        name: Array.isArray(fields['Name (from Payment Records)']) ? fields['Name (from Payment Records)'][0] : '',
        certificateId: fields['Certification Number'] || '',
        email: Array.isArray(fields['Email (from Payment Records)']) ? fields['Email (from Payment Records)'][0] : ''
      };
      await createCESCLCertifiedMember(memberData);
      console.log('CESCL Certified member record created.');

      return res.status(200).json({ 
        success: true, 
        certificatePdfUrl,
        cardPdfUrl,
        memberData
      });
    } catch (err) {
      console.error('Error in /api/certification:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // POST /api/send-certificate-email
  static async sendCertificateEmail(req, res) {
    try {
      console.log('Received POST /api/send-certificate-email');
      let record;
      if (Array.isArray(req.body.records) && req.body.records.length > 0) {
        record = req.body.records[0];
        console.log('Received Airtable payload as records array.');
      } else if (req.body.id && req.body.fields) {
        record = { id: req.body.id, fields: req.body.fields };
        console.log('Received Airtable payload as single record.');
      } else {
        console.log('No valid record(s) provided');
        return res.status(400).json({ error: 'No valid record(s) provided' });
      }

      const fields = record.fields;
      const certificateCard = fields['Certificate Card'];
      const certificate = fields['Certificate'];
      const email = Array.isArray(fields['Email (from Payment Records)']) ? fields['Email (from Payment Records)'][0] : '';
      const name = Array.isArray(fields['Name (from Payment Records)']) ? fields['Name (from Payment Records)'][0] : '';

      // Check if certificates exist
      if (!certificateCard || certificateCard.length === 0) {
        console.log('Validation failed: Certificate Card not found');
        return res.status(400).json({ error: 'Certificate Card not found' });
      }

      if (!certificate || certificate.length === 0) {
        console.log('Validation failed: Certificate not found');
        return res.status(400).json({ error: 'Certificate not found' });
      }

      if (!email) {
        console.log('Validation failed: Email not found');
        return res.status(400).json({ error: 'Email not found' });
      }

      // Send email with both certificates using the new template
      const certificationData = {
        name: name,
        company: Array.isArray(fields['Company Name (from Payment Records) 2']) ? fields['Company Name (from Payment Records) 2'][0] : '',
        address: Array.isArray(fields['Address (from Payment Records)']) ? fields['Address (from Payment Records)'] : [],
        lastModified: fields['Last Modified'] || new Date().toISOString()
      };

      await EmailService.sendCertificationEmailWithAttachments(email, certificationData, [
        {
          filename: 'CESCL_Certification_Card.pdf',
          url: certificateCard[0].url
        },
        {
          filename: 'CESCL_Certification.pdf',
          url: certificate[0].url
        }
      ]);
      console.log('Certificate email sent successfully to:', email);

      // Update email status fields to "Mailed"
      await updateEmailStatusToMailed(record.id);
      console.log('Email status fields updated to Mailed.');

      return res.status(200).json({ 
        success: true, 
        message: 'Certificate email sent successfully',
        email: email
      });
    } catch (err) {
      console.error('Error in /api/send-certificate-email:', err);
      return res.status(500).json({ error: err.message });
    }
  }


}

module.exports = CertificationController; 