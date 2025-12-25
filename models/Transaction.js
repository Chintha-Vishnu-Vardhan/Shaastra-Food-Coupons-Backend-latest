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
    allowNull: true
  },
  receiverUserId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  amount: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  // ============================================
  // ✅ NEW FIELDS FOR ADMIN RESET FEATURE
  // ============================================
  type: {
    type: DataTypes.ENUM('TRANSFER', 'TOPUP', 'ADMIN_RESET'),
    defaultValue: 'TRANSFER',
    allowNull: false
  },
  metadata: {
    type: DataTypes.JSONB, // PostgreSQL JSON field
    allowNull: true,
    comment: 'Stores additional info like reset reason, admin details, etc.'
  }
  // ============================================
}, {
  timestamps: true,
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