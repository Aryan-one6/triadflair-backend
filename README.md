# 🧠 Triad Flair Backend

This is the backend service for **Triad Flair**, built with **Express.js**, deployed serverlessly via **Vercel**, and powered by **Google Gemini AI** and **Pinecone** for intelligent chat responses.

---

## 🚀 Features

- ⚡ Serverless Express backend (Vercel ready)
- 🧠 Google Gemini AI integration
- 📦 Pinecone vector DB for RAG-style queries
- 📊 MongoDB (Atlas) session and user storage
- �� Secure session handling via express-session
- 🌍 CORS + JSON middleware for API requests
- 📈 Vercel auto-deploy on push to `main`

---

## 🛠 Tech Stack

- Node.js
- Express.js
- MongoDB + Mongo Atlas
- Google Gemini API
- Pinecone Vector DB
- Vercel (for serverless hosting)
- `express-session`, `connect-mongo`, `uuid`, `dotenv`

---

## 📦 Project Structure

```
/api
  └── server.js       # Express server (Vercel compatible)

vercel.json           # Vercel routing + build config
.env                  # Local environment variables
```

---

## 💻 Local Development

```bash
# 1. Install dependencies
npm install

# 2. Run locally
npm run dev

# 3. Open
http://localhost:3000
```

---

## 🌐 Vercel Deployment

1. Push to GitHub
2. Import the repo at https://vercel.com/import
3. Set environment variables:

| Key               | Description                |
|------------------|----------------------------|
| `SESSION_SECRET` | A random string (secure)   |
| `MONGO_URL`      | Your MongoDB Atlas URI     |
| `GEMINI_API_KEY` | Google Gemini API Key      |
| `PINECONE_API_KEY`| Pinecone API Key          |

---

## 📄 Example `.env` (for local dev)

```
SESSION_SECRET=your_super_secret_key
MONGO_URL=mongodb+srv://<username>:<password>@cluster.mongodb.net/db
GEMINI_API_KEY=your_gemini_key
PINECONE_API_KEY=your_pinecone_key
PORT=3000
```

---

## 🙌 Credits

Made with 💙 by [Naresh Sharma](https://github.com/Aryan-one6)  
Powered by Vercel, MongoDB, Google, and Pinecone

---

## 📬 Questions?

If you have questions or want to contribute, feel free to open issues or pull requests.
