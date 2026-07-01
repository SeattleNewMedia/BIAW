const { stripe } = require('../config/stripe');
const { parsePrice, generateRandomCode, logError } = require('../utils/helpers');

class StripeService {
  // Create Stripe products and coupon
  static async createStripeProductsAndCoupon(classDetails) {
    try {
      if (!classDetails.Name || !classDetails["Price - Member"] || !classDetails["Price - Non Member"]) {
        throw new Error("Class details are incomplete");
      }

      const memberPriceAmount = parsePrice(classDetails["Price - Member"]);
      const nonMemberPriceAmount = parsePrice(classDetails["Price - Non Member"]);
      const discountPercentage = parseInt(classDetails["% Discounts"] || "0", 10);
      const maxDiscountedSeats = parseInt(classDetails["Maximum discounted seats"] || "0", 10);

      const memberProduct = await stripe.products.create({
        name: `${classDetails.Name}`,
        // description: classDetails.Description || "No description provided",
      });

      const nonMemberProduct = await stripe.products.create({
        name: `${classDetails.Name}`,
        // description: classDetails.Description || "No description provided",
      });

      // Create prices
      const memberPrice = await stripe.prices.create({
        unit_amount: Math.round(memberPriceAmount * 100),
        currency: 'usd',
        product: memberProduct.id,
      });

      const nonMemberPrice = await stripe.prices.create({
        unit_amount: Math.round(nonMemberPriceAmount * 100),
        currency: 'usd',
        product: nonMemberProduct.id,
      });

      let discountCoupon = null;
      let promotionCode = null;

      if (!isNaN(discountPercentage) && discountPercentage > 0) {
        const couponData = {
          percent_off: discountPercentage,
          duration: 'once',
          name: `${discountPercentage}% Discount`,
          applies_to: {
            products: [memberProduct.id, nonMemberProduct.id],
          },
        };

        if (maxDiscountedSeats > 0) {
          couponData.max_redemptions = maxDiscountedSeats;
        }

        discountCoupon = await stripe.coupons.create(couponData);
        console.log("Coupon created successfully:", discountCoupon);

        const generatedCode = generateRandomCode(8);
        promotionCode = await stripe.promotionCodes.create({
          coupon: discountCoupon.id,
          code: generatedCode,
        });

        console.log("Promotion code created successfully:", promotionCode);
      }

      // Create payment links
      const memberPaymentLink = await stripe.paymentLinks.create({
        line_items: [{ price: memberPrice.id, quantity: 1 }],
        allow_promotion_codes: true,
        // For offline classes via payment links, do not force address collection
        billing_address_collection: 'auto',
      });

      const nonMemberPaymentLink = await stripe.paymentLinks.create({
        line_items: [{ price: nonMemberPrice.id, quantity: 1 }],
        allow_promotion_codes: true,
        // For offline classes via payment links, do not force address collection
        billing_address_collection: 'auto',
      });

      return {
        memberProduct,
        memberPrice,
        memberPaymentLink,
        nonMemberProduct,
        nonMemberPrice,
        nonMemberPaymentLink,
        discountCoupon,
        promotionCode,
        generatedCode2: promotionCode?.code,
      };
    } catch (error) {
      console.error("Error processing class:", error.stack || error.message || error);
      throw error;
    }
  }

  // Create checkout session
  // static async createCheckoutSession(lineItems, successUrl, cancelUrl, clientReferenceId, metadata) {
  //   try {
  //     const session = await stripe.checkout.sessions.create({
  //       line_items: lineItems,
  //       mode: 'payment',
  //       allow_promotion_codes: true,
  //       success_url: successUrl,
  //       cancel_url: cancelUrl,
  //       client_reference_id: clientReferenceId,
  //       metadata: metadata,
  //     });

  //     return session;
  //   } catch (error) {
  //     logError("Creating checkout session", error);
  //     throw error;
  //   }
  // }

  static async createCheckoutSession(lineItems, successUrl, cancelUrl, clientReferenceId, metadata, classDetails, userDetails) {
    try {
      const productType = classDetails["Product Type"];
      const isInPerson = typeof productType === 'string' 
        ? productType === "In person" 
        : productType?.name === "In person";

      const sessionConfig = {
        line_items: lineItems,
        mode: 'payment',
        allow_promotion_codes: true,
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: clientReferenceId,
        metadata: metadata,
      };

      const session = await stripe.checkout.sessions.create(sessionConfig);
      return session;
    } catch (error) {
      logError("Creating checkout session", error);
      throw error;
    }
  }


  // Process refund
  static async processRefund(paymentIntentId) {
    try {
      const refund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
      });

      console.log("Refund successful:", refund);
      return {
        refundId: refund.id,
        refundAmount: (refund.amount / 100).toFixed(2)
      };
    } catch (error) {
      logError("Processing refund", error);
      throw error;
    }
  }

  // Verify webhook signature
  static verifyWebhookSignature(rawBody, signature, endpointSecret) {
    try {
      return stripe.webhooks.constructEvent(rawBody, signature, endpointSecret);
    } catch (error) {
      logError("Webhook signature verification", error);
      throw error;
    }
  }

  // Create refund
  static async createRefund(paymentIntentId) {
    try {
      const refund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
      });
      return refund;
    } catch (error) {
      logError("Creating refund", error);
      throw error;
    }
  }

  // Get product from price ID
  static async getProductFromPrice(priceId) {
    try {
      const price = await stripe.prices.retrieve(priceId);
      return price.product; // Returns the product ID associated with the price
    } catch (error) {
      logError(`Error fetching product for price ID ${priceId}`, error);
      throw error;
    }
  }

  // Create discount coupon
  static async createDiscountCoupon(discountPercentage, memberPriceId, nonMemberPriceId, maxDiscountedSeats) {
    try {
      // Fetch the product IDs for the given price IDs
      const memberProductId = await StripeService.getProductFromPrice(memberPriceId);
      const nonMemberProductId = await StripeService.getProductFromPrice(nonMemberPriceId);

      // Create a Stripe coupon
      const discountCoupon = await stripe.coupons.create({
        percent_off: discountPercentage,
        duration: 'once',
        name: `${discountPercentage}% Discount for`,
        applies_to: {
          products: [memberProductId, nonMemberProductId], // Apply to both products
        },
        // Set max_redemptions if there are discounted seats
        max_redemptions: maxDiscountedSeats > 0 ? maxDiscountedSeats : undefined,
      });

      console.log('Coupon created successfully:', discountCoupon);

      // Generate a random promotion code
      const generatedCode = generateRandomCode(8);

      // Create a Stripe promotion code
      const promotionCode = await stripe.promotionCodes.create({
        coupon: discountCoupon.id,
        code: generatedCode,
      });

      console.log('Promotion code created successfully:', promotionCode);

      return {
        discountCoupon,
        promotionCode,
        generatedCode
      };
    } catch (error) {
      logError("Creating discount coupon", error);
      throw error;
    }
  }
}

module.exports = StripeService; 