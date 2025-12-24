// routes/user.js - WITH RATE LIMITING
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');
const { isCore } = require('../middleware/roleMiddleware');
const { apiLimiter } = require('../middleware/rateLimiter');
const { Op } = require('sequelize');


// ============================================
// GET /api/user/profile
// ✅ RATE LIMITED: 100 requests per 15 minutes
// ============================================
router.get('/profile', [authMiddleware, apiLimiter], async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password', 'sPin', 'otp', 'otpExpiry'] }
    });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).send('Server error');
  }
});

// ============================================
// GET /api/user/by-role
// ✅ RATE LIMITED: 100 requests per 15 minutes
// ============================================
router.get('/by-role', [authMiddleware, isCore, apiLimiter], async (req, res) => {
  try {
    const { role } = req.query;
    
    if (!role) {
      return res.status(400).json({ message: 'Role query parameter is required.' });
    }
    
    const users = await User.findAll({ 
      where: { role: role },
      attributes: ['name', 'userId'] 
    });
    
    res.json(users);
  } catch (error) {
    console.error('User fetch error:', error);
    res.status(500).send('Server Error');
  }
});

// ============================================
// GET /api/user/by-role-in-my-department
// ✅ RATE LIMITED: 100 requests per 15 minutes
// ============================================
router.get('/by-role-in-my-department', [authMiddleware, isCore, apiLimiter], async (req, res) => {
  try {
    const { role } = req.query;
    
    if (!role) {
      return res.status(400).json({ message: 'Role query parameter is required.' });
    }

    const requestingUser = await User.findByPk(req.user.id, {
      attributes: ['department']
    });

    if (!requestingUser || !requestingUser.department) {
      return res.status(400).json({ message: 'User department not found.' });
    }

    const users = await User.findAll({
      where: {
        role: role,
        department: requestingUser.department
      },
      attributes: ['name', 'userId', 'id']
    });
    
    res.json(users);
  } catch (error) {
    console.error("Error fetching users by role in department:", error);
    res.status(500).send('Server Error');
  }
});

module.exports = router;