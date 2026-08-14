#!/usr/bin/env bash

# https://www.gnu.org/software/bash/manual/html_node/The-Set-Builtin.html
set -o errexit
set -o nounset
set -o pipefail

# https://www.gnu.org/software/bash/manual/html_node/The-Shopt-Builtin.html
shopt -s inherit_errexit

readonly GITHUB_ENVIRONMENT="vercel"
readonly REPOSITORY="sheeeng/chime-clock"

GIT_ROOT_DIRECTORY="$(git rev-parse --show-toplevel)"
readonly GIT_ROOT_DIRECTORY

run_silently() {
  local command_output

  if ! command_output="$("$@" 2>&1)"; then
    printf '%s\n' "${command_output}" >&2
    return 1
  fi
}

cd "${GIT_ROOT_DIRECTORY}"

run_silently gh api \
  --method PUT \
  "repos/${REPOSITORY}/environments/${GITHUB_ENVIRONMENT}"
printf 'Created or updated the %s GitHub environment for the %s repository.\n' "${GITHUB_ENVIRONMENT}" "${REPOSITORY}"

run_silently vercel link \
  --yes

readonly VERCEL_PROJECT_CONFIGURATION_FILE="${GIT_ROOT_DIRECTORY}/.vercel/project.json"
readonly VERCEL_REPOSITORY_CONFIGURATION_FILE="${GIT_ROOT_DIRECTORY}/.vercel/repo.json"

if [ -f "${VERCEL_REPOSITORY_CONFIGURATION_FILE}" ]; then
  VERCEL_PROJECT_QUERY='.projects[] | select(.directory == ".")'
  VERCEL_PROJECT_SOURCE_FILE="${VERCEL_REPOSITORY_CONFIGURATION_FILE}"
elif [ -f "${VERCEL_PROJECT_CONFIGURATION_FILE}" ]; then
  VERCEL_PROJECT_QUERY='.'
  VERCEL_PROJECT_SOURCE_FILE="${VERCEL_PROJECT_CONFIGURATION_FILE}"
else
  printf 'Vercel did not create a project link in %s. Run vercel login, and then run this script again.\n' \
    "${GIT_ROOT_DIRECTORY}/.vercel" >&2
  exit 1
fi
readonly VERCEL_PROJECT_QUERY
readonly VERCEL_PROJECT_SOURCE_FILE

printf 'Linked the Vercel project for the %s repository.\n' "${REPOSITORY}"

VERCEL_ORGANIZATION_ID="$(
  jq \
    --exit-status \
    --raw-output \
    "${VERCEL_PROJECT_QUERY} | .orgId | select(type == \"string\" and length > 0)" \
    "${VERCEL_PROJECT_SOURCE_FILE}"
)"
readonly VERCEL_ORGANIZATION_ID

VERCEL_PROJECT_ID="$(
  jq \
    --exit-status \
    --raw-output \
    "${VERCEL_PROJECT_QUERY} | .id // .projectId | select(type == \"string\" and length > 0)" \
    "${VERCEL_PROJECT_SOURCE_FILE}"
)"
readonly VERCEL_PROJECT_ID

if [ -z "${VERCEL_TOKEN:-}" ]; then
  read -r -s -p 'Enter the Vercel access token for GitHub Actions: ' VERCEL_TOKEN
  printf '\n'
fi

if [ -z "${VERCEL_TOKEN}" ]; then
  printf 'The Vercel access token for GitHub Actions is required.\n' >&2
  exit 1
fi
readonly VERCEL_TOKEN

printf '%s' "${VERCEL_ORGANIZATION_ID}" \
  | run_silently gh secret set VERCEL_ORG_ID \
    --env "${GITHUB_ENVIRONMENT}" \
    --repo "${REPOSITORY}"
printf 'Set the VERCEL_ORG_ID GitHub Actions secret for the %s repository.\n' "${REPOSITORY}"

printf '%s' "${VERCEL_PROJECT_ID}" \
  | run_silently gh secret set VERCEL_PROJECT_ID \
    --env "${GITHUB_ENVIRONMENT}" \
    --repo "${REPOSITORY}"
printf 'Set the VERCEL_PROJECT_ID GitHub Actions secret for the %s repository.\n' "${REPOSITORY}"

printf '%s' "${VERCEL_TOKEN}" \
  | run_silently gh secret set VERCEL_TOKEN \
    --env "${GITHUB_ENVIRONMENT}" \
    --repo "${REPOSITORY}"
printf 'Set the VERCEL_TOKEN GitHub Actions secret for the %s repository.\n' "${REPOSITORY}"

gh secret list \
  --env "${GITHUB_ENVIRONMENT}" \
  --repo "${REPOSITORY}"
