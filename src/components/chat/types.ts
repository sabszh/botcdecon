export type Language = 'en' | 'da'

export type ChatMessage = {
  id: number
  role: 'user' | 'bot'
  content: string
  pending?: boolean
  pendingLabel?: string
}
