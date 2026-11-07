const pool=require('../config/db');
const {validId,reject,publicUrl,unlinkLocal}=require('../utils');
const {splitChanges,saveAddress}=require('../services/address');
const fields=['nome','descricao','endereco_curto','horario_funcionamento','faixa_preco','regras_avaliacao','telefone','link_instagram'];
const limits={nome:120,descricao:1800,endereco_curto:255,horario_funcionamento:255,faixa_preco:100,regras_avaliacao:1800,telefone:30,link_instagram:255};
async function owned(userId) {const [[b]]=await pool.execute('SELECT * FROM brecho WHERE usuario_id=? AND ativo=1 LIMIT 1',[userId]);return b;}
async function me(req,res,next){
  try{
    const b=await owned(req.user.id);
    if(!b) return reject(res,404,'Brechó não encontrado.');
    const [[addr]]=await pool.execute('SELECT logradouro,numero,bairro,cidade,estado,cep FROM enderecos_brechos WHERE brecho_id=? LIMIT 1',[b.id]);
    const [fotos]=await pool.execute('SELECT id,url,ordem FROM brecho_fotos WHERE brecho_id=? ORDER BY ordem,id',[b.id]);
    const [[stats]]=await pool.execute('SELECT COUNT(*) total,ROUND(AVG(nota),1) media FROM avaliacoes WHERE brecho_id=?',[b.id]);
    return res.json({sucesso:true,dados:{...b,...(addr||{}),fotos,nota_media:stats.media,total_avaliacoes:stats.total}});
  }catch(e){next(e);}
}
async function update(req,res,next){
  try {
    const b=await owned(req.user.id);
    if(!b) return reject(res,404,'Brechó não encontrado.');
    const changes={};
    const address=splitChanges(req.body);
    for(const field of fields) if(Object.prototype.hasOwnProperty.call(req.body||{},field)) {
      if(typeof req.body[field]!=='string' || req.body[field].length>limits[field] || (field==='nome' && req.body[field].trim().length<2)) return reject(res,400,`Valor inválido: ${field}.`);
      changes[field]=req.body[field].trim();
    }
    if(!Object.keys(changes).length&&!Object.keys(address).length) return reject(res,400,'Nenhum campo para atualizar.');
    const conn=await pool.getConnection();
    try {
      await conn.beginTransaction();
      if(Object.keys(changes).length) await conn.query(`UPDATE brecho SET ${Object.keys(changes).map(k=>`${k}=?`).join(',')} WHERE id=?`,[...Object.values(changes),b.id]);
      await saveAddress(conn,b.id,address);
      if(changes.nome) await conn.execute('UPDATE usuarios SET nome=? WHERE id=?',[changes.nome,req.user.id]);
      await conn.commit();
    }catch(e){await conn.rollback();throw e;}finally{conn.release();}
    return res.json({sucesso:true,mensagem:'Informações do brechó atualizadas.'});
  }catch(e){if(e.status)return reject(res,e.status,e.message);next(e);}
}
async function photos(req,res,next){
  const files=req.files||[];
  try{
    const b=await owned(req.user.id);
    if(!b) return reject(res,404,'Brechó não encontrado.');
    if(!files.length) return reject(res,400,'Selecione uma ou mais fotos.');
    const conn=await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('SELECT id FROM brecho WHERE id=? FOR UPDATE',[b.id]);
      const [[{total}]]=await conn.execute('SELECT COUNT(*) total FROM brecho_fotos WHERE brecho_id=?',[b.id]);
      if(Number(total)+files.length>5) {await conn.rollback();return reject(res,400,'O brechó pode ter no máximo 5 fotos.');}
      for(const [i,file] of files.entries()) await conn.execute('INSERT INTO brecho_fotos (brecho_id,url,ordem) VALUES (?,?,?)',[b.id,publicUrl(file.filename),Number(total)+i]);
      // Capa: primeira foto caso não tenha capa.
      const [[cover]]=await conn.execute('SELECT url FROM brecho_fotos WHERE brecho_id=? ORDER BY ordem,id LIMIT 1',[b.id]);
      await conn.execute('UPDATE brecho SET imagem_url=? WHERE id=?',[cover?.url||null,b.id]);
      await conn.commit();
      return res.status(201).json({sucesso:true,mensagem:'Fotos adicionadas com sucesso.'});
    }catch(e){await conn.rollback();throw e;}finally{conn.release();}
  }catch(e){next(e);}finally{ // Remoção de arquivos apenas quando não foram registrados.
    if(!res.headersSent || res.statusCode>=400) for(const f of files) await unlinkLocal(publicUrl(f.filename));
  }
}
async function deletePhoto(req,res,next){
  try{
    const b=await owned(req.user.id);
    if(!b || !validId(req.params.id)) return reject(res,404,'Foto não encontrada.');
    const [[f]]=await pool.execute('SELECT id,url FROM brecho_fotos WHERE id=? AND brecho_id=?',[req.params.id,b.id]);
    if(!f) return reject(res,404,'Foto não encontrada.');
    await pool.execute('DELETE FROM brecho_fotos WHERE id=? AND brecho_id=?',[f.id,b.id]);
    const [[cover]]=await pool.execute('SELECT url FROM brecho_fotos WHERE brecho_id=? ORDER BY ordem,id LIMIT 1',[b.id]);
    await pool.execute('UPDATE brecho SET imagem_url=? WHERE id=?',[cover?.url||null,b.id]);
    await unlinkLocal(f.url);
    return res.json({sucesso:true,mensagem:'Foto excluída.'});
  }catch(e){next(e);}
}
async function requests(req,res,next){
  try{
    const b=await owned(req.user.id);if(!b)return reject(res,404,'Brechó não encontrado.');
    const [rows]=await pool.execute('SELECT s.*,u.nome AS nome_usuario FROM solicitacoes_pecas s JOIN usuarios u ON u.id=s.usuario_id WHERE s.brecho_id=? ORDER BY s.criado_em DESC',[b.id]);
    return res.json({sucesso:true,dados:rows});
  }catch(e){next(e);}
}
async function status(req,res,next){
  try{
    const b=await owned(req.user.id);
    if(!b || !validId(req.params.id))return reject(res,404,'Solicitação não encontrada.');
    const estado=String(req.body?.status||'').toUpperCase();
    const motivo=String(req.body?.motivo_recusa||'').trim();
    if(!['PENDENTE','APROVADO','RECUSADO'].includes(estado))return reject(res,400,'Status inválido.');
    if(estado==='RECUSADO' && (motivo.length<3 || motivo.length>500))return reject(res,400,'Informe o motivo da recusa (3 a 500 caracteres).');
    const [r]=await pool.execute('UPDATE solicitacoes_pecas SET status=?,motivo_recusa=?,atualizado_em=NOW() WHERE id=? AND brecho_id=?',[estado,estado==='RECUSADO'?motivo:null,req.params.id,b.id]);
    return r.affectedRows?res.json({sucesso:true,mensagem:'Status atualizado.'}):reject(res,404,'Solicitação não encontrada.');
  }catch(e){next(e);}
}
async function reviews(req,res,next){
  try{
    const b=await owned(req.user.id);if(!b)return reject(res,404,'Brechó não encontrado.');
    const [rows]=await pool.execute('SELECT id,usuario_nome,nota,comentario,data_criacao,resposta_brecho,resposta_em FROM avaliacoes WHERE brecho_id=? ORDER BY data_criacao DESC',[b.id]);
    const [[s]]=await pool.execute('SELECT ROUND(AVG(nota),1) media,COUNT(*) total FROM avaliacoes WHERE brecho_id=?',[b.id]);
    return res.json({sucesso:true,dados:{avaliacoes:rows,nota_media:s.media,total:s.total}});
  }catch(e){next(e);}
}
async function reply(req,res,next){
  try{
    const b=await owned(req.user.id);
    if(!b || !validId(req.params.id))return reject(res,404,'Avaliação não encontrada.');
    const resposta=String(req.body?.resposta||'').trim();
    if(resposta.length<2 || resposta.length>1000)return reject(res,400,'Escreva uma resposta de 2 a 1.000 caracteres.');
    const [r]=await pool.execute('UPDATE avaliacoes SET resposta_brecho=?,resposta_em=NOW() WHERE id=? AND brecho_id=?',[resposta,req.params.id,b.id]);
    return r.affectedRows?res.json({sucesso:true,mensagem:'Resposta publicada.'}):reject(res,404,'Avaliação não encontrada.');
  }catch(e){next(e);}
}
async function deleteAccount(req,res,next){
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [[b]]=await conn.execute('SELECT id FROM brecho WHERE usuario_id=? AND ativo=1 FOR UPDATE',[req.user.id]);
    if(!b){await conn.rollback();return reject(res,404,'Brechó não encontrado.');}
    await conn.execute('UPDATE brecho SET ativo=0 WHERE id=?',[b.id]);
    await conn.execute('UPDATE usuarios SET ativo=0,reset_token_hash=NULL WHERE id=?',[req.user.id]);
    await conn.commit();
    return res.json({sucesso:true,mensagem:'Conta desativada e brechó removido do feed. Dados históricos preservados.'});
  }catch(e){await conn.rollback();next(e);}finally{conn.release();}
}
module.exports={me,update,photos,deletePhoto,requests,status,reviews,reply,deleteAccount};
