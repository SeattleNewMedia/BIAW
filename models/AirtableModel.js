require('dotenv').config();
const Airtable = require('airtable');

class AirtableModel {
    constructor() {
        this.base = new Airtable({ apiKey: process.env.airtableApiKey }).base(process.env.airtableBaseId);
        this.table = process.env.airtableClassTableName;
    }

    async getRecord(recordId) {
        try {
            console.log('Fetching Airtable record:', recordId);
            const record = await this.base(this.table).find(recordId);
            return record;
        } catch (error) {
            console.error('Error fetching Airtable record:', error);
            return null;
        }
    }

    async getRecords() {
        try {
            console.log('Fetching Airtable records');
            const records = await this.base(this.table).select().all();
            return records;
        } catch (error) {
            console.error('Error fetching Airtable records:', error);
            return [];
        }
    }

    async updateRecord(recordId, fields) {
        try {
            console.log('Updating Airtable record:', recordId, fields);
            const record = await this.base(this.table).update(recordId, fields);
            return record;
        } catch (error) {
            console.error('Error updating Airtable record:', error);
            return null;
        }
    }

    async updateWebflowId(recordId, webflowId) {
        return this.updateRecord(recordId, { 'Webflow id': webflowId });
    }

    formatRecord(record) {
        // Properly extract image URL from Airtable response
        const imageUrl = record.fields['Award winner image']?.[0]?.url || '';
        
        return {
            name: record.fields.Name || '',
            slug: record.fields.Name
                ? record.fields.Name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
                : '',
            year: record.fields.Year || '',
            'award-winner-image': imageUrl,
            airtableid: record.id,
            webflowId: record.fields['Webflow id'] || ''
        };
    }
}

module.exports = new AirtableModel(); 