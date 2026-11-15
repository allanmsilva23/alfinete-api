const r=require('express').Router();const c=require('../controllers/favoriteController');const {requireAuth,role}=require('../middleware/auth');
r.use(requireAuth,role('cliente'));
r.get('/',c.list);r.get('/:id',c.check);r.put('/:id',c.add);r.delete('/:id',c.remove);module.exports=r;
