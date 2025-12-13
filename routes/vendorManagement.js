// routes/vendorManagement.js
const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const authMiddleware = require('../middleware/authMiddleware');
const { isFinanceCore } = require('../middleware/roleMiddleware');

// Apply both middleware to all routes
router.use(authMiddleware, isFinanceCore);

/**
 * GET /api/vendor-management/user/:userId/transactions
 * Fetch all transactions for a specific user by their userId (roll number)
 */
router.get('/user/:userId/transactions', async (req, res) => {
  try {
    const { userId } = req.params;

    // First, find the user
    const user = await User.findOne({ 
      where: { userId: userId.toUpperCase() },
      attributes: ['id', 'name', 'userId', 'contact', 'smail', 'role', 'department', 'balance']
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Fetch all transactions involving this user
    const transactions = await Transaction.findAll({
      where: {
        [Op.or]: [
          { senderId: user.id },
          { receiverId: user.id }
        ]
      },
      order: [['createdAt', 'DESC']]
    });

    res.json({
      user: user,
      transactions: transactions
    });

  } catch (error) {
    console.error('Error fetching user transactions:', error);
    res.status(500).json({ message: 'Server error while fetching transactions.' });
  }
});

/**
 * GET /api/vendor-management/user/:userId/statement
 * Generate detailed statement with date-wise summary
 */
router.get('/user/:userId/statement', async (req, res) => {
  try {
    const { userId } = req.params;

    // Find the user
    const user = await User.findOne({ 
      where: { userId: userId.toUpperCase() },
      attributes: ['id', 'name', 'userId', 'contact', 'smail', 'role', 'department', 'balance']
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Fetch all transactions
    const transactions = await Transaction.findAll({
      where: {
        [Op.or]: [
          { senderId: user.id },
          { receiverId: user.id }
        ]
      },
      order: [['createdAt', 'ASC']] // Chronological order for statement
    });

    // Calculate totals
    let totalReceived = 0;
    let totalSent = 0;

    // Date-wise summary object
    const dateSummary = {};

    transactions.forEach(tx => {
      const txDate = new Date(tx.createdAt).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });

      // Initialize date entry if not exists
      if (!dateSummary[txDate]) {
        dateSummary[txDate] = {
          received: 0,
          sent: 0,
          net: 0
        };
      }

      // Check if user is sender or receiver
      const isSender = tx.senderUserId === user.userId;
      const isTopUp = tx.senderUserId === tx.receiverUserId;

      if (isSender && !isTopUp) {
        // User sent money
        totalSent += tx.amount;
        dateSummary[txDate].sent += tx.amount;
      } else {
        // User received money (including top-ups)
        totalReceived += tx.amount;
        dateSummary[txDate].received += tx.amount;
      }

      // Update net for the date
      dateSummary[txDate].net = dateSummary[txDate].received - dateSummary[txDate].sent;
    });

    const netAmount = totalReceived - totalSent;

    // Convert dateSummary object to array for easier frontend use
    const dateSummaryArray = Object.entries(dateSummary).map(([date, summary]) => ({
      date,
      ...summary
    }));

    res.json({
      user: user,
      summary: {
        totalReceived,
        totalSent,
        netAmount,
        currentBalance: user.balance,
        transactionCount: transactions.length
      },
      dateSummary: dateSummaryArray,
      transactions: transactions
    });

  } catch (error) {
    console.error('Error generating statement:', error);
    res.status(500).json({ message: 'Server error while generating statement.' });
  }
});

/**
 * GET /api/vendor-management/vendors
 * Get list of all vendors (users with Volunteer or Coordinator role)
 * Useful for quick vendor lookup
 */
router.get('/vendors', async (req, res) => {
  try {
    const vendors = await User.findAll({
      where: {
        role: {
          [Op.in]: ['Volunteer', 'Coordinator']
        }
      },
      attributes: ['id', 'name', 'userId', 'role', 'department', 'contact'],
      order: [['name', 'ASC']]
    });

    res.json(vendors);
  } catch (error) {
    console.error('Error fetching vendors:', error);
    res.status(500).json({ message: 'Server error while fetching vendors.' });
  }
});

module.exports = router;