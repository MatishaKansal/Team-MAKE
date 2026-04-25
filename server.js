const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { MongoClient } = require("mongodb");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const SERVER_LOG = path.join(ROOT, "server.log");
const ENV_FILE = path.join(ROOT, ".env");
const MONGODB_STATE_ID = "main";

let mongoClient = null;
let mongoCollection = null;

function loadEnvFile() {
  if (!fs.existsSync(ENV_FILE)) return;
  if (!fs.statSync(ENV_FILE).isFile()) {
    serverLog(".env exists but is not a file. Skipping environment file loading.");
    return;
  }
  const lines = fs.readFileSync(ENV_FILE, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const equalsIndex = trimmed.indexOf("=");
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim().replace(/^["']|["']$/g, "");
    const isPlaceholder = ["PASTE_YOUR_KEY_HERE", "your_newsapi_key_here", "your_actual_api_key_here"].includes(value);
    if (key && value && !isPlaceholder && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile();

function serverLog(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    fs.appendFileSync(SERVER_LOG, line);
  } catch {
    // Logging should never take the application down.
  }
}

process.on("uncaughtException", (error) => {
  serverLog(`Uncaught exception: ${error.stack || error.message}`);
});

process.on("unhandledRejection", (error) => {
  serverLog(`Unhandled rejection: ${error.stack || error}`);
});

const categories = [
  {
    id: "ai",
    name: "Artificial Intelligence",
    accent: "#7c3aed",
    keywords: ["ai", "artificial intelligence", "machine learning", "neural network", "llm", "generative ai", "chatgpt", "openai"],
    rules: [
      ["artificial intelligence", 8],
      ["machine learning", 7],
      ["generative ai", 8],
      ["large language model", 7],
      ["neural network", 6],
      ["chatgpt", 6],
      ["openai", 6],
      ["llm", 5],
      ["ai", 4]
    ]
  },
  {
    id: "software",
    name: "Software Development",
    accent: "#0f766e",
    keywords: ["software", "developer", "programming", "javascript", "react", "node.js", "api", "open source", "github"],
    rules: [
      ["software development", 8],
      ["software", 5],
      ["developer", 4],
      ["programming", 5],
      ["javascript", 6],
      ["react", 6],
      ["node.js", 6],
      ["api", 4],
      ["open source", 5],
      ["github", 5],
      ["coding", 4]
    ]
  },
  {
    id: "cybersecurity",
    name: "Cybersecurity",
    accent: "#b91c1c",
    keywords: ["cybersecurity", "cyber", "breach", "ransomware", "vulnerability", "malware", "hacker", "encryption", "privacy"],
    rules: [
      ["cybersecurity", 8],
      ["ransomware", 8],
      ["data breach", 7],
      ["breach", 6],
      ["vulnerability", 6],
      ["malware", 6],
      ["hacker", 5],
      ["cyber", 5],
      ["encryption", 5],
      ["privacy", 3],
      ["security", 3]
    ]
  },
  {
    id: "data-science",
    name: "Data Science",
    accent: "#2563eb",
    keywords: ["data science", "analytics", "dataset", "visualization", "python", "statistics", "data pipeline", "big data"],
    rules: [
      ["data science", 8],
      ["data pipeline", 7],
      ["big data", 7],
      ["analytics", 6],
      ["dataset", 5],
      ["visualization", 5],
      ["statistics", 5],
      ["python", 4],
      ["database", 4],
      ["data", 1]
    ]
  },
  {
    id: "cloud",
    name: "Cloud Computing",
    accent: "#c2410c",
    keywords: ["cloud computing", "cloud", "serverless", "aws", "azure", "kubernetes", "container", "edge computing", "devops"],
    rules: [
      ["cloud computing", 8],
      ["kubernetes", 8],
      ["serverless", 6],
      ["aws", 6],
      ["azure", 6],
      ["edge computing", 6],
      ["container", 5],
      ["devops", 5],
      ["cloud", 4]
    ]
  },
  {
    id: "general-tech",
    name: "General Technology",
    accent: "#334155",
    keywords: ["technology", "tech", "internet", "digital", "online", "platform", "startup", "semiconductor", "chip", "robot"],
    rules: [
      ["technology", 5],
      ["tech", 5],
      ["internet", 5],
      ["digital", 4],
      ["online", 3],
      ["platform", 3],
      ["startup", 4],
      ["semiconductor", 6],
      ["chip", 5],
      ["robot", 5],
      ["device", 4],
      ["smartphone", 5]
    ]
  }
];

const TECH_QUERY = [
  "\"artificial intelligence\"",
  "AI",
  "\"machine learning\"",
  "cybersecurity",
  "ransomware",
  "\"data breach\"",
  "software",
  "programming",
  "\"cloud computing\"",
  "kubernetes",
  "\"data science\"",
  "technology",
  "internet",
  "digital"
].join(" OR ");

const newsSources = [
  {
    id: "all-technology",
    label: "All Technology Sources",
    description: "Searches across technology-related publishers and blogs.",
    mode: "everything",
    query: TECH_QUERY
  },
  {
    id: "bbc-news",
    label: "BBC News",
    description: "Technology-related BBC articles through NewsAPI.",
    mode: "source-everything",
    source: "bbc-news"
  },
  {
    id: "techcrunch",
    label: "TechCrunch",
    description: "Technology startup and product news.",
    mode: "source-everything",
    source: "techcrunch"
  },
  {
    id: "the-verge",
    label: "The Verge",
    description: "Consumer technology, platforms, and culture.",
    mode: "source-everything",
    source: "the-verge"
  },
  {
    id: "ars-technica",
    label: "Ars Technica",
    description: "Software, science, hardware, and security coverage.",
    mode: "source-everything",
    source: "ars-technica"
  }
];

const seedArticles = [
  {
    title: "Open-source LLM tools make private campus research assistants easier to deploy",
    author: "Tech Ledger",
    description: "Universities are combining retrieval systems and smaller language models to create safer research helpers for students and faculty.",
    source: "Tech Ledger",
    url: "https://example.com/open-source-llm-campus",
    publishedAt: "2026-04-24T09:00:00.000Z"
  },
  {
    title: "React teams adopt server components for faster technical publishing workflows",
    author: "Frontend Weekly",
    description: "Engineering groups are rebuilding content-heavy portals with hybrid rendering, componentized layouts, and cleaner API contracts.",
    source: "Frontend Weekly",
    url: "https://example.com/react-server-components",
    publishedAt: "2026-04-23T11:30:00.000Z"
  },
  {
    title: "New ransomware playbooks target unpatched developer tooling and CI secrets",
    author: "SecureOps Daily",
    description: "Security researchers warn that attackers are scanning build systems for leaked tokens, stale runners, and weak dependency controls.",
    source: "SecureOps Daily",
    url: "https://example.com/ransomware-ci-secrets",
    publishedAt: "2026-04-22T07:45:00.000Z"
  },
  {
    title: "Data science teams move dashboards closer to operational decision loops",
    author: "Data Brief",
    description: "Modern analytics platforms are shifting from passive reporting to real-time alerts, model monitoring, and embedded insights.",
    source: "Data Brief",
    url: "https://example.com/analytics-decision-loops",
    publishedAt: "2026-04-21T15:20:00.000Z"
  },
  {
    title: "Kubernetes cost dashboards help startups control cloud spending",
    author: "Cloud Native Now",
    description: "FinOps tools are adding cluster-aware recommendations that identify idle workloads, oversized nodes, and expensive traffic paths.",
    source: "Cloud Native Now",
    url: "https://example.com/kubernetes-cost-dashboards",
    publishedAt: "2026-04-20T13:10:00.000Z"
  },
  {
    title: "AI coding assistants boost productivity when paired with strict review gates",
    author: "Developer Journal",
    description: "Teams report better outcomes when generated code is paired with testing, linting, threat modeling, and human design review.",
    source: "Developer Journal",
    url: "https://example.com/ai-coding-review",
    publishedAt: "2026-04-19T10:10:00.000Z"
  },
  {
    title: "Privacy engineers recommend passkeys and encrypted backups for student portals",
    author: "Cyber Campus",
    description: "A practical security checklist focuses on authentication, backup recovery, browser hygiene, and phishing-resistant workflows.",
    source: "Cyber Campus",
    url: "https://example.com/student-portal-passkeys",
    publishedAt: "2026-04-18T08:40:00.000Z"
  },
  {
    title: "Python data pipelines gain typed contracts for reproducible AI experiments",
    author: "ML Systems Review",
    description: "Researchers are improving experiment reliability with data validation, lineage tracking, and reproducible transformation layers.",
    source: "ML Systems Review",
    url: "https://example.com/python-data-contracts",
    publishedAt: "2026-04-17T16:05:00.000Z"
  }
];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".zip": "application/zip"
};

function createDefaultDb() {
  const articles = seedArticles.map(normalizeArticle);
  return {
    articles,
    categories: categories.map(publicCategory),
    saved: [articles[0].id, articles[3].id],
    logs: [
      logEntry("system", "Application database initialized with curated technology articles."),
      logEntry("aggregation", "News aggregation fallback data loaded.")
    ],
    users: [normalizeUser({
      id: "admin",
      username: "admin",
      displayName: "Admin",
      role: "administrator",
      passwordHash: hashPassword("admin123"),
      savedArticles: [],
      preferences: defaultPreferences()
    })]
  };
}

function ensureLocalDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    writeLocalDb(createDefaultDb());
  }
}

function readLocalDb() {
  ensureLocalDb();
  const db = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
  const repaired = repairDb(db);
  if (repaired.changed) writeLocalDb(repaired.db);
  return repaired.db;
}

function writeLocalDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

async function connectMongoDb() {
  if (!process.env.MONGODB_URI) return false;
  const dbName = process.env.MONGODB_DB_NAME || "technical_news_hub";
  const collectionName = process.env.MONGODB_COLLECTION || "app_state";
  try {
    mongoClient = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    await mongoClient.connect();
    mongoCollection = mongoClient.db(dbName).collection(collectionName);
    serverLog(`MongoDB connected using database '${dbName}' and collection '${collectionName}'.`);
    return true;
  } catch (error) {
    serverLog(`MongoDB connection failed. Falling back to local cache. ${error.message}`);
    mongoCollection = null;
    if (mongoClient) {
      try {
        await mongoClient.close();
      } catch {
        // Ignore close failures while handling connection failure.
      }
    }
    mongoClient = null;
    return false;
  }
}

async function ensureDb() {
  if (!mongoCollection) {
    ensureLocalDb();
    return;
  }

  const doc = await mongoCollection.findOne({ _id: MONGODB_STATE_ID });
  if (doc?.data) return;

  const initial = fs.existsSync(DB_FILE)
    ? readLocalDb()
    : createDefaultDb();
  const repaired = repairDb(initial).db;
  await writeDb(repaired);
  serverLog("MongoDB state initialized.");
}

async function readDb() {
  await ensureDb();
  if (!mongoCollection) return readLocalDb();

  const doc = await mongoCollection.findOne({ _id: MONGODB_STATE_ID });
  const db = doc?.data || createDefaultDb();
  const repaired = repairDb(db);
  if (repaired.changed || !doc?.data) await writeDb(repaired.db);
  return repaired.db;
}

async function writeDb(db) {
  if (!mongoCollection) {
    writeLocalDb(db);
    return;
  }

  await mongoCollection.replaceOne(
    { _id: MONGODB_STATE_ID },
    { _id: MONGODB_STATE_ID, data: db, updatedAt: new Date().toISOString() },
    { upsert: true }
  );
}

function logEntry(type, message) {
  return {
    id: crypto.randomUUID(),
    type,
    message,
    createdAt: new Date().toISOString()
  };
}

function publicCategory(category) {
  return {
    id: category.id,
    name: category.name,
    accent: category.accent,
    keywords: category.keywords
  };
}

function defaultPreferences() {
  return {
    category: "all",
    sort: "desc",
    source: "all-technology"
  };
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(`technical-news-hub::${password}`).digest("hex");
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, sessionToken, ...publicUser } = user;
  return {
    ...publicUser,
    savedCount: Array.isArray(user.savedArticles) ? user.savedArticles.length : 0
  };
}

function normalizeUser(raw = {}) {
  const username = String(raw.username || raw.name || raw.displayName || "").trim() || `guest-${crypto.randomUUID().slice(0, 8)}`;
  const role = raw.role === "administrator" ? "administrator" : raw.role || (username === "admin" ? "administrator" : "guest");
  const preferences = {
    ...defaultPreferences(),
    ...(raw.preferences || {})
  };
  const savedArticles = Array.isArray(raw.savedArticles)
    ? [...new Set(raw.savedArticles)]
    : Array.isArray(raw.saved)
      ? [...new Set(raw.saved)]
      : [];

  return {
    id: raw.id || crypto.randomUUID(),
    username,
    displayName: raw.displayName || raw.name || (role === "administrator" ? "Admin" : "Guest"),
    role,
    isGuest: raw.isGuest ?? role === "guest",
    passwordHash: raw.passwordHash || (raw.password ? hashPassword(raw.password) : role === "administrator" ? hashPassword("admin123") : ""),
    savedArticles,
    preferences,
    sessionToken: raw.sessionToken || null,
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString()
  };
}

function getAuthToken(req) {
  const headerToken = req.headers["x-user-token"] || req.headers.authorization || "";
  return String(headerToken).replace(/^Bearer\s+/i, "").trim();
}

function getRequestUser(db, req) {
  const token = getAuthToken(req);
  if (!token) return null;
  return (db.users || []).find((user) => user.sessionToken === token) || null;
}

function findUserByUsername(db, username) {
  const needle = String(username || "").trim().toLowerCase();
  if (!needle) return null;
  return (db.users || []).find((user) => String(user.username || "").toLowerCase() === needle) || null;
}

function issueSessionToken(user) {
  user.sessionToken = crypto.randomUUID();
  user.updatedAt = new Date().toISOString();
  return user.sessionToken;
}

function createGuestUser(db) {
  const sourceSaved = Array.isArray(db.saved) ? db.saved : [];
  const guest = normalizeUser({
    username: `guest-${crypto.randomUUID().slice(0, 8)}`,
    displayName: "Guest Profile",
    role: "guest",
    isGuest: true,
    savedArticles: sourceSaved,
    preferences: defaultPreferences()
  });
  issueSessionToken(guest);
  db.users = db.users || [];
  db.users.push(guest);
  return guest;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsTerm(text, term) {
  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegex(term.toLowerCase())}([^a-z0-9]|$)`, "i");
  return pattern.test(text);
}

function classifyArticle(article, includeDetails = false) {
  const title = String(article.title || "").toLowerCase();
  const description = String(article.description || "").toLowerCase();
  const content = String(article.content || "").toLowerCase();
  const scored = categories
    .map((category) => {
      const score = category.rules.reduce((total, [term, weight]) => {
        const normalizedTerm = term.toLowerCase();
        let nextScore = total;
        if (containsTerm(title, normalizedTerm)) nextScore += weight * 2;
        if (containsTerm(description, normalizedTerm)) nextScore += weight;
        if (containsTerm(content, normalizedTerm)) nextScore += Math.ceil(weight / 2);
        return nextScore;
      }, 0);
      return { category, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const result = {
    category: best?.score >= 4 ? best.category.id : "general-tech",
    score: best?.score || 0
  };
  return includeDetails ? result : result.category;
}

function isTechnicalArticle(article) {
  return classifyArticle(article, true).score >= 4;
}

function repairDb(db) {
  let changed = false;
  let removed = 0;
  const syncedCategories = categories.map(publicCategory);
  if (JSON.stringify(db.categories || []) !== JSON.stringify(syncedCategories)) {
    db.categories = syncedCategories;
    changed = true;
  }

  db.articles = (db.articles || []).reduce((kept, article) => {
    const classification = classifyArticle(article, true);
    if (classification.score < 4) {
      removed += 1;
      changed = true;
      return kept;
    }
    if (article.category !== classification.category) {
      article.category = classification.category;
      changed = true;
    }
    kept.push(article);
    return kept;
  }, []);

  if (removed > 0) {
    db.saved = (db.saved || []).filter((id) => db.articles.some((article) => article.id === id));
    db.logs = db.logs || [];
    db.logs.unshift(logEntry("classification", `Removed ${removed} non-technical article(s) and reclassified the feed.`));
  }

  const normalizedUsers = (db.users || []).map((user) => normalizeUser(user));
  const adminIndex = normalizedUsers.findIndex((user) => user.username === "admin" || user.role === "administrator");
  if (adminIndex === -1) {
    normalizedUsers.push(normalizeUser({
      id: "admin",
      username: "admin",
      displayName: "Admin",
      role: "administrator",
      passwordHash: hashPassword("admin123"),
      savedArticles: [],
      preferences: defaultPreferences()
    }));
    changed = true;
  } else if (!normalizedUsers[adminIndex].passwordHash) {
    normalizedUsers[adminIndex].passwordHash = hashPassword("admin123");
    changed = true;
  }
  if (JSON.stringify(db.users || []) !== JSON.stringify(normalizedUsers)) {
    db.users = normalizedUsers;
    changed = true;
  }

  return { db, changed };
}

function normalizeArticle(raw) {
  const idSeed = `${raw.title}-${raw.source}-${raw.publishedAt}`;
  const article = {
    id: crypto.createHash("sha1").update(idSeed).digest("hex").slice(0, 14),
    title: raw.title || "Untitled technical update",
    author: raw.author || "Unknown",
    description: raw.description || "No summary available.",
    source: raw.source?.name || raw.source || "External Source",
    sourceId: slugify(raw.source?.id || raw.sourceId || raw.source?.name || raw.source || "external-source"),
    url: raw.url || "#",
    publishedAt: raw.publishedAt || new Date().toISOString()
  };
  article.category = classifyArticle(article);
  return article;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error("Request body too large"));
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
  });
}

function filterArticles(articles, params, defaults = {}) {
  const q = (params.get("q") || "").trim().toLowerCase();
  const category = params.get("category") || defaults.category || "all";
  const sort = params.get("sort") || defaults.sort || "desc";
  const source = params.get("source") || defaults.source || "all-technology";

  return articles
    .filter((article) => {
      const matchesQuery = !q || `${article.title} ${article.description} ${article.source}`.toLowerCase().includes(q);
      const matchesCategory = category === "all" || article.category === category;
      const matchesSource = !source || source === "all" || source === "all-technology" || source === "all-sources" || article.sourceId === source || slugify(article.source) === source;
      return matchesQuery && matchesCategory && matchesSource;
    })
    .sort((a, b) => {
      const delta = new Date(a.publishedAt) - new Date(b.publishedAt);
      return sort === "asc" ? delta : -delta;
    });
}

function buildNewsApiUrl(sourceId = "all-technology") {
  const selected = newsSources.find((source) => source.id === sourceId) || newsSources[0];
  const apiKey = encodeURIComponent(process.env.NEWS_API_KEY || "");

  if (selected.mode === "top-headlines") {
    return {
      selected,
      url: `https://newsapi.org/v2/top-headlines?sources=${encodeURIComponent(selected.source)}&pageSize=20&apiKey=${apiKey}`
    };
  }

  if (selected.mode === "source-everything") {
    const query = encodeURIComponent(TECH_QUERY);
    return {
      selected,
      url: `https://newsapi.org/v2/everything?sources=${encodeURIComponent(selected.source)}&q=${query}&language=en&sortBy=publishedAt&pageSize=20&apiKey=${apiKey}`
    };
  }

  const query = encodeURIComponent(selected.query);
  return {
    selected,
    url: `https://newsapi.org/v2/everything?q=${query}&language=en&sortBy=publishedAt&pageSize=20&apiKey=${apiKey}`
  };
}

async function aggregateFromNewsApi(sourceId = "all-technology") {
  const { selected, url } = buildNewsApiUrl(sourceId);

  if (!process.env.NEWS_API_KEY) {
    return {
      imported: 0,
      source: selected,
      message: `NEWS_API_KEY is not configured. Add an API key to import articles from ${selected.label}.`
    };
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error(`NewsAPI request failed with ${response.status}`);
  const data = await response.json();
  const incoming = (data.articles || [])
    .filter((article) => article.title && article.description && article.title !== "[Removed]")
    .map(normalizeArticle)
    .filter(isTechnicalArticle);

  const db = await readDb();
  const known = new Set(db.articles.map((article) => article.id));
  const fresh = incoming.filter((article) => !known.has(article.id));
  db.articles = [...fresh, ...db.articles];
  db.logs.unshift(logEntry("aggregation", `Imported ${fresh.length} article(s) from ${selected.label}.`));
  await writeDb(db);
  return {
    imported: fresh.length,
    source: selected,
    message: `Imported ${fresh.length} article(s) from ${selected.label}.`
  };
}

let isAutoSyncRunning = false;

function parseDailySyncHours(value) {
  const fallback = [0, 8, 16];
  const raw = String(value || "0,8,16");
  const hours = [...new Set(
    raw
      .split(",")
      .map((part) => Number(part.trim()))
      .filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23)
  )].sort((a, b) => a - b);
  return hours.length ? hours : fallback;
}

async function runScheduledSync(sourceId) {
  if (isAutoSyncRunning) {
    serverLog("Auto-sync skipped because another sync is still running.");
    return;
  }
  isAutoSyncRunning = true;
  try {
    const result = await aggregateFromNewsApi(sourceId);
    serverLog(`Auto-sync completed: ${result.message}`);
  } catch (error) {
    serverLog(`Auto-sync failed: ${error.message}`);
  } finally {
    isAutoSyncRunning = false;
  }
}

function scheduleDailySync() {
  const autoSyncEnabled = String(process.env.AUTO_SYNC_ENABLED || "true").toLowerCase() !== "false";
  if (!autoSyncEnabled) {
    serverLog("Auto-sync disabled (AUTO_SYNC_ENABLED=false).");
    return;
  }

  if (!process.env.NEWS_API_KEY) {
    serverLog("Auto-sync not started because NEWS_API_KEY is missing.");
    return;
  }

  const sourceId = process.env.AUTO_SYNC_SOURCE || "all-technology";
  const hours = parseDailySyncHours(process.env.AUTO_SYNC_HOURS);
  const scheduleLabel = hours.map((hour) => `${String(hour).padStart(2, "0")}:00`).join(", ");
  serverLog(`Auto-sync scheduled for ${scheduleLabel} (local time) using source '${sourceId}'.`);

  const checkSchedule = () => {
    const now = new Date();
    if (hours.includes(now.getHours()) && now.getMinutes() === 0) {
      runScheduledSync(sourceId);
    }
  };

  checkSchedule();
  setInterval(checkSchedule, 60 * 1000);
}

function getStats(db, currentUser) {
  const byCategory = categories.map((category) => ({
    ...publicCategory(category),
    count: db.articles.filter((article) => article.category === category.id).length
  }));
  return {
    totalArticles: db.articles.length,
    savedArticles: currentUser ? (currentUser.savedArticles || []).length : (db.saved || []).length,
    categories: byCategory,
    lastUpdated: db.logs[0]?.createdAt || new Date().toISOString(),
    apiMode: process.env.NEWS_API_KEY ? "Live NewsAPI ready" : "Curated local feed",
    databaseMode: mongoCollection
      ? "MongoDB connected"
      : process.env.MONGODB_URI
        ? "MongoDB unavailable (fallback local cache)"
        : "Local application cache"
  };
}

async function handleApi(req, res, url) {
  const db = await readDb();
  const requestUser = getRequestUser(db, req);

  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, name: "Technical News Hub", timestamp: new Date().toISOString() });
  }

  if (req.method === "GET" && url.pathname === "/api/categories") {
    return sendJson(res, 200, { categories: db.categories });
  }

  if (req.method === "GET" && url.pathname === "/api/news-sources") {
    return sendJson(res, 200, {
      sources: newsSources.map(({ id, label, description }) => ({ id, label, description }))
    });
  }

  if (req.method === "GET" && url.pathname === "/api/articles") {
    const articles = filterArticles(db.articles, url.searchParams, requestUser?.preferences);
    return sendJson(res, 200, { articles, total: articles.length });
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/articles/")) {
    const id = url.pathname.split("/").pop();
    const article = db.articles.find((item) => item.id === id);
    return article ? sendJson(res, 200, { article }) : sendJson(res, 404, { error: "Article not found" });
  }

  if (req.method === "GET" && url.pathname === "/api/stats") {
    return sendJson(res, 200, { stats: getStats(db, requestUser) });
  }

  if (req.method === "GET" && url.pathname === "/api/logs") {
    return sendJson(res, 200, { logs: db.logs.slice(0, 20) });
  }

  if (req.method === "GET" && url.pathname === "/api/me") {
    if (!requestUser) return sendJson(res, 401, { error: "Not signed in" });
    return sendJson(res, 200, { user: sanitizeUser(requestUser) });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/guest") {
    if (requestUser) {
      return sendJson(res, 200, { token: requestUser.sessionToken, user: sanitizeUser(requestUser) });
    }
    const guest = createGuestUser(db);
    db.logs.unshift(logEntry("auth", `Guest profile created for ${guest.username}.`));
    await writeDb(db);
    return sendJson(res, 200, { token: guest.sessionToken, user: sanitizeUser(guest) });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await parseBody(req);
    const user = findUserByUsername(db, body.username);
    const hashedInput = hashPassword(body.password || "");
    if (user && (user.passwordHash === hashedInput || (user.role === "administrator" && body.username === "admin" && body.password === "admin123"))) {
      issueSessionToken(user);
      db.logs.unshift(logEntry("auth", `${user.displayName || user.username} signed in.`));
      await writeDb(db);
      return sendJson(res, 200, {
        token: user.sessionToken,
        user: sanitizeUser(user)
      });
    }
    db.logs.unshift(logEntry("auth", "Failed sign-in attempt."));
    await writeDb(db);
    return sendJson(res, 401, { error: "Invalid credentials" });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    const body = await parseBody(req);
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!username || !password) return sendJson(res, 400, { error: "username and password are required" });
    if (findUserByUsername(db, username)) return sendJson(res, 409, { error: "Username already exists" });

    const sourcePreferences = requestUser?.preferences || defaultPreferences();
    const sourceSavedArticles = requestUser?.savedArticles || [];
    const user = normalizeUser({
      username,
      displayName: body.displayName || body.username,
      role: "member",
      passwordHash: hashPassword(password),
      savedArticles: sourceSavedArticles,
      preferences: sourcePreferences
    });
    issueSessionToken(user);
    db.users.push(user);
    db.logs.unshift(logEntry("auth", `${user.displayName} created an account.`));
    await writeDb(db);
    return sendJson(res, 201, { token: user.sessionToken, user: sanitizeUser(user) });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    if (requestUser) {
      requestUser.sessionToken = null;
      requestUser.updatedAt = new Date().toISOString();
      db.logs.unshift(logEntry("auth", `${requestUser.displayName || requestUser.username} signed out.`));
      await writeDb(db);
    }
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/api/me/profile") {
    if (!requestUser) return sendJson(res, 401, { error: "Not signed in" });
    const body = await parseBody(req);
    if (body.displayName) {
      requestUser.displayName = String(body.displayName).trim().slice(0, 60) || requestUser.displayName;
      requestUser.updatedAt = new Date().toISOString();
      db.logs.unshift(logEntry("user", `${requestUser.username} updated profile details.`));
      await writeDb(db);
    }
    return sendJson(res, 200, { user: sanitizeUser(requestUser) });
  }

  if (req.method === "GET" && url.pathname === "/api/preferences") {
    if (!requestUser) return sendJson(res, 401, { error: "Not signed in" });
    return sendJson(res, 200, { preferences: requestUser.preferences });
  }

  if (req.method === "POST" && url.pathname === "/api/preferences") {
    if (!requestUser) return sendJson(res, 401, { error: "Not signed in" });
    const body = await parseBody(req);
    requestUser.preferences = {
      ...defaultPreferences(),
      ...(requestUser.preferences || {}),
      ...(body.preferences || body)
    };
    requestUser.preferences.category = requestUser.preferences.category || "all";
    requestUser.preferences.sort = requestUser.preferences.sort || "desc";
    requestUser.preferences.source = requestUser.preferences.source || "all-technology";
    requestUser.updatedAt = new Date().toISOString();
    db.logs.unshift(logEntry("user", `${requestUser.username} updated preferences.`));
    await writeDb(db);
    return sendJson(res, 200, { preferences: requestUser.preferences, user: sanitizeUser(requestUser) });
  }

  if (req.method === "POST" && url.pathname === "/api/saved") {
    if (!requestUser) return sendJson(res, 401, { error: "Not signed in" });
    const body = await parseBody(req);
    if (!body.articleId) return sendJson(res, 400, { error: "articleId is required" });
    requestUser.savedArticles = requestUser.savedArticles || [];
    requestUser.savedArticles = requestUser.savedArticles.includes(body.articleId)
      ? requestUser.savedArticles.filter((id) => id !== body.articleId)
      : [...requestUser.savedArticles, body.articleId];
    requestUser.updatedAt = new Date().toISOString();
    db.logs.unshift(logEntry("user", `Saved article list updated for ${requestUser.username}.`));
    await writeDb(db);
    return sendJson(res, 200, { saved: requestUser.savedArticles, user: sanitizeUser(requestUser) });
  }

  if (req.method === "GET" && url.pathname === "/api/saved") {
    if (!requestUser) return sendJson(res, 401, { error: "Not signed in" });
    return sendJson(res, 200, { saved: requestUser.savedArticles || [] });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/categories") {
    const body = await parseBody(req);
    if (!body.name) return sendJson(res, 400, { error: "Category name is required" });
    const id = body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    if (!db.categories.some((category) => category.id === id)) {
      db.categories.push({ id, name: body.name, accent: body.accent || "#334155", keywords: body.keywords || [] });
      db.logs.unshift(logEntry("admin", `Category '${body.name}' created.`));
      await writeDb(db);
    }
    return sendJson(res, 201, { categories: db.categories });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/sync") {
    try {
      const body = await parseBody(req);
      const result = await aggregateFromNewsApi(body.source || "all-technology");
      return sendJson(res, 200, result);
    } catch (error) {
      db.logs.unshift(logEntry("error", error.message));
      await writeDb(db);
      return sendJson(res, 502, { error: error.message });
    }
  }

  return sendJson(res, 404, { error: "API route not found" });
}

function serveStatic(req, res, url) {
  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      fs.readFile(path.join(PUBLIC_DIR, "index.html"), (fallbackError, fallback) => {
        if (fallbackError) {
          res.writeHead(404);
          return res.end("Not found");
        }
        res.writeHead(200, { "content-type": mimeTypes[".html"] });
        res.end(fallback);
      });
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, {
      "content-type": mimeTypes[ext] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
    } else {
      serveStatic(req, res, url);
    }
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Internal server error" });
  }
});

async function start() {
  await connectMongoDb();
  await ensureDb();
  server.listen(PORT, () => {
    serverLog(`Technical News Hub running at http://localhost:${PORT}`);
    serverLog("Admin login: admin / admin123");
    scheduleDailySync();
  });
}

start().catch((error) => {
  serverLog(`Startup failed: ${error.stack || error.message}`);
  process.exit(1);
});
