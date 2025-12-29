export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    
    // Handle static assets (files with extensions)
    if (pathname.includes('.')) {
      try {
        return await env.ASSETS.fetch(request);
      } catch (e) {
        return new Response('Asset not found', { status: 404 });
      }
    }
    
    // For all other routes, serve index.html for SPA routing
    try {
      return await env.ASSETS.fetch(new Request('/index.html', request));
    } catch (e) {
      return new Response('App not found', { status: 404 });
    }
  },
};
