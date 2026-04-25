$ErrorActionPreference = 'Stop'

$serviceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvPython = Join-Path $serviceDir '.venv\Scripts\python.exe'

if (-not (Test-Path $venvPython)) {
  throw 'Whisper service is not installed yet. Run npm run whisper:setup first.'
}

$env:PYTHONIOENCODING = 'utf-8'

& $venvPython -m uvicorn app:app --host 127.0.0.1 --port 8790 --app-dir $serviceDir
