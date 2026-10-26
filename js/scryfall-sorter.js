var sets = [];
var setsByCode = {};
var gotSets = false;

// State of the current search (see newSearch); null until the first search
var search = null;
var searchCount = 0;

var docSpinner;
var spinnerTimer;
var docCardList;
var docResultsCounter;
var docSearchBox;
var docSearchError;
var docLoadMore;
const dateNow = Date.now();
const fetchOptions = { headers: { "Accept": "application/json" } };

// Results load a page at a time. Pages hold at most this many cards, except a single set larger than
// this, which gets a page of its own.
const MAX_CARDS_PER_PAGE = 200;

window.onload = () => {
  docSpinner = document.getElementById("loading-spinner");
  docCardList = document.getElementById("card-list");
  docResultsCounter = document.getElementById("results-counter");
  docSearchBox = document.getElementById("search-box");
  docSearchError = document.getElementById("search-error");
  docLoadMore = document.getElementById("load-more");

  const searchButton = document.getElementById("search-button");
  searchButton.addEventListener("click", (event) => {
    event.preventDefault();
    doSearch(docSearchBox.value.trim(), true);
  });

  docLoadMore.addEventListener("click", loadMore);

  // Back/forward buttons restore the search from the URL
  window.addEventListener("popstate", loadFromURL);

  // Fetch all (main) sets in reverse chronological order
  console.log("Fetching sets...");
  setLoading(true);

  console.log(Date());

  fetch("https://api.scryfall.com/sets", fetchOptions)
  .then((response) => {
    if (!response.ok) {
      throw new Error(`Couldn't load the set list from Scryfall (HTTP ${response.status}).`);
    }

    return response.json()
    .then((json) => {
      json.data.forEach((set) => {
        if (set.code) {
          const isReleased = set.released_at && Date.parse(set.released_at) <= dateNow;
          const entry = {
            code: set.code,
            name: set.name,
            index: sets.length,
            releasedAt: set.released_at || "",
            isReleased
          };
          sets.push(entry);
          setsByCode[set.code] = entry;
        }
      });
    })
    .then(() => {
      gotSets = true;
      setLoading(false);

      console.log(`Done fetching ${sets.length} sets.`);

      // Run the search linked in the URL, if any
      loadFromURL();
    });
  })
  .catch((error) => showError(error.message));
};

function setLoading(loading) {
  // Only show the spinner if loading takes a moment, so quick loads don't flash it
  clearTimeout(spinnerTimer);
  if (loading === true) {
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
  if (!gotSets) return;

  const params = new URLSearchParams(window.location.search);
  const query = (params.get("q") || "").trim();

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
  docResultsCounter.innerHTML = `Results: 0`;
  docLoadMore.hidden = true;
}

function newSearch(query) {
  return {
    id: ++searchCount,
    query,
    pages: [],          // Pages fetched so far; each is final once it's here
    shownPages: 0,      // Pages already added to the list
    groups: new Map(),  // Set groups not yet placed on a page, by set code
    streamDate: null,   // Release date of the oldest card fetched so far
    nextURL: null,      // Scryfall page to resume from
    exhausted: false,   // True once Scryfall has no more results
    fetching: null,     // Promise for the Scryfall request in flight
    lastFetch: 0,
    totalCards: 0
  };
}

function doSearch(query, updateHistory) {
  if (!gotSets) return;
  if (!query || query === "") return;

  // Any fetches still running for an earlier search stop when they see this new state
  clearResults();
  search = newSearch(query);
  if (updateHistory) history.pushState(null, "", `${window.location.pathname}?${new URLSearchParams({ q: query })}`);

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
  console.log(`Fetching ${state.nextURL}`);
  const response = await fetch(state.nextURL, fetchOptions);
  const json = await response.json();
  if (state !== search) return;

  if (json.object === "error") {
    // 404 means no matches; 400 means a bad query. Both carry a readable message.
    if (json.status === 404) {
      state.exhausted = true;
      return;
    }
    throw new Error(json.details);
  }

  state.totalCards = json.total_cards;
  docResultsCounter.innerHTML = `Results: ${state.totalCards}`;

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

  let group = state.groups.get(set.code);
  if (!group) {
    group = { set, cards: [] };
    state.groups.set(set.code, group);
  }
  group.cards.push(card);
}

// Within each set, arrange cards by EDHREC rank (unranked cards last, alphabetically)
function sortCards(cards) {
  return cards.sort((a, b) => {
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
      state.groups.delete(group.set.code);
    });
    state.pages.push(page);
  });
}

function renderPage(page) {
  // Print card images, grouped by set, ordered by EDHREC rank
  page.groups.forEach((group) => {
    const set = group.set;

    // Create list of card divs
    var cards = "";
    group.cards.forEach((card) => {
      // Get card front image
      let imgSrc = "#";
      if (card.image_uris) {
        imgSrc = card.image_uris.normal;
      } else if (card.card_faces && card.card_faces.length > 0 && card.card_faces[0].image_uris) {
        imgSrc = card.card_faces[0].image_uris.normal;
      }

      // Print card
      cards += `<div class="card"><a href="${card.scryfall_uri}" target="_blank"><img loading="lazy" src=${imgSrc}><div class="card-highlight"></div></img></a></div>`;
    });
    const setUnreleasedNotice = set.isReleased === false ? "<span style='color:#888'>(unreleased)</span>" : "";

    // Create collapsible section containing cards
    docCardList.insertAdjacentHTML("beforeend",
    `
    <section class="set">
      <input id=${set.code} type="checkbox" name="collapse"/>
      <label for=${set.code}><span class="collapse-arrow"></span> ${set.name} <strong>(${group.cards.length})</strong> ${setUnreleasedNotice}</label>

      <div class="set-content">
      ${cards}
      </div>
    </section>
    `
    );
  });
}
