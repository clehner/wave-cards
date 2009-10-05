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
	cardsContainer,        // #cards
	cardsWindow,           // #cardsWindow
	decksContainer,        // #decks
	rotation = 0,          // angle the card container is rotated.
	
	transitionDuration = 250, // length (ms) of a transition/animation

	peekLockMode = false,  // to allow cards to be peeked at indefinitely
	dragUnderMode = false, // to slide cards over or above other cards
	drag,                  // object being currently dragged
	players = [],          // wave participants
	highestId = 0,         // highest card id
	highestZ = 0,          // highest z-index of a card
	hasFocus,              // whether the window has the user's focus
	
	me,                    // the participant whose client renders the gadget
	things = {},           // objects (cards and decks) encoded in the wave state
	waveState,             // the wave gadget state
	waveStateKeys = [],    // the keys of the gadget state
	waveStateValues = {},  // the values of the gadget state
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

/* ---------------------------- Gadget State ---------------------------- */

function gadgetLoad() {
	// run once
	if (gadgetLoaded) return;

	// Get DOM references
	cardsContainer = document.getElementById("cards");
	cardsWindow = document.getElementById("cardsWindow");
	decksContainer = document.getElementById("decks");
	
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
	
	document.getElementById("helpBtn").addEventListener("click", HelpBox.show, false);
	document.getElementById("rotateBtn").addEventListener("click", rotateTable, false);
	document.getElementById("addDeckBtn").addEventListener("click", addDeck, false);
	
	document.getElementById("closeHelpBtn").addEventListener(
		"click", HelpBox.hide, false);
	
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
	
	if (!participantsLoaded && me) {
		participantsLoaded = true;
		stateUpdated();
		if (stateLoaded) {
			onEverythingLoad();
		}
	}
}

// called after the first state and participants updates have been received.
function onEverythingLoad() {
		
	// If the gadget state is empty and there are no cards, create a deck.
	if (waveStateKeys.length == 0) {
		addDeck();
	}
	
	// If it is the viewer's first visit, show them the help screen.
	var myState = getThing("player_" + me.getId());
	if (myState.firstVisit) {
		HelpBox.show();
		myState.firstVisit = false;
		myState.sendUpdate();
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

function onMouseDown(e) {
	// start mouse drag
	addEventListener("mousemove", onDrag, false);
	addEventListener("mouseup", onMouseUp, false);
	
	if (e.target && e.target.object && e.target.object instanceof Card) {
		// mousedown on a card
		drag = CardSelection;
		var card = e.target.object;
		
		if (!card.selected && !e.shiftKey) {
			CardSelection.clear();
		}
		CardSelection.add(card);

		if (hasFocus) {
			// prevent dragging the images in firefox
			if (e.preventDefault) e.preventDefault();
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

function onMouseUp() {
	// release the drag
	drag.dragEnd();
	drag = null;
	removeEventListener("mouseup", onMouseUp, false);
	removeEventListener("mousemove", onDrag, false);
}

function onDrag(e) {
	var rot = rotatePoint(e.clientX, e.clientY, rotation,
		cardsContainer.offsetWidth, cardsContainer.offsetHeight);
	drag.drag(rot.x, rot.y);
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
		// G - Group
		case 72:
			// TODO
			break;
		// F - Flip
		case 70:
			CardSelection.flip();
		break;
		// P - peek start
		case 80:
			CardSelection.peekStart();
		break;
		// L - peek lock on
		case 76:
			peekLockMode = true;
			CardSelection.peekLock();
	}
}

function onKeyUp(e) {
	var key = e.keyCode;
	keydowns[key] = false;
	
	switch(key) {
		// U - slide cards above other cards
		case 85:
			dragUnderMode = false;
			CardSelection.detectOverlaps();
		break;
		// P - peek stop
		case 80:
			CardSelection.peekStop();
		break;
		// L - peek lock off
		case 76:
			peekLockMode = false;
	}
}

function onFocus() {
	hasFocus = true;
}

// stop dragging cards when the window loses focus
function onBlur() {
	hasFocus = false;
	if (drag) {
		onMouseUp();
	}
}

// create a deck of cards
function addDeck() {
	var newDeck, cards, card, i, s, r;
	
	newDeck = getThing("deck_"+(++highestId));
	cards = newDeck.cards;
	i = 0;
	
	for (s = 0; s < 4; s++) {
		for (r = 0; r < 13; r++) {
			with(cards[i++] = getThing("card_"+(++highestId))) {
				suit = s;
				rank = r;
				stateX = stateY = 30 + ~~(i/3);
				z = ++highestZ;
				deck = newDeck;
				queueUpdate();
			}
		}
	}
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

// Return whether or not an element has a class.
function hasClass(ele, cls) {
	if (!ele) throw new Error("not an element, can't add class name.");
	if (ele.className) {
		return new RegExp("(\\s|^)" + cls + "(\\s|$)").test(ele.className);
	}
}

// Add a class to an element.
function addClass(ele, cls) {
	if (!hasClass(ele, cls)) ele.className += " " + cls;
}

// Remove a class from an element.
function removeClass(ele, cls) {
	if (hasClass(ele, cls)) {
		var reg = new RegExp("(\\s|^)" + cls + "(\\s|$)");
		ele.className = ele.className.replace(reg, " ");
	}
}

// Add or remove a class from an element
function toggleClass(ele, cls, yes) {
	if (yes) addClass(ele, cls);
	else removeClass(ele, cls);
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
	
	// send the update soon
	asyncUpdate: function (local) {
		this.queueUpdate(local);
		if (!Stateful.updateTimeout) {
			Stateful.updateTimeout = setTimeout(function () {
				Stateful.prototype.flushUpdates();
				delete Stateful.updateTimeout;
			}, 10);
		}
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
	stateNames: ["color", "cards"],
	
	colors: ["blue", "red", "green"],
	color: "",
	colorId: 0,
	decksByColor: [],
	cards: [],
	icon: null,

	constructor: function () {
		Stateful.apply(this, arguments);
		this.cards = [];
		
		highestId = Math.max(highestId, this.id);
		
		this.icon = document.createElement("li");
		
		// use first unused color id
		for (var i = 0; this.decksByColor[i]; i++) {}
		this.colorId = i;
		this.renderColor();
		
		var $this = this;
		this.icon.onclick = function () {
			if (confirm("Delete this deck?")) {
				$this.markForRemoval();
				$this.sendUpdate();
			}
		};
		
		decksContainer.appendChild(this.icon);
	},

	makeState: function () {
		return {
			color: this.colorId,
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
		//this.remove();
		Stateful.prototype.markForRemoval.call(this);
	},
	
	remove: function () {
		if (this.removed) return;
		Stateful.prototype.remove.call(this);
		
		delete this.cards;
		delete this.decksByColor[this.colorId];
		
		decksContainer.removeChild(this.icon);
	},
	
	update: function (changes, newState) {
		if (changes.cards) {
			var cardIds = newState.cards.split(";");
			var len = cardIds.length;
			this.cards = new Array(len);
			for (var i = len; i--;) {
				this.cards[i] = getThing("card_" + cardIds[i]);
			}
		}
		
		if (changes.color) {
			delete this.decksByColor[this.colorId];
			this.colorId = ~~newState.color;
			this.renderColor();
		}
	},
	
	renderColor: function () {
		this.decksByColor[this.colorId] = this;
		this.color = this.colors[this.colorId % 3];
		this.icon.className = this.color;
		this.icon.title = "Delete the " + this.color + " deck";
	},
});



/* ---------------------------- Card ---------------------------- */

Card = Classy(Stateful, {
	suits: ["diamonds", "spades", "hearts", "clubs"],
	ranks: ["ace", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "jack", "queen", "king"],//, "joker"],

	dom: (function () {
		var wrapper, label, card, front, back;
		
		// Create "prototype" DOM elements
		(wrapper = document.createElement("div")) .className = "cardWrapper";
		(card    = document.createElement("div")) .className = "card";
		(label   = document.createElement("span")).className = "label";
		(front   = document.createElement("div")) .className = "front";
		(back    = document.createElement("div")) .className = "back";
		
		wrapper.appendChild(card);
		wrapper.appendChild(label);
		card.appendChild(front);
		card.appendChild(back);
		
		return {
			wrapper: wrapper
		};
	})(),
	
	all: [], // all cards, by id. shared
	
	x: NaN,
	y: NaN,
	z: 0,
	oldX: NaN,
	oldY: NaN,
	oldZ: NaN,
	stateX: 0,
	stateY: 0,

	suit: 0,
	rank: 0,
	width: 73,
	height: 97,
	title: "",

	user: null, // wave user last to touch it
	userClass: "", // css class representing the user
	deck: null, // the deck this card is apart of 
	deckClass: "", // css class for the deck color
	moving: false, // a wave user is holding or dragging the card
	movingNow: false, // animating a move. not necessarily being held
	selected: false, // is in the selection
	dragging: false, // is being dragged by the mouse
	faceup: false, // which side is up
	flipping: false, // animating a flip
	peeking: false, // we are peeking at the card
	peeked: false, // someone else is peeking at the card
	peekLock: false, // we are staying peeking at the card
	
	overlaps: {}, // other movables that are overlapping this one.
	
	stateNames: ["deck", "suit", "rank", "flip", "peeked", "moving",
		"x", "y", "z", "user"],
	
	makeState: function () {
		with(this) {
			return {
				deck: deck ? deck.id : "",
				suit: suit,
				rank: rank,
				x: ~~stateX,
				y: ~~stateY,
				z: ~~z,
				flip: faceup ? "f" : "",
				moving: moving ? "m" : "",
				peeked: peeking ? "p" : "",
				user: me ? me.getId() : null
			};
		}
	},
	
	constructor: function () {
		Stateful.apply(this, arguments);
		
		highestId = Math.max(highestId, this.id);
		
		this.all[this.id] = this;
		this.overlaps = [];
		
		// Clone the dom elements for this instance
		var wrapper, card;
		this.dom = {
			wrapper: (wrapper = this.dom.wrapper.cloneNode(1)),
			card: (card = wrapper.childNodes[0]),
			label: wrapper.childNodes[1],
			front: card.childNodes[0],
			back: card.childNodes[1]
		};
		
		// Give the dom elements references to this card object
		for (var node in this.dom) {
			this.dom[node].object = this;
		}
	},
	
	remove: function () {
		if (this.removed) return; // beat not the bones of the buried
		Stateful.prototype.remove.call(this);
		
		delete this.all[this.id];
		
		// stop dragging
		//if (captured == this) captured = null;

		// remove from z-index cache
		ZIndexCache.remove(this);

		
		// deselect
		if (this.selected) {
			CardSelection.remove(this);
		}
		//if (this.selected) delete selection[selection.indexOf(this.selected)];
		
		// stop any running transitions
		Transition.stopAll(this.dom.card);

		cardsContainer.removeChild(this.dom.wrapper);
		
		// Remove DOM<->JS connections.
		for (var node in this.dom) {
			delete this.dom[node].object;
		}
		delete this.dom;
		//deleteAll(this, ["wrapper", "card", "label", "front", "back"], ["object"]);

	},
	
	update: function (changes, newState) {
	
		if (!this.loaded) {
			// then this is the first state update.
			// Insert the card into the page.
			cardsContainer.appendChild(this.dom.wrapper);
		}
	
		if (changes.suit || changes.rank) {
			if (changes.suit) this.suit = newState.suit;
			if (changes.rank) this.rank = newState.rank;
			this.renderFace();
		}
		
		if (changes.deck) {
			this.deck = getThing("deck_" + newState.deck);
			this.renderDeck();
			
			// if the deck is not yet loaded, wait until it is.
			if (!this.deck.loaded) {
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
			// someone is holding or dragging the card
			this.moving = (newState.moving=="m");
			this.renderHighlight();
		}
		
		if (changes.user) {
			// the user who last touched the card
			this.user = wave.getParticipantById(newState.user);
			this.renderUserLabel();
		}
		
		if (changes.flip) {
			// Flip the card
			this.faceup = !!newState.flip;
			this.renderFlip();
			
		} else if (changes.peeked) {
			// a user is peeking at the card.
			this.peeked = newState.peeked;
			if (this.peeking && this.user != me) {
				// we were peeking at the card but now someone else has taken it,
				// so now we have to stop peeking at it.
				this.peeking = false;
			}
			this.renderPeek();
			this.renderHighlight();
		}
	},
	
	flip: function (queue) {
		this.faceup = !this.faceup;
		this.asyncUpdate();
	},
	
	peekStart: function () {
		with(this) {
			if (!peeking) {
				peeking = true;
				if (peekLockMode) {
					this.peekLock = true;
				}
				renderPeek();
				asyncUpdate();
			}
		}
	},
	
	peekStop: function () {
		// delay so that other clients have time to notice the peek
		var $this = this;
		setTimeout(function () {
			// if this card's peek lock is on, then we stay peeking at it.
			if (!$this.peekLock) {
				$this.peeking = false;
				$this.peeked = false;
				$this.renderPeek();
				$this.renderHighlight();
				$this.asyncUpdate();
			}
		}, transitionDuration);
	},
	
	// return whether an object is overlapping another.
	isOverlapping: function (thing) {
		if (this === thing) return false; // can't overlap itself

		var xDelta = thing.x - this.x;
		var yDelta = thing.y - this.y;

		return ((xDelta < this.width) && (-xDelta < thing.width) &&
			(yDelta < this.height) && (-yDelta < thing.height));
	},
		
	// return id map of all cards overlapping this one.
	getOverlappingObjects: function () {
		var overlappingObjects = {};
		var all = Card.prototype.all;
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
		
		this.asyncUpdate();
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
		
		// when the user lets go of a card, they stop peeking at it
		// unless in peek lock mode
		if (this.peeking && !this.peekLock) {
			this.peekStop();
		}

		this.asyncUpdate();
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
		
	/* ---------------------------- Card View functions ---------------------------- */
	
	// Set the card's classes and title to its suit and rank.
	renderFace: function () {
		// to do: change this so that it doesn't overwrite other classNames.
		var rank = this.ranks[this.rank];
		var suit = this.suits[this.suit];
		addClass(this.dom.front, rank);
		addClass(this.dom.front, suit);
		this.title = rank + " of " + suit;
		this.dom.front.setAttribute("title", this.title);
	},
	
	renderUserLabel: function () {
		var playerNum = players.indexOf(this.user)+1;
		
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
			var userLabel = (this.user == me) ? "" :
				this.user.getDisplayName().match(/^[^ ]+/, '')[0];
			this.dom.label.innerHTML = userLabel;
		}
	},

	// If the user wants to peek at the card, show a corner of the back through the front.
	renderPeek: function () {
		toggleClass(this.dom.wrapper, "peeked", this.peeked || this.peeking);
		toggleClass(this.dom.wrapper, "peeking", this.peeking);
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
				transitionDuration*(this.user == me ? .5 : 3),
				function (n) {
					// Hide the label when the animation is done so it doesn't get in the way of other things
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
				this.dom[faceup ? "back" : "front"].style[cssTransform] = "rotateY(180deg)"
				
				// rotate to 0 from 180 or -180
				a = faceup ? -1 : 1;
				rotater = function (n) {
					return "rotateY(" + 180*(a + -a*n) + "deg)";
				};
				
				halfWay = 3; // 3 not 2 because of the easing function i think
			} else {
				// 
				this.dom[faceup ? "back" : "front"].style[cssTransform] = "matrix(-1, 0, 0, 1, 0, 0)";
				
				// flip from -1 to 1, reverse to front
				rotater = function (n) {
					return "matrix(" + (-1 + 2*n) + ", 0, 0, 1, 0, 0)";
				};
				
				halfWay = 2;
			}
			this.dom.card.style[cssTransform] = rotater(0);
			
			t = {};
			t[cssTransform] = rotater;
			Transition(this.dom.card, t, transitionDuration, function () {
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
			
		} else {
			// no transforms; use opacity.
			this.dom.back.style.opacity = ~~faceup;
			this.removeFlipClass();
			Transition(this.dom.back, {opacity: ~~!this.faceup}, transitionDuration, function () {
				$this.flipClasses();
				$this.flipping = false;
				$this.renderHighlight();
			});
		}
	},
	
	renderDeck: function () {
		if (this.deckClass) {
			removeClass(this.dom.card, this.deckClass);
		}
		this.deckClass = this.deck.color;
		addClass(this.dom.card, this.deckClass);
	}
});

// source: http://stackoverflow.com/questions/962802#962890
function shuffle(array) {
	var tmp, current, top = array.length;

	if(top) while(--top) {
		current = Math.floor(Math.random() * (top + 1));
		tmp = array[current];
		array[current] = array[top];
		array[top] = tmp;
	}

	return array;
}

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
		this.refreshBounds();
		this.detectOverlaps();
		
		this.startX = x - this.x;
		this.startY = y - this.y;
	},
	
	drag: function (x, y) {
		var cards, overlapper, i, oldOverlappees, overlappers, overlappee, oldOverlappee;
		
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
	
	peekStart: function () {
		this.cards.forEach(function (card) {
			card.peekStart();
		});
	},
	
	peekStop: function () {
		this.cards.forEach(function (card) {
			card.peekStop();
		});
	},

	peekLock: function () {
		this.cards.forEach(function (card) {
			card.peekLock ^= 1;
		});
	},

	// flip the positions of the cards, not just the faces.
	flip: function () {
		this.refreshBounds();
		
		var xx = 2 * this.x + this.width,
		zz = this.z + this.z1;
		
		this.cards.forEach(function (card) {
			card.stateX = xx - (card.x + card.width);
			card.z = zz - card.z;
			//card.flip();
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
	}
};

var ZIndexCache = {
	buckets: [],      // array of "buckets" of each card with a particular z value
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
		card.selected = false;
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

Player = Classy(Stateful, {
	stateNames: ["firstVisit"],
	all: {},
	
	participantObject: null,
	firstVisit: true,

	constructor: function () {
		Stateful.apply(this, arguments);
		this.all[this.id] = this;
		this.participantObject = wave.getParticipantById(this.id);
	},

	makeState: function () {
		return {
			firstVisit: this.firstVisit ? "1" : "0"
		};
	},
	
	update: function (changes, newState) {
		this.firstVisit = (newState.firstVisit == "1");
	}
});

/* ---------------------------- Help box ---------------------------- */

var HelpBox = {
	show: function () {
		addClass(cardsWindow, "showHelp");
	},

	hide: function () {
		removeClass(cardsWindow, "showHelp");
	}
};

})();