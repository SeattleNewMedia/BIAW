const { base5 } = require('../config/airtable');

exports.handleDonation = async (session) => {
  try {
    console.log('Processing donation for session:', session.id);
    
    // Check if payment_link exists and matches the specific link
    const paymentLink = session.payment_link;
    const targetPaymentLink = 'plink_1Q7hgGIONk3QNZzYpYHdrtPa';
    
    if (!paymentLink || paymentLink !== targetPaymentLink) {
      console.log('Payment link does not match or is missing. Expected:', targetPaymentLink, 'Got:', paymentLink);
      return false;
    }

    // Extract customer details
    const customerName = session.customer_details?.name || 'Anonymous';
    const customerEmail = session.customer_details?.email || '';
    const amountPaid = session.amount_total ? `$${(session.amount_total / 100).toFixed(2)}` : '$0.00';
    const paymentStatus = session.payment_status || 'paid';

    console.log('Donation details:', {
      name: customerName,
      email: customerEmail,
      amount: amountPaid,
      status: paymentStatus
    });

    // Create donation record in Airtable
    const donationRecord = {
      "Name": customerName,
      "Payment Status": "Paid",
      "Amount Paid": amountPaid,
    };

    const createdRecord = await base5('Donation').create([
      {
        fields: donationRecord
      }
    ]);

    console.log('Donation record created in Airtable:', createdRecord[0].id);
    
    return true;

  } catch (error) {
    console.error('Error processing donation:', error);
    return false;
  }
}; 