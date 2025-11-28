# Payment Status Controller

The `PaymentStatusController` handles automatic updates to payment record statuses based on webhook events from Airtable. It implements 11 different conditions to ensure payment statuses are correctly synchronized.

## Endpoints

### 1. Webhook Handler
- **URL**: `/api/payment-status-update`
- **Method**: `POST`
- **Purpose**: Handles webhook events from Airtable for payment record updates

### 2. Test Endpoint
- **URL**: `/api/payment-status-update/:recordId`
- **Method**: `POST`
- **Purpose**: Manually test payment status updates for a specific record

## Conditions Implemented

The controller checks the following 11 conditions and updates the "Payment Status" field accordingly:

### Conditions 1-3: When "Payment Refund & Cancellation Status" = "Refunded"

1. **Payment Status = "Pending"**
   - If "Initial Payment status" = "Paid" → Update to "Refunded"
   - If "Initial Payment status" = "ROII-Free" → Update to "ROII-Cancelled"

2. **Payment Status = "ROII-Free"**
   - If "Initial Payment status" = "Paid" → Update to "Refunded"
   - If "Initial Payment status" = "ROII-Free" → Update to "ROII-Cancelled"

3. **Payment Status = "Paid"**
   - If "Initial Payment status" = "Paid" → Update to "Refunded"
   - If "Initial Payment status" = "ROII-Free" → Update to "ROII-Cancelled"

### Conditions 4-11: When "Payment Refund & Cancellation Status" ≠ "Refunded"

4. **Payment Status = "ROII-Free" AND Initial Payment Status = "Paid"**
   - Update to "Paid"

5. **Payment Status = "Paid" AND Initial Payment Status = "ROII-Free"**
   - Update to "ROII-Free"

6. **Payment Status = "Refunded" AND Initial Payment Status = "ROII-Free"**
   - Update to "ROII-Cancelled"

7. **Payment Status = "ROII-Cancelled" AND Initial Payment Status = "Paid"**
   - Update to "Refunded"

8. **Payment Status = "ROII-Cancelled" AND Initial Payment Status = "Paid"** (duplicate of 7)
   - Update to "Refunded"

9. **Payment Status = any of ["ROII-Cancelled", "Paid", "ROII-Free", "Refunded", "Cancelled Without Refund"] AND Initial Payment Status = "Pending"**
   - Update to "Pending"

10. **Payment Status = "Pending" AND Initial Payment Status = "Paid"**
    - Update to "Paid"

11. **Payment Status = "Pending" AND Initial Payment Status = "ROII-Free"**
    - Update to "Paid"

## Webhook Payload Format

The webhook expects the following payload structure:

```json
{
  "id": "recXXXXXXXXXXXXXX",
  "fields": {
    "Payment Refund & Cancellation Status": "Refunded",
    "Payment Status": "Pending",
    "Initial Payment status (RoII, Paid, Pending)": "Paid"
  }
}
```

## Response Format

### Success Response
```json
{
  "success": true,
  "message": "Payment status updated successfully from 'Pending' to 'Refunded'",
  "recordId": "recXXXXXXXXXXXXXX",
  "oldStatus": "Pending",
  "newStatus": "Refunded"
}
```

### No Update Needed
```json
{
  "success": true,
  "message": "No status update needed",
  "recordId": "recXXXXXXXXXXXXXX",
  "currentStatus": "Paid"
}
```

### Error Response
```json
{
  "error": "Failed to update payment record in Airtable",
  "details": "Error details here"
}
```

## Usage

### Setting up Airtable Webhook

1. In your Airtable base, go to the "Payment Records" table
2. Set up a webhook to trigger on record updates
3. Configure the webhook to send POST requests to: `https://your-domain.com/api/payment-status-update`
4. Ensure the webhook includes the record ID and all relevant fields

### Testing

You can test the controller manually using the test endpoint:

```bash
curl -X POST https://your-domain.com/api/payment-status-update/recXXXXXXXXXXXXXX
```

## Error Handling

The controller includes comprehensive error handling for:
- Missing required fields
- Invalid record IDs
- Airtable API errors
- Network connectivity issues

All errors are logged using the `logError` utility function for debugging purposes.

## Dependencies

- `axios`: For making HTTP requests to Airtable API
- `../config/database`: For Airtable configuration and table names
- `../utils/helpers`: For error logging utilities 