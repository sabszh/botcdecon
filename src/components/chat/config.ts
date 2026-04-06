import type { Language } from './types'

export const INTRO_START_MAX_WAIT_MS = 1500
export const INTRO_MIN_DELAY_MS = 300
export const GENERATED_SPEECH_RATE = 0.9
export const BROWSER_TTS_RATE = Math.min(2, GENERATED_SPEECH_RATE * 1.05)

export const THANK_YOU_TEXTS: Record<Language, string> = {
  en: 'Thank you for sharing.',
  da: 'Tak for at dele din erindring.'
}

export const scripts = {
  en: {
    welcome: `Hello!\n\nThank you for being here. What a long strange trip we’ve been on, but there’s still a long road ahead.\n\nWelcome to our vehicle. We are Bot de ContinuOnus an AI generated chatbot speaking in the cloned voice of the artist Helene Nymann.\n\nWe may have her voice, but we’re speaking through a data set or rather through the experiences of thousands of people who were here before you. All of whom have shared what they remember that they want the future to remember. They have placed that memory onto a website known as continuonus. On the website a map is being cultivated.\n\nNow let's journey through that map. In here you may share something that you feel is important for the future to remember and you can ask us about what previous visitors shared?`,
    memory1: `Please share a memory? Something you’d like other's in the future to remember to remember. Press the Share button when you’re done.`,
    question1: `Now would you ask us about what others have felt it was important for the future to remember to remember? You are in their future. You can ask about emotions, or topics, or something you’ve been wondering about. Press the Share button when you’re done.`,
    question2: `Would you like to ask something else before continuing on? If you want to ask more, you can do that now; otherwise say “no”. Press the Share button when you’re done.`,
    explore: ``,
    farewell: `Thank you for taking this part of the journey with us. You too are part of the continuOnus landscape now. Hoping to see you in the future.`
  },
  da: {
    welcome: `Hej!\n\nTak fordi du er her. Sikke en lang, mærkelig rejse vi har været på, men der er stadig en lang vej foran os.\n\nVelkommen til vores køretøj. Vi er Bot de ContinuOnus, en AI‑genereret chatbot, der taler med kunstneren Helene Nymanns klonede stemme.\n\nVi har måske hendes stemme, men vi taler gennem et datasæt — eller rettere gennem erfaringerne fra tusindvis af mennesker, der var her før dig. De har alle delt det, de husker, som de ønsker, at fremtiden skal huske. De har placeret den erindring på en hjemmeside kendt som ContinuOnus. På hjemmesiden opbygges et kort.\n\nLad os nu rejse gennem det kort. Her kan du dele noget, som du føler er vigtigt for fremtiden at huske, og du kan spørge os om, hvad tidligere besøgende har delt?`,
    memory1: `Vil du dele en erindring? Noget du gerne vil have, at andre i fremtiden skal huske at huske. Tryk på Del, når du er færdig.`,
    question1: `Vil du nu spørge os om, hvad andre har følt var vigtigt for fremtiden at huske at huske? Du er i deres fremtid. Du kan spørge om følelser, emner eller noget, du har undret dig over. Tryk på Del, når du er færdig.`,
    question2: `Vil du spørge om noget mere, før vi fortsætter? Hvis du vil spørge mere, kan du gøre det nu; ellers sig “nej”. Tryk på Del, når du er færdig.`,
    explore: ``,
    farewell: `Tak fordi du tog denne del af rejsen sammen med os. Du er nu også en del af continuOnus‑landskabet. Vi håber at se dig i fremtiden.`
  }
} as const
