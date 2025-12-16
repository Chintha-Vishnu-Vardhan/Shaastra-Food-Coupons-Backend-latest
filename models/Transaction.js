// models/Transaction.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Transaction = sequelize.define('Transaction', {
  senderName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  receiverName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  senderUserId: {
    type: DataTypes.STRING,
    allowNull: true  // Allow null for system transactions like topups
  },
  receiverUserId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  amount: {
    type: DataTypes.FLOAT,
    allowNull: false
  }
}, {
  timestamps: true,
  // ============================================
  // ✅ PERFORMANCE OPTIMIZATION: Added indexes
  // These indexes will dramatically speed up queries that filter by senderId, receiverId, or createdAt
  // Composite indexes optimize queries that use both fields together
  // ============================================
  indexes: [
    {
      name: 'idx_sender_id',
      fields: ['senderId']
    },
    {
      name: 'idx_receiver_id',
      fields: ['receiverId']
    },
    {
      name: 'idx_created_at',
      fields: ['createdAt']
    },
    {
      name: 'idx_sender_created',
      fields: ['senderId', 'createdAt']
    },
    {
      name: 'idx_receiver_created',
      fields: ['receiverId', 'createdAt']
    }
  ]
});

module.exports = Transaction;
