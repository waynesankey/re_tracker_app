import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from './api'
import TopBar from './components/TopBar'
import ListingGrid from './components/ListingGrid'
import ListingDetail from './components/ListingDetail'
import RefreshResultsModal from './components/RefreshResultsModal'
import IngestResultsModal from './components/IngestResultsModal'
import SearchModal from './components/SearchModal'
import ProposalsView from './components/ProposalsView'
import ListingMap from './components/ListingMap'
import WatchedView from './components/WatchedView'
import InspirationView from './components/InspirationView'

export const RANKED_CATEGORIES = ['Interested', 'Showing Requested', 'Visited']

export const CATEGORIES_BY_TYPE = {
  House: ['Inbox', 'New', 'Interested', 'Showing Requested', 'Visited', 'Passed', 'Offer Made', 'Sold', 'Listing Withdrawn'],
  Land:  ['Inbox', 'New', 'Interested', 'Visited', 'Passed', 'Offer Made', 'Sold', 'Listing Withdrawn'],
}
// House is the superset — use it as the "All" list
const ALL_CATEGORIES = CATEGORIES_BY_TYPE.House

function getInitialTheme() {
  const stored = localStorage.getItem('theme')
  if (stored) return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getInitialUser() {
  return localStorage.getItem('currentUser') || ''
}

export default function App() {
  const [listings, setListings] = useState([])
  const [totalCount, setTotalCount] = useState(null)
  const [loading, setLoading] = useState(true)
  const [theme, setTheme] = useState(getInitialTheme)
  const [currentUser, setCurrentUser] = useState(getInitialUser)
  const [proposals, setProposals] = useState([])
  const [showProposals, setShowProposals] = useState(false)
  const [showWatched, setShowWatched] = useState(false)
  const [watched, setWatched] = useState([])
  const [showInspiration, setShowInspiration] = useState(false)
  const [inspiration, setInspiration] = useState([])
  const [soldUnseen, setSoldUnseen] = useState(0)
  const [propertyType, setPropertyType] = useState('')
  const [category, setCategory] = useState('')
  const [priceChangedFilter, setPriceChangedFilter] = useState(false)
  const [sort, setSort] = useState('date_added')
  const [viewMode, setViewMode] = useState('grid')
  const [selected, setSelected] = useState(null)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState(null)
  const [listingNotice, setListingNotice] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshProgress, setRefreshProgress] = useState(null) // {current, total, address}
  const [refreshResults, setRefreshResults] = useState(null) // {results, runDate} — drives modal
  const [ingesting, setIngesting] = useState(false)
  const [ingestMsg, setIngestMsg] = useState(null) // {added, fetched} or {error}
  const [ingestResult, setIngestResult] = useState(null) // full result for modal
  const refreshMsgTimer = useRef(null)
  const ingestMsgTimer = useRef(null)
  const listingsVersion = useRef('')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('currentUser', currentUser)
  }, [currentUser])

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  const handleUserChange = (user) => setCurrentUser(user)

  const loadProposals = useCallback(async () => {
    try {
      const data = await api.getProposals()
      setProposals(data)
    } catch (_) {}
  }, [])

  const loadWatched = useCallback(async () => {
    try {
      const data = await api.getWatched()
      setWatched(data)
    } catch (_) {}
  }, [])

  const loadInspiration = useCallback(async () => {
    try {
      const data = await api.getInspiration()
      setInspiration(data)
    } catch (_) {}
  }, [])

  const loadSoldUnseen = useCallback(async () => {
    if (!currentUser) return
    try {
      const data = await api.getSoldUnseen(currentUser)
      setSoldUnseen(data.count)
    } catch (_) {}
  }, [currentUser])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = { sort }
      if (priceChangedFilter) {
        params.price_changed = true
      } else {
        if (propertyType) params.property_type = propertyType
        if (category) params.category = category
      }
      const [data, countData, versionData] = await Promise.all([api.getListings(params), api.getListingCount(), api.getListingsVersion(), loadProposals()])
      setListings(data)
      setTotalCount(countData.count)
      listingsVersion.current = versionData.version || ''
    } finally {
      setLoading(false)
    }
  }, [propertyType, category, sort, priceChangedFilter, loadProposals])

  useEffect(() => { load() }, [load])

  useEffect(() => { loadSoldUnseen() }, [loadSoldUnseen])

  useEffect(() => { loadWatched() }, [loadWatched])
  useEffect(() => { loadInspiration() }, [loadInspiration])

  // Poll for changes across devices. Proposals and sold-unseen always check.
  // Listings only reload when the server version (MAX date_updated) has changed,
  // so no-op polls cause zero redraws.
  useEffect(() => {
    const id = setInterval(async () => {
      loadProposals()
      loadSoldUnseen()
      try {
        const { version } = await api.getListingsVersion()
        if (version && version !== listingsVersion.current) {
          listingsVersion.current = version
          load()
        }
      } catch (_) {}
    }, 15000)
    return () => clearInterval(id)
  }, [load, loadProposals, loadSoldUnseen])

  // Bookmarklet: handle ?url= query param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const url = params.get('url')
    if (url) {
      window.history.replaceState({}, '', window.location.pathname)
      handleAdd(url)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleAdd = async (url) => {
    setAdding(true)
    setAddError(null)
    try {
      const listing = await api.createListing(url)
      await load()
      setSelected(listing)
    } catch (e) {
      if (e.status === 409 && e.data?.id) {
        const existing = listings.find((l) => l.id === e.data.id) || await api.getListing(e.data.id)
        setListingNotice('Already tracking this listing')
        setSelected(existing)
      } else {
        setAddError(e.message)
      }
    } finally {
      setAdding(false)
    }
  }

  const handleUpdate = async (id, data) => {
    const updated = await api.updateListing(id, data)
    await load()
    setSelected(updated)
  }

  const handleDelete = async (id) => {
    await api.deleteListing(id)
    setListings((ls) => ls.filter((l) => l.id !== id))
    setSelected(null)
  }

  const handleIngest = async () => {
    setIngesting(true)
    setIngestMsg(null)
    clearTimeout(ingestMsgTimer.current)
    try {
      const result = await api.ingest(currentUser)
      await load()
      setIngestMsg({ added: result.added, fetched: result.fetched, resurrected: result.resurrected, relisted: result.relisted })
      setIngestResult(result)
    } catch (e) {
      setIngestMsg({ error: e.message })
    } finally {
      setIngesting(false)
      ingestMsgTimer.current = setTimeout(() => setIngestMsg(null), 8000)
    }
  }

  const handlePropose = async (id, newCategory) => {
    const updated = await api.propose(id, newCategory, currentUser)
    await load()
    setSelected(updated)
  }

  const handleAgree = async (id) => {
    const updated = await api.agree(id, currentUser)
    await load()
    if (showProposals) setSelected(null)
    else setSelected(updated)
  }

  const handleWithdraw = async (id) => {
    const updated = await api.withdraw(id, currentUser)
    await load()
    setSelected(updated)
  }

  const handleReorder = async (items) => {
    await api.reorder(items)
    await load()
  }

  const handleReject = async (id, note) => {
    const updated = await api.reject(id, currentUser, note)
    await load()
    if (showProposals) setSelected(null)
    else setSelected(updated)
  }

  const handleWatchedAdd = async (data) => {
    await api.createWatched(data)
    await loadWatched()
  }

  const handleWatchedDelete = async (id) => {
    await api.deleteWatched(id)
    setWatched((w) => w.filter((wp) => wp.id !== id))
  }

  const handleWatchedSave = async (id, data) => {
    const updated = await api.updateWatched(id, data)
    setWatched((w) => w.map((wp) => wp.id === id ? updated : wp))
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    setRefreshProgress(null)
    clearTimeout(refreshMsgTimer.current)
    try {
      const result = await api.refreshPrices((evt) => {
        setRefreshProgress({ current: evt.current, total: evt.total, address: evt.address })
      })
      await load()
      setRefreshResults({ results: result?.results || [], runDate: new Date() })
    } catch (e) {
      setRefreshResults({ results: [], runDate: new Date(), error: e.message })
    } finally {
      setRefreshing(false)
      setRefreshProgress(null)
    }
  }

  // Open a listing by ID — used by the results modal rows
  const handleSelectById = async (id) => {
    const listing = listings.find((l) => l.id === id) || await api.getListing(id)
    setSelected(listing)
  }

  const handleEmailRealtor = async () => {
    const all = await api.getListings({ property_type: 'House', category: 'Interested', sort: 'rank' })
    const top10 = all.slice(0, 10)
    const fmtPrice = (p) => p != null
      ? '$' + Number(p).toLocaleString('en-CA', { maximumFractionDigits: 0 })
      : 'Price TBD'
    const lines = top10.map((l, i) => {
      const url = (l.url || '').replace('?map=1', '')
      return [
        `#${i + 1} — ${l.address || l.title || '(unknown)'}`,
        `    Price: ${fmtPrice(l.price)}`,
        l.listing_id ? `    MLS# ${l.listing_id}` : null,
        url ? `    ${url}` : null,
      ].filter(Boolean).join('\n')
    }).join('\n\n')
    const date = new Date().toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
    const subject = `Halifax Houses — Interested (${date})`
    const body = `Hi,\n\nHere are the houses we're currently most interested in:\n\n${lines}\n\nWayne & Christina`
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  // Undo an auto-withdraw from the refresh results modal
  const handleRestore = async (id, toCategory) => {
    await api.updateListing(id, { category: toCategory })
    await load()
    setRefreshResults((prev) => prev
      ? { ...prev, results: prev.results.map((r) => r.id === id ? { ...r, status: 'restored' } : r) }
      : prev
    )
  }

  // Categorize an "unclear" listing (sold vs withdrawn) from the refresh results modal
  const handleCategorize = async (id, category) => {
    await api.updateListing(id, { category })
    await load()
    const newStatus = category === 'Sold' ? 'sold' : 'withdrawn'
    setRefreshResults((prev) => prev
      ? { ...prev, results: prev.results.map((r) => r.id === id ? { ...r, status: newStatus } : r) }
      : prev
    )
  }

  const handlePropertyTypeChange = (type) => {
    setPriceChangedFilter(false)
    setPropertyType(type)
    // reset category if it doesn't exist in the new type's list
    if (type && category) {
      const valid = CATEGORIES_BY_TYPE[type] || ALL_CATEGORIES
      if (!valid.includes(category)) setCategory('')
    }
    // only clear rank sort if the category won't be a ranked context after the switch
    if (!type || !RANKED_CATEGORIES.includes(category)) {
      setSort((prev) => (prev === 'rank' ? 'date_added' : prev))
    }
  }

  const handleCategoryChange = (cat) => {
    setPriceChangedFilter(false)
    setCategory(cat)
    if (cat === 'Sold' && currentUser) {
      api.markSoldViewed(currentUser).catch(() => {})
      setSoldUnseen(0)
    }
    // Auto-switch sort: ranked categories default to Ranking, others revert from Ranking
    if (RANKED_CATEGORIES.includes(cat)) {
      setSort('rank')
    } else {
      setSort((prev) => (prev === 'rank' ? 'date_added' : prev))
    }
  }

  const handlePriceChangedFilter = () => {
    setCategory('')
    setPropertyType('')
    setPriceChangedFilter(true)
  }

  const visibleCategories = propertyType ? CATEGORIES_BY_TYPE[propertyType] : ALL_CATEGORIES
  const isRankedCategory = !priceChangedFilter && RANKED_CATEGORIES.includes(category)
  const isRanked = isRankedCategory && sort === 'rank'

  return (
    <div className={`app${viewMode === 'map' ? ' app--map' : ''}`}>
      <TopBar
        propertyType={propertyType}
        categories={visibleCategories}
        category={category}
        priceChangedFilter={priceChangedFilter}
        sort={sort}
        adding={adding}
        error={addError}
        totalCount={totalCount}
        refreshing={refreshing}
        refreshProgress={refreshProgress}
        ingesting={ingesting}
        ingestMsg={ingestMsg}
        theme={theme}
        currentUser={currentUser}
        proposalCount={proposals.length}
        soldUnseen={soldUnseen}
        showProposals={showProposals}
        showWatched={showWatched}
        watchedCount={watched.length}
        showInspiration={showInspiration}
        inspirationCount={inspiration.length}
        viewMode={viewMode}
        onPropertyTypeChange={handlePropertyTypeChange}
        onCategoryChange={handleCategoryChange}
        onPriceChangedFilter={handlePriceChangedFilter}
        onSortChange={setSort}
        onAdd={handleAdd}
        onRefresh={handleRefresh}
        onIngest={handleIngest}
        onEmailRealtor={handleEmailRealtor}
        onSearch={() => setSearchOpen(true)}
        onToggleTheme={toggleTheme}
        onUserChange={handleUserChange}
        onShowProposals={() => { setShowProposals(true); setShowWatched(false); setShowInspiration(false); setSelected(null); loadProposals() }}
        onHideProposals={() => setShowProposals(false)}
        onShowWatched={() => { setShowWatched(true); setShowProposals(false); setShowInspiration(false); setSelected(null); loadWatched() }}
        onHideWatched={() => setShowWatched(false)}
        onShowInspiration={() => { setShowInspiration(true); setShowProposals(false); setShowWatched(false); setSelected(null); loadInspiration() }}
        onHideInspiration={() => setShowInspiration(false)}
        onViewModeChange={setViewMode}
      />
      {showInspiration
        ? <InspirationView
            listings={inspiration}
            onSelectListing={handleSelectById}
          />
        : showWatched
        ? <WatchedView
            watched={watched}
            onAdd={handleWatchedAdd}
            onDelete={handleWatchedDelete}
            onSave={handleWatchedSave}
          />
        : showProposals
          ? <ProposalsView
              proposals={proposals}
              currentUser={currentUser}
              onSelect={setSelected}
              onAgree={handleAgree}
              onWithdraw={handleWithdraw}
              onReject={handleReject}
            />
          : viewMode === 'map'
            ? <ListingMap listings={listings} onSelect={handleSelectById} />
            : <ListingGrid
                listings={listings}
                loading={loading}
                onSelect={setSelected}
                isRankedCategory={isRankedCategory}
                isRanked={isRanked}
                onReorder={handleReorder}
              />
      }
      {selected && (
        <ListingDetail
          listing={selected}
          categoriesByType={CATEGORIES_BY_TYPE}
          allCategories={ALL_CATEGORIES}
          currentUser={currentUser}
          notice={listingNotice}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onPropose={handlePropose}
          onAgree={handleAgree}
          onWithdraw={handleWithdraw}
          onReject={handleReject}
          onClose={() => { setSelected(null); setListingNotice(null) }}
        />
      )}
      {ingestResult && (
        <IngestResultsModal
          result={ingestResult}
          onClose={() => setIngestResult(null)}
        />
      )}
      {refreshResults && (
        <RefreshResultsModal
          results={refreshResults.results}
          runDate={refreshResults.runDate}
          onSelectListing={handleSelectById}
          onRestore={handleRestore}
          onCategorize={handleCategorize}
          onClose={() => setRefreshResults(null)}
        />
      )}
      {searchOpen && (
        <SearchModal
          onSelect={handleSelectById}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </div>
  )
}
