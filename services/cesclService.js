const { base, TABLES } = require('../config/database');

class CESCLService {
  /**
   * Check if a class is a CESCL class
   * @param {string} className - The name of the class
   * @returns {boolean} - True if it's a CESCL class
   */
  static isCESCLClass(className) {
    const cesclClasses = [
      'Online CESCL Recertification',
      'Online CESCL (Certified Erosion & Sediment Control Lead)'
    ];
    return cesclClasses.includes(className);
  }

  /**
   * Extract CESCL-specific data from registration fields for multiple participants
   * @param {Object} fields - Registration fields from the request
   * @returns {Array} - Array of CESCL data for each participant
   */
  static extractCESCLData(fields) {
    const cesclDataArray = [];

    for (let i = 1; i <= 10; i++) {
      const name = fields[`P${i}-Name`];
      const email = fields[`P${i}-Email`];
      const phone = fields[`P${i}-Phone-number`] || fields[`P${i}-Phone-Number`];

      // Only process if participant has a name
      if (name) {
        const cesclData = {
          participantIndex: i,
          name: name,
          email: email,
          phone: phone,
          address: i === 1 ? (fields['Address'] || '') : (fields[`A${i}-Address`] || ''),
          companyName: fields[`Company-Name-${i}`] || '',
          certifyNumber: fields[`certify-number-${i}`] || ''
        };
        cesclDataArray.push(cesclData);
      }
    }

    return cesclDataArray;
  }

  /**
   * Create a record in the CESCL class registered records table
   * @param {Object} data - Data for the CESCL record
   * @returns {Object} - Created record
   */
  static async createCESCLRecord(data) {
    try {
      const record = {
        "Name": data.name,
        "Email": data.email,
        "Phone Number": data.phone,
        "Address": data.address,
        "Company Name": data.companyName,
        "Old certificate number": data.certifyNumber,
        "Payment status": data.paymentStatus,
        "Payment Records": data.paymentRecordId ? [data.paymentRecordId] : [],
        "Multiple class registration record id": data.multipleClassRegistrationId || ""
      };

      const createdRecord = await base(TABLES.CESCL_CLASS_REGISTERED_RECORDS).create(record);
      console.log('CESCL record created for participant:', data.name, createdRecord.id);
      return createdRecord;
    } catch (error) {
      console.error('Error creating CESCL record:', error);
      throw error;
    }
  }

  /**
   * Process CESCL registration data for multiple participants
   * @param {Object} fields - Registration fields
   * @param {Object} paymentRecord - Payment record data
   * @param {string} biawClassId - BIAW class ID
   * @param {Array} multipleClassRegistrationIds - Array of multiple class registration IDs
   * @returns {Array} - Array of created CESCL records
   */
  static async processCESCLRegistration(fields, paymentRecord, biawClassId, multipleClassRegistrationIds = []) {
    try {
      // Get class name from BIAW Classes table
      const biawClassRecord = await base(TABLES.BIAW_CLASSES)
        .find(biawClassId);

      if (!biawClassRecord) {
        console.log('BIAW class record not found for ID:', biawClassId);
        return [];
      }

      const className = biawClassRecord.fields['Name'];
      
      // Check if this is a CESCL class
      if (!this.isCESCLClass(className)) {
        console.log('Not a CESCL class:', className);
        return [];
      }

      console.log('Processing CESCL registration for class:', className);

      // Extract CESCL data for all participants
      const cesclDataArray = this.extractCESCLData(fields);
      
      if (cesclDataArray.length === 0) {
        console.log('No participants found with names');
        return [];
      }

      const createdRecords = [];

      // Process each participant
      for (let i = 0; i < cesclDataArray.length; i++) {
        const cesclData = cesclDataArray[i];
        const participantIndex = cesclData.participantIndex;

        // Validate required fields based on class type
        if (className === 'Online CESCL Recertification') {
          if (!cesclData.address || !cesclData.companyName || !cesclData.certifyNumber) {
            console.log(`Missing required fields for participant ${participantIndex} in Online CESCL Recertification`);
            continue; // Skip this participant but continue with others
          }
        } else if (className === 'Online CESCL (Certified Erosion & Sediment Control Lead)') {
          if (!cesclData.address || !cesclData.companyName) {
            console.log(`Missing required fields for participant ${participantIndex} in Online CESCL`);
            continue; // Skip this participant but continue with others
          }
        }

        // Create CESCL record for this participant
        const cesclRecordData = {
          name: cesclData.name,
          email: cesclData.email,
          phone: cesclData.phone,
          address: cesclData.address,
          companyName: cesclData.companyName,
          certifyNumber: cesclData.certifyNumber,
          paymentStatus: "Paid",
          paymentRecordId: paymentRecord.id,
          biawClassId: biawClassId,
          multipleClassRegistrationId: multipleClassRegistrationIds[i] || ""
        };

        try {
          const cesclRecord = await this.createCESCLRecord(cesclRecordData);
          createdRecords.push(cesclRecord);
          
          // Update the Multiple Class Registration record with the CESCL record ID
          try {
            await base(TABLES.MULTIPLE_CLASS_REGISTRATION).update(cesclRecordData.multipleClassRegistrationId, {
              "CESCL class registration table record ID ": cesclRecord.id
            });
            console.log(`Updated Multiple Class Registration record ${cesclRecordData.multipleClassRegistrationId} with CESCL record ID: ${cesclRecord.id}`);
          } catch (updateError) {
            console.error(`Error updating Multiple Class Registration record ${cesclRecordData.multipleClassRegistrationId} with CESCL record ID:`, updateError);
          }
        } catch (error) {
          console.error(`Error creating CESCL record for participant ${participantIndex}:`, error);
          // Continue with other participants even if one fails
        }
      }

      console.log(`Created ${createdRecords.length} CESCL records for ${cesclDataArray.length} participants`);
      return createdRecords;
    } catch (error) {
      console.error('Error processing CESCL registration:', error);
      return [];
    }
  }

  /**
   * Process CESCL registration after payment completion
   * @param {Object} paymentRecord - Payment record data
   * @param {string} biawClassId - BIAW class ID
   * @param {Array} multipleClassRegistrationIds - Array of multiple class registration IDs
   * @returns {Array} - Array of created CESCL records
   */
  static async processCESCLRegistrationAfterPayment(paymentRecord, biawClassId, multipleClassRegistrationIds = []) {
    try {
      // Get class name from BIAW Classes table
      const biawClassRecord = await base(TABLES.BIAW_CLASSES)
        .find(biawClassId);

      if (!biawClassRecord) {
        console.log('BIAW class record not found for ID:', biawClassId);
        return [];
      }

      const className = biawClassRecord.fields['Name'];
      
      // Check if this is a CESCL class
      if (!this.isCESCLClass(className)) {
        console.log('Not a CESCL class:', className);
        return [];
      }

      console.log('Processing CESCL registration after payment for class:', className);

      // Get participant data from multiple class registration records
      const participantData = [];
      for (const registrationId of multipleClassRegistrationIds) {
        try {
          const registrationRecord = await base(TABLES.MULTIPLE_CLASS_REGISTRATION)
            .find(registrationId);
          
          if (registrationRecord && registrationRecord.fields.Name) {
            participantData.push({
              name: registrationRecord.fields.Name,
              email: registrationRecord.fields.Email || '',
              phone: registrationRecord.fields['Phone Number'] || '',
              address: registrationRecord.fields['Address'] || '',
              companyName: registrationRecord.fields['Company Name'] || '',
              certifyNumber: registrationRecord.fields['Old CESCL certificate number '] || '', 
              multipleClassRegistrationId: registrationId
            });
          }
        } catch (error) {
          console.error(`Error fetching registration record ${registrationId}:`, error);
        }
      }

      if (participantData.length === 0) {
        console.log('No participants found in registration records');
        return [];
      }

      const createdRecords = [];

      // Create CESCL records for each participant
      for (const participant of participantData) {
        const cesclRecordData = {
          name: participant.name,
          email: participant.email,
          phone: participant.phone,
          address: participant.address,
          companyName: participant.companyName,
          certifyNumber: participant.certifyNumber,
          paymentStatus: "Paid",
          paymentRecordId: paymentRecord.id,
          biawClassId: biawClassId,
          multipleClassRegistrationId: participant.multipleClassRegistrationId
        };

        try {
          const cesclRecord = await this.createCESCLRecord(cesclRecordData);
          createdRecords.push(cesclRecord);
          console.log(`Created CESCL record for participant: ${participant.name}`);
          
          // Update the Multiple Class Registration record with the CESCL record ID
          try {
            await base(TABLES.MULTIPLE_CLASS_REGISTRATION).update(participant.multipleClassRegistrationId, {
              "CESCL class registration table record ID ": cesclRecord.id
            });
            console.log(`Updated Multiple Class Registration record ${participant.multipleClassRegistrationId} with CESCL record ID: ${cesclRecord.id}`);
          } catch (updateError) {
            console.error(`Error updating Multiple Class Registration record ${participant.multipleClassRegistrationId} with CESCL record ID:`, updateError);
          }
        } catch (error) {
          console.error(`Error creating CESCL record for participant ${participant.name}:`, error);
        }
      }

      console.log(`Created ${createdRecords.length} CESCL records after payment completion`);
      return createdRecords;
    } catch (error) {
      console.error('Error processing CESCL registration after payment:', error);
      return [];
    }
  }
}

module.exports = CESCLService; 