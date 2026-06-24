#!/bin/bash

echo "==================================="
echo "   Starting MovieLens Backend...   "
echo "==================================="

# Check if the database exists. If not, tell the user to run the setup script.
if [ ! -f "movielens.db" ]; then
    echo "Warning: movielens.db not found!"
    echo "Please run 'python3 database.py' first to populate the database."
    exit 1
fi

# Run the API
uvicorn main:app --reload --port 3000