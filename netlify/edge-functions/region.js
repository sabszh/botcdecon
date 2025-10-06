export default async (request, context) => {
  return new Response('OK', { status: 200 })
}

export const config = { path: '/region' }
