const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { initFirebase } = require('../config/firebaseAdmin');
const { getAuth } = require('firebase-admin/auth');
const { sendEmail } = require('../services/email');
const { reject } = require('../utils');

const cleanEmail = x => String(x || '').trim().toLowerCase();
const emailOk = x => typeof x === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x) && x.length <= 190;
const senhaOk = x => typeof x === 'string' && x.length >= 8 && Buffer.byteLength(x, 'utf8') <= 72;
const roleOk = x => ['cliente','brecho'].includes(x);
const bancoRole = x => x === 'brecho' ? 'LOJISTA' : 'CLIENTE';
const publicUser = u => ({ id: u.id, nome: u.nome, email: u.email, tipo_conta: u.tipo_conta, foto_url: u.foto_url || null, status_aprovacao: u.status_aprovacao });
const signToken = u => jwt.sign({}, process.env.JWT_SECRET, { algorithm:'HS256', subject:String(u.id), issuer:'alfinete-api', audience:'alfinete-app', expiresIn:'7d' });
const success = (res,u,code=200) => res.status(code).json({ sucesso:true, dados:{ usuario:publicUser(u), token:signToken(u) } });
const pending = res => res.status(202).json({ sucesso:true, dados:{ pendente:true, mensagem:'Cadastro recebido! Aguarde a aprovação do administrador. Você receberá um e-mail quando o brechó for aprovado.' } });

async function createAccount({ nome, email, hash=null, uid=null, foto=null, tipo_conta }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const status = tipo_conta === 'brecho' ? 'PENDENTE' : 'APROVADO';
    const [user] = await conn.execute(
      'INSERT INTO usuarios (nome,email,senha_hash,firebase_uid,tipo,tipo_conta,foto_url,ativo,status_aprovacao) VALUES (?,?,?,?,?,?,?,?,?)',
      [nome,email,hash,uid,bancoRole(tipo_conta),tipo_conta,foto,1,status]
    );
    if (tipo_conta === 'brecho') {
      await conn.execute('INSERT INTO brecho (usuario_id,nome,descricao,endereco_curto,status_aprovacao,ativo) VALUES (?,?,?, ?, ?,1)', [user.insertId,nome,'','Endereço ainda não informado',status]);
    }
    await conn.commit();
    return { id:user.insertId,nome,email,tipo_conta,foto_url:foto,status_aprovacao:status };
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}
async function statusCheck(res, user) {
  if (user.tipo_conta === 'brecho' && user.status_aprovacao !== 'APROVADO') {
    return reject(res, 403, user.status_aprovacao === 'REJEITADO' ? 'Cadastro do brechó não aprovado. Entre em contato com o suporte.' : 'Seu cadastro está aguardando aprovação do administrador.');
  }
  return null;
}

async function register(req,res,next) {
  try {
    const { nome,senha,tipo_conta,aceitou_termos } = req.body || {};
    const email=cleanEmail(req.body?.email);
    if (!nome?.trim || nome.trim().length < 2 || nome.trim().length > 120 || !emailOk(email)) return reject(res,400,'Informe nome e e-mail válidos.');
    if (!roleOk(tipo_conta) || aceitou_termos !== true) return reject(res,400,'Selecione o tipo de conta e aceite os termos.');
    if (!senhaOk(senha)) return reject(res,400,'A senha deve ter de 8 a 72 bytes.');
    const hash=await bcrypt.hash(senha,12);
    const u=await createAccount({nome:nome.trim(),email,hash,tipo_conta});
    return tipo_conta === 'brecho' ? pending(res) : success(res,u,201);
  } catch(e) { if (e.code==='ER_DUP_ENTRY') return reject(res,409,'E-mail já cadastrado.'); next(e); }
}
async function login(req,res,next) {
  try {
    const email=cleanEmail(req.body?.email), senha=req.body?.senha;
    if (!emailOk(email) || typeof senha !== 'string') return reject(res,400,'E-mail ou senha inválidos.');
    const [[u]]=await pool.execute('SELECT id,nome,email,senha_hash,tipo_conta,foto_url,status_aprovacao FROM usuarios WHERE email=? AND ativo=1 LIMIT 1',[email]);
    const dummy='$2b$12$X0jQZgFL.xTHp4OsB3J5w.j4Mt0j4AM5EfGC1TUPXMdzb.nUQybGS';
    const valid=await bcrypt.compare(senha,u?.senha_hash||dummy);
    if (!u?.senha_hash || !valid) return reject(res,401,'E-mail ou senha incorretos.');
    if (u.tipo_conta==='brecho' && u.status_aprovacao!=='APROVADO') return reject(res,403,u.status_aprovacao==='REJEITADO'?'Cadastro não aprovado. Contate o suporte.':'Seu brechó ainda aguarda aprovação do administrador.');
    return success(res,u);
  } catch(e) { next(e); }
}
async function google(req,res,next) {
  try {
    const {idToken,modo,tipo_conta,aceitou_termos}=req.body||{};
    if (typeof idToken!=='string' || !idToken || idToken.length>10000 || !['cadastro','login'].includes(modo)) return reject(res,400,'Dados de autenticação inválidos.');
    const decoded=await getAuth(initFirebase()).verifyIdToken(idToken,true);
    if (decoded.firebase?.sign_in_provider!=='google.com' || decoded.email_verified!==true || !emailOk(decoded.email)) return reject(res,401,'Conta Google não verificada.');
    const email=cleanEmail(decoded.email);
    const [[existing]]=await pool.execute('SELECT id,nome,email,tipo_conta,foto_url,status_aprovacao FROM usuarios WHERE firebase_uid=? AND ativo=1 LIMIT 1',[decoded.uid]);
    if (existing) {
      if (modo==='cadastro') return reject(res,409,'Conta Google já cadastrada. Use Fazer login.');
      if (existing.tipo_conta==='brecho' && existing.status_aprovacao!=='APROVADO') return reject(res,403,'O cadastro do brechó ainda aguarda aprovação do administrador.');
      return success(res,existing);
    }
    if (modo==='login') return reject(res,404,'Conta Google não cadastrada. Faça seu cadastro primeiro.');
    if (!roleOk(tipo_conta) || aceitou_termos!==true) return reject(res,400,'Selecione o tipo de conta e aceite os termos.');
    const [[same]]=await pool.execute('SELECT id FROM usuarios WHERE email=? LIMIT 1',[email]);
    if (same) return reject(res,409,'Este e-mail já está cadastrado por outro método.');
    const nome=String(decoded.name||email.split('@')[0]).slice(0,120);
    const foto=typeof decoded.picture==='string' ? decoded.picture.slice(0,1024) : null;
    const u=await createAccount({nome,email,uid:decoded.uid,foto,tipo_conta});
    return tipo_conta==='brecho'?pending(res):success(res,u,201);
  } catch(e) {
    if(e.code==='ER_DUP_ENTRY') return reject(res,409,'Conta já cadastrada.');
    if(e.code?.startsWith?.('auth/') || e.name==='FirebaseAuthError') return reject(res,401,'Não foi possível validar a conta Google.');
    next(e);
  }
}
const me=(req,res)=>res.json({sucesso:true,dados:{usuario:publicUser(req.user)}});
async function forgotPassword(req,res,next) {
  const generic={sucesso:true,mensagem:'Se a conta permitir recuperação por senha, enviaremos um e-mail.'};
  try {
    const email=cleanEmail(req.body?.email);
    if(!emailOk(email)) return reject(res,400,'E-mail inválido.');
    const [[u]]=await pool.execute('SELECT id FROM usuarios WHERE email=? AND senha_hash IS NOT NULL AND ativo=1 LIMIT 1',[email]);
    if (!u) return res.json(generic);
    const token=crypto.randomBytes(32).toString('hex');
    const hash=crypto.createHash('sha256').update(token).digest('hex');
    await pool.execute('UPDATE usuarios SET reset_token_hash=?,reset_token_expira=DATE_ADD(NOW(),INTERVAL 30 MINUTE) WHERE id=?',[hash,u.id]);
    await sendEmail({ to:email, subject:'Redefinir senha — Alfinete', text:`Abra o Alfinete e use este link nos próximos 30 minutos:\nalfineteapp://reset-password?token=${token}\nSe não solicitou, ignore.` });
    return res.json(generic);
  } catch(e) { next(e); }
}
async function resetPassword(req,res,next) {
  try {
    const { token,nova_senha }=req.body||{};
    if(typeof token!=='string' || !/^[a-f0-9]{64}$/.test(token) || !senhaOk(nova_senha)) return reject(res,400,'Token ou nova senha inválidos.');
    const hash=crypto.createHash('sha256').update(token).digest('hex');
    const [[u]]=await pool.execute('SELECT id FROM usuarios WHERE reset_token_hash=? AND reset_token_expira>NOW() AND ativo=1 LIMIT 1',[hash]);
    if(!u) return reject(res,400,'Link expirado ou inválido.');
    const senhaHash=await bcrypt.hash(nova_senha,12);
    const [result]=await pool.execute('UPDATE usuarios SET senha_hash=?,reset_token_hash=NULL,reset_token_expira=NULL WHERE id=? AND reset_token_hash=? AND reset_token_expira>NOW() AND ativo=1',[senhaHash,u.id,hash]);
    if(!result.affectedRows) return reject(res,400,'Link expirado ou utilizado.');
    return res.json({sucesso:true,mensagem:'Senha atualizada. Faça login novamente.'});
  } catch(e) { next(e); }
}
module.exports={register,login,google,me,forgotPassword,resetPassword};