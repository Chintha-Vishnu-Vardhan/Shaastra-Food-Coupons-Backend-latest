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
  timestamps: true
});

module.exports = Transaction;