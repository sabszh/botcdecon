import { useEffect, useContext } from 'react'
import { AppContext } from '../main'

export default function () {
  const { setAppState } = useContext(AppContext)
  useEffect(() => {
    // @ts-ignore-line
    setAppState((state) => ({ ...state, headerVisible: true }))
  }, [])
  return (
    <div className='p-4 md:p-10 blurX'>
      <div className='mt-32 bg-whiteX rounded-3xl px-8 py-6 text-xl'>
        <div className='max-w-prose prose'>
          <h1 className='mb-4'>ABOUT FUTURE CONTINUONUS</h1>
          <p>In 1654 the Carte de Tendre was created by French writer Madeleine de Scrudery and her group of friends. A map of tenderness, made as an allegorical landscape of the emotions people traversed in their quest for love. In the autumn of 2023, artist Helene Nymann and core members of the Experimenting, Experiencing, Reflecting project (more about EER below) as well as psychologist Diana Ø Tørsløv Møller, created Carte De Continuonus. A map of emotions and memories that invite users to share their memories for futures to come. Asking the core questions: What do you remember, that you want the future to remember? Imagine how your memory will make the future feel?</p>
          <p>Continuonus is a linguistic blend of the words continuous and onus. By merging the two words into one, they propose that the future, being always already entangled in the past, carries with it obligations and responsibilities. The word Onus is understood in many western cultures with a negative valence, as that of having obligations that diminish one’s individual freedom and, as such, one's future. However, looking towards other cultures, freedom is not freedom from obligations and relations, but something that assumes groups, cosmos (world, spirit) and individuals as interdependent - existing because of and through relations.</p>
          <p>By inviting visitors of Carte de Continuonus to place their memories for the future, a  meshwork of collective memories give shape to a new map for future directions and movements. As contributors place their memory onto the map, they imagine how the future and others might come to feel about their memory. A new space is opened up. A space for questions and reflections about what, when and which kind of future the user attributes their memory to. By building on these collective reflections the imagining of other futures comes into play. And perhaps also actions as to what can be done today to achieve these changes.</p>

          <h2 className='mb-4'>ABOUT <em>Experimenting, Experiencing, Reflecting</em> (EER)</h2>
          <p>Experimenting, Experiencing, Reflecting (EER) is an art–science research project funded by the Carlsberg Foundation. Begun in 2019 by Olafur Eliasson and Andreas Roepstorff (professor of Cognition, Communication and Culture), EER promotes collaboration between artists and researchers from the Interacting Minds Centre at Aarhus University Denmark.</p>
          <p>EER experiments examine perception, decision-making, action, notions of togetherness, collaboration, and the transmission of knowledge across science and art. These scientific experiments are incorporated into and inform art projects and installations in museums and other public institutions.</p>
          <p>Explore EER here <a href='https://www.eer.info/'>www.eer.info</a></p>

          <h2 className='mb-4'>Credits</h2>
          <p>Artwork: Helene Nymann <br/>Concept & visuals: Helene Nymann <br/>Development: Nicolas Kort <br/>Animation: Casper Michelsen <br/>Concept support: EER core group member</p>
        </div>
      </div>
    </div>
  )
}
