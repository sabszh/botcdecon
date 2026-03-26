import React from 'react'

export type AppState = {
  headerVisible: boolean
  viewMode: 'empty' | 'post'
  zoomIn: boolean
}

export type Context = {
  appState: AppState
  setAppState: React.Dispatch<React.SetStateAction<AppState>>
}

export const AppContext = React.createContext<Context>(null!)

