const path = require('path');
const fs = require('fs/promises');
const publicUrl = name => `${(process.env.API_PUBLIC_URL || 'https://alfinete.alwaysdata.net').replace(/\/$/, '')}/uploads/${name}`;
const validId = id => /^[1-9]\d*$/.test(String(id)) && Number.isSafeInteger(Number(id));
const reject = (res, code, mensagem) => res.status(code).json({ sucesso: false, mensagem });
// Remove apenas arquivos desta pasta; nunca tente apagar URLs externas.
async function unlinkLocal(url) {
  if (!url || typeof url !== 'string') return;
  const name = url.split('/').pop();
  if (!/^[0-9]+-[a-f0-9]{24}\.(?:jpg|png|webp)$/.test(name)) return;
  try { await fs.unlink(path.resolve(__dirname, '../uploads', name)); } catch (e) { if (e.code !== 'ENOENT') console.error('Não foi possível remover upload:', e.message); }
}
module.exports = { publicUrl, validId, reject, unlinkLocal };
