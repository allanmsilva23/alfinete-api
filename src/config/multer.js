const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const directory = path.resolve(__dirname, '../../uploads');
fs.mkdirSync(directory, { recursive: true });
const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, directory),
  filename: (_, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${ext[file.mimetype]}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 6 * 1024 * 1024, files: 5 },
  fileFilter: (_, file, cb) => ext[file.mimetype] ? cb(null, true) : cb(new Error('Envie apenas imagens JPG, PNG ou WebP.')),
});
module.exports = upload;