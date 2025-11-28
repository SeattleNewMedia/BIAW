const { base4 } = require('../config/airtable');

exports.submitWorkspaceForm = async (req, res) => {
  console.log('Workspace form controller called');
  console.log('Request body:', req.body);
  try {
    const formData = req.body;

    // Validate required fields
    if (!formData["First-Name"] || !formData["Last-Name"] || !formData["Email-Address"] || formData["First-Name-2"] || formData["Last-Name-2"]) {
      return res.status(400).json({ 
        message: "First Name, Last Name, and Email Address are required." 
      });
    }

    // Prepare record for Airtable
    const workspaceRecord = {
      "First Name": formData["First-Name"] || formData["First-Name-2"],
      "Last Name": formData["Last-Name"] ||  formData["Last-Name-2"],
      "Email": formData["Email-Address"] || formData["Email-Address-2"],
      "Phone": formData["Phone-Number"] || formData["Phone-Number-2"],
    };

    // Insert into Airtable base4
    const createdRecord = await base4('Workshop').create([
      {
        fields: workspaceRecord
      }
    ]);

    console.log("Workspace form record added:", createdRecord[0].id);

    // Send success response
    res.status(200).json({
      message: "Workspace form submitted successfully.",
      recordId: createdRecord[0].id
    });

  } catch (error) {
    console.error("Error submitting workspace form:", error);
    res.status(500).json({ 
      message: "Failed to submit workspace form.", 
      error: error.message 
    });
  }
}; 