let Tags = {
  ArtifactTokens: "Artifact Tokens",
  CreatureTokens: "Creature Tokens",
  PutIntoExile: "Put Into Exile",
  PlayFromExile: "Play From Exile",
  TapOutlet: "Tap Outlet",
  TargetOpponentsStuff: "Target Opponents' Stuff",
  TypeAssassin: "Type: Assassin",
  TypeMercenary: "Type: Mercenary",
  TypePirate: "Type: Pirate",
  TypeRogue: "Type: Rogue",
  TypeWarlock: "Type: Warlock",
  TypeCleric: "Type: Cleric",
  TypeWarrior: "Type: Warrior",
  TypeWizard: "Type: Wizard",
  PutIntoGraveyard: "Put Into Graveyard",
  LifeLoss: "Life Loss",
  FaceDownInPlay: "Face Down In Play",
  ExileFromOwnGraveyard: "Exile From Own Graveyard",
  Transform: "Transform",
  PlayForFree: "Play For Free",
  P1Counters: "+1/+1 Counters",
  M1Counters: "-1/-1 Counters",
  Auras: "Auras",
  Draw: "Draw",
  Discard: "Discard",
  PoisonCounters: "Poison Counters",
  Reanimate: "Reanimate/Recur",
  CopySpell: "Copy Spell",
  GrantHaste: "Grant Haste",
  Equipment: "Equipment",
  LifeGain: "Life Gain",
  Sacrifice: "Sacrifice",
};

let Mechanics = {
  "Plot": [ Tags.PutIntoExile, Tags.PlayFromExile, Tags.PlayForFree ],
  "Saddle": [ Tags.TapOutlet ],
  "Crime": [ Tags.TargetOpponentsStuff ],
  "Outlaw": [ Tags.TypeAssassin, Tags.TypeMercenary, Tags.TypePirate, Tags.TypeRogue, Tags.TypeWarlock ],
  "Radiation/Rad Counters": [ Tags.PutIntoGraveyard, Tags.LifeLoss ],
  "Junk Tokens": [ Tags.ArtifactTokens, Tags.PutIntoExile, Tags.PlayFromExile ],
  "Disguise": [ Tags.FaceDownInPlay ],
  "Cloak": [ Tags.FaceDownInPlay ],
  "Morph": [ Tags.FaceDownInPlay ],
  "Collect Evidence": [ Tags.PutIntoExile, Tags.ExileFromOwnGraveyard ],
  "Craft": [ Tags.PutIntoExile, Tags.ExileFromOwnGraveyard, Tags.Transform ],
  "Descend": [ Tags.PutIntoGraveyard ],
  "Discover/Cascade": [ Tags.PutIntoExile, Tags.PlayFromExile, Tags.PlayForFree ],
  "Explore": [                         Tags.PutIntoGraveyard, Tags.P1Counters ],
  "Map Tokens": [ Tags.ArtifactTokens, Tags.PutIntoGraveyard, Tags.P1Counters ],
  "Bargain": [ Tags.Sacrifice ],
  "Role": [ Tags.Auras ],
  "Ring Tempts You": [ Tags.LifeLoss, Tags.Draw, Tags.Discard, Tags.PutIntoGraveyard ],
  "Battle": [ Tags.Transform, Tags.PlayFromExile, Tags.PlayForFree ],
  "Incubate": [ Tags.ArtifactTokens, Tags.Transform, Tags.P1Counters, Tags.CreatureTokens ],
  "Backup": [ Tags.P1Counters ],
  "Toxic": [ Tags.PoisonCounters ],
  "Corrupted": [ Tags.PoisonCounters ],
  "Infect": [ Tags.PoisonCounters, Tags.M1Counters ],
  "Poisonous": [ Tags.PoisonCounters ],
  "For Mirrodin!": [ Tags.CreatureTokens ],
  "Living Weapon": [ Tags.CreatureTokens ],
  "Unearth": [ Tags.Reanimate ],
  "Powerstone": [ Tags.ArtifactTokens ],
  "Convert": [ Tags.Transform ],
  "Attraction": [ Tags.ArtifactTokens ],
  "Enlist": [ Tags.TapOutlet ],
  "Connive": [ Tags.Draw, Tags.Discard, Tags.PutIntoGraveyard, Tags.P1Counters ],
  "Casualty": [ Tags.Sacrifice, Tags.CopySpell ],
  "Blitz": [ Tags.GrantHaste ],
  "Cycling": [ Tags.Discard, Tags.Draw, Tags.PutIntoGraveyard ],
  "Channel": [ Tags.Discard, Tags.PutIntoGraveyard ],
  "Hideaway": [ Tags.PutIntoExile, Tags.PlayFromExile, Tags.PlayForFree ],
  "Modified": [ Tags.P1Counters, Tags.Auras, Tags.Equipment ],
  "Reconfigure": [ Tags.Equipment ],
  "Blood Tokens": [ Tags.ArtifactTokens, Tags.Discard, Tags.Draw ],
  "Disturb": [ Tags.Transform, Tags.Reanimate ],
  "Training": [ Tags.P1Counters ],
  "Exploit": [ Tags.Sacrifice ],
  "Decayed": [ Tags.Sacrifice ],
  "Clue Tokens/Investigate": [ Tags.ArtifactTokens, Tags.Draw ],
  "Learn": [ Tags.Discard, Tags.Draw ],
  "Demonstrate": [ Tags.CopySpell ],
  "Foretell": [ Tags.PutIntoExile, Tags.PlayFromExile ],
  "Encore": [ Tags.Reanimate, Tags.ExileFromOwnGraveyard ],
  "Escape": [ Tags.Reanimate, Tags.ExileFromOwnGraveyard ],
  "Adventure": [ Tags.PlayFromExile ],
  "Party": [ Tags.TypeCleric, Tags.TypeWarrior, Tags.TypeWizard, Tags.TypeRogue ],
  "Spectacle": [ Tags.LifeLoss ],
  "Riot": [ Tags.P1Counters, Tags.GrantHaste ],
  "Afterlife": [ Tags.Sacrifice, Tags.CreatureTokens ],
  "Adapt": [ Tags.P1Counters ],
  "Mentor": [ Tags.P1Counters ],
  "Jump-start": [ Tags.Discard, Tags.Reanimate ],
  "Retrace": [ Tags.Discard, Tags.Reanimate ],
  "Support": [ Tags.P1Counters ],
  "Rebound": [ Tags.PlayFromExile, Tags.PlayForFree ],
  "Eternalize": [ Tags.ExileFromOwnGraveyard, Tags.Reanimate, Tags.CreatureTokens ],
  "Afflict": [ Tags.LifeLoss ],
  "Amass": [ Tags.CreatureTokens, Tags.P1Counters ],
  "Embalm": [ Tags.ExileFromOwnGraveyard, Tags.Reanimate, Tags.CreatureTokens ],
  "Aftermath": [ Tags.Reanimate ],
  "Improvise": [ Tags.TapOutlet ],
  "Crew": [ Tags.TapOutlet ],
  "Fabricate": [ Tags.P1Counters, Tags.ArtifactTokens ],
  "Monstrous": [ Tags.P1Counters ],
  "Emerge": [ Tags.Sacrifice ],
  "Awaken": [ Tags.P1Counters ],
  "Renown": [ Tags.P1Counters ],
  "Bloodthirst": [ Tags.P1Counters ],
  "Graft": [ Tags.P1Counters ],
  "Megamorph": [ Tags.P1Counters ],
  "Bolster": [ Tags.P1Counters ],
  "Dash": [ Tags.GrantHaste ],
  "Delve": [ Tags.ExileFromOwnGraveyard ],
  "Outlast": [ Tags.P1Counters ],
  "Convoke": [ Tags.TapOutlet ],
  "Dethrone": [ Tags.P1Counters ],
  "Unleash": [ Tags.P1Counters ],
  "Scavenge": [ Tags.ExileFromOwnGraveyard, Tags.P1Counters ],
  "Extort": [ Tags.LifeLoss, Tags.LifeGain ],
  "Evolve": [ Tags.P1Counters ],
  "Devour": [ Tags.Sacrifice, Tags.P1Counters ],
  "Wither": [ Tags.M1Counters ],
  "Reinforce": [ Tags.P1Counters ],
  "Replicate": [ Tags.CopySpell ],
  "Dredge": [ Tags.PutIntoGraveyard, Tags.Reanimate ],
  "Storm": [ Tags.CopySpell ],
  "Modular": [ Tags.P1Counters ],
};

var activeTags = [];

var docTagsList;
var docMechanicsList;

window.onload = () => {
  docTagsList = document.getElementById("tags-list");
  docMechanicsList = document.getElementById("mechanics-list");

  let tagsArray = [];
  for (var tag in Tags) {
    if (Object.prototype.hasOwnProperty.call(Tags, tag)) {
      tagsArray.push(tag);
    }
  }
  tagsArray.sort();

  let tagsString = "";
  tagsArray.forEach((tag) => {
    if (Object.prototype.hasOwnProperty.call(Tags, tag)) {
      tagsString += `<div class="tag"><input type="checkbox" id="${tag}"><label for="${tag}">${Tags[tag]}</label><br/></div>`;
    }
  });
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
    string += tag + ", ";
  });
  string = string.slice(0, string.length-2);

  return string;
}