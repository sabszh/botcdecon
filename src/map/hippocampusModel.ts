import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import type { GLTF } from 'three-stdlib'
import type { Group, Material } from 'three'

export const HIPPOCAMPUS_MODEL_SRC = '/models/hippocampus.optimized.glb'

type HippocampusMaterial = Material & {
  transparent: boolean
  opacity: number
}

type HippocampusGLTF = GLTF & {
  nodes: {
    Default?: Group
  }
  materials: Record<string, HippocampusMaterial>
}

const MATERIAL_KEY = 'Mat.2'

export function useHippocampusModel () {
  const { nodes, materials } = useGLTF(HIPPOCAMPUS_MODEL_SRC) as unknown as HippocampusGLTF
  const model = useMemo(() => nodes.Default?.clone() ?? null, [nodes])

  useMemo(() => {
    const material = materials[MATERIAL_KEY]
    if (!material) return
    material.transparent = true
    material.opacity = 0.92
  }, [materials])

  return {
    model,
    ready: Boolean(model && materials[MATERIAL_KEY])
  }
}

useGLTF.preload(HIPPOCAMPUS_MODEL_SRC)
