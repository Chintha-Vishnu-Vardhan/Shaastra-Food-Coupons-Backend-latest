const express = require('express');
const router = express.Router();
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');
const { isCore } = require('../middleware/roleMiddleware');
const { Op } = require('sequelize');

router.get('/profile', authMiddleware, async (req, res) => {
  try {
    // findByPk is Sequelize's equivalent of findById
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password'] } // Exclude password from the result
    });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
  }
});

router.get('/by-role', [authMiddleware, isCore], async (req, res) => {
  try {
    const { role } = req.query;
    if (!role) {
      return res.status(400).json({ message: 'Role query parameter is required.' });
    }
    // findAll with 'where' and 'attributes' is the Sequelize way
    const users = await User.findAll({ 
      where: { role: role },
      attributes: ['name', 'userId'] 
    });
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
});
router.get('/by-role-in-my-department', [authMiddleware, isCore], async (req, res) => {
  try {
    const { role } = req.query;
    if (!role) {
      return res.status(400).json({ message: 'Role query parameter is required.' });
    }

    // Get the logged-in user's department from req.user (added by authMiddleware)
    // We need to fetch the user again to get the department, as it's not in the JWT payload
    const requestingUser = await User.findByPk(req.user.id, {
        attributes: ['department'] // Only fetch department
    });

    if (!requestingUser || !requestingUser.department) {
        return res.status(400).json({ message: 'User department not found.' });
    }

    const users = await User.findAll({
      where: {
        role: role,
        department: requestingUser.department // Filter by the Core's department
      },
      attributes: ['name', 'userId', 'id'] // Include id if needed, keep excluding password
    });
    res.json(users);
  } catch (error) {
    console.error("Error fetching users by role in department:", error);
    res.status(500).send('Server Error');
  }
});


module.exports = router;