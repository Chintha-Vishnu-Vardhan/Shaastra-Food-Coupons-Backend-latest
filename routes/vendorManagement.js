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
 * Supports date filtering via query params: ?startDate=ISOString&endDate=ISOString
 */
router.get('/user/:userId/transactions', async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query; // Get filter params

    // First, find the user
    const user = await User.findOne({ 
      where: { userId: userId.toUpperCase() },
      attributes: ['id', 'name', 'userId', 'contact', 'smail', 'role', 'department', 'balance']
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Build the Where Clause
    const whereClause = {
      [Op.or]: [
        { senderId: user.id },
        { receiverId: user.id }
      ]
    };

    // If both dates are provided, add the time filter
    if (startDate && endDate) {
      whereClause.createdAt = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    // Fetch transactions with the dynamic whereClause
    const transactions = await Transaction.findAll({
      where: whereClause,
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
 * Supports date filtering via query params
 */
router.get('/user/:userId/statement', async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query; // Get filter params

    // Find the user
    const user = await User.findOne({ 
      where: { userId: userId.toUpperCase() },
      attributes: ['id', 'name', 'userId', 'contact', 'smail', 'role', 'department', 'balance']
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Build the Where Clause
    const whereClause = {
      [Op.or]: [
        { senderId: user.id },
        { receiverId: user.id }
      ]
    };

    // If both dates are provided, add the time filter
    if (startDate && endDate) {
      whereClause.createdAt = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    // Fetch transactions
    const transactions = await Transaction.findAll({
      where: whereClause,
      order: [['createdAt', 'ASC']] // Chronological order for statement
    });

    // Calculate totals (Note: These totals will now apply ONLY to the filtered range)
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

    // Convert dateSummary object to array
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
        // Current Balance is ALWAYS the live balance, regardless of date filter
        currentBalance: user.balance, 
        // Range Balance (optional: helps you see balance specifically for this period)
        periodNetAmount: netAmount,
        transactionCount: transactions.length,
        isFiltered: !!(startDate && endDate)
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
 * (Unchanged)
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