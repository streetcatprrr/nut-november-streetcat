// Source of app/nostr-bundle.js: nostr-tools 2.25.2 from npm, bundled with
//   esbuild app/nostr-entry.mjs --bundle --format=iife --global-name=nostrkit --minify --target=es2020 --legal-comments=none --outfile=app/nostr-bundle.js
// and the licence line put back on top (nostr-tools: Unlicense; @noble/* and @scure/base: MIT, Paul Miller).
// what the app uses from nostr-tools: keys and events (pure JS), NIP-44 v2 encryption and NIP-59 gift wraps
export { generateSecretKey, getPublicKey, finalizeEvent, verifyEvent } from 'nostr-tools/pure';
export * as nip44 from 'nostr-tools/nip44';
export { wrapEvent, unwrapEvent } from 'nostr-tools/nip59';
