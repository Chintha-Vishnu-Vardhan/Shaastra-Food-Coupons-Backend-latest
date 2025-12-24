// routes/vendorManagement.js - WITH RATE LIMITING
const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const authMiddleware = require('../middleware/authMiddleware');
const { isFinanceCore } = require('../middleware/roleMiddleware');
const { vendorLimiter } = require('../middleware/rateLimiter');

// Apply middleware to all routes
router.use(authMiddleware, isFinanceCore, vendorLimiter);

/**
 * GET /api/vendor-management/user/:userId/transactions
 * ✅ RATE LIMITED: 20 requests per minute
 */
router.get('/user/:userId/transactions', async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    const user = await User.findOne({ 
      where: { userId: userId.toUpperCase() },
      attributes: ['id', 'name', 'userId', 'contact', 'smail', 'role', 'department', 'balance']
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const whereClause = {
      [Op.or]: [
        { senderId: user.id },
        { receiverId: user.id }
      ]
    };

    if (startDate && endDate) {
      whereClause.createdAt = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

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
 * ✅ RATE LIMITED: 20 requests per minute
 */
router.get('/user/:userId/statement', async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    const user = await User.findOne({ 
      where: { userId: userId.toUpperCase() },
      attributes: ['id', 'name', 'userId', 'contact', 'smail', 'role', 'department', 'balance']
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const whereClause = {
      [Op.or]: [
        { senderId: user.id },
        { receiverId: user.id }
      ]
    };

    if (startDate && endDate) {
      whereClause.createdAt = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    const transactions = await Transaction.findAll({
      where: whereClause,
      order: [['createdAt', 'ASC']]
    });

    let totalReceived = 0;
    let totalSent = 0;
    const dateSummary = {};

    transactions.forEach(tx => {
      const txDate = new Date(tx.createdAt).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });

      if (!dateSummary[txDate]) {
        dateSummary[txDate] = {
          received: 0,
          sent: 0,
          net: 0
        };
      }

      const isSender = tx.senderUserId === user.userId;
      const isTopUp = tx.senderUserId === tx.receiverUserId;

      if (isSender && !isTopUp) {
        totalSent += tx.amount;
        dateSummary[txDate].sent += tx.amount;
      } else {
        totalReceived += tx.amount;
        dateSummary[txDate].received += tx.amount;
      }

      dateSummary[txDate].net = dateSummary[txDate].received - dateSummary[txDate].sent;
    });

    const netAmount = totalReceived - totalSent;

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
 * ✅ RATE LIMITED: 20 requests per minute
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

/**
 * GET /api/vendor-management/user/:userId/transactions/download
 * ✅ NEW: Download transactions as CSV for a specific user
 * ✅ RATE LIMITED: 20 requests per minute
 */
router.get('/user/:userId/transactions/download', async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    // Fetch user details
    const user = await User.findOne({ 
      where: { userId: userId.toUpperCase() },
      attributes: ['id', 'name', 'userId', 'contact', 'smail', 'role', 'department', 'balance']
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Build where clause for transactions
    const whereClause = {
      [Op.or]: [
        { senderId: user.id },
        { receiverId: user.id }
      ]
    };

    if (startDate && endDate) {
      whereClause.createdAt = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    // Fetch all matching transactions
    const transactions = await Transaction.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']]
    });

    // Generate CSV content
    const csvHeader = 'Date,Time,From/To ID,From/To Name,Credit,Debit\n';

    
    const csvRows = transactions.map(tx => {
      const isSender = tx.senderUserId === user.userId;
      const isTopUp = tx.senderUserId === tx.receiverUserId;

      let fromToId = '';
      let fromToName = '';
      let credit = '';
      let debit = '';

      if (isTopUp) {
        fromToId = 'SYSTEM';
        fromToName = 'System';
        credit = tx.amount.toFixed(2);
      } else if (isSender) {
        // Debit
        fromToId = tx.receiverUserId;
        fromToName = tx.receiverName;
        debit = tx.amount.toFixed(2);
      } else {
        // Credit
        fromToId = tx.senderUserId;
        fromToName = tx.senderName;
        credit = tx.amount.toFixed(2);
      }

      const dateObj = new Date(tx.createdAt);

      const date = dateObj.toLocaleDateString('en-IN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });

      const time = dateObj.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      // Escape names for CSV safety
      const escapedName = `"${fromToName.replace(/"/g, '""')}"`;

      return `${date},${time},${fromToId},${escapedName},${credit},${debit}`;
    }).join('\n');


    const csvContent = csvHeader + csvRows;

    // Generate filename with user ID, date range, and timestamp
    const timestamp = new Date().toISOString().split('T')[0];
    const dateRangeSuffix = (startDate && endDate) 
      ? `_${new Date(startDate).toISOString().split('T')[0]}_to_${new Date(endDate).toISOString().split('T')[0]}`
      : '';
    const filename = `Shaastra_Transactions_${user.userId}${dateRangeSuffix}_${timestamp}.csv`;

    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', Buffer.byteLength(csvContent, 'utf8'));

    res.send(csvContent);

  } catch (error) {
    console.error('Error downloading transactions:', error);
    res.status(500).json({ message: 'Server error while downloading transactions.' });
  }
});

module.exports = router;