const pool=require('../config/db');
const {validId,reject,publicUrl,unlinkLocal}=require('../utils');
async function createRequest(req,res,next){
  const files=Object.values(req.files||{}).flat();
  try{
    const b=req.body||{};
    if(!validId(b.brecho_id) || typeof b.categoria_peca!=='string'||b.categoria_peca.trim().length<2||b.categoria_peca.length>100) return reject(res,400,'Informe brechó e categoria da peça.');
    if(!req.files?.fotoFrente?.[0])return reject(res,400,'Foto da frente obrigatória.');
    const [[store]]=await pool.execute('SELECT id FROM brecho WHERE id=? AND ativo=1 AND status_aprovacao=\'APROVADO\'',[b.brecho_id]);
    if(!store)return reject(res,404,'Brechó não disponível.');
    const clean=(s,max=250)=>String(s||'').trim().slice(0,max);
    const [r]=await pool.execute(`INSERT INTO solicitacoes_pecas
      (usuario_id,brecho_id,categoria_peca,marca,tamanho,possui_manchas,possui_rasgos,descricao,foto_frente_url,foto_verso_url,status)
      VALUES (?,?,?,?,?,?,?,?,?,?,'PENDENTE')`,[
      req.user.id,b.brecho_id,clean(b.categoria_peca,100),clean(b.marca,100),clean(b.tamanho,30),b.possui_manchas==='true'?1:0,b.possui_rasgos==='true'?1:0,
      clean(b.descricao,1500),publicUrl(req.files.fotoFrente[0].filename),req.files?.fotoVerso?.[0]?publicUrl(req.files.fotoVerso[0].filename):null
    ]);
    return res.status(201).json({sucesso:true,mensagem:'Peça enviada para avaliação.',dados:{solicitacao_id:r.insertId}});
  }catch(e){next(e);}finally{if(!res.headersSent || res.statusCode>=400) for(const f of files) await unlinkLocal(publicUrl(f.filename));}
}
async function mine(req,res,next){try{
  const [rows]=await pool.execute(`SELECT s.*,b.nome AS nome_brecho,b.telefone,b.imagem_url AS imagem_brecho
  FROM solicitacoes_pecas s JOIN brecho b ON b.id=s.brecho_id WHERE s.usuario_id=? ORDER BY s.criado_em DESC`,[req.user.id]);
  return res.json({sucesso:true,dados:rows});
}catch(e){next(e);}}
module.exports={createRequest,mine};