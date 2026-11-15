
'use strict';

const path = require('path');
const fs = require('fs/promises');

const UPLOAD_DIR = path.resolve(__dirname, '../uploads');

const publicUrl = name => {
  const base = (process.env.API_PUBLIC_URL || 'https://alfinete.alwaysdata.net').replace(/\/+$/, '');
  return `${base}/uploads/${encodeURIComponent(name)}`;
};

const validId = id => {
  if (typeof id !== 'string' && typeof id !== 'number') return false;
  const text = String(id);
  if (text.length === 0 || text.length > 16) return false;
  if (!/^[1-9][0-9]*$/.test(text)) return false;
  return Number.isSafeInteger(Number(text));
};

const reject = (res, code, mensagem) =>
  res.status(code).json({ sucesso: false, mensagem });

async function unlinkLocal(url) {
  if (typeof url !== 'string' || url.length > 2048) return;

  let pathname;

  try {
    pathname = new URL(url).pathname;
  } catch {
    return;
  }

  const name = pathname.substring(pathname.lastIndexOf('/') + 1);

  if (name.length > 80) return;
  if (!/^[0-9]{1,16}-[a-f0-9]{24}\.(?:jpg|png|webp)$/.test(name)) return;

  const filePath = path.resolve(UPLOAD_DIR, name);

  if (path.dirname(filePath) !== UPLOAD_DIR) return;

  try {
    await fs.unlink(filePath);
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.error('Não foi possível remover upload:', e.message);
    }
  }
}

module.exports = { publicUrl, validId, reject, unlinkLocal };