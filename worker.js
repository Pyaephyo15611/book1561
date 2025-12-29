export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const pathname = url.pathname
    
    // Handle static assets
    if (pathname.includes('.')) {
      return fetch(request)
    }
    
    // For all other routes, serve index.html
    return env.ASSETS.fetch(new Request('/index.html', request))
  }
}
