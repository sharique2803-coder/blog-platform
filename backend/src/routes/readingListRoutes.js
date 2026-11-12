const express = require('express');
const router  = express.Router();
const { toggleReadingList, markRead, getReadingList } = require('../controllers/readingListController');
const { protect } = require('../middleware/authMiddleware');

router.get('/',                 protect, getReadingList);
router.put('/:postId',          protect, toggleReadingList);
router.put('/:postId/read',     protect, markRead);

module.exports = router;
