# Plants vs. Zombies Console Clone

This project is a small C++ console reimagining of Plants vs. Zombies.
It focuses on the core loop:

- collect sun
- plant defenders
- stop zombie waves
- survive until the final turn and clear the field

## Features

- 5 lanes and 9 planting columns
- Sunflower, Peashooter, Wall-nut, Ice Pea, and Cherry Bomb
- Basic, Conehead, Buckethead, and Runner zombies
- turn-based gameplay with a live ASCII board
- no external libraries required

## Controls

All coordinates are 1-based.

- `plant <type> <row> <col>`
- `remove <row> <col>`
- `next`
- `help`
- `quit`

Plant types:

- `sunflower` or `sf`
- `peashooter` or `pea`
- `wallnut` or `wall`
- `icepea` or `ice`
- `cherrybomb` or `bomb`

Example:

```text
plant sf 2 2
plant pea 2 4
next
```

## Build

### MSVC

Open a Visual Studio Developer Command Prompt, then run:

```powershell
cl /std:c++17 /EHsc /W4 /nologo src\main.cpp /Fe:pvz_console.exe
```

### g++

```powershell
g++ -std=c++17 -O2 -Wall -Wextra -pedantic src/main.cpp -o pvz_console
```

### CMake

```powershell
cmake -S . -B build
cmake --build build --config Release
```

## Win Condition

Survive for 20 turns. After the last scheduled wave, clear the remaining
zombies to win.
