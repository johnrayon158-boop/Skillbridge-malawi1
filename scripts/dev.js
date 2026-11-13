import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const vitePath = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js')
const processes = [
  spawn(process.execPath, [vitePath, ...process.argv.slice(2)], {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
  }),
  spawn(process.execPath, [path.join(projectRoot, 'server', 'index.js')], {
    cwd: projectRoot,
    env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'development' },
    stdio: 'inherit',
  }),
]

let shuttingDown = false

function stopProcesses(exitCode) {
  if (shuttingDown) return
  shuttingDown = true
  process.exitCode = exitCode
  for (const child of processes) {
    if (child.exitCode === null && child.signalCode === null) child.kill()
  }
}

for (const child of processes) {
  child.on('error', (error) => {
    console.error(`Unable to start development service: ${error.message}`)
    stopProcesses(1)
  })
  child.on('exit', (code, signal) => {
    if (!shuttingDown) {
      const exitCode = code ?? (signal ? 1 : 0)
      stopProcesses(exitCode)
    }
  })
}

process.on('SIGINT', () => stopProcesses(0))
process.on('SIGTERM', () => stopProcesses(0))
