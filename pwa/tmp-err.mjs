const files = ["/src/App.jsx","/src/workspace.jsx","/src/liveChat.jsx","/src/messageAnalytics.jsx","/src/messageWallet.jsx","/src/earningsDashboard.jsx","/src/officialReport.jsx","/src/i18n.js","/src/phrases.js","/src/phraseA.js","/src/phraseB.js","/src/phraseC.js","/src/notice.js"];
for (const file of files) {
  const res = await fetch("http://localhost:5173" + file);
  const text = await res.text();
  const raw = text.match(/"message":"([\s\S]*?)","stack"/)?.[1] || "";
  console.log(res.status, file, raw ? raw.replace(/\\n/g, "\n").slice(0, 300) : "ok");
}
process.exit(0);
