const multer = require('multer');
const path = require('path');

// Configura onde e com que nome os arquivos serão salvos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // Salva na pasta raiz 'uploads'
  },
  filename: function (req, file, cb) {
    // Cria um nome único usando a data atual e a extensão original
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });
module.exports = upload;