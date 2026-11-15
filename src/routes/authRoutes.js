const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const c = require('../controllers/authController');
const passwordReset = require('../controllers/passwordResetController');
const { requireAuth } = require('../middleware/auth');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { sucesso: false, mensagem: 'Muitas tentativas. Tente novamente mais tarde.' },
});
const otpSendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { sucesso: false, mensagem: 'Muitas solicitações de código. Tente novamente mais tarde.' },
});
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { sucesso: false, mensagem: 'Muitas tentativas. Tente novamente mais tarde.' },
});

router.post('/register', limiter, c.register);
router.post('/login', limiter, c.login);
router.post('/google', limiter, c.google);

router.post('/forgot-password', otpSendLimiter, passwordReset.requestOtp);
router.post('/verify-reset-otp', otpVerifyLimiter, passwordReset.verifyOtp);
router.post('/reset-password', otpVerifyLimiter, passwordReset.resetPassword);
router.get('/me', requireAuth, c.me);

module.exports = router;
