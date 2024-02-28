let Tags = {
  ArtifactTokens: "Artifact Tokens",
  CreatureTokens: "Creature Tokens",
  Burn: "Burn"
};

let Mechanics = {
  "Blood Tokens": [ Tags.ArtifactTokens ],
  "Pests": [ Tags.CreatureTokens ]
};

var activeTags = [];

var docTagsList;
var docMechanicsList;

window.onload = () => {
  docTagsList = document.getElementById("tags-list");
  docMechanicsList = document.getElementById("mechanics-list");
  
  let tagsString = "";
  for (var tag in Tags) {
    if (Object.prototype.hasOwnProperty.call(Tags, tag)) {
      tagsString += `<div class="tag"><input type="checkbox" id="${tag}"><label for="${tag}">${Tags[tag]}</label><br/></div>`;
    }
  }
  docTagsList.innerHTML = tagsString;
  
  for (var tag in Tags) {
    if (Object.prototype.hasOwnProperty.call(Tags, tag)) {
      let tagId = tag;
      document.getElementById(tag).addEventListener("click", (event) => {
        let index = activeTags.indexOf(Tags[tagId]);
        if (index > -1) {
          activeTags.splice(index, 1);
        } else {
          activeTags.push(Tags[tagId]);
        }
        
        updateMechanicsList();
      });
    }
  }
};

function updateMechanicsList() {
  let mechanicsString = "";
  
  for (var mechanic in Mechanics) {
    if (Object.prototype.hasOwnProperty.call(Mechanics, mechanic)) {
      let mechanicName = mechanic;
      Mechanics[mechanic].forEach((tag) => {
        let tagId = tag;
        if (activeTags.indexOf(tagId) > -1) {
          mechanicsString += `<div class="mechanic">${mechanicName} <span class="mechanic-tags">(${getMechanicsTagsString(Mechanics[mechanic])})</span></div>`
        }
      });
    }
  }
  docMechanicsList.innerHTML = mechanicsString;
}

function getMechanicsTagsString(mechanic) {
  let string = "";
  mechanic.forEach((tag) => {
    string += tag + ",";
  });
  string += "";
  string = string.slice(0, string.length-1);
  
  return string;
}