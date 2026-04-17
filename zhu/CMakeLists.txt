cmake_minimum_required(VERSION 3.16)

project(pvz_console LANGUAGES CXX)

add_executable(pvz_console
    src/main.cpp
)

target_compile_features(pvz_console PRIVATE cxx_std_17)

if (MSVC)
    target_compile_options(pvz_console PRIVATE /W4 /permissive-)
else()
    target_compile_options(pvz_console PRIVATE -Wall -Wextra -Wpedantic)
endif()
