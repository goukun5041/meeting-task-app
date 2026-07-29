import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const netlifyCli = resolve('node_modules/netlify-cli/bin/run.js')
const child = spawn(process.execPath, [netlifyCli, 'dev'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    CHOKIDAR_USEPOLLING: process.env.CHOKIDAR_USEPOLLING ?? 'true',
    CHOKIDAR_INTERVAL: process.env.CHOKIDAR_INTERVAL ?? '300',
  },
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}

child.on('error', (error) => {
  console.error('netlify_dev_start_error', error.message)
  process.exitCode = 1
})

child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0)
})
