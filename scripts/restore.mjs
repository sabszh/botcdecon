#!/usr/bin/env node
import { promises as fs } from 'fs'
import path from 'path'

const ROOT = process.cwd()
const SNAP_DIR = path.join(ROOT, 'snapshots')
const targetName = (process.argv[2] || 'latest').trim()

const EXCLUDES = new Set([
  'node_modules',
  '.git',
  'dist',
  '.venv',
  '.cache',
  'snapshots'
])

async function listSnapshots() {
  const exist = await fs.stat(SNAP_DIR).catch(() => null)
  if (!exist) return []
  const entries = await fs.readdir(SNAP_DIR)
  const stats = await Promise.all(entries.map(async (e) => ({
    name: e,
    path: path.join(SNAP_DIR, e),
    stat: await fs.stat(path.join(SNAP_DIR, e)).catch(() => null)
  })))
  return stats
    .filter(x => x.stat && x.stat.isDirectory())
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
}

async function copyRecursive(src, dest) {
  const stat = await fs.lstat(src)
  if (stat.isSymbolicLink()) return
  if (stat.isDirectory()) {
    await fs.mkdir(dest, { recursive: true })
    const entries = await fs.readdir(src)
    for (const name of entries) {
      await copyRecursive(path.join(src, name), path.join(dest, name))
    }
  } else if (stat.isFile()) {
    await fs.mkdir(path.dirname(dest), { recursive: true })
    await fs.copyFile(src, dest)
  }
}

async function main() {
  const snaps = await listSnapshots()
  if (snaps.length === 0) {
    console.error('No snapshots found in snapshots/')
    process.exit(1)
  }

  let snap
  if (targetName === 'latest') {
    snap = snaps[0]
  } else {
    snap = snaps.find(s => s.name === targetName)
    if (!snap) {
      console.error(`Snapshot not found: ${targetName}`)
      process.exit(1)
    }
  }

  console.log(`Restoring from snapshot: ${snap.name}`)

  const entries = await fs.readdir(snap.path)
  for (const name of entries) {
    if (EXCLUDES.has(name)) continue
    await copyRecursive(path.join(snap.path, name), path.join(ROOT, name))
  }
  console.log('Restore complete.')
}

main().catch((err) => {
  console.error('Restore failed:', err)
  process.exit(1)
})

