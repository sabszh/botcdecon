export function getAudioContextCtor (): typeof AudioContext | null {
  return window.AudioContext || window.webkitAudioContext || null
}

export function getSpeechRecognitionCtor (): SpeechRecognitionConstructor | null {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

export function getSpeechSynthesisApi (): SpeechSynthesis | null {
  return window.speechSynthesis || null
}
