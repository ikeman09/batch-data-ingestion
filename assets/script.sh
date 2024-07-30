#!/bin/bash

# Database connection parameters
DB_NAME="postgres"            
DB_USER="postgres"                 
DB_PASSWORD="enter-password"
DB_HOST="enter-host"
DB_PORT="5432"

# Get the directory where the script is located
SCRIPT_DIR=$(dirname "$0")

# Export password to environment variable for psql
export PGPASSWORD=$DB_PASSWORD

# Function to execute SQL file
execute_sql_file() {
    local file_path=$1
    if [[ -f $file_path ]]; then
        psql -h $DB_HOST -U $DB_USER -d $DB_NAME -p $DB_PORT -f $file_path
        echo "Executed $file_path successfully"
    else
        echo "Error: $file_path does not exist"
        exit 1
    fi
}

# Execute SQL files
execute_sql_file "$SCRIPT_DIR/sample.sql"

echo "Data loaded successfully"
