const isFinanceCore = async (req, res, next) => {
  // This middleware should run AFTER the authMiddleware
  const User = require('../models/User');
  try {
    const user = await User.findByPk(req.user.id);
    // Check for both separate fields (department='Finance' and role='Core') 
    // and the legacy combined role ('Finance Core')
    if (user && ((user.department === 'Finance' && user.role === 'Core') || user.role === 'Finance Core')) {
      next(); // User is a Finance Core
    } else {
      res.status(403).json({ message: 'Forbidden: Access is restricted to Finance Core members.' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error checking user role.' });
  }
};

const isCore = async (req, res, next) => {
  const User = require('../models/User');
  try {
    const user = await User.findByPk(req.user.id);
    // Check for both 'Core' role and 'Finance Core' role
    if (user && (user.role === 'Core' || user.role === 'Finance Core')) {
      next(); // User is any department's Core
    } else {
      res.status(403).json({ message: 'Forbidden: Access is restricted to Core members.' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error checking user role.' });
  }
};

// Make sure to export the new function
module.exports = { isFinanceCore, isCore };