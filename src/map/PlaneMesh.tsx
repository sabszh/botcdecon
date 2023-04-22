import { Mesh, PlaneGeometry, MeshStandardMaterial } from 'three'
import { useRef, useEffect, useMemo, useContext, Suspense } from 'react'
import { ThreeElements } from '@react-three/fiber'
import { TextureLoader } from 'three/src/loaders/TextureLoader'
import { Text } from '@react-three/drei'
import { AppContext } from '../main'

const dataEndpoint = import.meta.env.VITE_DATA_ENDPOINT || ''

export default function (props: ThreeElements['mesh']) {
  const { appState, setAppState } = useContext(AppContext)
  const mesh = useRef<Mesh>(null!)

  const useTexture = (url: string) => {
    const texture = useMemo(() => new TextureLoader().load(url), [url])
    return texture
  }

  // const texture = useTexture('/layers/Carte_du_tendre.jpg') // 2400 x 1721
  const texture = useTexture('/layers/carte-extended.jpg') // 4032  ×  3264
  const geometry = useMemo(() => new PlaneGeometry(2400, 1721), [])
  const material = useMemo(() => new MeshStandardMaterial({ map: texture }), [texture])

  const labels = useMemo(() => {
    return appState.emotions
  }, [appState.emotions])
  const showLabels = useMemo(() => appState.viewMode !== 'empty', [appState.viewMode])

  useEffect(() => {
    if (appState.emotions.length > 0) return

    fetch(`${dataEndpoint}/emotions`).then(res => res.json()).then((data) => {
      // @ts-ignore-line
      setAppState(state => ({ ...state, emotions: data }))
    })
  }, [])

  return (
    <mesh
      geometry={geometry}
      material={material}
      ref={mesh}
      position={[0, 0, 0]}
      // onWheel={onWheel}
      {...props}>
      {showLabels && labels.map((label, index) => {
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
            position={[Number(label.x), Number(label.y), Number(label.z)]}
            font='/fonts/Trattatello.woff'
            outlineBlur={0.8}
            outlineColor={0xffffff}
            outlineWidth={0.6}
            fontSize={22}
            fillOpacity={1}
            color={0x433429}>
            {label.title}
          </Text>
        )
      })}
    </mesh>
  )
}
