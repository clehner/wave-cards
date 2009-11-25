/*
Wave-Cards
A Google Wave Gadget for playing cards
v1.0

Copyright (c) 2009 Charles Lehner

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

(function () {

var
	cardsContainer,          // #cards
	cardsWindow,             // #cardsWindow
	decksList,               // #decksList
	addMarkerIcon,           // #addMarkerIcon

	dialogbox,
	
	rotation = 0,            // angle the card container is rotated.
	
	transitionDuration = 250, // length (ms) of a transition/animation
	stackDensity = 3,        // cards per pixel in a stack

	dragUnderMode = false,   // to slide cards over or above other cards
	drag,                    // object being currently dragged
	players = [],            // wave participants
	highestId = 0,           // highest card id
	highestZ = 0,            // highest z-index of a card
	hasFocus,                // whether the window has the user's focus
	
	me,                      // the participant whose client renders the gadget
	meState,                 // state object for the viewing participant
	things = {},             // objects encoded in the wave state
	waveState,               // the wave gadget state
	waveStateKeys = [],      // the keys of the gadget state
	waveStateValues = {},    // the values of the gadget state
	gadgetLoaded = false,
	stateLoaded = false,
	participantsLoaded = false;

/*
#cardsWindow
  #hostButtons
  #addDeck
  #rotate
  #cards
*/

function $(id) {
	return document.getElementById(id);
}

/* ---------------------------- Gadget State ---------------------------- */

function gadgetLoad() {
	// run once
	if (gadgetLoaded) return;

	// Get DOM references
	cardsContainer = $("cards");
	cardsWindow = $("cardsWindow");
	decksList = $("decksList");
	addMarkerIcon = $("addMarkerIcon");
	
	// Wait for everything to be available
	if (!cardsContainer) {
		return setTimeout(arguments.callee, 20);
	}
	
	// Attach event listeners
	addEventListener("keydown", onKeyDown, false);
	addEventListener("keyup", onKeyUp, false);
	addEventListener("blur", onBlur, false);
	addEventListener("focus", onFocus, false);
	cardsContainer.addEventListener("mousedown", onMouseDown, false);
	cardsContainer.addEventListener("dblclick", onDoubleClick, false);
	cardsWindow.addEventListener("contextmenu", onContextMenu, false);
	addMarkerIcon.addEventListener("mousedown", onMouseDownMarkerIcon, false);

	// initialize dialog boxes
	dialogBox = new DialogBox();
	
	$("helpBtn").addEventListener("click", dialogBox.openHelp, false);
	$("rotateBtn").addEventListener("click", rotateTable, false);
	$("decksBtn").addEventListener("click", dialogBox.openDecks, false);
	$("addMarkerBtn").addEventListener("click", togglePlayerMarker, false);
	
	// Set up wave callbacks
	if (wave && wave.isInWaveContainer()) {
		wave.setStateCallback(stateUpdated);
		wave.setParticipantCallback(participantsUpdated);
	}
	gadgetLoaded = true;
}
gadgets.util.registerOnLoadHandler(gadgetLoad);

// called when the wave state is updated
function stateUpdated() {
	var keys, i, key, value, thing;
	
	// we must wait for the players list before loading the cards
	if (!participantsLoaded) {
		return;
	}
	
	waveState = wave.getState();
	if (!waveState) {
		return;
	}
	keys = waveState.getKeys();
	waveStateValues = {};
	
	// Update stuff
	for (i = 0; (key=keys[i]); i++) {
		value = waveState.get(key);
		if (typeof value == "string") {
			waveStateValues[key] = value;
			
			thing = getThing(key);
			thing.updateState(value);
		}
	}
	
	// Check for deleted objects
	// by keys that were in the state before but now are not
	for (i = waveStateKeys.length; i--;) {
		key = waveStateKeys[i];
		if (!(key in waveStateValues)) {
			thing = getThing(key);
			thing.remove();
		}
	}
	
	waveStateKeys = keys;
	
	if (!stateLoaded) {
		stateLoaded = true;
		if (participantsLoaded) {
			onEverythingLoad();
		}
	}
}

// called by Wave
function participantsUpdated() {
	players = wave.getParticipants();
	me = wave.getViewer();
	
	if (me) {
		// Update avatars.
		addMarkerIcon.src = me.getThumbnailUrl();
		$("addMarkerIcon2").src = me.getThumbnailUrl();
		
		var playerObjects = Player.prototype.allPlayers;
		for (id in playerObjects) {
			playerObjects[id].renderAvatar();
		}
	
		if (!participantsLoaded) {
			participantsLoaded = true;
			if (stateLoaded) {
				onEverythingLoad();
			} else {
				stateUpdated();
			}
		}
	}
}

// called after the first state and participants updates have been received.
function onEverythingLoad() {
	// If this is the viewer's first visit, show them the help screen.
	meState = getThing("player_" + me.getId());
	if (meState.firstVisit) {
		dialogBox.openHelp();
		
		// If the gadget state is empty (there are no cards), create a deck.
		if (waveStateKeys.length == 0) {
			// blue, 2 jokers, and shuffled
			addDeck(0, 2, true);
		}
	}
}

// get a stateful object (card or deck) by its key in the wave state
function getThing(key) {
	if (!things[key]) {
		var key2 = key.split("_");
		var type = key2[0];
		var id = ~~key2[1];
		
		var Constructor =
			type == "card" ? Card :
			type == "deck" ? Deck :
			type == "player" ? Player :
		Stateful;
			
		var thing = new Constructor(id, key);
		
		things[key] = thing;
	}
	
	return things[key];
}

/* ---------------------------- Event listeners ---------------------------- */

//@jrs - double click to flip
function onDoubleClick(e) {
	addEventListener("mouseup", onMouseUp, false);
	
	if (e.target && e.target.object && e.target.object instanceof Movable) {
		// mousedown on a card
		
		if (e.ctrlKey || (e.which==3) || (e.button==2)) {
			CardSelection.peek();
		}
		else if (e.shiftKey) {
			CardSelection.stack();
		}
		else if (e.altKey) {
			CardSelection.shuffle();
		}
		else {
			CardSelection.flip();
		}
	}
}
 
function onMouseDown(e) {
	// start mouse drag
	addEventListener("mousemove", onDrag, false);
	addEventListener("mouseup", onMouseUp, false);
	
	if (e.target && e.target.object && e.target.object instanceof Movable) {
		// mousedown on a card
		drag = CardSelection;
		var card = e.target.object;
		
		if (!card.selected && !e.shiftKey) {
			// starting a new selection
			CardSelection.clear();
		}
		CardSelection.add(card);

		// prevent dragging the images in firefox
		e.preventDefault();

		// but don't prevent focus from being taken
		if (!hasFocus) {
			window.focus();
		}

		//@jrs - drag under with ctrl or right-click
		if ((e.which==3) || (e.button==2)) {
			dragUnderMode = true;
		}
		
	} else {
		// mousedown on empty space, create a selection box.
		// clear the selection unless shift is held
		if (!e.shiftKey) {
			CardSelection.clear();
		}
		drag = SelectionBox;
	}
	
	var rot = rotatePoint(e.clientX, e.clientY, rotation,
		cardsContainer.offsetWidth, cardsContainer.offsetHeight);
	drag.dragStart(rot.x, rot.y, e);
}

function onMouseUp(e) {
	// release the drag
	drag.dragEnd();
	drag = null;
	removeEventListener("mouseup", onMouseUp, false);
	removeEventListener("mousemove", onDrag, false);
	
	//if we were using a mouse+keyboard toggle to drag under, release @jrs
	if ((e.which==3) || (e.button==2)) {
		dragUnderMode = false;
	}
}

function onDrag(e) {
	var rot = rotatePoint(e.clientX, e.clientY, rotation,
		cardsContainer.offsetWidth, cardsContainer.offsetHeight);
	drag.drag(rot.x, rot.y);
}

// stop the context menu on cards
function onContextMenu(e) {
	if (e.target && e.target.object && e.target.object instanceof Movable) {
		e.preventDefault();
	}
}

// Hotkeys

var keydowns = {};

function onKeyDown(e) {
	var key = e.keyCode;
	if (keydowns[key]) {
		return true;
	}
	keydowns[key] = true;

	switch(key) {
		// U - drag cards under other cards
		case 85:
			dragUnderMode = true;
			CardSelection.detectOverlaps();
		break;
		// S - Shuffle the selected cards
		case 83:
			CardSelection.shuffle();
		break;
		// G - Group cards into a single stack.
		case 71:
			CardSelection.stack();
		break;
		// F - Flip
		case 70:
			CardSelection.flip();
		break;
		// P - peek
		case 80:
			CardSelection.peek();
	}
}

function onKeyUp(e) {
	var key = e.keyCode;
	keydowns[key] = false;
	
	switch(key) {
		// U - drag cards above other cards
		case 85:
			dragUnderMode = false;
			CardSelection.detectOverlaps();
	}
}

function onFocus() {
	hasFocus = true;
}

// stop dragging cards when the window loses focus
function onBlur(e) {
	hasFocus = false;
	if (drag) {
		onMouseUp(e);
	}
}

function onMouseDownMarkerIcon(e) {
	// stop dragging the icon.
	e.preventDefault();
}

// create a deck of cards
function addDeck(colorId, numJokers, shuffled) {
	var newDeck, deckShift, cards, card, positions, pos, types, type, i, l, s, r, xy;
	
	newDeck = getThing("deck_"+(++highestId));
	
	deckNum = Deck.prototype.totalDecks - 1;
	xShift = 100 * (deckNum % 5);
	yShift = 120 * ~~(deckNum / 5);
	
	newDeck.colorId = colorId;
	newDeck.jokers = numJokers;
	
	cards = Array(52);
	types = Array(52);
	positions = Array(52);
	i = 0;
	
	for (s = 0; s < 4; s++) {
		for (r = 0; r < 13; r++) {
			types[i++] = {
				id: ++highestId,
				suit: s,
				rank: r
			};
		}
	}
			
	// Add jokers.
	while (numJokers--) {
		types[i++] = {
			id: ++highestId,
			suit: i % 2,
			rank: 13
		}
	}
	
	// Initialize the positions separately from the suit/rank so that the
	// cards can be shuffled more easily.
	for (l = i, i = 0; i < l; i++) {
		xy = 30 + ~~(i / stackDensity);
		positions[i] = {
			x: xy + xShift,
			y: xy + yShift,
			z: ++highestZ
		}
	}
	
	// Shuffle the deck if necessary.
	if (shuffled) {
		shuffle(positions);
	}
	
	// Update the cards with their info.
	while (i--) {
		type = types[i];
		pos = positions[i];
		card = cards[i] = getThing("card_" + type.id);
		
		card.deck = newDeck;
		card.suit = type.suit;
		card.rank = type.rank;
		card.stateX = pos.x;
		card.stateY = pos.y;
		card.z = pos.z;
		
		card.queueUpdate();
	}
	
	newDeck.cards = cards;
	newDeck.sendUpdate();
}

// rotate the cards container 180 degrees
function rotateTable() {
	var oldRotation = rotation;
	rotation += 180;
	var rotater = function (n) {
		return "rotate(" + (oldRotation + 180 * n) + "deg)";
	};

	var t = {};
	t[Transition.cssTransformType] = rotater;
	Transition(cardsContainer, t, transitionDuration);
}

// get the coordinates of a point rotated around another point by a certain angle
function rotatePoint(x, y, a, w, h) {
	a = a % 360 + (a < 0 ? 360 : 0);
	switch (a) {
		case 0:
			return {x: x, y: y};
		case 90:
			return {x: y, y: h-x};
		case 180:
			return {x: w-x, y: h-y};
		case 270:
			return {x: w-y, y: x};
		default:
			// TODO: fancy matrix stuff
	}
}

// speed up regexes by caching them
var getClassRegex = memoizer(function (cls) {
	return new RegExp("(\\s|^)" + cls + "(\\s|$)");
});

// Return whether or not an element has a class.
function hasClass(ele, cls) {
	if (!ele) throw new Error("not an element, can't add class name.");
	if (ele.className) {
		return getClassRegex(cls).test(ele.className);
	}
}

// Add a class to an element.
function addClass(ele, cls) {
	if (!hasClass(ele, cls)) ele.className += " " + cls;
}

// Remove a class from an element.
function removeClass(ele, cls) {
	if (hasClass(ele, cls)) {
		ele.className = ele.className.replace(getClassRegex(cls), " ");
	}
}

// Add or remove a class from an element
function toggleClass(ele, cls, yes) {
	if (yes) addClass(ele, cls);
	else removeClass(ele, cls);
}

// Randomly shuffle the elements of an array.
// http://stackoverflow.com/questions/962802#962890
function shuffle(array) {
	var tmp, current, top = array.length;

	if (top) while (--top) {
		current = Math.floor(Math.random() * (top + 1));
		tmp = array[current];
		array[current] = array[top];
		array[top] = tmp;
	}

	return array;
}

/* ---------------------------- Stateful ---------------------------- */

// an object that maintains its state in a node of the wave state.
Stateful = Classy({
	id: "",
	key: "",
	stateNames: [],
	_stateString: "",
	_state: [],
	removed: false,
	loaded: false, // has it recieved a state update yet, or is it a placeholder
	delta: {}, // delta is shared with all instances
	
	constructor: function (id, key) {
		this.id = id;
		this.key = key;
	},
	
	// convert the state to a string.
	// this should be overridden or augmented.
	makeState: function () {
		return {};
	},
	
	// update the state of the item
	updateState: function (newStateString) {
		if (!newStateString && this.removed) this.remove();
		if (this.removed) return; // don't wake the dead
		
		// first compare state by string to see if it is different at all.
		if (newStateString == this._stateString) return;
		
		// convert state to array
		var newStateArray = newStateString.split(",");
		
		// build an object of the new state
		var newStateObject = {};
		var changes = {};
		// and find which properties are changed in the new state
		for (var i = this.stateNames.length; i--;) {
			var stateName = this.stateNames[i];
			newStateObject[stateName] = newStateArray[i];
			if (this._state[stateName] !== newStateArray[i]) {
				// this property is changed
				changes[stateName] = true;
			}
		}
		
		// notify the object of the state change and updated properties
		this.update(changes, newStateObject);
		this._state = newStateObject;
		this._stateString = newStateString;
		this.loaded = true;
	},
	
	// encode the state into string format
	makeStateString: function () {
		if (this.removed) return null;
		
		var stateObject = this.makeState();
		var len = this.stateNames.length;
		var stateArray = new Array(len);
		for (var i = len; i--;) {
			stateArray[i] = stateObject[this.stateNames[i]];
		}
		return stateArray.join(",");
	},
	
	// send the wave an update of this item's state
	sendUpdate: function (local) {
		this.queueUpdate(local);
		this.flushUpdates();
	},
	
	// queue the item to be updated later.
	queueUpdate: function (local) {
		var stateString = this.makeStateString();
		this.delta[this.key] = stateString;
		if (local) {
			this.updateState(stateString);
		}
	},
	
	// send queued deltas
	flushUpdates: function (local) {
		waveState.submitDelta(this.delta);
		Stateful.prototype.delta = {};
	},
	
	// delete this object
	remove: function () {
		this.removed = true;
	},
	
	markForRemoval: function () {
		this.makeStateString = function () {
			return null;
		};
	},
	
	// Deal with a state change. Should be overridden
	update: function () {}
});

/* ---------------------------- Deck ---------------------------- */

Deck = Classy(Stateful, {
	stateNames: ["color", "cards", "jokers"],
	totalDecks: 0,
	
	colors: ["blue", "red", "green"],
	color: "",
	colorId: 0,
	cards: [],
	jokers: 0,
	
	row: null,
	icon: null,
	jokersText: null,

	constructor: function () {
		Stateful.apply(this, arguments);
		
		highestId = Math.max(highestId, this.id);
		Deck.prototype.totalDecks++;
		
		this.cards = [];
		
		this.icon = document.createElement("span");
		this.icon.className = "deckIcon";
		
		this.jokersText = document.createTextNode("");
		
		var removeBtn = document.createElement("button");
		removeBtn.innerHTML = "Remove";
		removeBtn.object = this;
		removeBtn.onclick = this.clickRemove;
		
		var row = this.row = document.createElement("li");
		row.appendChild(this.icon);
		row.appendChild(this.jokersText);
		row.appendChild(removeBtn);
		row.object = this;
		row.onmouseover = this.highlightCards;
		row.onmouseout = this.highlightCards;
		
		decksList.appendChild(row);
	},

	makeState: function () {
		return {
			color: this.colorId,
			jokers: this.jokers,
			cards: this.cards.map(function (item) {
				return item.id;
			}).join(";")
		};
	},
	
	markForRemoval: function () {
		this.cards.forEach(function (card) {
			card.markForRemoval();
			card.queueUpdate();
		});
		Stateful.prototype.markForRemoval.call(this);
	},
	
	remove: function () {
		if (this.removed) return;
		Stateful.prototype.remove.call(this);

		delete this.cards;
		
		decksList.removeChild(this.row);
	},
	
	update: function (changes, newState) {
		if (changes.jokers) {
			this.jokers = ~~newState.jokers;
			this.jokersText.nodeValue = "(" + this.jokers + " jokers) ";
		}
	
		if (changes.cards) {
			var cardIds = newState.cards.split(";");
			var len = cardIds.length;
			this.cards = new Array(len);
			for (var i = len; i--;) {
				this.cards[i] = getThing("card_" + cardIds[i]);
			}
		}
		
		if (changes.color) {
			this.colorId = ~~newState.color;
			this.renderColor();
		}
	},
	
	renderColor: function () {
		removeClass(this.icon, this.color);
		this.color = this.colors[this.colorId % 3];
		addClass(this.icon, this.color);
	},
	
	// on clicking the remove button, confirm removal
	clickRemove: function (e) {
		var $this = this.object;
		if (confirm("Delete this deck from the table?")) {
			$this.markForRemoval();
			$this.sendUpdate();
		}
	},
	
	// invert the selection of all the cards in the deck.
	highlightCards: function (e) {
		var $this = this.object;
		$this.cards.forEach(function (card) {
			card.selected ^= 1;
			card.renderSelected();
		});
	},
});



/* ---------------------------- Movable ---------------------------- */

Movable = Classy(Stateful, {
	all: {}, // all cards, by key
	
	width: 0,
	height: 0,
	x: NaN,
	y: NaN,
	z: 0,
	oldX: NaN,
	oldY: NaN,
	oldZ: NaN,
	stateX: 0,
	stateY: 0,
	title: "",
	user: null,       // wave user last to touch it
	userClass: "",    // css class representing the user
	deck: null,       // the deck this card is apart of 
	deckClass: "",    // css class for the deck color
	moving: false,    // a wave user is holding or dragging the card
	movingNow: false, // animating a move. not necessarily being held
	selected: false,  // is in the selection
	dragging: false,  // is being dragged by the mouse
	overlaps: {},     // other movables that are overlapping this one.
	
	stateNames: ["deck", "moving", "x", "y", "z", "user"],
	
	makeState: function () {
		return {
			deck: this.deck ? this.deck.id : "",
			x: ~~this.stateX,
			y: ~~this.stateY,
			z: ~~this.z,
			moving: this.moving ? "m" : "",
			user: me ? me.getId() : ""
		};
	},

	dom: (function () {
		var wrapper, label, card, front, back;
		
		// Create "prototype" DOM elements
		(wrapper = document.createElement("div")) .className = "cardWrapper";
		(card    = document.createElement("div")) .className = "card";
		(label   = document.createElement("span")).className = "label";
		
		wrapper.appendChild(card);
		wrapper.appendChild(label);
		
		return {
			wrapper: wrapper
		};
	})(),
	
	constructor: function () {
		Stateful.apply(this, arguments);
		
		highestId = Math.max(highestId, this.id);
		
		this.all[this.key] = this;
		this.overlaps = {};
		
		// Clone the dom elements from the prototype into this instance
		var wrapper, card;
		this.dom = {
			wrapper: (wrapper = this.dom.wrapper.cloneNode(1)),
			card: (card = wrapper.childNodes[0]),
			label: wrapper.childNodes[1]
			//front: card.childNodes[0],
			//back: card.childNodes[1]
		};
		
		// Give the dom elements references to this card object
		for (var node in this.dom) {
			this.dom[node].object = this;
		}
	},
	
	remove: function () {
		if (this.removed) return; // beat not the bones of the buried
		Stateful.prototype.remove.call(this);
		
		delete this.all[this.key];
		
		// stop dragging
		//if (captured == this) captured = null;

		// remove from z-index cache
		ZIndexCache.remove(this);
		
		// deselect
		if (this.selected) {
			CardSelection.remove(this);
		}
		
		// stop any running transitions
		Transition.stopAll(this.dom.card);

		cardsContainer.removeChild(this.dom.wrapper);
		
		// Remove DOM<->JS connections.
		for (var node in this.dom) {
			delete this.dom[node].object;
		}
		delete this.dom;

	},
		
	update: function (changes, newState) {
	
		if (!this.loaded) {
			// then this is the first state update.
			// Insert the card into the page.
			cardsContainer.appendChild(this.dom.wrapper);
		}
	
		if (changes.deck) {
			this.deck = getThing("deck_" + newState.deck);
			this.renderDeck();
			
			// if the deck is not yet loaded, wait until it is.
			if (!this.deck.loaded) {
				this.deck.cards.push(this);
				var $this = this;
				setTimeout(function () {
					if ($this.deck.loaded) {
						$this.renderDeck();
					}
				}, 1);
			}
		}
		
		// if a card moves while it is selected and being dragged,
		// refresh the selection's bounds
		if (this.dragging && this.selected && (changes.x || changes.y || changes.z)) {
			CardSelection.refreshBounds();
		}

		if (changes.x || changes.y) {
			this.stateX = ~~newState.x;
			this.stateY = ~~newState.y;
			this.renderPosition(true);
		}
		
		if (changes.z) {
			this.z = ~~newState.z;
			this.renderZ();
		}
		
		if (changes.moving) {
			// someone who is holding or dragging the card
			this.moving = (newState.moving=="m");
			this.renderHighlight();
		}
		
		if (changes.user) {
			// the user who last touched the card
			this.user = wave.getParticipantById(newState.user);
			this.renderUserLabel();
		}
	},
	
	// return whether an object is overlapping another.
	isOverlapping: function (thing) {
		if (this === thing) return false; // can't overlap itself

		var xDelta = thing.x - this.x;
		var yDelta = thing.y - this.y;

		return ((xDelta < this.width) && (-xDelta < thing.width) &&
			(yDelta < this.height) && (-yDelta < thing.height));
	},
		
	// return an id-map of all cards overlapping this one.
	getOverlappingObjects: function () {
		var overlappingObjects = {};
		var all = Movable.prototype.all;
		for (var i in all) {
			var item = all[i];
			if (this.isOverlapping(item)) {
				overlappingObjects[i] = item;
			}
		}
		return overlappingObjects;
	},
	
	// detect and process cards that overlap with this one.
	detectOverlaps: function () {
		var overlaps = this.getOverlappingObjects();
		for (var i in overlaps) {
			if (!this.overlaps[i]) this.onOverlap(overlaps[i]);
		}
		this.overlaps = overlaps;
	},

	dragStart: function (x, y, e) {
		//captured = this;
		this.user = me;
		
		// stop the card if it is moving.
		if (this.movingNow) {
			this.x = this.dom.wrapper.offsetLeft;
			this.y = this.dom.wrapper.offsetTop;
			this.renderPositionStatic();
		}
		
		this.startX = x - this.x;
		this.startY = y - this.y;
		
		// the viewer is holding the card
		this.user = me;
		this.moving = true;
		
		// cheat and render early for responsiveness
		this.renderUserLabel();
		this.renderHighlight();
		
		this.queueUpdate();
		return false;
	},
	
	drag: function (x, y) {
		this.oldX = this.x;
		this.oldY = this.y;
		this.x = x - this.startX;
		this.y = y - this.startY;
		this.renderPositionStatic();
	},
	
	dragEnd: function () {
		this.stateX = this.x;
		this.stateY = this.y;
		
		this.moving = false;
		
		this.queueUpdate();
		this.renderHighlight();
	},
	
	/*	About the layering modes:
		The goal is for moving the cards around to feel as realistic as possible. There are two layering modes: drag-under mode and drag-over mode, represented by the boolean var dragUnderMode. They are toggled by holding the "u" key. In drag-under mode, dragged cards should slide under the other cards. In drag-over mode, they should be able to be placed above the other cards. This all has to be done while maintaining the layering so that you cannot move a card up "through" another card.
		The way it is done is this:
		The selection is being dragged.
		A card (A) in the selection is being detected to be overlapping an outside card (B).
		If in drag-under mode, raise every card in the selection above card B.
		Else, raise card A above card B.
		Also raise every card that is above the card being raised,
		unless one of them is the card being raised over,
		in which case do nothing.
	*/
	
	// Raise a group of cards and every card overlapping above them,
	// above the current card.
	raise: function (cardsToRaise) {
		cardsToRaise = Array.prototype.concat.call(cardsToRaise);
		
		var numCardsToRaise = cardsToRaise.length;
		
		if (!numCardsToRaise) {
			// nothing to raise
			return;
		}
		
		// Get the minimum z of the cards to be raised.
		var lowestCard = cardsToRaise[0];
		var lowestZ = lowestCard.z;
		for (var i = numCardsToRaise - 1; i--;) {
			var card = cardsToRaise[i];
			if (card.z < lowestZ) {
				lowestCard = card;
				lowestZ = card.z;
			}
		}
		
		// Get the cards that overlap above this card (recursively).
		
		// Get cards with z >= the lowest base cardthis card's z.
		var cardsAbove = ZIndexCache.getAbove(lowestZ);
		// Ones of these that overlap with this card (or with one that does, etc),
		// will need to be raised along with this one.
		
		// for each card with z >= this card
		for (i = cardsAbove.length; i--;) {
			var cardAbove = cardsAbove[i];
			
			// check if card overlaps with any of the cards to be raised
			for (var j = 0; j < numCardsToRaise; j++) {
				var cardToRaise = cardsToRaise[j];
				
				if (cardToRaise.isOverlapping(cardAbove)) {
					// It overlaps.
					
					// Make sure it is not a knot.
					if (cardAbove === this) {
					
						// This would mean raising a card above itself,
						// which is not possible. Abort!
						//console.log('knot');
						return false;
					} else {
						
						// it overlaps, therefore it will be raised too.
						cardsToRaise[numCardsToRaise++] = cardAbove;
						break;
					}
				}
			}
		}
		
		// Raise the cards while maintaining the stacking order.
		// Minimizing the distances between them, without lowering them
		var raiseAmount = this.z - lowestZ + 1;
		var zPrev = Infinity;
		
		for (i = 0; i < numCardsToRaise; i++) {
			var card = cardsToRaise[i];
			
			zDelta = card.z - zPrev;
			zPrev = card.z;
			
			if (zDelta > 1) {
				raiseAmount -= zDelta - 1;
				if (raiseAmount < 1) {
					// can't do lowering yet. (TODO)
					break;
				}
			}
			
			card.z += raiseAmount;
			card.renderZ();
			card.queueUpdate();
		}
		
		return true;
	},
	
	isMine: function () {
		return (this.user == me) || (this.user && me &&
			this.user.getId() === me.getId());
	},
	
	flip: function () {},
	peek: function () {},
	
	/* ---------------------------- View functions ---------------------------- */
	
	renderUserLabel: function () {
		var playerNum = players.indexOf(this.user);
		if (playerNum == -1) playerNum = 0;
		
		// replace old class with new one
		if (this.userClass) {
			removeClass(this.dom.wrapper, this.userClass);
		}
		this.userClass = "p" + ((playerNum % 8) + 1);
		addClass(this.dom.wrapper, this.userClass);
		
		//timeout?
		if (this.user) {
			// Set the label to the player's first name,
			// or blank if they are the viewer.
			var userLabel = this.isMine() ? "" :
				this.user.getDisplayName().match(/^[^ ]+/, '')[0];
			this.dom.label.innerHTML = userLabel;
		}
	},

	// determine whether the card should have a highlight or not
	needsHighlight: function () {
		return this.flipping || this.peeking || this.peeked || this.moving || this.movingNow;
	},
	
	// set whether the card is selected or not
	renderSelected: function () {
		toggleClass(this.dom.wrapper, "selected", this.selected);
		this.renderHighlight();
	},
	
	// Display or hide the card's highlight and player label.
	renderHighlight: function () {
		var needsHighlight = this.needsHighlight();
		if (needsHighlight == this.highlighted) {
			return;
		}
		this.highlighted = needsHighlight;
		toggleClass(this.dom.wrapper, "highlight", needsHighlight);

		// Fade hiding the label, but show it immediately
		if (needsHighlight) {
			if (this.dom.label._transitions && this.dom.label._transitions.opacity) {
				this.dom.label._transitions.opacity.stop();
			}
			this.dom.label.style.opacity = 1;
			this.dom.label.style.visibility = "visible";
			
		} else {
			Transition(
				this.dom.label,
				{opacity: 0},
				transitionDuration * (this.isMine() ? .5 : 3),
				function (n) {
					// Hide the label when the animation is done so it doesn't
					// get in the way of other things
					if (this.style.opacity == 0) {
						this.style.visibility = "hidden";
					}
				}
			);
		}
	},
	
	// move the card to its x and y.
	renderPosition: function (transition) {
		if ((this.x == this.stateX) && (this.y == this.stateY)) {
			// no change
			return;
		}
		
		var oldX = this.x;
		
		this.x = ~~this.stateX;
		this.y = ~~this.stateY;
		
		if (transition && !isNaN(oldX)) {
			var $this = this;
			this.movingNow = true;
			this.renderHighlight();
			Transition(this.dom.wrapper, {
				left: this.x + "px",
				top: this.y + "px"
			}, transitionDuration, function (n) {
				$this.movingNow = false;
				$this.renderHighlight();
			});
			
		} else {
			this.renderPositionStatic();
		}
	},
	
	renderPositionStatic: function () {
		this.movingNow = false;
		this.dom.wrapper.style.left = this.x + "px";
		this.dom.wrapper.style.top = this.y + "px";
	},
	
	// set the z-index of the element to the z of the object.
	renderZ: function () {
		if (this.z === this.oldZ) {
			return false;
		}
		
		if (this.z > 100000) {
			// problem: the z-index shouldn't get this high in the first place.
			this.z = 0;
			//throw new Error("z-index is too high!");
		}
		
		ZIndexCache.remove(this, this.oldZ);
		ZIndexCache.add(this);
		
		this.oldZ = this.z;
		this.dom.card.style.zIndex = this.z;
		if (this.z > highestZ) highestZ = this.z;
	}
});


/* ---------------------------- Flippable ---------------------------- */

Flippable = Classy(Movable, {
	faceup: false,    // which side is up
	flipping: false,  // animating a flip
	peeking: false,   // we are peeking at the card
	peeked: false,    // someone else is peeking at the card

	stateNames: ["deck", "flip", "peek", "moving", "x", "y", "z", "user"],
	
	makeState: function () {
		var state = Movable.prototype.makeState.call(this);
		state.flip = this.faceup ? "f" : "";
		state.peek = this.peeking ? "p" : "";
		return state;
	},
	
	dom: (function () {
		var wrapper, card, front, back;
		
		// Add a back node into the wrapper "prototype" node
		wrapper = Movable.prototype.dom.wrapper.cloneNode(1);
		card = wrapper.childNodes[0];
		
		front = document.createElement("div");
		front.className = "front";
		card.appendChild(front);
		
		back = document.createElement("div");
		back.className = "back";
		card.appendChild(back);
		
		return {
			wrapper: wrapper
		};
	})(),
	
	constructor: function () {
		Movable.apply(this, arguments);
		
		this.dom.front = this.dom.card.childNodes[0];
		this.dom.front.object = this;
		
		this.dom.back = this.dom.card.childNodes[1];
		this.dom.back.object = this;
	},
	
	update: function (changes, newState) {		
		Movable.prototype.update.apply(this, arguments);
		
		if (changes.flip) {
			// Flip the card
			this.faceup = !!newState.flip;
			this.renderFlip();
		}
		
		if (changes.peek || (changes.user && this.peeked)) {
			// A user is peeking at the card.
			// If the card remains peeked but its owner changes, we need
			// to recalculate who it is that is peeking.
			this.peeked = !!newState.peek;
			this.peeking = this.peeked && this.isMine();
			this.renderPeek();
		}
	},

	// Flip this card.
	flip: function () {
		this.faceup = !this.faceup;
		this.queueUpdate();
	},
	
	// Peek this card.
	peek: function () {
		this.peeking = !this.peeking;
		this.queueUpdate();
	},
	
	/* ---------------------------- View functions ---------------------------- */
	
	// If the user is peeking at the card, show a corner of the back through the front.
	renderPeek: function () {
		toggleClass(this.dom.wrapper, "peeked", this.peeked || this.peeking);
		toggleClass(this.dom.wrapper, "peeking", this.peeking);
		this.renderHighlight();
	},

	// helper functions for renderFlip
	removeFlipClass: function () {
		removeClass(this.dom.wrapper, this.faceup ? "facedown" : "faceup");
	},
	flipClasses: function () {
		this.removeFlipClass();
		addClass(this.dom.wrapper, this.faceup ? "faceup" : "facedown");
	},
	
	renderFlip: function () {
		var $this, faceup, a, halfWay, t, rotater;
		
		faceup = this.faceup;
		$this = this;
		
		if (this.isFaceup === undefined) {
			this.isFaceup = faceup;
			return this.flipClasses();
		}
		
		this.flipping = true;
		this.renderHighlight();
		
		// Animate the flip with the transform property if it is supported, otherwise opacity.
		var cssTransform = Transition.cssTransformType;
		if (cssTransform) {
			/*
				Safari 3 and Mozilla 3.5 support CSS Transformations. Safari 4
				and Chrome support rotateY, a 3D transformation. So we use
				rotateY if it is supported, otherwise a matrix "stretch".
				Fall back on opacity if transforms are not supported.
			*/
			
			if (window.WebKitCSSMatrix) {
				this.dom[faceup ? "back" : "front"].style[cssTransform] =
					"rotateY(180deg)";
				
				// rotate to 0 from 180 or -180
				a = faceup ? -1 : 1;
				rotater = function (n) {
					return "rotateY(" + 180*(a + -a*n) + "deg)";
				};
				
				halfWay = 3; // 3 not 2 because of the easing function i think
			} else {
				// 
				this.dom[faceup ? "back" : "front"].style[cssTransform] =
					"matrix(-1, 0, 0, 1, 0, 0)";
				
				// flip from -1 to 1, reverse to front
				rotater = function (n) {
					return "matrix(" + (-1 + 2*n) + ", 0, 0, 1, 0, 0)";
				};
				
				halfWay = 2;
			}
			this.dom.card.style[cssTransform] = rotater(0);
			
			// the transition needs a delay before it can be applied, for some reason.
			setTimeout(function () {
				t = {};
				t[cssTransform] = rotater;
				Transition($this.dom.card, t, transitionDuration, function () {
					$this.dom.card.style[cssTransform] = "";
					$this.dom.front.style[cssTransform] = "";
					$this.dom.back.style[cssTransform] = "";
					$this.flipping = false;
					$this.renderHighlight();
					$this.removeFlipClass();
				});
				setTimeout(function () {
					$this.flipClasses();
				}, transitionDuration / halfWay);
			}, 0);
			
		} else {
			// no transforms support; use opacity.
			this.dom.back.style.opacity = ~~faceup;
			this.removeFlipClass();
			Transition(this.dom.back, {opacity: ~~!this.faceup},
				transitionDuration, function () {
				$this.flipClasses();
				$this.flipping = false;
				$this.renderHighlight();
			});
		}
	}
});


/* ---------------------------- Card ---------------------------- */

Card = Classy(Flippable, {
	suits: ["diamonds", "spades", "hearts", "clubs"],
	ranks: ["ace", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "jack", "queen", "king", "joker"],

	width: 73,
	height: 97,
	suit: 0,
	rank: 0,
	
	stateNames: ["deck", "suit", "rank", "flip", "peek", "moving",
		"x", "y", "z", "user"],
	
	makeState: function () {
		var state = Flippable.prototype.makeState.call(this);
		state.suit = this.suit;
		state.rank = this.rank;
		return state;
	},
		
	update: function (changes, newState) {
		if (changes.suit || changes.rank) {
			if (changes.suit) this.suit = newState.suit;
			if (changes.rank) this.rank = newState.rank;
			this.renderFace();
		}
		Flippable.prototype.update.apply(this, arguments);
	},
		
	/* ---------------------------- Card View functions ---------------------------- */
	
	// Set the card's classes and title to its suit and rank.
	renderFace: function () {
		var rank = this.ranks[this.rank];
		var suit = this.suits[this.suit];
		
		if (rank == "joker") {
			// Joker can be rendered only in spades or diamonds
			this.suit %= 2;
			suit = this.suits[this.suit];
			
			// because it has no suit, only color.
			var color = (this.suit == 0) ? "black" : "red";
			this.title = color + " joker";
			
		} else {
			this.title = rank + " of " + suit;
		}
		this.dom.front.setAttribute("title", this.title);

		addClass(this.dom.front, rank);
		addClass(this.dom.front, suit);
		
	},
	
	renderDeck: function () {
		if (this.deckClass) {
			removeClass(this.dom.card, this.deckClass);
		}
		this.deckClass = this.deck.color;
		addClass(this.dom.card, this.deckClass);
	}
});

// Cards Selection
var CardSelection = {
	cards: [],
	x: 0,
	y: 0,
	startX: 0,
	startY: 0,
	width: 0,
	height: 0,
	z: 0,  // highest z
	z1: 0, // lowest z
	overlappers: [], // cards that overlap a card in the selection
	overlappees: {}, // Cards in the selection that have an overlapper,
	                 // by the id of their overlapper
	
	// Clear the selection
	clear: function () {
		this.cards.forEach(function (card) {
			card.selected = false;
			card.renderSelected();
		});
		this.cards = [];
	},
	
	// add a card to the selection
	add: function (card) {
		if (!card.selected) {
			this.cards.push(card);
			card.selected = true;
			card.renderSelected();
		}
	},
	
	// remove a card from the selection
	remove: function (card) {
		this.cards.splice(this.cards.indexOf(card), 1);
		card.selected = false;
	},
	
	// compute the dimensions and coordinates of the selection as a whole
	refreshBounds: function () {
		var cards = this.cards,
		x1 = Infinity,
		x2 = -Infinity,
		y1 = Infinity,
		y2 = -Infinity,
		z1 = Infinity,
		z2 = -Infinity;
		for (i = cards.length; i--;) {
			with(cards[i]) {
				var x3 = x + width;
				var y3 = y + height;
				if (x < x1)  x1 = x;
				if (x3 > x2) x2 = x3;
				if (y < y1)  y1 = y;
				if (y3 > y2) y2 = y3;
				if (z < z1)  z1 = z;
				if (z > z2)  z2 = z;
			}
		}
		this.x = x1;
		this.width = x2 - x1;
		this.y = y1;
		this.height = y2 - y1;
		this.z = z2;
		this.z1 = z1;
	},
	
	// Collision detection.
	// Detect what cards are in the way of the selection
	detectOverlaps: function () {
		var cardsNear, i, j, len, overlappers, overlappees, card, overlappee;
	
		// find cards that might be in the way.
		if (dragUnderMode) {
			cardsNear = ZIndexCache.getBelow(this.z);
		} else {
			cardsNear = ZIndexCache.getAbove(this.z1);
		}
		
		len = cardsNear.length;
		j = 0;
		overlappers = new Array(len);
		overlappees = {};
		
		for (i = 0; i < len; i++) {
			card = cardsNear[i];
			
			// don't test for collision with self
			if (!card.selected) {
			
				overlappee = this.nowOverlaps(card);
				if (overlappee) {
					// Collision!
					
					// Overlappee is the card in the selection that is
					// being overlapped by the overlapper, card.
					
					overlappees[card.id] = overlappee;
					overlappers[j++] = card;
				}
			}
		}
		this.overlappees = overlappees;
		this.overlappers = overlappers;
	},
	
	// start dragging the selected cards
	dragStart: function (x, y) {
		this.cards.forEach(function (card) {
			card.dragStart(x, y);
		});
		Stateful.prototype.flushUpdates();
		
		this.refreshBounds();
		this.detectOverlaps();
		
		this.startX = x - this.x;
		this.startY = y - this.y;
	},
	
	drag: function (x, y) {
		var cards, overlapper, i, oldOverlappees, overlappers,
			overlappee, oldOverlappee;
		
		// update the position of each card
		cards = this.cards;
		for (i = cards.length; i--;) {
			cards[i].drag(x, y);
		}
		
		// update the position of the selection as a whole
		this.x = x - this.startX;
		this.y = y - this.startY;
		
		oldOverlappees = this.overlappees;
		this.detectOverlaps();
		overlappers = this.overlappers; // cards that overlap a card in the selection
		
		for (i = 0; overlapper = overlappers[i]; i++) {

			oldOverlappee = oldOverlappees[overlapper.id];
			overlappee = this.overlappees[overlapper.id];
			if (overlappee != oldOverlappee) {
				// The overlap is new, or with a different card than before.
				
				// Temporarily move back the overlappee to before it was
				// overlapping, so it doesn't get in the way of itself.
				with(overlappee) {
					var realX = x;
					var realY = y;
					x = oldX;
					y = oldY;
				}
				
				// Raise the Z of one pile over one card.
				if (dragUnderMode) {
					overlappee.raise(overlapper);
				} else {
					overlapper.raise(CardSelection.cards);
				}
				
				// Restore overlappee position.
				overlappee.x = realX;
				overlappee.y = realY;
				overlappee.sendUpdate(true);
				
				// Because the selection's Z has changed, recalculate its
				// bounds.
				this.refreshBounds();
				
				// don't need to test for any more collisions, because
				// the overlaps are ordered by significance
				break;
			}
		}
	},
	
	dragEnd: function () {
		this.cards.forEach(function (card) {
			card.dragEnd();
		});
		Stateful.prototype.flushUpdates();
	},
	
	// If a card overlaps the selection now, return the card in the selection
	// that it overlaps with.
	nowOverlaps: function (card) {
		if (card.isOverlapping(this)) {
		
			// Now find exactly which card in the selection is overlapping.
			
			// In drag-under mode, find the highest card in the selection
			// that overlaps with the given card. In drag-over mode, find
			// the lowest.
			
			var zStart, zEnd, zInc
			if (dragUnderMode) {
				zStart = this.z;
				zEnd = this.z1;
				zInc = -1;
			} else {
				zStart = this.z1;
				zEnd = this.z;
				zInc = 1;
			}
			
			var buckets = ZIndexCache.buckets;
			for (var z = zStart; z != (zEnd + zInc); z += zInc) {
				var bucket = buckets[z];
				if (bucket) {
					for (var i = 0, l = bucket.length; i < l; i++) {
						var card2 = bucket[i];
						if (card2.selected && card2.isOverlapping(card)) {
							return card2;
						}
					}
				}
			}
		}
		return false;
	},
	
	peek: function () {
		this.cards.forEach(function (card) {
			card.peek();
		});
		Stateful.prototype.flushUpdates();
	},

	// flip the positions of the cards, not just the faces.
	flip: function () {
		this.refreshBounds();
		
		var zz = this.z + this.z1;
		// reverse the z order of the cards, don't change the x and y.
		
		this.cards.forEach(function (card) {
			card.z = zz - card.z;
			card.faceup = !card.faceup;
			card.queueUpdate();
		});
		Stateful.prototype.flushUpdates();
	},

	// shuffle the positions of the selected cards
	shuffle: function () {
		var cards = this.cards;
		// randomly reassign the position properties of each card
		var positions = cards.map(function (card) {
			return {
				x: card.x,
				y: card.y,
				z: card.z,
				faceup: card.faceup
			};
		});
		shuffle(positions);
		positions.forEach(function (pos, i) {
			with(cards[i]) {
				stateX = pos.x;
				stateY = pos.y;
				z = pos.z;
				faceup = pos.faceup;
				queueUpdate();
			}
		});
		Stateful.prototype.flushUpdates();
	},

	// stack the selected cards to one location
	stack: function () {
		var cards, n, x, y, i, card, shift;
		
		// sort the cards by z
		cards = this.cards.sort(function (a, b) {
			return a.z - b.z;
		});
		
		n = cards.length;
		
		// find the average position
		x = 0;
		y = 0;
		for (i = n; i--;) {
			card = cards[i];
			x += card.x;
			y += card.y;
		}
		x /= n;
		y /= n;
		
		shift = ~~((n - 1) / stackDensity / 2);
		x -= shift;
		y -= shift;
		
		// Cascade the cards diagonally, starting with the lowest card at
		// the top left.
		for (i = n; i--;) {
			card = cards[i];
			shift = ~~(i / stackDensity);
			card.stateX = x + shift;
			card.stateY = y + shift;
			card.queueUpdate();
		}
		
		Stateful.prototype.flushUpdates();
	}
};

var ZIndexCache = {
	buckets: [],      // array of buckets of each card, by z value
	aboveCache: {},   // cache for getAbove()
	belowCache: {},   // cache for getBelow()
	hasCaches: false, // are aboveCache and belowCache useful
	
	// add a card into the z-index cache
	add: function (card) {
		if (this.hasCaches) {
			this.aboveCache = {};
			this.belowCache = {};
			this.hasCaches = false;
		}
		
		var z = card.z;
		var bucket = this.buckets[z];
		if (bucket) {
			bucket[bucket.length] = card;
		} else {
			this.buckets[z] = [card];
		}
	},
	
	// remove a card from the z-index cache, optionally from a particular bucket
	remove: function (card, z) {
		if (this.hasCaches) {
			this.aboveCache = {};
			this.belowCache = {};
			this.hasCaches = false;
		}
		
		if (z === undefined) z = card.z;
		var bucket = this.buckets[z];
		if (bucket) {
			var index = bucket.indexOf(card);
			if (index != -1) {
				bucket.splice(index, 1);
			}
		}
	},
	
	// get cards with z >= a given amount, starting from max
	getAbove: function (zMin) {
		var cards, i, j, z, buckets, bucket, cache;
		
		// check cache first
		if (cache = this.aboveCache[zMin]) {
			return cache;
		}
		
		cards = [];
		j = 0;
		buckets = this.buckets;
		for (z = buckets.length-1; z >= zMin; z--) {
			if (bucket = buckets[z]) {
				// add each card in this bucket
				for (i = bucket.length; i--;) {
					cards[j++] = bucket[i];
				}
			}
		}
		
		this.aboveCache[zMin] = cards;
		this.hasCaches = true;
		return cards;
	},
	
	// get cards with z <= a given amount, starting from 0
	getBelow: function (zMax) {
		var cards, i, j, z, buckets, bucket, cache;
		
		// check cache first
		if (cache = this.belowCache[zMax]) {
			return cache;
		}
		
		cards = [];
		j = 0;
		buckets = this.buckets;
		for (z = 0; z <= zMax; z++) {
			if (bucket = buckets[z]) {
				// add each card in this bucket
				for (i = bucket.length; i--;) {
					cards[j++] = bucket[i];
				}
			}
		}
		
		this.belowCache[zMax] = cards;
		this.hasCaches = true;
		return cards;		
	}
};

// Drag Selection Box
var SelectionBox = {
	div: (function () {
		var div = document.createElement("div");
		div.id = "selectionBox";
		return div;
	})(),
	
	firstMove: false,
	startX: 0,
	startY: 0,
	x: 0,
	y: 0,
	width: 0,
	height: 0,
	
	overlaps: {},
	
	getOverlappingObjects: Card.prototype.getOverlappingObjects,
	isOverlapping: Card.prototype.isOverlapping,

	detectOverlaps: function () {
		var overlaps = this.getOverlappingObjects();
		for (var i in overlaps) {
			if (!this.overlaps[i]) this.onOverlap(overlaps[i]);
		}
		for (var i in this.overlaps) {
			if (!overlaps[i]) this.onUnOverlap(this.overlaps[i]);
		}
		this.overlaps = overlaps;
	},
	
	onOverlap: function (card) {
		CardSelection.add(card);
	},
	
	onUnOverlap: function (card) {
		CardSelection.remove(card);
		card.renderSelected();
	},
	
	// start a selection box
	dragStart: function (x, y) {
		this.dragging = true;
		this.startX = x;
		this.startY = y;
		
		this.firstMove = true;
	},
		
	drag: function (endX, endY) {
		with(this) {
			x = Math.min(startX, endX) +
				(document.documentElement.scrollLeft + document.body.scrollLeft +
				cardsWindow.scrollLeft - cardsWindow.offsetLeft);
			y = Math.min(startY, endY) +
				(document.documentElement.scrollTop + document.body.scrollTop +
				cardsWindow.scrollTop - cardsWindow.offsetTop);
			width = Math.abs(startX - endX);
			height = Math.abs(startY - endY);
			
			with(div.style) {
				left = x + "px";
				top = y + "px";
				width = this.width + "px";
				height = this.height + "px";
			}
		
			detectOverlaps();
			
			if (firstMove) {
				cardsContainer.appendChild(div);
				firstMove = false;
			}
		}
	},
	
	dragEnd: function () {
		if (!this.firstMove) {
			this.dragging = false;
			cardsContainer.removeChild(this.div);
		}
	}
};


/* ---------------------------- Player ---------------------------- */

Player = Classy(Movable, {
	stateNames: ["firstVisit", "hasMarker", "x", "y", "z", "user"],
	allPlayers: {},
	width: 68,
	height: 68,
	stateX: 100,
	stateY: 100,
	firstVisit: true,
	hasMarker: false,
	playerId: "",
	
	dom: (function () {
		var wrapper, card;
		
		wrapper = Movable.prototype.dom.wrapper.cloneNode(1);
		addClass(wrapper, "playerMarker");
		card = wrapper.childNodes[0];
		avatar = document.createElement("img");
		card.appendChild(avatar);
		
		return {
			wrapper: wrapper
		};
	})(),

	constructor: function () {
		Movable.apply(this, arguments);
		this.allPlayers[this.key] = this;
		
		this.playerId = this.key.split("_")[1];
		
		this.dom.avatar = this.dom.card.childNodes[0];
		this.dom.avatar.object = this;
		
		this.renderAvatar();
		this.renderHasMarker();
	},

	makeState: function () {
		var state = Movable.prototype.makeState.call(this);
		state.firstVisit = this.firstVisit ? "1" : "";
		state.hasMarker = this.hasMarker ? "1" : "";
		return state;
	},
	
	update: function (changes, state) {
		this.firstVisit = !!state.firstVisit;
		if (changes.hasMarker) {
			this.hasMarker = !!state.hasMarker;
			this.renderHasMarker();
		}
		Movable.prototype.update.apply(this, arguments);
	},
	
	renderHasMarker: function () {
		this.dom.wrapper.style.display = this.hasMarker ? "block" : "none";
	},

	renderAvatar: function () {
		var participant = wave.getParticipantById(this.playerId);
		this.dom.wrapper.setAttribute("title", participant.getDisplayName() +
			"'s player marker");
		this.dom.avatar.src = participant ? participant.getThumbnailUrl() :
			"https://wave.google.com/wave/static/images/unknown.jpg";
	}
});

// Add or remove the viewer's player marker
function togglePlayerMarker() {
	if (meState.hasMarker) {
		// Remove marker
		meState.hasMarker = false;
	} else {
		// Add marker
		meState.hasMarker = true;
		meState.z = highestZ;
	}
	meState.sendUpdate();
}

/* ---------------------------- Dialog boxes ---------------------------- */

var DialogBox = Classy({constructor: function () {
	var visibleDialog = null;
	
	// open a dialog
	var open = function (dialog, title) {
		// make sure dialog is not already open
		if (dialog == visibleDialog) {
			return;
		}
		
		// set title
		$("dialogTitle").innerHTML = title;
		
		// hide previous dialog
		close();
		
		// show new dialog
		visibleDialog = dialog;
		addClass(dialog, "visible");
		
		addClass(cardsWindow, "showDialog");
	};
	
	// close the open dialog
	var close = function () {
		if (!visibleDialog) {
			return false;
		}
		
		removeClass(visibleDialog, "visible");
		visibleDialog = null;

		removeClass(cardsWindow, "showDialog");
		
		if (meState.firstVisit) {
			meState.firstVisit = false;
			meState.sendUpdate();
		}
	};
	
	// initialize close 
	$("closeDialogBtn").onclick = close;
		
	// Initialize decks dialog
	$("deckColor").onchange = function () {
		$("deckIcon").className = "deckIcon " +
			Deck.prototype.colors[this.value];
	}
	
	$("addDeckBtn").onclick = function () {
		var color = $("deckColor").value;
		var jokers = $("deckJokers").value;
		var shuffled = $("deckShuffled").value;
		
		addDeck(color, jokers, shuffled);
	}
	
	// Instance methods:
		
	// open the help dialog
	this.openHelp = function () {
		open($("help"), "Instructions");
	};
		
	// open the decks dialog
	this.openDecks = function () {
		open($("decks"), "Decks");
	};
	
}});

})();