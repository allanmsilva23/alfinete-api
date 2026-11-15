const pool=require('../config/db');
const {validId,reject}=require('../utils');
async function getThriftStores(req,res,next){
  try{
    const [rows]=await pool.query(`SELECT b.id,b.nome,b.endereco_curto,b.descricao,b.imagem_url AS imagem,b.faixa_preco,b.preco_minimo,b.preco_maximo,
      (SELECT ROUND(AVG(a.nota),1) FROM avaliacoes a WHERE a.brecho_id=b.id) AS nota_media,
      (SELECT COUNT(*) FROM avaliacoes a WHERE a.brecho_id=b.id) AS total_avaliacoes
      FROM brecho b WHERE b.ativo=1 AND b.status_aprovacao='APROVADO' ORDER BY b.id DESC`);
    for(const b of rows){const [tags]=await pool.execute('SELECT e.nome FROM estilo e JOIN brecho_estilo be ON be.estilo_id=e.id WHERE be.brecho_id=?',[b.id]);b.estilos=tags.map(x=>x.nome);}
    return res.json({sucesso:true,dados:rows});
  }catch(e){next(e);}
}
async function getThriftStoreById(req,res,next){
  try{
    if(!validId(req.params.id))return reject(res,400,'Brechó inválido.');
    const [[b]]=await pool.execute('SELECT id,nome,descricao,endereco_curto,horario_funcionamento,faixa_preco,preco_minimo,preco_maximo,regras_avaliacao,telefone,link_instagram,imagem_url AS imagem FROM brecho WHERE id=? AND ativo=1 AND status_aprovacao=\'APROVADO\'',[req.params.id]);
    if(!b)return reject(res,404,'Brechó não disponível.');
    const [estilos]=await pool.execute('SELECT e.nome FROM estilo e JOIN brecho_estilo be ON be.estilo_id=e.id WHERE be.brecho_id=? ORDER BY e.nome',[b.id]);
    const [[addr]]=await pool.execute('SELECT logradouro,numero,bairro,cidade,estado,cep FROM enderecos_brechos WHERE brecho_id=? LIMIT 1',[b.id]);
    const [photos]=await pool.execute('SELECT id,url FROM brecho_fotos WHERE brecho_id=? ORDER BY ordem,id',[b.id]);
    const [reviews]=await pool.execute('SELECT id,usuario_nome AS nome_usuario,nota,comentario,resposta_brecho,resposta_em,data_criacao FROM avaliacoes WHERE brecho_id=? ORDER BY data_criacao DESC LIMIT 100',[b.id]);
    const [[ratings]]=await pool.execute('SELECT ROUND(AVG(nota),1) nota_media,COUNT(*) total_avaliacoes FROM avaliacoes WHERE brecho_id=?',[b.id]);
    return res.json({sucesso:true,dados:{...b,endereco_completo:addr||null,fotos:photos,avaliacoes:reviews,nota_media:ratings.nota_media,total_avaliacoes:ratings.total_avaliacoes}});
  }catch(e){next(e);}
}
module.exports={getThriftStores,getThriftStoreById};
