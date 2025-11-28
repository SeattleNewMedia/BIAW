const { createAndAttachMergedCardsPDF_Optimized } = require('../services/certificationCardMergeService');

/**
 * POST /merge-certification-cards
 * Expects: { ...cardsRecord }
 * Returns: PDF URL (debug info)
 */
async function mergeCertificationCards(req, res) {
  try {
    console.log('Received POST /api/merge-certification-cards');
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
    if (!record.fields["Number of Certificate"] || !record.fields["Certification Number (from Certification Records)"]) {
      console.log('Validation failed: Required fields missing');
      return res.status(400).json({ error: 'Required fields missing' });
    }
    console.log('Validation passed. Generating merged cards HTML for record:', record.id);

    // Generate PDF and update Airtable
    let pdfUrl;
    try {
      const result = await createAndAttachMergedCardsPDF_Optimized(record);
      pdfUrl = result.pdfUrl;
      console.log('PDF.co returned URL:', pdfUrl);
      console.log('Airtable record updated with PDF URL and status.');
    } catch (err) {
      console.error('Error during PDF generation or Airtable update:', err);
      return res.status(500).json({ error: 'PDF generation or Airtable update failed', details: err.message });
    }

    res.status(200).send({
      message: 'PDF created and attached to Airtable',
      pdfUrl
    });
  } catch (err) {
    console.error('Error in mergeCertificationCards:', err);
    return res.status(500).json({ error: 'Failed to generate merged certification cards.', details: err.message });
  }
}

module.exports = {
  mergeCertificationCards,
}; 