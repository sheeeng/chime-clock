#!/usr/bin/env bash

# https://www.gnu.org/software/bash/manual/html_node/The-Set-Builtin.html
set -o pipefail # If set, the return value of a pipeline is the value of the last (rightmost) command to exit with a non-zero status, or zero if all commands in the pipeline exit successfully. This option is disabled by default.
set -o errexit  # set -e # Exit immediately if a pipeline, which may consist of a single simple command, a list, or a compound command returns a non-zero status.
set -o nounset  # set -u # Treat unset variables and parameters other than the special parameters ‘@’ or ‘*’, or array variables subscripted with ‘@’ or ‘*’, as an error when performing parameter expansion. An error message will be written to the standard error, and a non-interactive shell will exit.
# set -o xtrace  # set -x # Print a trace of simple commands, for commands, case commands, select commands, and arithmetic for commands and their arguments or associated word lists after they are expanded and before they are executed. The value of the PS4 variable is expanded and the resultant value is printed before the command and its expanded arguments.

# https://www.gnu.org/software/bash/manual/html_node/The-Shopt-Builtin.html
shopt -s inherit_errexit # If set, command substitution inherits the value of the errexit option, instead of unsetting it in the subshell environment. This option is enabled when POSIX mode is enabled.

if [ -d ".git" ] || git rev-parse --git-dir > /dev/null 2>&1; then
  GIT_ROOT_DIRECTORY=$(git rev-parse --show-toplevel)
  echo "\${GIT_ROOT_DIRECTORY}: ${GIT_ROOT_DIRECTORY}"
fi
SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" > /dev/null 2>&1 && pwd)"
echo "\${SCRIPT_DIRECTORY}: ${SCRIPT_DIRECTORY}"

# ----------------------------------------------------------------------

# https://stackoverflow.com/a/31397073
# mktemp --directory "${TMPDIR:-/tmp}/zombie.XXXXXXXXX"
TEMPORARY_DIRECTORY="$(mktemp --directory --tmpdir="${PWD}")"
echo "\${TEMPORARY_DIRECTORY}: ${TEMPORARY_DIRECTORY}"


readonly PROJECT_ID="chime-clock"
readonly REPOSITORY="sheeeng/chime-clock"
REPOSITORY_ID="$(gh api "repos/${REPOSITORY}" --jq '.id')"
readonly REPOSITORY_ID
readonly SERVICE_ACCOUNT="github-action-${REPOSITORY_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
KEY_FILE="$(mktemp)"
readonly KEY_FILE

cleanup() {
  rm --force --verbose "${KEY_FILE}"

  rm \
    --recursive \
    --verbose \
    "${TEMPORARY_DIRECTORY}"
}

trap cleanup EXIT

pushd "${SCRIPT_DIRECTORY}"
date --universal +"%Y%m%dT%H%M%SZ"

gh secret set FIREBASE_PROJECT_ID \
  --env firebase \
  --repo "${REPOSITORY}" \
  --body "${PROJECT_ID}"

gcloud config set project "${PROJECT_ID}"

USER_MANAGED_KEY_NAMES="$(
  gcloud iam service-accounts keys list \
    --iam-account "${SERVICE_ACCOUNT}" \
    --managed-by user \
    --project "${PROJECT_ID}" \
    --format 'value(name)'
)"
readonly USER_MANAGED_KEY_NAMES

while IFS= read -r USER_MANAGED_KEY_NAME; do
  if [ -n "${USER_MANAGED_KEY_NAME}" ]; then
    gcloud iam service-accounts keys delete "${USER_MANAGED_KEY_NAME##*/}" \
      --iam-account "${SERVICE_ACCOUNT}" \
      --project "${PROJECT_ID}" \
      --quiet
  fi
done <<< "${USER_MANAGED_KEY_NAMES}"

gcloud iam service-accounts keys create "${KEY_FILE}" \
  --iam-account "${SERVICE_ACCOUNT}" \
  --project "${PROJECT_ID}"

gh secret set FIREBASE_SERVICE_ACCOUNT \
  --env firebase \
  --repo "${REPOSITORY}" \
  < "${KEY_FILE}"

gh secret list \
  --env firebase \
  --repo "${REPOSITORY}"

popd || exit
