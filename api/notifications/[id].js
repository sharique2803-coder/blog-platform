const { initDB, dbRun } = require('../_lib/db');
const { handleCors }   = require('../_lib/cors');
const { requireAuth }  = require('../_lib/auth');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  await initDB();
  const user = await requireAuth(req, res); if (!user) return;
  const { id } = req.query;
  if (req.method === 'PUT') {
    await dbRun('UPDATE notifications SET read=1 WHERE id=? AND user_id=?', [id, user.id]);
    return res.json({ success: true });
  }
  res.status(405).json({ success: false, message: 'Method not allowed' });
};
