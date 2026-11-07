const r=require('express').Router();const c=require('../controllers/reviewController');const {requireAuth,role}=require('../middleware/auth');
r.post('/',requireAuth,role('cliente'),c.createReview);module.exports=r;
