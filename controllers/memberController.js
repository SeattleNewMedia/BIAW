// controllers/memberController.js

const { base, checkCompanyId, checkCompanyIds, checkCompanyIdAndMemberType } = require('../models/airtableModel');
const { checkMemberstackEmail, createMemberInMemberstack, updateMemberstack } = require('../models/memberstackModel');
const { sendEmail, transporter } = require('../services/emailService');
const generateOTP = require('../utils/generateOTP');
const formatDate = require('../utils/formatDate');
const { processAndUpdateRecords } = require('../services/planService');

// POST /send-otp
exports.sendOtp = async (req, res) => {
  const firstName = req.body["First Name"] || req.body.firstName || req.body["first-Name-3"] || req.body["First-Name"] || req.body["first-Name"] || "";
  const lastName = req.body["Last Name 3"] || req.body.lastName || req.body["Last-Name-3"] || "";
  const companyName = req.body["Company Name"] || req.body.companyName || req.body["Company-Name"] || "";
  const email = (req.body["Email 3"] || req.body.email || req.body["Email-3"] || "").toLowerCase().trim();
  const Pin = req.body.Pin || req.body.pin || "";

  if (!email) {
    return res.status(400).json({ error: "Email is required." });
  }

  const membershipCompanyId = Pin;
  const otp = generateOTP();
  let memberType = "";
  try {
    if (membershipCompanyId) {
      memberType = await checkCompanyId(membershipCompanyId);
      if (!memberType) {
        return res.status(400).json({ error: "Invalid Company ID." });
      }
    }

    // Check existing records in Biaw.com Accounts table FIRST
    const existingMemberRecords = await base("Biaw.com Accounts")
      .select({ filterByFormula: `LOWER({Email Address}) = "${email.replace(/"/g, '\\"')}"` })
      .firstPage();

    // If user exists in Biaw.com Accounts table, send email and return immediately
    if (existingMemberRecords.length > 0) {
      const existingMemberRecord = existingMemberRecords[0];
      const firstName = existingMemberRecord.fields["First Name"] || firstName;
      const lastName = existingMemberRecord.fields["Last Name"] || lastName;
      const emailAddress = existingMemberRecord.fields["Email Address"] || email;
      const emailSubject = "Email Address Already in Use for Account Creation.";
      const emailBody = `Dear ${firstName} ${lastName},\n\nThank you for your interest in creating an account on our website. We noticed that the email address ${emailAddress} you used is already associated with an existing account.\n\nUnfortunately, you cannot use the same email to create multiple accounts. If you've forgotten your password, you can easily reset it by following the "Forgot Password" link on the login page.\n\nIf you need further assistance, please feel free to reach out to our support team.\n\nThank you for your understanding.\n\nBest regards,\nBIAW Support Team.`;
      await transporter.sendMail({
        from: `BIAW <${process.env.EMAIL_USER}>`,
        to: emailAddress,
        subject: emailSubject,
        text: emailBody
      });
      return res.status(400).json({ error: "Email already in use." });
    }

    // Check existing records in AIRTABLE_TABLE_NAME4 (only if not found in Biaw.com Accounts)
    const existingRecords = await base(process.env.AIRTABLE_TABLE_NAME4)
      .select({ filterByFormula: `LOWER({Email}) = "${email.replace(/"/g, '\\"')}"` })
      .firstPage();

    let emailSubject = "Verify your account.";
    let emailText = `Hello ${firstName || "User"} ${lastName || ""},\n\nThank you for joining! To finish signing up, Please verify your email.\n\nYour verification is below -- enter it in your open browser window and we'll get you signed in!\n\nYour OTP code is: ${otp}\n\nTo complete your verification, please click the following link:\n\nhttps://biaw.com/account-verification?memberType=${encodeURIComponent(memberType)}\n\nIf you didn't request this email, please ignore it.\n\nWelcome and thanks!\n\n`;
    let emailHtml = `<p>Hello ${firstName || "User"} ${lastName || ""},</p><p>Thank you for joining! To finish signing up, please verify your email.</p><p>Your verification code is: <strong>${otp}</strong></p><p>To complete your verification, please click the link below:</p><p><a href="https://biaw.com/account-verification?memberType=${encodeURIComponent(memberType)}">Click here to verify your email</a></p><p>If you didn't request this email, please ignore it.</p><p>Welcome and thanks!</p>`;

    // Check if user exists in either table
    if (existingRecords.length > 0) {
      const existingRecord = existingRecords[0];
      const verificationStatus = existingRecord.fields["Verification Status "];
      if ((!verificationStatus || verificationStatus === "Not Verified")) {
        await base(process.env.AIRTABLE_TABLE_NAME4).update([{
          id: existingRecord.id,
          fields: {
            "Verification Code": otp,
            "First Name": firstName,
            "Last Name": lastName,
            "Company": companyName,
            "Membership Company ID": membershipCompanyId,
          },
        }]);
        emailSubject = "Your Updated OTP Code";
        emailText = `Hello ${firstName || "User"} ${lastName || ""},\n\nIt seems you've already tried to register with us but didn't complete the verification process. No worries! We've generated a new OTP for you to complete your registration.\n\nYour new OTP code is: ${otp}\n\nTo complete your verification, please click the following link:\n\nhttps://biaw.com/account-verification?memberType=${encodeURIComponent(memberType)}\n\nIf you didn't request this email, please ignore it.\n\nWelcome and thanks!\n\n`;
        emailHtml = `<p>Hello ${firstName || "User"} ${lastName || ""},</p><p>It seems you've already tried to register with us but didn't complete the verification process. No worries! We've generated a new OTP for you to complete your registration.</p><p>Your new OTP code is: <strong>${otp}</strong></p><p>To complete your verification, please click the link below:</p><p><a href="https://biaw.com/account-verification?memberType=${encodeURIComponent(memberType)}">Click here to verify your email</a></p><p>If you didn't request this email, please ignore it.</p><p>Welcome and thanks!</p>`;
      } else if (verificationStatus === "Verified") {
        // Send 'Email Address Already in Use for Account Creation' email
        const firstName = existingRecord.fields["First Name"] || "";
        const lastName = existingRecord.fields["Last Name"] || "";
        const emailAddress = existingRecord.fields["Email"] || email;
        const emailSubject = "Email Address Already in Use for Account Creation.";
        const emailBody = `Dear ${firstName} ${lastName},\n\nThank you for your interest in creating an account on our website. We noticed that the email address ${emailAddress} you used is already associated with an existing account.\n\nUnfortunately, you cannot use the same email to create multiple accounts. If you've forgotten your password, you can easily reset it by following the "Forgot Password" link on the login page.\n\nIf you need further assistance, please feel free to reach out to our support team.\n\nThank you for your understanding.\n\nBest regards,\nBIAW Support Team.`;
        await transporter.sendMail({
          from: `BIAW <${process.env.EMAIL_USER}>`,
          to: emailAddress,
          subject: emailSubject,
          text: emailBody
        });
        return res.status(400).json({ error: "Email already in use." });
      } else {
        return res.status(400).json({ error: "Email already in use." });
      }
    } else {
      // User doesn't exist in either table, create new record
      await base(process.env.AIRTABLE_TABLE_NAME4).create([
        {
          fields: {
            "First Name": firstName,
            "Last Name": lastName,
            "Email": email,
            "Company": companyName,
            "Membership Company ID": membershipCompanyId,
            "Verification Code": otp,
            "Verification Status ": "Not Verified",
          },
        },
      ]);
    }
    await transporter.sendMail({
      from: `BIAW <${process.env.EMAIL_USER}>`,
      to: email,
      subject: emailSubject,
      text: emailText,
      html: emailHtml,
    });
    res.status(200).json({ message: "OTP sent successfully", otp, memberType });
  } catch (error) {
    console.error("Error sending OTP:", error);
    res.status(500).json({ error: "Failed to send OTP or add data to Airtable", details: error.message });
  }
};

// POST /verify-otp
exports.verifyOtp = async (req, res) => {
  const { email, otp, memberType } = req.body;
  const normalizedEmail = email ? email.toLowerCase().trim() : "";
  try {
    const records = await base(process.env.AIRTABLE_TABLE_NAME4)
      .select({ filterByFormula: `AND(LOWER({Email}) = '${normalizedEmail.replace(/'/g, "''")}', {Verification Code} = '${otp.replace(/'/g, "''")}')` })
      .firstPage();
    if (records.length === 0) {
      return res.status(400).json({ error: "Invalid email or OTP." });
    }
    return res.status(200).json({
      message: "OTP verified successfully.",
      email: normalizedEmail,
      memberType
    });
  } catch (error) {
    console.error("Error verifying OTP:", error.message);
    res.status(500).json({
      error: "Server error while verifying OTP.",
      details: error.message,
    });
  }
};

// POST /set-password
exports.setPassword = async (req, res) => {
  const { password, confirmPassword, email, memberType, membershipCompanyId } = req.body;
    const normalizedEmail = email ? email.toLowerCase().trim() : "";

  try {
    if (!password || !confirmPassword || !normalizedEmail) {
      return res.status(400).json({ error: "Password, Confirm Password, and Email are required." });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match." });
    }
    const records = await base(process.env.AIRTABLE_TABLE_NAME4)
      .select({ filterByFormula: `LOWER({Email}) = '${normalizedEmail.replace(/'/g, "''")}'` })
      .firstPage();
    if (records.length === 0) {
      return res.status(404).json({ error: "User not found in Airtable." });
    }
    const record = records[0];
    const {
      "First Name": firstName,
      "Last Name": lastName,
      "Company": company,
      "Membership Company ID": existingCompanyId,
    } = record.fields;
    const memberData = {
      email: normalizedEmail,
      password,
      customFields: {
        "first-name": firstName || "",
        "last-name": lastName || "",
        "company-name": company || "N/A",
        "pin-number": membershipCompanyId || existingCompanyId || "",
        "user": memberType || "",
        "user-type": memberType ? "Member" : "Non-Member",
        "director": "Non-Director",
      },
      plans: [
        {
          planId: memberType
            ? "pln_member-olag0ljk"
            : "pln_non-member-pzaf0lap"
        }
      ]
    };
    const memberstackResponse = await createMemberInMemberstack(memberData);
    if (memberstackResponse.error) {
      throw new Error(memberstackResponse.error);
    }
    await base(process.env.AIRTABLE_TABLE_NAME4).update(record.id, {
      "Member ID": memberstackResponse.data.id,
      "Verification Status ": "Verified",
    });
    let emailSubject = "Welcome! Your Account Has Been Successfully Verified";
    let emailText = `Dear ${firstName} ${lastName},\n\nCongratulations! Your account has been successfully Verified. We're excited to have you as part of our community.\n\nYou can now log in using your email ${normalizedEmail} and explore all the features we offer. If you ever need any assistance or have any questions, feel free to reach out to our support team.\n\nThank you for joining us, and we look forward to providing you with an excellent experience!\n\nBest regards,\nBIAW Support Team`;
    let emailHtml = `<p>Dear ${firstName} ${lastName},</p><p>Congratulations! Your account has been successfully Verified. We're excited to have you as part of our community.</p><p>You can now log in using your email ${normalizedEmail} and explore all the features we offer. If you ever need any assistance or have any questions, feel free to reach out to our support team.</p><p>Thank you for joining us, and we look forward to providing you with an excellent experience!</p><p>Best regards,<br>BIAW Support Team</p>`;
    if (!memberType) {
      emailSubject = "Welcome! Your Account Has Been Successfully Verified";
      emailText = `Dear ${firstName} ${lastName},\n\nCongratulations! Your account has been successfully Verified. We're excited to have you as part of our community.\n\nYou can now log in using your email ${normalizedEmail} and explore all the features we offer.\n\n Currently, your membership type is Non-member. If you'd like to upgrade your profile, you'll need to verify your account with your company ID.\n\nIf you've forgotten your company ID, you can request it using your registered email. Simply follow this link to request your company ID\n\nhttps://biaw.com/find-your-company-id.\n\nIf you ever need any assistance or have any questions, feel free to reach out to our support team.\n\nBest regards,\nBIAW Support Team`;
      emailHtml = `<p>Dear ${firstName} ${lastName},</p><p>Congratulations! Your account has been successfully Verified. We're excited to have you as part of our community.</p><p>If you have any questions or need further assistance, feel free to reach out to our support team.</p><p>You can now log in using your email ${normalizedEmail} and explore all the features we offer.</p><p>Currently, your membership type is Non-member. If you'd like to upgrade your profile, you'll need to verify your account with your company ID.</p><p>If you've forgotten your company ID, you can request it using your registered email. Simply follow this link to <a href="https://biaw.com/find-your-company-id">request your company ID</a>.</p><p>If you ever need any assistance or have any questions, feel free to reach out to our support team.</p><p>Best regards,<br>BIAW Support Team</p>`;
    }
    await transporter.sendMail({
      from: `BIAW <${process.env.EMAIL_USER}>`,
      to: email,
      subject: emailSubject,
      text: emailText,
      html: emailHtml,
    });
    res.status(200).json({
      message: "Member created successfully in Memberstack, and email sent.",
      memberstackResponse,
    });
  } catch (error) {
    console.error("Error in set-password:", error.message);
    res.status(500).json({
      error: "Failed to create Memberstack member and send email.",
      details: error.message,
    });
  }
};

// POST /update-company-id
exports.updateCompanyId = async (req, res) => {
  const { email, companyId } = req.body;
  if (!email || !companyId) {
    return res.status(400).json({ error: "Email and Company ID are required." });
  }
  try {
    const companyData = await checkCompanyIds(companyId);
    if (!companyData) {
      return res.status(400).json({ error: "Invalid Company ID." });
    }
    const { values, selected } = companyData;
    if (values.length > 1) {
      // sendNotificationEmail logic can be moved to emailService if needed
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: "abin@seattlenewmedia.com",
        subject: `User Registration Update: Multiple Records with Company ID ${companyId}`,
        text: `Dear\n\nWe wanted to inform you that a user has successfully registered with Company ID ${companyId} and has been upgraded to the ${selected} account type.\n\nDuring our database review, we identified multiple records in our Airtable database associated with the same Company ID.The ID is associated with multiple values: ${values.join(", ")}\n\nBest regards,\nBIAW Support Team.`
      });
    }
    const memberType = selected;
    const userRecords = await base("Biaw.com Accounts")
      .select({ filterByFormula: `{Email Address} = '${email}'` })
      .firstPage();
    if (userRecords.length === 0) {
      return res.status(404).json({ error: "User not found in Airtable." });
    }
    const userRecord = userRecords[0];
    // await base(process.env.AIRTABLE_TABLE_NAME4).update(userRecord.id, {
    //   "Membership Company ID": companyId,
    // });
    const memberId = userRecord.fields["Member ID"];
    if (!memberId) {
      return res.status(404).json({ error: "Member ID not found in Airtable." });
    }

    // Update member custom fields
    const memberstackUpdateUrl = `https://admin.memberstack.com/members/${memberId}`;
    const headers = {
      "X-API-KEY": process.env.MEMBERSTACK_API_KEY,
      "Content-Type": "application/json",
    };

    await require('axios').patch(
      memberstackUpdateUrl,
      {
        customFields: {
          "pin-number": companyId,
          "user": memberType,
          "user-type": memberType ? "Member" : "Non-Member"
        }
      },
      { headers }
    );

    // Handle plan changes using dedicated plan management endpoints
    if (memberType) {
      // User is upgrading to member - add member plan and remove non-member plan
      try {
        // Add member plan
        await require('axios').post(
          `https://admin.memberstack.com/members/${memberId}/add-plan`,
          {
            planId: "pln_member-olag0ljk"
          },
          { headers }
        );
        console.log(`Added member plan for user ${email}`);
      } catch (error) {
        console.error(`Error adding member plan for ${email}:`, error.response?.data || error.message);
      }

      try {
        // Remove non-member plan
        await require('axios').post(
          `https://admin.memberstack.com/members/${memberId}/remove-plan`,
          {
            planId: "pln_non-member-pzaf0lap"
          },
          { headers }
        );
        console.log(`Removed non-member plan for user ${email}`);
      } catch (error) {
        console.error(`Error removing non-member plan for ${email}:`, error.response?.data || error.message);
      }
    }

    const firstName = userRecord.fields["First Name"] || "";
    const lastName = userRecord.fields["Last Name"] || "";
    const emailAddress = userRecord.fields["Email"] || email;
    const emailSubject = "Profile Updated Successfully - Welcome as a Member!";
    const emailBody = `Dear ${firstName} ${lastName},\n\nCongratulations! Your profile has been successfully updated, and you are now Upgraded as a ${memberType} of BIAW.\n\nFeel free to contact us at (360) 352-7800 if you need further assistance. Thank you!\n\nBest regards,\nBIAW Support Team`;
    await transporter.sendMail({
      from: `BIAW <${process.env.EMAIL_USER}>`,
      to: emailAddress,
      subject: emailSubject,
      text: emailBody
    });
    const memberRecords = await base("Biaw.com Accounts")
      .select({ filterByFormula: `{Email Address} = '${email}'` })
      .firstPage();
    if (memberRecords.length === 0) {
      return res.status(404).json({ error: "Member not found in the 'Members' table." });
    }
    const memberRecord = memberRecords[0];
    await base("Biaw.com Accounts").update(memberRecord.id, {
      "Company ID Used ": companyId,
      "User": memberType,
      "UserType": "Member",
      "Membership Status": "Member"
    });
    res.status(200).json({ message: "Company ID updated successfully." });
  } catch (error) {
    console.error("Error updating Company ID:", error.message);
    res.status(500).json({ error: "Failed to update Company ID.", details: error.message });
  }
};

// POST /submit
exports.submit = async (req, res) => {
  const { email } = req.body;
  const normalizedEmail = email ? email.toLowerCase().trim() : "";
  if (!normalizedEmail) {
    return res.status(400).json({ error: 'Email is required' });
  }
  try {
    const records = await base(process.env.AIRTABLE_TABLE_NAME2)
      .select({ filterByFormula: `LOWER({Contact Email Address}) = "${normalizedEmail.replace(/"/g, '\\"')}"` })
      .firstPage();
    if (records.length === 0) {
      await transporter.sendMail({
        from: `BIAW <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Company ID is Not found',
        text: `Dear Member\n\nWe attempted to retrieve your Company ID, unfortunately, we could not find your email address ${email} in our database of members from local homebuilding associations.\n\nIf you believe this is an error or if you recently joined a local association, please provide us with additional details or reach out to your local homebuilding association.
        \nYou can find your local association here:\n 
        https://www.biaw.com/join-locally \n\nFeel free to contact us at (360) 352-7800 if you need further assistance. Thank you!
        \nBest regards,\nBIAW Support Team`,
      });
      return res.status(200).json({ message: 'Email not found. Notification sent.' });
    }
    const companyID = records[0].fields['Company ID'];
    await transporter.sendMail({
      from: `BIAW <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Found Your Company ID',
      text: `Dear Member\n\nThank you for reaching out to us.\n\nYour Company ID is: ${companyID} \n\nIf you ever need any assistance or have any questions, feel free to reach out to our support team.\n\nBest regards,\nBIAW Support Team`,
    });
    res.status(200).json({ message: 'Company ID sent to the email.' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'An error occurred' });
  }
};

// POST /api/directors
exports.handleDirectorsWebhook = async (req, res) => {
  try {
    const record = req.body;
    console.log('Received webhook from Airtable:', record);
    const {
      id,
      fields: {
        Email: email,
        'First Name': firstName,
        'Last Name': lastName,
        'Company Name': companyName,
        'Company ID': companyId,
        Password,
        User,
        'Create Account': createAccount,
        Director,
      }
    } = record;
      const normalizedEmail = email ? email.toLowerCase().trim() : "";
    if (!firstName || !lastName || !companyName || !Password || !normalizedEmail) {
      console.log(`Missing required fields for email: ${email}. First Name, Last Name, and Company Name are required.`);
      return res.status(400).json({
        error: 'Missing required fields',
        details: 'First Name, Last Name, and Company Name are required'
      });
    }
    const userType = User?.name || User || '';
    if ((companyId && !userType) || (!companyId && userType)) {
      console.log(`Company ID and User must both be present or both be empty for email: ${email}`);
      return res.status(400).json({
        error: 'Company ID and User mismatch',
        details: 'If Company ID is present, User must also be present, and vice versa.'
      });
    }
    const cleanedPassword = Password ? Password.trim() : '';
    if (!cleanedPassword || cleanedPassword.length < 8) {
      console.log(`Password for ${email} is invalid (must be at least 8 characters). Skipping...`);
      return res.status(400).json({
        error: 'Invalid password',
        details: 'Password must be at least 8 characters long'
      });
    }
    if (companyId && userType) {
      const isValidCombo = await checkCompanyIdAndMemberType(companyId, userType);
      if (!isValidCombo) {
        console.log(`Invalid Company ID and Member Type combination: ${companyId}, ${userType} for email: ${email}`);
        return res.status(400).json({
          error: 'Invalid Company ID and Member Type',
          details: 'The provided Company ID and Member Type combination does not exist in our records'
        });
      }
    }
    const createAccountStatus = createAccount?.name || createAccount;
    if (createAccountStatus === 'Create/update') {
      let memberId = await checkMemberstackEmail(normalizedEmail);
      
      // Build customFields, only including user and user-type if User is provided
      const customFields = {
        "first-name": firstName,
        "last-name": lastName,
        "company-name": companyName,
        director: Director ? "Director" : "Non-Director",
      };
      
      // Only add pin-number if Company ID is provided in webhook
      if (companyId && companyId.trim() !== "") {
        customFields["pin-number"] = companyId;
      }
      
      // Only add user and user-type if User is provided in webhook
      if (User && User.trim() !== "") {
        customFields["user"] = userType;
        customFields["user-type"] = userType ? "Member" : "Non-Member";
      }
      
      const memberData = {
        email: normalizedEmail,
        password: cleanedPassword,
        customFields,
        plans: [
          {
            planId: userType
              ? "pln_member-olag0ljk"
              : "pln_non-member-pzaf0lap"
          }
        ]
      };
      if (memberId) {
        console.log(`Memberstack member found for ${email}. Updating...`);

        // 1. Fetch current user-type before update
        let currentUserType = "Non-Member";
        try {
          const memberstackRes = await require('axios').get(
            `https://admin.memberstack.com/members/${memberId}`,
            { headers: { "X-API-KEY": process.env.MEMBERSTACK_API_KEY, "Content-Type": "application/json" } }
          );
          currentUserType = memberstackRes.data?.customFields?.["user-type"] || "Non-Member";
        } catch (err) {
          console.error("Could not fetch current Memberstack user-type:", err.response?.data || err.message);
        }

        // 2. Update the member using your model function
        await updateMemberstack(memberId, memberData);

        // 3. Plan management based on whether User is provided in webhook
        if (User && User.trim() !== "") {
          // User is provided - check for upgrade from Non-Member to Member
          const newUserType = userType ? "Member" : "Non-Member";
          if (currentUserType === "Non-Member" && newUserType === "Member") {
            try {
              // Add member plan
              await require('axios').post(
                `https://admin.memberstack.com/members/${memberId}/add-plan`,
                { planId: "pln_member-olag0ljk" },
                { headers: { "X-API-KEY": process.env.MEMBERSTACK_API_KEY, "Content-Type": "application/json" } }
              );
              console.log(`Added member plan for user ${email}`);
            } catch (error) {
              console.error(`Error adding member plan for ${email}:`, error.response?.data || error.message);
            }

            try {
              // Remove non-member plan
              await require('axios').post(
                `https://admin.memberstack.com/members/${memberId}/remove-plan`,
                { planId: "pln_non-member-pzaf0lap" },
                { headers: { "X-API-KEY": process.env.MEMBERSTACK_API_KEY, "Content-Type": "application/json" } }
              );
              console.log(`Removed non-member plan for user ${email}`);
            } catch (error) {
              console.error(`Error removing non-member plan for ${email}:`, error.response?.data || error.message);
            }
          }
        }
        // If User is null/empty, don't change the user type or plans - preserve existing values
      } else {
        console.log(`No Memberstack member found for ${email}. Creating new member...`);
        const newMemberResponse = await createMemberInMemberstack({
          email: normalizedEmail,
          password: cleanedPassword,
          customFields: memberData.customFields,
          plans: memberData.plans
        });
        const newMemberId = newMemberResponse?.data?.id || newMemberResponse?.id || "";
        if (newMemberId) {
          await require('../models/airtableModel').updateAirtableAfterCreatingMember(id, newMemberId, email, cleanedPassword, firstName, lastName);

          // SEND THE NEW ACCOUNT EMAIL HERE
          const subject = "Account Created - Action Required to Set Password";
          const body = `Dear ${firstName} ${lastName},\nI hope this email finds you well.\nWe are pleased to inform you that you now have access to the BIAW Board of Directors meeting materials. As part of this transition, a dedicated account has been created for you on our platform specifically for directors.\nTo complete your registration and gain access, please set your password by following the link below:\nhttps://biaw.com/login\nFeel free to contact us at (360) 352-7800 if you need further assistance. Thank you!\nBest regards,\nBIAW Support.`;
          await transporter.sendMail({
            from: `BIAW <${process.env.EMAIL_USER}>`,
            to: email,
            subject,
            text: body
          });
        } else {
          console.error('Failed to create new Memberstack member. Skipping Airtable update.');
          return res.status(500).json({ error: 'Failed to create Memberstack member' });
        }
      }
      const memberRecords = await base("Biaw.com Accounts")
        .select({ filterByFormula: `LOWER({Email Address}) = '${normalizedEmail.replace(/'/g, "''")}'` })
        .firstPage();
      const userTypeForMembers = userType ? "Member" : "Non-Member";
      const safeCompanyId = companyId || null;
      const safeMemberType = userType || null;
      if (memberRecords.length > 0) {
        const memberRecord = memberRecords[0];
        const existingData = memberRecord.fields;
        const updatedData = {
          "Company ID Used ": safeCompanyId,
        };
        
        if (User && User.trim() !== "") {
          updatedData.User = userType || null;
          updatedData.UserType = userType ? "Member" : "Non-Member";
          updatedData["Membership Status"] = userType ? "Member" : "Non-member";
        }
        
        const hasChanges = Object.entries(updatedData).some(
          ([key, value]) => existingData[key] !== value
        );
        if (hasChanges) {
          await base("Biaw.com Accounts").update(memberRecord.id, updatedData);
          console.log(`Updated 'Members' table for email: ${email}`);
        } else {
          console.log(`No changes detected for email: ${email}. Skipping update.`);
        }

        // Always send the director email based on the webhook value
        const createdTime = record.createdTime || new Date().toISOString();
        let directorSubject, directorBody;
        if (Director === true) {
          directorSubject = "BIAW Board of Directors Access";
          directorBody = `Dear ${firstName} ${lastName},\n\nWe are pleased to inform you that, effective ${formatDate(createdTime, "MM/DD/YYYY")}, you now have access to the BIAW Board of Directors meeting materials.\nThank you for your hard work and dedication, and for the significant contributions you have made to our organization. We look forward to seeing you at our next board meeting!\n\nIf you have any questions, please contact Kristi Dohring at kristid@biaw.com or (360) 352-7800 x 113. Thank you!\n\nBest regards,\nBIAW Support.`;
        } else {
          directorSubject = "Notice of Removal from BIAW Board of Directors Access";
          directorBody = `Dear ${firstName} ${lastName},\n\nWe regret to inform you that, as of ${formatDate(createdTime, "MM/DD/YYYY")}, your access to the BIAW Board of Directors meeting materials has been removed in accordance with the organization's guidelines and policies.\n\nWe appreciate the contributions you have made during your time as Director and thank you for your service.\nIf you have any questions, please contact Kristi Dohring at kristid@biaw.com or (360) 352-7800 x 113. Thank you!\n\nBest regards,\nBIAW Support.`;
        }
        try {
          await transporter.sendMail({
            from: `BIAW <${process.env.EMAIL_USER}>`,
            to: email,
            subject: directorSubject,
            text: directorBody
          });
          console.log(`Sent director email: ${directorSubject} to ${email}`);
        } catch (err) {
          console.error("Error sending director email:", err);
        }
      } else {
        console.warn(`No matching record found in 'Members' table for email: ${email}`);
      }

      let finalMemberId = memberId;
      if (!finalMemberId) {
        // If memberId is not set (i.e., just created), try to fetch it again
        finalMemberId = await checkMemberstackEmail(normalizedEmail);
      }

       await base("Director Access").update(id, {
        "Member ID": finalMemberId,
        "Create Account": "Created/Updated"
      });
      

      res.status(200).json({ message: 'Record processed successfully' });
    } else {
      console.log(`Skipping record for email: ${email} (Create Account is not 'Create/update')`);
      res.status(200).json({ message: 'Record skipped - Create Account is not Create/update' });
    }
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

// POST /api/create-memberstack-account
exports.createMemberstackAccount = async (req, res) => {
  try {
    const record = req.body;
    console.log('Received Airtable data for Memberstack account creation:', record);
    const {
      id,
      fields: {
        'First Name': firstName,
        'Last Name': lastName,
        'Email': email,
        'Company Name': companyName,
        'Company ID': companyId,
        'User': user,
        'Phone Number': phoneNumber,
        'User Type': userType,
        'Password': password,
        'Create Account': createAccount
      }
    } = record;
    
    // Trim the email to remove any leading/trailing whitespace
    const cleanedEmail = email ? email.trim() : '';
    
    const createAccountStatus = createAccount?.name || createAccount;
    if (createAccountStatus !== 'Create New Account') {
      console.log(`Skipping record for email: ${cleanedEmail} (Create Account is not 'Create New Account')`);
      return res.status(200).json({ message: 'Record skipped - Create Account is not Create New Account' });
    }
    if (!firstName || !cleanedEmail || !password) {
      console.log(`Missing required fields for email: ${cleanedEmail}`);
      await base(process.env.AIRTABLE_TABLE_NAME5).update([
        {
          id: id,
          fields: { "Create Account": "Missing Required Fields" }
        }
      ]);
      return res.status(400).json({
        error: 'Missing required fields',
        details: 'First Name, Last Name, Email, Company Name, and Password are required'
      });
    }
    // Check if user already exists in Memberstack
    const existingMemberId = await checkMemberstackEmail(cleanedEmail);
    if (existingMemberId) {
      console.log(`User with email ${cleanedEmail} already exists in Memberstack`);
      try {
        console.log(`Updating Airtable record ${id} with "Email ID already registered"`);
        console.log(`Using table: ${process.env.AIRTABLE_TABLE_NAME5}`);

        await base(process.env.AIRTABLE_TABLE_NAME5).update([
          {
            id: id,
            fields: { "Create Account": "Email ID already registered" }
          }
        ]);
        console.log(`Successfully updated Airtable record ${id}`);
      } catch (updateError) {
        console.error('Error updating Airtable record:', updateError);
        console.error('Airtable table name:', process.env.AIRTABLE_TABLE_NAME5);
      }
      return res.status(400).json({
        error: 'User already exists',
        details: 'Email ID already registered in Memberstack'
      });
    }
    const cleanedPassword = password.trim();
    if (cleanedPassword.length < 8) {
      console.log(`Password for ${cleanedEmail} is invalid (must be at least 8 characters)`);
      return res.status(400).json({
        error: 'Invalid password',
        details: 'Password must be at least 8 characters long'
      });
    }
    const User = user?.name || user || '';
    
    // Determine if user should get Member or Non-Member plan
    // Only Member plan if BOTH Company ID and User are available
    const hasCompanyId = companyId && companyId.trim() !== "";
    const hasUser = User && User.trim() !== "";
    const shouldBeMember = hasCompanyId && hasUser;
    
    const memberData = {
      email: cleanedEmail,
      password: cleanedPassword,
      customFields: {
        "first-name": firstName,
        "last-name": lastName,
        "company-name": companyName,
        "pin-number": companyId || "",
        "user": User || "",
        "user-type": shouldBeMember ? "Member" : "Non-Member",
        "director": "Non-Director",
        "phone-number": phoneNumber || ""
      },
      plans: [
        {
          planId: shouldBeMember
            ? "pln_member-olag0ljk"
            : "pln_non-member-pzaf0lap"
        }
      ]
    };
    const memberstackResponse = await createMemberInMemberstack(memberData);
    if (memberstackResponse.error) {
      console.error('Failed to create Memberstack member:', memberstackResponse.error);

      // // If the error is "email-already-in-use", update Airtable accordingly
      // if (
      //   memberstackResponse.error.code === 'email-already-in-use' ||
      //   memberstackResponse.error.message?.toLowerCase().includes('already taken')
      // ) {
      //   try {
      //     await base(process.env.AIRTABLE_TABLE_NAME5).update([
      //       {
      //         id: id,
      //         fields: { "Create Account": "Email ID already registered" }
      //       }
      //     ]);
      //     console.log(`Updated Airtable record ${id} with "Email ID already registered" due to email-already-in-use error`);
      //   } catch (updateError) {
      //     console.error('Error updating Airtable record for email-already-in-use:', updateError);
      //   }
      //   return res.status(400).json({
      //     error: 'User already exists',
      //     details: 'Email ID already registered in Memberstack'
      //   });
      // }

      // // Otherwise, return the generic error
      return res.status(500).json({
        error: 'Failed to create Memberstack member',
        details: memberstackResponse.error
      });
    }
    const memberId = memberstackResponse.data?.id;
    if (!memberId) {
      return res.status(500).json({
        error: 'No Member ID returned',
        details: 'Memberstack did not return a valid Member ID'
      });
    }
    await base(process.env.AIRTABLE_TABLE_NAME5).update([
      {
        id: id,
        fields: {
          "Member ID": memberId,
          "Create Account": "Account Created",
          "User Type": shouldBeMember ? "Member" : "Non-member",
        }
      }
    ]);
    console.log(`Successfully created Memberstack account for ${cleanedEmail} with Member ID: ${memberId}`);
    res.status(200).json({
      message: 'Memberstack account created successfully',
      memberId: memberId,
      email: cleanedEmail
    });
  } catch (error) {
    console.error('Error creating Memberstack account:', error);

    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
};

exports.processAirtableUpdates = async (req, res) => {
  try {
    // Accept either a single record or an array of records
    const records = Array.isArray(req.body) ? req.body : [req.body];
    await require('../services/planService').processAndUpdateRecords(records);
    res.status(200).json({ message: 'Airtable and Memberstack records processed successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to process records', details: error.message });
  }
}; 