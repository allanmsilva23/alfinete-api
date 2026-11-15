const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const deny = (res, status, mensagem) => res.status(status).json({ sucesso: false, mensagem });

async function requireAuth(req, res, next) {
  try {
    const match = /^Bearer (.+)$/i.exec(req.headers.authorization || '');
    if (!match) return deny(res, 401, 'Faça login para continuar.');
    const claims = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ['HS256'], issuer: 'alfinete-api', audience: 'alfinete-app' });
    const [rows] = await pool.execute('SELECT id, nome, email, tipo, tipo_conta, foto_url, status_aprovacao FROM usuarios WHERE id = ? AND ativo = 1', [claims.sub]);
    if (!rows.length) return deny(res, 401, 'Sessão inválida. Entre novamente.');
    const user = rows[0];
    if (user.tipo_conta === 'brecho' && user.status_aprovacao !== 'APROVADO') return deny(res, 403, 'Seu brechó ainda não foi aprovado pelo administrador.');
    req.user = user;
    next();
  } catch (e) {
    if (['TokenExpiredError', 'JsonWebTokenError', 'NotBeforeError'].includes(e.name)) return deny(res, 401, 'Sessão expirada. Entre novamente.');
    next(e);
  }
}
function role(...roles) { return (req, res, next) => roles.includes(req.user?.tipo_conta) ? next() : deny(res, 403, 'Você não tem permissão para essa ação.'); }
module.exports = { requireAuth, role };
