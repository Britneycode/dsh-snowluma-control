export function sendJson(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

export function readBodyJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) { reject(Object.assign(new Error('请求体必须是 JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

export function sameOrigin(req) {
  const headers = req.headers ?? {};
  if (headers['sec-fetch-site'] === undefined) return true; // curl 等非浏览器客户端
  return headers['sec-fetch-site'] === 'same-origin' || headers['sec-fetch-site'] === 'none';
}