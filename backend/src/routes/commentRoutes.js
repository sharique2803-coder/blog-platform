const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/commentController');
const { protect } = require('../middleware/authMiddleware');

router.get('/:postId',        ctrl.getComments);
router.post('/:postId',       protect, ctrl.addComment);
router.put('/:id',            protect, ctrl.updateComment);
router.delete('/:id',         protect, ctrl.deleteComment);
router.put('/:id/like',       protect, ctrl.likeComment);
router.put('/:id/vote',       protect, ctrl.voteComment);

module.exports = router;
