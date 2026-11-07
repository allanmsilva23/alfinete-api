const router = require('express').Router();
const thrift = require('../controllers/thriftController');
const { listOnMap } = require('../controllers/mapController');

router.get('/mapa', listOnMap);
router.get('/filtros', thrift.getThriftStores);
router.get('/:id', thrift.getThriftStoreById);

module.exports = router;
