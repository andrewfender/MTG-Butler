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
const MAX_CARDS_PER_PAGE = 500;

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
            cards: [],
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

function setLoadPercentage(percentage) {
  docPageOverlay.innerHTML = `${percentage.toFixed(0)}%`;
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
  sets.forEach((set) => {
    set.cards = [];
  });
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
    shownPage: -1,      // Index of the page currently rendered
    groups: [],         // Completed set groups, in display order
    current: null,      // Set group still receiving cards
    lastSetIndex: -1,
    inSetOrder: true,   // False if Scryfall's order disagrees with the set list
    pages: [],
    readyPages: 0,      // Leading pages whose groups are all complete
    totalCards: 0,
    cardsLoaded: 0,
    done: false
  };
}

function doSearch(query, page, updateHistory) {
  if (!gotSets) return;
  if (!query || query === "") return;

  // Any fetches still running for an earlier search stop when they see this new state
  clearResults();
  search = newSearch(query, page);
  if (updateHistory) updateURL(false);

  const searchURI = encodeURIComponent(query + " is:firstprint order:set -is:digital");

  console.log("Fetching cards...");
  setLoading(true);
  setLoadPercentage(0);
  renderPager();
  fetchCards(`https://api.scryfall.com/cards/search?q=${searchURI}`, search);
}

function fetchCards(searchURL, state) {
  // Fetch all cards matching the search, recur through all pages.
  // Pages are shown as soon as their set groups are complete, while the rest keeps loading.
  setTimeout(() => {
    if (state !== search) return;

    fetch(searchURL, fetchOptions)
    .then((response) => {
      return response.json()
      .then((json) => {
        if (state !== search) return;

        if (json.object === "error") {
          // 404 means no matches; 400 means a bad query. Both carry a readable message.
          throw new Error(json.status === 404 ? "No cards found." : json.details);
        }

        state.totalCards = json.total_cards;
        docResultsCounter.innerHTML = `Results: ${state.totalCards}`;

        json.data.forEach((card) => addCard(state, card));

        setLoadPercentage((state.cardsLoaded / state.totalCards) * 100);

        if (json.has_more && json.next_page) {
          fetchCards(json.next_page, state);
        } else {
          finishSearch(state);
        }

        updatePages(state);
      });
    })
    .catch((error) => {
      if (state !== search) return;
      showError(error.message || "Couldn't reach Scryfall. Please try again.");
    });
  }, 100);
}

function addCard(state, card) {
  const set = setsByCode[card.set];
  if (!set) return;

  // Also kept per set, in case the results have to be regrouped at the end
  set.cards.push(card);
  state.cardsLoaded++;

  // order:set returns each set's cards together, so a new set means the previous group is complete
  if (!state.current || state.current.set !== set) {
    if (state.current) completeGroup(state, state.current);
    if (set.index <= state.lastSetIndex) state.inSetOrder = false;
    state.lastSetIndex = set.index;
    state.current = { set, cards: [] };
  }
  state.current.cards.push(card);
}

function completeGroup(state, group) {
  sortCards(group.cards);
  state.groups.push(group);
}

function finishSearch(state) {
  if (state.current) completeGroup(state, state.current);
  state.current = null;

  if (!state.inSetOrder) {
    // Scryfall's set order didn't match the set list, so pages couldn't be built while loading.
    // Regroup everything in set list order (most recent first) now that every card is here.
    console.log("Scryfall's set order differs from the set list; regrouping all results.");
    state.groups = sets.filter(it => it.cards.length > 0).map((set) => ({ set, cards: sortCards(set.cards) }));
  }

  state.done = true;
  console.log(`Done: ${state.cardsLoaded} cards across ${state.groups.length} sets.`);
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

function updatePages(state) {
  if (state.inSetOrder || state.done) {
    // Packing is greedy, so pages built from the groups so far won't change as more groups arrive,
    // except the last one, which may still gain groups.
    state.pages = buildPages(state.groups, MAX_CARDS_PER_PAGE);
    state.readyPages = state.done ? state.pages.length : Math.max(state.pages.length - 1, 0);

    // The last page is also final once the group still loading can no longer fit on it
    const lastPage = state.pages[state.pages.length - 1];
    if (!state.done && lastPage && state.current && lastPage.cardCount + state.current.cards.length > MAX_CARDS_PER_PAGE) {
      state.readyPages = state.pages.length;
    }
  }

  if (state.done) {
    setLoadPercentage(100);

    if (state.pages.length === 0) {
      showError("No cards found.");
      renderPager();
      return;
    }

    if (state.page >= state.pages.length) {
      // The URL asked for a page past the end
      state.page = state.pages.length - 1;
      updateURL(true);
    }

    // Regrouping may have changed what's on the page already shown
    if (!state.inSetOrder) state.shownPage = -1;
  }

  if (state.shownPage !== state.page && state.page < state.readyPages) {
    renderPage(state, false);
  }

  renderPager();
}

function goToPage(page, updateHistory) {
  if (!search) return;

  search.page = Math.max(page, 0);
  if (search.done && search.page >= search.pages.length) {
    search.page = Math.max(search.pages.length - 1, 0);
  }
  if (updateHistory) updateURL(false);

  if (search.page < search.readyPages) {
    renderPage(search, true);
  } else {
    // Shown by updatePages once its groups have loaded
    search.shownPage = -1;
    docCardList.innerHTML = `<div class="page-loading">Loading page ${search.page + 1}...</div>`;
  }

  renderPager();
}

function renderPage(state, scrollToTop) {
  state.shownPage = state.page;
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
  if (!state || state.readyPages === 0 && state.done) {
    docPagers.forEach((pager) => {
      pager.innerHTML = "";
    });
    return;
  }

  const pageButton = (index, label, disabled) =>
    `<button type="button" data-page="${index}"${index === state.page ? ` class="current-page"` : ""}${disabled ? " disabled" : ""}>${label}</button>`;

  // Numbered buttons for the first, last and nearby pages, with gaps elided
  const shown = [];
  for (let i = 0; i < state.readyPages; i++) {
    if (i === 0 || i === state.readyPages - 1 || Math.abs(i - state.page) <= 2) shown.push(i);
  }
  let numbers = "";
  shown.forEach((index, i) => {
    if (i > 0 && index - shown[i - 1] > 1) numbers += `<span class="pager-gap">...</span>`;
    numbers += pageButton(index, index + 1, false);
  });
  if (!state.done) numbers += `<span class="pager-gap">...</span>`;

  const lastPage = state.done ? state.pages.length - 1 : Infinity;
  const buttons = pageButton(state.page - 1, "Prev", state.page === 0)
    + numbers
    + pageButton(state.page + 1, "Next", state.page >= lastPage);

  // Summary, e.g. "Page 2 of 7 · cards 501–987"
  let summary = `Page ${state.page + 1} of ${state.done ? state.pages.length : `${state.readyPages}+`}`;
  if (state.page < state.readyPages) {
    const firstCard = state.pages.slice(0, state.page).reduce((sum, page) => sum + page.cardCount, 0) + 1;
    const lastCard = firstCard + state.pages[state.page].cardCount - 1;
    summary += ` &middot; cards ${firstCard}&ndash;${lastCard}`;
  }
  if (!state.done) {
    summary += ` &middot; loading more results (${((state.cardsLoaded / (state.totalCards || 1)) * 100).toFixed(0)}%)`;
  }

  docPagers.forEach((pager) => {
    pager.innerHTML = `<div class="pager-buttons">${buttons}</div><div class="pager-summary">${summary}</div>`;
  });
}
