const AirtableModel = require('../models/AirtableModel');
const AwardsWebflowClassModel = require('../models/AwardsWebflowClassModel');
const slugify = require('slugify');

class AwardsClassSyncController {
    async processWebhook(webhookData, awardNameId) {
        console.log('Processing webhook with data:', { webhookData, awardNameId });
        
        // Validate year field
        const year = webhookData.fields.Year;
        if (!year || !/^\d{4}$/.test(year)) {
            console.error('Invalid year format:', year);
            return { error: 'Year must be exactly 4 digits (e.g., 2024)' };
        }

        // Validate name field
        const name = webhookData.fields.Name;
        if (!name || !/^[a-zA-Z\s]+$/.test(name)) {
            console.error('Invalid name format:', name);
            return { error: 'Name must contain only letters and spaces' };
        }

        const webflowId = webhookData.fields['Webflow id'];
        if (!webflowId) {
            console.log('No Webflow ID found, creating new item');
            return await this.createWebflowItem(webhookData, awardNameId);
        }
        console.log('Found Webflow ID:', webflowId);
        const webflowItem = await AwardsWebflowClassModel.getItem(webflowId);
        if (!webflowItem) {
            console.log('Webflow item not found, creating new item');
            return await this.createWebflowItem(webhookData, awardNameId);
        }
        console.log('Found existing Webflow item:', webflowItem);
        return await this.updateWebflowItem(webflowId, webhookData, awardNameId);
    }

    async syncAllRecords(airtableRecords, awardNameId) {
        const results = { created: 0, updated: 0, errors: 0 };
        for (const airtableRecord of airtableRecords) {
            try {
                const webflowId = airtableRecord.fields['Webflow id'];
                if (!webflowId) {
                    const result = await this.createWebflowItem(airtableRecord, awardNameId);
                    if (result) results.created++; else results.errors++;
                } else {
                    const webflowItem = await AwardsWebflowClassModel.getItem(webflowId);
                    if (webflowItem) {
                        const result = await this.updateWebflowItem(webflowId, airtableRecord, awardNameId);
                        if (result) results.updated++; else results.errors++;
                    } else {
                        const result = await this.createWebflowItem(airtableRecord, awardNameId);
                        if (result) results.created++; else results.errors++;
                    }
                }
            } catch (error) {
                results.errors++;
            }
        }
        await this.cleanupOrphanedItems();
        return results;
    }

    async createWebflowItem(airtableRecord, awardNameId) {
        const fields = this.prepareFields(airtableRecord.fields, awardNameId);
        const result = await AwardsWebflowClassModel.createItem(fields);
        if (result) {
            await AirtableModel.updateRecord(airtableRecord.id, { 'Webflow id': result.id });
            return result;
        }
        return null;
    }

    async updateWebflowItem(webflowId, airtableRecord, awardNameId) {
        console.log('Updating Webflow item:', { webflowId, airtableRecord, awardNameId });
        const fields = this.prepareFields(airtableRecord.fields, awardNameId);
        console.log('Prepared fields for update:', fields);
        const result = await AwardsWebflowClassModel.updateItem(webflowId, fields);
        console.log('Update result:', result);
        return result;
    }

    prepareFields(fields, awardNameId) {
        // Generate a unique slug by appending a timestamp
        const baseSlug = slugify(fields.Name || '', { lower: true });
        const uniqueSlug = `${baseSlug}-${Date.now().toString(36)}`;

        const preparedFields = {
            name: fields.Name || '',
            slug: uniqueSlug,
            'company-name': fields['Company Name'] || fields['Organization'] || '',
            'award-name': awardNameId,
            year: fields.Year || ''
        };
        console.log('Prepared fields:', preparedFields);
        return preparedFields;
    }

    async cleanupOrphanedItems() {
        try {
            console.log('Starting cleanup of orphaned Webflow items');
            
            // Get all records from all three tables
            const builderRecords = await AirtableModel.getRecords(process.env.airtableClassTableName2);
            const remodelerRecords = await AirtableModel.getRecords(process.env.airtableClassTableName3);
            const associateRecords = await AirtableModel.getRecords(process.env.airtableClassTableName4);

            // Get all Webflow items
            const webflowItems = await AwardsWebflowClassModel.getRecords();
            
            // Create a set of all Webflow IDs from Airtable
            const airtableWebflowIds = new Set([
                ...builderRecords.map(record => record.fields['Webflow id']),
                ...remodelerRecords.map(record => record.fields['Webflow id']),
                ...associateRecords.map(record => record.fields['Webflow id'])
            ].filter(id => id)); // Filter out null/undefined

            console.log(`Found ${webflowItems.length} Webflow items and ${airtableWebflowIds.size} Airtable records with Webflow IDs`);
            
            // Find Webflow items that don't exist in Airtable
            const orphanedItems = webflowItems.filter(item => !airtableWebflowIds.has(item.id));
            
            console.log(`Found ${orphanedItems.length} orphaned Webflow items`);
            
            // Set orphaned items to draft
            for (const item of orphanedItems) {
                console.log(`Setting orphaned item to draft: ${item.id}`);
                await AwardsWebflowClassModel.setToDraft(item.id);
            }
            
            return {
                totalChecked: webflowItems.length,
                orphanedFound: orphanedItems.length
            };
        } catch (error) {
            console.error('Error in cleanupOrphanedItems:', error);
            throw error;
        }
    }
}

module.exports = new AwardsClassSyncController(); 