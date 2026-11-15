const r=require('express').Router();const {requireAuth}=require('../middleware/auth');const upload=require('../config/multer');const c=require('../controllers/userController');
r.use(requireAuth);r.get('/me',c.getMe);r.patch('/me',c.updateMe);r.post('/me/foto',upload.single('foto'),c.updatePhoto);r.delete('/me',c.deleteMe);module.exports=r;
