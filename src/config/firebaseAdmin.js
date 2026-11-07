const path = require('path');
const { initializeApp, getApp, getApps, cert } = require('firebase-admin/app');

function initFirebase() {
  if (getApps().length) return getApp();
  const serviceFile = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceFile) {
    // Nunca disponibilize esse JSON no frontend ou no Git.
    const account = require(path.resolve(process.cwd(), serviceFile));
    return initializeApp({ credential: cert(account) });
  }
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    throw new Error('Configure FIREBASE_SERVICE_ACCOUNT ou as credenciais do Firebase Admin.');
  }
  return initializeApp({ credential: cert({ projectId: FIREBASE_PROJECT_ID, clientEmail: FIREBASE_CLIENT_EMAIL, privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') }) });
}
module.exports = { initFirebase };
