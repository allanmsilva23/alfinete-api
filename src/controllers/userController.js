const pool=require('../config/db');const {publicUrl,reject,unlinkLocal}=require('../utils');
async function getMe(req,res,next){try{
  const id=req.user.id;
  const [[p]]=await pool.execute('SELECT COUNT(*) total FROM solicitacoes_pecas WHERE usuario_id=?',[id]);
  const [[f]]=await pool.execute('SELECT COUNT(*) total FROM favoritos WHERE usuario_id=?',[id]);
  const [[a]]=await pool.execute('SELECT COUNT(*) total FROM avaliacoes WHERE usuario_id=?',[id]);
  return res.json({sucesso:true,dados:{usuario:req.user,estatisticas:{pecas:p.total,favoritos:f.total,alfinetadas:a.total}}});
}catch(e){next(e);}}
async function updateMe(req,res,next){try{
  const nome=req.body?.nome;
  if(typeof nome!=='string'||nome.trim().length<2||nome.trim().length>120)return reject(res,400,'Nome inválido.');
  await pool.execute('UPDATE usuarios SET nome=? WHERE id=?',[nome.trim(),req.user.id]);
  return res.json({sucesso:true,dados:{usuario:{...req.user,nome:nome.trim()}}});
}catch(e){next(e);}}
async function updatePhoto(req,res,next){
  try{
    if(!req.file)return reject(res,400,'Selecione uma foto JPG, PNG ou WebP.');
    const url=publicUrl(req.file.filename);
    const [[old]]=await pool.execute('SELECT foto_url FROM usuarios WHERE id=?',[req.user.id]);
    await pool.execute('UPDATE usuarios SET foto_url=? WHERE id=?',[url,req.user.id]);
    await unlinkLocal(old?.foto_url);
    return res.json({sucesso:true,dados:{usuario:{...req.user,foto_url:url}}});
  }catch(e){if(req.file) await unlinkLocal(publicUrl(req.file.filename));next(e);}
}
async function deleteMe(req,res,next){try{
  if(req.user.tipo_conta==='admin')return reject(res,403,'Administradores não podem excluir a própria conta pelo aplicativo.');
  if(req.user.tipo_conta==='brecho')return reject(res,400,'Use o painel do brechó para excluir a conta.');
  await pool.execute('UPDATE usuarios SET ativo=0,reset_token_hash=NULL WHERE id=?',[req.user.id]);
  return res.json({sucesso:true,mensagem:'Conta desativada.'});
}catch(e){next(e);}}
module.exports={getMe,updateMe,updatePhoto,deleteMe};