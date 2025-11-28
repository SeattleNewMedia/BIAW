const axios = require('axios');

const MEMBERSTACK_URL = 'https://admin.memberstack.com/members';
const memberstackHeaders = {
  'X-API-KEY': process.env.MEMBERSTACK_API_KEY,
  'Content-Type': 'application/json',
};

// Check if Memberstack member exists by email
async function checkMemberstackEmail(email) {
  try {
    // Normalize email to lowercase for consistent lookups
    const normalizedEmail = email.toLowerCase().trim();
    console.log(`Checking Memberstack for email: ${normalizedEmail}`);
    
    // URL encode the email for the API call
    const encodedEmail = encodeURIComponent(normalizedEmail);
    const response = await axios.get(`${MEMBERSTACK_URL}/${encodedEmail}`, {
      headers: memberstackHeaders,
    });

    console.log('Memberstack API response for specific email:', JSON.stringify(response.data, null, 2));
    
    // Handle different response structures
    let memberData = null;
    
    // If response.data has a 'data' property, use that
    if (response.data && response.data.data !== undefined) {
      memberData = response.data.data;
    } else if (response.data && response.data.id) {
      // If response.data directly contains member data
      memberData = response.data;
    }
    
    // If we get a successful response with member data, the member exists
    if (memberData && memberData.id) {
      console.log(`Found Memberstack member: ${memberData.auth?.email} with ID: ${memberData.id}`);
      return memberData.id;
    }
    
    console.log(`No member found for email: ${normalizedEmail}`);
    return null;
  } catch (error) {
    // If we get a 404, the member doesn't exist
    if (error.response && error.response.status === 404) {
      console.log(`Email ${normalizedEmail} not found in Memberstack (404 response)`);
      return null;
    }
    console.error('Error checking Memberstack email:', error.response ? error.response.data : error.message);
    return null;
  }
}

// Create a new Memberstack member
async function createMemberInMemberstack(memberData) {
  const url = MEMBERSTACK_URL;
  try {
    // Normalize email to lowercase for consistent storage
    if (memberData.email) {
      memberData.email = memberData.email.toLowerCase().trim();
    }
    
    const response = await axios.post(url, memberData, { headers: memberstackHeaders });
    return response.data;
  } catch (error) {
    console.error('Error creating member in Memberstack:', error.response?.data || error.message);
    
    // Return error object instead of throwing
    return {
      error: {
        code: error.response?.data?.code || 'unknown-error',
        message: error.response?.data?.message || error.message,
        status: error.response?.status,
        details: error.response?.data
      }
    };
  }
}

// Update Memberstack member details
async function updateMemberstack(memberId, updateData) {
  try {
    const url = `${MEMBERSTACK_URL}/${memberId}`;
    const response = await axios.patch(url, updateData, { headers: memberstackHeaders });
    return response.data;
  } catch (error) {
    console.error('Error updating Memberstack member:', error.response ? error.response.data : error.message);
    throw error;
  }
}

module.exports = {
  checkMemberstackEmail,
  createMemberInMemberstack,
  updateMemberstack,
}; 