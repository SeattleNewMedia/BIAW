const AirtableModel = require('../models/AirtableModel');
const WebflowModel = require('../models/WebflowModel');
const crypto = require('crypto');

class SyncController {
    constructor() {
        this.airtableModel = AirtableModel;
        this.webflowModel = WebflowModel;
        this.lastSyncTime = null;
        this.nextSyncTime = null;
    }

    async getImageHash(url) {
        if (!url) return null;
        
        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.error(`Failed to fetch image from ${url}:`, response.statusText);
                return null;
            }
            const buffer = await response.arrayBuffer();
            const hash = crypto.createHash('md5').update(Buffer.from(buffer)).digest('hex');
            return hash;
        } catch (error) {
            console.error(`Error fetching or hashing image: ${error.message}`);
            return null;
        }
    }

    async hasDifferences(airtableFields, webflowFields) {
        if (!airtableFields || !webflowFields) return true;

        const nameDiff = airtableFields.name !== webflowFields.name;
        const yearDiff = airtableFields.year !== webflowFields.year;

        const airtableImageUrl = airtableFields['award-winner-image'];
        const webflowImageUrl = webflowFields['award-winner-image'];
        let imageDiff = false;

        if (airtableImageUrl || webflowImageUrl) {
            const airtableHash = airtableImageUrl ? await this.getImageHash(airtableImageUrl) : null;
            const webflowHash = webflowImageUrl ? await this.getImageHash(webflowImageUrl) : null;
            imageDiff = airtableHash !== webflowHash;
        }

        return nameDiff || yearDiff || imageDiff;
    }

    async processWebhook(webhookData) {
        try {
            console.log('Processing webhook data:', webhookData);

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

            // Prepare fields and check for image validation error
            const fields = this.prepareFields(webhookData.fields);
            if (fields.error) {
                console.error('Image validation error:', fields.error);
                return { error: fields.error };
            }

            const webflowId = webhookData.fields['Webflow id'];
            let result;

            // If no Webflow ID, create new item
            if (!webflowId) {
                console.log('No Webflow ID found, creating new item');
                result = await this.createWebflowItem(webhookData);
            } else {
                // Check if Webflow item exists
                const webflowItem = await this.webflowModel.getItem(webflowId);
                if (!webflowItem) {
                    console.log('Webflow item not found, creating new item');
                    result = await this.createWebflowItem(webhookData);
                } else {
                    // Update existing Webflow item
                    console.log('Updating existing Webflow item');
                    result = await this.updateWebflowItem(webflowId, webhookData);
                }
            }

            // Run cleanup after operation
            await this.cleanupOrphanedItems();

            if (!result) {
                return { error: 'Failed to process Webflow item' };
            }

            return result;
        } catch (error) {
            console.error('Error processing webhook:', error);
            return { error: error.message };
        }
    }

    async syncAllRecords() {
        try {
            console.log('Starting full sync check');
            const airtableRecords = await this.airtableModel.getRecords();
            
            const results = {
                created: 0,
                updated: 0,
                errors: 0,
                invalidRecords: []
            };

            for (const airtableRecord of airtableRecords) {
                try {
                    // Validate year field
                    const year = airtableRecord.fields.Year;
                    if (!year || !/^\d{4}$/.test(year)) {
                        console.error('Invalid year format:', year);
                        results.invalidRecords.push({
                            id: airtableRecord.id,
                            error: 'Year must be exactly 4 digits (e.g., 2024)',
                            record: airtableRecord
                        });
                        results.errors++;
                        continue;
                    }

                    // Validate name field
                    const name = airtableRecord.fields.Name;
                    if (!name || !/^[a-zA-Z\s]+$/.test(name)) {
                        console.error('Invalid name format:', name);
                        results.invalidRecords.push({
                            id: airtableRecord.id,
                            error: 'Name must contain only letters and spaces',
                            record: airtableRecord
                        });
                        results.errors++;
                        continue;
                    }

                    // Check for image validation error
                    const fields = this.prepareFields(airtableRecord.fields);
                    if (fields.error) {
                        console.error('Image validation error:', fields.error);
                        results.invalidRecords.push({
                            id: airtableRecord.id,
                            error: fields.error,
                            record: airtableRecord
                        });
                        results.errors++;
                        continue;
                    }

                    const webflowId = airtableRecord.fields['Webflow id'];
                    
                    if (!webflowId) {
                        // Create new Webflow item
                        const result = await this.createWebflowItem(airtableRecord);
                        if (result) results.created++;
                        else results.errors++;
                    } else {
                        // Check if Webflow item exists before updating
                        const webflowItem = await this.webflowModel.getItem(webflowId);
                        if (webflowItem) {
                            const result = await this.updateWebflowItem(webflowId, airtableRecord);
                            if (result) results.updated++;
                            else results.errors++;
                        } else {
                            // If Webflow item doesn't exist, create new one
                            const result = await this.createWebflowItem(airtableRecord);
                            if (result) results.created++;
                            else results.errors++;
                        }
                    }
                } catch (error) {
                    console.error('Error processing record:', error);
                    results.errors++;
                    results.invalidRecords.push({
                        id: airtableRecord.id,
                        error: error.message,
                        record: airtableRecord
                    });
                }
            }

            // Run cleanup after all operations are complete
            await this.cleanupOrphanedItems();

            this.updateSyncTime();
            return results;
        } catch (error) {
            console.error('Error in syncAllRecords:', error);
            throw error;
        }
    }

    async cleanupOrphanedItems() {
        try {
            console.log('Starting cleanup of orphaned Webflow items');
            
            // Get all records from both systems
            const airtableRecords = await this.airtableModel.getRecords();
            const webflowItems = await this.webflowModel.getRecords();
            
            // Create a set of Webflow IDs from Airtable
            const airtableWebflowIds = new Set(
                airtableRecords
                    .map(record => record.fields['Webflow id'])
                    .filter(id => id) // Filter out null/undefined
            );
            
            // Find Webflow items that don't exist in Airtable
            const orphanedItems = webflowItems.filter(item => !airtableWebflowIds.has(item.id));
            
            console.log(`Found ${orphanedItems.length} orphaned Webflow items`);
            
            // Set orphaned items to draft
            for (const item of orphanedItems) {
                console.log(`Setting orphaned item to draft: ${item.id}`);
                await this.webflowModel.setToDraft(item.id);
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

    async createWebflowItem(airtableRecord) {
        try {
            const fields = this.prepareFields(airtableRecord.fields);
            const result = await this.webflowModel.createItem(fields);
            
            if (result) {
                // Update Airtable with new Webflow ID
                await this.airtableModel.updateRecord(airtableRecord.id, {
                    'Webflow id': result.id
                });
                return result;
            }
            return null;
        } catch (error) {
            console.error('Error creating Webflow item:', error);
            return null;
        }
    }

    async updateWebflowItem(webflowId, airtableRecord) {
        try {
            const fields = this.prepareFields(airtableRecord.fields);
            return await this.webflowModel.updateItem(webflowId, fields);
        } catch (error) {
            console.error('Error updating Webflow item:', error);
            return null;
        }
    }

    prepareFields(fields) {
        // Get the image data from Airtable
        const imageData = fields['Award winner image']?.[0];
        
        // Validate image format if image exists
        let imageField = null;
        if (imageData) {
            const allowedFormats = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
            const fileExtension = imageData.filename?.split('.').pop()?.toLowerCase();
            
            if (!fileExtension || !allowedFormats.includes(fileExtension)) {
                console.error('Invalid image format:', imageData.filename);
                return {
                    error: 'Invalid image format. Allowed formats: JPG, JPEG, PNG, GIF, WEBP',
                    name: fields.Name || '',
                    year: fields.Year || ''
                };
            }

            // Format the image field for Webflow
            imageField = {
                fileId: imageData.id,
                url: imageData.url,
                alt: imageData.filename || null
            };
        }

        // Create the fields object exactly as Webflow expects it
        return {
            name: fields.Name || '',
            year: fields.Year || '',
            'award-winner-image': imageField
        };
    }

    getLastSyncTime() {
        return this.lastSyncTime;
    }

    getNextSyncTime() {
        return this.nextSyncTime;
    }

    updateSyncTime() {
        this.lastSyncTime = new Date();
        this.nextSyncTime = null;
    }
}

module.exports = new SyncController(); 