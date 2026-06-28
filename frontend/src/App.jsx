import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from './api'
import TopBar from './components/TopBar'
import ListingGrid from './components/ListingGrid'
import ListingDetail from './components/ListingDetail'
import RefreshResultsModal from './components/RefreshResultsModal'
import ProposalsView from './components/ProposalsView'

export const CATEGORIES_BY_TYPE = {
  House: ['Inbox', 'New', 'Interested', 'Showing Requested', 'Visited', 'Passed', 'Offer Made', 'Sold'],
  Land:  ['Inbox', 'New', 'Interested', 'Visited', 'Passed', 'Offer Made', 'Sold'],
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
  const [loading, setLoading] = useState(true)
  const [theme, setTheme] = useState(getInitialTheme)
  const [currentUser, setCurrentUser] = useState(getInitialUser)
  const [proposals, setProposals] = useState([])
  const [showProposals, setShowProposals] = useState(false)
  const [propertyType, setPropertyType] = useState('')
  const [category, setCategory] = useState('')
  const [priceChangedFilter, setPriceChangedFilter] = useState(false)
  const [sort, setSort] = useState('date_added')
  const [selected, setSelected] = useState(null)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshResults, setRefreshResults] = useState(null) // {results, runDate} — drives modal
  const [ingesting, setIngesting] = useState(false)
  const [ingestMsg, setIngestMsg] = useState(null) // {added, fetched} or {error}
  const refreshMsgTimer = useRef(null)
  const ingestMsgTimer = useRef(null)

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
      const [data] = await Promise.all([api.getListings(params), loadProposals()])
      setListings(data)
    } finally {
      setLoading(false)
    }
  }, [propertyType, category, sort, priceChangedFilter, loadProposals])

  useEffect(() => { load() }, [load])

  // Poll for proposal count changes so the badge updates across browsers
  useEffect(() => {
    const id = setInterval(loadProposals, 15000)
    return () => clearInterval(id)
  }, [loadProposals])

  // Bookmarklet: handle ?url= query param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const url = params.get('url')
    if (url) {
      window.history.replaceState({}, '', window.location.pathname)
      handleAdd(url)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAdd = async (url) => {
    setAdding(true)
    setAddError(null)
    try {
      const listing = await api.createListing(url)
      await load()
      setSelected(listing)
    } catch (e) {
      setAddError(e.message)
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
      const result = await api.ingest()
      await load()
      setIngestMsg({ added: result.added, fetched: result.fetched })
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

  const handleReject = async (id, note) => {
    const updated = await api.reject(id, currentUser, note)
    await load()
    if (showProposals) setSelected(null)
    else setSelected(updated)
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    clearTimeout(refreshMsgTimer.current)
    try {
      const result = await api.refreshPrices()
      await load()
      setRefreshResults({ results: result.results || [], runDate: new Date() })
    } catch (e) {
      setRefreshResults({ results: [], runDate: new Date(), error: e.message })
    } finally {
      setRefreshing(false)
    }
  }

  // Open a listing by ID — used by the results modal rows
  const handleSelectById = async (id) => {
    setRefreshResults(null)
    const listing = listings.find((l) => l.id === id) || await api.getListing(id)
    setSelected(listing)
  }

  const handlePropertyTypeChange = (type) => {
    setPriceChangedFilter(false)
    setPropertyType(type)
    // reset category if it doesn't exist in the new type's list
    if (type && category) {
      const valid = CATEGORIES_BY_TYPE[type] || ALL_CATEGORIES
      if (!valid.includes(category)) setCategory('')
    }
  }

  const handleCategoryChange = (cat) => {
    setPriceChangedFilter(false)
    setCategory(cat)
  }

  const handlePriceChangedFilter = () => {
    setCategory('')
    setPriceChangedFilter(true)
  }

  const visibleCategories = propertyType ? CATEGORIES_BY_TYPE[propertyType] : ALL_CATEGORIES

  return (
    <div className="app">
      <TopBar
        propertyType={propertyType}
        categories={visibleCategories}
        category={category}
        priceChangedFilter={priceChangedFilter}
        sort={sort}
        adding={adding}
        error={addError}
        refreshing={refreshing}
        ingesting={ingesting}
        ingestMsg={ingestMsg}
        theme={theme}
        currentUser={currentUser}
        proposalCount={proposals.length}
        showProposals={showProposals}
        onPropertyTypeChange={handlePropertyTypeChange}
        onCategoryChange={handleCategoryChange}
        onPriceChangedFilter={handlePriceChangedFilter}
        onSortChange={setSort}
        onAdd={handleAdd}
        onRefresh={handleRefresh}
        onIngest={handleIngest}
        onToggleTheme={toggleTheme}
        onUserChange={handleUserChange}
        onShowProposals={() => { setShowProposals(true); setSelected(null); loadProposals() }}
        onHideProposals={() => setShowProposals(false)}
      />
      {showProposals
        ? <ProposalsView
            proposals={proposals}
            currentUser={currentUser}
            onSelect={setSelected}
            onAgree={handleAgree}
            onWithdraw={handleWithdraw}
            onReject={handleReject}
          />
        : <ListingGrid listings={listings} loading={loading} onSelect={setSelected} />
      }
      {selected && (
        <ListingDetail
          listing={selected}
          categoriesByType={CATEGORIES_BY_TYPE}
          allCategories={ALL_CATEGORIES}
          currentUser={currentUser}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onPropose={handlePropose}
          onAgree={handleAgree}
          onWithdraw={handleWithdraw}
          onReject={handleReject}
          onClose={() => setSelected(null)}
        />
      )}
      {refreshResults && (
        <RefreshResultsModal
          results={refreshResults.results}
          runDate={refreshResults.runDate}
          onSelectListing={handleSelectById}
          onClose={() => setRefreshResults(null)}
        />
      )}
    </div>
  )
}
