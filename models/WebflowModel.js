require('dotenv').config();

class WebflowModel {
    constructor() {
        this.apiKey = process.env.webflowApiKey;
        this.collectionId = process.env.webflowCollectionId;
    }

    async getItem(webflowId) {
        if (!webflowId) return null;

        const url = `https://api.webflow.com/v2/collections/${this.collectionId}/items/${webflowId}`;
        console.log('Fetching Webflow item:', webflowId);

        try {
            const response = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'accept-version': '1.0.0',
                },
            });

            if (!response.ok) {
                if (response.status === 404) {
                    console.log('Webflow item not found:', webflowId);
                    return null;
                }
                const errorData = await response.json();
                console.error('Failed to fetch Webflow item:', errorData);
                return null;
            }

            return await response.json();
        } catch (error) {
            console.error('Error fetching Webflow item:', error);
            return null;
        }
    }

    async getRecords() {
        const url = `https://api.webflow.com/v2/collections/${this.collectionId}/items`;
        console.log('Fetching Webflow records from:', url);
      
        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                'accept-version': '1.0.0',
            },
        });
      
        if (!response.ok) {
            console.error('Failed to fetch Webflow records:', response.status, response.statusText);
            return [];
        }
      
        const data = await response.json();
        return data.items;
    }

    async updateItem(webflowId, fields) {
        if (!webflowId) {
            console.error('No Webflow ID provided for update');
            return null;
        }

        const url = `https://api.webflow.com/v2/collections/${this.collectionId}/items/${webflowId}`;
        console.log('Updating Webflow item with ID:', webflowId);
        console.log('Fields to update:', fields);

        try {
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
                const errorData = await response.json();
                console.error('Failed to update Webflow item:', errorData);
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
        console.log('Adding new Webflow item:', fields);

        try {
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
                const errorData = await createResponse.json();
                console.error('Failed to add Webflow item:', errorData);
                return null;
            }

            const createdItem = await createResponse.json();
            const itemId = createdItem.id;
            console.log('Item created in staging:', createdItem);
            
            // Now publish the item to live using v2 publish endpoint
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
                const errorData = await publishResponse.json().catch(() => null);
                console.error('Webflow publish failed:', {
                    error: errorData,
                    itemId: itemId
                });
                return null;
            }
            
            const publishResult = await publishResponse.json();
            console.log('Item published successfully:', publishResult);
            return createdItem;
        } catch (error) {
            console.error('Error adding Webflow item:', error);
            return null;
        }
    }

    async setToDraft(webflowId) {
        if (!webflowId) {
            console.error('No Webflow ID provided for draft status');
            return null;
        }

        // Use the Webflow API DELETE endpoint to unpublish the item
        const url = `https://api.webflow.com/v2/collections/${this.collectionId}/items/${webflowId}/live`;
        console.log('Unpublishing (deleting live) Webflow item:', webflowId);

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
                console.error('Failed to unpublish Webflow item:', errorData);
                return null;
            }
            // No content expected on success
            return { success: true };
        } catch (error) {
            console.error('Error unpublishing Webflow item:', error);
            return null;
        }
    }
}

module.exports = new WebflowModel(); 