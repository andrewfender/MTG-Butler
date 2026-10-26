var sets = [];
var gotSets = false;
var cards = [];

var docPageOverlay;
var docCardList;
var docResultsCounter;
var docSearchBox;
var docSearchError;
const dateNow = Date.now();
const fetchOptions = { headers: { "Accept": "application/json" } };

window.onload = () => {
  docPageOverlay = document.getElementById("page-overlay");
  docCardList = document.getElementById("card-list");
  docResultsCounter = document.getElementById("results-counter");
  docSearchBox = document.getElementById("search-box");
  docSearchError = document.getElementById("search-error");

  const searchButton = document.getElementById("search-button");
  searchButton.addEventListener("click", (event) => {
    event.preventDefault();
    doSearch();
  });
  searchButton.addEventListener("submit", (event) => {
    event.preventDefault();
    doSearch();
  });

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
          sets.push({
            code: set.code,
            name: set.name,
            cards: [],
            isReleased
          });
        }
      });
    })
    .then(() => {
      gotSets = true;
      setLoading(false);

      console.log(`Done fetching ${sets.length} sets.`);
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

function doSearch() {
  if (!gotSets) return;
  if (!docSearchBox || !docSearchBox.value || docSearchBox.value === "") return;

  // Clear previously saved cards
  sets.forEach((set) => {
    set.cards = [];
  });
  docCardList.innerHTML = "";
  docSearchError.textContent = "";

  const searchURI = encodeURIComponent(docSearchBox.value + " is:firstprint order:set -is:digital");

  console.log("Fetching cards...");
  setLoading(true);
  setLoadPercentage(0);
  docResultsCounter.innerHTML = `Results: 0`;
  fetchCards(`https://api.scryfall.com/cards/search?q=${searchURI}`, 0);
}

function fetchCards(searchURL, cardsLoaded) {
  // Fetch all cards matching the search, recur through all pages
  setTimeout(() => {
    fetch(searchURL, fetchOptions)
    .then((response) => {
      return response.json()
      .then((json) => {
        if (json.object === "error") {
          // 404 means no matches; 400 means a bad query. Both carry a readable message.
          throw new Error(json.status === 404 ? "No cards found." : json.details);
        }

        let getMore = false;
        let totalCards = 0;
        if (totalCards === 0) {
          totalCards = json.total_cards;
          docResultsCounter.innerHTML = `Results: ${totalCards}`;
        }

        json.data.forEach((card) => {
          let set = sets.find(it => it.code == card.set);
          if (set) {
            set.cards.push(card);
            cardsLoaded++;
          }
        });

        setLoadPercentage((cardsLoaded / totalCards) * 100);

        if (json.has_more && json.next_page) {
          getMore = true;
          fetchCards(json.next_page, cardsLoaded);
        }

        if (!getMore) {
          console.log(`Printing ${totalCards} cards, sorted across ${sets.length} sets...`);

          printCards();
        }
      });
    })
    .catch((error) => showError(error.message || "Couldn't reach Scryfall. Please try again."));
  }, 100);
}

function printCards() {
  setLoadPercentage(100);

  // Within each set, arrange cards by EDHREC rank (unranked cards last, alphabetically)
  sets.forEach((set) => {
    if (set.cards.length > 0) {
      set.cards = set.cards.sort((a, b) => {
        const rankA = a.edhrec_rank ?? Infinity;
        const rankB = b.edhrec_rank ?? Infinity;
        if (rankA !== rankB) return rankA - rankB;
        return a.name.localeCompare(b.name);
      });
    }
  });

  // Print card images, grouped by set, ordered by EDHREC rank
  sets.filter(it => it.cards.length > 0).forEach((set) => {
    // Create list of card divs
    var cards = "";
    set.cards.forEach((card) => {
      // Get card front image
      let imgSrc = "#";
      if (card.image_uris) {
        imgSrc = card.image_uris.normal;
      } else if (card.card_faces && card.card_faces.length > 0 && card.card_faces[0].image_uris) {
        imgSrc = card.card_faces[0].image_uris.normal;
      }

      // Print card
      cards += `<div class="card"><a href="${card.scryfall_uri}" target="_blank"><img src=${imgSrc}><div class="card-highlight"></div></img></a></div>`;
    });
    const setUnreleasedNotice = set.isReleased === false ? "<span style='color:#888'>(unreleased)</span>" : "";

    // Create collapsible section containing cards
    docCardList.insertAdjacentHTML("beforeend",
    `
    <section class="set">
      <input id=${set.code} type="checkbox" name="collapse"/>
      <label for=${set.code}><span class="collapse-arrow"></span> ${set.name} <strong>(${set.cards.length})</strong> ${setUnreleasedNotice}</label>

      <div class="set-content">
      ${cards}
      </div>
    </section>
    `
    );
  });

  setTimeout(() => {
    console.log("Done.");
    setLoading(false);
  }, 50);
}