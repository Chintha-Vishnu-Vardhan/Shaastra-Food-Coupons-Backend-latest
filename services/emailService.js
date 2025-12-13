const nodemailer = require('nodemailer');

// Create a "transporter" - an object that can send email
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendOtpEmail = async (to, otp) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: to,
    subject: 'Your Shaastra Wallet Verification Code',
    text: `Your OTP for registration is: ${otp}. It is valid for 10 minutes.`,
    html: `<b>Your OTP for registration is: ${otp}</b><p>It is valid for 10 minutes.</p>`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('OTP email sent successfully to', to);
  } catch (error) {
    console.error('Error sending OTP email:', error);
    throw new Error('Could not send OTP email.');
  }
};

module.exports = { sendOtpEmail };