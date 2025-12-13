require('dotenv').config();
const jwt = require('jsonwebtoken');
const payload = { user: { id: 1, userId: 'CE23B005', role: 'Core' } };
const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
console.log(token);
