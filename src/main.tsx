import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import Root from './Root'
import Error from './pages/Error'
import Home from './pages/Home'
import About from './pages/About'
import Legal from './pages/Legal'
import Exhibition from './pages/Exhibition'

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
  mvCam: null
}

export const AppContext = React.createContext<Context>(null!)

const router = createBrowserRouter([
  {
    path: '/',
    element: <Root/>,
    errorElement: <Error/>,
    children: [
      {
        path: '',
        element: <Home/>
      },
      {
        path: 'about',
        element: <About/>
      },
      {
        path: 'legal',
        element: <Legal/>
      },
      {
        path: 'exhibition',
        element: <Exhibition/>
      }
    ]
  }
])

function getStoredEntries () {
  const stored = JSON.parse(localStorage?.getItem('entries') || '[]')
  return stored as Entry[]
}

function StoreProvider (props: React.PropsWithChildren) {
  const [appState, setAppState] = React.useState(State)

  return (
    <AppContext.Provider value={{ appState, setAppState }}>
      {props.children}
    </AppContext.Provider>
  )
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <StoreProvider>
    <RouterProvider router={router}/>
  </StoreProvider>
)
