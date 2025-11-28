const { base6 } = require('../config/airtable');

// POST /track-click - Track user clicks
exports.trackClick = async (req, res) => {
  try {
    const { documentType, documentName, meetingName, userId, userEmail, slug } = req.body;
    
    // Validate required fields
    if (!documentType || !documentName) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        details: 'documentType and documentName are required' 
      });
    }
    
    // Handle null userId
    const finalUserId = userId && userId !== 'null' ? userId : 'anonymous_' + Date.now();

    // Validate documentType
    const validTypes = ['agenda', 'minutes', 'tab', 'both', 'name'];
    if (!validTypes.includes(documentType.toLowerCase())) {
      return res.status(400).json({ 
        error: 'Invalid document type', 
        details: 'documentType must be "agenda", "minutes", "tab", "both", or "name"' 
      });
    }

    // Check if user already has a record for the same document type and user
    let existingRecord = null;
    try {
      const allRecords = await base6("Minute and Agenda Tracking").select().all();
      
      // Find existing record based on user, document name, and slug logic
      existingRecord = allRecords.find(record => {
        const recordUserId = record.fields["User ID"];
        const recordSlug = record.fields["Slug"];
        const recordDocumentName = record.fields["Document Name"];
        
        // Match user ID first
        if (recordUserId !== finalUserId) {
          return false;
        }
        
        // For Agenda Tab (no slug), match by document name and user
        if (!slug && documentName === "Agenda Tab") {
          return recordDocumentName === "Agenda Tab" && (!recordSlug || recordSlug === null || recordSlug === "");
        }
        
        // For documents with slug, match by user + slug
        if (slug) {
          return recordSlug === slug;
        }
        
        // For other documents without slug, match by document name and user
        return recordDocumentName === documentName && (!recordSlug || recordSlug === null || recordSlug === "");
      });
    } catch (error) {
      console.error('Error checking existing records:', error.message);
    }

    // Create or update click tracking record
    let clickData;
    if (existingRecord) {
      // Update existing record - increment the specific column
      const currentMinutes = existingRecord.fields["Minutes"] || 0;
      const currentAgenda = existingRecord.fields["Agenda"] || 0;
      
      let updateFields = {
        "Click Date": new Date().toISOString().split('T')[0]
      };
      
      if (documentType.toLowerCase() === 'minutes') {
        updateFields["Minutes"] = currentMinutes + 1;
      } else if (documentType.toLowerCase() === 'agenda') {
        updateFields["Agenda"] = currentAgenda + 1;
      } else if (documentType.toLowerCase() === 'tab') {
        const currentNumbers = existingRecord.fields["Tab"] || 0;
        updateFields["Tab"] = currentNumbers + 1;
      } else if (documentType.toLowerCase() === 'both') {
        const currentAgendaMinutes = existingRecord.fields["Agenda-Minutes"] || 0;
        updateFields["Agenda-Minutes"] = currentAgendaMinutes + 1;
      } else if (documentType.toLowerCase() === 'name') {
        updateFields["Meeting Name"] = documentName;
      }
      
      clickData = {
        id: existingRecord.id,
        fields: updateFields
      };
    } else {
      // Create new record with initial counts
      let initialFields = {
        "Document Name": documentName,
        "Meeting Name": meetingName || "Unknown Meeting",
        "User ID": finalUserId,
        "Email": userEmail || "",
        "Click Date": new Date().toISOString().split('T')[0],
        "Minutes": 0,
        "Agenda": 0,
        "Tab": 0,
        "Agenda-Minutes": 0
      };
      
      // Add slug field if provided
      if (slug) {
        initialFields["Slug"] = slug;
      }
      
      if (documentType.toLowerCase() === 'minutes') {
        initialFields["Minutes"] = 1;
      } else if (documentType.toLowerCase() === 'agenda') {
        initialFields["Agenda"] = 1;
      } else if (documentType.toLowerCase() === 'tab') {
        initialFields["Tab"] = 1;
      } else if (documentType.toLowerCase() === 'both') {
        initialFields["Agenda-Minutes"] = 1;
      } else if (documentType.toLowerCase() === 'name') {
        initialFields["Meeting Name"] = documentName;
      }
      
      clickData = {
        fields: initialFields
      };
    }

    // Store in Airtable
    try {
      if (existingRecord) {
        await base6("Minute and Agenda Tracking").update([clickData]);
      } else {
        await base6("Minute and Agenda Tracking").create([clickData]);
      }
    } catch (airtableError) {
      console.error("Error storing click in Airtable:", airtableError.message);
      
      // Try fallback with basic fields
      try {
        const fallbackData = {
          fields: {
            "First Name": `Click: ${documentType}`,
            "Last Name": documentName,
            "Email": `tracking-${Date.now()}@biaw.com`,
            "Company": meetingName || "Unknown Meeting"
          }
        };
        
        await base6("Minute and Agenda Tracking").create([fallbackData]);
      } catch (fallbackError) {
        console.error("Error storing click in fallback:", fallbackError.message);
      }
    }

    res.status(200).json({ 
      message: 'Click tracked successfully',
      documentType,
      documentName,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Error tracking click:", error);
    res.status(500).json({ 
      error: 'Failed to track click', 
      details: error.message 
    });
  }
};

// GET /analytics/clicks - Get click analytics
exports.getClickAnalytics = async (req, res) => {
  try {
    const { startDate, endDate, documentType } = req.query;
    
    // Build filter formula for Airtable query
    let filterFormula = "";
    const conditions = [];
    
    if (startDate) {
      conditions.push(`IS_SAME({Click Date}, "${startDate}", "day")`);
    }
    if (endDate) {
      conditions.push(`IS_SAME({Click Date}, "${endDate}", "day")`);
    }
    if (documentType) {
      conditions.push(`{Document Type} = "${documentType}"`);
    }
    
    if (conditions.length > 0) {
      filterFormula = `AND(${conditions.join(", ")})`;
    }

    // Get click data from Airtable
    const records = await base6("Minute and Agenda Tracking")
      .select({ 
        filterByFormula: filterFormula || undefined,
        sort: [{ field: "Click Date", direction: "desc" }]
      })
      .all();

    // Process analytics data
    const analytics = {
      totalClicks: records.length,
      byDocumentType: {},
      byMeeting: {},
      byDate: {},
      recentClicks: []
    };

    records.forEach(record => {
      const fields = record.fields;
      const docType = fields["Document Type"];
      const meeting = fields["Meeting Name"];
      const clickDate = fields["Click Date"];
      
      // Count by document type
      analytics.byDocumentType[docType] = (analytics.byDocumentType[docType] || 0) + 1;
      
      // Count by meeting
      analytics.byMeeting[meeting] = (analytics.byMeeting[meeting] || 0) + 1;
      
      // Count by date
      const dateKey = clickDate ? clickDate.split('T')[0] : 'Unknown';
      analytics.byDate[dateKey] = (analytics.byDate[dateKey] || 0) + 1;
      
      // Add to recent clicks (last 10)
      if (analytics.recentClicks.length < 10) {
        analytics.recentClicks.push({
          documentType: docType,
          documentName: fields["Document Name"],
          meetingName: meeting,
          clickDate: clickDate,
          userId: fields["User ID"]
        });
      }
    });

    res.status(200).json({
      message: 'Analytics retrieved successfully',
      analytics,
      query: {
        startDate,
        endDate,
        documentType
      }
    });

  } catch (error) {
    console.error("Error getting click analytics:", error);
    res.status(500).json({ 
      error: 'Failed to get analytics', 
      details: error.message 
    });
  }
};
