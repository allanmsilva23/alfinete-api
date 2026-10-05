const express = require('express');
const router = express.Router();

const requestController = require('../controllers/requestController');
const upload = require('../config/multer');

router.post(
  '/',
  upload.fields([
    {
      name: 'fotoFrente',
      maxCount: 1,
    },
    {
      name: 'fotoVerso',
      maxCount: 1,
    },
  ]),
  requestController.createRequest
);

module.exports = router;