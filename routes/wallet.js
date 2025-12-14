// routes/wallet.js
const express = require('express');
const router = express.Router();
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const authMiddleware = require('../middleware/authMiddleware');
const { isFinanceCore, isCore } = require('../middleware/roleMiddleware');

// POST /api/wallet/send (UNCHANGED - Keeping for context)
router.post('/send', authMiddleware, async (req, res) => {
  try {
    const result = await sequelize.transaction(async (t) => {
      const { receiverId, amount } = req.body;
      const numericAmount = Number(amount);

      const sender = await User.findByPk(req.user.id, { transaction: t });
      if (!sender || sender.balance < numericAmount) {
        throw new Error('Insufficient balance or user not found.');
      }

      const receiver = await User.findOne({ where: { userId: receiverId }, transaction: t });
      if (!receiver) { throw new Error('Receiver not found.'); }
      if (sender.id === receiver.id) { throw new Error('Cannot send money to yourself.'); }

      sender.balance -= numericAmount;
      receiver.balance += numericAmount;

      await sender.save({ transaction: t });
      await receiver.save({ transaction: t });

      const newTransaction = await Transaction.create({
        senderId: sender.id, receiverId: receiver.id,
        senderName: sender.name, receiverName: receiver.name,
        senderUserId: sender.userId, receiverUserId: receiver.userId,
        amount: numericAmount
      }, { transaction: t });

      // Real-time notification logic...
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

      return { message: 'Transaction successful!' };
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error during transaction.' });
  }
});

// GET /api/wallet/history (UNCHANGED)
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const transactions = await Transaction.findAll({
      where: { [Op.or]: [{ senderId: req.user.id }, { receiverId: req.user.id }] },
      order: [['createdAt', 'DESC']]
    });
    res.json(transactions);
  } catch (error) {
    res.status(500).send('Server Error');
  }
});

// ✅ FIXED POST /api/wallet/topup
router.post('/topup', [authMiddleware, isFinanceCore], async (req, res) => {
    try {
        const result = await sequelize.transaction(async (t) => {
            const { amount } = req.body;
            const numericAmount = Number(amount);
            const user = await User.findByPk(req.user.id, { transaction: t });
            
            user.balance += numericAmount;
            await user.save({ transaction: t });

            // ✅ FIX: Create a Transaction Record for the Top Up
            // Self-transfer (Sender = Receiver) indicates a Top Up
            await Transaction.create({
                senderId: user.id,
                receiverId: user.id, // Self-transfer
                senderName: 'Shaastra Finance', // Or user.name
                receiverName: user.name,
                senderUserId: 'FINANCE_TOPUP', // Special ID to easily identify source
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
        res.status(500).json({ message: 'Server error during top-up.' });
    }
});

// POST /api/wallet/send-group (UNCHANGED)
router.post('/send-group', [authMiddleware, isCore], async (req, res) => {
  try {
    const result = await sequelize.transaction(async (t) => {
      const { recipients } = req.body;
      const sender = await User.findByPk(req.user.id, { transaction: t });
      const totalAmountToSend = recipients.reduce((acc, r) => acc + r.amount, 0);

      if (!sender || sender.balance < totalAmountToSend) {
        throw new Error('Insufficient balance.');
      }

      const io = req.app.get('io');
      const onlineUsers = req.app.get('onlineUsers');

      for (const r of recipients) {
        const receiver = await User.findOne({ where: { userId: r.receiverId }, transaction: t });
        if (!receiver) { throw new Error(`Receiver with ID ${r.receiverId} not found.`); }

        sender.balance -= r.amount;
        receiver.balance += r.amount;

        await receiver.save({ transaction: t });

        const newTxn = await Transaction.create({
          senderId: sender.id, receiverId: receiver.id,
          senderName: sender.name, receiverName: receiver.name,
          senderUserId: sender.userId, receiverUserId: receiver.userId,
          amount: r.amount
        }, { transaction: t });

        // Notification
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
      return { message: 'Group transaction successful!' };
    });
    res.json(result);
  } catch (error) {
      res.status(500).json({ message: error.message || 'Server error' });
  }
});

module.exports = router;