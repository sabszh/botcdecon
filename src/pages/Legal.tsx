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
          <p>Legal / Imprint  <br/>Studio IMA - Helene Nymann  <br/>Danasvej 42, stuen tv <br/>1910 Frederiksberg C <br/>Denmark</p>

<p>Director <br/>
Helene Nymann</p>

<p>Contact <br/>
helenenymann@gmail.com</p>

<p>&</p>

<p>Interacting Minds Centre <br/>
Aarhus University <br/>
Jens Chr. Skous Vej 4, Building 1483, 3rd floor <br/>
DK- 8000 Aarhus C</p>

<p>Director <br/>
Andreas Roepstorff</p>

<p>Contact <br/>
anetho@cas.au.dk <br/>
+45 87 16 29 07</p>

<p>The copyright for published objects developed by Studio IMA and Interacting Minds Centre, Aarhus University itself remains only with Studio IMA and Interacting Minds Centre, Aarhus University. Studio IMA and Interacting Minds Centre, Aarhus University reserves the right to use content uploaded to the website to communicate the project specifically to promote and further the project only, and only in a non-commercial context. The use or sharing of the uploaded content in other electronic or printed publications is permitted by third-party members, for all non-commercial purposes.</p>

<p>Studio IMA and Interacting Minds Centre, Aarhus University explicitly reserves the right to alter, supplement, or delete parts or the whole of the website's content, or to temporarily or completely discontinue publication without further notice.</p>

<p>Studio IMA and Interacting Minds Centre, Aarhus University has no influence whatsoever on content offered through direct or indirect links to other web providers and pages and does not endorse any of this content – with the exception of the content on social media profiles administered by Studio IMA.</p>

<h2>Data collections & management</h2>
<p>This is part of a research project by Aarhus University, in Denmark, in collaboration with Studio IMA. We record your statements for research purposes, and they may be shared as part of exhibitions or scientific publication only. Data will be studied by the scientists at The Interacting Minds Centre at Aarhus University in an anonymized manner, and your name and location will only be linked to your dataset if you choose to include this when submitting your statement on the website and or if sharing it on your social media channels. The website may from time to time contain links to and from third party websites. If you follow a link to one of these websites, please note that these websites are subject to their own privacy regulations and we cannot assume any responsibility or guarantee for third- party data protection conditions. Please make sure that you are aware of the applicable privacy policy before sending personal data to these websites.
We are collecting statements from users both in public, institutional and online spaces. Sculptures with QR-codes, made specifically for this project will be shown at the art institution Copenhagen Contemporary, in the public space at Ofelia Plads and the Niels Bohr Institute from the period of the 10th of May – 30th of December 2023. Other access is possible through the URL. Other physical QR codes may be placed and distributed to other places and sites in the future.</p>

<h2>Disclaimer</h2>
<p>This website is part of the art project “Future Continuonus. A project that invites people across the world to think about what they remember that they want the future to remember. Choosing a memory and placing this memory onto the emotional landscape of the website, to allow for people who come after to find and feel your memory. You may express your thoughts via this website by following the instructions of the Carte de Continuonus. On the website, you may view, and also share individual messages on your social media channels.</p>

<p>We have the right to remove, edit, limit or block access to any of your user content at any time, and we have no obligation to display or review your user content. You are free to express yourself as much as possible in creating user content, however, there is certain user content we will not allow on the website. We have to impose restrictions on certain user content which contains language which could be deemed offensive or is likely to harass, upset, embarrass, alarm or annoy any other person; is offensive, obscene, insensitive, upsetting, intended to disgust; is defamatory, discriminatory, or mean-spirited content, including references or commentary about religion, race, sexual orientation, gender, national/ethnic origin, or other targeted groups; encourages any illegal activity including, without limitation, terrorism, inciting racial hatred or the submission of which in itself constitutes committing a criminal offense. </p>
        </div>
      </div>
    </div>
  )
}
