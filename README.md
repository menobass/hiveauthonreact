# HiveAuth React Native Demo (Expo)

A minimal Expo app that demonstrates HiveAuth login and signing from React Native using the official HAS WebSocket protocol and Hive Keychain Mobile.

## ✨ What it does

- WebSocket to HAS (HiveAuth Service) with AES-encrypted payloads
- Deep link generation: `has://auth_req/<base64(JSON)>`
   - JSON contains `{ account, uuid, key, host }`
   - `host` is the full wss URL (e.g., `wss://has.hiveauth.com`)
- Same-device flow: re-attach to pending requests when returning from Keychain
- Server toggle: switch between `hive-auth.arcange.eu` and `has.hiveauth.com`
- Custom JSON signing via `sign_req` (posting key)
- AsyncStorage token persistence

## 🔌 Protocol (aligned with hive-auth-html)

1. Connect to HAS via WebSocket.
2. Send `auth_req` with AES-encrypted `{ app }` using an `auth_key` (uuidv4).
3. On `auth_wait`, build deep link:
    - `has://auth_req/` + base64(JSON.stringify({ account, uuid, key, host }))
4. Open Keychain, approve, then return to the app.
5. Receive `auth_ack`, decrypt to get `{ expire, token? }` and keep `auth_key` for signing.
6. For signing, send `sign_req` with AES-encrypted `{ key_type, ops, broadcast, nonce }`.

Refs: https://github.com/hiveauth/hive-auth-html

## 🛠 Tech stack

- Expo SDK 53, React Native 0.79.x, React 19
- TypeScript
- crypto-js for AES
- react-native-get-random-values polyfill
- @react-native-async-storage/async-storage
- expo-linking

## 📁 Structure

```
├── app/
│   ├── index.tsx              # Menu → HiveAuth demo
│   └── hiveauth-demo.tsx      # UI: login, deep link, custom_json
├── lib/
│   ├── hiveauth-service.ts    # HAS client: auth & sign_req
│   ├── hive-service.ts        # Placeholder
│   └── auth-service.ts        # Placeholder
├── .github/copilot-instructions.md
├── index.js                   # getRandomValues polyfill import
├── app.json                   # Expo config
├── package.json
├── tsconfig.json
└── README.md
```

## 🚀 Run it

Prereqs: Node 18+, npm, Expo Go on your phone.

1) Install deps
```bash
npm install
```

2) Start
```bash
npm start
```

3) Open on device with Expo Go (scan QR).

## 📱 Use the demo

1) Pick server (top of screen): arcange.eu or hiveauth.com
2) Enter your Hive username → tap “Login with HiveAuth”
3) Deep link appears → tap “Open in Keychain”
4) Approve in Keychain → return to this app
5) You should see “Authenticated”
6) Tap “Post custom_json” → approve in Keychain → see success

Buttons you’ll see
- Open in Keychain: launches Hive Keychain Mobile with the deep link
- Share Link: shares the deep link value
- Cancel Pending: clears a stuck/expired request so you can retry

## 🧩 Custom JSON

We send a posting `custom_json` op with id `react_native_demo` and payload:
```json
{ "message": "I posted this with a react native app and hiveauth", "ts": 1735689600000 }
```
The message is wrapped in a standard Hive op array and signed via `sign_req`.

## 🔧 Troubleshooting

- Keychain flashes and returns: ensure deep link host matches the selected server.
- Keychain waits forever: switch server to `hiveauth.com`, then retry.
- “Another authentication in progress”: use “Cancel Pending,” then retry.
- Same-device approval: after approving in Keychain, return to this app; it re-attaches automatically.

## 🔐 Notes

This is a demo. For production:
- Validate inputs and handle edge cases
- Respect HAS timeouts; reconnect/retry thoughtfully
- Consider showing explicit attach/retry UI states

## License

MIT (demo purposes only)
