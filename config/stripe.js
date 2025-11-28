const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_API_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

module.exports = {
  stripe,
  endpointSecret
}; 