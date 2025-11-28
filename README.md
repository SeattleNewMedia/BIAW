# Awards Sync Service

This service synchronizes data between Airtable and Webflow, maintaining consistency between both platforms.

## Features

- Automatic synchronization between Airtable and Webflow
- Handles new records, updates, and deletions
- Image comparison to detect changes
- Scheduled sync every 5 minutes
- Manual sync endpoint
- Sets deleted records to draft instead of permanent deletion

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with the following variables:
   ```
   airtableBaseId=your_base_id
   airtableClassTableName=your_table_name
   airtableApiKey=your_airtable_api_key
   webflowApiKey=your_webflow_api_key
   webflowCollectionId=your_collection_id
   PORT=6000
   ```

## Running the Service

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## API Endpoints

- `GET /`: Health check endpoint
- `POST /sync`: Trigger manual synchronization

## How it Works

1. The service checks for "Webflow ID" in Airtable records
2. If the ID exists:
   - Updates the corresponding Webflow record if there are changes
3. If the ID doesn't exist:
   - Creates a new Webflow record
   - Updates the Airtable record with the new Webflow ID
4. For records that exist in Webflow but not in Airtable:
   - Sets them to draft status in Webflow

## Error Handling

- All errors are logged to the console
- API endpoints return appropriate error responses
- Failed operations are logged with detailed information 