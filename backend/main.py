from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import sqlite3
import math

DB_NAME = "movielens.db"
BASE_PATH = "/movielens/api"

app = FastAPI(title="MovieLens API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

class MovieCreate(BaseModel):
    title: str
    genres: str

class UserRating(BaseModel):
    movieId: int
    rating: float

class RecommendationRequest(BaseModel):
    ratings: list[UserRating]

# ----------
class TagSearchRequest(BaseModel):
    search: str
# ----------



# ==================================
# 1. SEARCH MOVIES
# ==================================
@app.get(f"{BASE_PATH}/movies")
def search_movies(search: str = ""):
    conn = get_db_connection()
    
    movies = conn.execute(
        """
        SELECT 
            m.movieId, 
            m.title, 
            m.genres, 
            AVG(r.rating) as avgRating,
            COUNT(r.rating) as ratingCount
        FROM movies m
        LEFT JOIN ratings r ON m.movieId = r.movieId
        WHERE LOWER(m.title) LIKE LOWER(?)
        GROUP BY m.movieId
        ORDER BY m.title
        """,
        (f"%{search}%",)
    ).fetchall()
    
    conn.close()
    
    return {
        "status": "success",
        "movies": [
            {
                "movieId": row["movieId"],
                "title": row["title"],
                "genres": row["genres"] if row["genres"] else "",
                "avgRating": round(row["avgRating"], 2) if row["avgRating"] else 0,
                "ratingCount": row["ratingCount"]
            }
            for row in movies
        ]
    }

# ==================================
# 2. GET RATINGS FOR A MOVIE
# ==================================
@app.get(f"{BASE_PATH}/ratings/{{movieId}}")
def get_movie_ratings(movieId: int):
    conn = get_db_connection()
    ratings = conn.execute(
        "SELECT userId, rating, timestamp FROM ratings WHERE movieId = ?", 
        (movieId,)
    ).fetchall()
    conn.close()
    
    return {
        "status": "success",
        "ratings": [dict(row) for row in ratings]
    }

# ==================================
# 3. ADD MOVIE
# ==================================
@app.post(f"{BASE_PATH}/movies")
def add_movie(movie: MovieCreate):
    if not movie.title.strip():
        raise HTTPException(status_code=400, detail="Title empty")
    if not movie.genres.strip():
        raise HTTPException(status_code=400, detail="Genres empty")
        
    conn = get_db_connection()
    
    try:
        conn.execute("BEGIN TRANSACTION;")
        
        row = conn.execute("SELECT MAX(movieId) as max_id FROM movies").fetchone()
        new_movie_id = (row["max_id"] or 0) + 1
        
        conn.execute(
            "INSERT INTO movies (movieId, title, genres) VALUES (?, ?, ?)", 
            (new_movie_id, movie.title, movie.genres)
        )
        
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
        
    return {
        "status": "success",
        "movieId": new_movie_id
    }

# ==================================
# PEARSON SIMILARITY
# ==================================
def pearson_similarity(user_ratings, other_ratings):
    common_movies = set(user_ratings.keys()) & set(other_ratings.keys())
    if len(common_movies) < 2: return 0
    
    u_values = [user_ratings[m] for m in common_movies]
    v_values = [other_ratings[m] for m in common_movies]
    
    u_mean = sum(u_values) / len(u_values)
    v_mean = sum(v_values) / len(v_values)
    
    numerator = sum((user_ratings[m] - u_mean) * (other_ratings[m] - v_mean) for m in common_movies)
    u_den = math.sqrt(sum((user_ratings[m] - u_mean)**2 for m in common_movies))
    v_den = math.sqrt(sum((other_ratings[m] - v_mean)**2 for m in common_movies))
    
    if u_den == 0 or v_den == 0: return 0
    return numerator / (u_den * v_den)

# ==================================
# 4. RECOMMENDATIONS
# ==================================
@app.post(f"{BASE_PATH}/recommendations")
def get_recommendations(request: RecommendationRequest):
    user_ratings = {r.movieId: r.rating for r in request.ratings}
    if not user_ratings:
        raise HTTPException(status_code=400, detail="No ratings")
        
    conn = get_db_connection()
    rows = conn.execute("SELECT userId, movieId, rating FROM ratings").fetchall()
    
    all_users = {}
    for row in rows:
        uid, mid, rating = row["userId"], row["movieId"], row["rating"]
        if uid not in all_users: all_users[uid] = {}
        all_users[uid][mid] = rating

    similarities = []
    for uid, ratings in all_users.items():
        sim = pearson_similarity(user_ratings, ratings)
        if sim > 0: similarities.append((uid, sim))
            
    similarities.sort(key=lambda x: x[1], reverse=True)
    K = 20
    N = 10
    top_users = similarities[:K]
    
    if not top_users:
        conn.close()
        return {"status": "success", "recommendations": []}
        
    user_mean = sum(user_ratings.values()) / len(user_ratings)
    predictions = {}
    
    for movieId in set(mid for uid, _ in top_users for mid in all_users[uid] if mid not in user_ratings):
        numerator = 0
        denominator = 0
        for uid, sim in top_users:
            ratings = all_users[uid]
            if movieId in ratings:
                other_mean = sum(ratings.values()) / len(ratings)
                numerator += (sim * (ratings[movieId] - other_mean))
                denominator += abs(sim)
                
        if denominator != 0:
            raw_prediction = user_mean + (numerator / denominator)
            predictions[movieId] = max(0.5, min(5.0, raw_prediction))

    top_predictions = sorted(predictions.items(), key=lambda x: x[1], reverse=True)[:N]
    recommendations = []
    
    for movieId, pred in top_predictions:
        movie = conn.execute(
            """
            SELECT 
                m.movieId, 
                m.title, 
                m.genres,
                AVG(r.rating) as avgRating,
                COUNT(r.rating) as ratingCount
            FROM movies m
            LEFT JOIN ratings r ON m.movieId = r.movieId
            WHERE m.movieId=?
            GROUP BY m.movieId
            """,
            (movieId,)
        ).fetchone()
        
        if movie:
            recommendations.append({
                "movieId": movie["movieId"],
                "title": movie["title"],
                "genres": movie["genres"] if movie["genres"] else "",
                "avgRating": round(movie["avgRating"], 2) if movie["avgRating"] else 0,
                "ratingCount": movie["ratingCount"],
                "predictedRating": round(pred, 2)
            })
            
    conn.close()
    return {"status": "success", "recommendations": recommendations}

# ----------
@app.post(f"{BASE_PATH}/tags/movies")
def search_movies_by_tag(request: TagSearchRequest):
    conn = get_db_connection()
    # Φέρνουμε όλες τις ταινίες και τα tags τους
    rows = conn.execute("""
        SELECT m.movieId, m.title, m.genres, t.tag as matchingTag
        FROM movies m
        JOIN tags t ON m.movieId = t.movieId
    """).fetchall()
    conn.close()

    keyword = request.search.lower()
    matched_movies = {}

    for row in rows:
        tag = row["matchingTag"].lower()
        is_match = False
        
        # Κανόνας Εκφώνησης: Μήκος < 5 ακριβής ισότητα, Μήκος >= 5 έλεγχος πρώτων 5 χαρακτήρων
        if len(keyword) < 5:
            if tag == keyword:
                is_match = True
        else:
            if tag[:5] == keyword[:5]:
                is_match = True
        
        if is_match:
            # Βάζουμε την ταινία στο dictionary (αν δεν υπάρχει ήδη) για να έχουμε μοναδικά αποτελέσματα
            if row["movieId"] not in matched_movies:
                matched_movies[row["movieId"]] = {
                    "movieId": row["movieId"],
                    "title": row["title"],
                    "genres": row["genres"] if row["genres"] else "",
                    "matchingTag": row["matchingTag"]
                }

    return {
        "status": "success",
        "movies": list(matched_movies.values())
    }
# ----------