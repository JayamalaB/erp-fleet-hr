// Fleet is a pure event PRODUCER (trip.completed - docs 2.5/6). It has no
// subscribers of its own: nothing in HR or Accounting ever needs to push
// data back into Fleet for Fleet's own logic to work. Imported for
// consistency with the other modules' eventHandlers.js side-effect pattern.
