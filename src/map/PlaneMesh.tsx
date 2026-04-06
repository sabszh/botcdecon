import { Mesh, PlaneGeometry, MeshStandardMaterial, SRGBColorSpace } from 'three'
import { useRef, useMemo, useState, useEffect } from 'react'
import type { ThreeElements } from '@react-three/fiber'
import { TextureLoader } from 'three'

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
