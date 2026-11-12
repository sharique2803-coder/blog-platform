const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/postController');
const { protect, optionalAuth } = require('../middleware/authMiddleware');
const upload  = require('../middleware/upload');

router.get('/categories',          ctrl.getCategories);
router.get('/trending',            ctrl.getTrending);
router.get('/featured',            ctrl.getFeatured);
router.get('/explore',             ctrl.getExplore);
router.get('/user/my',             protect, ctrl.getMyPosts);
router.get('/analytics',           protect, ctrl.getAnalytics);
router.get('/',                    optionalAuth, ctrl.getPosts);
router.get('/:id',                 optionalAuth, ctrl.getPostById);
router.get('/:id/related',         ctrl.getRelated);
router.get('/:id/revisions',       protect, ctrl.getRevisions);
router.post('/upload',             protect, upload.single('image'), ctrl.uploadImage);
router.post('/',                   protect, ctrl.createPost);
router.put('/:id',                 protect, ctrl.updatePost);
router.delete('/:id',              protect, ctrl.deletePost);
router.put('/:id/like',            protect, ctrl.likePost);
router.put('/:id/react',           protect, ctrl.reactPost);
router.post('/:id/revisions/:revId/restore', protect, ctrl.restoreRevision);

module.exports = router;
