import type { Vector3 } from '@react-three/fiber'

import { Mesh, PlaneGeometry, MeshStandardMaterial } from 'three'
import { useRef, useMemo } from 'react'
import { ThreeElements } from '@react-three/fiber'
import { TextureLoader } from 'three/src/loaders/TextureLoader'
import { Html, Text } from '@react-three/drei'

export default function (props: ThreeElements['mesh']) {
  const mesh = useRef<Mesh>(null!)

  const useTexture = (url: string) => {
    const texture = useMemo(() => new TextureLoader().load(url), [url])
    return texture
  }

  // const texture = useTexture('/layers/Carte_du_tendre.jpg') // 2400 x 1721
  const texture = useTexture('/layers/carte-extended.jpg') // 4032  ×  3264
  const geometry = useMemo(() => new PlaneGeometry(2400, 1721), [])
  // const geometry = useMemo(() => new PlaneGeometry(4032, 2364), [])
  const material = useMemo(() => new MeshStandardMaterial({ map: texture }), [texture])

  // const onWheel = (e: ThreeEvent<WheelEvent>) => {
  //   console.log(e.distance)
  // }

  type Label = {
    name: string
    position: Vector3
  }
  const labels: Label[] = [
    { name: 'Boredom', position: [-240, 700, 30] },
    { name: 'Care', position: [340, 660, 10] },
    { name: 'Tenderness', position: [-500, 600, 22] },
    { name: 'Envy', position: [600, 600, 12] },
    { name: 'Disgust', position: [-100, 560, 10] },
    { name: 'Guilt', position: [-740, 420, 14] },
    { name: 'Playfulness', position: [660, 370, 15] },
    { name: 'Surprise', position: [-300, 290, 12] },
    { name: 'Empathy', position: [200, 280, 22] },
    { name: 'Hope', position: [-600, 240, 19] },
    { name: 'Sadness', position: [40, 190, 11] },
    { name: 'Panic', position: [400, 170, 9] },
    { name: 'Anger', position: [-334, 70, 4] },
    { name: 'Joy', position: [180, 150, 12] },
    { name: 'Love', position: [10, -70, 19] },
    { name: 'Peaceful', position: [560, -130, 13] },
    { name: 'Grief', position: [-620, -250, 8] },
    { name: 'Fear', position: [200, -370, 14] },
    { name: 'Indifference', position: [520, -470, 9] },
    { name: 'Trust', position: [-410, -410, 20] },
  ]

  return (
    <mesh
      geometry={geometry}
      material={material}
      ref={mesh}
      position={[0, 0, 0]}
      // onWheel={onWheel}
      {...props}>
        {labels.map((label, index) => {
          return (
            // <Html
            //   key={index}
            //   position={label.position}
            //   center={true}
            //   distanceFactor={900} // ensures scaling with map layer
            //   transform // fixes to plane
            //   className='map-label'
            //   >
            //   <p>{label.name}</p>
            // </Html>
            <Text
              key={index}
              position={label.position}
              font='/fonts/Lars-Regular.woff'
              fontSize={22}
              color='black'
              >
                {label.name}
            </Text>
          )
        })}
      </mesh>
  )
}
