const pool=require('../config/db');const {validId,reject}=require('../utils');
async function createReview(req,res,next){try{
  const brecho_id=req.body?.brecho_id,nota=Number(req.body?.nota),comentario=String(req.body?.comentario||'').trim();
  if(!validId(brecho_id) || !Number.isInteger(nota)||nota<1||nota>5 || comentario.length<2||comentario.length>1500) return reject(res,400,'Informe brechó, nota de 1 a 5 e comentário de 2 a 1.500 caracteres.');
  const [[b]]=await pool.execute('SELECT id FROM brecho WHERE id=? AND ativo=1 AND status_aprovacao=\'APROVADO\'',[brecho_id]);
  if(!b)return reject(res,404,'Brechó não disponível.');
  const [result]=await pool.execute('INSERT INTO avaliacoes (brecho_id,usuario_id,usuario_nome,nota,comentario) VALUES (?,?,?,?,?)',[brecho_id,req.user.id,req.user.nome,nota,comentario]);
  return res.status(201).json({sucesso:true,dados:{id:result.insertId},mensagem:'Avaliação publicada.'});
}catch(e){next(e);}}
module.exports={createReview};