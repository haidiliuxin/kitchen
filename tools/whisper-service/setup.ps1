$ErrorActionPreference = 'Stop'

$serviceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvDir = Join-Path $serviceDir ".venv"
$knownPythonCandidates = @(
  "C:\Users\lenovo\AppData\Local\Programs\Python\Python312\python.exe",
  "C:\Users\lenovo\AppData\Local\Programs\Python\Python310\python.exe",
  "C:\Program Files\MySQL\MySQL Workbench 8.0\python.exe",
  "C:\Program Files\MySQL\MySQL Workbench 8.0\swb\shell\lib\Python3.13\python.exe"
)

if (-not (Test-Path $venvDir)) {
  $created = $false

  foreach ($knownPython in $knownPythonCandidates) {
    if (-not (Test-Path $knownPython)) {
      continue
    }

    try {
      & $knownPython -m venv $venvDir
      $created = $true
      break
    } catch {
    }
  }

  if (-not $created) {
    try {
      & py -3.10 -m venv $venvDir
      $created = $true
    } catch {
      try {
        & python -m venv $venvDir
        $created = $true
      } catch {
      }
    }
  }

  if (-not $created) {
    throw "Python 3.10+ is required to set up the Whisper service."
  }
}

$venvPython = Join-Path $venvDir "Scripts\\python.exe"

if (-not (Test-Path $venvPython)) {
  throw "Virtual environment creation failed: .venv\\Scripts\\python.exe was not found."
}

& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install -r (Join-Path $serviceDir "requirements.txt")

Write-Host "Whisper service dependencies are installed."
