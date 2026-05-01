const fs = require('fs');
const path = require('path');

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

module.exports = function handler(req, res) {
  try {
    const raw = String(req.query.path || '').trim();
    const rel = raw === '' ? 'index.html' : raw;

    // Basit path traversal koruması
    const safeRel = rel.replace(/^\/+/, '');
    const abs = path.resolve(process.cwd(), safeRel);
    const root = path.resolve(process.cwd());
    if (!abs.startsWith(root)) {
      return res.status(400).send('Invalid path');
    }

    if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
      return res.status(404).send('Not Found');
    }

    const ext = path.extname(abs).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
    const data = fs.readFileSync(abs);

    res.setHeader('Content-Type', contentType);
    return res.status(200).send(data);
  } catch (error) {
    return res.status(500).send(error?.message || 'Static handler error');
  }
};
