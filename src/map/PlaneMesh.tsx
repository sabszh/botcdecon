import { Mesh, PlaneGeometry, MeshStandardMaterial, SRGBColorSpace } from 'three'
import { useRef, useMemo, useState, useEffect } from 'react'
import type { ThreeElements } from '@react-three/fiber'
import { TextureLoader } from 'three/src/loaders/TextureLoader'

// Background-only plane: just render the large map with a neutral backdrop.
export default function (props: ThreeElements['mesh']) {
  const mesh = useRef<Mesh>(null!)

  const useTexture = (url: string) => useMemo(() => new TextureLoader().load(url), [url])

  const texture = useTexture('/layers/carte.jpg')
  texture.colorSpace = SRGBColorSpace
  const geometry = useMemo(() => new PlaneGeometry(14957 / 3, 9656 / 3), [])
  const material = useMemo(() => new MeshStandardMaterial({ map: texture }), [texture])

  const bgtex = useTexture('/layers/white-px.jpg')
  const bggeometry = useMemo(() => new PlaneGeometry(100_000, 100_000), [])
  const bgmaterial = useMemo(() => new MeshStandardMaterial({ map: bgtex }), [bgtex])

  const [mapLoaded, setMapLoaded] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setMapLoaded(true), 200)
    return () => clearTimeout(t)
  }, [texture])

  return (
    <group>
      <mesh geometry={bggeometry} material={bgmaterial} position={[0, 0, -1]} />
      {mapLoaded && (
        <mesh
          geometry={geometry}
          material={material}
          ref={mesh}
          position={[-582, 140, 0]}
          {...props}
        />
      )}
    </group>
  )
}

// function Label ({ label, index }) {
//   const padding = 0.2

//   // Use a ref to access the text bounding box
//   const textRef = useRef()

//   // This function returns the size of the background mesh based on the text size
//   const calculateBackgroundSize = () => {
//     if (!textRef.current) return [0, 0]

//     console.log('calc size', textRef.current)

//     const { min, max } = textRef.current.geometry.boundingBox
//     const width = (max.x - min.x) + padding * 2
//     const height = (max.y - min.y) + padding * 2

//     return [width, height]
//   };

//   const backgroundSize = useMemo(calculateBackgroundSize, [textRef.current])

//   return (
//     <Html
//       key={index}
//       position={[Number(label.x), Number(label.y), Number(label.z)]}
//       center={true}
//       distanceFactor={900} // ensures scaling with map layer
//       transform // fixes to plane
//       className='map-label'
//       >
//       <p>{label.title}</p>
//     </Html>
//     // <group key={index}>
//     //   <Plane args={backgroundSize} position={[0, 0, 1]} receiveShadow>
//     //     <meshBasicMaterial color="white" />
//     //   </Plane>
//     //   <Text
//     //     ref={textRef}
//     //     position={[Number(label.x), Number(label.y), Number(label.z)]}
//     //     // font='/fonts/Trattatello.woff'
//     //     font='/fonts/Lars-Medium.woff'
//     //     // font='/fonts/perpetua-webfont.woff'
//     //     // font='/fonts/perpetua_italic-webfont.woff'
//     //     outlineBlur={5}
//     //     outlineColor={0xffffff}
//     //     outlineWidth={2}
//     //     outlineOpacity={0.4}
//     //     fontSize={23}
//     //     fillOpacity={1}
//     //     color={0x000000}>
//     //     {label.title}
//     //   </Text>
//     // </group>
//   )
// }
