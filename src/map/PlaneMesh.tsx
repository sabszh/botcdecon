import { Mesh, PlaneGeometry, MeshStandardMaterial, MeshBasicMaterial, Vector3 } from 'three'
import { useRef, useState, useEffect, useMemo, useContext } from 'react'
import { ThreeElements, useFrame } from '@react-three/fiber'
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
  const showLabels = useMemo(() => {
    return appState.viewMode === 'pick' || appState.viewMode === 'explore'
  }, [appState.viewMode])

  useEffect(() => {
    if (appState.emotions.length > 0) return

    fetch(`${dataEndpoint}/emotions`).then(res => res.json()).then((data) => {
      // @ts-ignore-line
      setAppState(state => ({ ...state, emotions: data }))
    })
  }, [])

  const [zooming, setZooming] = useState(false)
  const [hasZoomed, setHasZoomed] = useState(false)

  useEffect(() => {
    if (!hasZoomed && appState.viewMode === 'pick') {
      setZooming(true)
      setTimeout(() => {
        setZooming(false)
        setHasZoomed(true)
      }, 2300)
    }
  }, [appState.viewMode])

  const mapClick = (e: any) => {
    if (appState.viewMode !== 'pick') return
    if (e.delta > 2) return
    if (appState.entryPoints.length >= 3) return

    // @ts-ignore-line
    setAppState((state) => ({ ...state, entryPoints: [...state.entryPoints, e.point] }))
  }

  const points = useMemo(() => appState.entryPoints, [appState.entryPoints])

  const vec = new Vector3()
  useFrame((state) => {
    if (!zooming) return
    state.camera?.lookAt(0, 0, 0)
    state.camera?.position.lerp(vec.set(0, 0, 900), 0.018)
    state.camera?.updateProjectionMatrix()
    if (state.camera?.position.z === 900) {
      setZooming(false)
      setHasZoomed(true)
    }
  })

  const plane = new MeshBasicMaterial({ color: 0xffffff })

  return (
    <group>
      <mesh material={plane} position={[0, 0, -1]} onClick={mapClick}>
        <planeGeometry args={[100000, 100000]} />
      </mesh>

      <mesh
        geometry={geometry}
        material={material}
        ref={mesh}
        position={[0, 0, 0]}
        {...props}>
        {showLabels && labels.map((label, index) => {
          return (
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
        {appState.viewMode === 'pick' && points.map((point, index) => {
          return (
            <Text
              key={index}
              position={[point.x, point.y, 5]}
              font='/fonts/Trattatello.woff'
              outlineBlur={0.8}
              outlineColor={0x0}
              outlineWidth={0.6}
              fontSize={64}
              fillOpacity={1}
              color={0xFFC800}>*</Text>
          )
        })}
      </mesh>
    </group>
  )
}
