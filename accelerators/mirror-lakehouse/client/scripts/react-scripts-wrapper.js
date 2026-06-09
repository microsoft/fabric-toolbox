const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

const parseDotEnv = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return {}
  }

  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split(/\r?\n/)
  const values = {}

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }

    const key = trimmed.slice(0, separatorIndex).trim()
    let value = trimmed.slice(separatorIndex + 1).trim()

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    values[key] = value
  }

  return values
}

const command = process.argv[2]
const args = process.argv.slice(3)

if (!command) {
  console.error('Missing react-scripts command. Usage: node scripts/react-scripts-wrapper.js <start|build|test|eject>')
  process.exit(1)
}

const rootEnvPath = path.resolve(__dirname, '../../.env')
const rootEnv = parseDotEnv(rootEnvPath)

if (!process.env.REACT_APP_CLIENT_ID && rootEnv.CLIENT_ID) {
  process.env.REACT_APP_CLIENT_ID = rootEnv.CLIENT_ID
}

if (!process.env.REACT_APP_TENANT_ID && rootEnv.TENANT_ID) {
  process.env.REACT_APP_TENANT_ID = rootEnv.TENANT_ID
}

if (!process.env.REACT_APP_AUTHORITY && rootEnv.AUTHORITY) {
  process.env.REACT_APP_AUTHORITY = rootEnv.AUTHORITY
}

if (!process.env.REACT_APP_REDIRECT_URI && rootEnv.REDIRECT_URI) {
  process.env.REACT_APP_REDIRECT_URI = rootEnv.REDIRECT_URI
}

if (!process.env.REACT_APP_API_URL) {
  const apiPort = rootEnv.PORT || '3001'
  process.env.REACT_APP_API_URL = `http://localhost:${apiPort}/api`
}

if (!process.env.REACT_APP_CLIENT_ID) {
  console.warn('REACT_APP_CLIENT_ID is not set. Login may fail until CLIENT_ID or REACT_APP_CLIENT_ID is configured.')
}

const reactScriptsPath = require.resolve('react-scripts/bin/react-scripts.js')
const child = spawn(process.execPath, [reactScriptsPath, command, ...args], {
  stdio: 'inherit',
  env: process.env
})

child.on('close', (code) => {
  process.exit(code ?? 0)
})
