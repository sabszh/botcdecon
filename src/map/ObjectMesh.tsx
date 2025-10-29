export default function (props: ThreeElements['mesh'] & { onObjLoaded: () => void }) {
  const { nodes, materials } = useGLTF(gltfSrc) as any
  const hippo = useRef<Mesh>(null!)

  const matKey = 'Mat.2'

  useMemo(() => {
    if (!materials || !materials[matKey]) return
    const mat = materials[matKey]
    mat.transparent = true
    mat.opacity = 0
  }, [materials])

  useFrame((_state, delta) => {
    if (!hippo?.current) return
    if (!materials || !materials[matKey]) return   // ✅ guard inside frame loop too
    hippo.current.rotation.y += delta * 0.12
    const mat = materials[matKey]
    if (mat.opacity < 1) mat.opacity = Math.min(1, mat.opacity + 0.01)
  })

  useEffect(() => {
    if (nodes && materials) {
      props.onObjLoaded()
    }
  }, [nodes, materials])

  // ✅ Add the guard right here, before returning JSX:
  if (!nodes || !materials || !materials[matKey]) return null

  return (
    <mesh
      ref={hippo}
      geometry={nodes.Default.geometry}
      material={nodes.Default.material}
      position={[0, -50, 3600]}
      scale={13}
      frustumCulled={true}
      {...props}
    />
  )
}
