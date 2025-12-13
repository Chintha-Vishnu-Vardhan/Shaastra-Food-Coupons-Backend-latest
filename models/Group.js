// models/Group.js

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Group = sequelize.define('Group', {
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  // This field was missing from your original file
  // but is required by your routes and index.js
  createdById: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Users', // 'Users' is the default table name for the User model
      key: 'id'
    }
  }
}, {
  timestamps: true
});

module.exports = Group;