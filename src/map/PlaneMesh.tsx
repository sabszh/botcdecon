import { Mesh, PlaneGeometry, MeshStandardMaterial } from 'three'
import { useRef, useEffect, useMemo, useContext } from 'react'
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

  // const texture = useTexture('/layers/carte-dall-e-edits-color.jpg') // 6272 x 6400
  const texture = useTexture('/layers/final-carte.jpg') // 7936 × 8000
  // const geometry = useMemo(() => new PlaneGeometry(6272 / 2, 6400 / 2), [])
  const geometry = useMemo(() => new PlaneGeometry(7936 / 2, 8000 / 2), [])
  const material = useMemo(() => new MeshStandardMaterial({ map: texture }), [texture])

  const labels = useMemo(() => {
    return appState.emotions
  }, [appState.emotions])
  const showLabels = useMemo(() => {
    const list = ['explore', 'pick', 'saved']
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

  return (
    <group>
      <mesh
        geometry={bggeometry}
        material={bgmaterial}
        position={[0, 0, -1]}
        // onPointerDown={doneZoom}
        onClick={mapClick}/>
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
        {picking && points.map((point, index) => {
          return (
            <Text
              onClick={(e) => {
                e.stopPropagation()
                rmPin(index)
              }}
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
