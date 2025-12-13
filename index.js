const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const { sequelize } = require('./config/database');

// --- 1. IMPORT ALL MODELS ---
const User = require('./models/User');
const Transaction = require('./models/Transaction');
const Group = require('./models/Group');


// --- 2. DEFINE ASSOCIATIONS ---
User.hasMany(Transaction, { as: 'SentTransactions', foreignKey: 'senderId' });
User.hasMany(Transaction, { as: 'ReceivedTransactions', foreignKey: 'receiverId' });
Transaction.belongsTo(User, { as: 'Sender', foreignKey: 'senderId' });
Transaction.belongsTo(User, { as: 'Receiver', foreignKey: 'receiverId' });
User.hasMany(Group, { foreignKey: 'createdById' });
Group.belongsTo(User, { as: 'Creator', foreignKey: 'createdById' });
User.belongsToMany(Group, { through: 'UserGroup' });
Group.belongsToMany(User, { through: 'UserGroup' });

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const testDbConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('PostgreSQL database connected successfully! ✅');
    await sequelize.sync({ alter: true });
    console.log("All models were synchronized successfully.");
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }
};
testDbConnection();

app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());

// --- 3. RE-ENABLE ALL ROUTES ---
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const groupRoutes = require('./routes/groups');
const walletRoutes = require('./routes/wallet');
const vendorManagementRoutes = require('./routes/vendorManagement');

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/vendor-management', vendorManagementRoutes);

app.get('/', (req, res) => {
  res.send('Shaastra Wallet API is running with PostgreSQL... 🚀');
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});