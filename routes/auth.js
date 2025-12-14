const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendOtpEmail } = require('../services/emailService');
const authMiddleware = require('../middleware/authMiddleware');
const { authLimiter, strictLimiter } = require('../middleware/rateLimiter');

// ============================================
// REQUEST OTP FOR REGISTRATION
// ✅ RATE LIMITED: 3 requests per hour per email
// ============================================
router.post('/request-otp', strictLimiter, async (req, res) => {
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
    console.error('OTP Request Error:', error);
    res.status(500).json({ message: 'Error processing OTP request.' });
  }
});

// ============================================
// VERIFY OTP AND COMPLETE REGISTRATION
// ✅ RATE LIMITED: 5 attempts per 15 minutes
// ============================================
router.post('/complete-registration', authLimiter, async (req, res) => {
  try {
    const { smail, otp, password, sPin } = req.body;

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

    // Hash both password and S-Pin
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    const sPinSalt = await bcrypt.genSalt(10);
    user.sPin = await bcrypt.hash(sPin, sPinSalt); 

    user.otp = null;
    user.otpExpiry = null;

    await user.save();
    res.status(201).json({ message: 'Registration successful! You can now log in.' });
  } catch (error) {
    console.error('Registration Error:', error);
    res.status(500).json({ message: 'Error completing registration.' });
  }
});

// ============================================
// LOGIN A USER
// ✅ RATE LIMITED: 5 attempts per 15 minutes
// ============================================
router.post('/login', authLimiter, async (req, res) => {
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
    console.error('Login Error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ============================================
// FORGOT PASSWORD - STEP 1
// ✅ RATE LIMITED: 3 requests per hour per email
// ============================================
router.post('/forgot-password', strictLimiter, async (req, res) => {
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
    console.error('Forgot Password Error:', error);
    res.status(500).json({ message: 'Error processing request.' });
  }
});

// ============================================
// FORGOT PASSWORD - STEP 2
// ✅ RATE LIMITED: 5 attempts per 15 minutes
// ============================================
router.post('/reset-password', authLimiter, async (req, res) => {
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
    console.error('Reset Password Error:', error);
    res.status(500).json({ message: 'Error resetting password.' });
  }
});

// ============================================
// REQUEST OTP FOR S-PIN RESET
// ✅ RATE LIMITED: 3 requests per hour
// ============================================
router.post('/forgot-spin-otp', [authMiddleware, strictLimiter], async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpiry = Date.now() + 10 * 60 * 1000;
    await user.save();

    await sendOtpEmail(user.smail, otp, "S-Pin Reset");
    res.json({ message: 'OTP has been sent to your s-mail.' });
  } catch (error) {
    console.error('S-Pin OTP Error:', error);
    res.status(500).json({ message: 'Error sending OTP.' });
  }
});

// ============================================
// RESET S-PIN
// ✅ RATE LIMITED: 5 attempts per 15 minutes
// ============================================
router.post('/reset-spin', [authMiddleware, authLimiter], async (req, res) => {
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
    console.error('Reset S-Pin Error:', error);
    res.status(500).json({ message: 'Error resetting S-Pin.' });
  }
});

module.exports = router;