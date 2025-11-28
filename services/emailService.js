const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

async function sendEmail(to, subject, text, html = null) {
  const mailOptions = {
    from: `BIAW <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text,
  };
  if (html) mailOptions.html = html;
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.response);
  } catch (error) {
    console.error('Error sending email:', error);
  }
}

module.exports = {
  sendEmail,
  transporter,
}; 