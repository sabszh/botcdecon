import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import Home from './pages/Home'
import { bgm } from './lib/music'
import { AppContext, Emotion, Entry, Point } from './context/AppContext'

import type { AppState } from './context/AppContext'
const State: AppState = {
  introStarted: false,
  introSeen: false,
  menuOpen: false,
  headerVisible: true,
  emotions: [],
  entries: [],
  filteredEntries: [],
  myEntries: getStoredEntries(),
  currentEntry: null,
  currentMarker: null,
  viewMode: 'empty',
  zoomIn: false,
  entryPoints: [],
  mvCam: null,
  onsite: 0,
  x: 0,
  y: 0,
  z: 1000
}

// Chat-only app: render Home directly (no router/pages)

function getStoredEntries () {
  return [] // These should expire at some point, or we skip completely
  // const stored = JSON.parse(localStorage?.getItem('entries') || '[]')
  // return stored as Entry[]
}

function StoreProvider (props: React.PropsWithChildren) {
  const [appState, setAppState] = React.useState(State)

  React.useEffect(() => {
    // Initialize background music once at app start
    bgm.init('/audio/backgroundmusic.mp3', 1)
  }, [])

  return (
    <AppContext.Provider value={{ appState, setAppState }}>
      {props.children}
    </AppContext.Provider>
  )
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <StoreProvider>
    <Home />
  </StoreProvider>
)
