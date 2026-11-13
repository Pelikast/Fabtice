'use strict';

// Answers of the bridge that the interface recognises by the beginning of
// their sentence (app/src/import/fromLink.ts, failureFrom). Changing the first
// words here silently turns a precise message into a generic one in the
// interface: test/unit/messages.test.js pins them against that file.

const BUSY = 'Une importation est déjà en cours.';
const LINK_NOT_RECOGNISED = 'Lien non reconnu. Collez un lien YouTube (watch?v=, youtu.be/, /shorts/, /embed/ ou /live/).';

module.exports = { BUSY, LINK_NOT_RECOGNISED };
