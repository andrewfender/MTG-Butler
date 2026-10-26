const fetchOptions = { headers: { "Accept": "application/json" } };

// The script is deferred, so the page is already parsed
const docSpinner = document.getElementById("loading-spinner");
const docCardList = document.getElementById("card-list");
const docResultsCounter = document.getElementById("results-counter");
const docSearchBox = document.getElementById("search-box");
const docSearchError = document.getElementById("search-error");
const docLoadMore = document.getElementById("load-more");

let spinnerTimer;
let heldHeight = 0;  // Page height held after a set closes (see holdHeight)

// State of the current search (see newSearch); null until the first search
let search = null;

// Fetch all sets, in Scryfall's order (most recent first). Searches don't wait for this to start their
// first request; they only wait for it before sorting cards into sets.
const setsByCode = {};
const setsLoaded = fetch("https://api.scryfall.com/sets", fetchOptions)
.then((response) => {
  if (!response.ok) {
    throw new Error(`Couldn't load the set list from Scryfall (HTTP ${response.status}).`);
  }
  return response.json();
})
.then((json) => {
  const today = new Date().toISOString().slice(0, 10);
  json.data.forEach((set, index) => {
    setsByCode[set.code] = {
      code: set.code,
      name: set.name,
      index,
      releasedAt: set.released_at || "",
      isUnreleased: set.released_at > today
    };
  });
});
setsLoaded.catch((error) => showError(error.message));

document.getElementById("search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  doSearch(docSearchBox.value.trim(), true);
});

docLoadMore.addEventListener("click", loadMore);

// Card images only load once their set is opened; closed sets would otherwise still download them.
// The toggle event doesn't bubble, so it's caught on the way down instead.
docCardList.addEventListener("toggle", (event) => {
  if (!event.target.open) return;
  event.target.querySelectorAll("img[data-src]").forEach((img) => {
    img.src = img.dataset.src;
    img.removeAttribute("data-src");
  });
}, true);

// Closing a set shortens the page, and near the bottom that would drag the view up with it. So when a set
// closes, the page keeps its height for now; the spare space goes again as the page is scrolled back up.
docCardList.addEventListener("click", (event) => {
  const summary = event.target.closest("summary");
  if (summary && summary.parentElement.open) holdHeight(scrollY + innerHeight);
});
window.addEventListener("scroll", () => {
  if (heldHeight > scrollY + innerHeight) holdHeight(scrollY + innerHeight);
});

// Back/forward buttons restore the search from the URL
window.addEventListener("popstate", loadFromURL);

// Run the search linked in the URL, if any
loadFromURL();

function holdHeight(height) {
  heldHeight = height;
  document.documentElement.style.minHeight = height ? `${height}px` : "";
}

function setLoading(loading) {
  // Only show the spinner if loading takes a moment, so quick loads don't flash it
  clearTimeout(spinnerTimer);
  if (loading) {
    spinnerTimer = setTimeout(() => docSpinner.classList.add("visible"), 250);
  } else {
    docSpinner.classList.remove("visible");
  }
}

function showError(message) {
  setLoading(false);
  docSearchError.textContent = message;
}

// URL format: ?q=<search>
function loadFromURL() {
  const query = (new URLSearchParams(window.location.search).get("q") || "").trim();

  docSearchBox.value = query;
  if (query === "") {
    clearResults();
    search = null;
  } else if (!search || search.query !== query) {
    doSearch(query, false);
  }
}

function clearResults() {
  docCardList.innerHTML = "";
  docSearchError.textContent = "";
  docResultsCounter.textContent = "Results: 0";
  docLoadMore.hidden = true;
  holdHeight(0);
}

function newSearch(query) {
  const searchURI = encodeURIComponent(query + " is:firstprint order:released dir:desc -is:digital");
  return {
    query,
    groups: new Map(),  // Set groups fetched but not yet shown, by set code
    streamDate: null,   // Release date of the oldest card fetched so far
    nextURL: `https://api.scryfall.com/cards/search?q=${searchURI}`,  // Scryfall page to resume from
    exhausted: false,   // True once Scryfall has no more results
    lastFetch: 0
  };
}

function doSearch(query, updateHistory) {
  if (query === "") return;

  // Any fetches still running for an earlier search stop when they see this new state
  clearResults();
  search = newSearch(query);
  if (updateHistory) history.pushState(null, "", `?${new URLSearchParams({ q: query })}`);
  loadMore();
}

// Show the next page of results. Each page is one Scryfall request (175 cards) and shows every set that
// request completes; a request in the middle of a large set completes none, so another one follows.
// The Load more button is disabled meanwhile, so only one page loads at a time.
async function loadMore() {
  const state = search;
  setLoading(true);
  docLoadMore.disabled = true;
  docLoadMore.textContent = "Loading...";
  try {
    let shown = 0;
    do {
      await fetchCards(state);
      if (state !== search) return;

      let group;
      while ((group = nextGroup(state)) && isComplete(state, group)) {
        renderGroup(group);
        state.groups.delete(group.set.code);
        shown++;
      }
    } while (shown === 0 && !state.exhausted);

    if (!docCardList.firstChild) showError("No cards found.");
  } catch (error) {
    if (state !== search) return;
    showError(error.message || "Couldn't reach Scryfall. Please try again.");
  }

  setLoading(false);
  docLoadMore.disabled = false;
  docLoadMore.textContent = "Load more";
  // Hidden once everything is shown, or if the search failed before showing anything
  docLoadMore.hidden = !docCardList.firstChild || state.exhausted;
}

async function fetchCards(state) {
  // Scryfall asks for 50-100 ms between requests
  const wait = state.lastFetch + 100 - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  if (state !== search) return;

  state.lastFetch = Date.now();
  const [json] = await Promise.all([
    fetch(state.nextURL, fetchOptions).then((response) => response.json()),
    setsLoaded
  ]);
  if (state !== search) return;

  if (json.object === "error") {
    // 404 means no matches; 400 means a bad query. Both carry a readable message.
    if (json.status === 404) {
      state.exhausted = true;
      return;
    }
    throw new Error(json.details);
  }

  docResultsCounter.textContent = `Results: ${json.total_cards}`;

  json.data.forEach((card) => addCard(state, card));

  state.nextURL = json.next_page;
  state.exhausted = !json.has_more;
}

function addCard(state, card) {
  const set = setsByCode[card.set];
  if (!set) return;

  // Results come newest first, so every set released after this card's date has all its cards by now
  if (card.released_at && (!state.streamDate || card.released_at < state.streamDate)) {
    state.streamDate = card.released_at;
  }

  let group = state.groups.get(set.code);
  if (!group) {
    group = { set, cards: [] };
    state.groups.set(set.code, group);
  }
  group.cards.push(card);
}

// The waiting set to show next: the most recent, as listed by Scryfall's set list
function nextGroup(state) {
  let next = null;
  state.groups.forEach((group) => {
    const a = group.set, b = next && next.set;
    if (!next || a.releasedAt > b.releasedAt || (a.releasedAt === b.releasedAt && a.index < b.index)) next = group;
  });
  return next;
}

// A set has all its cards once the results have moved on to cards released before it
function isComplete(state, group) {
  return state.exhausted || group.set.releasedAt > state.streamDate;
}

// Within each set, arrange cards by EDHREC rank (unranked cards last, alphabetically)
function sortCards(cards) {
  cards.sort((a, b) => {
    const rankA = a.edhrec_rank ?? Infinity;
    const rankB = b.edhrec_rank ?? Infinity;
    if (rankA !== rankB) return rankA - rankB;
    return a.name.localeCompare(b.name);
  });
}

// Print a set's card images, ordered by EDHREC rank, as a collapsible section
function renderGroup({ set, cards }) {
  sortCards(cards);
  docCardList.insertAdjacentHTML("beforeend", `
    <details class="set">
      <summary>${set.name} <strong>(${cards.length})</strong>${set.isUnreleased ? ' <span class="unreleased">(unreleased)</span>' : ""}</summary>
      <div>${cards.map(cardHTML).join("")}</div>
    </details>`);
}

// The image is held in data-src until its set is opened
function cardHTML(card) {
  // Double-faced cards keep their images on each face; show the front
  const image = (card.image_uris || card.card_faces?.[0]?.image_uris)?.normal || "";
  return `<a class="card" href="${card.scryfall_uri}" target="_blank"><img loading="lazy" data-src="${image}"></a>`;
}
