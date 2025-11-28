const { base, TABLES, AIRTABLE_CONFIG } = require('../config/database');
const axios = require('axios');
const { logError } = require('../utils/helpers');

class PaymentStatusController {
  /**
   * Updates payment record status based on webhook conditions
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async updatePaymentStatus1(req, res) {
    try {
      const { id, fields } = req.body;
      
      if (!id || !fields) {
        return res.status(400).json({ 
          error: "Missing required fields: id and fields" 
        });
      }

      console.log(`Processing payment status update for record ID: ${id}`);
      console.log('Current fields:', fields);

      // Handle Airtable select field objects (they come as {id, name, color} objects)
      const paymentRefundStatus = fields['Payment Refund & Cancellation Status']?.name || fields['Payment Refund & Cancellation Status'];
      const paymentStatus = fields['Payment Status']?.name || fields['Payment Status'];
      const initialPaymentStatus = fields['Initial Payment status (RoII, Paid, Pending)']?.name || fields['Initial Payment status (RoII, Paid, Pending)'] || 'Pending';

              console.log('Status values:', {
          paymentRefundStatus,
          paymentStatus,
          initialPaymentStatus
        });
        console.log('Raw field values:', {
          'Payment Refund & Cancellation Status': fields['Payment Refund & Cancellation Status'],
          'Payment Status': fields['Payment Status'],
          'Initial Payment status (RoII, Paid, Pending)': fields['Initial Payment status (RoII, Paid, Pending)']
        });

      let newPaymentStatus = null;
      let shouldUpdate = false;

      // ===== WITH "Payment Refund & Cancellation Status" = "Refunded" =====

      // Condition 1: Payment Refund & Cancellation Status = Refunded AND Payment Status = Pending
      if (paymentRefundStatus === 'Refunded' && paymentStatus === 'Pending') {
        if (initialPaymentStatus === 'Paid') {
          newPaymentStatus = 'Refunded';
          shouldUpdate = true;
        } else if (initialPaymentStatus === 'ROII-Free') {
          newPaymentStatus = 'ROII-Cancelled';
          shouldUpdate = true;
        }
      }
      // Condition 2: Payment Refund & Cancellation Status = Refunded AND Payment Status = ROII-Free
      else if (paymentRefundStatus === 'Refunded' && paymentStatus === 'ROII-Free') {
        if (initialPaymentStatus === 'Paid') {
          newPaymentStatus = 'Refunded';
          shouldUpdate = true;
        } else if (initialPaymentStatus === 'ROII-Free') {
          newPaymentStatus = 'ROII-Cancelled';
          shouldUpdate = true;
        }
      }
      // Condition 3: Payment Refund & Cancellation Status = Refunded AND Payment Status = Paid
      else if (paymentRefundStatus === 'Refunded' && paymentStatus === 'Paid') {
        if (initialPaymentStatus === 'Paid') {
          newPaymentStatus = 'Refunded';
          shouldUpdate = true;
        } else if (initialPaymentStatus === 'ROII-Free') {
          newPaymentStatus = 'ROII-Cancelled';
          shouldUpdate = true;
        }
      }

      // ===== WITHOUT "Payment Refund & Cancellation Status" = "Refunded" =====

      // Condition 1: Initial Payment Status = Paid AND Payment Status = ROII-Free AND Payment Refund & Cancellation Status != Refunded
      else if (initialPaymentStatus === 'Paid' && paymentStatus === 'ROII-Free' && paymentRefundStatus !== 'Refunded') {
        newPaymentStatus = 'Paid';
        shouldUpdate = true;
      }
      // Condition 2: Initial Payment Status = ROII-Free AND Payment Status = Paid AND Payment Refund & Cancellation Status != Refunded
      else if (initialPaymentStatus === 'ROII-Free' && paymentStatus === 'Paid' && paymentRefundStatus !== 'Refunded') {
        newPaymentStatus = 'ROII-Free';
        shouldUpdate = true;
      }
      // Condition 3: Initial Payment Status = ROII-Free AND Payment Status = Refunded AND Payment Refund & Cancellation Status != Refunded
      else if (initialPaymentStatus === 'ROII-Free' && paymentStatus === 'Refunded' && paymentRefundStatus !== 'Refunded') {
        newPaymentStatus = 'ROII-Cancelled';
        shouldUpdate = true;
      }
      // Condition 4: Initial Payment Status = Paid AND Payment Status = ROII-Cancelled AND Payment Refund & Cancellation Status != Refunded
      else if (initialPaymentStatus === 'Paid' && paymentStatus === 'ROII-Cancelled' && paymentRefundStatus !== 'Refunded') {
        newPaymentStatus = 'Refunded';
        shouldUpdate = true;
      }
      // Condition 5: Payment Status is one of specified values AND Initial Payment Status = Pending AND Payment Refund & Cancellation Status != Refunded
      else if (['ROII-Free', 'Paid', 'Refunded', 'ROII-Cancelled', 'Cancelled Without Refund'].includes(paymentStatus) && 
               initialPaymentStatus === 'Pending' && paymentRefundStatus !== 'Refunded') {
        newPaymentStatus = 'Pending';
        shouldUpdate = true;
      }
      // Condition 6: Initial Payment Status = Paid AND Payment Status = Pending AND Payment Refund & Cancellation Status != Refunded
      else if (initialPaymentStatus === 'Paid' && paymentStatus === 'Pending' && paymentRefundStatus !== 'Refunded') {
        newPaymentStatus = 'Paid';
        shouldUpdate = true;
      }
      // Condition 7: Initial Payment Status = ROII-Free AND Payment Status = Pending AND Payment Refund & Cancellation Status != Refunded
      else if (initialPaymentStatus === 'ROII-Free' && paymentStatus === 'Pending' && paymentRefundStatus !== 'Refunded') {
        newPaymentStatus = 'ROII-Free';
        shouldUpdate = true;
      }

      if (shouldUpdate && newPaymentStatus) {
        console.log(`Updating payment status from '${paymentStatus}' to '${newPaymentStatus}' for record ${id}`);
        
        try {
          // Update the payment record in Airtable
          const updateURL = `${AIRTABLE_CONFIG.baseURL}/${TABLES.PAYMENT_RECORDS}/${id}`;
          const updateData = {
            fields: {
              'Payment Status': newPaymentStatus
            }
          };

          const response = await axios.patch(updateURL, updateData, {
            headers: AIRTABLE_CONFIG.headers
          });

          console.log(`Successfully updated payment status for record ${id}:`, response.data);
          
          return res.status(200).json({
            success: true,
            message: `Payment status updated successfully from '${paymentStatus}' to '${newPaymentStatus}'`,
            recordId: id,
            oldStatus: paymentStatus,
            newStatus: newPaymentStatus
          });

        } catch (updateError) {
          console.error(`Error updating payment record ${id}:`, updateError.response?.data || updateError.message);
          return res.status(500).json({
            error: "Failed to update payment record in Airtable",
            details: updateError.response?.data || updateError.message
          });
        }
      } else {
        console.log(`No status update needed for record ${id}. Current status: ${paymentStatus}`);
        return res.status(200).json({
          success: true,
          message: "No status update needed",
          recordId: id,
          currentStatus: paymentStatus
        });
      }

    } catch (error) {
      console.error('Error processing payment status update:', error);
      logError('PaymentStatusController.updatePaymentStatus1', error);
      
      return res.status(500).json({
        error: "Internal server error processing payment status update",
        details: error.message
      });
    }
  }

  /**
   * Handles webhook from Airtable for payment record updates
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async handlePaymentWebhook(req, res) {
    try {
      console.log('Received payment webhook:', req.body);
      
      // Verify this is a payment record update
      const { id, fields } = req.body;
      
      if (!id) {
        return res.status(400).json({ error: "Missing record ID in webhook payload" });
      }

      // Check if this is a payment record by looking for payment-specific fields
      if (!fields || (!fields['Payment Status'] && !fields['Payment Refund & Cancellation Status'])) {
        console.log('Webhook received but not a payment record update, skipping');
        return res.status(200).json({ message: "Not a payment record update, skipping" });
      }

      // Process the payment status update
      return await PaymentStatusController.updatePaymentStatus1(req, res);

    } catch (error) {
      console.error('Error handling payment webhook:', error);
      logError('PaymentStatusController.handlePaymentWebhook', error);
      
      return res.status(500).json({
        error: "Internal server error handling payment webhook",
        details: error.message
      });
    }
  }

  /**
   * Test endpoint to manually trigger payment status updates
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async testPaymentStatusUpdate(req, res) {
    try {
      const { recordId } = req.params;
      
      if (!recordId) {
        return res.status(400).json({ error: "Record ID is required" });
      }

      // Fetch the current record from Airtable
      const fetchURL = `${AIRTABLE_CONFIG.baseURL}/${TABLES.PAYMENT_RECORDS}/${recordId}`;
      const response = await axios.get(fetchURL, {
        headers: AIRTABLE_CONFIG.headers
      });

      const record = response.data;
      
      // Create a mock request body with the record data
      const mockReq = {
        body: {
          id: recordId,
          fields: record.fields
        }
      };

      // Process the status update
      return await PaymentStatusController.updatePaymentStatus1(mockReq, res);

    } catch (error) {
      console.error('Error testing payment status update:', error);
      logError('PaymentStatusController.testPaymentStatusUpdate', error);
      
      return res.status(500).json({
        error: "Internal server error testing payment status update",
        details: error.message
      });
    }
  }
}

module.exports = PaymentStatusController; 