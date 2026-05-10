const { onRequest } = require('firebase-functions/v2/https');
const app = require('./server');
exports.api = onRequest({ region: 'us-central1', timeoutSeconds: 60, memory: '256MiB' }, app);
