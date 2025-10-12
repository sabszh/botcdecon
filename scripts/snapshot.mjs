#!/usr/bin/env node
import { promises as fs } from 'fs'
import path from 'path'

const ROOT = process.cwd()
const SNAP_DIR = path.join(ROOT, 'snapshots')
const label = (process.argv[2] || '').trim()
const ts = new Date()
  .toISOString()
  .replace(/[:.]/g, '-')
  .replace('T', '_')
  .slice(0, 19)
const snapName = label ? `${ts}_${label}` : ts
const snapPath = path.join(SNAP_DIR, snapName)

const EXCLUDES = new Set([
  'node_modules',
  '.git',
  'dist',
  '.venv',
  '.cache',
  'snapshots'
])

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true })
}

async function copyRecursive(src, dest) {
  const stat = await fs.lstat(src)
  if (stat.isSymbolicLink()) return
  if (stat.isDirectory()) {
    await ensureDir(dest)
    const entries = await fs.readdir(src)
    for (const name of entries) {
      if (EXCLUDES.has(name)) continue
      await copyRecursive(path.join(src, name), path.join(dest, name))
    }
  } else if (stat.isFile()) {
    await ensureDir(path.dirname(dest))
    await fs.copyFile(src, dest)
  }
}

async function main() {
  await ensureDir(SNAP_DIR)
  await ensureDir(snapPath)
  const entries = await fs.readdir(ROOT)
  for (const name of entries) {
    if (EXCLUDES.has(name)) continue
    await copyRecursive(path.join(ROOT, name), path.join(snapPath, name))
  }
  console.log(`Snapshot created at: ${path.relative(ROOT, snapPath)}`)
}

main().catch((err) => {
  console.error('Snapshot failed:', err)
  process.exit(1)
})

