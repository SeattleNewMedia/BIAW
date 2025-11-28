const nodemailer = require('nodemailer');
require('dotenv').config();

const sendEmail = async (recipientEmail, subject, body) => {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      host :"smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    const mailOptions = {
      from:{
        name  : "BIAW",
        address : process.env.EMAIL_USER
      } ,
      to: recipientEmail,
      subject: subject,
      text: body,
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending email:', error);
  }
};

module.exports = sendEmail;


// const nodemailer = require('nodemailer');
// require('dotenv').config();

// const sendEmail = async (recipientEmail, subject, body) => {
//   try {
//     const transporter = nodemailer.createTransport({
//       host: "smtp.office365.com",
//       port: 587,
//       secure: false, // Use TLS
//       auth: {
//         user: "abinjoseph12303@outlook.com",
//         pass: "iwglqodplgtaznfj", // App-specific password if 2FA is enabled
//       },
//       // For production, consider removing the tls option or set rejectUnauthorized: true
//       // tls: { rejectUnauthorized: false },
//     });

//     const mailOptions = {
//       from: `"BIAW" <${process.env.EMAIL_USER}>`,
//       to: recipientEmail,
//       subject: subject,
//       text: body,
//     };

//     const info = await transporter.sendMail(mailOptions);
//     console.log("Email sent successfully:", info.response);
//   } catch (error) {
//     console.error("❌ Error sending email:", error.message || error);
//   }
// };

// module.exports = sendEmail;