// The pages' whole-signed release as it goes at a mint that is not Nutshell (17 Nov, found with real sats at Minibits): the witness
// NUT-11 writes (the signatures on the first input, none on the others), and the spend's text kept in Streetcat's ledger, from which
// the status page shows who signed. It is wholemix_test.mjs run that way against the local mints (Nutshell takes that witness too):
// every one of its checks has to hold as it does with the app's own witnesses.
process.env.WITNESS = 'plain';
await import('./wholemix_test.mjs');
