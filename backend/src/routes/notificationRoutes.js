const express = require('express');
const router  = express.Router();
const { getNotifications, markAllRead, markOneRead, clearAll } = require('../controllers/notificationController');
const { protect } = require('../middleware/authMiddleware');

router.get('/',            protect, getNotifications);
router.put('/read',        protect, markAllRead);
router.put('/:id/read',    protect, markOneRead);
router.delete('/',         protect, clearAll);

module.exports = router;
