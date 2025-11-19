// Simple static file server for Vite SPA
const bunRuntime = globalThis.Bun;
if (!bunRuntime) {
  throw new Error("Bun runtime is required to start the web server.");
}

const server = bunRuntime.serve({
  port: 3001,
  async fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname;

    // Serve index.html for all routes (SPA)
    if (path === "/" || !path.includes(".")) {
      path = "/index.html";
    }

    const file = bunRuntime.file(`./dist${path}`);

    if (await file.exists()) {
      return new Response(file);
    }

    // Fallback to index.html for SPA routing
    return new Response(bunRuntime.file("./dist/index.html"));
  },
});

console.log(`🚀 Web server running at http://localhost:${server.port}`);
