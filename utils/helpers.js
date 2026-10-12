// Helper function to format currency
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount / 100);
}

// Helper function to parse price values
const parsePrice = (price) => {
  try {
    if (typeof price === "number") {
      return price;
    }

    if (typeof price === "string") {
      const cleanedPrice = price.replace(/[$,]/g, '');
      const parsedPrice = parseFloat(cleanedPrice);
      if (isNaN(parsedPrice)) {
        throw new Error(`Invalid price value: ${price}`);
      }
      return parsedPrice;
    }

    throw new Error("Price is missing or invalid.");
  } catch (error) {
    throw new Error(`Price parsing failed: ${error.message}`);
  }
};

// Blank prices are missing. Zero is a real price.
function hasPriceValue(price) {
  if (price === null || price === undefined) return false;
  if (typeof price === "number") return !Number.isNaN(price);
  if (typeof price === "string") return price.trim() !== "";
  return false;
}

// Free for everyone: both member and non-member prices are 0.
function isFreeClass(classDetails) {
  if (!classDetails) return false;
  const memberPrice = classDetails["Price - Member"];
  const nonMemberPrice = classDetails["Price - Non Member"];
  if (!hasPriceValue(memberPrice) || !hasPriceValue(nonMemberPrice)) return false;
  return parsePrice(memberPrice) === 0 && parsePrice(nonMemberPrice) === 0;
}

// Generate random code for promotion codes
function generateRandomCode(length) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// Generate slug for Webflow
function generateSlug(classDetails, dropdownValue) {
  const cleanedName = classDetails.Name
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-');

  const cleanedDropdownValue = dropdownValue.toLowerCase().replace(/\s+/g, '-');
  return `${cleanedName}-${cleanedDropdownValue}`;
}

// Error logging utility
function logError(context, error) {
  console.error(`[ERROR] ${context}:`, error.message || error);
}

module.exports = {
  formatCurrency,
  parsePrice,
  hasPriceValue,
  isFreeClass,
  generateRandomCode,
  generateSlug,
  logError,
}; 