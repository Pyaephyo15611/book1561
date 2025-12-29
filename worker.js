export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const pathname = url.pathname
    
    // Handle static assets (JS, CSS, images, etc.)
    const staticAssetExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.json']
    const isStaticAsset = staticAssetExtensions.some(ext => pathname.endsWith(ext))
    
    if (isStaticAsset) {
      // Try to fetch the static asset
      try {
        return env.ASSETS.fetch(request)
      } catch (error) {
        // If asset not found, return 404
        return new Response('Asset not found', { status: 404 })
      }
    }
    
    // For all other routes (including root), serve index.html
    // This allows React Router to handle client-side routing
    try {
      return env.ASSETS.fetch(new Request('/index.html', request))
    } catch (error) {
      return new Response('App not found', { status: 404 })
    }
  }
}
