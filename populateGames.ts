// populateGames.ts
(async () => {
  try {
    const res = await fetch("http://localhost:3000/api/fetchGames");
    const data = await res.json();
    console.log("Games upserted:", data);
  } catch (err) {
    console.error(err);
  }
})();
