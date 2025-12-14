// routes/wallet.js - WITH S-PIN VERIFICATION + RATE LIMITING
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
// ============================================
router.get('/history', [authMiddleware, apiLimiter], async (req, res) => {
  try {
    const transactions = await Transaction.findAll({
      where: { 
        [Op.or]: [
          { senderId: req.user.id }, 
          { receiverId: req.user.id }
        ] 
      },
      order: [['createdAt', 'DESC']]
    });
    res.json(transactions);
  } catch (error) {
    console.error('History fetch error:', error);
    res.status(500).send('Server Error');
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

      const io = req.app.get('io');
      const onlineUsers = req.app.get('onlineUsers');
      const successfulTransactions = [];

      for (const r of recipients) {
        const receiver = await User.findOne({ 
          where: { userId: r.receiverId.toUpperCase() }, 
          transaction: t 
        });
        
        if (!receiver) { 
          throw new Error(`Receiver with ID ${r.receiverId} not found.`); 
        }

        sender.balance -= r.amount;
        receiver.balance += r.amount;

        await receiver.save({ transaction: t });

        const newTxn = await Transaction.create({
          senderId: sender.id, 
          receiverId: receiver.id,
          senderName: sender.name, 
          receiverName: receiver.name,
          senderUserId: sender.userId, 
          receiverUserId: receiver.userId,
          amount: r.amount
        }, { transaction: t });

        successfulTransactions.push({
          to: receiver.name,
          amount: r.amount
        });

        // Real-time notification
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
      }

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

module.exports = router;