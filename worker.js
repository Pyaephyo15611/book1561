addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const pathname = url.pathname
  
  // For all routes, serve index.html to let React Router handle it
  // This is the simplest approach that works with Cloudflare Workers assets
  return fetch(new Request(new URL('/index.html', url.origin), request))
}
