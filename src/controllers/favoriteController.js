const pool=require('../config/db');
const {validId,reject}=require('../utils');
async function list(req,res,next){try{
  const [rows]=await pool.execute(`SELECT b.id,b.nome,b.endereco_curto,b.imagem_url AS imagem,
    (SELECT ROUND(AVG(nota),1) FROM avaliacoes WHERE brecho_id=b.id) AS nota_media,
    (SELECT COUNT(*) FROM avaliacoes WHERE brecho_id=b.id) AS total_avaliacoes
    FROM favoritos f JOIN brecho b ON b.id=f.brecho_id WHERE f.usuario_id=? AND b.ativo=1 AND b.status_aprovacao='APROVADO' ORDER BY b.id DESC`,[req.user.id]);
  for(const b of rows){const [t]=await pool.execute('SELECT e.nome FROM estilo e JOIN brecho_estilo be ON be.estilo_id=e.id WHERE be.brecho_id=?',[b.id]);b.estilos=t.map(x=>x.nome);}
  return res.json({sucesso:true,dados:rows});
}catch(e){next(e);}}
async function check(req,res,next){try{if(!validId(req.params.id))return reject(res,400,'ID inválido.');const [[r]]=await pool.execute('SELECT 1 ok FROM favoritos WHERE usuario_id=? AND brecho_id=? LIMIT 1',[req.user.id,req.params.id]);return res.json({sucesso:true,dados:{favorito:Boolean(r)}});}catch(e){next(e);}}
async function add(req,res,next){try{if(!validId(req.params.id))return reject(res,400,'ID inválido.');const [[b]]=await pool.execute('SELECT id FROM brecho WHERE id=? AND ativo=1 AND status_aprovacao=\'APROVADO\'',[req.params.id]);if(!b)return reject(res,404,'Brechó indisponível.');await pool.execute('INSERT INTO favoritos (usuario_id,brecho_id) SELECT ?,? WHERE NOT EXISTS (SELECT 1 FROM favoritos WHERE usuario_id=? AND brecho_id=?)',[req.user.id,req.params.id,req.user.id,req.params.id]);return res.json({sucesso:true,mensagem:'Adicionado aos favoritos.'});}catch(e){next(e);}}
async function remove(req,res,next){try{if(!validId(req.params.id))return reject(res,400,'ID inválido.');await pool.execute('DELETE FROM favoritos WHERE usuario_id=? AND brecho_id=?',[req.user.id,req.params.id]);return res.json({sucesso:true,mensagem:'Removido dos favoritos.'});}catch(e){next(e);}}
module.exports={list,check,add,remove};