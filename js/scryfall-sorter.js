const fetchOptions = { headers: { "Accept": "application/json" } };

// Results load a page at a time. Pages hold at most this many cards, except a single set larger than
// this, which gets a page of its own.
const MAX_CARDS_PER_PAGE = 200;

// The script is deferred, so the page is already parsed
const docSpinner = document.getElementById("loading-spinner");
const docCardList = document.getElementById("card-list");
const docResultsCounter = document.getElementById("results-counter");
const docSearchBox = document.getElementById("search-box");
const docSearchError = document.getElementById("search-error");
const docLoadMore = document.getElementById("load-more");

let spinnerTimer;

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

// Back/forward buttons restore the search from the URL
window.addEventListener("popstate", loadFromURL);

// Run the search linked in the URL, if any
loadFromURL();

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
}

function newSearch(query) {
  return {
    query,
    pages: [],          // Pages fetched so far; each is final once it's here
    shownPages: 0,      // Pages already added to the list
    groups: new Map(),  // Set groups not yet placed on a page, by set code
    streamDate: null,   // Release date of the oldest card fetched so far
    nextURL: null,      // Scryfall page to resume from
    exhausted: false,   // True once Scryfall has no more results
    fetching: null,     // Promise for the Scryfall request in flight
    lastFetch: 0
  };
}

function doSearch(query, updateHistory) {
  if (query === "") return;

  // Any fetches still running for an earlier search stop when they see this new state
  clearResults();
  search = newSearch(query);
  if (updateHistory) history.pushState(null, "", `?${new URLSearchParams({ q: query })}`);

  const searchURI = encodeURIComponent(query + " is:firstprint order:released dir:desc -is:digital");
  search.nextURL = `https://api.scryfall.com/cards/search?q=${searchURI}`;

  loadMore();
}

// Fetch from where the last page left off until the next page is complete, then add it below the results so far
function loadMore() {
  const state = search;
  if (!state || state.fetching) return;

  setLoading(true);
  docLoadMore.disabled = true;
  docLoadMore.textContent = "Loading...";
  ensurePage(state, state.shownPages)
  .then(() => {
    if (state !== search) return;

    if (state.pages.length === 0) {
      showError("No cards found.");
      return;
    }

    if (state.shownPages < state.pages.length) {
      renderPage(state.pages[state.shownPages]);
      state.shownPages++;
    }
  })
  .catch((error) => {
    if (state !== search) return;
    showError(error.message || "Couldn't reach Scryfall. Please try again.");
  })
  .finally(() => {
    if (state !== search) return;
    setLoading(false);
    docLoadMore.disabled = false;
    docLoadMore.textContent = "Load more";
    // Hidden once everything is shown, or if the search failed before showing anything
    docLoadMore.hidden = state.shownPages === 0 || (state.exhausted && state.shownPages >= state.pages.length);
  });
}

async function ensurePage(state, index) {
  while (state.pages.length <= index && !state.exhausted) {
    // A new caller while a request is running waits on that request instead of starting another
    if (!state.fetching) {
      state.fetching = fetchCards(state).finally(() => {
        state.fetching = null;
      });
    }
    await state.fetching;
    if (state !== search) return;
  }
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

  if (json.has_more && json.next_page) {
    state.nextURL = json.next_page;
  } else {
    state.nextURL = null;
    state.exhausted = true;
  }

  takeReadyPages(state);
}

function addCard(state, card) {
  const set = setsByCode[card.set];
  if (!set) return;

  // Results come newest first, so every set released after this card's date has all its cards by now
  if (card.released_at && (!state.streamDate || card.released_at < state.streamDate)) {
    state.streamDate = card.released_at;
  }

  let group = state.groups.get(card.set);
  if (!group) {
    group = { code: card.set, set, cards: [] };
    state.groups.set(card.set, group);
  }
  group.cards.push(card);
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

// Pack set groups into pages without splitting a group: a group that would overflow the page starts the next one
function buildPages(groups, maxCards) {
  const pages = [];
  let page = null;
  groups.forEach((group) => {
    if (!page || (page.cardCount > 0 && page.cardCount + group.cards.length > maxCards)) {
      page = { groups: [], cardCount: 0 };
      pages.push(page);
    }
    page.groups.push(group);
    page.cardCount += group.cards.length;
  });
  return pages;
}

// Move pages that can no longer change from the waiting groups onto state.pages
function takeReadyPages(state) {
  // Display sets most recent first, as listed by Scryfall's set list
  const waiting = [...state.groups.values()].sort((a, b) =>
    a.set.releasedAt === b.set.releasedAt ? a.set.index - b.set.index : (a.set.releasedAt < b.set.releasedAt ? 1 : -1));

  // A set is complete once the results have moved on to cards released before it.
  // Complete sets come first in display order, so they're the only ones that can be paged yet.
  const isComplete = (group) => state.exhausted || group.set.releasedAt > state.streamDate;
  let completeCount = waiting.findIndex((group) => !isComplete(group));
  if (completeCount === -1) completeCount = waiting.length;
  const complete = waiting.slice(0, completeCount);
  const nextGroup = waiting[completeCount];

  // Packing is greedy, so every page but the last is final; the last one may still gain groups
  const built = buildPages(complete, MAX_CARDS_PER_PAGE);
  let ready = state.exhausted ? built.length : Math.max(built.length - 1, 0);

  // The last page is also final once the next set, still loading, can no longer fit on it
  const lastPage = built[built.length - 1];
  if (!state.exhausted && lastPage && nextGroup && lastPage.cardCount + nextGroup.cards.length > MAX_CARDS_PER_PAGE) {
    ready = built.length;
  }

  built.slice(0, ready).forEach((page) => {
    page.groups.forEach((group) => {
      sortCards(group.cards);
      state.groups.delete(group.code);
    });
    state.pages.push(page);
  });
}

// Print card images, grouped by set, ordered by EDHREC rank, as one collapsible section per set
function renderPage(page) {
  docCardList.insertAdjacentHTML("beforeend", page.groups.map(({ set, cards }) => `
    <details class="set">
      <summary>${set.name} <strong>(${cards.length})</strong>${set.isUnreleased ? ' <span class="unreleased">(unreleased)</span>' : ""}</summary>
      <div>${cards.map(cardHTML).join("")}</div>
    </details>`).join(""));
}

// The image is held in data-src until its set is opened
function cardHTML(card) {
  // Double-faced cards keep their images on each face; show the front
  const image = (card.image_uris || card.card_faces?.[0]?.image_uris)?.normal || "";
  return `<a class="card" href="${card.scryfall_uri}" target="_blank"><img loading="lazy" data-src="${image}"></a>`;
}
