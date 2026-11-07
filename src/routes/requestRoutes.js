const r=require('express').Router();const c=require('../controllers/requestController');const upload=require('../config/multer');const {requireAuth,role}=require('../middleware/auth');
r.use(requireAuth,role('cliente'));
r.get('/me',c.mine);
r.post('/',upload.fields([{name:'fotoFrente',maxCount:1},{name:'fotoVerso',maxCount:1}]),c.createRequest);
module.exports=r;