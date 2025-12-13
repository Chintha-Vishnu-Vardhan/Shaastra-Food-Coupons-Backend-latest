const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const User = require('../models/User');
const Group = require('../models/Group');
const authMiddleware = require('../middleware/authMiddleware');
const { isCore } = require('../middleware/roleMiddleware');

router.use(authMiddleware, isCore);

router.get('/', async (req, res) => {
  try {
    const groups = await Group.findAll({ 
      where: { createdById: req.user.id },
      attributes: ['id', 'name'] 
    });
    res.json(groups);
  } catch (error) { res.status(500).send('Server Error'); }
});

router.get('/:id', async (req, res) => {
    try {
      // Sequelize's 'populate' is called 'include'
      const group = await Group.findByPk(req.params.id, {
        include: [{
          model: User,
          attributes: ['name', 'userId']
        }]
      });
      // Security check: ensure the user requesting the group is the one who created it
      if (!group || group.createdById !== req.user.id) {
        return res.status(404).json({ message: 'Group not found.' });
      }
      res.json(group);
    } catch (error) { res.status(500).send('Server Error'); }
});

router.post('/', async (req, res) => {
  const { name, memberUserIds } = req.body;
  try {
    const users = await User.findAll({ where: { userId: { [Op.in]: memberUserIds } } });
    if (users.length !== memberUserIds.length) {
        return res.status(400).json({ message: 'One or more user IDs are invalid.' });
    }
    const newGroup = await Group.create({ name, createdById: req.user.id });
    await newGroup.setUsers(users); // Sequelize's way to set many-to-many relationships
    res.status(201).json(newGroup);
  } catch (error) { res.status(500).send('Server Error'); }
});

module.exports = router;