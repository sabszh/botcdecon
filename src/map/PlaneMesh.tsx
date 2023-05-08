import { Mesh, PlaneGeometry, MeshStandardMaterial, sRGBEncoding } from 'three'
import { useRef, useEffect, useMemo, useContext, useState } from 'react'
import { ThreeElements } from '@react-three/fiber'
import { TextureLoader } from 'three/src/loaders/TextureLoader'
import { Text, Html } from '@react-three/drei'
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
  const texture = useTexture('/layers/map-compressed.jpg') // 14957 * 9656
  texture.encoding = sRGBEncoding
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
    // console.log(e.point)
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
          // <Html
          //   key={index}
          //   position={[Number(label.x), Number(label.y), Number(label.z)]}
          //   center={true}
          //   distanceFactor={900} // ensures scaling with map layer
          //   transform // fixes to plane
          //   className='map-label'
          //   >
          //   <p>{label.title}</p>
          // </Html>
          <group>
            {/* <mesh position={[Number(label.x), Number(label.y), Number(label.z)]} scale={10}>
              <bufferGeometry attach="geometry" />
              <meshStandardMaterial attach="material" color="white" />
            </mesh> */}
            <Text
              key={index}
              position={[Number(label.x), Number(label.y), Number(label.z)]}
              // font='/fonts/Trattatello.woff'
              font='/fonts/Lars-Medium.woff'
              // font='/fonts/perpetua-webfont.woff'
              // font='/fonts/perpetua_italic-webfont.woff'
              outlineBlur={5}
              outlineColor={0xffffff}
              outlineWidth={2}
              outlineOpacity={0.4}
              fontSize={23}
              fillOpacity={1}
              color={0x000000}>
              {label.title}
            </Text>
          </group>
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
