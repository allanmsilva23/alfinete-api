const express = require('express');
const router = express.Router();
const thriftController = require('../controllers/thriftController');

// Configurar a rota GET /brechos/filtros
router.get('/filtros', thriftController.getThriftStores);

module.exports = router;