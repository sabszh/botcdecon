import type { Texture } from 'three'
import { useTexture } from '@react-three/drei'

export default function Memories () {
  const pins = [
    {
      position: [100, 100, 2],
      imageUrl: "/knot-1.png",
    },
    {
      position: [-100, -60, 2],
      imageUrl: "/knot-1.png",
    }
  ]

  return (
    <group>
      {pins.map((pin, index) => (
        <Pin
          key={index}
          position={pin.position}
          imageUrl={pin.imageUrl}
        />
      ))}
    </group>
  )
}

// @ts-ignore-line
function Pin ({ position, imageUrl }) {
  const texture = useTexture(imageUrl) as Texture

  console.log('pin', texture)

  return (
    <sprite position={position} scale={[60, 60, 60]}>
      <spriteMaterial attach="material" map={texture} />
    </sprite>
  )
}
