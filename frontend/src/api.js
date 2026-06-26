const BASE = '/api'

async function req(path, options = {}) {
  const r = await fetch(BASE + path, options)
  const data = await r.json()
  if (!r.ok) throw new Error(data.detail || `HTTP ${r.status}`)
  return data
}

export const api = {
  getListings: (params) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== false && v !== ''))
    )
    return req(`/listings${qs.toString() ? '?' + qs : ''}`)
  },
  getListing: (id) => req(`/listings/${id}`),
  createListing: (url) =>
    req('/listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    }),
  updateListing: (id, data) =>
    req(`/listings/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  deleteListing: (id) => req(`/listings/${id}`, { method: 'DELETE' }),
  getPriceHistory: (id) => req(`/listings/${id}/price-history`),
  refreshPrices: () => req('/listings/refresh-prices', { method: 'POST' }),
}
