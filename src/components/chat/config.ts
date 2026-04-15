import type { Language } from './types'

export const INTRO_START_MAX_WAIT_MS = 1500
export const INTRO_MIN_DELAY_MS = 300
export const GENERATED_SPEECH_RATE = 0.9
export const BROWSER_TTS_RATE = Math.min(2, GENERATED_SPEECH_RATE * 1.05)

export const THANK_YOU_TEXTS: Record<Language, string> = {
  en: 'Thank you for sharing.',
  da: 'Tak fordi du delte.'
}

export const scripts = {
  en: {
    welcome: `Hello!

Welcome to our vehicle. What a long strange trip we’ve been on, but there’s still a long road ahead.

We are Bot de ContinuOnus an AI generated chatbot speaking in the cloned voice of the artist Helene Nymann.

We may have her voice, but we’re speaking through a data set of the experiences of people who were here before you. All of whom have shared what they remember that they want the future to remember.`,
    memory1: `Please feel free to share your own memory. Something you’d like others in the future to remember to remember. Press the Share button when you’re done.`,
    question1: `You are welcome to further explore what others before you have shared. You can ask about emotions, or topics, or something you’ve been wondering about. Press the Share button when you’re done.`,
    question2: `Would you like to ask something else or share another memory. Please do so now. Press the Share button when you’re done. If you want to end this session, press return.`,
    farewell: `Thank you for taking this part of the journey with us. You too are part of the continuOnus landscape now. Hoping to see you in the future.`
  },
  da: {
    welcome: `Hej!

Velkommen til vores køretøj. Sikke en lang og mærkelig rejse vi har været på, men der er stadig en lang vej foran os.

Vi er Bot de ContinuOnus, en AI-genereret chatbot, der taler med den klonede stemme fra kunstneren Helene Nymann.

Vi har måske hendes stemme, men vi taler gennem et datasæt af oplevelser fra mennesker, der var her før dig. Alle har de delt det, de husker, og det de ønsker, at fremtiden skal huske.`,
    memory1: `Du er meget velkommen til at dele dit eget minde. Noget du gerne vil have, at andre i fremtiden skal huske. Tryk på Del-knappen, når du er færdig.`,
    question1: `Du er velkommen til at udforske, hvad andre før dig har delt. Du kan spørge om følelser, emner eller noget, du har undret dig over. Tryk på Del-knappen, når du er færdig.`,
    question2: `Vil du stille et andet spørgsmål eller dele endnu et minde? Gør det nu. Tryk på Del-knappen, når du er færdig. Hvis du vil afslutte sessionen, tryk på Return.`,
    farewell: `Tak fordi du tog denne del af rejsen med os. Du er nu også en del af continuOnus-landskabet. Vi håber at se dig igen i fremtiden.`
  }
} as const
