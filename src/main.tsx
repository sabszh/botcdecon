import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import Home from './pages/Home'
import { bgm } from './lib/music'
import { AppContext } from './context/AppContext'

import type { AppState } from './context/AppContext'
const State: AppState = {
  headerVisible: true,
  viewMode: 'empty',
  zoomIn: false
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
