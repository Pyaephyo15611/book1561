addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  
  // Handle static assets
  const staticAssetExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot']
  const isStaticAsset = staticAssetExtensions.some(ext => url.pathname.endsWith(ext))
  
  if (isStaticAsset || url.pathname === '/') {
    // Serve static assets and root normally
    return fetch(request)
  }
  
  // For all other routes, serve index.html to let React Router handle it
  const indexUrl = new URL('/index.html', url.origin)
  const indexRequest = new Request(indexUrl, {
    headers: request.headers,
    method: request.method,
    body: request.body,
    redirect: 'follow'
  })
  
  return fetch(indexRequest)
}
