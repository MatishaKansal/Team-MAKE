const { useEffect, useMemo, useState } = React;

const AUTH_TOKEN_KEY = "technical-news-hub-auth-token";

function readAuthToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function writeAuthToken(token) {
  try {
    if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
    else localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // Local storage can be unavailable in restricted browsers.
  }
}

const api = {
  async request(path, method = "GET", body) {
    const headers = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    const token = readAuthToken();
    if (token) headers["x-user-token"] = token;
    const response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
  },
  get(path) {
    return this.request(path, "GET");
  },
  post(path, body = {}) {
    return this.request(path, "POST", body);
  }
};

const ICONS = {
  search: "M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z",
  filter: "M3 5h18M6 12h12M10 19h4",
  refresh: "M21 12a9 9 0 0 1-15.6 6.1L3 16M3 16v5h5M3 12A9 9 0 0 1 18.6 5.9L21 8M21 8V3h-5",
  bookmark: "M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z",
  external: "M14 3h7v7M21 3l-9 9M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z",
  chart: "M4 19V5M4 19h17M8 16v-5M13 16V8M18 16v-9",
  user: "M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z",
  clock: "M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  spark: "M13 2l1.8 5.5L20 9l-5.2 1.5L13 16l-1.8-5.5L6 9l5.2-1.5L13 2ZM5 14l.9 2.8L9 18l-3.1 1.2L5 22l-.9-2.8L1 18l3.1-1.2L5 14Z",
  close: "M18 6 6 18M6 6l12 12",
  eye: "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  bolt: "M13 2 4 14h7l-1 8 10-13h-7l1-7Z",
  database: "M4 6c0-2 16-2 16 0s-16 2-16 0ZM4 6v6c0 2 16 2 16 0V6M4 12v6c0 2 16 2 16 0v-6"
};

function Icon({ name, size = 18 }) {
  return React.createElement("svg", {
    viewBox: "0 0 24 24",
    width: size,
    height: size,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  }, React.createElement("path", { d: ICONS[name] || ICONS.search }));
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function readingTime(article) {
  const words = `${article.title} ${article.description}`.trim().split(/\s+/).length;
  return `${Math.max(1, Math.ceil(words / 120))} min read`;
}

function relativeFreshness(value) {
  const days = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 86400000));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function App() {
  const [articles, setArticles] = useState([]);
  const [allArticles, setAllArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [newsSources, setNewsSources] = useState([]);
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [saved, setSaved] = useState([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("desc");
  const [source, setSource] = useState("all-technology");
  const [view, setView] = useState("feed");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [admin, setAdmin] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  function applyUserSession(user, token) {
    setCurrentUser(user);
    setAdmin(user?.role === "administrator" ? user : null);
    if (token) writeAuthToken(token);
    setCategory(user?.preferences?.category || "all");
    setSort(user?.preferences?.sort || "desc");
    setSource(user?.preferences?.source || "all-technology");
  }

  async function bootstrapProfile() {
    const token = readAuthToken();
    try {
      if (token) {
        const data = await api.get("/api/me");
        applyUserSession(data.user, token);
      } else {
        const data = await api.post("/api/auth/guest");
        applyUserSession(data.user, data.token);
      }
    } catch {
      writeAuthToken("");
      const data = await api.post("/api/auth/guest");
      applyUserSession(data.user, data.token);
    } finally {
      setAuthReady(true);
    }
  }

  async function loadData(options = {}) {
    const clearStatus = options.clearStatus !== false;
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: query, category, sort, source });
      const [articleData, allArticleData, categoryData, sourceData, statsData, logsData, savedData] = await Promise.all([
        api.get(`/api/articles?${params}`),
        api.get("/api/articles?category=all&sort=desc&source=all"),
        api.get("/api/categories"),
        api.get("/api/news-sources"),
        api.get("/api/stats"),
        api.get("/api/logs"),
        api.get("/api/saved")
      ]);
      setArticles(articleData.articles);
      setAllArticles(allArticleData.articles);
      setStats(statsData.stats);
      setCategories(categoryData.categories.map((item) => ({
        ...item,
        count: statsData.stats.categories.find((categoryItem) => categoryItem.id === item.id)?.count || 0
      })));
      setNewsSources(sourceData.sources);
      setLogs(logsData.logs);
      setSaved(savedData.saved);
      if (clearStatus) setStatus("");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    bootstrapProfile();
  }, []);

  useEffect(() => {
    if (!authReady) return;
    const timer = setTimeout(loadData, 170);
    return () => clearTimeout(timer);
  }, [authReady, query, category, sort, source, currentUser?.id]);

  useEffect(() => {
    if (!currentUser) return;
    setCategory(currentUser.preferences?.category || "all");
    setSort(currentUser.preferences?.sort || "desc");
    setSource(currentUser.preferences?.source || "all-technology");
  }, [currentUser?.id]);

  const activeCategory = useMemo(
    () => categories.find((item) => item.id === category),
    [categories, category]
  );

  const featuredArticle = articles[0] || allArticles[0];
  const topCategories = useMemo(
    () => [...categories].sort((a, b) => b.count - a.count).slice(0, 3),
    [categories]
  );

  async function toggleSaved(articleId) {
    if (!currentUser) {
      setStatus("Please wait for your profile to load.");
      return;
    }
    const data = await api.post("/api/saved", { articleId });
    setSaved(data.saved);
    if (data.user) {
      setCurrentUser(data.user);
      setAdmin(data.user.role === "administrator" ? data.user : null);
    }
    setStats((previous) => previous
      ? {
          ...previous,
          savedArticles: data.saved.length
        }
      : previous);
  }

  async function savePreferences(nextPreferences) {
    const data = await api.post("/api/preferences", { preferences: nextPreferences });
    setCurrentUser(data.user);
    setCategory(data.user.preferences.category || "all");
    setSort(data.user.preferences.sort || "desc");
    setSource(data.user.preferences.source || "all-technology");
    setStatus("Preferences saved.");
  }

  async function updateDisplayName(displayName) {
    const data = await api.post("/api/me/profile", { displayName });
    setCurrentUser(data.user);
    setStatus("Profile updated.");
  }

  async function signIn(username, password) {
    const data = await api.post("/api/auth/login", { username, password });
    writeAuthToken(data.token);
    applyUserSession(data.user, data.token);
    setStatus(`Signed in as ${data.user.displayName}.`);
    return data.user;
  }

  async function registerAccount(username, password, displayName) {
    const data = await api.post("/api/auth/register", { username, password, displayName });
    writeAuthToken(data.token);
    applyUserSession(data.user, data.token);
    setStatus(`Created account for ${data.user.displayName}.`);
    return data.user;
  }

  async function signOut() {
    try {
      await api.post("/api/auth/logout");
    } catch {
      // Sign-out should still continue locally.
    }
    writeAuthToken("");
    const data = await api.post("/api/auth/guest");
    applyUserSession(data.user, data.token);
    setView("profile");
    setStatus("Switched to a fresh local profile.");
  }

  async function syncNews(targetSource = source || "all-technology") {
    const sourceLabel = newsSources.find((item) => item.id === targetSource)?.label || "selected source";
    setStatus("Refreshing the newsroom feed...");
    try {
      const result = await api.post("/api/admin/sync", { source: targetSource });
      await loadData({ clearStatus: false });
      setStatus(result.message);
    } catch (error) {
      setStatus(`Could not import from ${sourceLabel}: ${error.message}`);
    }
  }

  return React.createElement("main", { className: "appShell", "data-view": view },
    React.createElement(Header, { view, setView, admin, currentUser, signOut }),
    view !== "profile" && React.createElement(Hero, { stats, featuredArticle, topCategories, syncNews }),
    view !== "profile" && React.createElement(ControlPanel, {
      query,
      setQuery,
      category,
      setCategory,
      sort,
      setSort,
      source,
      setSource,
      categories,
      newsSources,
      syncNews
    }),
    status && React.createElement("div", { className: "notice" },
      React.createElement(Icon, { name: "bolt" }),
      React.createElement("span", null, status)
    ),
    view === "feed" && React.createElement(FeedView, {
      articles,
      categories,
      saved,
      toggleSaved,
      loading,
      activeCategory,
      setCategory,
      selectedArticle,
      setSelectedArticle
    }),
    view === "saved" && React.createElement(SavedView, {
      articles: allArticles,
      saved,
      categories,
      toggleSaved,
      setSelectedArticle
    }),
    view === "profile" && React.createElement(ProfileView, {
      currentUser,
      categories,
      newsSources,
      savePreferences,
      updateDisplayName,
      registerAccount,
      signIn,
      signOut
    }),
    view === "admin" && React.createElement(AdminView, { stats, logs, admin, setAdmin, syncNews, newsSources, onAuthSuccess: applyUserSession }),
    selectedArticle && React.createElement(ArticleModal, {
      article: selectedArticle,
      category: categories.find((item) => item.id === selectedArticle.category),
      saved: saved.includes(selectedArticle.id),
      toggleSaved,
      onClose: () => setSelectedArticle(null)
    })
  );
}

function Header({ view, setView, admin, currentUser, signOut }) {
  return React.createElement("header", { className: "topbar" },
    React.createElement("button", { className: "brand", onClick: () => setView("feed") },
      React.createElement("span", { className: "brandMark" },
        React.createElement(Icon, { name: "spark", size: 21 })
      ),
      React.createElement("span", null,
        React.createElement("strong", null, "Technical News Hub"),
        React.createElement("small", null, "Intelligent technology briefing")
      )
    ),
    React.createElement("nav", { "aria-label": "Primary navigation" },
      ["feed", "saved", "profile", "admin"].map((item) =>
        React.createElement("button", {
          key: item,
          className: view === item ? "active" : "",
          onClick: () => setView(item)
        }, item === "feed" ? "Newsroom" : item === "saved" ? "Saved" : item === "profile" ? "Profile" : admin ? "Admin" : "Admin Login")
      )
    ),
    (view !== "feed" && view !== "saved") && React.createElement("div", { className: "headerMeta" },
      currentUser && React.createElement("div", { className: "userBadge" },
        React.createElement(Icon, { name: "user", size: 16 }),
        React.createElement("span", null, currentUser.displayName || currentUser.username),
        React.createElement("small", null, currentUser.role === "administrator" ? "Administrator" : currentUser.isGuest ? "Local profile" : "Member")
      ),
      currentUser && React.createElement("button", { className: "secondaryButton headerAction", onClick: signOut }, "Switch profile")
    )
  );
}

function Hero({ stats, featuredArticle, topCategories, syncNews }) {
  return React.createElement("section", { className: "hero" },
    React.createElement("div", { className: "heroCopy" },
      React.createElement("p", { className: "eyebrow" },
        React.createElement("span", null),
        "Live technical intelligence"
      ),
      React.createElement("h1", null, "Technical News Hub"),
      React.createElement("p", null, "A refined application for collecting, classifying, and exploring technology news across AI, software development, cybersecurity, data science, and cloud computing."),
      React.createElement("div", { className: "heroActions" },
        React.createElement("button", { className: "primaryButton", onClick: () => syncNews() },
          React.createElement(Icon, { name: "refresh" }),
          "Refresh Feed"
        ),
        React.createElement("a", { className: "secondaryButton", href: "#feed" }, "Explore Articles")
      )
    ),
    React.createElement("div", { className: "heroBoard" },
      React.createElement("div", { className: "signalHeader" },
        React.createElement("span", null, "Newsroom status"),
        React.createElement("strong", null, stats?.apiMode || "Connecting")
      ),
      React.createElement("div", { className: "signalGrid" },
        React.createElement(MiniStat, { label: "Articles", value: stats?.totalArticles ?? "-" }),
        React.createElement(MiniStat, { label: "Saved", value: stats?.savedArticles ?? "-" }),
        React.createElement(MiniStat, { label: "Domains", value: stats?.categories?.length ?? "-" })
      ),
      featuredArticle && React.createElement("div", { className: "featuredBrief" },
        React.createElement("span", null, "Top briefing"),
        React.createElement("strong", null, featuredArticle.title),
        React.createElement("small", null, `${featuredArticle.source} / ${relativeFreshness(featuredArticle.publishedAt)}`)
      ),
      React.createElement("div", { className: "ticker" },
        React.createElement("div", null,
          [...topCategories, ...topCategories].map((item, index) => React.createElement("span", { key: `${item.id}-${index}` }, `${item.name}: ${item.count}`))
        )
      )
    )
  );
}

function MiniStat({ label, value }) {
  return React.createElement("div", { className: "miniStat" },
    React.createElement("strong", null, value),
    React.createElement("span", null, label)
  );
}

function ControlPanel({ query, setQuery, category, setCategory, sort, setSort, source, setSource, categories, newsSources, syncNews }) {
  return React.createElement("section", { className: "controlPanel" },
    React.createElement("label", { className: "searchBox" },
      React.createElement(Icon, { name: "search" }),
      React.createElement("input", {
        value: query,
        onChange: (event) => setQuery(event.target.value),
        placeholder: "Search title, summary, or source"
      })
    ),
    React.createElement("div", { className: "chipScroller", role: "list", "aria-label": "News domains" },
      React.createElement("button", {
        className: category === "all" ? "chip active" : "chip",
        onClick: () => setCategory("all")
      }, "All"),
      categories.map((item) => React.createElement("button", {
        key: item.id,
        className: category === item.id ? "chip active" : "chip",
        style: { "--chip": item.accent },
        onClick: () => setCategory(item.id)
      }, item.name))
    ),
    React.createElement("div", { className: "controlActions" },
      React.createElement("label", { className: "selectBox sourceSelect" },
        React.createElement(Icon, { name: "spark" }),
        React.createElement("select", { value: source, onChange: (event) => setSource(event.target.value) },
          (newsSources.length ? newsSources : [{ id: "all-technology", label: "All Technology Sources" }])
            .map((item) => React.createElement("option", { key: item.id, value: item.id }, item.label))
        )
      ),
      React.createElement("label", { className: "selectBox" },
        React.createElement(Icon, { name: "filter" }),
        React.createElement("select", { value: sort, onChange: (event) => setSort(event.target.value) },
          React.createElement("option", { value: "desc" }, "Newest first"),
          React.createElement("option", { value: "asc" }, "Oldest first")
        )
      ),
      React.createElement("button", { className: "iconButton", onClick: () => syncNews(), title: "Refresh feed" },
        React.createElement(Icon, { name: "refresh" })
      )
    )
  );
}

function FeedView({ articles, categories, saved, toggleSaved, loading, activeCategory, setCategory, setSelectedArticle }) {
  return React.createElement("section", { className: "contentGrid", id: "feed" },
    React.createElement("aside", { className: "domainRail" },
      React.createElement("div", { className: "railHeader" },
        React.createElement("h2", null, "Domain Pulse"),
        React.createElement("p", null, "Classified by keyword intelligence")
      ),
      categories.map((item) => React.createElement("button", {
        className: "domainItem",
        key: item.id,
        onClick: () => setCategory(item.id)
      },
        React.createElement("span", { style: { background: item.accent } }),
        React.createElement("p", null, item.name),
        React.createElement("strong", null, item.count)
      )),
      React.createElement("div", { className: "railNote" },
        React.createElement(Icon, { name: "database" }),
        React.createElement("span", null, "Articles are normalized, deduplicated, classified, and stored before appearing in the feed.")
      )
    ),
    React.createElement("section", { className: "feed" },
      React.createElement("div", { className: "sectionTitle" },
        React.createElement("div", null,
          React.createElement("p", { className: "kicker" }, "Curated feed"),
          React.createElement("h2", null, activeCategory ? activeCategory.name : "Latest Technical News"),
          React.createElement("p", null, `${articles.length} ${articles.length === 1 ? "article" : "articles"} matched your current filters`)
        )
      ),
      loading
        ? React.createElement(LoadingGrid, null)
        : articles.length
          ? React.createElement("div", { className: "articleGrid" },
              articles.map((article, index) => React.createElement(ArticleCard, {
                key: article.id,
                article,
                category: categories.find((item) => item.id === article.category),
                saved: saved.includes(article.id),
                toggleSaved,
                setSelectedArticle,
                index
              }))
            )
          : React.createElement("div", { className: "emptyState" },
              React.createElement(Icon, { name: "search", size: 30 }),
              React.createElement("strong", null, "No matching articles"),
              React.createElement("span", null, "Try a broader keyword or choose another technology domain.")
            )
    )
  );
}

function LoadingGrid() {
  return React.createElement("div", { className: "articleGrid" },
    [0, 1, 2, 3].map((item) => React.createElement("div", { className: "skeletonCard", key: item },
      React.createElement("span", null),
      React.createElement("strong", null),
      React.createElement("p", null),
      React.createElement("i", null)
    ))
  );
}

function ArticleCard({ article, category, saved, toggleSaved, setSelectedArticle, index }) {
  return React.createElement("article", {
    className: "articleCard",
    style: { "--accent": category?.accent || "#0f766e", "--delay": `${Math.min(index, 8) * 65}ms` }
  },
    React.createElement("div", { className: "articleTopline" },
      React.createElement("span", { className: "categoryPill" }, category?.name || "Technology"),
      React.createElement("time", null, relativeFreshness(article.publishedAt))
    ),
    React.createElement("h3", null, article.title),
    React.createElement("p", null, article.description),
    React.createElement("div", { className: "articleFoot" },
      React.createElement("div", null,
        React.createElement("strong", null, article.source),
        React.createElement("span", null, `${formatDate(article.publishedAt)} / ${readingTime(article)}`)
      ),
      React.createElement("div", { className: "iconGroup" },
        React.createElement("button", {
          className: saved ? "saved" : "",
          onClick: () => toggleSaved(article.id),
          title: saved ? "Remove saved article" : "Save article"
        }, React.createElement(Icon, { name: "bookmark" })),
        React.createElement("button", {
          onClick: () => setSelectedArticle(article),
          title: "View article details"
        }, React.createElement(Icon, { name: "eye" })),
        React.createElement("a", { href: article.url, target: "_blank", rel: "noreferrer", title: "Open source" },
          React.createElement(Icon, { name: "external" })
        )
      )
    )
  );
}

function SavedView({ articles, saved, categories, toggleSaved, setSelectedArticle }) {
  const savedArticles = articles.filter((article) => saved.includes(article.id));
  return React.createElement("section", { className: "singleColumn" },
    React.createElement("div", { className: "sectionTitle" },
      React.createElement("div", null,
        React.createElement("p", { className: "kicker" }, "Reading list"),
        React.createElement("h2", null, "Saved Articles"),
        React.createElement("p", null, "A focused collection for follow-up reading and presentation references")
      )
    ),
    savedArticles.length
      ? React.createElement("div", { className: "articleGrid" },
          savedArticles.map((article, index) => React.createElement(ArticleCard, {
            key: article.id,
            article,
            category: categories.find((item) => item.id === article.category),
            saved: true,
            toggleSaved,
            setSelectedArticle,
            index
          }))
        )
      : React.createElement("div", { className: "emptyState" },
          React.createElement(Icon, { name: "bookmark", size: 30 }),
          React.createElement("strong", null, "No saved articles yet"),
          React.createElement("span", null, "Save articles from the newsroom to build your personal technical brief.")
        )
  );
}

function AdminView({ stats, logs, admin, setAdmin, syncNews, newsSources, onAuthSuccess }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [message, setMessage] = useState("");
  const [selectedSource, setSelectedSource] = useState("all-technology");

  async function login(event) {
    event.preventDefault();
    try {
      const data = await api.post("/api/auth/login", { username, password });
      setAdmin(data.user);
      if (onAuthSuccess) onAuthSuccess(data.user, data.token);
      setMessage("Signed in as administrator.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  if (!admin) {
    return React.createElement("section", { className: "adminLayout" },
      React.createElement("form", { className: "loginBox", onSubmit: login },
        React.createElement("div", { className: "loginIcon" }, React.createElement(Icon, { name: "shield", size: 30 })),
        React.createElement("h2", null, "Administrator Access"),
        React.createElement("p", null, "Sign in to monitor API activity, domain distribution, system logs, and feed synchronization."),
        React.createElement("input", { value: username, onChange: (event) => setUsername(event.target.value), placeholder: "Username" }),
        React.createElement("input", { value: password, onChange: (event) => setPassword(event.target.value), placeholder: "Password", type: "password" }),
        React.createElement("button", { className: "primaryButton" }, "Sign in"),
        message && React.createElement("small", null, message)
      )
    );
  }

  return React.createElement("section", { className: "adminLayout" },
    React.createElement("div", { className: "metricGrid" },
      React.createElement(Metric, { icon: "chart", label: "Articles", value: stats?.totalArticles }),
      React.createElement(Metric, { icon: "bookmark", label: "Saved", value: stats?.savedArticles }),
      React.createElement(Metric, { icon: "shield", label: "Availability Target", value: "99%" }),
      React.createElement(Metric, { icon: "user", label: "Role", value: admin.role })
    ),
    React.createElement("div", { className: "adminPanels" },
      React.createElement("section", null,
        React.createElement("div", { className: "sectionTitle" },
          React.createElement("div", null,
            React.createElement("p", { className: "kicker" }, "Operations"),
            React.createElement("h2", null, "Category Distribution"),
            React.createElement("p", null, "Article volume across classified technology domains")
          ),
          React.createElement("div", { className: "syncControls" },
            React.createElement("label", { className: "selectBox sourceSelect" },
              React.createElement(Icon, { name: "filter" }),
              React.createElement("select", {
                value: selectedSource,
                onChange: (event) => setSelectedSource(event.target.value)
              },
                (newsSources.length ? newsSources : [{ id: "all-technology", label: "All Technology Sources" }])
                  .map((source) => React.createElement("option", { key: source.id, value: source.id }, source.label))
              )
            ),
            React.createElement("button", { className: "primaryButton compact", onClick: () => syncNews(selectedSource) },
              React.createElement(Icon, { name: "refresh" }),
              "Import"
            )
          )
        ),
        React.createElement("div", { className: "bars" },
          (stats?.categories || []).map((item) =>
            React.createElement("div", { key: item.id, className: "barRow" },
              React.createElement("span", null, item.name),
              React.createElement("div", null,
                React.createElement("i", { style: { width: `${Math.max(item.count * 14, 8)}%`, background: item.accent } })
              ),
              React.createElement("strong", null, item.count)
            )
          )
        )
      ),
      React.createElement("section", null,
        React.createElement("div", { className: "sectionTitle" },
          React.createElement("div", null,
            React.createElement("p", { className: "kicker" }, "Audit trail"),
            React.createElement("h2", null, "System Logs"),
            React.createElement("p", null, "Authentication, API, sync, and user activity")
          )
        ),
        React.createElement("div", { className: "logList" },
          logs.map((log) => React.createElement("div", { key: log.id },
            React.createElement("strong", null, log.type),
            React.createElement("p", null, log.message),
            React.createElement("time", null, formatDate(log.createdAt))
          ))
        )
      )
    )
  );
}

function ProfileView({ currentUser, categories, newsSources, savePreferences, updateDisplayName, registerAccount, signIn, signOut }) {
  const [displayName, setDisplayName] = useState(currentUser?.displayName || "");
  const [prefCategory, setPrefCategory] = useState(currentUser?.preferences?.category || "all");
  const [prefSort, setPrefSort] = useState(currentUser?.preferences?.sort || "desc");
  const [prefSource, setPrefSource] = useState(currentUser?.preferences?.source || "all-technology");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setDisplayName(currentUser?.displayName || "");
    setPrefCategory(currentUser?.preferences?.category || "all");
    setPrefSort(currentUser?.preferences?.sort || "desc");
    setPrefSource(currentUser?.preferences?.source || "all-technology");
  }, [currentUser?.id]);

  async function handleProfileSave(event) {
    event.preventDefault();
    try {
      await updateDisplayName(displayName);
      setMessage("Profile updated.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handlePreferencesSave(event) {
    event.preventDefault();
    try {
      await savePreferences({ category: prefCategory, sort: prefSort, source: prefSource });
      setMessage("Preferences saved.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    try {
      await registerAccount(username, password, displayName || username);
      setMessage("Account created.");
      setPassword("");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleSignIn(event) {
    event.preventDefault();
    try {
      await signIn(username, password);
      setMessage("Signed in.");
      setPassword("");
    } catch (error) {
      setMessage(error.message);
    }
  }

  return React.createElement("section", { className: "profileLayout" },
    React.createElement("div", { className: "profileSummary cardBlock" },
      React.createElement("div", { className: "sectionTitle" },
        React.createElement("div", null,
          React.createElement("p", { className: "kicker" }, "Your account"),
          React.createElement("h2", null, currentUser?.displayName || "Local Profile"),
          React.createElement("p", null, "Saved articles and preferences are tied to this profile only.")
        )
      ),
      React.createElement("div", { className: "profileGrid" },
        React.createElement("div", { className: "profileStat" }, React.createElement("strong", null, currentUser?.username || "guest"), React.createElement("span", null, "Username")),
        React.createElement("div", { className: "profileStat" }, React.createElement("strong", null, currentUser?.role || "guest"), React.createElement("span", null, "Role")),
        React.createElement("div", { className: "profileStat" }, React.createElement("strong", null, currentUser?.savedCount ?? 0), React.createElement("span", null, "Saved articles"))
      ),
      React.createElement("form", { className: "profileForm", onSubmit: handleProfileSave },
        React.createElement("label", null,
          React.createElement("span", null, "Display name"),
          React.createElement("input", { value: displayName, onChange: (event) => setDisplayName(event.target.value), placeholder: "Your name" })
        ),
        React.createElement("button", { className: "primaryButton compact", type: "submit" }, "Save profile")
      )
    ),
    React.createElement("div", { className: "profilePanels" },
      React.createElement("section", { className: "cardBlock" },
        React.createElement("div", { className: "sectionTitle" },
          React.createElement("div", null,
            React.createElement("p", { className: "kicker" }, "Preferences"),
            React.createElement("h2", null, "Default feed settings"),
            React.createElement("p", null, "These choices open your personalized newsroom the way you left it.")
          )
        ),
        React.createElement("form", { className: "preferencesForm", onSubmit: handlePreferencesSave },
          React.createElement("label", { className: "selectBox" },
            React.createElement(Icon, { name: "filter" }),
            React.createElement("select", { value: prefCategory, onChange: (event) => setPrefCategory(event.target.value) },
              React.createElement("option", { value: "all" }, "All categories"),
              categories.map((item) => React.createElement("option", { key: item.id, value: item.id }, item.name))
            )
          ),
          React.createElement("label", { className: "selectBox" },
            React.createElement(Icon, { name: "spark" }),
            React.createElement("select", { value: prefSource, onChange: (event) => setPrefSource(event.target.value) },
              (newsSources.length ? newsSources : [{ id: "all-technology", label: "All Technology Sources" }])
                .map((item) => React.createElement("option", { key: item.id, value: item.id }, item.label))
            )
          ),
          React.createElement("label", { className: "selectBox" },
            React.createElement(Icon, { name: "clock" }),
            React.createElement("select", { value: prefSort, onChange: (event) => setPrefSort(event.target.value) },
              React.createElement("option", { value: "desc" }, "Newest first"),
              React.createElement("option", { value: "asc" }, "Oldest first")
            )
          ),
          React.createElement("button", { className: "primaryButton", type: "submit" }, "Save preferences")
        )
      ),
      React.createElement("section", { className: "cardBlock" },
        React.createElement("div", { className: "sectionTitle" },
          React.createElement("div", null,
            React.createElement("p", { className: "kicker" }, "Account access"),
            React.createElement("h2", null, currentUser?.role === "guest" ? "Create your account" : "Manage sign-in"),
            React.createElement("p", null, "Create a named account or sign in with another profile on this device.")
          )
        ),
        React.createElement("form", { className: "profileForm", onSubmit: handleRegister },
          React.createElement("label", null,
            React.createElement("span", null, "Username"),
            React.createElement("input", { value: username, onChange: (event) => setUsername(event.target.value), placeholder: "username" })
          ),
          React.createElement("label", null,
            React.createElement("span", null, "Password"),
            React.createElement("input", { value: password, onChange: (event) => setPassword(event.target.value), placeholder: "password", type: "password" })
          ),
          React.createElement("div", { className: "buttonRow" },
            React.createElement("button", { className: "secondaryButton", type: "button", onClick: handleSignIn }, "Sign in"),
            React.createElement("button", { className: "primaryButton", type: "submit" }, "Create account")
          )
        ),
        React.createElement("button", { className: "secondaryButton signOutButton", onClick: signOut }, "Switch to fresh profile")
      )
    ),
    message && React.createElement("div", { className: "notice profileNotice" }, React.createElement(Icon, { name: "bolt" }), React.createElement("span", null, message))
  );
}

function Metric({ icon, label, value }) {
  return React.createElement("div", { className: "metric" },
    React.createElement(Icon, { name: icon }),
    React.createElement("span", null, label),
    React.createElement("strong", null, value ?? "-")
  );
}

function ArticleModal({ article, category, saved, toggleSaved, onClose }) {
  return React.createElement("div", { className: "modalBackdrop", role: "dialog", "aria-modal": "true" },
    React.createElement("section", { className: "articleModal", style: { "--accent": category?.accent || "#0f766e" } },
      React.createElement("button", { className: "modalClose", onClick: onClose, title: "Close" },
        React.createElement(Icon, { name: "close" })
      ),
      React.createElement("span", { className: "categoryPill" }, category?.name || "Technology"),
      React.createElement("h2", null, article.title),
      React.createElement("p", null, article.description),
      React.createElement("div", { className: "modalMeta" },
        React.createElement("span", null, article.source),
        React.createElement("span", null, formatDate(article.publishedAt)),
        React.createElement("span", null, readingTime(article))
      ),
      React.createElement("div", { className: "modalActions" },
        React.createElement("button", { className: "secondaryButton", onClick: () => toggleSaved(article.id) },
          React.createElement(Icon, { name: "bookmark" }),
          saved ? "Saved" : "Save"
        ),
        React.createElement("a", { className: "primaryButton", href: article.url, target: "_blank", rel: "noreferrer" },
          React.createElement(Icon, { name: "external" }),
          "Open Source"
        )
      )
    )
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));
