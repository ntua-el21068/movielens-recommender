import sqlite3
import csv
import os

def setup_database():
    conn = sqlite3.connect('movielens.db')
    cursor = conn.cursor()

    cursor.executescript('''
        DROP TABLE IF EXISTS tags;
        DROP TABLE IF EXISTS ratings;
        DROP TABLE IF EXISTS movies;

        CREATE TABLE movies (
            movieId INTEGER PRIMARY KEY,
            title TEXT,
            genres TEXT
        );

        CREATE TABLE ratings (
            userId INTEGER,
            movieId INTEGER,
            rating REAL,
            timestamp INTEGER
        );

        CREATE TABLE tags (
            userId INTEGER,
            movieId INTEGER,
            tag TEXT,
            timestamp INTEGER
        );
    ''')
    return conn, cursor

def load_csv(cursor, filename, table_name):
    if not os.path.exists(filename):
        print(f"Error: {filename} not found.")
        return
    with open(filename, 'r', encoding='utf-8') as file:
        reader = csv.reader(file)
        next(reader) # skip header
        if table_name == 'movies':
            cursor.executemany("INSERT INTO movies (movieId, title, genres) VALUES (?, ?, ?)", reader)
        elif table_name == 'ratings':
            cursor.executemany("INSERT INTO ratings (userId, movieId, rating, timestamp) VALUES (?, ?, ?, ?)", reader)
        elif table_name == 'tags':
            cursor.executemany("INSERT INTO tags (userId, movieId, tag, timestamp) VALUES (?, ?, ?, ?)", reader)

if __name__ == '__main__':
    conn, cursor = setup_database()
    load_csv(cursor, 'ml-latest-small/movies.csv', 'movies')
    load_csv(cursor, 'ml-latest-small/ratings.csv', 'ratings')
    load_csv(cursor, 'ml-latest-small/tags.csv', 'tags')
    conn.commit()
    conn.close()
    print("Database built according to assignment specs (3 tables).")