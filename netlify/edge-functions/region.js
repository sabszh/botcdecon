export default async (_req, ctx) => {
  const countryCode = ctx.geo?.country.code
  return Response.json({
    where: countryCode || ''
  })
}

export const config = { path: '/region' }
