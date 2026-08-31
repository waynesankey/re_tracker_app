const BASE = '/api'

async function req(path, options = {}) {
  const r = await fetch(BASE + path, options)
  const data = await r.json()
  if (!r.ok) {
    const detail = data.detail
    const err = new Error(typeof detail === 'string' ? detail : (detail?.message || `HTTP ${r.status}`))
    err.status = r.status
    err.data = detail
    throw err
  }
  return data
}

export const api = {
  getListings: (params) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== false && v !== ''))
    )
    return req(`/listings${qs.toString() ? '?' + qs : ''}`)
  },
  getListingCount: () => req('/listings/count'),
  getListingsVersion: () => req('/listings/version'),
  getListing: (id) => req(`/listings/${id}`),
  searchListings: (q) => req(`/listings/search?q=${encodeURIComponent(q)}`),
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
  refreshPrices: async (onProgress) => {
    const r = await fetch(BASE + '/listings/refresh-prices', { method: 'POST' })
    if (!r.ok) {
      const data = await r.json().catch(() => ({}))
      throw new Error(data.detail || `HTTP ${r.status}`)
    }
    const reader = r.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let finalData = null
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const event = JSON.parse(line.slice(6))
          if (event.type === 'progress' && onProgress) onProgress(event)
          else if (event.type === 'done') finalData = event
        } catch (_) {}
      }
    }
    return finalData
  },
  ingest: (runBy) => req('/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ run_by: runBy || null }),
  }),
  getIngestHistory: () => req('/ingest/history'),
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
  getSoldUnseen: (user) => req(`/sold/unseen?user=${encodeURIComponent(user)}`),
  markSoldViewed: (user) =>
    req('/sold/mark-viewed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user }),
    }),
  reorder: (items) =>
    req('/listings/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    }),
  archiveGallery: (id) => req(`/listings/${id}/archive-gallery`, { method: 'POST' }),
  getGallery: (id) => req(`/listings/${id}/gallery`),
  getInspiration: () => req('/inspiration'),
  getWatched: () => req('/watched'),
  createWatched: (data) =>
    req('/watched', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  updateWatched: (id, data) =>
    req(`/watched/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  deleteWatched: (id) => req(`/watched/${id}`, { method: 'DELETE' }),
}
