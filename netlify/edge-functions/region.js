export default async (request, context) => {
  const countryCode = context.geo?.country.code
  // Use countryCode as needed
  return new Response(`Country code: ${countryCode}`);
}

export const config = { path: '/region' }
