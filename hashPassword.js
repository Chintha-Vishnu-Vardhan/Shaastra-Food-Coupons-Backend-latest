const bcrypt = require('bcryptjs');
const password = 'password123';

bcrypt.hash(password, 10, (err, hash) => {
  if (err) throw err;
  console.log('--- Your New Password Hash ---');
  console.log(hash);
  console.log('------------------------------');
});