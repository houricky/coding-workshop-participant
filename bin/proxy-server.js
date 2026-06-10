#!/usr/bin/env node

/**
 * Development CORS Proxy Server
 *
 * This proxy server forwards requests from the React frontend (localhost:3000)
 * to Lambda Function URLs in LocalStack, working around CORS issues.
 *
 * Only needed for LocalStack development. AWS production handles CORS correctly.
 */

const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

const PORT = 3001;
const CORS_ALLOW_HEADERS = 'Content-Type, Authorization, X-Requested-With, Accept';
const ROUTE_TO_ENDPOINT = {
  auth: 'auth-service',
  employees: 'employee-service',
  projects: 'project-service',
  budgets: 'budget-service',
  allocations: 'allocation-service',
  usage: 'usage-service',
  dependencies: 'dependency-service',
  dashboard: 'dashboard-service',
  rag: 'rag-service',
};

// Read endpoint mappings from .env.local
const envFile = path.join(__dirname, '../frontend/.env.local');
let endpoints = {};

try {
  const envContent = fs.readFileSync(envFile, 'utf8');
  const match = envContent.match(/VITE_API_ENDPOINTS='(.+)'/) || envContent.match(/REACT_APP_API_ENDPOINTS='(.+)'/);
  if (match) {
    endpoints = JSON.parse(match[1]);
    console.log('Loaded endpoints:', Object.keys(endpoints));
  }
} catch (err) {
  console.error('Could not load endpoints from .env.local:', err.message);
  console.error('Make sure to run: ./bin/generate-env.sh first');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', CORS_ALLOW_HEADERS);
  res.setHeader('Access-Control-Max-Age', '86400');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Parse request path: /api/{endpoint_name} or frontend API paths like /auth/login.
  const parsedUrl = url.parse(req.url);
  const pathParts = parsedUrl.pathname.split('/').filter(Boolean);

  if (pathParts.length === 0) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      message: 'Development CORS Proxy Server',
      usage: 'GET /api/{endpoint_name} or app paths such as /auth/login',
      endpoints: Object.keys(endpoints).map(name => `http://localhost:${PORT}/api/${name}`),
      appRoutes: Object.keys(ROUTE_TO_ENDPOINT).map(name => `http://localhost:${PORT}/${name}`)
    }, null, 2));
    return;
  }

  const usesServicePath = pathParts[0] === 'api';
  const endpointName = usesServicePath ? pathParts[1] : ROUTE_TO_ENDPOINT[pathParts[0]];
  const remainingParts = usesServicePath ? pathParts.slice(2) : pathParts.slice(1);
  const remainingPath = remainingParts.length > 0 ? '/' + remainingParts.join('/') : '';

  if (!endpointName || !endpoints[endpointName]) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: `Unknown endpoint: ${pathParts[0]}`,
      available: Object.keys(endpoints)
    }));
    return;
  }

  const endpointBaseUrl = endpoints[endpointName].replace(/\/+$/, '');
  const targetUrl = endpointBaseUrl + remainingPath + (parsedUrl.search || '');

  console.log(`${req.method} ${parsedUrl.pathname} -> ${targetUrl}`);

  // Parse target URL
  const target = url.parse(targetUrl);
  const protocol = target.protocol === 'https:' ? https : http;

  // Forward request - strip all CORS-related and browser headers
  const headers = { ...req.headers };

  // Remove headers that cause LocalStack CORS issues
  delete headers.origin;
  delete headers.referer;
  delete headers['sec-fetch-site'];
  delete headers['sec-fetch-mode'];
  delete headers['sec-fetch-dest'];

  // Keep only essential headers
  const options = {
    hostname: target.hostname,
    port: target.port,
    path: target.path,
    method: req.method,
    headers: {
      'accept': headers.accept || 'application/json',
      'content-type': headers['content-type'] || 'application/json',
      ...(headers.authorization ? { 'authorization': headers.authorization } : {}),
      'user-agent': headers['user-agent'] || 'proxy-server',
      'host': target.host
    }
  };

  const proxyReq = protocol.request(options, (proxyRes) => {
    // Filter out CORS headers from Lambda response since we set our own
    const headers = { ...proxyRes.headers };
    delete headers['access-control-allow-origin'];
    delete headers['access-control-allow-methods'];
    delete headers['access-control-allow-headers'];
    delete headers['access-control-max-age'];

    // Forward status and filtered headers
    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bad Gateway', message: err.message }));
  });

  req.pipe(proxyReq);
});

server.listen(PORT, () => {
  console.log('');
  console.log('==================================================');
  console.log(`Listening on: http://localhost:${PORT}`);
  console.log('==================================================');
  console.log('');
  console.log('Available endpoints:');
  for (const [name, targetUrl] of Object.entries(endpoints)) {
    console.log(`  /api/${name} -> ${targetUrl}`);
  }
  console.log('');
  console.log('==================================================');
  console.log(`Update frontend to use: http://localhost:${PORT}`);
  console.log('==================================================');
  console.log('');
});
