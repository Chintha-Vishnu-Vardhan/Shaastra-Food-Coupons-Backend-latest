// routes/wallet.js
const express = require('express');
const router = express.Router();
const { sequelize } = require('../config/database');
const { Op } = require('sequelize');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const authMiddleware = require('../middleware/authMiddleware');
const { isFinanceCore, isCore } = require('../middleware/roleMiddleware');

// POST /api/wallet/send
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

      await Transaction.create({
        senderId: sender.id, receiverId: receiver.id,
        senderName: sender.name, receiverName: receiver.name,
        senderUserId: sender.userId, receiverUserId: receiver.userId,
        amount: numericAmount
      }, { transaction: t });

      return { message: 'Transaction successful!' };
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error during transaction.' });
  }
});

// GET /api/wallet/history
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

// POST /api/wallet/topup
router.post('/topup', [authMiddleware, isFinanceCore], async (req, res) => {
    const { amount } = req.body;
    const user = await User.findByPk(req.user.id);
    user.balance += Number(amount);
    await user.save();
    // ✅ FIXED: Changed $ to ₹ in success message
    res.json({ message: `Successfully topped up ₹${Number(amount).toFixed(2)}.`, newBalance: user.balance });
});

// POST /api/wallet/send-group
router.post('/send-group', [authMiddleware, isCore], async (req, res) => {
  try {
    const result = await sequelize.transaction(async (t) => {
      const { recipients } = req.body;
      const sender = await User.findByPk(req.user.id, { transaction: t });
      const totalAmountToSend = recipients.reduce((acc, r) => acc + r.amount, 0);

      if (!sender || sender.balance < totalAmountToSend) {
        throw new Error('Insufficient balance.');
      }

      for (const r of recipients) {
        const receiver = await User.findOne({ where: { userId: r.receiverId }, transaction: t });
        if (!receiver) { throw new Error(`Receiver with ID ${r.receiverId} not found.`); }

        sender.balance -= r.amount;
        receiver.balance += r.amount;

        await receiver.save({ transaction: t });

        await Transaction.create({
          senderId: sender.id, receiverId: receiver.id,
          senderName: sender.name, receiverName: receiver.name,
          senderUserId: sender.userId, receiverUserId: receiver.userId,
          amount: r.amount
        }, { transaction: t });
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