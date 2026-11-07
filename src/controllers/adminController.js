const pool=require('../config/db');
const { sendApprovalEmail } = require('../services/email');
const {validId,reject,unlinkLocal}=require('../utils');
const {splitChanges,saveAddress}=require('../services/address');
const fields=['nome','descricao','endereco_curto','horario_funcionamento','faixa_preco','regras_avaliacao','telefone','link_instagram'];
const trim = v => typeof v==='string' ? v.trim() : '';
const checks = {nome:120,descricao:1800,endereco_curto:255,horario_funcionamento:255,faixa_preco:100,regras_avaliacao:1800,telefone:30,link_instagram:255};
function changes(body) {
  const updates={};
  for (const key of fields) if (Object.prototype.hasOwnProperty.call(body||{},key)) {
    if (typeof body[key]!=='string' || body[key].length>checks[key] || (key==='nome' && trim(body[key]).length<2)) throw Object.assign(new Error(`Campo inválido: ${key}.`),{status:400});
    updates[key]=trim(body[key]);
  }
  return updates;
}
async function list(req,res,next) {
  try {
    const [rows]=await pool.query(`SELECT b.*, eb.logradouro,eb.numero,eb.bairro,eb.cidade,eb.estado,eb.cep,
      u.nome AS responsavel,u.email,u.id AS usuario_id FROM brecho b LEFT JOIN usuarios u ON u.id=b.usuario_id LEFT JOIN enderecos_brechos eb ON eb.brecho_id=b.id
      ORDER BY (b.status_aprovacao='PENDENTE') DESC,b.id DESC`);
    return res.json({sucesso:true,dados:rows});
  } catch(e){next(e);}
}
async function update(req,res,next){
  const conn=await pool.getConnection();
  try {
    if(!validId(req.params.id)) return reject(res,400,'Brechó inválido.');
    const changeset=changes(req.body),address=splitChanges(req.body);
    if(!Object.keys(changeset).length&&!Object.keys(address).length)return reject(res,400,'Informe ao menos um campo.');
    await conn.beginTransaction();
    const [[b]]=await conn.execute('SELECT id FROM brecho WHERE id=? AND ativo=1 FOR UPDATE',[req.params.id]);
    if(!b){await conn.rollback();return reject(res,404,'Brechó não encontrado.');}
    if(Object.keys(changeset).length)await conn.query(`UPDATE brecho SET ${Object.keys(changeset).map(k=>`${k}=?`).join(',')} WHERE id=?`,[...Object.values(changeset),req.params.id]);
    await saveAddress(conn,b.id,address);
    if(changeset.nome){const [[owner]]=await conn.execute('SELECT usuario_id FROM brecho WHERE id=?',[b.id]);if(owner?.usuario_id)await conn.execute('UPDATE usuarios SET nome=? WHERE id=?',[changeset.nome,owner.usuario_id]);}
    await conn.commit();
    return res.json({sucesso:true,mensagem:'Dados atualizados.'});
  } catch(e){await conn.rollback();if(e.status)return reject(res,e.status,e.message);next(e);}finally{conn.release();}
}
async function sendApproval(storeId,res) {
  const [[b]]=await pool.execute(`SELECT b.id,b.nome,b.status_aprovacao,u.email FROM brecho b JOIN usuarios u ON u.id=b.usuario_id WHERE b.id=?`,[storeId]);
  if(!b || b.status_aprovacao!=='APROVADO') return reject(res,404,'Brechó não aprovado ou sem responsável.');
  try {
    await sendApprovalEmail({
      to: b.email,
      nomeBrecho: b.nome,
    });
    await pool.execute('UPDATE brecho SET aprovacao_email_enviado_em=NOW() WHERE id=?',[storeId]);
    return res.json({sucesso:true,mensagem:'Brechó aprovado e e-mail de confirmação enviado.'});
  } catch(e) {
    console.error('Falha no e-mail de aprovação:',e.message);
    return res.status(202).json({sucesso:true,dados:{email_pendente:true,mensagem:'Brechó aprovado, mas o e-mail não pôde ser enviado. Configure o SMTP e use Reenviar e-mail.'},mensagem:'Brechó aprovado, mas o e-mail não pôde ser enviado. Configure o SMTP e use Reenviar e-mail.'});
  }
}
async function approve(req,res,next){
  const id=req.params.id;
  if(!validId(id)) return reject(res,400,'Brechó inválido.');
  const conn=await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[b]]=await conn.execute('SELECT id,usuario_id,status_aprovacao,ativo FROM brecho WHERE id=? FOR UPDATE',[id]);
    if(!b || !b.ativo || !b.usuario_id) { await conn.rollback();return reject(res,404,'Cadastro de brechó não encontrado.'); }
    await conn.execute('UPDATE brecho SET status_aprovacao=\'APROVADO\',aprovado_em=NOW() WHERE id=?',[id]);
    await conn.execute('UPDATE usuarios SET status_aprovacao=\'APROVADO\',ativo=1 WHERE id=? AND tipo_conta=\'brecho\'',[b.usuario_id]);
    await conn.commit();
    return sendApproval(id,res);
  } catch(e){await conn.rollback();next(e);} finally {conn.release();}
}
async function resend(req,res,next){try {if(!validId(req.params.id)) return reject(res,400,'Brechó inválido.');return await sendApproval(req.params.id,res);} catch(e){next(e);}}
async function remove(req,res,next){
  const id=req.params.id;
  if(!validId(id)) return reject(res,400,'Brechó inválido.');
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [[b]]=await conn.execute('SELECT id,usuario_id FROM brecho WHERE id=? FOR UPDATE',[id]);
    if(!b){await conn.rollback();return reject(res,404,'Brechó não encontrado.');}
    // Desativação lógica: conserva avaliações, solicitações e histórico.
    await conn.execute('UPDATE brecho SET ativo=0,status_aprovacao=\'REJEITADO\' WHERE id=?',[id]);
    if(b.usuario_id) await conn.execute('UPDATE usuarios SET ativo=0,status_aprovacao=\'REJEITADO\' WHERE id=?',[b.usuario_id]);
    await conn.commit();
    return res.json({sucesso:true,mensagem:'Brechó removido do catálogo; histórico preservado.'});
  }catch(e){await conn.rollback();next(e);} finally {conn.release();}
}
module.exports={list,update,approve,resend,remove};
