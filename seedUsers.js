// seedUsers.js

// Import necessary modules
require('dotenv').config(); // Load environment variables from .env
const { sequelize } = require('./config/database'); // Adjust path if needed
const User = require('./models/User'); // Adjust path if needed

// Extract data from your image (passwords are null as users register later)
const sampleUsers = [
  { Department: 'Webops', Designation: 'Core', Name: 'Durgesh', 'Roll Number': 'CE23B073', 'Contact Number': '9949049990', 'Smail ID': 'ce23b073@smail.iitm.ac.in' }

];

// Map the sample data to the User model structure
const usersToCreate = sampleUsers.map(user => ({
  name: user.Name,
  userId: user['Roll Number'], // Corresponds to Roll Number
  role: user.Designation,     // Corresponds to Designation
  smail: user['Smail ID'],
  contact: user['Contact Number'],
  department: user.Department,
  balance: 0,                // Default balance
  password: null,            // Users will register to set this
  otp: null,
  otpExpiry: null,
}));

// Function to seed the database
async function seedDatabase() {
  try {
    // Authenticate with the database
    await sequelize.authenticate();
    console.log('Database connection authenticated.');

    // Sync models (optional, ensure table exists) - careful with force: true
    await sequelize.sync(); // Use { alter: true } or { force: true } cautiously
    console.log('Database synced.');

    // Insert the users
    // ignoreDuplicates will skip inserting users if a unique constraint (userId, smail) fails
    const createdUsers = await User.bulkCreate(usersToCreate, { ignoreDuplicates: true });

    console.log(`Successfully seeded ${createdUsers.length} users.`);
    if (createdUsers.length < usersToCreate.length) {
      console.log(`Skipped ${usersToCreate.length - createdUsers.length} duplicate entries.`);
    }

  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    // Close the database connection
    await sequelize.close();
    console.log('Database connection closed.');
  }
}

// Run the seeding function
seedDatabase();