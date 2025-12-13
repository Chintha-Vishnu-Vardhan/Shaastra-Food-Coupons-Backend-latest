const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // This now imports the Sequelize model
const { sendOtpEmail } = require('../services/emailService');
const authMiddleware = require('../middleware/authMiddleware');
// ## REQUEST OTP FOR REGISTRATION ##
router.post('/request-otp', async (req, res) => {
  try {
    const { smail } = req.body;
    const user = await User.findOne({ where: { smail: smail } });
    if (!user) {
      return res.status(404).json({ message: 'This s-mail is not on the approved list.' });
    }
    if (user.password) {
      return res.status(400).json({ message: 'This account has already been registered. Please log in.' });
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpiry = Date.now() + 10 * 60 * 1000;
    await user.save();
    await sendOtpEmail(smail, otp);
    res.json({ message: 'OTP has been sent to your s-mail. Please check your inbox.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error processing OTP request.' });
  }
});

// ## VERIFY OTP AND COMPLETE REGISTRATION ##
// src/routes/auth.js
router.post('/complete-registration', async (req, res) => {
  try {
    // 1. Get sPin from the body
    const { smail, otp, password, sPin } = req.body;

    // 2. Add validation (optional but recommended)
    if (!sPin || sPin.length < 4) {
         return res.status(400).json({ message: 'S-Pin must be at least 4 digits.' });
    }

    const user = await User.findOne({ where: { smail: smail } });
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    if (user.otp !== otp || user.otpExpiry < Date.now()) {
      return res.status(400).json({ message: 'OTP is invalid or has expired.' });
    }

    // 3. Hash both password and S-Pin
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    // Use bcrypt on the S-Pin as well
    const sPinSalt = await bcrypt.genSalt(10);
    user.sPin = await bcrypt.hash(sPin, sPinSalt); 

    user.otp = null;
    user.otpExpiry = null;

    await user.save();
    res.status(201).json({ message: 'Registration successful! You can now log in.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error completing registration.' });
  }
});

// ## LOGIN A USER ##
router.post('/login', async (req, res) => {
  try {
    const { userId, password } = req.body;
    const user = await User.findOne({ where: { userId: userId } });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials.' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials.' });
    }
    const payload = { 
      user: { 
        id: user.id, 
        userId: user.userId, 
        role: user.role,
        department: user.department,
        name: user.name 
      } 
    };
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' }, (err, token) => {
      if (err) throw err;
      // Send both token and user details
      res.json({ 
        token,
        user: {
          id: user.id,
          userId: user.userId,
          role: user.role,
          department: user.department,
          name: user.name
        }
      });
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ## FORGOT PASSWORD - STEP 1 ##
router.post('/forgot-password', async (req, res) => {
  // ... (This logic remains the same, but queries are updated)
  try {
    const { smail } = req.body;
    const user = await User.findOne({ where: { smail } });
    if (user) {
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        user.otp = otp;
        user.otpExpiry = Date.now() + 10 * 60 * 1000;
        await user.save();
        await sendOtpEmail(smail, otp);
    }
    res.json({ message: 'If this email is registered, a password reset OTP has been sent.' });
  } catch (error) {
    res.status(500).json({ message: 'Error processing request.' });
  }
});

// ## FORGOT PASSWORD - STEP 2 ##
router.post('/reset-password', async (req, res) => {
    // ... (This logic remains the same, but queries are updated)
    try {
        const { smail, otp, newPassword } = req.body;
        const user = await User.findOne({ where: { smail } });

        if (!user || user.otp !== otp || user.otpExpiry < Date.now()) {
            return res.status(400).json({ message: 'OTP is invalid or has expired.' });
        }
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        user.otp = null;
        user.otpExpiry = null;
        await user.save();

        res.json({ message: 'Password has been reset successfully. You can now log in.' });
    } catch (error) {
        res.status(500).json({ message: 'Error resetting password.' });
    }
});
// Add to routes/auth.js

// Request OTP for S-Pin reset (must be logged in)
router.post('/forgot-spin-otp', authMiddleware, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpiry = Date.now() + 10 * 60 * 1000;
    await user.save();

    await sendOtpEmail(user.smail, otp, "S-Pin Reset"); // Assuming sendOtpEmail can take a subject
    res.json({ message: 'OTP has been sent to your s-mail.' });
  } catch (error) {
    res.status(500).json({ message: 'Error sending OTP.' });
  }
});

// Reset S-Pin (must be logged in)
router.post('/reset-spin', authMiddleware, async (req, res) => {
  try {
    const { otp, newSPin } = req.body;
    const user = await User.findByPk(req.user.id);

    if (!user || user.otp !== otp || user.otpExpiry < Date.now()) {
        return res.status(400).json({ message: 'OTP is invalid or has expired.' });
    }

    const sPinSalt = await bcrypt.genSalt(10);
    user.sPin = await bcrypt.hash(newSPin, sPinSalt);
    user.otp = null;
    user.otpExpiry = null;
    await user.save();

    res.json({ message: 'S-Pin has been reset successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Error resetting S-Pin.' });
  }
});

module.exports = router;