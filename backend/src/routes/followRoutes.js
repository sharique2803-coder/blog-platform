const express = require('express');
const router  = express.Router();
const { toggleFollow, getFollowers, getFollowing, getFollowStatus } = require('../controllers/followController');
const { protect, optionalAuth } = require('../middleware/authMiddleware');

router.put('/:userId',            protect, toggleFollow);
router.get('/:userId/status',     optionalAuth, getFollowStatus);
router.get('/:userId/followers',  getFollowers);
router.get('/:userId/following',  getFollowing);

module.exports = router;
