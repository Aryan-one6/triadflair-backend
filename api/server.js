import 'dotenv/config';
import 'punycode/punycode.js';

import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { MongoClient, ServerApiVersion } from 'mongodb';
import MongoStore from 'connect-mongo';

import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenAI } from "@google/genai";
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import serverless from 'serverless-http';




// API Keys – consider storing these in environment variables in production.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;


// Configure Google Generative AI and instantiate the model.
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Configure Pinecone and get the index.
const pc = new Pinecone({ apiKey: PINECONE_API_KEY });
const index = pc.index("heyaryann");

// Initialize Express app.
const app = express();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use(limiter);
export const handler = serverless(app);

// Middleware: Enable CORS, JSON parsing, and session management.
app.use(cors());
app.use(express.json());
app.use(helmet());
app.set('trust proxy', true);



// Define your routes
app.get('/', (req, res) => {
  res.send('Hello from Express on Vercel!');
});


// app.use(
//   session({
//     secret: "supersecretkey",
//     resave: false,
//     saveUninitialized: true,
//     // Cookie will expire in 15 minutes.
//     cookie: { maxAge: 15 * 60 * 1000 },
//   })
// );
const isDev = process.env.NODE_ENV !== 'production';


app.use(session({
  secret: process.env.SESSION_SECRET,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URL,
    dbName:  'chatbot_db',
    collectionName: 'sessions',
    ttl:     15 * 60,              // session life in seconds
  }),
  resave:           false,
  saveUninitialized: false,
  cookie: {
    maxAge: 15 * 60 * 1000,
    secure:  !isDev,              // only send over HTTPS in prod
    sameSite: isDev ? 'lax' : 'none'
  }
}));

// --- Function Definitions ---

// --- Embedding & Pinecone Helpers for Gemini AI ---

// 1) Embed text with Gemini AI
async function embedWithGemini(text) {
  try {
    const { embeddings } = await ai.models.embedContent({
      model: "models/text-embedding-004",
      contents: text
    });
    // embeddings is an array of { values: number[] }
    return embeddings[0]?.values ?? null;
  } catch (err) {
    console.error("Error in embedding:", err);
    return null;
  }
}

// 2) Query Pinecone with the correct parameter names
async function retrieveFromPinecone(query, index, topK = 3) {
  const vector = await embedWithGemini(query);
  if (!vector) return [];

  try {
    const { matches } = await index.query({
      vector,              // your numeric array
      topK,                // instead of top_k
      includeMetadata: true  // instead of include_metadata
    });
    return matches || [];
  } catch (err) {
    console.error("Error in Pinecone query:", err);
    return [];
  }
}

// 3) Generate a reply using Gemini AI
async function generateResponse(userQuery, context) {
  try {
    const prompt = [
      `User query: ${userQuery}`,
      `Context:\n${context}`,
      `You are the chat support of website Triad Flair. Answer precisely and on-topic.`,
      `If outside scope, say you can only answer based on heyaryan.com.`
    ].join("\n\n");

    const { text } = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: prompt

    });
    return text.trim();
    return text.replace(/[\r\n]+$/g, "");
  } catch (err) {
    console.error("Error in generating response:", err);
    return "Error generating response.";
  }
}


// Core function to generate the full reply.
async function queryVectorDB(userQuery) {
  const relevantDocs = await retrieveFromPinecone(userQuery, index);
  let context;
  if (relevantDocs.length > 0) {
    context = relevantDocs
      .map(
        (doc) =>
          `Source: ${doc.metadata.url}\nContent: ${doc.metadata.content}`
      )
      .join("\n\n");
  } else {
    context = "No relevant information found.";
  }
  return await generateResponse(userQuery, context);
}


// Simple RFC‑style email check
function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}
// --- Chat API Endpoint ---

app.post("/chat", async (req, res) => {
  const data = req.body;

  // Initialize session if it doesn't exist.
  if (!req.session.session_id) {
    req.session.session_id = uuidv4();
  }
  const sessionId = req.session.session_id;

  try {
    // Retrieve user record from MongoDB.
    let userData = await collection.findOne({ _id: sessionId });

    // Step 1: Ask for email if user data is not present.
    if (!userData) {
      const raw = data.query?.trim() || "";
      if (!raw) {
        return res.json({ message: "What is your email address?" });
      }
      if (!isValidEmail(raw)) {
        return res.json({ message: "That doesn’t look like an email. Please enter a valid email address." });
      }
      const email = raw;
         
      const existingUser = await collection.findOne({ email: email });
      if (existingUser) {
        req.session.session_id = existingUser._id;
        req.session.awaiting_service = true; // Flag to expect a service next.
        return res.json({ message: "For what service are you looking?" });
      } else {
        await collection.insertOne({ _id: sessionId, email: email });
        return res.json({ message: "What is your name?" });
      }
    }

    // Reload user data after any session update.
    userData = await collection.findOne({ _id: req.session.session_id });

    // Step 2: Ask for name (new users only).
    if (!userData.name) {
      if (!data.query || !data.query.trim()) {
        return res.json({ message: "What is your name?" });
      }
      await collection.updateOne(
        { _id: req.session.session_id },
        { $set: { name: data.query.trim() } }
      );
      req.session.awaiting_service = true;
      return res.json({ message: "For what service are you looking?" });
    }

    // Step 3: Add service if waiting for it.
    if (req.session.awaiting_service) {
      if (!data.query || !data.query.trim()) {
        return res.json({ message: "For what service are you looking?" });
      }
      const newService = data.query.trim();
      if (userData.services) {
        await collection.updateOne(
          { _id: req.session.session_id },
          { $addToSet: { services: newService } }
        );
      } else {
        await collection.updateOne(
          { _id: req.session.session_id },
          { $set: { services: [newService] } }
        );
      }
      
      const userName = userData.name;

      req.session.awaiting_service = false; // Done collecting service.
      return res.json({
        message: `Hi! ${userName}, How can I assist you?`,
      });
    }

    // Step 4: Handle actual chat queries.
    if (data.query && data.query.trim()) {
      const userQuery = data.query.trim();
      const responseText = await queryVectorDB(userQuery);
      return res.json({ response: responseText });
    }

    return res.status(400).json({ error: "Invalid request" });
  } catch (error) {
    console.error("Error in /chat endpoint:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// --- MongoDB Connection and Server Startup ---

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
process.env['NODE_EXTRA_CA_CERTS'] = path.resolve(__dirname, 'certs/mongodb-chain.pem');

let tlsCAFile;
let collection;

if (process.env.MONGO_CA_FILE) {
  const rel = process.env.MONGO_CA_FILE.startsWith('/')
    ? process.env.MONGO_CA_FILE.slice(1)
    : process.env.MONGO_CA_FILE;
  tlsCAFile = path.resolve(__dirname, rel);
  console.log('🔒 Using MongoDB CA bundle at:', tlsCAFile);
}


// 1) Read your URL and port (with a fallback)
const mongoUrl = process.env.MONGO_URL;
const PORT     = process.env.PORT ||5050;

const client = new MongoClient(process.env.MONGO_URL, {
  serverApi: ServerApiVersion.v1,
  tls: true,
  // ✅ Remove tlsCAFile completely
});


// 3) Connect & start server
client.connect()
  .then(() => {
    const db = client.db("chatbot_db");
    collection = db.collection("user_queries");

    if (process.env.VERCEL !== "1") {
      app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
      });
    }
  })
  .catch(err => {
    console.error("MongoDB connection error:", err);
  });


export default app; 
