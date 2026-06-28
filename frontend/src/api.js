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
  ingest: () => req('/ingest', { method: 'POST' }),
  getProposals: () => req('/proposals'),
  propose: (id, new_category, proposed_by) =>
    req(`/listings/${id}/propose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_category, proposed_by }),
    }),
  agree: (id, agreed_by) =>
    req(`/listings/${id}/agree`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agreed_by }),
    }),
  withdraw: (id, withdrawn_by) =>
    req(`/listings/${id}/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ withdrawn_by }),
    }),
  reject: (id, rejected_by, note) =>
    req(`/listings/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rejected_by, note }),
    }),
  getProposalLog: (id) => req(`/listings/${id}/proposal-log`),
  reorder: (items) =>
    req('/listings/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    }),
}
