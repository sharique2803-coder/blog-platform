const express = require('express');
const router  = express.Router();
const { getAuthorProfile } = require('../controllers/authorController');
const { optionalAuth } = require('../middleware/authMiddleware');

router.get('/:id', optionalAuth, getAuthorProfile);

module.exports = router;
