import { Mesh, PlaneGeometry, MeshStandardMaterial, SRGBColorSpace } from 'three'
import { useRef, useEffect, useMemo, useContext, useState } from 'react'
import { ThreeElements, useFrame, useThree } from '@react-three/fiber'
import { TextureLoader } from 'three/src/loaders/TextureLoader'
import { Html } from '@react-three/drei'
import { AppContext } from '../main'
import Pin from './Pin'

const dataEndpoint = import.meta.env.VITE_DATA_ENDPOINT || ''

export default function (props: ThreeElements['mesh']) {
  const { appState, setAppState } = useContext(AppContext)
  const mesh = useRef<Mesh>(null!)

  const useTexture = (url: string) => {
    const texture = useMemo(() => new TextureLoader().load(url), [url])
    return texture
  }

  // const texture = useTexture('/layers/final-carte.jpg') // 7936 × 8000
  // const texture = useTexture('/layers/carte-lg.jpg') // 14957 * 9656
  // const texture = useTexture('/layers/map-compressed.jpg') // 14957 * 9656
  const texture = useTexture('/layers/carte.jpg') // 14957 * 9656
  // texture.encoding = sRGBEncoding
  texture.colorSpace = SRGBColorSpace
  const geometry = useMemo(() => new PlaneGeometry(14957 / 3, 9656 / 3), [])
  const material = useMemo(() => new MeshStandardMaterial({
    map: texture,
    // metalness: 0.1
    // emissive: 0xffffff
  }), [texture])

  const labels = useMemo(() => {
    return appState.emotions
  }, [appState.emotions])
  const showLabels = useMemo(() => {
    const list = ['explore', 'pick', 'saved', 'filtered']
    return list.includes(appState.viewMode)
  }, [appState.viewMode])

  useEffect(() => {
    if (appState.emotions.length > 0) return

    fetch(`${dataEndpoint}/emotions`).then(res => res.json()).then((data) => {
      // @ts-ignore-line
      setAppState(state => ({ ...state, emotions: data }))
    })
  }, [])

  const mapClick = (e: any) => {
    if (appState.viewMode !== 'pick') return
    if (e.delta > 2) return
    if (appState.entryPoints.length >= 4) return

    // @ts-ignore-line
    setAppState((state) => ({ ...state, entryPoints: [...state.entryPoints, e.point] }))
  }

  const points = useMemo(() => appState.entryPoints, [appState.entryPoints])

  const bgtex = useTexture('/layers/white-px.jpg')
  const bggeometry = useMemo(() => new PlaneGeometry(100_000, 100_000), [])
  const bgmaterial = useMemo(() => new MeshStandardMaterial({ map: bgtex }), [bgtex])

  const picking = useMemo(() => {
    return appState.viewMode === 'pick' || appState.viewMode === 'saved'
  }, [appState.viewMode])

  const rmPin = (idx: number) => {
    // @ts-ignore-line
    setAppState((state) => ({ ...state, entryPoints: state.entryPoints.filter((_, i) => i !== idx) }))
  }

  const [mapLoaded, setMapLoaded] = useState(false)

  useEffect(() => {
    setTimeout(() => {
      setMapLoaded(true)
    }, 200)
  }, [texture])

  const { camera } = useThree()
  const [zoomLevel, setZoomLevel] = useState(camera.position.z)

  useFrame(() => {
    setZoomLevel(camera.position.z)
  })

  function calc (a: number) {
    const max = 3400
    const min = 1700
    if (a > max) {
        return 0
    } else if (a <= min) {
        return 1
    } else {
        return (max - a) / (max - min)
    }
  }

  return (
    <group>
      <mesh
        geometry={bggeometry}
        material={bgmaterial}
        position={[0, 0, -1]}
        // onPointerDown={doneZoom}
        onClick={mapClick}/>
      {mapLoaded && (<mesh
        geometry={geometry}
        material={material}
        ref={mesh}
        position={[-582, 140, 0]}
        {...props}/>
      )}
      {showLabels && labels.map((label, index) => {
        return (
          // <Label label={label} index={index} key={index}/>
          <Html
            key={index}
            position={[Number(label.x), Number(label.y), Number(label.z)]}
            center={true}
            distanceFactor={1100} // ensures scaling with map layer
            style={{
              opacity: calc(zoomLevel),
              pointerEvents: 'none',
              zIndex: 0
            }}
            className='map-label'>
            <p>{label.title}</p>
          </Html>
        )
      })}
      <group>
        {picking && points.map((point, index) => {
          return (
            <Pin
              rmPin={rmPin}
              key={index}
              idx={index}
              // opacity={1}
              position={point}
              mult={0.8}
            />
          )
        })}
      </group>
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
