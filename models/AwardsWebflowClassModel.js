require('dotenv').config();

class AwardsWebflowClassModel {
    constructor() {
        this.apiKey = process.env.webflowApiKey;
        this.collectionId = process.env.webflowCollectionId2;
    }

    async getItem(webflowId) {
        if (!webflowId) return null;
        const url = `https://api.webflow.com/v2/collections/${this.collectionId}/items/${webflowId}`;
        try {
            const response = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'accept-version': '1.0.0',
                },
            });
            if (!response.ok) {
                if (response.status === 404) return null;
                return null;
            }
            return await response.json();
        } catch (error) {
            return null;
        }
    }

    async getRecords() {
        const url = `https://api.webflow.com/v2/collections/${this.collectionId}/items`;
        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                'accept-version': '1.0.0',
            },
        });
        if (!response.ok) return [];
        const data = await response.json();
        return data.items;
    }

    async updateItem(webflowId, fields) {
        if (!webflowId) return null;
        const url = `https://api.webflow.com/v2/collections/${this.collectionId}/items/${webflowId}`;
        try {
            console.log('Sending update request to Webflow:', { url, fields });
            const response = await fetch(url, {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'accept-version': '1.0.0',
                },
                body: JSON.stringify({
                    fieldData: fields
                }),
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                console.error('Webflow update failed:', {
                    error: errorData,
                    details: errorData?.details || [],
                    requestBody: {
                        fieldData: fields
                    }
                });
                return null;
            }
            const result = await response.json();
            console.log('Webflow update successful:', result);
            
            // Now publish the updated item to live using v2 publish endpoint
            const publishUrl = `https://api.webflow.com/v2/collections/${this.collectionId}/items/publish`;
            const publishResponse = await fetch(publishUrl, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'accept-version': '1.0.0',
                },
                body: JSON.stringify({
                    itemIds: [webflowId]
                }),
            });
            
            if (!publishResponse.ok) {
                const errorData = await publishResponse.json().catch(() => null);
                console.error('Webflow publish failed:', {
                    status: publishResponse.status,
                    statusText: publishResponse.statusText,
                    error: errorData,
                    itemId: webflowId
                });
                return null;
            }
            
            const publishResult = await publishResponse.json();
            console.log('Item published successfully:', publishResult);
            return result;
        } catch (error) {
            console.error('Error updating Webflow item:', error);
            return null;
        }
    }

    async createItem(fields) {
        const createUrl = `https://api.webflow.com/v2/collections/${this.collectionId}/items`;
        try {
            console.log('Creating item in staging:', { fields });
            const createResponse = await fetch(createUrl, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'accept-version': '1.0.0',
                },
                body: JSON.stringify({
                    fieldData: fields
                }),
            });
            
            if (!createResponse.ok) {
                const errorData = await createResponse.json().catch(() => null);
                console.error('Webflow create failed:', {
                    error: errorData,
                });
                return null;
            }
            
            const createdItem = await createResponse.json();
            const itemId = createdItem.id;
            console.log('Item created in staging:', createdItem);
            
           
            const publishUrl = `https://api.webflow.com/v2/collections/${this.collectionId}/items/publish`;
            const publishResponse = await fetch(publishUrl, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'accept-version': '1.0.0',
                },
                body: JSON.stringify({
                    itemIds: [itemId]
                }),
            });
            
            if (!publishResponse.ok) {
                
                 return await publishResponse.json();
            }
            
            const publishResult = await publishResponse.json();
            console.log('Item published successfully:', publishResult);
            return createdItem; 
            
        } catch (error) {
            console.error('Error creating/publishing Webflow item:', error);
            return null;
        }
    }

    async setToDraft(webflowId) {
        if (!webflowId) return null;
        const url = `https://api.webflow.com/v2/collections/${this.collectionId}/items/${webflowId}/live`;
        try {
            const response = await fetch(url, {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'accept-version': '1.0.0',
                },
            });
            if (!response.ok) {
                let errorData;
                try {
                    errorData = await response.json();
                } catch {
                    errorData = await response.text();
                }
                return null;
            }
            return { success: true };
        } catch (error) {
            return null;
        }
    }
}

module.exports = new AwardsWebflowClassModel(); 