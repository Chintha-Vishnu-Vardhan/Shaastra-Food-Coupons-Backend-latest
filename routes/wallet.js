// routes/wallet.js - WITH S-PIN VERIFICATION + RATE LIMITING + PERFORMANCE OPTIMIZATIONS + PAGINATION
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const authMiddleware = require('../middleware/authMiddleware');
const { isFinanceCore, isCore } = require('../middleware/roleMiddleware');
const { transactionLimiter, apiLimiter } = require('../middleware/rateLimiter');

// ============================================
// HELPER FUNCTION: Verify S-PIN
// ============================================
async function verifySPin(userId, sPin) {
  const user = await User.findByPk(userId);
  
  if (!user) {
    throw new Error('User not found.');
  }
  
  if (!user.sPin) {
    throw new Error('S-Pin not set. Please set up your S-Pin first.');
  }
  
  const isPinValid = await bcrypt.compare(sPin, user.sPin);
  
  if (!isPinValid) {
    throw new Error('Invalid S-Pin. Transaction cancelled.');
  }
  
  return user;
}

// ============================================
// POST /api/wallet/send - SEND MONEY
// ✅ RATE LIMITED: 10 transactions per minute
// ============================================
router.post('/send', [authMiddleware, transactionLimiter], async (req, res) => {
  try {
    const { receiverId, amount, sPin } = req.body;
    
    // Validate S-PIN
    if (!sPin) {
      return res.status(400).json({ message: 'S-Pin is required for transactions.' });
    }
    
    const numericAmount = Number(amount);
    
    // Verify S-PIN before proceeding
    try {
      await verifySPin(req.user.id, sPin);
    } catch (pinError) {
      return res.status(401).json({ message: pinError.message });
    }
    
    // Proceed with transaction
    const result = await sequelize.transaction(async (t) => {
      const sender = await User.findByPk(req.user.id, { transaction: t });
      
      if (!sender || sender.balance < numericAmount) {
        throw new Error('Insufficient balance or user not found.');
      }

      const receiver = await User.findOne({ 
        where: { userId: receiverId.toUpperCase() }, 
        transaction: t 
      });
      
      if (!receiver) { 
        throw new Error('Receiver not found.'); 
      }
      
      if (sender.id === receiver.id) { 
        throw new Error('Cannot send money to yourself.'); 
      }

      sender.balance -= numericAmount;
      receiver.balance += numericAmount;

      await sender.save({ transaction: t });
      await receiver.save({ transaction: t });

      const newTransaction = await Transaction.create({
        senderId: sender.id, 
        receiverId: receiver.id,
        senderName: sender.name, 
        receiverName: receiver.name,
        senderUserId: sender.userId, 
        receiverUserId: receiver.userId,
        amount: numericAmount
      }, { transaction: t });

      // Real-time notification
      const io = req.app.get('io');
      const onlineUsers = req.app.get('onlineUsers');
      const receiverSocketId = onlineUsers.get(receiver.userId);
      
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("transaction_received", {
           id: newTransaction.id,
           amount: numericAmount,
           senderName: sender.name,
           createdAt: new Date(),
           type: 'credit'
        });
      }

      return { 
        message: 'Transaction successful!',
        transaction: newTransaction,
        newBalance: sender.balance
      };
    });
    
    res.json(result);
    
  } catch (error) {
    console.error('Transaction error:', error);
    res.status(500).json({ message: error.message || 'Server error during transaction.' });
  }
});

// ============================================
// GET /api/wallet/history
// ✅ RATE LIMITED: 100 requests per 15 minutes
// ✅ UX IMPROVEMENT: Added pagination and search/filter
// ============================================
router.get('/history', [authMiddleware, apiLimiter], async (req, res) => {
  try {
    // ============================================
    // ✅ NEW: Pagination parameters
    // ============================================
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    // ============================================
    // ✅ NEW: Search and filter parameters
    // ============================================
    const searchQuery = req.query.search || '';
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const txType = req.query.type; // 'sent', 'received', 'topup'

    // Build where clause
    let whereClause = {
      [Op.or]: [
        { senderId: req.user.id }, 
        { receiverId: req.user.id }
      ]
    };

    // ============================================
    // ✅ NEW: Search by name or userId
    // ============================================
    if (searchQuery) {
      whereClause[Op.and] = [
        {
          [Op.or]: [
            { senderName: { [Op.iLike]: `%${searchQuery}%` } },
            { receiverName: { [Op.iLike]: `%${searchQuery}%` } },
            { senderUserId: { [Op.iLike]: `%${searchQuery}%` } },
            { receiverUserId: { [Op.iLike]: `%${searchQuery}%` } }
          ]
        }
      ];
    }

    // ============================================
    // ✅ NEW: Date range filter
    // ============================================
    if (startDate && endDate) {
      if (!whereClause[Op.and]) whereClause[Op.and] = [];
      whereClause[Op.and].push({
        createdAt: {
          [Op.between]: [new Date(startDate), new Date(endDate)]
        }
      });
    }

    // ============================================
    // ✅ NEW: Transaction type filter
    // ============================================
    if (txType) {
      if (txType === 'sent') {
        // Only sent transactions (exclude topups)
        whereClause.senderId = req.user.id;
        if (!whereClause[Op.and]) whereClause[Op.and] = [];
        whereClause[Op.and].push({
          [Op.not]: { senderId: { [Op.col]: 'receiverId' } }
        });
      } else if (txType === 'received') {
        // Only received transactions (exclude topups)
        whereClause.receiverId = req.user.id;
        if (!whereClause[Op.and]) whereClause[Op.and] = [];
        whereClause[Op.and].push({
          [Op.not]: { senderId: { [Op.col]: 'receiverId' } }
        });
      } else if (txType === 'topup') {
        // Only topup transactions
        whereClause.senderId = req.user.id;
        whereClause.receiverId = req.user.id;
      }
    }

    // ============================================
    // ✅ NEW: Fetch paginated results
    // ============================================
    const { count, rows } = await Transaction.findAndCountAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    res.json({
      transactions: rows,
      pagination: {
        totalPages: Math.ceil(count / limit),
        currentPage: page,
        totalTransactions: count,
        hasNextPage: page < Math.ceil(count / limit),
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error('History fetch error:', error);
    res.status(500).json({ message: 'Server error fetching history.' });
  }
});

// ============================================
// POST /api/wallet/topup - TOP UP WALLET
// ✅ RATE LIMITED: 10 transactions per minute
// ============================================
router.post('/topup', [authMiddleware, isFinanceCore, transactionLimiter], async (req, res) => {
    try {
        const { amount, sPin } = req.body;
        
        // Validate S-PIN
        if (!sPin) {
          return res.status(400).json({ message: 'S-Pin is required for top-up.' });
        }
        
        const numericAmount = Number(amount);
        
        // Verify S-PIN before proceeding
        try {
          await verifySPin(req.user.id, sPin);
        } catch (pinError) {
          return res.status(401).json({ message: pinError.message });
        }
        
        // Proceed with top-up
        const result = await sequelize.transaction(async (t) => {
            const user = await User.findByPk(req.user.id, { transaction: t });
            
            user.balance += numericAmount;
            await user.save({ transaction: t });

            // Create transaction record for top-up
            await Transaction.create({
                senderId: user.id,
                receiverId: user.id,
                senderName: 'Shaastra Finance',
                receiverName: user.name,
                senderUserId: 'FINANCE_TOPUP',
                receiverUserId: user.userId,
                amount: numericAmount
            }, { transaction: t });

            return { 
                message: `Successfully topped up ₹${numericAmount.toFixed(2)}.`, 
                newBalance: user.balance 
            };
        });
        
        res.json(result);
        
    } catch (error) {
        console.error("Topup Error:", error);
        res.status(500).json({ message: error.message || 'Server error during top-up.' });
    }
});

// ============================================
// POST /api/wallet/send-group - GROUP SEND
// ✅ RATE LIMITED: 10 transactions per minute
// ✅ PERFORMANCE OPTIMIZATION: Fixed N+1 query problem
// ============================================
router.post('/send-group', [authMiddleware, isCore, transactionLimiter], async (req, res) => {
  try {
    const { recipients, sPin } = req.body;
    
    // Validate S-PIN
    if (!sPin) {
      return res.status(400).json({ message: 'S-Pin is required for group transactions.' });
    }
    
    // Verify S-PIN before proceeding
    try {
      await verifySPin(req.user.id, sPin);
    } catch (pinError) {
      return res.status(401).json({ message: pinError.message });
    }
    
    // Proceed with group transaction
    const result = await sequelize.transaction(async (t) => {
      const sender = await User.findByPk(req.user.id, { transaction: t });
      const totalAmountToSend = recipients.reduce((acc, r) => acc + r.amount, 0);

      if (!sender || sender.balance < totalAmountToSend) {
        throw new Error('Insufficient balance for group transaction.');
      }

      // ============================================
      // ✅ PERFORMANCE OPTIMIZATION: Batch fetch all receivers in one query
      // OLD: Was fetching receivers one by one in a loop (N+1 problem)
      // NEW: Fetch all receivers at once with a single query
      // ============================================
      const receiverIds = recipients.map(r => r.receiverId.toUpperCase());
      const receivers = await User.findAll({ 
        where: { userId: { [Op.in]: receiverIds } },
        transaction: t 
      });

      // Create a map for quick lookup
      const receiverMap = new Map();
      receivers.forEach(receiver => {
        receiverMap.set(receiver.userId, receiver);
      });

      // Validate all receivers exist
      const missingReceivers = receiverIds.filter(id => !receiverMap.has(id));
      if (missingReceivers.length > 0) {
        throw new Error(`Receiver(s) not found: ${missingReceivers.join(', ')}`);
      }

      const io = req.app.get('io');
      const onlineUsers = req.app.get('onlineUsers');
      const successfulTransactions = [];
      const transactionsToCreate = [];

      // ============================================
      // ✅ PERFORMANCE OPTIMIZATION: Batch operations
      // Process all recipients and prepare bulk operations
      // ============================================
      for (const r of recipients) {
        const receiver = receiverMap.get(r.receiverId.toUpperCase());

        sender.balance -= r.amount;
        receiver.balance += r.amount;

        // Save receiver balance
        await receiver.save({ transaction: t });

        // Prepare transaction data for bulk insert
        transactionsToCreate.push({
          senderId: sender.id, 
          receiverId: receiver.id,
          senderName: sender.name, 
          receiverName: receiver.name,
          senderUserId: sender.userId, 
          receiverUserId: receiver.userId,
          amount: r.amount
        });

        successfulTransactions.push({
          to: receiver.name,
          amount: r.amount
        });
      }

      // ============================================
      // ✅ PERFORMANCE OPTIMIZATION: Bulk create transactions
      // OLD: Created transactions one by one in the loop
      // NEW: Create all transactions at once
      // ============================================
      const createdTransactions = await Transaction.bulkCreate(transactionsToCreate, { transaction: t });

      // Send real-time notifications
      createdTransactions.forEach((newTxn, index) => {
        const r = recipients[index];
        const receiver = receiverMap.get(r.receiverId.toUpperCase());
        
        const receiverSocketId = onlineUsers.get(receiver.userId);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("transaction_received", {
               id: newTxn.id,
               amount: r.amount,
               senderName: sender.name,
               createdAt: new Date(),
               type: 'credit'
            });
        }
      });

      await sender.save({ transaction: t });
      
      return { 
        message: 'Group transaction successful!',
        totalSent: totalAmountToSend,
        recipientCount: recipients.length,
        newBalance: sender.balance,
        transactions: successfulTransactions
      };
    });
    
    res.json(result);
    
  } catch (error) {
      console.error('Group transaction error:', error);
      res.status(500).json({ message: error.message || 'Server error during group transaction.' });
  }
});

// ============================================
// GET /api/wallet/history/download
// ✅ NEW: Download filtered transactions as CSV
// Only accessible by Vendors
// ============================================
router.get('/history/download', [authMiddleware, apiLimiter], async (req, res) => {
  try {
    // Check if user is a Vendor
    const user = await User.findByPk(req.user.id);
    if (user.role !== 'Vendor') {
      return res.status(403).json({ message: 'This feature is only available for Vendors.' });
    }

    // Use same filters as /history endpoint
    const searchQuery = req.query.search || '';
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const txType = req.query.type;

    // Build where clause (same as pagination endpoint)
    let whereClause = {
      [Op.or]: [
        { senderId: req.user.id }, 
        { receiverId: req.user.id }
      ]
    };

    if (searchQuery) {
      whereClause[Op.and] = [
        {
          [Op.or]: [
            { senderName: { [Op.iLike]: `%${searchQuery}%` } },
            { receiverName: { [Op.iLike]: `%${searchQuery}%` } },
            { senderUserId: { [Op.iLike]: `%${searchQuery}%` } },
            { receiverUserId: { [Op.iLike]: `%${searchQuery}%` } }
          ]
        }
      ];
    }

    if (startDate && endDate) {
      if (!whereClause[Op.and]) whereClause[Op.and] = [];
      whereClause[Op.and].push({
        createdAt: {
          [Op.between]: [new Date(startDate), new Date(endDate)]
        }
      });
    }

    if (txType) {
      if (txType === 'sent') {
        whereClause.senderId = req.user.id;
        if (!whereClause[Op.and]) whereClause[Op.and] = [];
        whereClause[Op.and].push({
          [Op.not]: { senderId: { [Op.col]: 'receiverId' } }
        });
      } else if (txType === 'received') {
        whereClause.receiverId = req.user.id;
        if (!whereClause[Op.and]) whereClause[Op.and] = [];
        whereClause[Op.and].push({
          [Op.not]: { senderId: { [Op.col]: 'receiverId' } }
        });
      } else if (txType === 'topup') {
        whereClause.senderId = req.user.id;
        whereClause.receiverId = req.user.id;
      }
    }

    // Fetch all matching transactions (no pagination for download)
    const transactions = await Transaction.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']]
    });

    // Generate CSV content
    const csvHeader = 'Date & Time,Type,Counterparty,Counterparty ID,Amount,Balance Change\n';
    
    const csvRows = transactions.map(tx => {
      const isSender = tx.senderUserId === user.userId;
      const isTopUp = tx.senderUserId === tx.receiverUserId;
      
      let type = '';
      let counterparty = '';
      let counterpartyId = '';
      let balanceChange = '';
      
      if (isTopUp) {
        type = 'Top-Up';
        counterparty = 'System';
        counterpartyId = 'SYSTEM';
        balanceChange = `+${tx.amount.toFixed(2)}`;
      } else if (isSender) {
        type = 'Sent';
        counterparty = tx.receiverName;
        counterpartyId = tx.receiverUserId;
        balanceChange = `-${tx.amount.toFixed(2)}`;
      } else {
        type = 'Received';
        counterparty = tx.senderName;
        counterpartyId = tx.senderUserId;
        balanceChange = `+${tx.amount.toFixed(2)}`;
      }
      
      const dateTime = new Date(tx.createdAt).toLocaleString('en-IN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      
      // Escape commas in names
      const escapedCounterparty = `"${counterparty.replace(/"/g, '""')}"`;
      
      return `${dateTime},${type},${escapedCounterparty},${counterpartyId},₹${tx.amount.toFixed(2)},₹${balanceChange}`;
    }).join('\n');

    const csvContent = csvHeader + csvRows;

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `Shaastra_Transactions_${user.userId}_${timestamp}.csv`;

    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', Buffer.byteLength(csvContent, 'utf8'));

    res.send(csvContent);

  } catch (error) {
    console.error('Transaction download error:', error);
    res.status(500).json({ message: 'Server error downloading transactions.' });
  }
});

module.exports = router;
