const transporter = require('../config/email');
const { formatCurrency } = require('../utils/helpers');
const { logError } = require('../utils/helpers');

class EmailService {
  // Send class registration confirmation
  static async sendRegistrationConfirmation(userEmail, userName, className, instructorName, mode, description,location, purchasedClassUrl, seatCount, amountTotal, platform, classDate, startTime) {
    try {
      // Format the date
      const formatDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
          month: '2-digit',
          day: '2-digit',
          year: 'numeric'
        });
      };

      const mailOptions = {
        from: `"BIAW" <${process.env.EMAIL_USER}>`,
        to: userEmail,
        subject: `Registration Confirmed for "${className}"${classDate ? ` on ${formatDate(classDate)}` : ''}`,
        html: `
        <p>Dear ${userName},</p>
        
        <p>Thank you for registering for <strong>${className}</strong>${classDate ? ` scheduled on ${formatDate(classDate)}` : ''}${startTime ? ` at ${startTime}` : ''}. We're excited to have you join us for this session.</p>
        
        <h4>Class Details:</h4>
        <ul>
          <li><strong>Instructor:</strong> ${instructorName}</li>
          <li><strong>Mode:</strong> ${mode}</li>
          <li><strong>Location:</strong>${platform}, ${location}</li>
          <li><strong>No of Seats Booked:</strong> ${seatCount}</li>
        </ul>
        
        <p>The registration fee of ${formatCurrency(amountTotal)} has been successfully processed. If you have any questions or need assistance, feel free to reach out. Please note that cancellations must be made at least 48 hours in advance to be eligible for a refund.</p>
        
        <p>We look forward to seeing you at the class!</p>
        
        <p>Best regards,<br>BIAW Support Team</p>
      `,
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`Email sent to ${userEmail}: ${info.response}`);
      return info;
    } catch (error) {
      logError('Sending registration confirmation email', error);
      throw error;
    }
  }

  // Admin copy when a paid registration completes (Stripe webhook path)
  static async sendNewClassRegistrationAdminAlert(detail) {
    try {
      const formatDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '';
        return date.toLocaleDateString('en-US', {
          month: '2-digit',
          day: '2-digit',
          year: 'numeric',
        });
      };

      const {
        className,
        classDate,
        startTime,
        firstName,
        lastName,
        userType,
        instructorName,
        mode,
        locationText,
        paymentStatus,
        registrationDate,
        seatCount,
        amountDisplay,
      } = detail;

      const adminEmail = 'andya@biaw.com';
      const datePart = formatDate(classDate);
      const subject = datePart
        ? `New Class Registration Alert – ${className} on ${datePart}.`
        : `New Class Registration Alert – ${className}.`;

      let schedulePhrase = '';
      if (datePart && startTime) {
        schedulePhrase = `, scheduled for ${datePart} at ${startTime}`;
      } else if (datePart) {
        schedulePhrase = `, scheduled for ${datePart}`;
      } else if (startTime) {
        schedulePhrase = ` at ${startTime}`;
      }

      const registrantName = [firstName, lastName].filter(Boolean).join(' ').trim() || '—';
      const amountLine =
        amountDisplay != null && String(amountDisplay).trim() !== ''
          ? `<li><strong>Amount Paid:</strong> ${amountDisplay}</li>`
          : '';

      const mailOptions = {
        from: `"BIAW" <${process.env.EMAIL_USER}>`,
        to: adminEmail,
        subject,
        html: `
        <p>Dear Andy Arrants,</p>

        <p>This is to inform you that <strong>${registrantName}</strong> has successfully registered for the upcoming class, <strong>${className}</strong>${schedulePhrase}.</p>

        <p><strong>Registration Details:</strong></p>
        <ul>
          <li><strong>User Type:</strong> ${userType || '—'}</li>
          <li><strong>Instructor:</strong> ${instructorName || '—'}</li>
          <li><strong>Mode of Class:</strong> ${mode || '—'}</li>
          <li><strong>Location:</strong> ${locationText || '—'}</li>
          <li><strong>Payment Status:</strong> ${paymentStatus || '—'}</li>
          <li><strong>Registration Date:</strong> ${registrationDate || '—'}</li>
          <li><strong>No of Guests attending the session:</strong> ${seatCount}</li>
          ${amountLine}
        </ul>

        <p>Best regards,<br>BIAW Support Team</p>
      `,
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`Admin registration alert sent to ${adminEmail}: ${info.response}`);
      return info;
    } catch (error) {
      logError('Sending admin new class registration alert', error);
      throw error;
    }
  }

  // Send waitlist notification
  static async sendWaitlistNotification(email, name, className, classURL) {
    try {
      const mailOptions = {
        from: `"BIAW" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `Seats Available for ${className || 'Your Class'}`,
        html: `
          <p>Hello ${name || ''},</p>
          
          <p>Good news! Seats have recently become available for <strong>${className || 'your class'}</strong>. We know many of you have been waiting, so we encourage you to secure your spot as soon as possible before it fills up again.</p>
          
          <p>Please complete your registration by visiting <a href="${classURL}">${classURL}</a> and finalizing your purchase.</p>
          
          <p>If you have any questions or need assistance, don't hesitate to contact us.</p>
          
          <p>Thank you, and we look forward to seeing you in class!</p>
          
          <p>Best regards,<br>BIAW Support Team</p>
        `,
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`Email sent to ${email} for class: ${className}`);
      return info;
    } catch (error) {
      logError('Sending waitlist notification', error);
      throw error;
    }
  }

  // Send cancellation confirmation
  static async sendCancellationConfirmation(userEmail, userName, className, classUrl, cancellationDate, refundAmount = null) {
    try {
      let emailSubject = `Class Cancellation Confirmation ${className}`;
      let emailBody = `
        <p>Dear ${userName},</p>
        <p>We’ve received your request to cancel the class, and we’re writing to confirm that the cancellation has been processed successfully</p>
        <p>.Details of Your Cancellation:</p>
        <ul>
          <li>Class: ${className}</li>
          <li>Date of Cancellation: ${cancellationDate}</li>
      `;

      if (refundAmount) {
        emailBody += `
          <li>Refund Amount: ${refundAmount} USD</li>
        </ul>
        <p>Please allow 15 business days for the refund to reflect in your account, depending on your payment provider.</p>
        `;
      } else {
        emailBody += `
        </ul>
        <p>Your registration has been successfully canceled.</p>
        `;
      }

      emailBody += `
        <p>If you have any questions or need further assistance, feel free to contact us at (360) 352-7800 if you need further assistance.</p>
        <p>Thank you for your understanding, and we hope to see you again soon.</p>
        <p>Best regards,<br>BIAW Support Team</p>
      `;

      const mailOptions = {
        from: `"BIAW" <${process.env.EMAIL_USER}>`,
        to: userEmail,
        subject: emailSubject,
        html: emailBody,
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`Cancellation email sent to ${userEmail}: ${info.response}`);
      return info;
    } catch (error) {
      logError('Sending cancellation confirmation', error);
      throw error;
    }
  }

  // Send waitlist entry confirmation
  static async sendWaitlistEntryConfirmation(userEmail, className, instructor, classUrl) {
    try {
      const userMailOptions = {
        from: `"BIAW" <${process.env.EMAIL_USER}>`,
        to: userEmail,
        subject: 'You are on the Waitlist for the Class',
        html: `
          <p>Hello,</p>
          
          <p>Thank you for your interest in ${className}. Currently the class is full, but you’ve been added to the waitlist. We will notify you if a spot becomes available.</p>
          
          <p>Feel free to contact us at (360) 352-7800 if you need further assistance. We appreciate your patience and interest!</p>
          
          <p>Best regards,<br>BIAW Support Team</p>
        `,
      };

      const adminMailOptions = {
        from: `"BIAW" <${process.env.EMAIL_USER}>`,
        to: "andya@biaw.com",
        subject: `Waitlist Alert - On ${new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}`,
        html: `
          <p>Dear Andy Arrants,</p>
          
          <p>This is to notify you that <strong>${userEmail}</strong> has been added to the waitlist for <strong>${className}</strong>.</p>
          
          <h4>Waitlist Details:</h4>
          <ul>
            <li><strong>User Email:</strong> ${userEmail}</li>
            <li><strong>Instructor:</strong> ${instructor}</li>
            <li><strong>Class URL:</strong> <a href="${classUrl}">${classUrl}</a></li>
            <li><strong>Waitlist Date:</strong> ${new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}</li>
          </ul>
          
          <p>Please review the details and proceed as necessary.</p>
          
          <p>Best regards,<br>BIAW Support Team</p>
        `,
      };

      await transporter.sendMail(userMailOptions);
      await transporter.sendMail(adminMailOptions);
      console.log('Waitlist entry confirmation emails sent successfully');
    } catch (error) {
      logError('Sending waitlist entry confirmation', error);
      throw error;
    }
  }

  // Send payment reminder
  static async sendPaymentReminder(userEmail, userName, className, classUrl) {
    try {
      const mailOptions = {
        from: `"BIAW" <${process.env.EMAIL_USER}>`,
        to: userEmail,
        subject: "Reminder: Complete Your Payment",
        text: `Hi ${userName}, 
        
 you registered for the class ${className}

but haven't completed your payment. Please complete it to confirm your seat.

here is your class url ${classUrl} 

if you are already purchased please ignore this message.
        
Best Regards
BIAW Support Team`,
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`Payment reminder email sent to ${userEmail}`);
      return info;
    } catch (error) {
      logError('Sending payment reminder', error);
      throw error;
    }
  }

  // Send ROII class confirmation
  static async sendROIIClassConfirmation(userEmail, userName, className, description, seatCount, classUrl, location) {
    try {
      const mailOptions = {
        from: `"BIAW" <${process.env.EMAIL_USER}>`,
        to: userEmail,
        subject: `Class Registration Confirmation for ${className}`,
        html: `
          <p>Hi ${userName},</p>
           <p>We’re pleased to confirm your registration for the class <strong>${className}</strong>. As an ROII member, this class is Free. Here are the details:</p>
          <ul>
            <li>Number of Seats Purchased: ${seatCount}</li>
            <li>Location : ${location}</li>
          </ul>
          <p>We look forward to seeing you in class!</p>
          <p>We appreciate your continued support. If you have any questions, feel free to contact us at (360) 352-7800 if you need further assistance. Thank you!</p>
          <p>Best regards,<br>BIAW Support Team</p>
        `,
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`ROII confirmation email sent to ${userEmail}: ${info.response}`);
      return info;
    } catch (error) {
      logError('Sending ROII class confirmation', error);
      throw error;
    }
  }

  // Send refund confirmation email
  static async sendRefundConfirmationEmail(email, username, classname, seatsPurchased) {
    try {
      const mailOptions = {
        from: `"BIAW" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Class Cancellation and Refund Processed Successfully",
        html: `Dear ${username},<br><br>
      
We hope this email finds you well.<br><br>
      
We would like to inform you that your refund request for the class <b>${classname}</b> and ${seatsPurchased} seat(s) has been successfully processed. 
The payment status for your purchase has been updated, and the refund has been confirmed.<br><br> Please allow 15 business days for the refund to reflect in your account, depending on your payment provider.
      
If you have any questions or need further assistance, please do not hesitate to contact our support team.<br><br>
      
Thank you for your patience and understanding.<br><br>
      
Best regards,<br>
BIAW Support Team`
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`Refund confirmation email sent to ${email}`);
      return info;
    } catch (error) {
      logError('Sending refund confirmation email', error);
      throw error;
    }
  }

  // Send ROII cancellation email
  static async sendROIICancellationEmail(email, username, classname, seatsPurchased) {
    try {
      const mailOptions = {
        from: `"BIAW" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `Class Cancellation Processed Successfully for ${classname}`,
        html: `
  <p>Dear ${username},</p>

  <p>We hope this email finds you well.</p>

  <p>We would like to inform you that your cancellation request for the class <strong>${classname}</strong> and ${seatsPurchased} seat(s) has been successfully processed.</p>

  <p>The confirmation status for your class has been updated.</p>

  <p>If you have any questions or need further assistance, please do not hesitate to contact our support team.</p>

  <p>Best regards,<br>
  BIAW Support Team</p>
`
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`ROII cancellation email sent to ${email}`);
      return info;
    } catch (error) {
      logError('Sending ROII cancellation email', error);
      throw error;
    }
  }

  // Send cancellation without refund email
  static async sendCancellationWithoutRefundEmail(email, username, classname, seatsPurchased) {
    try {
      const mailOptions = {
        from: `"BIAW" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `Class Cancellation Processed Successfully for ${classname}`,
        text: `Dear ${username},
      
We hope this email finds you well.
      
We would like to inform you that your cancel request for class ${classname} and ${seatsPurchased} seat(s) has been successfully processed. 
The confirmation status for your class has been updated
      
If you have any questions or need further assistance, please do not hesitate to contact our support team.
      
Best regards,  
BIAW Support Team`
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`Cancellation without refund email sent to ${email}`);
      return info;
    } catch (error) {
      logError('Sending cancellation without refund email', error);
      throw error;
    }
  }

  // Send booking rejection email
  static async sendBookingRejectionEmail(email, name) {
    try {
      const mailOptions = {
        from: `"BIAW" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Class Booking Update',
        text: `Dear ${name},

We regret to inform you that your booking for the class could not be processed due to either unavailability of seats, the cancellation of the class, or the requested seats exceeding the available seats.

We sincerely apologize for any inconvenience this may have caused and appreciate your understanding. Please feel free to contact our support team if you have any questions or require further assistance.

Thank you for your patience and support.

Kind regards,
BIAW Support Team`
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`Booking rejection email sent to ${email}`);
      return info;
    } catch (error) {
      logError('Sending booking rejection email', error);
      throw error;
    }
  }

  // Send admin booking confirmation email
  static async sendAdminBookingConfirmationEmail(email, name, classname, description, seatsPurchased, amount, location) {
    try {
      const mailOptions = {
        from: `"BIAW" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `Class Registration Confirmation for ${classname}`,
        text: `Dear ${name},

We are pleased to confirm that your class(${classname}) has been successfully booked by our team as per your request, communicated via direct contact/phone call.

If you have any questions or require further assistance, please Feel free to contact us at (360) 352-7800.

Thank you for choosing BIAW. We look forward to your participation in the class.

Best regards,
BIAW support team.`
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`Admin booking confirmation email sent to ${email}`);
      return info;
    } catch (error) {
      logError('Sending admin booking confirmation email', error);
      throw error;
    }
  }

  // Send ROII-free booking confirmation email
  static async sendROIIFreeBookingConfirmationEmail(email, name, classname, description, seatsPurchased, location) {
    try {
      const mailOptions = {
        from: `"BIAW" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `Class Registration Confirmation for ${classname}`,
        html: `
          <p>Hi ${name},</p>
          <p>You have successfully registered for the class. Here are the details:</p>
          <p>Your registration for the class <strong>${classname}</strong> has been confirmed. Below are your details:</p>
          <ul>
            <li>Number of Seats Purchased: ${seatsPurchased}</li>
            <li>Location : ${location}</li>
          </ul>
          <p>We look forward to seeing you in class!</p>
          <p>Best regards,<br>BIAW Support Team</p>
        `,
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`ROII free booking confirmation email sent to ${email}: ${info.response}`);
      return info;
    } catch (error) {
      logError('Sending ROII free booking confirmation email', error);
      throw error;
    }
  }

  // Generic sendEmail function with attachment support
  static async sendEmail(emailData) {
    try {
      const mailOptions = {
        from: `"BIAW" <${process.env.EMAIL_USER}>`,
        to: emailData.to,
        subject: emailData.subject,
        html: emailData.html,
      };

      // Add attachments if provided
      if (emailData.attachments && emailData.attachments.length > 0) {
        mailOptions.attachments = emailData.attachments.map(attachment => ({
          filename: attachment.filename,
          path: attachment.url
        }));
      }

      const info = await transporter.sendMail(mailOptions);
      console.log(`Email sent to ${emailData.to}: ${info.response}`);
      return info;
    } catch (error) {
      logError('Sending email with attachments', error);
      throw error;
    }
  }

  // Send certification email
  static async sendCertificationEmail(userEmail, certificationData) {
    try {
      // Format the date
      const formatDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
          month: '2-digit',
          day: '2-digit',
          year: 'numeric'
        });
      };

      // Helper function to format name with startcase
      const startcase = (str) => {
        if (!str) return '';
        return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
      };

      // Format address array to string
      const formatAddress = (addressArray) => {
        if (!addressArray || !Array.isArray(addressArray)) return '';
        return addressArray.join(', ');
      };

      const mailOptions = {
        from: `"BIAW" <${process.env.EMAIL_USER}>`,
        to: userEmail,
        subject: 'BIAW CESCL Certification - Your Certification Card',
        html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BIAW Certification Email</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f9f9f9;
        }
        .email-container {
            max-width: 600px;
            background: #ffffff;
            padding: 50px;
            border-radius: 5px;
            box-shadow: 0px 0px 10px rgba(0, 0, 0, 0.1);
            margin: auto;
        }
        .logo {
            text-align: left;
            margin-bottom: 20px;
        }
        .logo img {
            max-width: 70%;
        }
        .content {
            font-size: 14px;
            color: #333;
        }
        .content p {
            margin-bottom: 15px;
            line-height: 1.5;
        }
        .content a {
            color: #007bff;
            text-decoration: none;
        }
        .signature {
            margin-top: 20px;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="logo">
            <img style="width:180%;" src="https://cdn.prod.website-files.com/67ae1136d7eaa77fd9fb8d4b/67e2f24464c4b4681915afb6_image%20(8).png" alt="BIAW Logo">
        </div>
        <div class="content">
            <p>DATE: ${formatDate(certificationData.lastModified)}</p>
            <p>NAME: ${startcase(certificationData.name)}<br>COMPANY: ${startcase(certificationData.company)}<br>ADDRESS: ${formatAddress(certificationData.address)}</p>
            <p>Dear ${certificationData.name},</p>
            <p>
                Thank you for attending and completing the Building Industry Association of Washington's 
                Certified Erosion and Sediment Control (CESCL) Certification training course. Enclosed you 
                will find your CESCL Recertification card, which is approved for three years from the date 
                you took the class. If for some reason you misplace your identification card, please contact 
                <a href="mailto:education@biaw.com">education@biaw.com</a>.
            </p>
            <p>
                <strong>Please be sure to check that all of your current CESCL information is up to date</strong> and listed correctly on the 
                Department of Ecology's online CESCL database at 
                <a href="https://fortress.wa.gov/ecy/wqcescl">https://fortress.wa.gov/ecy/wqcescl</a>. 
                If anything is incorrect or you cannot find your information listed, contact Kendra Henderson at 
                <a href="mailto:khen461@ECY.WA.GOV">khen461@ECY.WA.GOV</a>.
            </p>
            <p>
                Several times a year the BIAW Education Program receives calls from Contractors around the State 
                who are looking to hire a CESCL. If you are a current BIAW Member and CESCL certified, we extend 
                this exclusive offer to you! Let us advertise your company and contact information on the BIAW website, 
                under CESCL for Hire. Email me at <a href="mailto:education@biaw.com">education@biaw.com</a> 
                for more details.
            </p>
            <p>
                If you are interested in attending additional training courses provided by BIAW, you can find more 
                information on the BIAW website at 
                <a href="http://www.biaw.com">www.biaw.com</a> or contact the BIAW Education Program at (360) 352-7800 
                or <a href="mailto:education@biaw.com">education@biaw.com</a>.
            </p>
            <p class="signature">
                Best regards,<br>
                <img style="width:20%;" src="https://cdn.prod.website-files.com/67ae1136d7eaa77fd9fb8d4b/67e31f8dc8637f9e181a700f_image%20(9).png" alt="" />
                <br>
                Andy Arrants<br>
                BIAW Certification/Education Manager
            </p>
        </div>
    </div>
</body>
</html>
        `,
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`Certification email sent to ${userEmail}: ${info.response}`);
      return info;
    } catch (error) {
      logError('Sending certification email', error);
      throw error;
    }
  }

  // Send certification email with attachments
  static async sendCertificationEmailWithAttachments(userEmail, certificationData, attachments = []) {
    try {
      // Format the date
      const formatDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
          month: '2-digit',
          day: '2-digit',
          year: 'numeric'
        });
      };

      // Helper function to format name with startcase
      const startcase = (str) => {
        if (!str) return '';
        return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
      };

      // Format address array to string
      const formatAddress = (addressArray) => {
        if (!addressArray || !Array.isArray(addressArray)) return '';
        return addressArray.join(', ');
      };

      const mailOptions = {
        from: `"BIAW" <${process.env.EMAIL_USER}>`,
        to: userEmail,
        subject: 'BIAW CESCL Certification - Your Certification Card',
        html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BIAW Certification Email</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f9f9f9;
        }
        .email-container {
            max-width: 600px;
            background: #ffffff;
            padding: 50px;
            border-radius: 5px;
            box-shadow: 0px 0px 10px rgba(0, 0, 0, 0.1);
            margin: auto;
        }
        .logo {
            text-align: left;
            margin-bottom: 20px;
        }
        .logo img {
            max-width: 70%;
        }
        .content {
            font-size: 14px;
            color: #333;
        }
        .content p {
            margin-bottom: 15px;
            line-height: 1.5;
        }
        .content a {
            color: #007bff;
            text-decoration: none;
        }
        .signature {
            margin-top: 20px;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="logo">
            <img style="width:180%;" src="https://cdn.prod.website-files.com/67ae1136d7eaa77fd9fb8d4b/67e2f24464c4b4681915afb6_image%20(8).png" alt="BIAW Logo">
        </div>
        <div class="content">
            <p>DATE: ${formatDate(certificationData.lastModified)}</p>
            <p>NAME: ${startcase(certificationData.name)}<br>COMPANY: ${startcase(certificationData.company)}<br>ADDRESS: ${formatAddress(certificationData.address)}</p>
            <p>Dear ${certificationData.name},</p>
            <p>
                Thank you for attending and completing the Building Industry Association of Washington's 
                Certified Erosion and Sediment Control (CESCL) Certification training course. Enclosed you 
                will find your CESCL Recertification card, which is approved for three years from the date 
                you took the class. If for some reason you misplace your identification card, please contact 
                <a href="mailto:education@biaw.com">education@biaw.com</a>.
            </p>
            <p>
                <strong>Please be sure to check that all of your current CESCL information is up to date</strong> and listed correctly on the 
                Department of Ecology's online CESCL database at 
                <a href="https://fortress.wa.gov/ecy/wqcescl">https://fortress.wa.gov/ecy/wqcescl</a>. 
                If anything is incorrect or you cannot find your information listed, contact Kendra Henderson at 
                <a href="mailto:khen461@ECY.WA.GOV">khen461@ECY.WA.GOV</a>.
            </p>
            <p>
                Several times a year the BIAW Education Program receives calls from Contractors around the State 
                who are looking to hire a CESCL. If you are a current BIAW Member and CESCL certified, we extend 
                this exclusive offer to you! Let us advertise your company and contact information on the BIAW website, 
                under CESCL for Hire. Email me at <a href="mailto:education@biaw.com">education@biaw.com</a> 
                for more details.
            </p>
            <p>
                If you are interested in attending additional training courses provided by BIAW, you can find more 
                information on the BIAW website at 
                <a href="http://www.biaw.com">www.biaw.com</a> or contact the BIAW Education Program at (360) 352-7800 
                or <a href="mailto:education@biaw.com">education@biaw.com</a>.
            </p>
            <p class="signature">
                Best regards,<br>
                <img style="width:20%;" src="https://cdn.prod.website-files.com/67ae1136d7eaa77fd9fb8d4b/67e31f8dc8637f9e181a700f_image%20(9).png" alt="" />
                <br>
                Andy Arrants<br>
                BIAW Certification/Education Manager
            </p>
        </div>
    </div>
</body>
</html>
        `,
      };

      // Add attachments if provided
      if (attachments && attachments.length > 0) {
        mailOptions.attachments = attachments.map(attachment => ({
          filename: attachment.filename,
          path: attachment.url
        }));
      }

      const info = await transporter.sendMail(mailOptions);
      console.log(`Certification email with attachments sent to ${userEmail}: ${info.response}`);
      return info;
    } catch (error) {
      logError('Sending certification email with attachments', error);
      throw error;
    }
  }
}

module.exports = EmailService; 