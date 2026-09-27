const express = require('express');
const router = express.Router();
const thriftController = require('../controllers/thriftController');

// Configurar a rota GET /brechos/filtros
router.get('/filtros', thriftController.getThriftStores);

// Rota de listagem geral (Feed)
router.get('/filtros', thriftController.getThriftStores);

// Cumprindo o checklist: Configurar a rota GET /brechos/:id
router.get('/:id', thriftController.getThriftStoreById);

module.exports = router;