const { stripe } = require('../config/stripe');
const { parsePrice, generateRandomCode, getTaxCodeForClass, isOnlineClass  } = require('../utils/helpers');
const { logError } = require('../utils/helpers');

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

      // Determine tax code based on class type
      const productType = classDetails["Product Type"];
      const taxCode = getTaxCodeForClass(productType);
      const isOnline = isOnlineClass(productType);
      console.log(`Class type: ${isOnline ? 'Online' : 'Offline'}, Tax code: ${taxCode}`);

      // Create products with tax codes
      const memberProduct = await stripe.products.create({
        name: `${classDetails.Name}`,
        // description: classDetails.Description || "No description provided",
        tax_code: taxCode,
      });

      const nonMemberProduct = await stripe.products.create({
        name: `${classDetails.Name}`,
        // description: classDetails.Description || "No description provided",
        tax_code: taxCode,
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

  // static async createCheckoutSession(lineItems, successUrl, cancelUrl, clientReferenceId, metadata, classDetails, userDetails) {
  //   try {
  //     let customerId = undefined;
  //     // Check if Product Type is "In person" - handle both string and object formats
  //     const productType = classDetails["Product Type"];
  //     const isInPerson = typeof productType === 'string' 
  //       ? productType === "In person" 
  //       : productType?.name === "In person";
      
  //     if (classDetails && isInPerson) {
  //       // Extract class location address
  //       const classAddress = {
  //         line1: (classDetails["Address (from Class Location)"] && classDetails["Address (from Class Location)"][0]) || "",
  //         city: (classDetails["City (from Class Location)"] && classDetails["City (from Class Location)"][0]) || "",
  //         state: (classDetails["State (from Class Location)"] && classDetails["State (from Class Location)"][0]) || "",
  //         postal_code: (classDetails["Zip (from Class Location)"] && classDetails["Zip (from Class Location)"][0]) || "",
  //         country: "US",
  //       };

  //       // Search for existing customer with this class location
  //       const classId = classDetails["Field ID"] || classDetails.id;
  //       const className = classDetails["Name"];
        
  //       console.log('Searching for existing customer with class ID:', classId, 'and class name:', className);
        
  //       let existingCustomer = null;
        
  //       try {
  //         // Use Stripe's search functionality to find customers by metadata
  //         const searchQuery = `metadata['class_id']:'${classId}' AND metadata['customer_type']:'class_location'`;
  //         console.log('Search query:', searchQuery);
          
  //         const searchResults = await stripe.customers.search({
  //           query: searchQuery,
  //           limit: 10
  //         });
          
  //         console.log('Search results:', searchResults.data.length, 'customers found');
          
  //         // Check if any of the found customers also match the class name
  //         for (const customer of searchResults.data) {
  //           console.log('Checking customer:', customer.id, 'metadata:', customer.metadata);
  //           if (customer.metadata?.class_name === className) {
  //             existingCustomer = customer;
  //             console.log('Found existing customer:', customer.id);
  //             break;
  //           }
  //         }
  //       } catch (searchError) {
  //         console.log('Search failed, falling back to list method:', searchError.message);
          
  //         // Fallback to list method if search fails
  //         const existingCustomers = await stripe.customers.list({
  //           limit: 100
  //         });

  //         for (const customer of existingCustomers.data) {
  //           if (customer.metadata?.class_id === classId &&
  //               customer.metadata?.class_name === className &&
  //               customer.metadata?.customer_type === 'class_location') {
  //             existingCustomer = customer;
  //             console.log('Found existing customer via list:', customer.id);
  //             break;
  //           }
  //         }
  //       }

  //       if (existingCustomer) {
  //         console.log('Using existing customer:', existingCustomer.id);
  //         customerId = existingCustomer.id;
  //       } else {
  //         // Create new customer with class location
  //         const customer = await stripe.customers.create({
  //           name: classDetails["Name"],
  //           address: classAddress,
  //           metadata: {
  //             class_id: classDetails["Field ID"] || classDetails.id,
  //             class_name: classDetails["Name"],
  //             customer_type: 'class_location'
  //           }
  //         });
  //         console.log('Created new customer:', customer.id);
  //         customerId = customer.id;
  //       }
  //     }
  //     // Handle existing price IDs - update their products with tax codes
  //     for (const item of lineItems) {
  //       if (item.price && !item.price_data) {
  //         // This is an existing price ID, update its product with tax code
  //         try {
  //           const price = await stripe.prices.retrieve(item.price);
  //           const product = await stripe.products.retrieve(price.product);
            
  //           if (!product.tax_code) {
  //             const productType = classDetails["Product Type"];
  //             const taxCode = getTaxCodeForClass(productType);
              
  //             await stripe.products.update(product.id, {
  //               tax_code: taxCode
  //             });
  //             console.log(`Updated product ${product.id} with tax code ${taxCode} for ${productType} class`);
  //           } else {
  //             console.log(`Product ${product.id} already has tax code: ${product.tax_code}`);
  //           }
  //         } catch (error) {
  //           console.error('Error updating product tax code:', error);
  //           // Continue with checkout even if product update fails
  //         }
  //       }
  //     }

  //     const billingAddressCollection = isInPerson ? 'auto' : 'required';
  //     const session = await stripe.checkout.sessions.create({
  //       line_items: lineItems.map(item => {
  //         if (item.price_data && item.price_data.product_data) {
  //           // Add tax_code if not already present
  //           if (!item.price_data.product_data.tax_code) {
  //             const productType = classDetails["Product Type"];
  //             const taxCode = getTaxCodeForClass(productType);
  //             item.price_data.product_data.tax_code = taxCode;
  //             console.log(`Assigned tax code ${taxCode} to product for ${productType} class`);
  //           } else {
  //             console.log(`Product already has tax code: ${item.price_data.product_data.tax_code}`);
  //           }
  //         } else if (item.price) {
  //           // For existing price IDs, we need to update the product
  //           console.log('Price ID provided, tax code will be applied via product update');
  //         }
  //         return item;
  //       }),
  //       mode: 'payment',
  //       allow_promotion_codes: true,
  //       success_url: successUrl,
  //       cancel_url: cancelUrl,
  //       client_reference_id: clientReferenceId,
  //       metadata: metadata,
  //       automatic_tax: { enabled: true },
  //       billing_address_collection: billingAddressCollection,
  //       ...(customerId ? { customer: customerId } : {}),
  //     });
  //     return session;
  //   } catch (error) {
  //     logError("Creating checkout session", error);
  //     throw error;
  //   }
  // }

static async createCheckoutSession(
  lineItems,
  successUrl,
  cancelUrl,
  clientReferenceId,
  metadata,
  classDetails
) {
  try {
    let customerId;

    /* ✅ Detect if the class is In person */
    const productType = classDetails["Product Type"];
    const isInPerson =
      typeof productType === "string"
        ? productType === "In person"
        : productType?.name === "In person";

    /* ✅ Create Stripe Customer for the class location */
    if (isInPerson) {
      const classAddress = {
        line1: classDetails["Address (from Class Location)"]?.[0] || "",
        city: classDetails["City (from Class Location)"]?.[0] || "",
        state: classDetails["State (from Class Location)"]?.[0] || "",
        postal_code:
          classDetails["Zip (from Class Location)"]?.[0] || "",
        country: "US",
      };

      const customer = await stripe.customers.create({
        name: classDetails["Name"],
        address: classAddress,
        metadata: {
          class_id: classDetails["Field ID"] || classDetails.id,
          class_name: classDetails["Name"],
          customer_type: "class_location",
        },
      });

      customerId = customer.id;
    }

    /* ✅ Automatically assign the correct tax code to products */
    for (const item of lineItems) {
      if (item.price && !item.price_data) {
        try {
          const price = await stripe.prices.retrieve(item.price);
          const product = await stripe.products.retrieve(price.product);

          if (!product.tax_code) {
            const taxCode = getTaxCodeForClass(
              classDetails["Product Type"]
            );
            await stripe.products.update(product.id, {
              tax_code: taxCode,
            });
          }
        } catch (err) {
          console.error("Tax code update failed:", err);
        }
      }
    }

    /* ✅ Control whether billing address is required */
    const billingAddressCollection = isInPerson
      ? "auto"
      : "required";

    const session = await stripe.checkout.sessions.create({
      line_items: lineItems.map((item) => {
        if (
          item.price_data?.product_data &&
          !item.price_data.product_data.tax_code
        ) {
          item.price_data.product_data.tax_code =
            getTaxCodeForClass(classDetails["Product Type"]);
        }
        return item;
      }),

      mode: "payment",

      /* ✅ Allow promo codes */
      allow_promotion_codes: true,

      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: clientReferenceId,
      metadata,

      /* ✅ Enable automatic tax calculation */
      automatic_tax: { enabled: true },

      billing_address_collection: billingAddressCollection,

      ...(customerId ? { customer: customerId } : {}),
    });

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