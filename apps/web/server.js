// Simple static file server for Vite SPA
const server = Bun.serve({
  port: 3001,
  async fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname;
    
    // Serve index.html for all routes (SPA)
    if (path === '/' || !path.includes('.')) {
      path = '/index.html';
    }
    
    const file = Bun.file(`./dist${path}`);
    
    if (await file.exists()) {
      return new Response(file);
    }
    
    // Fallback to index.html for SPA routing
    return new Response(Bun.file('./dist/index.html'));
  },
});

console.log(`🚀 Web server running at http://localhost:${server.port}`);
