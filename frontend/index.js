document.addEventListener('DOMContentLoaded', () => {
    
    // --- DOM ELEMENTS ---
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const addMovieBtn = document.getElementById('add-movie-btn');
    const recsBtn = document.getElementById('recommendations-btn');
    const resultsContainer = document.getElementById('results-container');
    const sectionTitle = document.getElementById('section-title'); 
    
    // Modal Elements
    const modal = document.getElementById('add-movie-modal');
    const closeBtn = document.getElementById('close-modal-btn');
    const cancelBtn = document.getElementById('cancel-movie-btn');
    const submitBtn = document.getElementById('submit-movie-btn');
    const titleInput = document.getElementById('new-movie-title');
    const genreContainer = document.getElementById('genre-selector');
    const errorMsg = document.getElementById('modal-error-msg');

    const API_BASE = 'https://movielens-api.onrender.com/movielens/api';
    let sessionRatings = {}; 

    const toast = document.getElementById('toast-notification');
    let toastTimeout;

    // --- HELPER: Show Toast Notification ---
    function showToast(message) {
        toast.innerText = message;
        toast.classList.add('show');

        // Clear any existing timers so they don't overlap
        clearTimeout(toastTimeout);

        // Hide it automatically after 3.5 seconds
        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 3500);
    }

    // --- HELPER: Generate Static Average Stars (Supports Half Stars) ---
    function getStaticStarsHTML(rating) {
        if (!rating || rating === 0) return `<span class="no-rating">No ratings yet</span>`;
        let starsHTML = '';
        for (let i = 1; i <= 5; i++) {
            if (rating >= i) {
                starsHTML += `<span class="star filled">★</span>`;
            } else if (rating >= i - 0.5) {
                starsHTML += `<span class="star half-filled">★</span>`;
            } else {
                starsHTML += `<span class="star">☆</span>`;
            }
        }
        return `<div class="stars-wrapper">${starsHTML} <span class="rating-number">${rating.toFixed(2)}/5</span></div>`;
    }

    // --- HELPER: Generate Interactive User Stars (Supports Half Stars) ---
    function getUserInteractiveStarsHTML(movieId) {
        const currentRating = sessionRatings[movieId] || 0;
        let starsHTML = '';
        for (let i = 1; i <= 5; i++) {
            let fillClass = "";
            if (i <= Math.floor(currentRating)) fillClass = "active";
            else if (i === Math.ceil(currentRating) && currentRating % 1 !== 0) fillClass = "half-active";
            
            starsHTML += `<span class="user-star ${fillClass}" data-value="${i}">★</span>`;
        }
        return `
            <div class="user-rating-row" data-movie-id="${movieId}">
                <span class="user-rating-label">Your rating: </span>
                <div class="user-stars-wrapper">${starsHTML}</div>
            </div>
        `;
    }

    // --- SHARED RENDER FUNCTION ---
    function renderMovies(movies, titleText) {
        sectionTitle.innerText = titleText;
        sectionTitle.style.display = 'block';
        resultsContainer.innerHTML = '';

        if (movies.length === 0) {
            resultsContainer.innerHTML = `<div class="empty-state"><p>No movies found.</p></div>`;
            return;
        }

        movies.forEach(movie => {
            const movieCard = document.createElement('div');
            movieCard.className = 'movie-card';
            
            const ratingValue = movie.avgRating || 0;
            const ratingCount = movie.ratingCount || 0;
            
            movieCard.setAttribute('data-original-avg', ratingValue);
            movieCard.setAttribute('data-original-count', ratingCount);
            movieCard.setAttribute('data-movie-id', movie.movieId);
            
            const niceGenres = movie.genres ? movie.genres.split('|').join(', ') : 'Unknown Genre';

            let displayAvg = ratingValue;
            if (sessionRatings[movie.movieId] && ratingCount > 0) {
                const totalScore = (ratingValue * ratingCount) + sessionRatings[movie.movieId];
                displayAvg = totalScore / (ratingCount + 1);
            }

            movieCard.innerHTML = `
                <div class="movie-info">
                    <h3 class="movie-title">${movie.title}</h3>
                    <p class="movie-genres">${niceGenres}</p>
                </div>
                <div class="movie-rating">
                    <div class="avg-rating-container">
                        ${getStaticStarsHTML(displayAvg)}
                    </div>
                    ${getUserInteractiveStarsHTML(movie.movieId)}
                </div>
            `;
            resultsContainer.appendChild(movieCard);
        });
    }

    // --- API CALLS ---
    async function performSearch() {
        const query = searchInput.value.trim();
        if (!query) return;
        sectionTitle.style.display = 'none';
        resultsContainer.innerHTML = `<div class="empty-state"><p>Searching the database...</p></div>`;
        try {
            const response = await fetch(`${API_BASE}/movies?search=${encodeURIComponent(query)}`);
            const data = await response.json();
            renderMovies(data.movies, `Search results for "${query}"`);
        } catch (error) {
            resultsContainer.innerHTML = `<div class="empty-state"><p style="color: #ff4c4c;">Error connecting to the server.</p></div>`;
        }
    }

    async function fetchRecommendations() {
        const ratingKeys = Object.keys(sessionRatings);
        if (ratingKeys.length === 0) {
            alert("You must rate at least one movie before requesting recommendations!");
            return;
        }
        sectionTitle.style.display = 'none';
        resultsContainer.innerHTML = `<div class="empty-state"><p>Crunching the numbers with Pearson Correlation... ✨</p></div>`;

        const requestBody = {
            ratings: ratingKeys.map(id => ({ movieId: parseInt(id), rating: sessionRatings[id] }))
        };

        try {
            const response = await fetch(`${API_BASE}/recommendations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            const data = await response.json();
            if (data.recommendations.length === 0) {
                renderMovies([], "Recommendations");
                resultsContainer.innerHTML = `<div class="empty-state"><p>We couldn't find enough similar users. Try rating more popular movies!</p></div>`;
            } else {
                renderMovies(data.recommendations, "Your Personalized Recommendations");
            }
        } catch (error) {
            resultsContainer.innerHTML = `<div class="empty-state"><p style="color: #ff4c4c;">Error generating recommendations.</p></div>`;
        }
    }

    // ==================================
    // ADD MOVIE MODAL LOGIC
    // ==================================
    
    // The official MovieLens standard genres
    const availableGenres = [
        "Action", "Adventure", "Animation", "Children", "Comedy", 
        "Crime", "Documentary", "Drama", "Fantasy", "Film-Noir", 
        "Horror", "Musical", "Mystery", "Romance", "Sci-Fi", 
        "Thriller", "War", "Western"
    ];

    let selectedGenres = new Set();

    // 1. Build the Genre Pills dynamically
    availableGenres.forEach(genre => {
        const pill = document.createElement('div');
        pill.className = 'genre-pill';
        pill.innerText = genre;
        pill.addEventListener('click', () => {
            if (selectedGenres.has(genre)) {
                selectedGenres.delete(genre);
                pill.classList.remove('selected');
            } else {
                selectedGenres.add(genre);
                pill.classList.add('selected');
            }
        });
        genreContainer.appendChild(pill);
    });

    // 2. Open / Close Modal Logic
    function closeModal() {
        modal.classList.remove('show');
        setTimeout(() => {
            titleInput.value = '';
            selectedGenres.clear();
            document.querySelectorAll('.genre-pill').forEach(p => p.classList.remove('selected'));
            errorMsg.innerText = '';
        }, 300); 
    }

    addMovieBtn.addEventListener('click', () => {
        document.getElementById('fun-pointer').style.display = 'none';
        modal.classList.add('show');
        titleInput.focus();
    });

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    
    window.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // 3. Submit the Movie to the Backend
    submitBtn.addEventListener('click', async () => {
        const title = titleInput.value.trim();
        
        if (!title) {
            errorMsg.innerText = "Please enter a movie title.";
            return;
        }

        let finalGenres = selectedGenres.size > 0 
            ? Array.from(selectedGenres).join('|') 
            : "(no genres listed)";

        const requestBody = {
            title: title,
            genres: finalGenres
        };

        submitBtn.innerText = "Adding...";
        submitBtn.disabled = true;

        try {
            const response = await fetch(`${API_BASE}/movies`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (response.ok) {
                closeModal();
                showToast(`✨ "${title}" successfully added!`);
                searchInput.value = title; 
                performSearch(); 
            } else {
                errorMsg.innerText = data.detail || "Failed to add movie.";
            }
        } catch (error) {
            errorMsg.innerText = "Network error. Is the server running?";
        } finally {
            submitBtn.innerText = "Add Movie";
            submitBtn.disabled = false;
        }
    });

    // ==================================
    // EVENT DELEGATION: MOUSEMOVE HALF-STARS
    // ==================================
    
    resultsContainer.addEventListener('mousemove', (e) => {
        if (e.target.classList.contains('user-star')) {
            const rect = e.target.getBoundingClientRect();
            const isHalf = (e.clientX - rect.left) < (rect.width / 2);
            const baseValue = parseInt(e.target.getAttribute('data-value'));
            const hoveredValue = isHalf ? baseValue - 0.5 : baseValue;
            
            const wrapper = e.target.parentElement;
            Array.from(wrapper.children).forEach(star => {
                const starVal = parseInt(star.getAttribute('data-value'));
                star.classList.remove('hover-active', 'hover-half-active');
                
                if (starVal <= Math.floor(hoveredValue)) {
                    star.classList.add('hover-active');
                } else if (starVal === Math.ceil(hoveredValue) && isHalf) {
                    star.classList.add('hover-half-active');
                }
            });
        }
    });

    resultsContainer.addEventListener('mouseout', (e) => {
        if (e.target.classList.contains('user-star')) {
            const wrapper = e.target.parentElement;
            Array.from(wrapper.children).forEach(star => star.classList.remove('hover-active', 'hover-half-active'));
        }
    });

    resultsContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('user-star')) {
            const rect = e.target.getBoundingClientRect();
            const isHalf = (e.clientX - rect.left) < (rect.width / 2);
            const baseValue = parseInt(e.target.getAttribute('data-value'));
            const newRating = isHalf ? baseValue - 0.5 : baseValue;
            
            const row = e.target.closest('.user-rating-row');
            const movieId = parseInt(row.getAttribute('data-movie-id'));
            const movieCard = e.target.closest('.movie-card');
            
            sessionRatings[movieId] = newRating;
            
            const wrapper = e.target.parentElement;
            Array.from(wrapper.children).forEach(star => {
                const starVal = parseInt(star.getAttribute('data-value'));
                star.classList.remove('active', 'half-active');
                
                if (starVal <= Math.floor(newRating)) {
                    star.classList.add('active');
                } else if (starVal === Math.ceil(newRating) && isHalf) {
                    star.classList.add('half-active');
                }
            });

            const originalAvg = parseFloat(movieCard.getAttribute('data-original-avg')) || 0;
            const originalCount = parseInt(movieCard.getAttribute('data-original-count')) || 0;
            
            if (originalCount > 0) {
                const newTotalScore = (originalAvg * originalCount) + newRating;
                const newAvg = newTotalScore / (originalCount + 1);
                
                const avgContainer = movieCard.querySelector('.avg-rating-container');
                avgContainer.innerHTML = getStaticStarsHTML(newAvg);
                avgContainer.classList.remove('pulse-update');
                void avgContainer.offsetWidth; 
                avgContainer.classList.add('pulse-update');
            }
        }
    });

    // --- STANDARD BUTTON LISTENERS ---
    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') performSearch(); });
    recsBtn.addEventListener('click', fetchRecommendations);

    // ----------
    // Σύνδεση με το DOM για το νέο Tag Search
    const tagSearchInput = document.getElementById('tag-search-input');
    const tagSearchBtn = document.getElementById('tag-search-btn');

    // Συνάρτηση που φτιάχνει τον πίνακα αντί για κάρτες
    function renderTagMoviesTable(movies, titleText) {
        sectionTitle.innerText = titleText;
        sectionTitle.style.display = 'block';
        resultsContainer.innerHTML = '';

        if (movies.length === 0) {
            resultsContainer.innerHTML = `<div class="empty-state"><p>No movies found for this tag.</p></div>`;
            return;
        }

        // Φτιάχνουμε το HTML του πίνακα
        let tableHTML = `
            <table class="movies-table">
                <thead>
                    <tr>
                        <th>Movie ID</th>
                        <th>Title</th>
                        <th>Genres</th>
                        <th>Matching Tag</th>
                    </tr>
                </thead>
                <tbody>
        `;

        // Γεμίζουμε τις γραμμές
        movies.forEach(movie => {
            const niceGenres = movie.genres ? movie.genres.split('|').join(', ') : '';
            tableHTML += `
                <tr>
                    <td>${movie.movieId}</td>
                    <td>${movie.title}</td>
                    <td>${niceGenres}</td>
                    <td><span class="genre-pill selected" style="cursor:default">${movie.matchingTag}</span></td>
                </tr>
            `;
        });

        tableHTML += `</tbody></table>`;
        resultsContainer.innerHTML = tableHTML; // Καρφώνουμε τον πίνακα στην οθόνη
    }

    // Το POST Request (Η καρδιά της άσκησης)
    async function performTagSearch() {
        const query = tagSearchInput.value.trim();
        if (!query) return;

        sectionTitle.style.display = 'none';
        resultsContainer.innerHTML = `<div class="empty-state"><p>Searching tags (POST)...</p></div>`;

        try {
            const response = await fetch(`${API_BASE}/tags/movies`, {
                method: 'POST', // Όπως ζητάει η εκφώνηση
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ search: query }) // Στέλνουμε το JSON Body
            });
            const data = await response.json();
            
            if (response.ok) {
                renderTagMoviesTable(data.movies, `Tag Search Results for "${query}"`);
            } else {
                resultsContainer.innerHTML = `<div class="empty-state"><p style="color: #ff4c4c;">API Error</p></div>`;
            }
        } catch (error) {
            resultsContainer.innerHTML = `<div class="empty-state"><p style="color: #ff4c4c;">Error connecting to the server.</p></div>`;
        }
    }

    // Ακροατές για το κουμπί και το Enter
    tagSearchBtn.addEventListener('click', performTagSearch);
    tagSearchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') performTagSearch(); });
    // ----------

});