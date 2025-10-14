import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import Home from './pages/Home'
import { bgm } from './lib/music'

export type Emotion = {
  slug: string
  title: string
  x: number
  y: number
  z: number
}
export type Entry = {
  slug: string
  name: string
  location: string
  text: string
  date: string
  points: Point[]
  index: number
}
export type Point = {
  id: number
  x: number
  y: number
  emotion: string
  distance: number
  angle: number
}

type Context = {
  appState: {
    introStarted: boolean
    introSeen: boolean
    menuOpen: boolean
    headerVisible: boolean
    emotions: Emotion[]
    entries: Entry[]
    filteredEntries: Entry[]
    myEntries: Entry[]
    currentEntry: Entry | null
    currentMarker: Point | null
    viewMode: 'empty' | 'post' | 'pick' | 'saved' | 'explore' | 'filtered'
    zoomIn: boolean
    entryPoints: { x: number; y: number }[],
    mvCam: any
    onsite: number
    x: number
    y: number
    z: number
  }
  setAppState: (state: Context['appState']) => void
}
const State: Context['appState'] = {
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

export const AppContext = React.createContext<Context>(null!)

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
