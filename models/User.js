const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database'); // Import from the correct central file

const User = sequelize.define('User', {
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  userId: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  password: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // --- ADD THIS ---
  sPin: {
    type: DataTypes.STRING,
    allowNull: true // Default to null for users who haven't set one
  },
// --- END ADDITION ---
  role: {
    type: DataTypes.ENUM('Core', 'Head', 'Coordinator', 'Volunteer', 'Vendor'),
    allowNull: false
  },
  balance: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  smail: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: true
  },
  contact: {
    type: DataTypes.STRING,
    allowNull: true
  },
  department: {
    type: DataTypes.STRING,
    allowNull: true
  },
  otp: {
    type: DataTypes.STRING,
    allowNull: true
  },
  otpExpiry: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  timestamps: true
});

module.exports = User;