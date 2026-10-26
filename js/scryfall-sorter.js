var sets = [];
var setsByCode = {};
var gotSets = false;

// State of the current search (see newSearch); null until the first search
var search = null;
var searchCount = 0;

var docPageOverlay;
var docCardList;
var docResultsCounter;
var docSearchBox;
var docSearchError;
var docPagers;
const dateNow = Date.now();
const fetchOptions = { headers: { "Accept": "application/json" } };

// Pages hold at most this many cards, except a single set larger than this, which gets a page of its own
const MAX_CARDS_PER_PAGE = 200;

window.onload = () => {
  docPageOverlay = document.getElementById("page-overlay");
  docCardList = document.getElementById("card-list");
  docResultsCounter = document.getElementById("results-counter");
  docSearchBox = document.getElementById("search-box");
  docSearchError = document.getElementById("search-error");
  docPagers = document.querySelectorAll(".pager");

  const searchButton = document.getElementById("search-button");
  searchButton.addEventListener("click", (event) => {
    event.preventDefault();
    doSearch(docSearchBox.value.trim(), 0, true);
  });

  docPagers.forEach((pager) => {
    pager.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-page]");
      if (!button || button.disabled) return;
      goToPage(parseInt(button.dataset.page), true);
    });
  });

  // Back/forward buttons restore the search and page from the URL
  window.addEventListener("popstate", loadFromURL);

  // Fetch all (main) sets in reverse chronological order
  console.log("Fetching sets...");

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
  docPageOverlay.className = loading === true ? "load-overlay" : "";
}

function showError(message) {
  setLoading(false);
  docSearchError.textContent = message;
}

// URL format: ?q=<search>&page=<page number, from 1>
function loadFromURL() {
  if (!gotSets) return;

  const params = new URLSearchParams(window.location.search);
  const query = (params.get("q") || "").trim();
  const page = Math.max((parseInt(params.get("page")) || 1) - 1, 0);

  docSearchBox.value = query;
  if (query === "") {
    clearResults();
    search = null;
  } else if (search && search.query === query) {
    goToPage(page, false);
  } else {
    doSearch(query, page, false);
  }
}

function updateURL(replace) {
  const params = new URLSearchParams();
  params.set("q", search.query);
  params.set("page", search.page + 1);
  const url = `${window.location.pathname}?${params}`;

  if (replace) {
    history.replaceState(null, "", url);
  } else {
    history.pushState(null, "", url);
  }
}

function clearResults() {
  docCardList.innerHTML = "";
  docSearchError.textContent = "";
  docResultsCounter.innerHTML = `Results: 0`;
  docPagers.forEach((pager) => {
    pager.innerHTML = "";
  });
}

function newSearch(query, page) {
  return {
    id: ++searchCount,
    query,
    page,               // Index of the page the user wants to see
    pages: [],          // Pages fetched so far; each is final once it's here
    groups: new Map(),  // Set groups not yet placed on a page, by set code
    streamDate: null,   // Release date of the oldest card fetched so far
    nextURL: null,      // Scryfall page to resume from
    exhausted: false,   // True once Scryfall has no more results
    fetching: null,     // Promise for the Scryfall request in flight
    lastFetch: 0,
    totalCards: 0
  };
}

function doSearch(query, page, updateHistory) {
  if (!gotSets) return;
  if (!query || query === "") return;

  // Any fetches still running for an earlier search stop when they see this new state
  clearResults();
  search = newSearch(query, page);
  if (updateHistory) updateURL(false);

  const searchURI = encodeURIComponent(query + " is:firstprint order:released dir:desc -is:digital");
  search.nextURL = `https://api.scryfall.com/cards/search?q=${searchURI}`;

  goToPage(page, false);
}

function goToPage(page, updateHistory) {
  if (!search) return;
  const state = search;

  state.page = Math.max(page, 0);
  if (updateHistory) updateURL(false);

  if (state.page < state.pages.length) {
    renderPage(state, true);
    renderPager();
    return;
  }

  // Fetch from where the last page left off until the requested page is complete
  if (updateHistory) window.scrollTo(0, 0);
  setLoading(true);
  docPageOverlay.innerHTML = "Loading...";
  ensurePage(state, state.page)
  .then(() => {
    // Ignore if the user has since moved on to a page that's still loading
    if (state !== search || (state.page >= state.pages.length && !state.exhausted)) return;

    if (state.pages.length === 0) {
      showError("No cards found.");
      renderPager();
      return;
    }

    if (state.page >= state.pages.length) {
      // Asked for a page past the end of the results
      state.page = state.pages.length - 1;
      updateURL(true);
    }

    renderPage(state, updateHistory);
    renderPager();
  })
  .catch((error) => {
    if (state !== search) return;
    showError(error.message || "Couldn't reach Scryfall. Please try again.");
    renderPager();
  });
}

async function ensurePage(state, index) {
  while (state.pages.length <= index && !state.exhausted) {
    // Clicking Next again while a request is running waits on that request instead of starting another
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

function renderPage(state, scrollToTop) {
  docCardList.innerHTML = "";

  // Print card images, grouped by set, ordered by EDHREC rank
  state.pages[state.page].groups.forEach((group) => {
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

  if (scrollToTop) window.scrollTo(0, 0);
  setLoading(false);
}

function renderPager() {
  const state = search;
  if (!state || state.pages.length === 0) {
    docPagers.forEach((pager) => {
      pager.innerHTML = "";
    });
    return;
  }

  const pageButton = (index, label, disabled) =>
    `<button type="button" data-page="${index}"${index === state.page ? ` class="current-page"` : ""}${disabled ? " disabled" : ""}>${label}</button>`;

  // Numbered buttons for the first, last and nearby loaded pages, with gaps elided
  const loaded = state.pages.length;
  const shown = [];
  for (let i = 0; i < loaded; i++) {
    if (i === 0 || i === loaded - 1 || Math.abs(i - state.page) <= 2) shown.push(i);
  }
  let numbers = "";
  shown.forEach((index, i) => {
    if (i > 0 && index - shown[i - 1] > 1) numbers += `<span class="pager-gap">...</span>`;
    numbers += pageButton(index, index + 1, false);
  });
  // Pages past the last loaded one are fetched when Next reaches them
  if (!state.exhausted) numbers += `<span class="pager-gap">...</span>`;

  const isLastPage = state.exhausted && state.page >= loaded - 1;
  const buttons = pageButton(state.page - 1, "Prev", state.page === 0)
    + numbers
    + pageButton(state.page + 1, "Next", isLastPage);

  // Summary, e.g. "Page 2 of 7 · cards 501–987"
  let summary = `Page ${state.page + 1}${state.exhausted ? ` of ${loaded}` : ""}`;
  if (state.page < loaded) {
    const firstCard = state.pages.slice(0, state.page).reduce((sum, page) => sum + page.cardCount, 0) + 1;
    const lastCard = firstCard + state.pages[state.page].cardCount - 1;
    summary += ` &middot; cards ${firstCard}&ndash;${lastCard}`;
  }

  docPagers.forEach((pager) => {
    pager.innerHTML = `<div class="pager-buttons">${buttons}</div><div class="pager-summary">${summary}</div>`;
  });
}
