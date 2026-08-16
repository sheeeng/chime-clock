# Use zsh for recipe execution.
# The `-o nounset` option fails fast on unset variables.
# The `-c` option reads the recipe command string.
set shell := ["zsh", "-o", "nounset", "-c"]

default:
  # List available recipes.
  @just --list

install:
  npm install

dev:
  npm run dev

build:
  npm run build

preview:
  npm run preview

lint:
  npm run lint

test:
  npm test

clean:
  npm run clean
