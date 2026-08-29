# 📍 Projeto Alfinete - Backend (API REST)

O **Alfinete** é um Guia de Descoberta que conecta usuários a brechós incentivando a economia circular. Este repositório contém o código-fonte da API RESTful responsável por gerenciar a lógica de negócios, integração com banco de dados e validação de autenticação.

## 🛠️ Tecnologias e Bibliotecas Utilizadas

*   **Node.js & Express:** Base e framework principal para a construção das rotas da API HTTP.
*   **MySQL2:** Driver de conexão com o banco de dados relacional MySQL (hospedado na Alwaysdata).
*   **Firebase Admin SDK:** Utilizado para interceptar e validar de forma segura os tokens OAuth gerados pelo login social do Google no aplicativo.
*   **Axios:** Cliente HTTP utilizado no servidor para consumir as APIs.
*   **Segurança & Observabilidade:** 
    *   `helmet`: Adiciona headers HTTP de segurança.
    *   `morgan`, `winston` e `dd-trace`: Sistemas de log estruturado, monitoramento de requisições e integração de observabilidade (Datadog).
    *   `dotenv`: Gerenciamento seguro de variáveis de ambiente.

## 🚀 Como rodar o projeto localmente

### 1. Pré-requisitos
Certifique-se de ter o **Node.js** (v18 ou superior) instalado na sua máquina.

### 2. Arquivos de Configuração (Importante)
Por questões de segurança, chaves de API e credenciais de banco de dados não estão versionadas neste repositório. Para rodar a aplicação, você precisará solicitar à equipe de desenvolvimento os seguintes arquivos restritos e colocá-los na **raiz** do projeto:
*   `.env` (Contém variáveis como `DB_HOST`, `DB_PASSWORD`, `PORT`, etc.)
*   `firebase-key.json` (Credencial de serviço do Firebase Admin)

### 3. Comandos de Instalação das Bibliotecas
Se for a primeira vez configurando o projeto ou caso o `package.json` precise ser reconstruído, instale as dependências principais da aplicação:

\`\`\`bash
npm install express mysql2 dotenv cors firebase-admin axios winston dd-trace
\`\`\`

Em seguida, instale as dependências de desenvolvimento (ferramentas de código estático, segurança e auto-restart):

\`\`\`bash
npm install --save-dev eslint prettier morgan helmet snyk nodemon
\`\`\`

*(Nota: Se o arquivo `package.json` já estiver configurado e atualizado no repositório, basta rodar um simples `npm install` para baixar tudo de uma vez).*

### 4. Executando a API
Com as bibliotecas instaladas e os arquivos de ambiente na raiz do projeto, inicie o servidor em modo de desenvolvimento (com hot-reload via nodemon):

\`\`\`bash
npm run dev
\`\`\`

A API estará rodando localmente na porta configurada no seu arquivo `.env` (por padrão `http://localhost:8080`).

---

## 🛡️ Procedimentos de Segurança e Vulnerabilidades

### Como reportar problemas
Caso qualquer membro da equipe ou auditor externo identifique uma vulnerabilidade no aplicativo ou na API, o reporte deve ser feito abrindo uma **Issue** no repositório correspondente utilizando a etiqueta `[SECURITY-BUG]`. O reporte deve conter os passos para reprodução do problema, isolando logs que contenham dados sensíveis.

### Atualização e Monitoramento (Boas Práticas)
Para manter o Alfinete protegido contra novas vulnerabilidades em pacotes Node.js e React Native, a equipe segue as seguintes diretrizes:
1. **Auditoria Contínua:** Utilização do CodeQL integrado ao GitHub Actions para varredura de código estático a cada Pull Request.
2. **Checagem Local:** Execução obrigatória dos comandos `npm audit` e `npx snyk test` antes de envios para a branch principal.
3. **Acompanhamento:** Acompanhamento regular dos boletins de segurança oficiais através da [Node.js Security Advisories](https://nodejs.org/en/security/) e do [NVD (National Vulnerability Database)](https://nvd.nist.gov/).
