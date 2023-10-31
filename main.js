var sets = [];
var gotSets = false;
var cards = [];

var docPageOverlay;
var docCardList;
var docResultsCounter;
const dateNow = Date.now();

window.onload = () => {
  docPageOverlay = document.getElementById("page-overlay");
  docCardList = document.getElementById("card-list");
  docResultsCounter = document.getElementById("results-counter");
  docSearchBox = document.getElementById("search-box");
  
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
  
  fetch("https://api.scryfall.com/sets")
  .then((response) => {
    if (!response.ok) {
      setLoading(false);
      throw new Error(response.status);
    }
    
    response.json()
    .then((json) => {        
      json.data.forEach((set) => {
        if (set.code && set.code.length && set.code.length == 3) {
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
    .then(setTimeout(() => {
      gotSets = true;
      setLoading(false);
      
      console.log(`Done fetching ${sets.length} sets.`);
    }, 100));
  });
};

function setLoading(loading) {
  docPageOverlay.className = loading === true ? "load-overlay" : "";
}

function setLoadPercentage(percentage) {
  docPageOverlay.innerHTML = `${percentage.toFixed(0)}%`;
}

function doSearch() {
  if (!gotSets) return;
  if (!docSearchBox || !docSearchBox.value || docSearchBox.value === "") return;
  
  // Clear previously saved cards
  sets.forEach((set) => {
    set.cards = [];
  });
  docCardList.innerHTML = "";
  
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
    fetch(searchURL)
    .then((response) => {
      if (!response.ok) {
        setLoading(false);
        throw new Error(response.status);
      }
      
      let getMore = false;
      let totalCards = 0;
      response.json()
      .then((json) => {
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
      })
      .then(() => {
        if (!getMore) {
          console.log(`Printing ${totalCards} cards, sorted across ${sets.length} sets...`);
          
          printCards();
        }
      });
    });
  }, 50);
}

function printCards() {
  setLoadPercentage(100);
  
  // Within each set, arrange cards by EDHREC rank
  sets.forEach((set) => {
    if (set.cards.length > 0) {
      set.cards = set.cards.sort((a, b) => a.edhrec_rank - b.edhrec_rank);
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