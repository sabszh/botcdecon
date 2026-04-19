export function getAudioContextCtor (): typeof AudioContext | null {
  return window.AudioContext || window.webkitAudioContext || null
}

export function getSpeechRecognitionCtor (): SpeechRecognitionConstructor | null {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

export function getSpeechSynthesisApi (): SpeechSynthesis | null {
  return window.speechSynthesis || null
}

export async function requestMicrophonePermission (): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) return false
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  try {
    stream.getTracks().forEach(track => track.stop())
  } finally {
    // ensure tracks are stopped even if the loop above throws
  }
  return true
}
