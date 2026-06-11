#!/usr/bin/env bash
# Apply database schema migrations to the AWS PostgreSQL cluster from Terraform state.

set -euo pipefail

usage() {
    cat <<'EOF'
Usage: ./bin/migrate-cloud-db.sh [--seed]

Apply ACME database migrations to the deployed AWS PostgreSQL database.

Options:
  --seed          Also apply database/seed/*.sql after schema migrations
  -h, --help     Show this help message

Examples:
  ./bin/migrate-cloud-db.sh
  ./bin/migrate-cloud-db.sh --seed
EOF
}

MIGRATE_ARGS=()
SEED_JSON="false"
for arg in "$@"; do
    case "$arg" in
        --seed)
            MIGRATE_ARGS+=("--seed")
            SEED_JSON="true"
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "ERROR: Unknown argument: $arg"
            usage
            exit 1
            ;;
    esac
done

command -v terraform > /dev/null 2>&1 || { echo "ERROR: 'terraform' is missing. Aborting..."; exit 1; }
command -v jq > /dev/null 2>&1 || { echo "ERROR: 'jq' is missing. Aborting..."; exit 1; }
command -v psql > /dev/null 2>&1 || { echo "ERROR: 'psql' is missing. Aborting..."; exit 1; }
command -v aws > /dev/null 2>&1 || { echo "ERROR: 'aws' is missing. Aborting..."; exit 1; }
command -v zip > /dev/null 2>&1 || { echo "ERROR: 'zip' is missing. Aborting..."; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "$0")" > /dev/null 2>&1 || exit 1; pwd -P)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." > /dev/null 2>&1 || exit 1; pwd -P)"
ENVIRONMENT_CONFIG="$PROJECT_ROOT/ENVIRONMENT.config"
INFRA_DIR="$PROJECT_ROOT/infra"

export AWS_REGION="${AWS_REGION:-us-east-1}"
export AWS_PAGER=""
export TF_IN_AUTOMATION=1

if [ -f "$ENVIRONMENT_CONFIG" ]; then
    # shellcheck disable=SC1090
    source "$ENVIRONMENT_CONFIG"
fi

echo "INFO: Reading RDS connection settings from Terraform state..."
cd "$INFRA_DIR"
TF_JSON="$(terraform show -json)"

POSTGRES_HOST="$(jq -r '.values.root_module.resources[]? | select(.address == "aws_rds_cluster.this[0]") | .values.endpoint // empty' <<< "$TF_JSON")"
POSTGRES_PORT="$(jq -r '.values.root_module.resources[]? | select(.address == "aws_rds_cluster.this[0]") | .values.port // empty' <<< "$TF_JSON")"
POSTGRES_NAME="$(jq -r '.values.root_module.resources[]? | select(.address == "aws_rds_cluster.this[0]") | .values.database_name // empty' <<< "$TF_JSON")"
POSTGRES_USER="$(jq -r '.values.root_module.resources[]? | select(.address == "aws_rds_cluster.this[0]") | .values.master_username // empty' <<< "$TF_JSON")"
POSTGRES_PASS="$(jq -r '.values.root_module.resources[]? | select(.address == "aws_rds_cluster.this[0]") | .values.master_password // empty' <<< "$TF_JSON")"

if [ -z "$POSTGRES_HOST" ] || [ -z "$POSTGRES_PORT" ] || [ -z "$POSTGRES_NAME" ] || [ -z "$POSTGRES_USER" ] || [ -z "$POSTGRES_PASS" ]; then
    echo "ERROR: Could not find AWS PostgreSQL settings in Terraform state."
    echo "INFO: Run './bin/deploy-backend.sh aws' first, then retry this migration."
    exit 1
fi

export POSTGRES_HOST POSTGRES_PORT POSTGRES_NAME POSTGRES_USER POSTGRES_PASS
export PGSSLMODE="${PGSSLMODE:-require}"
export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}"

MIGRATION_TMP=""
MIGRATION_ZIP=""
MIGRATION_FUNCTION=""

cleanup() {
    if [ -n "$MIGRATION_FUNCTION" ]; then
        aws lambda delete-function --function-name "$MIGRATION_FUNCTION" > /dev/null 2>&1 || true
    fi
    if [ -n "$MIGRATION_TMP" ]; then
        rm -rf "$MIGRATION_TMP"
    fi
    if [ -n "$MIGRATION_ZIP" ]; then
        rm -f "$MIGRATION_ZIP"
    fi
}
trap cleanup EXIT

run_direct_migration() {
    echo "INFO: Applying schema migrations to ${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_NAME}..."
    cd "$PROJECT_ROOT"
    "$PROJECT_ROOT/database/migrate.sh" "${MIGRATE_ARGS[@]}"
}

copy_python_dependency() {
    local name="$1"
    local src="$PROJECT_ROOT/backend/dashboard-service/$name"
    if [ -e "$src" ]; then
        cp -R "$src" "$MIGRATION_TMP/"
    fi
}

package_migration_lambda() {
    MIGRATION_TMP="$(mktemp -d)"
    MIGRATION_ZIP="$(mktemp --suffix=.zip)"
    rm -f "$MIGRATION_ZIP"

    cp "$PROJECT_ROOT/database/cloud_migrator.py" "$MIGRATION_TMP/function.py"
    cp -R "$PROJECT_ROOT/database/schema" "$MIGRATION_TMP/schema"
    cp -R "$PROJECT_ROOT/database/seed" "$MIGRATION_TMP/seed"

    copy_python_dependency "psycopg"
    copy_python_dependency "psycopg_binary"
    copy_python_dependency "psycopg_binary.libs"
    copy_python_dependency "typing_extensions.py"

    for dep in "$PROJECT_ROOT"/backend/dashboard-service/psycopg-*.dist-info "$PROJECT_ROOT"/backend/dashboard-service/psycopg_binary-*.dist-info; do
        if [ -e "$dep" ]; then
            cp -R "$dep" "$MIGRATION_TMP/"
        fi
    done

    (cd "$MIGRATION_TMP" && zip -qr "$MIGRATION_ZIP" .)
}

run_lambda_migration() {
    echo "INFO: Direct database connection failed; using a temporary Lambda inside the VPC..."
    cd "$INFRA_DIR"

    local dashboard_function
    dashboard_function="$(terraform output -json lambda_urls | jq -r 'keys[] | select(contains("dashboard-service"))' | head -n 1)"
    if [ -z "$dashboard_function" ]; then
        echo "ERROR: Could not find dashboard Lambda function name from Terraform outputs."
        exit 1
    fi

    local config role runtime arch subnets security_groups env_json payload_file meta_file response_file function_error
    config="$(aws lambda get-function-configuration --function-name "$dashboard_function")"
    role="$(jq -r '.Role' <<< "$config")"
    runtime="$(jq -r '.Runtime' <<< "$config")"
    arch="$(jq -r '.Architectures[0]' <<< "$config")"
    subnets="$(jq -r '.VpcConfig.SubnetIds | join(",")' <<< "$config")"
    security_groups="$(jq -r '.VpcConfig.SecurityGroupIds | join(",")' <<< "$config")"
    env_json="$(jq -c '.Environment.Variables + {PGSSLMODE: "require", PGCONNECT_TIMEOUT: "15"} | {Variables: .}' <<< "$config")"

    if [ -z "$role" ] || [ -z "$runtime" ] || [ -z "$arch" ] || [ -z "$subnets" ] || [ -z "$security_groups" ]; then
        echo "ERROR: Dashboard Lambda configuration is missing role, runtime, architecture, or VPC settings."
        exit 1
    fi

    package_migration_lambda
    MIGRATION_FUNCTION="${PROJECT_NAME:-coding-workshop}-db-migrator-${PARTICIPANT_ID:-manual}-$(date +%s)"

    aws lambda create-function \
        --function-name "$MIGRATION_FUNCTION" \
        --runtime "$runtime" \
        --handler function.handler \
        --role "$role" \
        --zip-file "fileb://$MIGRATION_ZIP" \
        --timeout 300 \
        --memory-size 256 \
        --architectures "$arch" \
        --environment "$env_json" \
        --vpc-config "SubnetIds=$subnets,SecurityGroupIds=$security_groups" \
        > /dev/null

    aws lambda wait function-active-v2 --function-name "$MIGRATION_FUNCTION"

    payload_file="$(mktemp)"
    meta_file="$(mktemp)"
    response_file="$(mktemp)"
    jq -nc --argjson seed "$SEED_JSON" '{seed: $seed}' > "$payload_file"

    aws lambda invoke \
        --function-name "$MIGRATION_FUNCTION" \
        --cli-binary-format raw-in-base64-out \
        --payload "file://$payload_file" \
        --log-type Tail \
        "$response_file" \
        > "$meta_file"

    function_error="$(jq -r '.FunctionError // empty' "$meta_file")"
    if [ -n "$function_error" ]; then
        echo "ERROR: Migration Lambda failed."
        jq -r '.LogResult // empty' "$meta_file" | base64 -d || true
        cat "$response_file"
        exit 1
    fi

    echo "INFO: Migration Lambda completed successfully."
    jq '.' "$response_file"

    rm -f "$payload_file" "$meta_file" "$response_file"
}

if run_direct_migration; then
    echo "INFO: Cloud database migration complete!"
else
    run_lambda_migration
fi
