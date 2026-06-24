# MovieLens Web Application - Backend

This is the FastAPI backend for the MovieLens web application assignment. It provides RESTful APIs to search movies, view ratings, add new movies, and generate personalized recommendations using Pearson Correlation.

## Directory Structure
- `main.py`: The main FastAPI application containing all endpoint logic.
- `database.py`: The script used to ingest the CSV files and normalize the SQLite database.
- `requirements.txt`: The Python dependencies required to run the server.
- `run.sh`: A startup script to easily launch the application.

## Prerequisites
Ensure you have Python 3 installed on your system. 
Install the required dependencies by running:
```bash
pip install -r requirements.txt