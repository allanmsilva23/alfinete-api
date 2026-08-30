const express = require('express');
const app = express();
const port = process.env.PORT || 8080;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('API do Alfinete rodando com sucesso!');
});

app.listen(port, () => {
  console.log(`Servidor iniciado na porta ${port}`);
});