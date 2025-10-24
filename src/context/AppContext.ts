import React from 'react'

export type Emotion = {
  slug: string
  title: string
  x: number
  y: number
  z: number
}

export type Point = {
  id: number
  x: number
  y: number
  emotion: string
  distance: number
  angle: number
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

export type AppState = {
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
  entryPoints: { x: number; y: number }[]
  mvCam: any
  onsite: number
  x: number
  y: number
  z: number
}

export type Context = {
  appState: AppState
  setAppState: (state: AppState) => void
}

export const AppContext = React.createContext<Context>(null!)

