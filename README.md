# BlogSpace – Full-Stack Blog Platform

A complete blog platform with user authentication, CRUD posts, and an interactive comment section.

---

## Features

- **User Auth** – Register, login, JWT-based sessions, profile editing
- **Blog Posts** – Create, read, update, delete posts with tags, cover images, and rich content
- **Comments** – Add, edit, delete comments on any post
- **Likes** – Like/unlike posts
- **Search & Filter** – Full-text search + tag filtering
- **Dashboard** – Personal stats (posts, views, likes) and post management
- **Responsive UI** – Dark-themed, mobile-friendly frontend

---

## Tech Stack

| Layer    | Technology                        |
|----------|-----------------------------------|
| Backend  | Node.js, Express.js               |
| Database | MongoDB + Mongoose                |
| Auth     | JWT (jsonwebtoken) + bcryptjs     |
| Frontend | Vanilla HTML / CSS / JavaScript   |

---

## Project Structure

```
Blog Platform/
├── backend/
│   ├── src/
│   │   ├── config/db.js          # MongoDB connection
│   │   ├── controllers/
│   │   │   ├── authController.js
│   │   │   ├── postController.js
│   │   │   └── commentController.js
│   │   ├── middleware/
│   │   │   └── authMiddleware.js  # JWT protect / optionalAuth
│   │   ├── models/
│   │   │   ├── User.js
│   │   │   ├── Post.js
│   │   │   └── Comment.js
│   │   ├── routes/
│   │   │   ├── authRoutes.js
│   │   │   ├── postRoutes.js
│   │   │   └── commentRoutes.js
│   │   └── server.js
│   ├── .env
│   └── package.json
└── frontend/
    ├── index.html                 # Home / post listing
    ├── css/style.css
    ├── js/
    │   ├── api.js                 # Fetch wrapper + API helpers
    │   ├── auth.js                # Auth state, navbar, guards
    │   ├── home.js
    │   ├── login.js
    │   ├── register.js
    │   ├── post.js
    │   ├── create-post.js
    │   └── dashboard.js
    └── pages/
        ├── login.html
        ├── register.html
        ├── post.html
        ├── create-post.html
        └── dashboard.html
```

---

## Setup & Run

### Prerequisites
- [Node.js](https://nodejs.org) v18+
- [MongoDB](https://www.mongodb.com/try/download/community) running locally (or a MongoDB Atlas URI)

### 1 – Install backend dependencies
```bash
cd backend
npm install
```

### 2 – Configure environment
Edit `backend/.env`:
```
PORT=5000
MONGO_URI=mongodb://localhost:27017/blogplatform
JWT_SECRET=change_this_to_a_long_random_string
JWT_EXPIRE=7d
```

### 3 – Start the server
```bash
cd backend
npm start          # production
npm run dev        # development (nodemon)
```

### 4 – Open the app
Visit **http://localhost:5000** in your browser.

---

## API Endpoints

### Auth – `/api/auth`
| Method | Path        | Auth     | Description        |
|--------|-------------|----------|--------------------|
| POST   | /register   | Public   | Create account     |
| POST   | /login      | Public   | Login + get token  |
| GET    | /me         | Private  | Get own profile    |
| PUT    | /profile    | Private  | Update profile     |

### Posts – `/api/posts`
| Method | Path          | Auth     | Description              |
|--------|---------------|----------|--------------------------|
| GET    | /             | Public   | List posts (page/search) |
| GET    | /:id          | Public   | Single post              |
| GET    | /user/my      | Private  | My posts                 |
| POST   | /             | Private  | Create post              |
| PUT    | /:id          | Private  | Update post (author)     |
| DELETE | /:id          | Private  | Delete post (author)     |
| PUT    | /:id/like     | Private  | Toggle like              |

### Comments – `/api/comments`
| Method | Path          | Auth     | Description              |
|--------|---------------|----------|--------------------------|
| GET    | /:postId      | Public   | Get comments for post    |
| POST   | /:postId      | Private  | Add comment              |
| PUT    | /:id          | Private  | Edit comment (author)    |
| DELETE | /:id          | Private  | Delete comment (author)  |
| PUT    | /:id/like     | Private  | Toggle comment like      |
