import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import Root from './Root'
import Error from './pages/Error'
import Home from './pages/Home'
import About from './pages/About'

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
  points: {
    id: number
    x: number
    y: number
    emotion: string
    distance: number
  }[]
}

type Context = {
  appState: {
    introSeen: boolean
    menuOpen: boolean
    headerVisible: boolean
    emotions: Emotion[]
    entries: Entry[]
    currentEntry: Entry | null
    viewMode: 'empty' | 'post' | 'pick' | 'saved' | 'explore'
    zoomIn: boolean
    entryPoints: { x: number; y: number }[]
  }
  setAppState: (state: Context['appState']) => void
}
const State: Context['appState'] = {
  introSeen: false,
  menuOpen: false,
  headerVisible: true,
  emotions: [],
  entries: [],
  currentEntry: null,
  viewMode: 'empty',
  zoomIn: false,
  entryPoints: []
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
      }
    ]
  }
])

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
