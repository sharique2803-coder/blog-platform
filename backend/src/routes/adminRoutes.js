const express = require('express');
const router  = express.Router();
const { adminOnly, getStats, getUsers, banUser, setRole, getPosts, deletePost, toggleFeature, getReports, resolveReport } = require('../controllers/adminController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect, adminOnly);

router.get('/stats',              getStats);
router.get('/users',              getUsers);
router.put('/users/:id/ban',      banUser);
router.put('/users/:id/role',     setRole);
router.get('/posts',              getPosts);
router.delete('/posts/:id',       deletePost);
router.put('/posts/:id/feature',  toggleFeature);
router.get('/reports',            getReports);
router.put('/reports/:id/resolve',resolveReport);

module.exports = router;
